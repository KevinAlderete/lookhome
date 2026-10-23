import { Module } from "@nestjs/common";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { MediaCleanupService } from "./media-cleanup.service";
import { B2StorageService } from "./b2-storage.service";

@Module({
  controllers: [MediaController],
  providers: [MediaService, MediaCleanupService, B2StorageService],
  exports: [MediaService, B2StorageService],
})
export class MediaModule {}
