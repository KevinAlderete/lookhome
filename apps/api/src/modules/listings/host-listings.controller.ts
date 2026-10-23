import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ListingsService } from "./listings.service";
import { ListingFilterDto } from "./dto/listing-filter.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { UpsertListingDraftDto } from "./dto/upsert-listing-draft.dto";
import { ListingOnboardingService } from "./listing-onboarding.service";

@Controller("host/listings")
export class HostListingsController {
  constructor(
    private readonly listingsService: ListingsService,
    private readonly onboarding: ListingOnboardingService,
  ) {}

  @Get()
  @Roles("host", "admin")
  findMine(@CurrentUser() user: any, @Query() query: ListingFilterDto) {
    return this.listingsService.findMine(user, query);
  }

  @Get(":id")
  @Roles("host", "admin")
  findOneMine(@CurrentUser() user: any, @Param("id") id: string) {
    return this.listingsService.findMineById(user, id);
  }

  @Patch(":id")
  updateMine(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: UpsertListingDraftDto,
  ) {
    return this.onboarding.updateListingOffer(user, id, body);
  }

  @Post(":id/drafts/:creationKey")
  @Roles("host", "admin")
  beginLegacyDraft(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
  ) {
    return this.onboarding.beginLegacyListingDraft(user.id, id, creationKey);
  }
}
