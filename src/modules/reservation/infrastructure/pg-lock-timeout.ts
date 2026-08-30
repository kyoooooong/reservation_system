import { Injectable } from "@nestjs/common";
import { unwrapTx } from "../../../infrastructure/db/transaction";
import { LockTimeoutPort } from "../ports/lock-timeout.port";
import { TxContext } from "../ports/transaction-manager.port";

@Injectable()
export class PgLockTimeout implements LockTimeoutPort {
  async setLocal(tx: TxContext, timeoutMs: number): Promise<void> {
    await unwrapTx(tx).query("SELECT set_config($1, $2, true)", [
      "lock_timeout",
      `${timeoutMs}ms`,
    ]);
  }
}
