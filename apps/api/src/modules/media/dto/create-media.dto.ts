import { Type } from "class-transformer";
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Min,
} from "class-validator";

export enum MediaTypeDto {
  IMAGE = "image",
  VIDEO = "video",
  DOCUMENT = "document",
}

export class CreateMediaDto {
  @IsOptional()
  @IsUUID("4", { message: "ownerUserId debe ser un UUID válido." })
  ownerUserId?: string;

  @IsEnum(MediaTypeDto, {
    message: "type tiene un valor inválido.",
  })
  type!: MediaTypeDto;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @Type(() => Number)
  @IsNumber({}, { message: "sizeBytes debe ser numérico." })
  @Min(0)
  sizeBytes!: number;

  @IsString()
  @IsNotEmpty()
  storageProvider!: string;

  @IsString()
  @IsNotEmpty()
  storageKey!: string;

  @IsOptional()
  @IsUrl({}, { message: "publicUrl debe ser una URL válida." })
  publicUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "width debe ser numérico." })
  @Min(1)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "height debe ser numérico." })
  @Min(1)
  height?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: "durationSec debe ser numérico." })
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsString()
  hashSha256?: string;
}
