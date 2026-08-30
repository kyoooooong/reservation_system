import { Injectable } from "@nestjs/common";
import { unwrapTx } from "../../../infrastructure/db/transaction";
import {
  LockedSeat,
  ScreeningSeatRepositoryPort,
} from "../ports/screening-seat-repository.port";
import { TxContext } from "../ports/transaction-manager.port";

@Injectable()
export class PgScreeningSeatRepository implements ScreeningSeatRepositoryPort {
  async lockForReservation(
    tx: TxContext,
    screeningId: number,
    seatIds: number[],
  ): Promise<LockedSeat[]> {
    const result = await unwrapTx(tx).query<{
      seat_id: number;
      label: string;
      reservation_id: string | null;
    }>(
      `
        SELECT ss.seat_id,
               s.row_label || s.col_no::text AS label,
               ss.reservation_id
          FROM screening_seats ss
          JOIN seats s
            ON s.id = ss.seat_id
           AND s.screen_id = ss.screen_id
         WHERE ss.screening_id = $1
           AND ss.seat_id = ANY($2::integer[])
         ORDER BY ss.seat_id
         FOR UPDATE OF ss
      `,
      [screeningId, seatIds],
    );
    return result.rows.map((row) => ({
      seatId: row.seat_id,
      label: row.label,
      isReserved: row.reservation_id !== null,
    }));
  }

  async assignIfAvailable(
    tx: TxContext,
    screeningId: number,
    seatIds: number[],
    reservationId: string,
  ): Promise<number> {
    const result = await unwrapTx(tx).query(
      `
        UPDATE screening_seats
           SET reservation_id = $3
         WHERE screening_id = $1
           AND seat_id = ANY($2::integer[])
           AND reservation_id IS NULL
      `,
      [screeningId, seatIds, reservationId],
    );
    return result.rowCount ?? 0;
  }
}
