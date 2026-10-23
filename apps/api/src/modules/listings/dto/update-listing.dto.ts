import { Type } from "class-transformer";
import {
  IsEnum,
  Equals,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { PropertyTypeDto } from "./create-listing.dto";

export class UpdateListingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(PropertyTypeDto)
  propertyType?: PropertyTypeDto;

  @IsOptional()
  @Equals("exact", {
    message: "La ubicación pública debe ser exacta.",
  })
  visibilityPrecision?: "exact";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  minStayNights?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxStayNights?: number;
}
