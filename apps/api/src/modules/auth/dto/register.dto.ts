import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  ValidateIf,
} from "class-validator";
import { Transform } from "class-transformer";

export class RegisterDto {
  @IsOptional()
  @IsEmail({}, { message: "El email no es válido." })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message: "El phoneE164 debe tener formato internacional válido.",
  })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  phoneE164?: string;

  @IsString()
  @MinLength(8, {
    message: "La contraseña debe tener al menos 8 caracteres.",
  })
  password!: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  firstName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  lastName?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  displayName?: string;
}
