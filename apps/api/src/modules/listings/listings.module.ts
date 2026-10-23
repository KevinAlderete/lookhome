import { Module } from "@nestjs/common";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";
import { HostListingsController } from "./host-listings.controller";
import { MediaModule } from "../media/media.module";
import { ListingOnboardingController } from "./listing-onboarding.controller";
import { ListingOnboardingService } from "./listing-onboarding.service";

@Module({
  imports: [MediaModule],
  controllers: [ListingsController, HostListingsController, ListingOnboardingController],
  providers: [ListingsService, ListingOnboardingService],
  exports: [ListingsService],
})
export class ListingsModule {}
