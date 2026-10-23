import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export enum MessageTypeDto {
  TEXT = "text",
  SYSTEM = "system",
  IMAGE = "image",
  FILE = "file",
}

export class SendMessageDto {
  @IsUUID("4", { message: "conversationId debe ser UUID válido." })
  conversationId!: string;

  @IsEnum(MessageTypeDto, {
    message: "type tiene un valor inválido.",
  })
  type!: MessageTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "El mensaje no puede superar 2000 caracteres." })
  content?: string;

  @IsOptional()
  @IsUUID("4", { message: "clientMessageId debe ser un UUID válido." })
  clientMessageId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true, message: "Cada mediaId debe ser UUID válido." })
  mediaIds?: string[];
}
