import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { AppError } from "../../../common/errors/app-error";
import { PG_POOL } from "../../../infrastructure/db/tokens";

export type MovieResponse = {
  movieId: number;
  title: string;
  runtimeMin: number;
};

export type ScreeningResponse = {
  screeningId: number;
  movieId: number;
  screen: {
    id: number;
    name: string;
  };
  startsAt: string;
  basePrice: number;
};

export type SeatMapResponse = {
  screeningId: number;
  screen: {
    id: number;
    name: string;
  };
  seats: {
    seatId: number;
    row: string;
    col: number;
    label: string;
    available: boolean;
  }[];
};

@Injectable()
export class CatalogQueryService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listMovies(): Promise<MovieResponse[]> {
    const result = await this.pool.query<{
      id: number;
      title: string;
      runtime_min: number;
    }>(
      `
        SELECT id, title, runtime_min
          FROM movies
         ORDER BY id
      `,
    );
    return result.rows.map((movie) => ({
      movieId: movie.id,
      title: movie.title,
      runtimeMin: movie.runtime_min,
    }));
  }

  async listScreenings(movieId: number): Promise<ScreeningResponse[]> {
    const movie = await this.pool.query("SELECT 1 FROM movies WHERE id = $1", [
      movieId,
    ]);
    if (movie.rowCount === 0) {
      throw new AppError({
        status: 404,
        code: "MOVIE_NOT_FOUND",
        title: "Movie not found",
        detail: "The requested movie does not exist.",
      });
    }

    const result = await this.pool.query<{
      screening_id: number;
      movie_id: number;
      screen_id: number;
      screen_name: string;
      starts_at: string | Date;
      base_price: number;
    }>(
      `
        SELECT sc.id AS screening_id,
               sc.movie_id,
               s.id AS screen_id,
               s.name AS screen_name,
               sc.starts_at,
               sc.base_price
          FROM screenings sc
          JOIN screens s ON s.id = sc.screen_id
         WHERE sc.movie_id = $1
           AND sc.starts_at > statement_timestamp()
         ORDER BY sc.starts_at ASC
      `,
      [movieId],
    );
    return result.rows.map((row) => ({
      screeningId: row.screening_id,
      movieId: row.movie_id,
      screen: {
        id: row.screen_id,
        name: row.screen_name,
      },
      startsAt: toIso(row.starts_at),
      basePrice: row.base_price,
    }));
  }

  async getSeatMap(screeningId: number): Promise<SeatMapResponse> {
    const screening = await this.pool.query<{
      screening_id: number;
      screen_id: number;
      screen_name: string;
    }>(
      `
        SELECT sc.id AS screening_id,
               s.id AS screen_id,
               s.name AS screen_name
          FROM screenings sc
          JOIN screens s ON s.id = sc.screen_id
         WHERE sc.id = $1
      `,
      [screeningId],
    );
    const header = screening.rows[0];
    if (!header) {
      throw new AppError({
        status: 404,
        code: "SCREENING_NOT_FOUND",
        title: "Screening not found",
        detail: "The requested screening does not exist.",
      });
    }

    const seats = await this.pool.query<{
      seat_id: number;
      row_label: string;
      col_no: number;
      available: boolean;
    }>(
      `
        SELECT seat.id AS seat_id,
               seat.row_label,
               seat.col_no,
               ss.reservation_id IS NULL AS available
          FROM screening_seats ss
          JOIN seats seat
            ON seat.id = ss.seat_id
           AND seat.screen_id = ss.screen_id
         WHERE ss.screening_id = $1
         ORDER BY seat.row_label, seat.col_no
      `,
      [screeningId],
    );

    return {
      screeningId: header.screening_id,
      screen: {
        id: header.screen_id,
        name: header.screen_name,
      },
      seats: seats.rows.map((seat) => ({
        seatId: seat.seat_id,
        row: seat.row_label,
        col: seat.col_no,
        label: `${seat.row_label}${seat.col_no}`,
        available: seat.available,
      })),
    };
  }
}

const toIso = (value: string | Date): string =>
  value instanceof Date ? value.toISOString() : value;
