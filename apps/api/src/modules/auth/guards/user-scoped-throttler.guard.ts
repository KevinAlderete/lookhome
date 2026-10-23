import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";

@Injectable()
export class UserScopedThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(request: Record<string, any>): Promise<string> {
    const userId = request.user?.id;
    if (typeof userId === "string" && userId) return `user:${userId}`;
    return request.ip ?? request.socket?.remoteAddress ?? "unknown";
  }
}
