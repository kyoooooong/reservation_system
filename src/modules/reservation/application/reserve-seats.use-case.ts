import { Inject, Injectable } from "@nestjs/common";
import { performance } from "node:perf_hooks";
import { APP_CONFIG, AppConfig } from "../../../common/config/app-config";
import { AppError } from "../../../common/errors/app-error";
import { APP_LOGGER, AppLogger } from "../../../common/logging/app-logger";
import { ReserveCommand } from "../domain/reserve-command";
import { ReservationTrafficGuard } from "./reservation-traffic-guard";
import {
  databaseConnectionLost,
  idempotencyKeyReused,
  invariantViolation,
  reservationTemporarilyUnavailable,
  screeningAlreadyStarted,
  screeningNotFound,
  seatAlreadyReserved,
  seatNotInScreening,
} from "../domain/reservation-errors";
import {
  IDEMPOTENCY_REPOSITORY,
  IdempotencyRepositoryPort,
} from "../ports/idempotency-repository.port";
import { LOCK_TIMEOUT, LockTimeoutPort } from "../ports/lock-timeout.port";
import {
  RESERVATION_REPOSITORY,
  ReservationRepositoryPort,
  ReservationSummary,
} from "../ports/reservation-repository.port";
import {
  SCREENING_REPOSITORY,
  ScreeningRepositoryPort,
} from "../ports/screening-repository.port";
import {
  SCREENING_SEAT_REPOSITORY,
  ScreeningSeatRepositoryPort,
} from "../ports/screening-seat-repository.port";
import {
  TRANSACTION_MANAGER,
  TransactionManagerPort,
  TxContext,
} from "../ports/transaction-manager.port";

