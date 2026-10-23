import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { UsersService } from "./users.service";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { UpdatePasswordDto } from "./dto/update-password.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { IMAGE_UPLOAD_LIMITS } from "../media/upload-limits";
import { CreateMediaUploadIntentDto } from "../media/dto/create-media-upload-intent.dto";
import { CompleteMediaUploadDto } from "../media/dto/complete-media-upload.dto";
import { CompleteAvatarUploadDto } from "./dto/complete-avatar-upload.dto";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  getMe(@CurrentUser() user: any) {
    return this.usersService.getMe(user.id);
  }

  @Post("me/activate-host")
  @Roles("tenant", "host", "admin")
  activateHost(@CurrentUser() user: any) {
    return this.usersService.activateHost(user.id);
  }

  @Patch("me/profile")
  updateProfile(@CurrentUser() user: any, @Body() body: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, body);
  }

  @Post("me/avatar")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: IMAGE_UPLOAD_LIMITS }),
  )
  updateAvatar(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query("uploadKey") uploadKey?: string,
  ) {
    return this.usersService.updateAvatar(user.id, file, uploadKey);
  }

  @Post("me/avatar/upload-intent")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  createAvatarUploadIntent(
    @CurrentUser() user: any,
    @Body() body: CreateMediaUploadIntentDto,
  ) {
    return this.usersService.createAvatarUploadIntent(user.id, body);
  }

  @Post("me/avatar/complete")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  completeAvatarUpload(
    @CurrentUser() user: any,
    @Body() body: CompleteAvatarUploadDto,
  ) {
    return this.usersService.completeAvatarUpload(
      user.id,
      body.mediaId,
      body.uploadKey,
    );
  }

  @Patch("me/password")
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  updatePassword(@CurrentUser() user: any, @Body() body: UpdatePasswordDto) {
    return this.usersService.updatePassword(user.id, body);
  }

  @Patch("me/notification-preferences")
  updateNotificationPreferences(
    @CurrentUser() user: any,
    @Body() body: UpdateNotificationPreferencesDto,
  ) {
    return this.usersService.updateNotificationPreferences(user.id, body);
  }

}
