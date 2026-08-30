import { randomUUID } from "node:crypto";

type AuthResponse = {
  accessToken: string;
};

type MovieResponse = {
  movieId: number;
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
  seatIds: number[];
};

type ApiSuccess<T> = {
  success: true;
  data: T;
};

const baseUrl = (process.env.API_BASE_URL ?? "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const apiUrl = `${baseUrl}/${process.env.API_PREFIX ?? "api/v1"}`;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const expectSuccess = <T>(body: ApiSuccess<T>): T => {
  assert(body.success === true, "response success flag was not true");
  return body.data;
};

const requestJson = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; headers: Headers; body: T }> => {
  const url = path.startsWith("http") ? path : `${apiUrl}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    body: (text ? JSON.parse(text) : null) as T,
  };
};

const main = async (): Promise<void> => {
  const health = await requestJson<{ status: string }>(`${baseUrl}/healthz`);
  assert(health.status === 200, `healthz expected 200, got ${health.status}`);

  const ready = await requestJson<{ status: string }>(`${baseUrl}/readyz`);
  assert(ready.status === 200, `readyz expected 200, got ${ready.status}`);

  const email = `smoke-${Date.now()}-${randomUUID()}@example.com`;
  const signup = await requestJson<ApiSuccess<AuthResponse>>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "password123",
      name: "Smoke",
    }),
  });
  assert(signup.status === 201, `signup expected 201, got ${signup.status}`);
  const signupData = expectSuccess(signup.body);
  assert(signupData.accessToken, "signup did not return an access token");

  const login = await requestJson<ApiSuccess<AuthResponse>>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "password123" }),
  });
  assert(login.status === 200, `login expected 200, got ${login.status}`);

  const movies = await requestJson<ApiSuccess<MovieResponse[]>>("/movies");
  assert(movies.status === 200, `movies expected 200, got ${movies.status}`);
  const movieData = expectSuccess(movies.body);
  assert(movieData.length > 0, "seeded movie list is empty");

  const screenings = await requestJson<ApiSuccess<ScreeningResponse[]>>(
    `/movies/${movieData[0]!.movieId}/screenings`,
  );
  assert(
    screenings.status === 200,
    `screenings expected 200, got ${screenings.status}`,
  );
  const screeningData = expectSuccess(screenings.body);
  assert(screeningData.length > 0, "seeded screening list is empty");

  const screeningId = screeningData[0]!.screeningId;
  const seatMap = await requestJson<ApiSuccess<SeatMapResponse>>(
    `/screenings/${screeningId}/seats`,
  );
  assert(seatMap.status === 200, `seats expected 200, got ${seatMap.status}`);
  const seatMapData = expectSuccess(seatMap.body);
  const seat = seatMapData.seats.find((candidate) => candidate.available);
  assert(seat, "seeded screening has no available seat");

  const idempotencyKey = randomUUID();
  const created = await requestJson<ApiSuccess<ReservationResponse>>(
    `/screenings/${screeningId}/reservations`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${signupData.accessToken}`,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ seatIds: [seat.seatId] }),
    },
  );
  assert(
    created.status === 201,
    `reservation expected 201, got ${created.status}`,
  );
  const createdData = expectSuccess(created.body);
  assert(
    createdData.seatIds.includes(seat.seatId),
    "created reservation did not include the requested seat",
  );

  const replay = await requestJson<ApiSuccess<ReservationResponse>>(
    `/screenings/${screeningId}/reservations`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${signupData.accessToken}`,
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify({ seatIds: [seat.seatId] }),
    },
  );
  assert(replay.status === 201, `replay expected 201, got ${replay.status}`);
  const replayData = expectSuccess(replay.body);
  assert(
    replayData.reservationId === createdData.reservationId,
    "replay returned a different reservation id",
  );

  const conflict = await requestJson(
    `/screenings/${screeningId}/reservations`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${signupData.accessToken}`,
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify({ seatIds: [seat.seatId] }),
    },
  );
  assert(
    conflict.status === 409,
    `reserved seat conflict expected 409, got ${conflict.status}`,
  );

  const list = await requestJson<ApiSuccess<{ items: unknown[] }>>(
    "/reservations",
    {
      headers: { authorization: `Bearer ${signupData.accessToken}` },
    },
  );
  assert(
    list.status === 200,
    `reservation list expected 200, got ${list.status}`,
  );
  const listData = expectSuccess(list.body);
  assert(listData.items.length > 0, "reservation list is empty after create");

  const detail = await requestJson(
    `/reservations/${createdData.reservationId}`,
    {
      headers: { authorization: `Bearer ${signupData.accessToken}` },
    },
  );
  assert(
    detail.status === 200,
    `reservation detail expected 200, got ${detail.status}`,
  );

  console.log(
    JSON.stringify(
      {
        baseUrl,
        health: health.status,
        ready: ready.status,
        signup: signup.status,
        login: login.status,
        movies: movieData.length,
        screenings: screeningData.length,
        seats: seatMapData.seats.length,
        reservationId: createdData.reservationId,
        replay: replay.status,
        conflict: conflict.status,
        listCount: listData.items.length,
        detail: detail.status,
      },
      null,
      2,
    ),
  );
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
