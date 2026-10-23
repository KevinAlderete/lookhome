import { Controller, Get, Query } from "@nestjs/common";
import { GeoService } from "./geo.service";
import { GetRegionsQueryDto } from "./dto/get-regions-query.dto";
import { GetCitiesQueryDto } from "./dto/get-cities-query.dto";
import { GetDistrictsQueryDto } from "./dto/get-districts-query.dto";
import { GetGeoCascadeQueryDto } from "./dto/get-geo-cascade-query.dto";
import { Public } from "../auth/decorators/public.decorator";

@Public()
@Controller("geo")
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get("countries")
  getCountries() {
    return this.geoService.getCountries();
  }

  @Get("regions")
  getRegions(@Query() query: GetRegionsQueryDto) {
    return this.geoService.getRegions(query.countryCode);
  }

  @Get("cities")
  getCities(@Query() query: GetCitiesQueryDto) {
    return this.geoService.getCities(query.regionId);
  }

  @Get("districts")
  getDistricts(@Query() query: GetDistrictsQueryDto) {
    return this.geoService.getDistricts(query.cityId);
  }

  @Get("cascade")
  getCascade(@Query() query: GetGeoCascadeQueryDto) {
    return this.geoService.getCascade({
      countryCode: query.countryCode,
      regionId: query.regionId,
      cityId: query.cityId,
    });
  }

  @Get("tree")
  getTree(@Query() query: GetRegionsQueryDto) {
    return this.geoService.getTree(query.countryCode);
  }
}
