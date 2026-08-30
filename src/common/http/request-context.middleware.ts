import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import {
  REQUEST_ID_RESPONSE_HEADER,
  getOrCreateTraceId,
} from "./request-context";

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    response.setHeader(REQUEST_ID_RESPONSE_HEADER, getOrCreateTraceId(request));
    next();
  }
}
