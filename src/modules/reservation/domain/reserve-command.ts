import { createHash } from "node:crypto";
import { AppError } from "../../../common/errors/app-error";

export class ReserveCommand {
  private constructor(
    readonly screeningId: number,
    readonly seatIds: number[],
  ) {}

  static create(
    screeningId: number,
    rawSeatIds: number[],
    maxSeats: number,
  ): ReserveCommand {
    if (!Number.isSafeInteger(screeningId) || screeningId <= 0) {
      throw new AppError({
        status: 422,
        code: "INVALID_SCREENING_ID",
        title: "Invalid screening id",
        detail: "screeningId must be a positive integer.",
      });
    }

    if (rawSeatIds.length === 0) {
      throw new AppError({
        status: 422,
        code: "EMPTY_SEAT_SELECTION",
        title: "Empty seat selection",
        detail: "At least one seat must be selected.",
      });
    }

    if (
      rawSeatIds.some((seatId) => !Number.isSafeInteger(seatId) || seatId <= 0)
    ) {
      throw new AppError({
        status: 422,
        code: "INVALID_SEAT_ID",
        title: "Invalid seat id",
        detail: "seatIds must contain only positive integers.",
      });
    }

    if (new Set(rawSeatIds).size !== rawSeatIds.length) {
      throw new AppError({
        status: 422,
        code: "DUPLICATE_SEAT_IDS",
        title: "Duplicate seat ids",
        detail: "Seat ids must not be duplicated.",
      });
    }

    if (rawSeatIds.length > maxSeats) {
      throw new AppError({
        status: 422,
        code: "TOO_MANY_SEATS",
        title: "Too many seats",
        detail: `A reservation can include at most ${maxSeats} seats.`,
      });
    }

    return new ReserveCommand(
      screeningId,
      [...rawSeatIds].sort((left, right) => left - right),
    );
  }

  fingerprint(): string {
    const canonical = JSON.stringify({
      screeningId: this.screeningId,
      seatIds: this.seatIds,
    });
    return createHash("sha256").update(canonical).digest("hex");
  }
}