@Injectable()
export class ReserveSeatsUseCase {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TRANSACTION_MANAGER)
    private readonly transactions: TransactionManagerPort,
    @Inject(LOCK_TIMEOUT) private readonly lockTimeout: LockTimeoutPort,
    @Inject(IDEMPOTENCY_REPOSITORY)
    private readonly idempotency: IdempotencyRepositoryPort,
    @Inject(SCREENING_REPOSITORY)
    private readonly screenings: ScreeningRepositoryPort,
    @Inject(SCREENING_SEAT_REPOSITORY)
    private readonly seats: ScreeningSeatRepositoryPort,
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepositoryPort,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
    private readonly trafficGuard: ReservationTrafficGuard,
  ) {}

  async execute(input: {
    userId: number;
    screeningId: number;
    seatIds: number[];
    idempotencyKey: string;
  }): Promise<ReservationSummary> {
    const command = ReserveCommand.create(
      input.screeningId,
      input.seatIds,
      this.config.reservation.maxSeats,
    );
    const requestHash = command.fingerprint();
    const startedAt = performance.now();

    return this.trafficGuard.run(
      {
        userId: input.userId,
        screeningId: command.screeningId,
        idempotencyKey: input.idempotencyKey,
        requestHash,
      },
      () => this.executeAdmitted(input, command, requestHash, startedAt),
    );
  }

  private async executeAdmitted(
    input: {
      userId: number;
      screeningId: number;
      seatIds: number[];
      idempotencyKey: string;
    },
    command: ReserveCommand,
    requestHash: string,
    startedAt: number,
  ): Promise<ReservationSummary> {
    const execution = await this.withRetry(
      {
        userId: input.userId,
        screeningId: command.screeningId,
        seatCount: command.seatIds.length,
      },
      async () =>
        this.transactions.readCommitted(async (tx) => {
          const claim = await this.withLockTimeout(
            tx,
            this.config.pg.idempotencyLockTimeoutMs,
            () =>
              this.idempotency.tryClaim({
                tx,
                userId: input.userId,
                key: input.idempotencyKey,
                requestHash,
              }),
          );

          if (claim.kind === "EXISTING") {
            if (claim.requestHash !== requestHash) {
              throw idempotencyKeyReused();
            }
            if (!claim.reservationId) {
              throw invariantViolation(
                "Committed idempotency key is missing reservation_id",
              );
            }
            const replay = await this.reservations.findSummaryByInternalId(
              tx,
              input.userId,
              claim.reservationId,
            );
            if (!replay) {
              throw invariantViolation(
                "Idempotency key points to a missing reservation",
              );
            }
            return { kind: "REPLAYED" as const, reservation: replay };
          }

          const screening = await this.screenings.findForReservation(
            tx,
            command.screeningId,
          );
          if (!screening) {
            throw screeningNotFound();
          }
          if (screening.alreadyStarted) {
            throw screeningAlreadyStarted();
          }

          const lockedSeats = await this.withLockTimeout(
            tx,
            this.config.pg.seatLockTimeoutMs,
            () =>
              this.seats.lockForReservation(
                tx,
                command.screeningId,
                command.seatIds,
              ),
          );

          if (lockedSeats.length !== command.seatIds.length) {
            throw seatNotInScreening();
          }

          const reservedSeats = lockedSeats.filter((seat) => seat.isReserved);
          if (reservedSeats.length > 0) {
            throw seatAlreadyReserved(reservedSeats);
          }

          const inserted = await this.reservations.insert({
            tx,
            userId: input.userId,
            screeningId: command.screeningId,
            totalPrice: screening.basePrice * command.seatIds.length,
          });
          const affected = await this.seats.assignIfAvailable(
            tx,
            command.screeningId,
            command.seatIds,
            inserted.id,
          );
          if (affected !== command.seatIds.length) {
            throw invariantViolation(
              "Seat assignment affected an unexpected number of rows",
            );
          }

          const linked = await this.idempotency.link({
            tx,
            userId: input.userId,
            key: input.idempotencyKey,
            reservationId: inserted.id,
          });
          if (linked !== 1) {
            throw invariantViolation(
              "Idempotency key link affected an unexpected number of rows",
            );
          }

          const created = await this.reservations.findSummaryByInternalId(
            tx,
            input.userId,
            inserted.id,
          );
          if (!created) {
            throw invariantViolation(
              "Created reservation could not be reloaded",
            );
          }
          return { kind: "CREATED" as const, reservation: created };
        }),
    );

    this.logger.info(
      {
        event:
          execution.kind === "CREATED"
            ? "reservation.created"
            : "reservation.replayed",
        userId: input.userId,
        screeningId: command.screeningId,
        seatCount: command.seatIds.length,
        reservationId: execution.reservation.reservationId,
        durationMs: Number((performance.now() - startedAt).toFixed(3)),
      },
      execution.kind === "CREATED"
        ? "reservation created"
        : "reservation replayed",
    );
    return execution.reservation;
  }

  private async withLockTimeout<T>(
    tx: TxContext,
    timeoutMs: number,
    op: () => Promise<T>,
  ): Promise<T> {
    await this.lockTimeout.setLocal(tx, timeoutMs);
    const result = await op();
    await this.lockTimeout.setLocal(tx, this.config.pg.lockTimeoutBaselineMs);
    return result;
  }

  private async withRetry<T>(
    context: { userId: number; screeningId: number; seatCount: number },
    op: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (
      let attempt = 0;
      attempt <= this.config.reservation.txRetryAttempts;
      attempt += 1
    ) {
      try {
        return await op();
      } catch (error) {
        if (
          !isRetryableTransactionError(error) ||
          attempt === this.config.reservation.txRetryAttempts
        ) {
          throw mapPgError(error);
        }
        lastError = error;
        const retryDelayMs = this.nextRetryDelayMs(attempt);
        this.logger.warn(
          {
            event: "reservation.transaction.retry",
            ...context,
            retryNumber: attempt + 1,
            pgCode: pgCode(error),
            retryDelayMs,
          },
          "retrying reservation transaction",
        );
        await delay(retryDelayMs);
      }
    }
    throw mapPgError(lastError);
  }

  private nextRetryDelayMs(attempt: number): number {
    const cap = Math.min(
      this.config.reservation.txRetryBaseDelayMs * 2 ** attempt,
      this.config.reservation.txRetryMaxDelayMs,
    );
    return Math.floor(Math.random() * (cap + 1));
  }
}

const isRetryableTransactionError = (error: unknown): boolean => {
  const code = pgCode(error);
  return code === "40P01" || code === "40001";
};

const mapPgError = (error: unknown): unknown => {
  if (error instanceof AppError) {
    return error;
  }

  const code = pgCode(error);
  if (
    code === "53300" ||
    code === "55P03" ||
    code === "57014" ||
    isPoolAcquireTimeout(error)
  ) {
    return reservationTemporarilyUnavailable();
  }
  if (code?.startsWith("08") || code === "25P03" || code === "25P04") {
    return databaseConnectionLost();
  }
  return error;
};

const pgCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;

const isPoolAcquireTimeout = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === "timeout exceeded when trying to connect";

const delay = (milliseconds: number): Promise<void> =>
  milliseconds === 0
    ? Promise.resolve()
    : new Promise((resolve) => setTimeout(resolve, milliseconds));
