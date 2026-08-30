import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { PublicRoute } from "../../common/http/public-route.decorator";
import { MetricsService } from "./metrics.service";

@PublicRoute()
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async scrape(@Res({ passthrough: true }) response: Response) {
    response.type(this.metricsService.contentType());
    return this.metricsService.metrics();
  }
}
