import { Body, Controller, Post } from "@nestjs/common";
import { PublicRoute } from "../../../common/http/public-route.decorator";
import { AuthService } from "../application/auth.service";
import { LoginDto } from "./dto/login.dto";
import { SignupDto } from "./dto/signup.dto";

@PublicRoute()
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("signup")
  signup(@Body() body: SignupDto) {
    return this.auth.signup(body);
  }

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }
}
