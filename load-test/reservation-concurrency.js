import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

export const options = {
  scenarios: {
    same_seat_burst: {
      executor: "shared-iterations",
      vus: 10,
      iterations: 10,
      maxDuration: "30s",
    },
  },
  thresholds: {
    reservation_created: ["count==1"],
    reservation_unexpected: ["count==0"],
  },
};

const created = new Counter("reservation_created");
const expectedFailure = new Counter("reservation_expected_failure");
const unexpected = new Counter("reservation_unexpected");
const expectedReservationStatus = http.expectedStatuses(201, 409, 503);

const baseUrl = (__ENV.API_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const apiUrl = `${baseUrl}/api/v1`;

const jsonHeaders = {
  "content-type": "application/json",
};

const json = (response) => JSON.parse(response.body);

export function setup() {
  const email = `load-${Date.now()}@example.com`;
  const signup = http.post(
    `${apiUrl}/auth/signup`,
    JSON.stringify({
      email,
      password: "password123",
      name: "Load",
    }),
    { headers: jsonHeaders },
  );
  check(signup, { "signup succeeds": (response) => response.status === 201 });

  const token = json(signup).data.accessToken;
  const movies = json(http.get(`${apiUrl}/movies`)).data;
  const screenings = json(
    http.get(`${apiUrl}/movies/${movies[0].movieId}/screenings`),
  ).data;
  const screeningId = screenings[0].screeningId;
  const seatMap = json(
    http.get(`${apiUrl}/screenings/${screeningId}/seats`),
  ).data;
  const seat = seatMap.seats.find((candidate) => candidate.available);

  return {
    token,
    screeningId,
    seatId: seat.seatId,
  };
}

export default function (data) {
  const response = http.post(
    `${apiUrl}/screenings/${data.screeningId}/reservations`,
    JSON.stringify({ seatIds: [data.seatId] }),
    {
      headers: {
        ...jsonHeaders,
        authorization: `Bearer ${data.token}`,
        "idempotency-key": `${__VU}-${__ITER}-${Date.now()}`,
      },
      responseCallback: expectedReservationStatus,
    },
  );

  if (response.status === 201) {
    created.add(1);
    return;
  }
  if (response.status === 409 || response.status === 503) {
    expectedFailure.add(1);
    return;
  }
  unexpected.add(1);
}
