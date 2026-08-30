import { Inject, Injectable } from "@nestjs/common";
import { APP_LOGGER, AppLogger } from "../../../common/logging/app-logger";
import { invalidCredentials } from "../domain/auth-errors";
import { UserRepository } from "../infrastructure/user.repository";
import {
  PASSWORD_HASHER,
  PasswordHasherPort,
} from "../ports/password-hasher.port";
import { TOKEN_ISSUER, TokenIssuerPort } from "../ports/token-issuer.port";

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly passwordHasher: PasswordHasherPort,
    @Inject(TOKEN_ISSUER) private readonly tokenIssuer: TokenIssuerPort,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  async signup(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{
    accessToken: string;
    user: { id: number; email: string; name: string };
  }> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.users.create({
      email: input.email,
      passwordHash,
      name: input.name,
    });
    const accessToken = await this.tokenIssuer.issue({
      userId: user.id,
      email: user.email,
    });
    this.logger.info(
      { event: "auth.signup.succeeded", userId: user.id },
      "user signed up",
    );
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  async login(input: { email: string; password: string }): Promise<{
    accessToken: string;
    user: { id: number; email: string; name: string };
  }> {
    const user = await this.users.findByEmail(input.email);
    if (!user) {
      await this.passwordHasher.verifyDummy(input.password);
      throw invalidCredentials();
    }

    const matches = await this.passwordHasher.verify(
      user.passwordHash,
      input.password,
    );
    if (!matches) {
      throw invalidCredentials();
    }

    const accessToken = await this.tokenIssuer.issue({
      userId: user.id,
      email: user.email,
    });
    this.logger.info(
      { event: "auth.login.succeeded", userId: user.id },
      "user logged in",
    );
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }
}
