import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class LogoutAllDto {
  @IsOptional()
  @IsBoolean()
  exceptCurrent?: boolean;
}
