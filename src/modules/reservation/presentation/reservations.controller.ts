import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { API_PREFIX } from "../../../common/config/api-config";
import { CurrentUser } from "../../../common/http/current-user.decorator";
import { ParsePositiveIntPipe } from "../../../common/http/parse-positive-int.pipe";
import { validationFailed } from "../../../common/errors/app-error";
import { idempotencyKeyRequired } from "../domain/reservation-errors";
import { GetReservationsUseCase } from "../application/get-reservations.use-case";
import { ReserveSeatsUseCase } from "../application/reserve-seats.use-case";
import { CreateReservationDto } from "./dto/create-reservation.dto";

@Controller()
export class ReservationsController {
  constructor(
    private readonly reserveSeats: ReserveSeatsUseCase,
    private readonly getReservations: GetReservationsUseCase,
  ) {}

  @Post("screenings/:screeningId/reservations")
  async create(
    @CurrentUser() user: CurrentUser,
    @Param("screeningId", ParsePositiveIntPipe) screeningId: number,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: CreateReservationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const key = this.normalizeIdempotencyKey(idempotencyKey);
    const reservation = await this.reserveSeats.execute({
      userId: user.id,
      screeningId,
      seatIds: body.seatIds,
      idempotencyKey: key,
    });
    response
      .status(201)
      .location(`/${API_PREFIX}/reservations/${reservation.reservationId}`);
    return reservation;
  }

  @Get("reservations")
  async list(
    @CurrentUser() user: CurrentUser,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.getReservations.list({
      userId: user.id,
      limit: this.parseLimit(limit),
      cursor,
    });
  }

  @Get("reservations/:publicId")
  async detail(
    @CurrentUser() user: CurrentUser,
    @Param("publicId") publicId: string,
  ) {
    return this.getReservations.detail(user.id, publicId);
  }

  private normalizeIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key || key.length > 255) {
      throw idempotencyKeyRequired();
    }
    return key;
  }

  private parseLimit(value: string | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (!/^[1-9]\d*$/.test(value)) {
      throw validationFailed("limit must be a positive integer.");
    }
    return Number(value);
  }
}
