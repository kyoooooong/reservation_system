import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { APP_CONFIG, AppConfig } from "../../../common/config/app-config";
import { unauthenticated } from "../../../common/errors/app-error";
import { PUBLIC_ROUTE_KEY } from "../../../common/http/public-route.decorator";

type JwtPayload = {
  sub?: string;
};

type AuthenticatedRequest = Request & {
  user?: {
    id: number;
  };
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      PUBLIC_ROUTE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw unauthenticated();
    }

    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.jwt.secret,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        algorithms: ["HS256"],
      });
      const userId = Number(payload.sub);
      if (!Number.isInteger(userId) || userId <= 0) {
        throw unauthenticated();
      }
      request.user = { id: userId };
      return true;
    } catch {
      throw unauthenticated();
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) {
      return undefined;
    }
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match?.[1]) {
      return undefined;
    }
    return match[1];
  }
}
