import {
  Body,
  Controller,
  Delete,
  GoneException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Redirect,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MediaService } from "./media.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Ownership } from "../auth/decorators/ownership.decorator";
import { ReorderMediaDto } from "./dto/reorder-media.dto";
import { Throttle } from "@nestjs/throttler";
import { IMAGE_UPLOAD_LIMITS } from "./upload-limits";
import { CreateMediaUploadIntentDto } from "./dto/create-media-upload-intent.dto";
import { CompleteMediaUploadDto } from "./dto/complete-media-upload.dto";
import { Public } from "../auth/decorators/public.decorator";

@Controller("media")
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(":id")
  @Roles("host", "admin", "support")
  findOne(@CurrentUser() user: any, @Param("id") id: string) {
    return this.mediaService.findOne(user, id);
  }

  @Get(":id/image")
  @Public()
  @Redirect()
  @Header("Cache-Control", "public, max-age=240")
  @Header("Referrer-Policy", "no-referrer")
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async publicImage(
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
    @Query("variant") variant?: string,
  ) {
    const url = await this.mediaService.getPublicImageUrl(
      id,
      variant === "detail" ? "detail" : "thumbnail",
    );
    return { url, statusCode: 302 };
  }

  @Delete(":id")
  @Roles("host", "admin")
  remove(
    @CurrentUser() user: any,
    @Param("id", new ParseUUIDPipe({ version: "4" })) id: string,
  ) {
    return this.mediaService.remove(user, id);
  }

  @Delete("listing/:listingId/:mediaId")
  @Roles("host", "admin")
  @Ownership("listing")
  removeFromListing(
    @CurrentUser() user: any,
    @Param("listingId") listingId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return this.mediaService.removeFromListing(user, listingId, mediaId);
  }

  @Post("upload")
  @Roles("host", "admin")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: IMAGE_UPLOAD_LIMITS }),
  )
  uploadImage(
    @CurrentUser() user: any,
    @UploadedFile() file: any,
    @Query("uploadKey") uploadKey?: string,
  ) {
    return this.mediaService.uploadImage(user.id, file, uploadKey);
  }

  @Post("upload-intents")
  @Roles("host", "admin")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  createUploadIntent(
    @CurrentUser() user: any,
    @Body() body: CreateMediaUploadIntentDto,
  ) {
    return this.mediaService.createUploadIntent(
      user.id,
      body.uploadKey,
      body.sizeBytes,
      body.mimeType,
      "listing",
    );
  }

  @Post(":id/complete")
  @Roles("host", "admin")
  @Throttle({ default: { limit: 30, ttl: 10 * 60_000 } })
  completeUpload(
    @CurrentUser() user: any,
    @Param("id", new ParseUUIDPipe({ version: "4" })) mediaId: string,
    @Body() body: CompleteMediaUploadDto,
  ) {
    return this.mediaService.completeDirectUpload(
      user.id,
      mediaId,
      body.uploadKey,
      "listing",
    );
  }

  @Post("attach/listing/:listingId/:mediaId")
  @Roles("host", "admin")
  @Ownership("listing")
  attachToListing(
    @CurrentUser() user: any,
    @Param("listingId") listingId: string,
    @Param("mediaId") mediaId: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("isCover") isCover?: string,
  ) {
    return this.mediaService.attachToListing(
      user,
      listingId,
      mediaId,
      sortOrder ? Number(sortOrder) : 0,
      isCover === "true",
    );
  }

  @Post("attach/room/:roomId/:mediaId")
  @Roles("host", "admin")
  @Ownership("room")
  attachToRoom(
    @CurrentUser() _user: any,
    @Param("roomId") roomId: string,
    @Param("mediaId") mediaId: string,
    @Query("sortOrder") sortOrder?: string,
    @Query("isCover") isCover?: string,
  ) {
    void roomId;
    void mediaId;
    void sortOrder;
    void isCover;
    throw new GoneException("Las fotos se gestionan desde la galería del anuncio.");
  }

  @Put("listing/:listingId/order")
  @Roles("host", "admin")
  @Ownership("listing")
  reorderListing(
    @CurrentUser() user: any,
    @Param("listingId") listingId: string,
    @Body() body: ReorderMediaDto,
  ) {
    return this.mediaService.reorderListing(user, listingId, body.mediaIds);
  }

  @Put("room/:roomId/order")
  @Roles("host", "admin")
  @Ownership("room")
  reorderRoom(
    @CurrentUser() _user: any,
    @Param("roomId") roomId: string,
    @Body() body: ReorderMediaDto,
  ) {
    void roomId;
    void body;
    throw new GoneException("El orden y la portada se gestionan desde la galería del anuncio.");
  }
}
