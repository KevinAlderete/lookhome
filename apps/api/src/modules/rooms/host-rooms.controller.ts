import { Controller, Get, Param, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { FindRoomsQueryDto } from "./dto/find-rooms-query.dto";
import { RoomsService } from "./rooms.service";

@Controller("host/rooms")
@Roles("host", "admin")
export class HostRoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  findMine(@CurrentUser() user: any, @Query() query: FindRoomsQueryDto) {
    return this.roomsService.findMine(user, query.listingId);
  }

  @Get(":id")
  findOneMine(@CurrentUser() user: any, @Param("id") id: string) {
    return this.roomsService.findMineById(user, id);
  }
}
