import { Type } from "class-transformer";
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  IsInt,
  IsPositive,
  IsIn,
  Max,
  MaxLength,
  IsLatitude,
  IsLongitude,
} from "class-validator";
import {
  LOCATION_SELECTION_TYPES,
  type LocationSelectionType,
} from "./resolve-location.dto";

export enum SearchEntityDto {
  LISTING = "listing",
  ROOM = "room",
}

export class SearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsEnum(SearchEntityDto)
  entityType?: SearchEntityDto;

  @IsOptional()
  @IsUUID("4")
  cityId?: string;

  @IsOptional()
  @IsUUID("4")
  districtId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2)
  @IsIn(["PE"])
  countryCode?: string;

  @IsOptional()
  @IsUUID("4")
  regionId?: string;

  @IsOptional()
  @IsIn(LOCATION_SELECTION_TYPES)
  locationType?: LocationSelectionType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  south?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  west?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  north?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  east?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  maxPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;

  @IsOptional()
  @IsIn(["house", "apartment", "room"])
  accommodationType?: "house" | "apartment" | "room";

  /** Legacy physical-property filter. New public UI uses accommodationType. */
  @IsOptional()
  @IsIn(["house", "apartment", "building", "shared_house", "other"])
  propertyType?: "house" | "apartment" | "building" | "shared_house" | "other";

  @IsOptional()
  @IsIn(["nightly", "monthly"])
  rentalMode?: "nightly" | "monthly";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;
}
