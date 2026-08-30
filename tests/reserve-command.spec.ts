import { describe, expect, it } from "vitest";
import { ReserveCommand } from "../src/modules/reservation/domain/reserve-command";

describe("ReserveCommand", () => {
  it("canonicalizes seat order before fingerprinting", () => {
    const left = ReserveCommand.create(10, [3, 1, 2], 8);
    const right = ReserveCommand.create(10, [1, 2, 3], 8);

    expect(left.seatIds).toEqual([1, 2, 3]);
    expect(left.fingerprint()).toBe(right.fingerprint());
  });

  it("keeps screening id inside the fingerprint", () => {
    const left = ReserveCommand.create(10, [1, 2], 8);
    const right = ReserveCommand.create(11, [1, 2], 8);

    expect(left.fingerprint()).not.toBe(right.fingerprint());
  });

  it("treats empty, duplicate, and oversized seat selections as domain errors", () => {
    expect(() => ReserveCommand.create(10, [], 8)).toThrow(
      "At least one seat must be selected.",
    );
    expect(() => ReserveCommand.create(10, [0], 8)).toThrow(
      "seatIds must contain only positive integers.",
    );
    expect(() => ReserveCommand.create(10, [1, 1], 8)).toThrow(
      "Seat ids must not be duplicated.",
    );
    expect(() => ReserveCommand.create(10, [1, 2, 3], 2)).toThrow(
      "A reservation can include at most 2 seats.",
    );
  });

  it("rejects invalid screening ids before repository calls", () => {
    expect(() => ReserveCommand.create(0, [1], 8)).toThrow(
      "screeningId must be a positive integer.",
    );
  });
});
