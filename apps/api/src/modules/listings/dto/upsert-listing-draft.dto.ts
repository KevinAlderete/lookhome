import { Type } from "class-transformer";
import {
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PropertyTypeDto } from "./create-listing.dto";
import { RentalUnitTypeDto } from "../../rooms/dto/create-room.dto";
import { RentalModeDto } from "../../rooms/dto/create-room-pricing.dto";

export class DraftAddressDto {
  @IsOptional()
  @Equals("PE")
  countryCode?: "PE";

  @IsOptional()
  @IsUUID("4")
  regionId?: string;

  @IsOptional()
  @IsUUID("4")
  cityId?: string;

  @IsOptional()
  @IsUUID("4")
  districtId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  regionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cityName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  districtName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  line1?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  line2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-18.5)
  @Max(0.1)
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-81.5)
  @Max(-68.5)
  lng?: number;

  @IsOptional()
  @IsIn(["exact"])
  precision?: "exact";

  @IsOptional()
  @IsBoolean()
  locationConfirmed?: boolean;
}

export class DraftListingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(PropertyTypeDto)
  propertyType?: PropertyTypeDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftAddressDto)
  address?: DraftAddressDto;
}

export class DraftPricingDto {
  @IsOptional()
  @Equals("PEN", { message: "La moneda disponible es PEN." })
  currencyCode?: "PEN";

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  rentAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cleaningFee?: number;

  @IsOptional()
  @IsEnum(RentalModeDto)
  rentalMode?: RentalModeDto;
}

export class DraftOfferDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(RentalUnitTypeDto)
  offerType?: RentalUnitTypeDto;

  @IsOptional()
  @IsBoolean()
  isFurnished?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxGuests?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  bedrooms?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  beds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(100)
  bathrooms?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftPricingDto)
  pricing?: DraftPricingDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  minStayNights?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxStayNights?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  minTermMonths?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  maxTermMonths?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  amenityIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  houseRules?: string;

  @IsOptional()
  @IsBoolean()
  petsAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  smokingAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  partiesAllowed?: boolean;
}

export class DraftAvailabilityDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  availableFrom?: string;
}

export class UpsertListingDraftDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7)
  currentStep?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedVersion?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftListingDto)
  listing?: DraftListingDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftOfferDto)
  offer?: DraftOfferDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DraftAvailabilityDto)
  availability?: DraftAvailabilityDto;
}

export type ListingOfferInput = DraftOfferDto;
