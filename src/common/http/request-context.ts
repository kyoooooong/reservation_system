import { randomUUID } from "node:crypto";
import type { Request } from "express";

export const REQUEST_ID_HEADER = "x-request-id";
export const REQUEST_ID_RESPONSE_HEADER = "X-Request-Id";

export type RequestWithContext = Request & {
  traceId?: string;
};

type RequestWithRoute = Request & {
  route?: {
    path?: string | string[];
  };
};

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export const getOrCreateTraceId = (request: Request): string => {
  const contextualRequest = request as RequestWithContext;
  if (contextualRequest.traceId) {
    return contextualRequest.traceId;
  }

  const requestedId = request.headers[REQUEST_ID_HEADER];
  const traceId =
    typeof requestedId === "string" && REQUEST_ID_PATTERN.test(requestedId)
      ? requestedId
      : randomUUID();
  contextualRequest.traceId = traceId;
  return traceId;
};

export const getRouteLabel = (request: Request): string => {
  const routePath = (request as RequestWithRoute).route?.path;
  const path = Array.isArray(routePath)
    ? routePath[0]
    : (routePath ?? request.path ?? request.url.split("?")[0] ?? "unknown");
  return path
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi,
      "/:uuid",
    )
    .replace(/\/\d+(?=\/|$)/g, "/:id");
};

export const getRequestUserId = (request: Request): number | undefined => {
  const user = (request as Request & { user?: { id?: unknown } }).user;
  return typeof user?.id === "number" ? user.id : undefined;
};
