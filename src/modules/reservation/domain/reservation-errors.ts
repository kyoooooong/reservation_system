import { AppError } from "../../../common/errors/app-error";
import { LockedSeat } from "../ports/screening-seat-repository.port";

export const idempotencyKeyRequired = (): AppError =>
  new AppError({
    status: 400,
    code: "IDEMPOTENCY_KEY_REQUIRED",
    title: "Idempotency key required",
    detail: "Idempotency-Key header is required for reservation creation.",
  });

export const idempotencyKeyReused = (): AppError =>
  new AppError({
    status: 422,
    code: "IDEMPOTENCY_KEY_REUSED",
    title: "Idempotency key reused",
    detail:
      "The same Idempotency-Key was already used with a different request payload.",
  });

export const screeningNotFound = (): AppError =>
  new AppError({
    status: 404,
    code: "SCREENING_NOT_FOUND",
    title: "Screening not found",
    detail: "The requested screening does not exist.",
  });

export const screeningAlreadyStarted = (): AppError =>
  new AppError({
    status: 409,
    code: "SCREENING_ALREADY_STARTED",
    title: "Screening already started",
    detail: "Reservations cannot be created after the screening starts.",
  });

export const seatNotInScreening = (): AppError =>
  new AppError({
    status: 422,
    code: "SEAT_NOT_IN_SCREENING",
    title: "Seat not in screening",
    detail: "One or more requested seats do not belong to this screening.",
  });

export const seatAlreadyReserved = (seats: LockedSeat[]): AppError =>
  new AppError({
    status: 409,
    code: "SEAT_ALREADY_RESERVED",
    title: "Seat already reserved",
    detail: "One or more requested seats are already reserved.",
    extra: {
      conflictedSeats: seats.map((seat) => ({
        seatId: seat.seatId,
        label: seat.label,
      })),
    },
  });

export const reservationTemporarilyUnavailable = (): AppError =>
  new AppError({
    status: 503,
    code: "RESERVATION_TEMPORARILY_UNAVAILABLE",
    title: "Reservation temporarily unavailable",
    detail:
      "A reservation lock or database connection was not available within the configured bound. Retry with the same Idempotency-Key.",
    extra: {
      retryable: true,
    },
    retryAfterSeconds: 1,
  });

export const reservationAdmissionLimited = (): AppError =>
  new AppError({
    status: 429,
    code: "RESERVATION_ADMISSION_LIMITED",
    title: "Reservation demand is temporarily limited",
    detail:
      "This API instance is protecting its reservation capacity. Retry with the same Idempotency-Key after the Retry-After interval.",
    extra: {
      retryable: true,
    },
    retryAfterSeconds: 1,
  });

export const databaseConnectionLost = (): AppError =>
  new AppError({
    status: 503,
    code: "DATABASE_CONNECTION_LOST",
    title: "Database connection lost",
    detail:
      "The database connection was lost before the server could complete the request.",
    extra: {
      retryable: true,
    },
    retryAfterSeconds: 1,
  });

export const invariantViolation = (
  detail = "Reservation invariant violated",
): AppError =>
  new AppError({
    status: 500,
    code: "INTERNAL_ERROR",
    title: "Internal error",
    detail,
  });

export const reservationNotFound = (): AppError =>
  new AppError({
    status: 404,
    code: "RESERVATION_NOT_FOUND",
    title: "Reservation not found",
    detail: "The requested reservation does not exist.",
  });
