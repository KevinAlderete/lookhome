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
import { PropertyTypeDto } from "./create-listing.dto";

export class FindListingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page debe ser un número entero." })
  @Min(1, { message: "page debe ser mayor o igual a 1." })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize debe ser un número entero." })
  @Min(1, { message: "pageSize debe ser mayor o igual a 1." })
  pageSize?: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  q?: string;

  @IsOptional()
  @IsUUID("4", { message: "cityId debe ser un UUID válido." })
  cityId?: string;

  @IsOptional()
  @IsUUID("4", { message: "districtId debe ser un UUID válido." })
  districtId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "minPrice debe ser mayor que 0." })
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: "maxPrice debe ser mayor que 0." })
  maxPrice?: number;

  @IsOptional()
  @IsEnum(PropertyTypeDto, {
    message: "propertyType tiene un valor inválido.",
  })
  propertyType?: PropertyTypeDto;
}
