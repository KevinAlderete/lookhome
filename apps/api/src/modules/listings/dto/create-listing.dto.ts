import { Type } from "class-transformer";
import {
  IsEnum,
  IsDefined,
  Equals,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";

export enum PropertyTypeDto {
  HOUSE = "house",
  APARTMENT = "apartment",
  BUILDING = "building",
  SHARED_HOUSE = "shared_house",
  OTHER = "other",
}

export enum LocationPrecisionDto {
  EXACT = "exact",
  APPROX = "approx",
  DISTRICT = "district",
  CITY = "city",
}

export class CreateListingAddressDto {
  @IsString()
  @IsNotEmpty()
  @Equals("PE", { message: "countryCode debe ser PE." })
  countryCode!: string;

  @IsUUID("4", { message: "regionId debe ser un UUID válido." })
  regionId!: string;

  @IsUUID("4", { message: "cityId debe ser un UUID válido." })
  cityId!: string;

  @IsUUID("4", { message: "districtId debe ser un UUID válido." })
  districtId!: string;

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
  @IsLatitude({ message: "lat debe ser una latitud válida." })
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude({ message: "lng debe ser una longitud válida." })
  lng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  geohash?: string;

  @IsOptional()
  @IsEnum(LocationPrecisionDto, {
    message: "precision tiene un valor inválido.",
  })
  precision?: LocationPrecisionDto;
}

export class CreateListingDto {
  @IsString()
  @IsNotEmpty({ message: "El título es obligatorio." })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PropertyTypeDto, {
    message: "propertyType tiene un valor inválido.",
  })
  propertyType!: PropertyTypeDto;

  @ValidateNested()
  @IsDefined()
  @Type(() => CreateListingAddressDto)
  address!: CreateListingAddressDto;
}
