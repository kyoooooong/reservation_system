import { Buffer } from "node:buffer";
import { AppError } from "../../../common/errors/app-error";
import { ReservationCursor } from "../ports/reservation-repository.port";

type CursorV1 = {
  v: 1;
  t: string;
  id: string;
};

export const encodeCursor = (cursor: ReservationCursor): string =>
  Buffer.from(
    JSON.stringify({
      v: 1,
      t: cursor.reservedAt,
      id: cursor.id,
    } satisfies CursorV1),
  ).toString("base64url");

export const decodeCursor = (raw?: string): ReservationCursor | undefined => {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as Partial<CursorV1>;
    if (
      parsed.v !== 1 ||
      typeof parsed.t !== "string" ||
      typeof parsed.id !== "string"
    ) {
      throw new Error("Invalid cursor shape");
    }
    if (Number.isNaN(Date.parse(parsed.t)) || !/^\d+$/.test(parsed.id)) {
      throw new Error("Invalid cursor value");
    }
    return {
      reservedAt: parsed.t,
      id: parsed.id,
    };
  } catch {
    throw new AppError({
      status: 400,
      code: "VALIDATION_FAILED",
      title: "Validation failed",
      detail: "cursor is invalid.",
    });
  }
};
