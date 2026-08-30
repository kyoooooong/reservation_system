import { Inject, Injectable } from "@nestjs/common";
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from "@prometheus-io/client";
import { Pool } from "pg";
import { PG_POOL } from "../../infrastructure/db/tokens";

type HttpMetricLabels = "method" | "route" | "status_code";

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter<HttpMetricLabels>({
    name: "http_requests_total",
    help: "Total HTTP requests handled by the API.",
    labelNames: ["method", "route", "status_code"],
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram<HttpMetricLabels>({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  constructor(@Inject(PG_POOL) pool: Pool) {
    collectDefaultMetrics({
      register: this.registry,
      prefix: "reservation_",
      labels: { service: "reservation_api" },
    });

    new Gauge({
      name: "pg_pool_total_connections",
      help: "Total clients currently managed by the PostgreSQL pool.",
      registers: [this.registry],
      collect() {
        this.set(pool.totalCount);
      },
    });
    new Gauge({
      name: "pg_pool_idle_connections",
      help: "Idle clients currently available in the PostgreSQL pool.",
      registers: [this.registry],
      collect() {
        this.set(pool.idleCount);
      },
    });
    new Gauge({
      name: "pg_pool_waiting_clients",
      help: "Requests waiting for a PostgreSQL pool client.",
      registers: [this.registry],
      collect() {
        this.set(pool.waitingCount);
      },
    });
  }

  observeHttpRequest(input: {
    method: string;
    route: string;
    statusCode: number;
    durationSeconds: number;
  }): void {
    const labels = {
      method: input.method,
      route: input.route,
      status_code: String(input.statusCode),
    };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, input.durationSeconds);
  }

  contentType(): string {
    return this.registry.contentType;
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
