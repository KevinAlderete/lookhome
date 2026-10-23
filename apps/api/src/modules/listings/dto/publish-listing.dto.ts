import { IsBoolean } from "class-validator";

export class PublishListingDto {
  @IsBoolean()
  publish!: boolean;
}
