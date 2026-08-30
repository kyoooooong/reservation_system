import { TxContext } from "./transaction-manager.port";

export type ReservationScreening = {
  id: number;
  screenId: number;
  basePrice: number;
  alreadyStarted: boolean;
};

export interface ScreeningRepositoryPort {
  findForReservation(
    tx: TxContext,
    screeningId: number,
  ): Promise<ReservationScreening | null>;
}

export const SCREENING_REPOSITORY = Symbol("SCREENING_REPOSITORY");
