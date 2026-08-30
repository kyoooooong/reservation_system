import { Inject, Injectable } from "@nestjs/common";
import {
  RESERVATION_REPOSITORY,
  ReservationDetail,
  ReservationRepositoryPort,
} from "../ports/reservation-repository.port";
import { reservationNotFound } from "../domain/reservation-errors";
import { decodeCursor, encodeCursor } from "./cursor";

@Injectable()
export class GetReservationsUseCase {
  constructor(
    @Inject(RESERVATION_REPOSITORY)
    private readonly reservations: ReservationRepositoryPort,
  ) {}

  async list(input: {
    userId: number;
    limit?: number;
    cursor?: string;
  }): Promise<{ items: ReservationDetail[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
    const items = await this.reservations.findByUser({
      userId: input.userId,
      limit: limit + 1,
      cursor: decodeCursor(input.cursor),
    });
    const page = items.slice(0, limit);
    const next = items.length > limit ? items[limit - 1] : undefined;

    return {
      items: page.map(({ internalId: _internalId, ...item }) => item),
      nextCursor: next
        ? encodeCursor({
            reservedAt: next.reservedAt,
            id: next.internalId,
          })
        : null,
    };
  }

  async detail(userId: number, publicId: string): Promise<ReservationDetail> {
    const reservation = await this.reservations.findDetailByPublicId(
      userId,
      publicId,
    );
    if (!reservation) {
      throw reservationNotFound();
    }
    return reservation;
  }
}
