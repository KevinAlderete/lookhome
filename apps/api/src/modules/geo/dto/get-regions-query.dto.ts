import { IsNotEmpty, IsString, Length } from "class-validator";
import { Transform } from "class-transformer";

export class GetRegionsQueryDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 2, { message: "countryCode debe tener exactamente 2 caracteres." })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  countryCode!: string;
}
