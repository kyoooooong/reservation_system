import { Global, Inject, Module, OnApplicationShutdown } from "@nestjs/common";
import { Pool, PoolConfig } from "pg";
import { APP_CONFIG, AppConfig } from "../../common/config/app-config";
import { APP_LOGGER, AppLogger } from "../../common/logging/app-logger";
import { PG_POOL } from "./tokens";

class PostgresShutdown implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [APP_CONFIG, APP_LOGGER],
      useFactory: async (
        config: AppConfig,
        logger: AppLogger,
      ): Promise<Pool> => {
        const poolConfig: PoolConfig & {
          onConnect?: (client: {
            query: (text: string, values?: unknown[]) => Promise<unknown>;
          }) => Promise<void>;
        } = {
          connectionString: config.databaseUrl,
          max: config.pg.poolMax,
          connectionTimeoutMillis: config.pg.connectionTimeoutMs,
          statement_timeout: config.pg.statementTimeoutMs,
          idle_in_transaction_session_timeout: config.pg.idleInTxTimeoutMs,
          application_name: "movie-booking-api",
          onConnect: async (client) => {
            await client.query("SELECT set_config($1, $2, false)", [
              "transaction_timeout",
              `${config.pg.transactionTimeoutMs}ms`,
            ]);
          },
        };
        const pool = new Pool(poolConfig);
        pool.on("error", (error) => {
          logger.error(
            { err: error, event: "postgres.pool.error" },
            "postgres pool error",
          );
        });

        const check = await pool.query<{ transaction_timeout: string }>(
          "SHOW transaction_timeout",
        );
        if (check.rows[0]?.transaction_timeout === "0") {
          throw new Error("transaction_timeout policy not applied");
        }

        logger.info(
          {
            event: "postgres.pool.ready",
            poolMax: config.pg.poolMax,
            statementTimeoutMs: config.pg.statementTimeoutMs,
            transactionTimeoutMs: config.pg.transactionTimeoutMs,
          },
          "postgres pool configured",
        );

        return pool;
      },
    },
    PostgresShutdown,
  ],
  exports: [PG_POOL],
})
export class PostgresModule {}
