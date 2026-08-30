import { TxContext } from "./transaction-manager.port";

export type ReservationSummary = {
  reservationId: string;
  screeningId: number;
  seatIds: number[];
  totalPrice: number;
  reservedAt: string;
};

export type ReservationDetail = ReservationSummary & {
  movie: {
    id: number;
    title: string;
    runtimeMin: number;
  };
  screen: {
    id: number;
    name: string;
  };
  seats: {
    seatId: number;
    row: string;
    col: number;
    label: string;
  }[];
};

export type ReservationListRow = ReservationDetail & {
  internalId: string;
};

export interface ReservationRepositoryPort {
  insert(input: {
    tx: TxContext;
    userId: number;
    screeningId: number;
    totalPrice: number;
  }): Promise<{ id: string; summary: ReservationSummary }>;

  findSummaryByInternalId(
    tx: TxContext,
    userId: number,
    reservationId: string,
  ): Promise<ReservationSummary | null>;

  findDetailByPublicId(
    userId: number,
    publicId: string,
  ): Promise<ReservationDetail | null>;

  findByUser(input: {
    userId: number;
    limit: number;
    cursor?: ReservationCursor;
  }): Promise<ReservationListRow[]>;
}

export type ReservationCursor = {
  reservedAt: string;
  id: string;
};

export const RESERVATION_REPOSITORY = Symbol("RESERVATION_REPOSITORY");
