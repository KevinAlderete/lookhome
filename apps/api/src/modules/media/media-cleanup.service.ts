import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MediaService } from "./media.service";

@Injectable()
export class MediaCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediaCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly media: MediaService) {}

  onModuleInit() {
    const configured = Number(process.env.MEDIA_CLEANUP_INTERVAL_MS);
    const intervalMs =
      Number.isSafeInteger(configured) && configured >= 60_000
        ? configured
        : 15 * 60_000;
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.media.maintainStorage();
    } catch (error) {
      this.logger.warn(
        `No se completó el mantenimiento de imágenes: ${error instanceof Error ? error.message : "error desconocido"}`,
      );
    } finally {
      this.running = false;
    }
  }
}
