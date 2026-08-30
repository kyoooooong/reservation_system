import { Global, Module } from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../config/app-config";
import { APP_LOGGER, createAppLogger } from "./app-logger";

@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createAppLogger(config),
    },
  ],
  exports: [APP_LOGGER],
})
export class LoggingModule {}
