import { Injectable } from "@nestjs/common";
import { unwrapTx } from "../../../infrastructure/db/transaction";
import {
  IdempotencyClaim,
  IdempotencyRepositoryPort,
} from "../ports/idempotency-repository.port";
import { TxContext } from "../ports/transaction-manager.port";

@Injectable()
export class PgIdempotencyRepository implements IdempotencyRepositoryPort {
  async tryClaim(input: {
    tx: TxContext;
    userId: number;
    key: string;
    requestHash: string;
  }): Promise<IdempotencyClaim> {
    const client = unwrapTx(input.tx);
    const inserted = await client.query<{
      request_hash: string;
      reservation_id: string | null;
    }>(
      `
        INSERT INTO reservation_idempotency_keys (user_id, idempotency_key, request_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
        RETURNING request_hash, reservation_id
      `,
      [input.userId, input.key, input.requestHash],
    );

    if ((inserted.rowCount ?? 0) > 0) {
      return { kind: "CLAIMED" };
    }

    const existing = await client.query<{
      request_hash: string;
      reservation_id: string | null;
    }>(
      `
        SELECT request_hash, reservation_id
          FROM reservation_idempotency_keys
         WHERE user_id = $1
           AND idempotency_key = $2
      `,
      [input.userId, input.key],
    );
    const row = existing.rows[0];
    if (!row) {
      return {
        kind: "EXISTING",
        requestHash: input.requestHash,
        reservationId: null,
      };
    }
    return {
      kind: "EXISTING",
      requestHash: row.request_hash,
      reservationId: row.reservation_id,
    };
  }

  async link(input: {
    tx: TxContext;
    userId: number;
    key: string;
    reservationId: string;
  }): Promise<number> {
    const result = await unwrapTx(input.tx).query(
      `
        UPDATE reservation_idempotency_keys
           SET reservation_id = $3
         WHERE user_id = $1
           AND idempotency_key = $2
      `,
      [input.userId, input.key, input.reservationId],
    );
    return result.rowCount ?? 0;
  }
}
