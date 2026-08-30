import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { AuthService } from "./application/auth.service";
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher";
import { JwtAuthGuard } from "./infrastructure/jwt-auth.guard";
import { JwtTokenIssuer } from "./infrastructure/jwt-token-issuer";
import { UserRepository } from "./infrastructure/user.repository";
import { AuthController } from "./presentation/auth.controller";
import { PASSWORD_HASHER } from "./ports/password-hasher.port";
import { TOKEN_ISSUER } from "./ports/token-issuer.port";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    JwtAuthGuard,
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: TOKEN_ISSUER, useClass: JwtTokenIssuer },
  ],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
