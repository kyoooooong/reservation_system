export type ApiErrorPayload = {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
} & Record<string, unknown>;

export class ApiSuccessResponseDto<T> {
  readonly success = true;

  constructor(readonly data: T) {}
}

export class ApiFailureResponseDto {
  readonly success = false;

  constructor(
    readonly error: ApiErrorPayload,
    readonly traceId: string,
  ) {}
}

export type ApiResponseDto<T> =
  ApiSuccessResponseDto<T> | ApiFailureResponseDto;
