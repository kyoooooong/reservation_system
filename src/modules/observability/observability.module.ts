import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from "@nestjs/common";
import { RequestContextMiddleware } from "../../common/http/request-context.middleware";
import { HttpMetricsMiddleware } from "./http-metrics.middleware";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, RequestContextMiddleware, HttpMetricsMiddleware],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestContextMiddleware, HttpMetricsMiddleware)
      .exclude("metrics")
      .forRoutes({ path: "*path", method: RequestMethod.ALL });
  }
}
