import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export enum ReportEntityDto {
  USER = "user",
  LISTING = "listing",
  ROOM = "room",
  MESSAGE = "message",
  REVIEW = "review",
}

export enum ReportReasonDto {
  SCAM = "scam",
  SPAM = "spam",
  HARASSMENT = "harassment",
  INAPPROPRIATE = "inappropriate",
  OTHER = "other",
}

export class CreateReportDto {
  @IsEnum(ReportEntityDto)
  entityType!: ReportEntityDto;

  @IsUUID("4")
  entityId!: string;

  @IsEnum(ReportReasonDto)
  reason!: ReportReasonDto;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  details?: string;
}
