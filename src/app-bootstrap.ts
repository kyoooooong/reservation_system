import { INestApplication, ValidationPipe } from "@nestjs/common";
import { API_PREFIX } from "./common/config/api-config";
import { configureSwagger } from "./common/config/swagger-config";
import { validationFailed } from "./common/errors/app-error";
import { ProblemDetailsFilter } from "./common/errors/problem-details.filter";
import { ApiResponseInterceptor } from "./common/http/api-response.interceptor";
import { APP_LOGGER, AppLogger } from "./common/logging/app-logger";

export const configureApp = (app: INestApplication): void => {
  const logger = app.get<AppLogger>(APP_LOGGER);

  app.setGlobalPrefix(API_PREFIX, {
    exclude: ["healthz", "readyz", "metrics"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: () => validationFailed(),
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter(logger));
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.enableShutdownHooks();

  configureSwagger(app);
};
