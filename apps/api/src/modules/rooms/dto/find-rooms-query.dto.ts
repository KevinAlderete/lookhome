import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
} from "class-validator";
import { BathroomTypeDto, RoomTypeDto } from "./create-room.dto";

export class FindRoomsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page debe ser entero." })
  @Min(1, { message: "page debe ser mayor o igual a 1." })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize debe ser entero." })
  @Min(1, { message: "pageSize debe ser mayor o igual a 1." })
  pageSize?: number;

  @IsOptional()
  @IsUUID("4", { message: "listingId debe ser un UUID válido." })
  listingId?: string;

  @IsOptional()
  @IsEnum(RoomTypeDto, {
    message: "roomType tiene un valor inválido.",
  })
  roomType?: RoomTypeDto;

  @IsOptional()
  @IsEnum(BathroomTypeDto, {
    message: "bathroomType tiene un valor inválido.",
  })
  bathroomType?: BathroomTypeDto;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "minPrice debe ser mayor a 0." })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "maxPrice debe ser mayor a 0." })
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  q?: string;
}
