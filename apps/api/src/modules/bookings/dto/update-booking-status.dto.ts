import { IsEnum } from "class-validator";

export enum BookingStatusDto {
  REQUESTED = "requested",
  ACCEPTED = "accepted",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
  ACTIVE = "active",
  COMPLETED = "completed",
  DISPUTED = "disputed",
}

export class UpdateBookingStatusDto {
  @IsEnum(BookingStatusDto, {
    message: "status tiene un valor inválido.",
  })
  status!: BookingStatusDto;
}
