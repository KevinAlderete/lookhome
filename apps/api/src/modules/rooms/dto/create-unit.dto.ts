import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateRoomPricingDto } from "./create-room-pricing.dto";
import { RentalUnitTypeDto } from "./create-room.dto";

export class CreateUnitDto {
  @IsUUID("4")
  listingId!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RentalUnitTypeDto)
  unitType!: RentalUnitTypeDto;

  @IsOptional()
  @IsBoolean()
  isFurnished?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxGuests!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  beds!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ValidateNested()
  @IsDefined()
  @Type(() => CreateRoomPricingDto)
  pricing!: CreateRoomPricingDto;

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
  @IsArray()
  @IsUUID("4", { each: true })
  amenityIds?: string[];

  @IsOptional()
  @IsString()
  houseRules?: string;

  @IsOptional()
  @IsBoolean()
  petsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  smokingAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  partiesAllowed?: boolean;
}
