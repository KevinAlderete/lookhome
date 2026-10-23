import { IsUUID } from "class-validator";

export class CompleteMediaUploadDto {
  @IsUUID("4")
  uploadKey!: string;
}
