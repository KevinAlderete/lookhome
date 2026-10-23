import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, Length } from "class-validator";

export class GetGeoCascadeQueryDto {
  @IsOptional()
  @IsString()
  @Length(2, 2, { message: "countryCode debe tener exactamente 2 caracteres." })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  countryCode?: string;

  @IsOptional()
  @IsUUID("4", { message: "regionId debe ser un UUID válido." })
  regionId?: string;

  @IsOptional()
  @IsUUID("4", { message: "cityId debe ser un UUID válido." })
  cityId?: string;
}
