import { describe, expect, it, vi } from "vitest";
import { AppConfig } from "../src/common/config/app-config";
import { AppLogger } from "../src/common/logging/app-logger";
import { ReservationTrafficGuard } from "../src/modules/reservation/application/reservation-traffic-guard";
import { ReservationSummary } from "../src/modules/reservation/ports/reservation-repository.port";

const summary: ReservationSummary = {
  reservationId: "018f7f03-0000-7000-8000-000000000001",
  screeningId: 1,
  seatIds: [1],
  totalPrice: 15_000,
  reservedAt: "2026-08-30T00:00:00.000Z",
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createGuard = (input?: {
  maxInFlight?: number;
  maxQueue?: number;
  queueTimeoutMs?: number;
}) =>
  new ReservationTrafficGuard(
    {
      reservation: {
        admissionMaxInFlight: input?.maxInFlight ?? 8,
        admissionMaxQueue: input?.maxQueue ?? 16,
        admissionQueueTimeoutMs: input?.queueTimeoutMs ?? 250,
      },
    } as AppConfig,
    {
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as AppLogger,
  );

const request = (
  overrides?: Partial<{
    userId: number;
    idempotencyKey: string;
    requestHash: string;
    screeningId: number;
  }>,
) => ({
  userId: 1,
  idempotencyKey: "same-intent",
  requestHash: "request-hash",
  screeningId: 1,
  ...overrides,
});

describe("ReservationTrafficGuard", () => {
  it("coalesces concurrent requests with the same user, key, and payload", async () => {
    const guard = createGuard();
    const result = deferred<ReservationSummary>();
    const operation = vi.fn(() => result.promise);

    const first = guard.run(request(), operation);
    const second = guard.run(request(), operation);

    await Promise.resolve();
    expect(operation).toHaveBeenCalledTimes(1);

    result.resolve(summary);
    await expect(first).resolves.toEqual(summary);
    await expect(second).resolves.toEqual(summary);
  });

  it("rejects a different payload reusing an in-flight idempotency key", async () => {
    const guard = createGuard();
    const result = deferred<ReservationSummary>();

    const first = guard.run(request(), () => result.promise);
    await expect(
      guard.run(request({ requestHash: "different-request-hash" }), () =>
        Promise.resolve(summary),
      ),
    ).rejects.toMatchObject({
      status: 422,
      code: "IDEMPOTENCY_KEY_REUSED",
    });

    result.resolve(summary);
    await expect(first).resolves.toEqual(summary);
  });

  it("returns 429 before a second distinct request reaches the database", async () => {
    const guard = createGuard({ maxInFlight: 1, maxQueue: 0 });
    const firstResult = deferred<ReservationSummary>();
    const firstOperation = vi.fn(() => firstResult.promise);
    const secondOperation = vi.fn(() => Promise.resolve(summary));

    const first = guard.run(request(), firstOperation);
    await Promise.resolve();
    await expect(
      guard.run(request({ idempotencyKey: "another-intent" }), secondOperation),
    ).rejects.toMatchObject({
      status: 429,
      code: "RESERVATION_ADMISSION_LIMITED",
    });
    expect(secondOperation).not.toHaveBeenCalled();

    firstResult.resolve(summary);
    await expect(first).resolves.toEqual(summary);

    await expect(
      guard.run(request({ idempotencyKey: "next-intent" }), secondOperation),
    ).resolves.toEqual(summary);
    expect(secondOperation).toHaveBeenCalledTimes(1);
  });
});
