import { Inject, Injectable } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../../../common/config/app-config";
import { APP_LOGGER, AppLogger } from "../../../common/logging/app-logger";
import {
  idempotencyKeyReused,
  reservationAdmissionLimited,
} from "../domain/reservation-errors";
import { ReservationSummary } from "../ports/reservation-repository.port";

type Release = () => void;

type InFlightRequest = {
  requestHash: string;
  execution: Promise<ReservationSummary>;
};

type Waiter = {
  resolve: (release: Release) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
};

@Injectable()
export class ReservationTrafficGuard {
  private readonly inFlightByIdempotencyKey = new Map<
    string,
    InFlightRequest
  >();
  private readonly waiters: Waiter[] = [];
  private inFlight = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  run(
    input: {
      userId: number;
      idempotencyKey: string;
      requestHash: string;
      screeningId: number;
    },
    operation: () => Promise<ReservationSummary>,
  ): Promise<ReservationSummary> {
    const scope = `${input.userId}:${input.idempotencyKey}`;
    const existing = this.inFlightByIdempotencyKey.get(scope);
    if (existing) {
      if (existing.requestHash !== input.requestHash) {
        return Promise.reject(idempotencyKeyReused());
      }
      this.logger.info(
        {
          event: "reservation.request.coalesced",
          userId: input.userId,
          screeningId: input.screeningId,
          inFlight: this.inFlight,
          queued: this.waiters.length,
        },
        "joined an in-flight idempotent reservation request",
      );
      return existing.execution;
    }

    const execution = this.runAdmitted(input, operation);
    this.inFlightByIdempotencyKey.set(scope, {
      requestHash: input.requestHash,
      execution,
    });
    execution.then(
      () => this.deleteIfCurrent(scope, execution),
      () => this.deleteIfCurrent(scope, execution),
    );
    return execution;
  }

  private async runAdmitted(
    input: { userId: number; screeningId: number },
    operation: () => Promise<ReservationSummary>,
  ): Promise<ReservationSummary> {
    const release = await this.acquire(input);
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private acquire(input: {
    userId: number;
    screeningId: number;
  }): Promise<Release> {
    if (this.inFlight < this.config.reservation.admissionMaxInFlight) {
      this.inFlight += 1;
      return Promise.resolve(this.releaseOnce());
    }

    if (this.waiters.length >= this.config.reservation.admissionMaxQueue) {
      return Promise.reject(this.admissionLimited(input, "queue_full"));
    }

    return new Promise<Release>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) {
            this.waiters.splice(index, 1);
            reject(this.admissionLimited(input, "queue_timeout"));
          }
        }, this.config.reservation.admissionQueueTimeoutMs),
      };
      waiter.timer.unref();
      this.waiters.push(waiter);
    });
  }

  private releaseOnce(): Release {
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      const next = this.waiters.shift();
      if (!next) {
        this.inFlight -= 1;
        return;
      }
      clearTimeout(next.timer);
      next.resolve(this.releaseOnce());
    };
  }

  private deleteIfCurrent(
    scope: string,
    execution: Promise<ReservationSummary>,
  ): void {
    if (this.inFlightByIdempotencyKey.get(scope)?.execution === execution) {
      this.inFlightByIdempotencyKey.delete(scope);
    }
  }

  private admissionLimited(
    input: { userId: number; screeningId: number },
    reason: "queue_full" | "queue_timeout",
  ): Error {
    this.logger.warn(
      {
        event: "reservation.admission.rejected",
        userId: input.userId,
        screeningId: input.screeningId,
        inFlight: this.inFlight,
        queued: this.waiters.length,
        reason,
      },
      "reservation admission capacity exceeded",
    );
    return reservationAdmissionLimited();
  }
}
