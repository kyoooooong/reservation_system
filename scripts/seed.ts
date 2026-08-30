import { Pool, PoolClient } from "pg";
import { getDatabaseUrl } from "./db-url";

type SeedScreening = {
  movieTitle: string;
  screenName: string;
  startsAt: string;
  basePrice: number;
};

const movies = [
  { title: "The Transaction", runtimeMin: 118 },
  { title: "Midnight Commit", runtimeMin: 104 },
  { title: "Lockstep", runtimeMin: 126 },
] as const;

const screens = [{ name: "Screen 1" }, { name: "Screen 2" }] as const;

const rows = ["A", "B", "C", "D"];
const cols = [1, 2, 3, 4, 5, 6];

const screenings: SeedScreening[] = [
  {
    movieTitle: "The Transaction",
    screenName: "Screen 1",
    startsAt: "2030-08-27T10:00:00+09:00",
    basePrice: 14000,
  },
  {
    movieTitle: "The Transaction",
    screenName: "Screen 1",
    startsAt: "2030-08-27T14:00:00+09:00",
    basePrice: 14000,
  },
  {
    movieTitle: "Midnight Commit",
    screenName: "Screen 2",
    startsAt: "2030-08-27T20:00:00+09:00",
    basePrice: 15000,
  },
  {
    movieTitle: "Lockstep",
    screenName: "Screen 2",
    startsAt: "2030-08-28T12:30:00+09:00",
    basePrice: 16000,
  },
];

async function getId(
  client: PoolClient,
  table: "movies" | "screens",
  column: string,
  value: string,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `SELECT id FROM ${table} WHERE ${column} = $1`,
    [value],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Seed row not found in ${table}: ${value}`);
  }
  return row.id;
}

async function verifyScreeningSeats(client: PoolClient): Promise<void> {
  const result = await client.query<{
    screening_id: number;
    expected: string;
    actual: string;
  }>(`
    SELECT sc.id AS screening_id,
           (SELECT count(*) FROM seats s WHERE s.screen_id = sc.screen_id) AS expected,
           (SELECT count(*) FROM screening_seats ss WHERE ss.screening_id = sc.id) AS actual
      FROM screenings sc
  `);

  for (const row of result.rows) {
    if (row.expected !== row.actual) {
      throw new Error(
        `screening_seats materialization mismatch for screening ${row.screening_id}: expected ${row.expected}, got ${row.actual}`,
      );
    }
  }
}

export async function seed(): Promise<void> {
  const pool = new Pool({ connectionString: getDatabaseUrl() });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const movie of movies) {
      await client.query(
        `
          INSERT INTO movies (title, runtime_min)
          VALUES ($1, $2)
          ON CONFLICT (title) DO UPDATE SET runtime_min = EXCLUDED.runtime_min
        `,
        [movie.title, movie.runtimeMin],
      );
    }

    for (const screen of screens) {
      await client.query(
        `
          INSERT INTO screens (name)
          VALUES ($1)
          ON CONFLICT (name) DO NOTHING
        `,
        [screen.name],
      );
    }

    for (const screen of screens) {
      const screenId = await getId(client, "screens", "name", screen.name);
      for (const row of rows) {
        for (const col of cols) {
          await client.query(
            `
              INSERT INTO seats (screen_id, row_label, col_no)
              VALUES ($1, $2, $3)
              ON CONFLICT (screen_id, row_label, col_no) DO NOTHING
            `,
            [screenId, row, col],
          );
        }
      }
    }

    for (const screening of screenings) {
      const movieId = await getId(
        client,
        "movies",
        "title",
        screening.movieTitle,
      );
      const screenId = await getId(
        client,
        "screens",
        "name",
        screening.screenName,
      );
      const inserted = await client.query<{ id: number }>(
        `
          INSERT INTO screenings (movie_id, screen_id, starts_at, base_price)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (movie_id, screen_id, starts_at) DO UPDATE
            SET base_price = EXCLUDED.base_price
          RETURNING id
        `,
        [movieId, screenId, screening.startsAt, screening.basePrice],
      );
      const screeningId = inserted.rows[0]?.id;
      if (!screeningId) {
        throw new Error(
          `Failed to seed screening ${JSON.stringify(screening)}`,
        );
      }

      await client.query(
        `
          INSERT INTO screening_seats (screening_id, screen_id, seat_id)
          SELECT $1, s.screen_id, s.id
            FROM seats s
           WHERE s.screen_id = $2
          ON CONFLICT (screening_id, seat_id) DO NOTHING
        `,
        [screeningId, screenId],
      );
    }

    await verifyScreeningSeats(client);
    await client.query("COMMIT");
    console.log("Seed data is ready");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  void seed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
