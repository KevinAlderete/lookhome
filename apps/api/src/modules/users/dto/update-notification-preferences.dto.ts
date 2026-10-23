import { IsObject, IsOptional } from "class-validator";

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsObject()
  prefs?: Record<string, any>;
}
