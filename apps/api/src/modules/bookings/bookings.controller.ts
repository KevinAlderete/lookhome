import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { BookingsService } from "./bookings.service";
import { CreateBookingDto } from "./dto/create-booking.dto";
import { UpdateBookingStatusDto } from "./dto/update-booking-status.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { Ownership } from "../auth/decorators/ownership.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("bookings")
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  @Roles("tenant", "admin")
  create(@CurrentUser() user: any, @Body() body: CreateBookingDto) {
    return this.bookingsService.create(user, body);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.bookingsService.findAll(user);
  }

  @Get("me")
  findMine(@CurrentUser() user: any) {
    return this.bookingsService.findMine(user);
  }

  @Get("me/:id")
  findMineById(@CurrentUser() user: any, @Param("id") id: string) {
    return this.bookingsService.findMineById(user, id);
  }

  @Get("host/me")
  @Roles("host", "admin")
  findHostBookings(@CurrentUser() user: any) {
    return this.bookingsService.findHostBookings(user);
  }

  @Get("host/me/:id")
  @Roles("host", "admin")
  findHostBookingById(@CurrentUser() user: any, @Param("id") id: string) {
    return this.bookingsService.findHostBookingById(user, id);
  }

  @Get(":id")
  findOne(@CurrentUser() user: any, @Param("id") id: string) {
    return this.bookingsService.findOne(user, id);
  }

  @Patch(":id/start")
  @Roles("tenant")
  @Ownership("booking-tenant")
  startByTenant(@CurrentUser() user: any, @Param("id") id: string) {
    return this.bookingsService.startByTenant(user, id);
  }

  @Patch(":id/status")
  @Roles("host", "admin", "support")
  @Ownership("booking-host")
  updateStatus(
    @CurrentUser() user: any,
    @Param("id") id: string,
    @Body() body: UpdateBookingStatusDto,
  ) {
    return this.bookingsService.updateStatus(user, id, body);
  }
}
