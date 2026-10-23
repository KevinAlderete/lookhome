import { IsDateString, IsEnum, IsUUID } from "class-validator";

export enum CalendarBlockReasonDto {
  MAINTENANCE = "maintenance",
  OWNER_BLOCK = "owner_block",
  BOOKED = "booked",
  OTHER = "other",
}

export class CreateCalendarBlockDto {
  @IsUUID("4", { message: "roomId debe ser UUID válido." })
  roomId!: string;

  @IsDateString({}, { message: "startDate debe ser fecha válida." })
  startDate!: string;

  @IsDateString({}, { message: "endDate debe ser fecha válida." })
  endDate!: string;

  @IsEnum(CalendarBlockReasonDto, {
    message: "reason tiene un valor inválido.",
  })
  reason!: CalendarBlockReasonDto;
}
