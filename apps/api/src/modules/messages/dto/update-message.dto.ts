import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000, { message: "El mensaje no puede superar 2000 caracteres." })
  content?: string;
}
