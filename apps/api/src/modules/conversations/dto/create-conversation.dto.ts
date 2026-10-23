import { IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class CreateConversationDto {
  @IsOptional()
  @IsUUID("4")
  listingId?: string;

  @IsOptional()
  @IsUUID("4")
  roomId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  initialMessage?: string;

  @IsOptional()
  @IsUUID("4")
  clientMessageId?: string;
}
