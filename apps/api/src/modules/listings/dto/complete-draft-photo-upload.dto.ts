import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class CompleteDraftPhotoUploadDto {
  @IsUUID("4")
  mediaId!: string;

  @IsUUID("4")
  uploadKey!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(11)
  sortOrder!: number;

  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}
