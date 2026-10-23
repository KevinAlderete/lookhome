import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { RentalModeDto } from "../../rooms/dto/create-room-pricing.dto";
import { RentalUnitTypeDto } from "../../rooms/dto/create-room.dto";

export class ListingFilterDto {
  @IsOptional()
  @IsUUID()
  hostUserId?: string;

  @IsOptional()
  @IsIn([
    "draft",
    "pending_review",
    "published",
    "paused",
    "suspended",
    "archived",
  ])
  status?:
    | "draft"
    | "pending_review"
    | "published"
    | "paused"
    | "suspended"
    | "archived";

  @IsOptional()
  @IsIn(["house", "apartment", "building", "shared_house", "other"])
  propertyType?: "house" | "apartment" | "building" | "shared_house" | "other";

  @IsOptional()
  @IsIn(["entire_place", "private_room", "shared_bed"])
  offerType?: RentalUnitTypeDto;

  @IsOptional()
  @IsIn(["nightly", "monthly"])
  rentalMode?: RentalModeDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 12;
}
