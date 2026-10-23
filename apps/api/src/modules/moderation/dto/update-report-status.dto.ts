import { IsEnum } from "class-validator";

export enum ReportStatusDto {
  OPEN = "open",
  IN_REVIEW = "in_review",
  RESOLVED = "resolved",
  DISMISSED = "dismissed",
}

export class UpdateReportStatusDto {
  @IsEnum(ReportStatusDto)
  status!: ReportStatusDto;
}
