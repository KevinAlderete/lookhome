import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from "class-validator";

export class ReorderMediaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID("4", { each: true })
  mediaIds!: string[];
}
