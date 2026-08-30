export type ProblemExtra = Record<string, unknown>;

export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly detail?: string;
  readonly extra?: ProblemExtra;
  readonly retryAfterSeconds?: number;

  constructor(input: {
    status: number;
    code: string;
    title: string;
    detail?: string;
    extra?: ProblemExtra;
    retryAfterSeconds?: number;
  }) {
    super(input.detail ?? input.title);
    this.name = input.code;
    this.status = input.status;
    this.code = input.code;
    this.title = input.title;
    this.detail = input.detail;
    this.extra = input.extra;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

export const validationFailed = (
  detail = "Request validation failed",
): AppError =>
  new AppError({
    status: 400,
    code: "VALIDATION_FAILED",
    title: "Validation failed",
    detail,
  });

export const unauthenticated = (): AppError =>
  new AppError({
    status: 401,
    code: "UNAUTHENTICATED",
    title: "Unauthenticated",
    detail: "A valid bearer token is required.",
  });

export const internalError = (): AppError =>
  new AppError({
    status: 500,
    code: "INTERNAL_ERROR",
    title: "Internal error",
    detail: "An unexpected error occurred.",
  });
