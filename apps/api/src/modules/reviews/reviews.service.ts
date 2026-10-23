import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";
import { CreateReviewDto } from "./dto/create-review.dto";
import { VoteReviewDto } from "./dto/vote-review.dto";
import { FindPublicReviewsDto } from "./dto/find-public-reviews.dto";
import { roomsWithoutBlockingBookings } from "../../lib/public-listing-visibility";

const publicReviewSelect = {
  id: true,
  roomId: true,
  rating: true,
  comment: true,
  createdAt: true,
  reviewer: {
    select: {
      profile: { select: { displayName: true, photoUrl: true } },
    },
  },
} as const;

function publicReview(review: {
  id: string;
  roomId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  reviewer: { profile: { displayName: string | null; photoUrl: string | null } | null };
}) {
  return {
    id: review.id,
    roomId: review.roomId,
    rating: review.rating,
    comment: review.comment,
    createdAt: review.createdAt,
    authorName: review.reviewer.profile?.displayName?.trim() || "Huésped",
    authorPhotoUrl: review.reviewer.profile?.photoUrl ?? null,
  };
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyBookingReviewStatus(userId: string, bookingId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        tenantUserId: true,
        hostUserId: true,
        status: true,
      },
    });

    if (
      !booking ||
      (booking.tenantUserId !== userId && booking.hostUserId !== userId)
    ) {
      throw new NotFoundException("Solicitud no encontrada.");
    }

    const review = await this.prisma.review.findUnique({
      where: {
        bookingId_reviewerUserId: {
          bookingId,
          reviewerUserId: userId,
        },
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
      },
    });
    const bookingAllowsReview = booking.status === "completed";
    const revieweeUserId =
      booking.tenantUserId === userId
        ? booking.hostUserId
        : booking.tenantUserId;

    return {
      bookingId: booking.id,
      revieweeUserId,
      canReview: bookingAllowsReview && !review,
      reason: review
        ? "already_reviewed"
        : bookingAllowsReview
          ? null
          : "booking_not_reviewable",
      review,
    };
  }

  async createReview(userId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: dto.bookingId },
      include: {
        room: true,
      },
    });

    if (!booking) {
      throw new NotFoundException("Booking no encontrado.");
    }

    const isParticipant =
      booking.tenantUserId === userId || booking.hostUserId === userId;

    if (!isParticipant) {
      throw new ForbiddenException("No puedes reseñar este booking.");
    }

    if (booking.status !== "completed") {
      throw new BadRequestException(
        "La solicitud aún no figura como completada y no admite reseñas.",
      );
    }

    if (dto.revieweeUserId === userId) {
      throw new BadRequestException("No puedes reseñarte a ti mismo.");
    }
    const otherParticipantId = booking.tenantUserId === userId
      ? booking.hostUserId
      : booking.tenantUserId;
    if (dto.revieweeUserId !== otherParticipantId) {
      throw new BadRequestException("Solo puedes reseñar a la otra persona de la solicitud.");
    }

    let review: any;
    try {
      review = await this.prisma.review.create({
        data: {
          booking: {
            connect: { id: dto.bookingId },
          },
          reviewer: {
            connect: { id: userId },
          },
          reviewee: {
            connect: { id: dto.revieweeUserId },
          },
          room: {
            connect: { id: booking.roomId },
          },
          rating: dto.rating,
          comment: dto.comment?.trim() || null,
        },
        include: {
          reviewer: {
            select: {
              id: true,
              profile: { select: { displayName: true, photoUrl: true } },
            },
          },
          reviewee: {
            select: {
              id: true,
              profile: { select: { displayName: true, photoUrl: true } },
            },
          },
        },
      });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Ya enviaste una reseña para esta solicitud.",
        );
      }
      throw error;
    }

    return {
      message: "Review creada correctamente.",
      review,
    };
  }

  async voteReview(userId: string, dto: VoteReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: dto.reviewId },
      select: { id: true },
    });

    if (!review) {
      throw new NotFoundException("Review no encontrada.");
    }

    const vote = await this.prisma.reviewVote.upsert({
      where: {
        reviewId_userId: {
          reviewId: dto.reviewId,
          userId,
        },
      },
      update: {
        vote: dto.vote,
      },
      create: {
        reviewId: dto.reviewId,
        userId,
        vote: dto.vote,
      },
    });

    return {
      message: "Voto registrado correctamente.",
      vote,
    };
  }

  async listRoomReviews(roomId: string, query: FindPublicReviewsDto = {}) {
    const room = await this.prisma.room.findFirst({
      where: {
        id: roomId,
        status: "published",
        listing: {
          listingStatus: "published",
          deletedAt: null,
          rooms: roomsWithoutBlockingBookings(),
        },
      },
      select: { listing: { select: { hostUserId: true } } },
    });
    if (!room) throw new NotFoundException("Oferta no encontrada.");

    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(20, Math.max(1, Number(query.pageSize || 6)));
    const where = {
      roomId,
      revieweeUserId: room.listing.hostUserId,
      booking: { status: "completed" as const },
    };
    const [rows, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: publicReviewSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.aggregate({ where, _count: { _all: true }, _avg: { rating: true } }),
    ]);
    return {
      items: rows.map(publicReview),
      page,
      pageSize,
      total: summary._count._all,
      averageRating: summary._avg.rating,
      totalPages: Math.ceil(summary._count._all / pageSize),
    };
  }

  async listUserReviews(userId: string, query: FindPublicReviewsDto = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(20, Math.max(1, Number(query.pageSize || 6)));
    const where = {
      revieweeUserId: userId,
      booking: { status: "completed" as const },
      room: {
        status: "published" as const,
        listing: {
          hostUserId: userId,
          listingStatus: "published" as const,
          deletedAt: null,
          rooms: roomsWithoutBlockingBookings(),
        },
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: publicReviewSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items: rows.map(publicReview), page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }
}
