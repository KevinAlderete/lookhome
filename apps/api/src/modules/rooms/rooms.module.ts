import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { HostRoomsController } from "./host-rooms.controller";
import { UnitsController } from "./units.controller";
import { RoomsService } from "./rooms.service";

@Module({
  controllers: [RoomsController, HostRoomsController, UnitsController],
  providers: [RoomsService],
  exports: [RoomsService],
})
export class RoomsModule {}
