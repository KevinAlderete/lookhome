import { Controller, Get, Param, ParseUUIDPipe, Patch, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { NotificationsService } from "./notifications.service";
import { ListNotificationsQueryDto } from "./dto/list-notifications-query.dto";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get("me")
  listMine(@CurrentUser() user: any, @Query() query: ListNotificationsQueryDto) {
    return this.notificationsService.listMine(user.id, query);
  }

  @Patch("me/read-all")
  markAllRead(@CurrentUser() user: any) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch("me/:id/read")
  markRead(
    @CurrentUser() user: any,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.notificationsService.markRead(user.id, id);
  }
}
