import { Body, Controller, Get, Patch, Post, Param } from "@nestjs/common";
import { ModerationService } from "./moderation.service";
import { CreateReportDto } from "./dto/create-report.dto";
import { ModerateEntityDto } from "./dto/moderate-entity.dto";
import { UpdateReportStatusDto } from "./dto/update-report-status.dto";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";

@Controller("moderation")
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post("reports")
  createReport(@CurrentUser() user: any, @Body() body: CreateReportDto) {
    return this.moderationService.createReport(user.id, body);
  }

  @Get("reports")
  @Roles("admin", "moderator", "support")
  listReports() {
    return this.moderationService.listReports();
  }

  @Patch("reports/:id/status")
  @Roles("admin", "moderator", "support")
  updateReportStatus(
    @Param("id") id: string,
    @Body() body: UpdateReportStatusDto,
  ) {
    return this.moderationService.updateReportStatus(id, body);
  }

  @Post("actions")
  @Roles("admin", "moderator")
  applyModeration(@CurrentUser() user: any, @Body() body: ModerateEntityDto) {
    return this.moderationService.applyModeration(user.id, body);
  }
}
