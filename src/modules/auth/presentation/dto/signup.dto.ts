import { Transform } from "class-transformer";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class SignupDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;
}
