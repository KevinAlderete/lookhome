import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { UpsertListingDraftDto } from "./dto/upsert-listing-draft.dto";
import { ListingOnboardingService } from "./listing-onboarding.service";
import { ReorderMediaDto } from "../media/dto/reorder-media.dto";
import { IMAGE_UPLOAD_LIMITS } from "../media/upload-limits";
import { Throttle } from "@nestjs/throttler";
import { CreateMediaUploadIntentDto } from "../media/dto/create-media-upload-intent.dto";
import { CompleteDraftPhotoUploadDto } from "./dto/complete-draft-photo-upload.dto";

@Controller("host/listing-drafts")
@Roles("host", "admin")
export class ListingOnboardingController {
  constructor(private readonly onboarding: ListingOnboardingService) {}

  @Put(":creationKey")
  upsert(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Body() body: UpsertListingDraftDto,
  ) {
    return this.onboarding.saveDraft(user.id, creationKey, body);
  }

  @Get(":creationKey")
  findOne(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
  ) {
    return this.onboarding.getDraft(user.id, creationKey);
  }

  @Put(":creationKey/photos/order")
  reorderPhotos(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Body() body: ReorderMediaDto,
  ) {
    return this.onboarding.reorderPhotos(user.id, creationKey, body.mediaIds);
  }

  @Delete(":creationKey/photos/:mediaId")
  removePhoto(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Param("mediaId", new ParseUUIDPipe({ version: "4" })) mediaId: string,
  ) {
    return this.onboarding.removeDraftPhoto(user.id, creationKey, mediaId);
  }

  @Post(":creationKey/photos/:photoKey/upload-intent")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  createPhotoUploadIntent(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Param("photoKey", new ParseUUIDPipe({ version: "4" })) photoKey: string,
    @Body() body: CreateMediaUploadIntentDto,
    @Query("sortOrder") sortOrder?: string,
  ) {
    return this.onboarding.createDraftPhotoUploadIntent(
      user,
      creationKey,
      photoKey,
      body.sizeBytes,
      body.mimeType,
      sortOrder,
    );
  }

  @Post(":creationKey/photos/:photoKey/complete")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  completePhotoUpload(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Param("photoKey", new ParseUUIDPipe({ version: "4" })) photoKey: string,
    @Body() body: CompleteDraftPhotoUploadDto,
  ) {
    return this.onboarding.completeDraftPhotoUpload(
      user,
      creationKey,
      photoKey,
      body.mediaId,
      body.uploadKey,
      body.sortOrder,
      body.isCover,
    );
  }

  @Get(":creationKey/photo-content/:mediaId")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async photoContent(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Param("mediaId", new ParseUUIDPipe({ version: "4" })) mediaId: string,
    @Query("variant") variant?: string,
  ) {
    const image = await this.onboarding.getDraftPhotoFile(
      user.id,
      creationKey,
      mediaId,
      variant === "detail" ? "detail" : "thumbnail",
    );
    return new StreamableFile(image.stream, {
      type: image.mimeType,
      disposition: "inline",
    });
  }

  @Put(":creationKey/photos/:photoKey")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: IMAGE_UPLOAD_LIMITS }),
  )
  uploadPhoto(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
    @Param("photoKey", new ParseUUIDPipe({ version: "4" })) photoKey: string,
    @UploadedFile() file: any,
    @Query("sortOrder") sortOrder?: string,
    @Query("isCover") isCover?: string,
  ) {
    return this.onboarding.uploadPhoto(
      user,
      creationKey,
      photoKey,
      file,
      sortOrder,
      isCover === "true",
    );
  }

  @Post(":creationKey/publish")
  publish(
    @CurrentUser() user: any,
    @Param("creationKey", new ParseUUIDPipe({ version: "4" })) creationKey: string,
  ) {
    return this.onboarding.publish(user.id, creationKey);
  }
}
