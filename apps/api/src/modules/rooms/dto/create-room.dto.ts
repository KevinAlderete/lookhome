import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { CreateRoomPricingDto } from "./create-room-pricing.dto";

export enum RoomTypeDto {
  PRIVATE = "private",
  SHARED = "shared",
}

export enum RentalUnitTypeDto {
  ENTIRE_PLACE = "entire_place",
  PRIVATE_ROOM = "private_room",
  SHARED_BED = "shared_bed",
}

export enum BathroomTypeDto {
  PRIVATE = "private",
  SHARED = "shared",
  ENSUITE = "ensuite",
}

export enum BedTypeDto {
  SINGLE = "single",
  DOUBLE = "double",
  BUNK = "bunk",
  QUEEN = "queen",
  KING = "king",
}

export class CreateRoomDto {
  @IsUUID("4", { message: "listingId debe ser un UUID válido." })
  listingId!: string;

  @IsString()
  @IsNotEmpty({ message: "El nombre del cuarto es obligatorio." })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RoomTypeDto, {
    message: "roomType tiene un valor inválido.",
  })
  roomType!: RoomTypeDto;

  @IsOptional()
  @IsEnum(RentalUnitTypeDto)
  unitType?: RentalUnitTypeDto;

  @IsEnum(BathroomTypeDto, {
    message: "bathroomType tiene un valor inválido.",
  })
  bathroomType!: BathroomTypeDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  bedroomCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "floorAreaM2 debe ser numérico." })
  @Min(0.01, { message: "floorAreaM2 debe ser mayor a 0." })
  floorAreaM2?: number;

  @Type(() => Number)
  @IsInt({ message: "maxOccupancy debe ser entero." })
  @Min(1, { message: "maxOccupancy debe ser al menos 1." })
  maxOccupancy!: number;

  @Type(() => Number)
  @IsInt({ message: "bedCount debe ser entero." })
  @Min(1, { message: "bedCount debe ser al menos 1." })
  bedCount!: number;

  @IsOptional()
  @IsEnum(BedTypeDto, {
    message: "bedType tiene un valor inválido.",
  })
  bedType?: BedTypeDto;

  @IsOptional()
  @IsBoolean()
  isFurnished?: boolean;

  @IsOptional()
  @IsString()
  availableFrom?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRoomPricingDto)
  pricing?: CreateRoomPricingDto;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true, message: "Cada amenityId debe ser UUID válido." })
  amenityIds?: string[];
}
