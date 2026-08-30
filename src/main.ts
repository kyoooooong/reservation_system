import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { APP_CONFIG, AppConfig } from "./common/config/app-config";
import { API_PREFIX } from "./common/config/api-config";
import {
  APP_LOGGER,
  AppLogger,
  createBootstrapLogger,
} from "./common/logging/app-logger";
import { configureApp } from "./app-bootstrap";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  let app: INestApplication | undefined;
  try {
    app = await NestFactory.create(AppModule, { logger: false });
    const config = app.get<AppConfig>(APP_CONFIG);
    const logger = app.get<AppLogger>(APP_LOGGER);

    configureApp(app);
    await app.listen(config.port);
    logger.info(
      {
        event: "application.started",
        port: config.port,
        apiPrefix: API_PREFIX,
      },
      "application started",
    );
  } catch (error) {
    await app?.close();
    throw error;
  }
}

bootstrap().catch((error) => {
  createBootstrapLogger().error(
    { err: error, event: "application.start.failed" },
    "application failed to start",
  );
  process.exitCode = 1;
});
