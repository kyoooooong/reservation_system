export type AppConfig = {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  log: {
    level: LogLevel;
  };
  jwt: {
    secret: string;
    issuer: string;
    audience: string;
    expiresInSeconds: number;
  };
  pg: {
    poolMax: number;
    connectionTimeoutMs: number;
    statementTimeoutMs: number;
    idleInTxTimeoutMs: number;
    transactionTimeoutMs: number;
    lockTimeoutBaselineMs: number;
    idempotencyLockTimeoutMs: number;
    seatLockTimeoutMs: number;
  };
  reservation: {
    maxSeats: number;
    txRetryAttempts: number;
  };
};

const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const LOCAL_DATABASE_URL =
  "postgres://postgres:postgres@localhost:15432/reservation_system";
const LOCAL_JWT_SECRET = "change-me-in-local-development";

const readInt = (
  name: string,
  fallback: number,
  options: { min?: number; max?: number } = {},
): number => {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  if (options.min !== undefined && parsed < options.min) {
    throw new Error(`${name} must be at least ${options.min}`);
  }
  if (options.max !== undefined && parsed > options.max) {
    throw new Error(`${name} must be at most ${options.max}`);
  }
  return parsed;
};

const readString = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const readLogLevel = (nodeEnv: string): LogLevel => {
  const value =
    process.env.LOG_LEVEL ?? (nodeEnv === "test" ? "silent" : "info");
  if ((LOG_LEVELS as readonly string[]).includes(value)) {
    return value as LogLevel;
  }
  throw new Error(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}`);
};

export const loadAppConfig = (): AppConfig => {
  const nodeEnv = process.env.NODE_ENV ?? "development";
  const config: AppConfig = {
    nodeEnv,
    port: readInt("PORT", 3000, { min: 1, max: 65535 }),
    databaseUrl: readString("DATABASE_URL", LOCAL_DATABASE_URL),
    log: {
      level: readLogLevel(nodeEnv),
    },
    jwt: {
      secret: readString("JWT_SECRET", LOCAL_JWT_SECRET),
      issuer: readString("JWT_ISSUER", "reservation-system"),
      audience: readString("JWT_AUDIENCE", "reservation-system-client"),
      expiresInSeconds: readInt("JWT_EXPIRES_IN_SECONDS", 3600, { min: 60 }),
    },
    pg: {
      poolMax: readInt("PG_POOL_MAX", 10, { min: 1 }),
      connectionTimeoutMs: readInt("PG_CONNECTION_TIMEOUT_MS", 1000, {
        min: 1,
      }),
      statementTimeoutMs: readInt("PG_STATEMENT_TIMEOUT_MS", 3000, {
        min: 1,
      }),
      idleInTxTimeoutMs: readInt("PG_IDLE_IN_TX_TIMEOUT_MS", 4000, {
        min: 1,
      }),
      transactionTimeoutMs: readInt("PG_TRANSACTION_TIMEOUT_MS", 5000, {
        min: 1,
      }),
      lockTimeoutBaselineMs: 0,
      idempotencyLockTimeoutMs: readInt("PG_IDEMPOTENCY_LOCK_TIMEOUT_MS", 300, {
        min: 1,
      }),
      seatLockTimeoutMs: readInt("PG_SEAT_LOCK_TIMEOUT_MS", 500, { min: 1 }),
    },
    reservation: {
      maxSeats: readInt("RESERVATION_MAX_SEATS", 8, { min: 1 }),
      txRetryAttempts: readInt("RESERVATION_TX_RETRY_ATTEMPTS", 2, { min: 0 }),
    },
  };

  if (config.pg.idempotencyLockTimeoutMs >= config.pg.statementTimeoutMs) {
    throw new Error(
      "PG_IDEMPOTENCY_LOCK_TIMEOUT_MS must be less than PG_STATEMENT_TIMEOUT_MS",
    );
  }
  if (config.pg.seatLockTimeoutMs >= config.pg.statementTimeoutMs) {
    throw new Error(
      "PG_SEAT_LOCK_TIMEOUT_MS must be less than PG_STATEMENT_TIMEOUT_MS",
    );
  }
  if (config.pg.idleInTxTimeoutMs >= config.pg.transactionTimeoutMs) {
    throw new Error(
      "PG_IDLE_IN_TX_TIMEOUT_MS must be less than PG_TRANSACTION_TIMEOUT_MS",
    );
  }
  if (nodeEnv === "production") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when NODE_ENV=production");
    }
    if (config.databaseUrl === LOCAL_DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must not use the local default in production",
      );
    }
    if (config.jwt.secret === LOCAL_JWT_SECRET) {
      throw new Error(
        "JWT_SECRET must not use the local default in production",
      );
    }
  }

  return config;
};

export const APP_CONFIG = Symbol("APP_CONFIG");
