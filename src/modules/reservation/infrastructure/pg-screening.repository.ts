import { Injectable } from "@nestjs/common";
import { unwrapTx } from "../../../infrastructure/db/transaction";
import {
  ReservationScreening,
  ScreeningRepositoryPort,
} from "../ports/screening-repository.port";
import { TxContext } from "../ports/transaction-manager.port";

@Injectable()
export class PgScreeningRepository implements ScreeningRepositoryPort {
  async findForReservation(
    tx: TxContext,
    screeningId: number,
  ): Promise<ReservationScreening | null> {
    const result = await unwrapTx(tx).query<{
      id: number;
      screen_id: number;
      base_price: number;
      already_started: boolean;
    }>(
      `
        SELECT id,
               screen_id,
               base_price,
               starts_at <= statement_timestamp() AS already_started
          FROM screenings
         WHERE id = $1
      `,
      [screeningId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      screenId: row.screen_id,
      basePrice: row.base_price,
      alreadyStarted: row.already_started,
    };
  }
}
