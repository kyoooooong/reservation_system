import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

export type CurrentUser = {
  id: number;
};

type AuthenticatedRequest = Request & {
  user?: CurrentUser;
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUser => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) {
      throw new Error(
        "CurrentUser decorator used without authenticated request",
      );
    }
    return request.user;
  },
);
