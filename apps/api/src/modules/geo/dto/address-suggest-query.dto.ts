import { Transform } from "class-transformer";
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class AddressSuggestQueryDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: "q debe tener al menos 3 caracteres." })
  @MaxLength(200, { message: "q no puede superar los 200 caracteres." })
  q!: string;

  @IsOptional()
  @IsIn(["autocomplete", "complete"])
  mode?: "autocomplete" | "complete";

  @IsOptional()
  @IsUUID("4")
  regionId?: string;

  @IsOptional()
  @IsUUID("4")
  cityId?: string;

  @IsOptional()
  @IsUUID("4")
  districtId?: string;
}
