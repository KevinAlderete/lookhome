import { IsNotEmpty, IsOptional, IsString, Matches } from "class-validator";

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9._:-]{8,200}$/)
  deviceId?: string;
}
