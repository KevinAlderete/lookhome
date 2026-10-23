import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./database/prisma/prisma.module";

import { AuthModule } from "./modules/auth/auth.module";
import { ListingsModule } from "./modules/listings/listings.module";
import { RoomsModule } from "./modules/rooms/rooms.module";
import { MediaModule } from "./modules/media/media.module";
import { BookingsModule } from "./modules/bookings/bookings.module";
import { FavoritesModule } from "./modules/favorites/favorites.module";
import { AvailabilityModule } from "./modules/availability/availability.module";

import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { RolesGuard } from "./modules/auth/guards/roles.guard";
import { ThrottlerModule } from "@nestjs/throttler";
import { SearchModule } from "./modules/search/search.module";
import { ConversationsModule } from "./modules/conversations/conversations.module";
import { ReviewsModule } from "./modules/reviews/reviews.module";
import { ModerationModule } from "./modules/moderation/moderation.module";
import { UsersModule } from "./modules/users/users.module";
import { OwnershipGuard } from "./modules/auth/guards/ownership.guard";
import { MailerModule } from "./modules/mailer/mailer.module";
import { MessagesModule } from "./modules/messages/messages.module";
import { GeoModule } from "./modules/geo/geo.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { UserScopedThrottlerGuard } from "./modules/auth/guards/user-scoped-throttler.guard";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 20,
      },
    ]),
    PrismaModule,
    AuthModule,
    ListingsModule,
    RoomsModule,
    MediaModule,
    BookingsModule,
    FavoritesModule,
    AvailabilityModule,
    SearchModule,
    ConversationsModule,
    ReviewsModule,
    ModerationModule,
    UsersModule,
    MailerModule,
    MessagesModule,
    GeoModule,
    CatalogModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserScopedThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: OwnershipGuard,
    },
  ],
})
export class AppModule {}
