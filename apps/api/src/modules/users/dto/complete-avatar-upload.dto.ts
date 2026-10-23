import { IsUUID } from "class-validator";

export class CompleteAvatarUploadDto {
  @IsUUID("4")
  mediaId!: string;

  @IsUUID("4")
  uploadKey!: string;
}
