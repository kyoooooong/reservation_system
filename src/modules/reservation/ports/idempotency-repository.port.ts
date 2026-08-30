import { TxContext } from "./transaction-manager.port";

export type IdempotencyClaim =
  | { kind: "CLAIMED" }
  | { kind: "EXISTING"; requestHash: string; reservationId: string | null };

export interface IdempotencyRepositoryPort {
  tryClaim(input: {
    tx: TxContext;
    userId: number;
    key: string;
    requestHash: string;
  }): Promise<IdempotencyClaim>;

  link(input: {
    tx: TxContext;
    userId: number;
    key: string;
    reservationId: string;
  }): Promise<number>;
}

export const IDEMPOTENCY_REPOSITORY = Symbol("IDEMPOTENCY_REPOSITORY");
