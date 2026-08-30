import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppConfigModule } from "./common/config/app-config.module";
import { LoggingModule } from "./common/logging/logging.module";
import { PostgresModule } from "./infrastructure/db/postgres.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { HealthModule } from "./modules/health/health.module";
import { ObservabilityModule } from "./modules/observability/observability.module";
import { ReservationModule } from "./modules/reservation/reservation.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppConfigModule,
    LoggingModule,
    PostgresModule,
    AuthModule,
    CatalogModule,
    ReservationModule,
    HealthModule,
    ObservabilityModule,
  ],
})
export class AppModule {}
