import { Controller, Get, Inject } from "@nestjs/common";
import { Pool } from "pg";
import { PublicRoute } from "../../common/http/public-route.decorator";
import { PG_POOL } from "../../infrastructure/db/tokens";

@PublicRoute()
@Controller()
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get("healthz")
  healthz() {
    return { status: "ok" };
  }

  @Get("readyz")
  async readyz() {
    await this.pool.query("SELECT 1");
    return { status: "ready" };
  }
}
