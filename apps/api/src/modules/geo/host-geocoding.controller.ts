import { Controller, Get, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Roles } from "../auth/decorators/roles.decorator";
import { AddressReverseQueryDto } from "./dto/address-reverse-query.dto";
import { AddressSuggestQueryDto } from "./dto/address-suggest-query.dto";
import { GeocodingService } from "./geocoding.service";

@Controller("host/geo/address")
@Roles("host", "admin")
export class HostGeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get("suggest")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  suggest(@Query() query: AddressSuggestQueryDto) {
    return this.geocodingService.suggest(query.q, {
      regionId: query.regionId,
      cityId: query.cityId,
      districtId: query.districtId,
    }, query.mode ?? "autocomplete");
  }

  @Get("reverse")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reverse(@Query() query: AddressReverseQueryDto) {
    return this.geocodingService.reverse(query.lat, query.lng);
  }
}
