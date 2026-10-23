import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ListingsService } from "./listings.service";
import { CreateListingDto } from "./dto/create-listing.dto";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { FindListingsQueryDto } from "./dto/find-listings-query.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Ownership } from "../auth/decorators/ownership.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { FindPublicHostProfileDto } from "./dto/find-public-host-profile.dto";

@Controller("listings")
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  @Public()
  findAll(@Query() query: FindListingsQueryDto) {
    return this.listingsService.findAll(query);
  }

  @Get("hosts/:hostUserId/profile")
  @Public()
  findPublicHostProfile(
    @Param("hostUserId", new ParseUUIDPipe({ version: "4" })) hostUserId: string,
    @Query() query: FindPublicHostProfileDto,
  ) {
    return this.listingsService.findPublicHostProfile(hostUserId, query);
  }

  @Get(":id")
  @Public()
  findOne(@Param("id") id: string) {
    return this.listingsService.findOne(id);
  }

  @Post()
  @Roles("host", "admin")
  create(@CurrentUser() user: any, @Body() body: CreateListingDto) {
    return this.listingsService.create(user.id, body);
  }

  @Patch(":id/publish")
  @Roles("host", "admin")
  @Ownership("listing")
  publish(@Param("id") id: string) {
    return this.listingsService.publish(id);
  }

  @Patch(":id/pause")
  @Roles("host", "admin")
  @Ownership("listing")
  pause(@Param("id") id: string) {
    return this.listingsService.pause(id);
  }

  @Patch(":id/archive")
  @Roles("host", "admin")
  @Ownership("listing")
  archive(@Param("id") id: string) {
    return this.listingsService.archive(id);
  }

  @Patch(":id")
  @Roles("host", "admin")
  @Ownership("listing")
  update(@Param("id") id: string, @Body() body: UpdateListingDto) {
    return this.listingsService.update(id, body);
  }
}
