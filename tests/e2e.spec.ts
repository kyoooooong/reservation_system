import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { GenericContainer, StartedTestContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { configureApp } from "../src/app-bootstrap";
import { AppModule } from "../src/app.module";

type SignupResponse = {
  accessToken: string;
  user: {
    id: number;
    email: string;
    name: string;
  };
};

type MovieResponse = {
  movieId: number;
  title: string;
};

type ScreeningResponse = {
  screeningId: number;
};

type SeatMapResponse = {
  seats: {
    seatId: number;
    available: boolean;
  }[];
};

type ReservationResponse = {
  reservationId: string;
  screeningId: number;
  seatIds: number[];
};

type ReservationListResponse = {
  items: ReservationResponse[];
  nextCursor: string | null;
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiFailure = {
  success: false;
  error: {
    code: string;
    [key: string]: unknown;
  };
  traceId: string;
};

describe.skipIf(process.env.RUN_E2E !== "1")("reservation API", () => {
  let container: StartedTestContainer;
  let pool: Pool;
  let app: INestApplication;

  beforeAll(async () => {
    container = await new GenericContainer("postgres:18.6-bookworm")
      .withEnvironment({
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
        POSTGRES_DB: "reservation_system",
        POSTGRES_INITDB_ARGS:
          "--locale-provider=builtin --builtin-locale=C.UTF-8",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();

    const databaseUrl = `postgres://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/reservation_system`;
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_ISSUER = "reservation-system";
    process.env.JWT_AUDIENCE = "reservation-system-client";
    process.env.JWT_EXPIRES_IN_SECONDS = "3600";
    process.env.PG_CONNECTION_TIMEOUT_MS = "1000";
    process.env.PG_STATEMENT_TIMEOUT_MS = "5000";
    process.env.PG_IDLE_IN_TX_TIMEOUT_MS = "6000";
    process.env.PG_TRANSACTION_TIMEOUT_MS = "7000";
    process.env.PG_IDEMPOTENCY_LOCK_TIMEOUT_MS = "500";
    process.env.PG_SEAT_LOCK_TIMEOUT_MS = "300";

    pool = new Pool({ connectionString: databaseUrl });
    await pool.query(
      await readFile(join(process.cwd(), "migrations", "001_init.sql"), "utf8"),
    );
    await seed(pool);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await container?.stop();
  }, 120_000);

  it("serves health endpoints outside the business API prefix", async () => {
    const requestId = "e2e-health-check-001";
    const health = await request(app.getHttpServer())
      .get("/healthz")
      .set("X-Request-Id", requestId)
      .expect(200);
    expect(health.headers["x-request-id"]).toBe(requestId);
    await request(app.getHttpServer()).get("/readyz").expect(200);

    const metrics = await request(app.getHttpServer())
      .get("/metrics")
      .expect(200);
    expect(metrics.headers["content-type"]).toContain("text/plain");
    expect(metrics.text).toContain("http_requests_total");
    expect(metrics.text).toContain("http_request_duration_seconds_bucket");
    expect(metrics.text).toContain("pg_pool_total_connections");
  });

  it("normalizes signup/login input and rejects unauthenticated reservation reads", async () => {
    const email = uniqueEmail("auth");
    const signup = await request(app.getHttpServer())
      .post("/api/v1/auth/signup")
      .send({
        email: ` ${email.toUpperCase()} `,
        password: "password123",
        name: " Alice ",
      })
      .expect(201);
    const auth = expectSuccess<SignupResponse>(signup.body);

    expect(auth.user.email).toBe(email);
    expect(auth.user.name).toBe("Alice");
    expect(auth.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post("/api/v1/auth/signup")
      .send({
        email,
        password: "password123",
        name: "Alice Again",
      })
      .expect(409)
      .expect(({ body }) => expectFailureCode(body, "EMAIL_ALREADY_EXISTS"));

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: ` ${email.toUpperCase()} `, password: "password123" })
      .expect(200);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password" })
      .expect(401)
      .expect(({ body }) => expectFailureCode(body, "INVALID_CREDENTIALS"));

    const unauthenticated = await request(app.getHttpServer())
      .get("/api/v1/reservations")
      .set("X-Request-Id", "e2e-unauthenticated-001")
      .expect(401)
      .expect(({ body }) => expectFailureCode(body, "UNAUTHENTICATED"));
    const failure = expectFailureCode(unauthenticated.body, "UNAUTHENTICATED");
    expect(unauthenticated.headers["x-request-id"]).toBe(failure.traceId);

    await request(app.getHttpServer())
      .get("/api/v1/reservations")
      .set("Authorization", "Token abc")
      .expect(401);

    await request(app.getHttpServer())
      .get("/api/v1/reservations")
      .set("Authorization", "Bearer not-a-jwt")
      .expect(401);
  });

  it("lists catalog and creates an idempotent reservation", async () => {
    const auth = await signupUser("alice");
    const { screeningId, seatId } = await findAvailableSeat();
    const key = randomUUID();

    const movies = await request(app.getHttpServer())
      .get("/api/v1/movies")
      .expect(200);
    expect(movies.headers["cache-control"]).toBe(
      "public, max-age=300, stale-while-revalidate=60",
    );
    const movie = expectSuccess<MovieResponse[]>(movies.body)[0];
    expect(movie).toBeDefined();

    const screenings = await request(app.getHttpServer())
      .get(`/api/v1/movies/${movie!.movieId}/screenings`)
      .expect(200);
    expect(screenings.headers["cache-control"]).toBe("no-store");
    expect(
      expectSuccess<ScreeningResponse[]>(screenings.body).length,
    ).toBeGreaterThan(0);

    const seatMap = await request(app.getHttpServer())
      .get(`/api/v1/screenings/${screeningId}/seats`)
      .expect(200);
    expect(seatMap.headers["cache-control"]).toBe("no-store");
    const seat = expectSuccess<SeatMapResponse>(seatMap.body).seats.find(
      (candidate) => candidate.seatId === seatId,
    );
    expect(seat?.available).toBe(true);

    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .send({ seatIds: [seatId] })
      .expect(400)
      .expect(({ body }) =>
        expectFailureCode(body, "IDEMPOTENCY_KEY_REQUIRED"),
      );

    const first = await reserveSeat({
      token: auth.accessToken,
      screeningId,
      seatIds: [seatId],
      idempotencyKey: key,
    });
    const replay = await reserveSeat({
      token: auth.accessToken,
      screeningId,
      seatIds: [seatId],
      idempotencyKey: key,
    });

    expect(replay.reservationId).toBe(first.reservationId);

    const otherSeat = await findAvailableSeat(screeningId, [seatId]);
    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Idempotency-Key", key)
      .send({ seatIds: [otherSeat.seatId] })
      .expect(422)
      .expect(({ body }) => expectFailureCode(body, "IDEMPOTENCY_KEY_REUSED"));

    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ seatIds: [seatId] })
      .expect(409)
      .expect(({ body }) => expectFailureCode(body, "SEAT_ALREADY_RESERVED"));
  });

  it("keeps seat-map reads committed-only while a competing reservation waits briefly", async () => {
    const auth = await signupUser("lock-wait");
    const target = await findAvailableSeat();
    const idempotencyKey = randomUUID();
    const locker = await pool.connect();

    try {
      await locker.query("BEGIN");
      await locker.query(
        `
          SELECT 1
            FROM screening_seats
           WHERE screening_id = $1
             AND seat_id = $2
           FOR UPDATE
        `,
        [target.screeningId, target.seatId],
      );

      const seatMap = await request(app.getHttpServer())
        .get(`/api/v1/screenings/${target.screeningId}/seats`)
        .expect(200);
      const seat = expectSuccess<SeatMapResponse>(seatMap.body).seats.find(
        (candidate) => candidate.seatId === target.seatId,
      );
      expect(seat?.available).toBe(true);

      const startedAt = performance.now();
      const timedOut = await request(app.getHttpServer())
        .post(`/api/v1/screenings/${target.screeningId}/reservations`)
        .set("Authorization", `Bearer ${auth.accessToken}`)
        .set("Idempotency-Key", idempotencyKey)
        .send({ seatIds: [target.seatId] })
        .expect(503);
      const elapsedMs = performance.now() - startedAt;

      expect(elapsedMs).toBeGreaterThanOrEqual(200);
      expect(elapsedMs).toBeLessThan(2_000);
      expect(timedOut.headers["retry-after"]).toBe("1");
      const failure = expectFailureCode(
        timedOut.body,
        "RESERVATION_TEMPORARILY_UNAVAILABLE",
      );
      expect(failure.error.retryable).toBe(true);
    } finally {
      await locker.query("ROLLBACK").catch(() => undefined);
      locker.release();
    }

    await reserveSeat({
      token: auth.accessToken,
      screeningId: target.screeningId,
      seatIds: [target.seatId],
      idempotencyKey,
    });

    const afterCommit = await request(app.getHttpServer())
      .get(`/api/v1/screenings/${target.screeningId}/seats`)
      .expect(200);
    const committedSeat = expectSuccess<SeatMapResponse>(
      afterCommit.body,
    ).seats.find((candidate) => candidate.seatId === target.seatId);
    expect(committedSeat?.available).toBe(false);
  });

  it("hides another user's reservation detail and paginates the owner's list", async () => {
    const owner = await signupUser("owner");
    const outsider = await signupUser("outsider");
    const reservations: ReservationResponse[] = [];

    for (const target of await findAvailableSeats(3)) {
      reservations.push(
        await reserveSeat({
          token: owner.accessToken,
          screeningId: target.screeningId,
          seatIds: [target.seatId],
          idempotencyKey: randomUUID(),
        }),
      );
    }

    await request(app.getHttpServer())
      .get(`/api/v1/reservations/${reservations[0]!.reservationId}`)
      .set("Authorization", `Bearer ${outsider.accessToken}`)
      .expect(404)
      .expect(({ body }) => expectFailureCode(body, "RESERVATION_NOT_FOUND"));

    const firstPage = await request(app.getHttpServer())
      .get("/api/v1/reservations")
      .query({ limit: "2" })
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    const pageOne = expectSuccess<ReservationListResponse>(firstPage.body);
    expect(pageOne.items).toHaveLength(2);
    expect(pageOne.nextCursor).toEqual(expect.any(String));

    const secondPage = await request(app.getHttpServer())
      .get("/api/v1/reservations")
      .query({ limit: "2", cursor: pageOne.nextCursor })
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(200);
    const pageTwo = expectSuccess<ReservationListResponse>(secondPage.body);
    expect(pageTwo.items.length).toBeGreaterThanOrEqual(1);
    expect(pageTwo.items.map((item) => item.reservationId)).not.toContain(
      pageOne.items[0]!.reservationId,
    );

    await request(app.getHttpServer())
      .get("/api/v1/reservations")
      .query({ cursor: "not-a-valid-cursor" })
      .set("Authorization", `Bearer ${owner.accessToken}`)
      .expect(400)
      .expect(({ body }) => expectFailureCode(body, "VALIDATION_FAILED"));
  });

  it("rejects invalid reservation inputs at the API and domain boundaries", async () => {
    const auth = await signupUser("invalid");
    const { screeningId } = await findAvailableSeat();

    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ seatIds: ["1"] })
      .expect(400)
      .expect(({ body }) => expectFailureCode(body, "VALIDATION_FAILED"));

    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ seatIds: [0] })
      .expect(422)
      .expect(({ body }) => expectFailureCode(body, "INVALID_SEAT_ID"));

    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ seatIds: [1, 1] })
      .expect(422)
      .expect(({ body }) => expectFailureCode(body, "DUPLICATE_SEAT_IDS"));
  });

  it("rejects reservations after a screening has started", async () => {
    const auth = await signupUser("started");
    const target = await createStartedScreeningSeat();

    await request(app.getHttpServer())
      .post(`/api/v1/screenings/${target.screeningId}/reservations`)
      .set("Authorization", `Bearer ${auth.accessToken}`)
      .set("Idempotency-Key", randomUUID())
      .send({ seatIds: [target.seatId] })
      .expect(409)
      .expect(({ body }) =>
        expectFailureCode(body, "SCREENING_ALREADY_STARTED"),
      );
  });

  it("allows only one committed reservation for the same screening-seat under concurrency", async () => {
    const auth = await signupUser("burst");
    const target = await findAvailableSeat();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app.getHttpServer())
          .post(`/api/v1/screenings/${target.screeningId}/reservations`)
          .set("Authorization", `Bearer ${auth.accessToken}`)
          .set("Idempotency-Key", randomUUID())
          .send({ seatIds: [target.seatId] }),
      ),
    );

    const created = responses.filter((response) => response.status === 201);
    const expectedFailures = responses.filter(
      (response) => response.status === 409 || response.status === 503,
    );
    expect(created).toHaveLength(1);
    expect(expectedFailures).toHaveLength(9);

    const assignmentCount = await pool.query<{ count: string }>(
      `
        SELECT count(*)::text AS count
          FROM screening_seats
         WHERE screening_id = $1
           AND seat_id = $2
           AND reservation_id IS NOT NULL
      `,
      [target.screeningId, target.seatId],
    );
    expect(assignmentCount.rows[0]?.count).toBe("1");

    const reservationCount = await pool.query<{ count: string }>(
      `
        SELECT count(DISTINCT r.id)::text AS count
          FROM reservations r
          JOIN screening_seats ss ON ss.reservation_id = r.id
         WHERE ss.screening_id = $1
           AND ss.seat_id = $2
      `,
      [target.screeningId, target.seatId],
    );
    expect(reservationCount.rows[0]?.count).toBe("1");
  });

  const signupUser = async (label: string): Promise<SignupResponse> => {
    const signup = await request(app.getHttpServer())
      .post("/api/v1/auth/signup")
      .send({
        email: uniqueEmail(label),
        password: "password123",
        name: label,
      })
      .expect(201);
    return expectSuccess<SignupResponse>(signup.body);
  };

  const reserveSeat = async (input: {
    token: string;
    screeningId: number;
    seatIds: number[];
    idempotencyKey: string;
  }): Promise<ReservationResponse> => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/screenings/${input.screeningId}/reservations`)
      .set("Authorization", `Bearer ${input.token}`)
      .set("Idempotency-Key", input.idempotencyKey)
      .send({ seatIds: input.seatIds })
      .expect(201);
    const reservation = expectSuccess<ReservationResponse>(response.body);
    expect(response.headers.location).toBe(
      `/api/v1/reservations/${reservation.reservationId}`,
    );
    return reservation;
  };

  const findAvailableSeat = async (
    screeningId?: number,
    excludedSeatIds: number[] = [],
  ): Promise<{ screeningId: number; seatId: number }> => {
    const seats = await findAvailableSeats(1, screeningId, excludedSeatIds);
    return seats[0]!;
  };

  const findAvailableSeats = async (
    count: number,
    screeningId?: number,
    excludedSeatIds: number[] = [],
  ): Promise<{ screeningId: number; seatId: number }[]> => {
    const params: unknown[] = [];
    const filters = [
      "ss.reservation_id IS NULL",
      "sc.starts_at > statement_timestamp()",
    ];
    if (screeningId !== undefined) {
      params.push(screeningId);
      filters.push(`ss.screening_id = $${params.length}`);
    }
    if (excludedSeatIds.length > 0) {
      params.push(excludedSeatIds);
      filters.push(`NOT (ss.seat_id = ANY($${params.length}::integer[]))`);
    }
    params.push(count);

    const result = await pool.query<{ screening_id: number; seat_id: number }>(
      `
        SELECT ss.screening_id, ss.seat_id
          FROM screening_seats ss
          JOIN screenings sc ON sc.id = ss.screening_id
         WHERE ${filters.join(" AND ")}
         ORDER BY ss.screening_id, ss.seat_id
         LIMIT $${params.length}
      `,
      params,
    );
    if (result.rows.length !== count) {
      throw new Error(
        `Needed ${count} available seats, found ${result.rows.length}`,
      );
    }
    return result.rows.map((row) => ({
      screeningId: row.screening_id,
      seatId: row.seat_id,
    }));
  };

  const createStartedScreeningSeat = async (): Promise<{
    screeningId: number;
    seatId: number;
  }> => {
    const suffix = randomUUID().slice(0, 8);
    const result = await pool.query<{ screening_id: number; seat_id: number }>(
      `
        WITH movie AS (
          INSERT INTO movies (title, runtime_min)
          VALUES ($1, 90)
          RETURNING id
        ),
        screen AS (
          INSERT INTO screens (name)
          VALUES ($2)
          RETURNING id
        ),
        seat AS (
          INSERT INTO seats (screen_id, row_label, col_no)
          SELECT id, 'A', 1 FROM screen
          RETURNING id, screen_id
        ),
        screening AS (
          INSERT INTO screenings (movie_id, screen_id, starts_at, base_price)
          SELECT movie.id, screen.id, statement_timestamp() - interval '1 minute', 12000
            FROM movie, screen
          RETURNING id, screen_id
        )
        INSERT INTO screening_seats (screening_id, screen_id, seat_id)
        SELECT screening.id, screening.screen_id, seat.id
          FROM screening, seat
        RETURNING screening_id, seat_id
      `,
      [`Started ${suffix}`, `Started Screen ${suffix}`],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Failed to create started screening");
    }
    return {
      screeningId: row.screening_id,
      seatId: row.seat_id,
    };
  };
});

const uniqueEmail = (label: string): string =>
  `${label}-${randomUUID()}@example.com`;

const expectSuccess = <T>(body: unknown): T => {
  const response = body as ApiSuccess<T>;
  expect(response.success).toBe(true);
  return response.data;
};

const expectFailureCode = (body: unknown, code: string): ApiFailure => {
  const response = body as ApiFailure;
  expect(response.success).toBe(false);
  expect(response.error.code).toBe(code);
  expect(response.traceId).toEqual(expect.any(String));
  return response;
};

async function seed(pool: Pool): Promise<void> {
  await pool.query(`
    INSERT INTO movies (title, runtime_min)
    VALUES ('The Transaction', 118)
  `);
  await pool.query(`
    INSERT INTO screens (name)
    VALUES ('Screen 1'), ('Screen 2')
  `);
  await pool.query(`
    INSERT INTO seats (screen_id, row_label, col_no)
    SELECT s.id, row_label, col_no
      FROM screens s
      CROSS JOIN unnest(ARRAY['A', 'B', 'C', 'D']) AS rows(row_label)
      CROSS JOIN generate_series(1, 6) AS cols(col_no)
  `);
  await pool.query(`
    INSERT INTO screenings (movie_id, screen_id, starts_at, base_price)
    SELECT m.id, s.id, '2030-08-27T10:00:00+09:00'::timestamptz, 14000
      FROM movies m
      JOIN screens s ON s.name = 'Screen 1'
     WHERE m.title = 'The Transaction'
  `);
  await pool.query(`
    INSERT INTO screening_seats (screening_id, screen_id, seat_id)
    SELECT sc.id, seat.screen_id, seat.id
      FROM screenings sc
      JOIN seats seat ON seat.screen_id = sc.screen_id
  `);
}
