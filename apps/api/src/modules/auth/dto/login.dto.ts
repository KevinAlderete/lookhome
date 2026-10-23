import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";
import { Transform } from "class-transformer";

export class LoginDto {
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
}
