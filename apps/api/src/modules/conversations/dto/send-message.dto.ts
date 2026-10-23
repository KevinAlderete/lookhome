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
  @IsUUID("4")
  conversationId!: string;

  @IsEnum(MessageTypeDto)
  type!: MessageTypeDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  content?: string;

  @IsOptional()
  @IsUUID("4")
  clientMessageId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  mediaIds?: string[];
}
