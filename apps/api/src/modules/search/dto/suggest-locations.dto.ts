import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { LOCATION_SELECTION_TYPES } from "./resolve-location.dto";

export type SuggestLocationType =
  (typeof LOCATION_SELECTION_TYPES)[number];

export class SuggestLocationsDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(LOCATION_SELECTION_TYPES)
  type?: SuggestLocationType;
}
