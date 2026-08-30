import { TxContext } from "./transaction-manager.port";

export interface LockTimeoutPort {
  setLocal(tx: TxContext, timeoutMs: number): Promise<void>;
}

export const LOCK_TIMEOUT = Symbol("LOCK_TIMEOUT");
