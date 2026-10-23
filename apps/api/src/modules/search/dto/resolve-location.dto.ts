import { IsIn, IsString, MaxLength } from "class-validator";

export const LOCATION_SELECTION_TYPES = [
  "country",
  "region",
  "city",
  "district",
] as const;

export type LocationSelectionType = (typeof LOCATION_SELECTION_TYPES)[number];

export class ResolveLocationDto {
  @IsIn(LOCATION_SELECTION_TYPES)
  type!: LocationSelectionType;

  @IsString()
  @MaxLength(100)
  id!: string;
}
