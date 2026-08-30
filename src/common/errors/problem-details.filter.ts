import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { APP_LOGGER, AppLogger } from "../logging/app-logger";
import { ApiFailureResponseDto } from "../http/api-response.dto";
import {
  REQUEST_ID_RESPONSE_HEADER,
  getOrCreateTraceId,
  getRouteLabel,
} from "../http/request-context";
import { AppError, internalError } from "./app-error";

const toProblemType = (code: string): string =>
  `https://api.reservation-system.local/problems/${code.toLowerCase().replaceAll("_", "-")}`;

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const error = this.toAppError(exception);
    const traceId = getOrCreateTraceId(request);
    response.setHeader(REQUEST_ID_RESPONSE_HEADER, traceId);

    if (error.status >= 500) {
      const logMethod = error.extra?.retryable ? "warn" : "error";
      this.logger[logMethod](logContext(exception, error, traceId, request));
    }

    if (error.retryAfterSeconds !== undefined) {
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
    }

    response
      .status(error.status)
      .type("application/json")
      .json(
        new ApiFailureResponseDto(
          {
            type: toProblemType(error.code),
            title: error.title,
            status: error.status,
            code: error.code,
            detail: error.detail,
            ...(error.extra ?? {}),
          },
          traceId,
        ),
      );
  }

  private toAppError(exception: unknown): AppError {
    if (exception instanceof AppError) {
      return exception;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return new AppError({
        status,
        code: toHttpErrorCode(status),
        title: exception.name,
        detail: exception.message,
      });
    }

    return internalError();
  }
}

const toHttpErrorCode = (status: number): string => {
  if (status === HttpStatus.UNAUTHORIZED) {
    return "UNAUTHENTICATED";
  }
  if (status === HttpStatus.FORBIDDEN) {
    return "FORBIDDEN";
  }
  return "HTTP_ERROR";
};

const logContext = (
  exception: unknown,
  error: AppError,
  traceId: string,
  request: Request,
) => ({
  err: exception,
  event: "http.request.failed",
  traceId,
  route: getRouteLabel(request),
  method: request.method,
  statusCode: error.status,
  code: error.code,
  retryable: error.extra?.retryable === true,
});
