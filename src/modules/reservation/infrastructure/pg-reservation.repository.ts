import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { unwrapTx } from "../../../infrastructure/db/transaction";
import { PG_POOL } from "../../../infrastructure/db/tokens";
import {
  ReservationCursor,
  ReservationDetail,
  ReservationListRow,
  ReservationRepositoryPort,
  ReservationSummary,
} from "../ports/reservation-repository.port";
import { TxContext } from "../ports/transaction-manager.port";

type ReservationAggregateRow = {
  internal_id: string;
  public_id: string;
  screening_id: number;
  total_price: number;
  reserved_at: string | Date;
  movie_id: number;
  movie_title: string;
  runtime_min: number;
  screen_id: number;
  screen_name: string;
  seat_ids: number[];
  seats: {
    seatId: number;
    row: string;
    col: number;
    label: string;
  }[];
};

@Injectable()
export class PgReservationRepository implements ReservationRepositoryPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insert(input: {
    tx: TxContext;
    userId: number;
    screeningId: number;
    totalPrice: number;
  }): Promise<{ id: string; summary: ReservationSummary }> {
    const result = await unwrapTx(input.tx).query<{
      id: string;
      public_id: string;
      screening_id: number;
      total_price: number;
      reserved_at: string | Date;
    }>(
      `
        INSERT INTO reservations (user_id, screening_id, total_price)
        VALUES ($1, $2, $3)
        RETURNING id, public_id, screening_id, total_price, reserved_at
      `,
      [input.userId, input.screeningId, input.totalPrice],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("reservation insert returned no rows");
    }
    return {
      id: row.id,
      summary: {
        reservationId: row.public_id,
        screeningId: row.screening_id,
        seatIds: [],
        totalPrice: row.total_price,
        reservedAt: toIso(row.reserved_at),
      },
    };
  }

  async findSummaryByInternalId(
    tx: TxContext,
    userId: number,
    reservationId: string,
  ): Promise<ReservationSummary | null> {
    const detail = await this.findAggregate(unwrapTx(tx), {
      where: "r.user_id = $1 AND r.id = $2",
      values: [userId, reservationId],
      limit: 1,
    });
    const row = detail[0];
    return row
      ? {
          reservationId: row.reservationId,
          screeningId: row.screeningId,
          seatIds: row.seatIds,
          totalPrice: row.totalPrice,
          reservedAt: row.reservedAt,
        }
      : null;
  }

  async findDetailByPublicId(
    userId: number,
    publicId: string,
  ): Promise<ReservationDetail | null> {
    const rows = await this.findAggregate(this.pool, {
      where: "r.user_id = $1 AND r.public_id = $2",
      values: [userId, publicId],
      limit: 1,
    });
    return rows[0] ?? null;
  }

  async findByUser(input: {
    userId: number;
    limit: number;
    cursor?: ReservationCursor;
  }): Promise<ReservationListRow[]> {
    const values: unknown[] = [input.userId];
    let where = "r.user_id = $1";
    if (input.cursor) {
      values.push(input.cursor.reservedAt, input.cursor.id);
      where += ` AND (r.reserved_at, r.id) < ($${values.length - 1}::timestamptz, $${values.length}::bigint)`;
    }
    return this.findAggregate(this.pool, {
      where,
      values,
      limit: input.limit,
    });
  }

  private async findAggregate(
    client: Pick<Pool, "query">,
    input: { where: string; values: unknown[]; limit: number },
  ): Promise<ReservationListRow[]> {
    const values = [...input.values, input.limit];
    const result = await client.query<ReservationAggregateRow>(
      `
        SELECT r.id::text AS internal_id,
               r.public_id::text AS public_id,
               r.screening_id,
               r.total_price,
               r.reserved_at,
               m.id AS movie_id,
               m.title AS movie_title,
               m.runtime_min,
               s.id AS screen_id,
               s.name AS screen_name,
               coalesce(
                 array_agg(ss.seat_id ORDER BY ss.seat_id)
                   FILTER (WHERE ss.seat_id IS NOT NULL),
                 ARRAY[]::integer[]
               ) AS seat_ids,
               coalesce(
                 json_agg(
                   json_build_object(
                     'seatId', seat.id,
                     'row', seat.row_label,
                     'col', seat.col_no,
                     'label', seat.row_label || seat.col_no::text
                   )
                   ORDER BY ss.seat_id
                 ) FILTER (WHERE seat.id IS NOT NULL),
                 '[]'::json
               ) AS seats
          FROM reservations r
          JOIN screenings sc ON sc.id = r.screening_id
          JOIN movies m ON m.id = sc.movie_id
          JOIN screens s ON s.id = sc.screen_id
          LEFT JOIN screening_seats ss ON ss.reservation_id = r.id
          LEFT JOIN seats seat
            ON seat.id = ss.seat_id
           AND seat.screen_id = ss.screen_id
         WHERE ${input.where}
         GROUP BY r.id, m.id, s.id
         ORDER BY r.reserved_at DESC, r.id DESC
         LIMIT $${values.length}
      `,
      values,
    );

    return result.rows.map((row) => ({
      internalId: row.internal_id,
      reservationId: row.public_id,
      screeningId: row.screening_id,
      seatIds: row.seat_ids,
      totalPrice: row.total_price,
      reservedAt: toIso(row.reserved_at),
      movie: {
        id: row.movie_id,
        title: row.movie_title,
        runtimeMin: row.runtime_min,
      },
      screen: {
        id: row.screen_id,
        name: row.screen_name,
      },
      seats: row.seats,
    }));
  }
}

const toIso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : value;
