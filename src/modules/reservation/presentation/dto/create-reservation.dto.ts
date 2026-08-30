import { IsArray, IsInt } from "class-validator";

export class CreateReservationDto {
  @IsArray()
  @IsInt({ each: true })
  seatIds!: number[];
}
