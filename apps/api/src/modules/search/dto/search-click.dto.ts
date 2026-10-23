import { IsEnum, IsInt, IsUUID, Min } from "class-validator";
import { SearchEntityDto } from "./search.dto";

export class SearchClickDto {
  @IsUUID("4")
  searchQueryId!: string;

  @IsEnum(SearchEntityDto)
  entityType!: SearchEntityDto;

  @IsUUID("4")
  entityId!: string;

  @IsInt()
  @Min(0)
  position!: number;
}
