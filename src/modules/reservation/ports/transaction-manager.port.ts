declare const txContextBrand: unique symbol;

export type TxContext = {
  readonly [txContextBrand]: "TxContext";
};

export interface TransactionManagerPort {
  readCommitted<T>(fn: (tx: TxContext) => Promise<T>): Promise<T>;
}

export const TRANSACTION_MANAGER = Symbol("TRANSACTION_MANAGER");
