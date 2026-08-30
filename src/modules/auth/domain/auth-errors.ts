import { AppError } from "../../../common/errors/app-error";

export const emailAlreadyExists = (): AppError =>
  new AppError({
    status: 409,
    code: "EMAIL_ALREADY_EXISTS",
    title: "Email already exists",
    detail: "A user with this email already exists.",
  });

export const invalidCredentials = (): AppError =>
  new AppError({
    status: 401,
    code: "INVALID_CREDENTIALS",
    title: "Invalid credentials",
    detail: "Email or password is invalid.",
  });
