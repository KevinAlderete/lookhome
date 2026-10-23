import { IsIn, IsInt, IsUUID, Max, Min } from "class-validator";
import { MAX_IMAGE_UPLOAD_BYTES } from "../upload-limits";

export class CreateMediaUploadIntentDto {
  @IsUUID("4")
  uploadKey!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_UPLOAD_BYTES)
  sizeBytes!: number;

  @IsIn(["image/jpeg", "image/png", "image/webp"])
  mimeType!: string;
}
