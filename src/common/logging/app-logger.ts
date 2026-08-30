import pino, { Logger } from "pino";
import { AppConfig } from "../config/app-config";

export const APP_LOGGER = Symbol("APP_LOGGER");

export type AppLogger = Logger;

const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "body.password",
  "body.accessToken",
  "body.refreshToken",
  "authorization",
  "password",
  "accessToken",
  "refreshToken",
];

export const createAppLogger = (config: AppConfig): AppLogger =>
  pino({
    level: config.log.level,
    base: {
      service: "reservation-api",
      environment: config.nodeEnv,
    },
    redact: {
      paths: REDACT_PATHS,
      remove: true,
    },
  });

export const createBootstrapLogger = (): AppLogger =>
  pino({
    level: process.env.NODE_ENV === "test" ? "silent" : "info",
    base: {
      service: "reservation-api",
      environment: process.env.NODE_ENV ?? "development",
    },
    redact: {
      paths: REDACT_PATHS,
      remove: true,
    },
  });
