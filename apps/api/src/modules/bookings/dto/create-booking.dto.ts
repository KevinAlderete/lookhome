import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from "class-validator";

export class CreateBookingDto {
  @IsUUID("4", { message: "roomId debe ser UUID válido." })
  roomId!: string;

  @IsDateString({}, { message: "startDate debe ser fecha válida." })
  startDate!: string;

  @IsOptional()
  @IsDateString({}, { message: "endDate debe ser fecha válida." })
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  termMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guestCount?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  message?: string;
}
