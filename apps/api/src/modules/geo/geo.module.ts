import { Module } from "@nestjs/common";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";
import { GeocodingService } from "./geocoding.service";
import { HostGeocodingController } from "./host-geocoding.controller";

@Module({
  controllers: [GeoController, HostGeocodingController],
  providers: [GeoService, GeocodingService],
  exports: [GeoService],
})
export class GeoModule {}
