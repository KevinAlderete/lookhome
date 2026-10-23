import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";
import { toPublicUnit } from "../../lib/public-catalog";
import {
  listingWithoutBlockingBookings,
  PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES,
} from "../../lib/public-listing-visibility";
import { ToggleFavoriteDto } from "./dto/toggle-favorite.dto";

export type FavoriteUnavailableReason =
  | "listing_deleted"
  | "listing_draft"
  | "listing_pending_review"
  | "listing_paused"
  | "listing_suspended"
  | "listing_archived"
  | "offer_draft"
  | "offer_paused"
  | "booking_accepted"
  | "booking_active"
  | "booking_disputed";

function getUnavailableReason(room: any): FavoriteUnavailableReason | null {
  const listing = room?.listing;
  if (!listing || listing.deletedAt) return "listing_deleted";

  const listingReasons: Record<string, FavoriteUnavailableReason> = {
    draft: "listing_draft",
    pending_review: "listing_pending_review",
    paused: "listing_paused",
    suspended: "listing_suspended",
    archived: "listing_archived",
  };
  if (listing.listingStatus !== "published") {
    return listingReasons[listing.listingStatus] ?? "listing_draft";
  }

  if (room.status === "draft") return "offer_draft";
  if (room.status === "paused") return "offer_paused";
  if (room.status !== "published") return "offer_draft";

  const bookingStatuses = new Set(
    (room.bookings ?? []).map((booking: { status: string }) => booking.status),
  );
  if (bookingStatuses.has("disputed")) return "booking_disputed";
  if (bookingStatuses.has("active")) return "booking_active";
  if (bookingStatuses.has("accepted")) return "booking_accepted";
  return null;
}

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async add(input: ToggleFavoriteDto) {
    const [user, room] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      }),
      this.prisma.room.findFirst({
        where: {
          id: input.roomId,
          status: "published",
          listing: {
            listingStatus: "published",
            ...listingWithoutBlockingBookings(),
          },
        },
        select: { id: true },
      }),
    ]);

    if (!user) {
      throw new BadRequestException("userId no existe.");
    }

    if (!room) {
      throw new BadRequestException("La habitación no está disponible.");
    }

    const favorite = await this.prisma.favorite.upsert({
      where: {
        userId_roomId: {
          userId: input.userId,
          roomId: input.roomId,
        },
      },
      update: {},
      create: {
        userId: input.userId,
        roomId: input.roomId,
      },
    });

    return {
      message: "Favorito agregado correctamente.",
      favorite,
    };
  }

  async remove(input: ToggleFavoriteDto) {
    const exists = await this.prisma.favorite.findUnique({
      where: {
        userId_roomId: {
          userId: input.userId,
          roomId: input.roomId,
        },
      },
    });

    if (!exists) {
      throw new NotFoundException("Favorito no encontrado.");
    }

    await this.prisma.favorite.delete({
      where: {
        userId_roomId: {
          userId: input.userId,
          roomId: input.roomId,
        },
      },
    });

    return {
      message: "Favorito eliminado correctamente.",
    };
  }

  async listByUser(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: {
        userId,
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        room: {
          include: {
            pricing: true,
            bookings: {
              where: {
                status: {
                  in: [...PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES],
                },
              },
              select: { status: true },
            },
            media: {
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
              include: {
                media: true,
              },
            },
            listing: {
              include: {
                address: {
                  select: {
                    countryCode: true,
                    line1: true,
                    lat: true,
                    lng: true,
                    region: { select: { name: true } },
                    city: { select: { name: true } },
                    district: { select: { name: true } },
                  },
                },
                media: {
                  where: { isCover: true },
                  take: 1,
                  include: { media: true },
                },
              },
            },
          },
        },
      },
    });

    return favorites.map((favorite) => ({
      ...favorite,
      availabilityReason: getUnavailableReason(favorite.room),
      room: toPublicUnit(favorite.room),
    }));
  }
}
