import { Inject, Injectable } from "@nestjs/common";
import { Pool, PoolClient } from "pg";
import { PG_POOL } from "./tokens";
import {
  TxContext,
  TransactionManagerPort,
} from "../../modules/reservation/ports/transaction-manager.port";

export type PgTxContext = TxContext & {
  readonly client: PoolClient;
};

export const toTxContext = (client: PoolClient): TxContext =>
  ({ client }) as PgTxContext;

export const unwrapTx = (tx: TxContext): PoolClient =>
  (tx as PgTxContext).client;

@Injectable()
export class PgTransactionManager implements TransactionManagerPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async readCommitted<T>(fn: (tx: TxContext) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let destroy = false;
    try {
      await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
      const result = await fn(toTxContext(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        destroy = true;
      }
      if (isSessionTerminatingError(error)) {
        destroy = true;
      }
      throw error;
    } finally {
      client.release(destroy);
    }
  }
}

const isSessionTerminatingError = (error: unknown): boolean => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "";
  return code === "25P03" || code === "25P04" || code === "57P01";
};
