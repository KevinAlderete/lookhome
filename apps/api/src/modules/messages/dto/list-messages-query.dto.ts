import { Type } from "class-transformer";
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export class ListMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page debe ser entero." })
  @Min(1, { message: "page debe ser mayor o igual a 1." })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "pageSize debe ser entero." })
  @Min(1, { message: "pageSize debe ser mayor o igual a 1." })
  @Max(50, { message: "pageSize no puede superar 50." })
  pageSize?: number;

  @IsOptional()
  @IsDateString({}, { message: "beforeCreatedAt debe ser una fecha válida." })
  beforeCreatedAt?: string;

  @IsOptional()
  @IsUUID("4", { message: "beforeId debe ser un UUID válido." })
  beforeId?: string;

  @IsOptional()
  @IsDateString({}, { message: "afterCreatedAt debe ser una fecha válida." })
  afterCreatedAt?: string;

  @IsOptional()
  @IsUUID("4", { message: "afterId debe ser un UUID válido." })
  afterId?: string;

  @IsOptional()
  @IsDateString({}, { message: "changedSince debe ser una fecha válida." })
  changedSince?: string;
}
