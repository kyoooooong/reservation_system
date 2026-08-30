import { TxContext } from "./transaction-manager.port";

export type LockedSeat = {
  seatId: number;
  label: string;
  isReserved: boolean;
};

export interface ScreeningSeatRepositoryPort {
  lockForReservation(
    tx: TxContext,
    screeningId: number,
    seatIds: number[],
  ): Promise<LockedSeat[]>;

  assignIfAvailable(
    tx: TxContext,
    screeningId: number,
    seatIds: number[],
    reservationId: string,
  ): Promise<number>;
}

export const SCREENING_SEAT_REPOSITORY = Symbol("SCREENING_SEAT_REPOSITORY");
