import { IsEnum, IsOptional, IsString, IsUUID } from "class-validator";
import { ReportEntityDto } from "./create-report.dto";

export enum ModerationActionDto {
  WARN = "warn",
  SUSPEND = "suspend",
  BAN = "ban",
  UNPUBLISH = "unpublish",
  REMOVE_CONTENT = "remove_content",
}

export class ModerateEntityDto {
  @IsEnum(ReportEntityDto)
  entityType!: ReportEntityDto;

  @IsUUID("4")
  entityId!: string;

  @IsEnum(ModerationActionDto)
  action!: ModerationActionDto;

  @IsOptional()
  @IsString()
  notes?: string;
}
