import { Type } from "class-transformer";
import {
  IsBoolean,
  Equals,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsInt,
  Min,
} from "class-validator";

export enum BillingPeriodDto {
  MONTHLY = "monthly",
  WEEKLY = "weekly",
  DAILY = "daily",
}

export enum RentalModeDto {
  NIGHTLY = "nightly",
  MONTHLY = "monthly",
}

export class CreateRoomPricingDto {
  @Equals("PEN", { message: "La moneda disponible es PEN." })
  currencyCode!: "PEN";

  @Type(() => Number)
  @IsNumber({}, { message: "rentAmount debe ser numérico." })
  @Min(0.01, { message: "rentAmount debe ser mayor a 0." })
  rentAmount!: number;

  @IsOptional()
  @IsEnum(BillingPeriodDto, {
    message: "billingPeriod tiene un valor inválido.",
  })
  billingPeriod?: BillingPeriodDto;

  @IsOptional()
  @IsEnum(RentalModeDto)
  rentalMode?: RentalModeDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minStayNights?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxStayNights?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minTermMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxTermMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "depositAmount debe ser numérico." })
  @Min(0, { message: "depositAmount no puede ser negativo." })
  depositAmount?: number;

  @IsOptional()
  @IsBoolean()
  utilitiesIncluded?: boolean;

  @IsOptional()
  @IsObject()
  utilitiesDetail?: Record<string, any>;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "cleaningFee debe ser numérico." })
  @Min(0, { message: "cleaningFee no puede ser negativo." })
  cleaningFee?: number;
}
