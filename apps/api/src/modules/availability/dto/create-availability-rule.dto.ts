import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
} from "class-validator";

export enum AvailabilityRuleTypeDto {
  OPEN_RANGE = "open_range",
  BLOCKED_RANGE = "blocked_range",
  WEEKLY_PATTERN = "weekly_pattern",
}

export class CreateAvailabilityRuleDto {
  @IsUUID("4", { message: "roomId debe ser UUID válido." })
  roomId!: string;

  @IsEnum(AvailabilityRuleTypeDto, {
    message: "ruleType tiene un valor inválido.",
  })
  ruleType!: AvailabilityRuleTypeDto;

  @IsOptional()
  @IsDateString({}, { message: "startDate debe ser fecha válida." })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: "endDate debe ser fecha válida." })
  endDate?: string;

  @IsOptional()
  @IsObject()
  weekPattern?: Record<string, any>;
}
