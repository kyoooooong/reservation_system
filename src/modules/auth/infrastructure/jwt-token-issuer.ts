import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { APP_CONFIG, AppConfig } from "../../../common/config/app-config";
import { TokenIssuerPort } from "../ports/token-issuer.port";

@Injectable()
export class JwtTokenIssuer implements TokenIssuerPort {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
  ) {}

  async issue(input: { userId: number; email: string }): Promise<string> {
    return this.jwt.signAsync(
      { email: input.email },
      {
        subject: String(input.userId),
        secret: this.config.jwt.secret,
        issuer: this.config.jwt.issuer,
        audience: this.config.jwt.audience,
        expiresIn: this.config.jwt.expiresInSeconds,
        algorithm: "HS256",
      },
    );
  }
}
