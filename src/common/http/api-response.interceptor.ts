import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import { Observable, map } from "rxjs";
import { API_PREFIX } from "../config/api-config";
import { ApiSuccessResponseDto } from "./api-response.dto";

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    if (!shouldWrap(request)) {
      return next.handle();
    }
    return next.handle().pipe(map((data) => new ApiSuccessResponseDto(data)));
  }
}

const shouldWrap = (request: Request): boolean => {
  const path = request.path || request.url.split("?")[0] || "";
  return path.startsWith(`/${API_PREFIX}/`);
};
