import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { APP_LOGGER, AppLogger } from "../../common/logging/app-logger";
import {
  getOrCreateTraceId,
  getRequestUserId,
  getRouteLabel,
} from "../../common/http/request-context";
import { MetricsService } from "./metrics.service";

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    private readonly metrics: MetricsService,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const originalPath = (request.originalUrl ?? request.url).split("?")[0];
    if (originalPath === "/metrics") {
      next();
      return;
    }

    const start = process.hrtime.bigint();
    let finished = false;
    response.once("finish", () => {
      finished = true;
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;
      this.metrics.observeHttpRequest({
        method: request.method,
        route: getRouteLabel(request),
        statusCode: response.statusCode,
        durationSeconds,
      });
      this.logCompletedRequest(request, response, durationSeconds);
    });
    response.once("close", () => {
      if (finished) {
        return;
      }
      this.logger.warn(
        {
          event: "http.request.aborted",
          traceId: getOrCreateTraceId(request),
          method: request.method,
          route: getRouteLabel(request),
          durationMs: elapsedMilliseconds(start),
          userId: getRequestUserId(request),
        },
        "http request aborted before a response was sent",
      );
    });
    next();
  }

  private logCompletedRequest(
    request: Request,
    response: Response,
    durationSeconds: number,
  ): void {
    const route = getRouteLabel(request);
    if (route === "/healthz" || route === "/readyz") {
      return;
    }

    const logMethod =
      response.statusCode >= 500
        ? "error"
        : response.statusCode >= 400
          ? "warn"
          : "info";
    this.logger[logMethod](
      {
        event: "http.request.completed",
        traceId: getOrCreateTraceId(request),
        method: request.method,
        route,
        statusCode: response.statusCode,
        durationMs: Number((durationSeconds * 1000).toFixed(3)),
        userId: getRequestUserId(request),
      },
      "http request completed",
    );
  }
}

const elapsedMilliseconds = (startedAt: bigint): number =>
  Number((Number(process.hrtime.bigint() - startedAt) / 1_000_000).toFixed(3));
