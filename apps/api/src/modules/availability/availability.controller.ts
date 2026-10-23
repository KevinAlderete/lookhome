import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { AvailabilityService } from "./availability.service";
import { CreateAvailabilityRuleDto } from "./dto/create-availability-rule.dto";
import { CreateCalendarBlockDto } from "./dto/create-calendar-block.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { Ownership } from "../auth/decorators/ownership.decorator";

@Controller("availability")
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Roles("host", "admin")
  @Ownership("room")
  @Post("rules")
  createRule(@Body() body: CreateAvailabilityRuleDto) {
    return this.availabilityService.createRule(body);
  }

  @Get("rules/room/:roomId")
  @Roles("host", "admin")
  @Ownership("room")
  listRulesByRoom(@Param("roomId") roomId: string) {
    return this.availabilityService.listRulesByRoom(roomId);
  }

  @Delete("rules/:id")
  @Roles("host", "admin")
  @Ownership("availability-rule")
  removeRule(@Param("id") id: string) {
    return this.availabilityService.removeRule(id);
  }
  @Roles("host", "admin")
  @Ownership("room")
  @Post("blocks")
  createCalendarBlock(@Body() body: CreateCalendarBlockDto) {
    return this.availabilityService.createCalendarBlock(body);
  }

  @Get("blocks/room/:roomId")
  @Roles("host", "admin")
  @Ownership("room")
  listBlocksByRoom(@Param("roomId") roomId: string) {
    return this.availabilityService.listBlocksByRoom(roomId);
  }

  @Delete("blocks/:id")
  @Roles("host", "admin")
  @Ownership("calendar-block")
  removeBlock(@Param("id") id: string) {
    return this.availabilityService.removeBlock(id);
  }
}
