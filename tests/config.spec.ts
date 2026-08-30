import { afterEach, describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/common/config/app-config";

const originalEnv = { ...process.env };

describe("loadAppConfig", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults local database access to the non-conflicting compose port", () => {
    delete process.env.DATABASE_URL;

    expect(loadAppConfig().databaseUrl).toBe(
      "postgres://postgres:postgres@localhost:15432/reservation_system",
    );
  });

  it("rejects timeout settings that would make lock_timeout unreachable", () => {
    process.env.PG_STATEMENT_TIMEOUT_MS = "300";
    process.env.PG_IDEMPOTENCY_LOCK_TIMEOUT_MS = "100";
    process.env.PG_SEAT_LOCK_TIMEOUT_MS = "300";

    expect(() => loadAppConfig()).toThrow(
      "PG_SEAT_LOCK_TIMEOUT_MS must be less than PG_STATEMENT_TIMEOUT_MS",
    );
  });

  it("orders the idempotency lock before the seat lock", () => {
    process.env.PG_IDEMPOTENCY_LOCK_TIMEOUT_MS = "500";
    process.env.PG_SEAT_LOCK_TIMEOUT_MS = "500";

    expect(() => loadAppConfig()).toThrow(
      "PG_IDEMPOTENCY_LOCK_TIMEOUT_MS must be less than PG_SEAT_LOCK_TIMEOUT_MS",
    );
  });

  it("keeps a statement timeout below the transaction timeout", () => {
    process.env.PG_STATEMENT_TIMEOUT_MS = "5000";
    process.env.PG_TRANSACTION_TIMEOUT_MS = "5000";

    expect(() => loadAppConfig()).toThrow(
      "PG_STATEMENT_TIMEOUT_MS must be less than PG_TRANSACTION_TIMEOUT_MS",
    );
  });

  it("rejects operationally meaningless non-positive settings", () => {
    process.env.PG_POOL_MAX = "0";

    expect(() => loadAppConfig()).toThrow("PG_POOL_MAX must be at least 1");
  });

  it("rejects an unknown log level", () => {
    process.env.LOG_LEVEL = "verbose";

    expect(() => loadAppConfig()).toThrow(
      "LOG_LEVEL must be one of: fatal, error, warn, info, debug, trace, silent",
    );
  });

  it("requires an explicit database URL in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;

    expect(() => loadAppConfig()).toThrow(
      "DATABASE_URL is required when NODE_ENV=production",
    );
  });

  it("rejects the local database URL in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL =
      "postgres://postgres:postgres@localhost:15432/reservation_system";
    process.env.JWT_SECRET = "production-secret";

    expect(() => loadAppConfig()).toThrow(
      "DATABASE_URL must not use the local default in production",
    );
  });

  it("rejects the local JWT secret in production", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://app:secret@db:5432/reservations";
    delete process.env.JWT_SECRET;

    expect(() => loadAppConfig()).toThrow(
      "JWT_SECRET must not use the local default in production",
    );
  });

  it("rejects a negative transaction retry count", () => {
    process.env.RESERVATION_TX_RETRY_ATTEMPTS = "-1";

    expect(() => loadAppConfig()).toThrow(
      "RESERVATION_TX_RETRY_ATTEMPTS must be at least 0",
    );
  });

  it("rejects a retry base delay above its cap", () => {
    process.env.RESERVATION_TX_RETRY_BASE_DELAY_MS = "101";
    process.env.RESERVATION_TX_RETRY_MAX_DELAY_MS = "100";

    expect(() => loadAppConfig()).toThrow(
      "RESERVATION_TX_RETRY_BASE_DELAY_MS must not exceed RESERVATION_TX_RETRY_MAX_DELAY_MS",
    );
  });

  it("keeps reservation admission at or below the PostgreSQL pool size", () => {
    process.env.PG_POOL_MAX = "4";
    process.env.RESERVATION_ADMISSION_MAX_IN_FLIGHT = "5";

    expect(() => loadAppConfig()).toThrow(
      "RESERVATION_ADMISSION_MAX_IN_FLIGHT must not exceed PG_POOL_MAX",
    );
  });

  it("requires a non-default production JWT secret with a minimum length", () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "postgres://app:secret@db:5432/reservations";
    process.env.JWT_SECRET = "too-short";

    expect(() => loadAppConfig()).toThrow(
      "JWT_SECRET must be at least 32 characters when NODE_ENV=production",
    );
  });
});
