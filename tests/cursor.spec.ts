import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
} from "../src/modules/reservation/application/cursor";

describe("reservation cursor", () => {
  it("round-trips the stable ordering keys", () => {
    const cursor = {
      reservedAt: "2030-08-27T01:00:00.000Z",
      id: "42",
    };

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects malformed cursors instead of trusting base64 input", () => {
    expect(() => decodeCursor("not-a-json-cursor")).toThrow(
      "cursor is invalid.",
    );
  });
});
