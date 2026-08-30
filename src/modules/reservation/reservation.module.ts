import { Module } from "@nestjs/common";
import { PgTransactionManager } from "../../infrastructure/db/transaction";
import { GetReservationsUseCase } from "./application/get-reservations.use-case";
import { ReserveSeatsUseCase } from "./application/reserve-seats.use-case";
import { PgIdempotencyRepository } from "./infrastructure/pg-idempotency.repository";
import { PgLockTimeout } from "./infrastructure/pg-lock-timeout";
import { PgReservationRepository } from "./infrastructure/pg-reservation.repository";
import { PgScreeningRepository } from "./infrastructure/pg-screening.repository";
import { PgScreeningSeatRepository } from "./infrastructure/pg-screening-seat.repository";
import { ReservationsController } from "./presentation/reservations.controller";
import { IDEMPOTENCY_REPOSITORY } from "./ports/idempotency-repository.port";
import { LOCK_TIMEOUT } from "./ports/lock-timeout.port";
import { RESERVATION_REPOSITORY } from "./ports/reservation-repository.port";
import { SCREENING_REPOSITORY } from "./ports/screening-repository.port";
import { SCREENING_SEAT_REPOSITORY } from "./ports/screening-seat-repository.port";
import { TRANSACTION_MANAGER } from "./ports/transaction-manager.port";

@Module({
  controllers: [ReservationsController],
  providers: [
    ReserveSeatsUseCase,
    GetReservationsUseCase,
    { provide: TRANSACTION_MANAGER, useClass: PgTransactionManager },
    { provide: LOCK_TIMEOUT, useClass: PgLockTimeout },
    { provide: IDEMPOTENCY_REPOSITORY, useClass: PgIdempotencyRepository },
    { provide: SCREENING_REPOSITORY, useClass: PgScreeningRepository },
    { provide: SCREENING_SEAT_REPOSITORY, useClass: PgScreeningSeatRepository },
    { provide: RESERVATION_REPOSITORY, useClass: PgReservationRepository },
  ],
})
export class ReservationModule {}
