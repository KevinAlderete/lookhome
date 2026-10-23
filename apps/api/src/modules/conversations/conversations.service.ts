import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { listingWithoutBlockingBookings } from "../../lib/public-listing-visibility";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { FindConversationsQueryDto } from "./dto/find-conversations-query.dto";
import {
  getAuthorizedConversation,
  hasValidConversationPair,
} from "./conversation-access";
import { publishMessageEvent } from "../messages/message-events";

const PROFILE_SELECT = {
  displayName: true,
  photoUrl: true,
} as const;

function profileName(
  profile:
    | {
        displayName?: string | null;
      }
    | null
    | undefined,
) {
  return profile?.displayName?.trim() || "Participante";
}

function messagePreview(message: any) {
  if (!message) return "Aún no hay mensajes.";
  if (message.metadata?.deleted === true) return "Mensaje eliminado";
  const content = String(message.content ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!content) return "Mensaje";
  return content.length > 160 ? `${content.slice(0, 157)}…` : content;
}

function toConversationSummary(args: {
  conversation: any;
  listing: {
    id: string;
    title: string;
    hostUserId: string;
    host?: { profile?: any };
  };
  room: { id: string; name: string; status?: string } | null;
  currentUserId: string;
  relatedBooking?: { id: string; status: string } | null;
}) {
  const { conversation, listing, room, currentUserId, relatedBooking } = args;
  const hostParticipant = conversation.participants?.find(
    (participant: any) => participant.userId === listing.hostUserId,
  );
  const otherParticipant = conversation.participants?.find(
    (participant: any) => participant.userId !== currentUserId,
  );
  const hostProfile = hostParticipant?.user?.profile ?? listing.host?.profile;
  const lastMessage = conversation.messages?.[0] ?? null;
  const contextTitle = [listing.title, room?.name]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  return {
    id: conversation.id,
    listingId: listing.id,
    listingTitle: listing.title,
    roomId: room?.id ?? null,
    roomName: room?.name ?? null,
    contextIsPublic: true,
    contextTitle: contextTitle || "Conversación",
    participantName: profileName(hostProfile),
    participantAvatarUrl: hostProfile?.photoUrl ?? null,
    myRole: currentUserId === listing.hostUserId ? "host" : "tenant",
    lastMessage: messagePreview(lastMessage),
    lastMessageSenderName: lastMessage
      ? lastMessage.senderUserId === currentUserId
        ? "Tú"
        : profileName(hostProfile)
      : null,
    lastMessageAt:
      lastMessage?.createdAt ??
      conversation.updatedAt ??
      conversation.createdAt,
    unreadCount: 0,
    otherParticipantLastReadAt: otherParticipant?.lastReadAt ?? null,
    relatedBooking: relatedBooking
      ? { id: relatedBooking.id, status: relatedBooking.status }
      : null,
    updatedAt: conversation.updatedAt ?? conversation.createdAt,
  };
}

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createConversation(
    currentUserId: string,
    dto: CreateConversationDto,
  ): Promise<any> {
    if (!dto.listingId && !dto.roomId) {
      throw new BadRequestException("Debes indicar el anuncio o la unidad.");
    }
    if (dto.initialMessage !== undefined || dto.clientMessageId !== undefined) {
      if (!dto.initialMessage || !dto.clientMessageId) {
        throw new BadRequestException(
          "El primer mensaje y su identificador son obligatorios.",
        );
      }
      return this.startContact(currentUserId, dto);
    }

    return this.prisma.$transaction((tx) =>
      this.createConversationInTransaction(tx, currentUserId, dto),
    );
  }

  private async createConversationInTransaction(
    tx: Prisma.TransactionClient,
    currentUserId: string,
    dto: CreateConversationDto,
  ) {
    const room = dto.roomId
      ? await tx.room.findFirst({
          where: {
            id: dto.roomId,
            status: "published",
            listing: {
              listingStatus: "published",
              deletedAt: null,
            },
          },
            select: {
              id: true,
              name: true,
              listingId: true,
            },
          })
      : null;

    if (dto.roomId && !room) {
      throw new NotFoundException(
        "La unidad no está disponible para contacto.",
      );
    }
    if (room && dto.listingId && room.listingId !== dto.listingId) {
      throw new BadRequestException(
        "La unidad no pertenece al anuncio indicado.",
      );
    }

    const listingId = room?.listingId ?? dto.listingId;
    if (!listingId) {
      throw new NotFoundException(
        "El anuncio no está disponible para contacto.",
      );
    }

    const listingLockKey = `listing:${listingId}`;
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${listingLockKey}, 0))`,
    );
    const listing = await tx.listing.findFirst({
      where: {
        id: listingId,
        listingStatus: "published",
        deletedAt: null,
        ...listingWithoutBlockingBookings(),
      },
      select: {
        id: true,
        title: true,
        hostUserId: true,
        host: { select: { profile: { select: PROFILE_SELECT } } },
      },
    });

    if (!listing) {
      throw new NotFoundException(
        "El anuncio no está disponible para contacto.",
      );
    }
    if (listing.hostUserId === currentUserId) {
      throw new BadRequestException(
        "No puedes iniciar una conversación con tu propio anuncio.",
      );
    }

    const roomId = room?.id ?? null;
    const participantIds = [currentUserId, listing.hostUserId];
    const userPairLockKey = `user-pair:${[currentUserId, listing.hostUserId].sort().join(":")}`;
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${userPairLockKey}, 0))`,
    );
    const block = await tx.userBlock.findFirst({
      where: {
        OR: [
          { blockerUserId: currentUserId, blockedUserId: listing.hostUserId },
          { blockerUserId: listing.hostUserId, blockedUserId: currentUserId },
        ],
      },
      select: { blockerUserId: true },
    });
    if (block) {
      throw new NotFoundException("No se pudo iniciar la conversación.");
    }
    const lockKey = `${listing.id}:${roomId ?? "listing"}:${currentUserId}:${listing.hostUserId}`;

    // Context + participants is the conversation key. Serialize creation in PostgreSQL
    // so retries and simultaneous requests reuse the same row without a schema migration.
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );

    const candidates = await tx.conversation.findMany({
      where: {
        listingId: listing.id,
        roomId,
        participants: {
          every: { userId: { in: participantIds } },
        },
      },
      select: {
        id: true,
        listingId: true,
        roomId: true,
        createdAt: true,
        updatedAt: true,
        participants: {
          select: {
            userId: true,
            lastReadAt: true,
            user: { select: { profile: { select: PROFILE_SELECT } } },
          },
        },
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            content: true,
            senderUserId: true,
            createdAt: true,
            metadata: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    const existing = candidates.find((candidate) => {
      const ids = candidate.participants.map(
        (participant) => participant.userId,
      );
      return (
        hasValidConversationPair(listing.hostUserId, ids) &&
        ids.includes(currentUserId)
      );
    });

    const relatedBooking = await tx.booking.findFirst({
      where: {
        hostUserId: listing.hostUserId,
        tenantUserId: currentUserId,
        ...(roomId ? { roomId } : { room: { listingId: listing.id } }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true, status: true },
    });

    if (existing) {
      return {
        message: "La conversación ya existía.",
        conversation: toConversationSummary({
          conversation: existing,
          listing,
          room: room ? { id: room.id, name: room.name } : null,
          currentUserId,
          relatedBooking,
        }),
        created: false,
      };
    }

    const conversation = await tx.conversation.create({
      data: {
        listing: { connect: { id: listing.id } },
        ...(roomId ? { room: { connect: { id: roomId } } } : {}),
        participants: {
          create: [
            {
              user: { connect: { id: currentUserId } },
              role: "tenant",
            },
            {
              user: { connect: { id: listing.hostUserId } },
              role: "host",
            },
          ],
        },
      },
      select: {
        id: true,
        listingId: true,
        roomId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      message: "Conversación creada correctamente.",
      conversation: toConversationSummary({
        conversation: {
          ...conversation,
          participants: participantIds.map((userId) => ({
            userId,
            user: { profile: null },
          })),
        },
        listing,
        room: room ? { id: room.id, name: room.name } : null,
        currentUserId,
        relatedBooking,
      }),
      created: true,
    };
  }

  private async startContact(
    currentUserId: string,
    dto: CreateConversationDto,
  ) {
    const content = dto.initialMessage?.trim();
    const clientMessageId = dto.clientMessageId;
    if (!content) {
      throw new BadRequestException(
        "Escribe un mensaje para iniciar la conversación.",
      );
    }
    if (content.length > 2000) {
      throw new BadRequestException(
        "El mensaje no puede superar 2000 caracteres.",
      );
    }
    if (!clientMessageId) {
      throw new BadRequestException(
        "El identificador del mensaje es obligatorio.",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await this.createConversationInTransaction(
        tx,
        currentUserId,
        dto,
      );
      const conversationId = result.conversation.id;
      const recipient = await tx.conversationParticipant.findFirst({
        where: { conversationId, userId: { not: currentUserId } },
        select: { userId: true },
      });
      if (!recipient)
        throw new NotFoundException("Conversación no encontrada.");

      const pairLockKey = `user-pair:${[currentUserId, recipient.userId].sort().join(":")}`;
      const messageLockKey = `${conversationId}:${currentUserId}:${clientMessageId}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${pairLockKey}, 0))`,
      );
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${messageLockKey}, 0))`,
      );

      const existing = await tx.message.findFirst({
        where: {
          conversationId,
          senderUserId: currentUserId,
          metadata: { path: ["clientMessageId"], equals: clientMessageId },
        },
        include: {
          sender: {
            select: {
              id: true,
              profile: { select: PROFILE_SELECT },
            },
          },
        },
      });
      if (existing && existing.content !== content) {
        throw new BadRequestException(
          "El identificador de reintento ya se usó para otro mensaje.",
        );
      }

      const created =
        existing ??
        (await tx.message.create({
          data: {
            conversation: { connect: { id: conversationId } },
            sender: { connect: { id: currentUserId } },
            type: "text",
            content,
            metadata: {
              edited: false,
              clientMessageId,
            } as Prisma.InputJsonValue,
          },
          include: {
            sender: {
              select: {
                id: true,
                profile: { select: PROFILE_SELECT },
              },
            },
          },
        }));

      if (!existing) {
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: created.createdAt },
        });
        await tx.conversationParticipant.update({
          where: {
            conversationId_userId: {
              conversationId,
              userId: currentUserId,
            },
          },
          data: { lastReadAt: created.createdAt },
        });

        const preferences = await tx.notificationPreference.findUnique({
          where: { userId: recipient.userId },
          select: { prefs: true },
        });
        const prefs =
          preferences?.prefs && typeof preferences.prefs === "object"
            ? (preferences.prefs as Record<string, unknown>)
            : {};
        if (prefs.messages !== false) {
          await tx.notification.create({
            data: {
              user: { connect: { id: recipient.userId } },
              type: "message.received",
              title: "Nuevo mensaje",
              body: "Tienes un mensaje nuevo en una conversación.",
              status: "sent",
              data: {
                conversationId,
                messageId: created.id,
                perspective:
                  result.conversation.myRole === "host" ? "tenant" : "host",
              } as Prisma.InputJsonValue,
              sentAt: created.createdAt,
            },
          });
        }
        await publishMessageEvent(tx, {
          type: "message.created",
          userIds: [recipient.userId],
          conversationId,
          actorUserId: currentUserId,
          messageId: created.id,
        });
      }

      return {
        ...result,
        conversation: existing
          ? result.conversation
          : {
              ...result.conversation,
              lastMessage: content,
              lastMessageSenderName: "Tú",
              lastMessageAt: created.createdAt,
              updatedAt: created.createdAt,
            },
        initialMessage: {
          id: created.id,
          conversationId: created.conversationId,
          senderUserId: created.senderUserId,
          type: created.type,
          content: created.content,
          createdAt: created.createdAt,
          sender: created.sender,
        },
      };
    });
  }

  async getBlockStatus(userId: string, conversationId: string) {
    const conversation = await getAuthorizedConversation(
      this.prisma,
      userId,
      conversationId,
    );
    const otherUserId = conversation.participants.find(
      (item) => item.userId !== userId,
    )?.userId;
    if (!otherUserId)
      throw new NotFoundException("Conversación no encontrada.");
    const rows = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          { blockerUserId: userId, blockedUserId: otherUserId },
          { blockerUserId: otherUserId, blockedUserId: userId },
        ],
      },
      select: { blockerUserId: true },
    });
    return {
      blockedByMe: rows.some((row) => row.blockerUserId === userId),
      blockedMe: rows.some((row) => row.blockerUserId === otherUserId),
    };
  }

  async blockParticipant(userId: string, conversationId: string) {
    const conversation = await getAuthorizedConversation(
      this.prisma,
      userId,
      conversationId,
    );
    const otherUserId = conversation.participants.find(
      (item) => item.userId !== userId,
    )?.userId;
    if (!otherUserId)
      throw new NotFoundException("Conversación no encontrada.");
    const lockKey = `user-pair:${[userId, otherUserId].sort().join(":")}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      await tx.userBlock.upsert({
        where: {
          blockerUserId_blockedUserId: {
            blockerUserId: userId,
            blockedUserId: otherUserId,
          },
        },
        update: {},
        create: { blockerUserId: userId, blockedUserId: otherUserId },
      });
      await publishMessageEvent(tx, {
        type: "conversation.blocked",
        userIds: [otherUserId],
        conversationId,
        actorUserId: userId,
      });
    });
    return this.getBlockStatus(userId, conversationId);
  }

  async unblockParticipant(userId: string, conversationId: string) {
    const conversation = await getAuthorizedConversation(
      this.prisma,
      userId,
      conversationId,
    );
    const otherUserId = conversation.participants.find(
      (item) => item.userId !== userId,
    )?.userId;
    if (!otherUserId)
      throw new NotFoundException("Conversación no encontrada.");
    const lockKey = `user-pair:${[userId, otherUserId].sort().join(":")}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
      await tx.userBlock.deleteMany({
        where: { blockerUserId: userId, blockedUserId: otherUserId },
      });
      await publishMessageEvent(tx, {
        type: "conversation.unblocked",
        userIds: [otherUserId],
        conversationId,
        actorUserId: userId,
      });
    });
    return this.getBlockStatus(userId, conversationId);
  }

  async listMine(userId: string, query: FindConversationsQueryDto = {}) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 25)));
    const where: Prisma.ConversationWhereInput = {
      participants: { some: { userId } },
      ...(query.conversationId ? { id: query.conversationId } : {}),
      ...(query.perspective
        ? {
            OR: [
              {
                listing: {
                  hostUserId:
                    query.perspective === "host" ? userId : { not: userId },
                },
              },
              {
                listingId: null,
                room: {
                  listing: {
                    hostUserId:
                      query.perspective === "host" ? userId : { not: userId },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const filters: Prisma.ConversationWhereInput[] = Array.isArray(where.AND)
      ? [...where.AND]
      : where.AND
        ? [where.AND as Prisma.ConversationWhereInput]
        : [];
    const search = query.search?.trim();
    if (search) {
      filters.push({
        OR: [
          { listing: { title: { contains: search, mode: "insensitive" } } },
          { room: { name: { contains: search, mode: "insensitive" } } },
          {
            participants: {
              some: {
                userId: { not: userId },
                user: {
                  profile: {
                    displayName: { contains: search, mode: "insensitive" },
                  },
                },
              },
            },
          },
        ],
      });
    }
    if (query.unreadOnly) {
      const unreadIds = await this.findUnreadConversationIds(
        userId,
        query.perspective,
      );
      filters.push({ id: { in: unreadIds } });
    }
    if (filters.length) where.AND = filters;

    const rows = await this.prisma.conversation.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: query.conversationId ? 1 : pageSize + 1,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            hostUserId: true,
            listingStatus: true,
            deletedAt: true,
          },
        },
        room: {
          select: {
            id: true,
            name: true,
            status: true,
            listingId: true,
            listing: {
              select: {
                id: true,
                title: true,
                hostUserId: true,
                listingStatus: true,
                deletedAt: true,
              },
            },
          },
        },
        participants: {
          select: {
            userId: true,
            role: true,
            lastReadAt: true,
            user: {
              select: {
                id: true,
                profile: { select: PROFILE_SELECT },
              },
            },
          },
        },
        messages: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            content: true,
            type: true,
            createdAt: true,
            senderUserId: true,
            metadata: true,
          },
        },
      },
    });
    const hasMore = rows.length > pageSize;
    const pageRows = rows.slice(0, pageSize);

    const validRows = pageRows.filter((row) => {
      const listingId = row.listingId ?? row.room?.listingId;
      const hostUserId =
        row.listing?.hostUserId ?? row.room?.listing?.hostUserId;
      const contextListing = row.listing ?? row.room?.listing;
      const participantIds = row.participants.map(
        (participant) => participant.userId,
      );
      return (
        Boolean(listingId) &&
        (!row.roomId || row.room?.listingId === listingId) &&
        participantIds.includes(userId) &&
        hasValidConversationPair(hostUserId, participantIds)
      );
    });

    const unreadCounts = await this.getUnreadCounts(
      userId,
      validRows.map((row) => row.id),
    );
    const bookingMatches = validRows.flatMap((row) => {
      const listingId = row.listingId ?? row.room?.listingId;
      const hostUserId =
        row.listing?.hostUserId ?? row.room?.listing?.hostUserId;
      const tenant = row.participants.find(
        (participant) => participant.userId !== hostUserId,
      );
      if (!listingId || !hostUserId || !tenant) return [];

      return [
        row.roomId
          ? {
              roomId: row.roomId,
              hostUserId,
              tenantUserId: tenant.userId,
            }
          : {
              hostUserId,
              tenantUserId: tenant.userId,
              room: { listingId },
            },
      ];
    });

    const relatedBookings = bookingMatches.length
      ? await this.prisma.booking.findMany({
          where: { OR: bookingMatches },
          select: {
            id: true,
            roomId: true,
            hostUserId: true,
            tenantUserId: true,
            status: true,
            createdAt: true,
            room: { select: { listingId: true } },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 500,
        })
      : [];

    const items = validRows.map((row) => {
      const listingId = row.listingId ?? row.room?.listingId ?? null;
      const listingTitle =
        row.listing?.title ?? row.room?.listing?.title ?? null;
      const hostUserId =
        row.listing?.hostUserId ?? row.room?.listing?.hostUserId;
      const contextListing = row.listing ?? row.room?.listing;
      const otherParticipant = row.participants.find(
        (participant) => participant.userId !== userId,
      );
      const lastMessage = row.messages[0] ?? null;
      const lastMessageSenderName = lastMessage
        ? lastMessage.senderUserId === userId
          ? "Tú"
          : profileName(otherParticipant?.user.profile)
        : null;
      const relatedBooking = relatedBookings.find(
        (booking) =>
          booking.hostUserId === hostUserId &&
          booking.tenantUserId === otherParticipant?.userId &&
          (row.roomId
            ? booking.roomId === row.roomId
            : booking.room.listingId === listingId),
      );
      const contextTitle =
        [listingTitle, row.room?.name]
          .filter((part): part is string => Boolean(part))
          .join(" · ") || "Conversación";

      return {
        id: row.id,
        listingId,
        listingTitle,
        roomId: row.roomId,
        roomName: row.room?.name ?? null,
        contextIsPublic:
          contextListing?.listingStatus === "published" &&
          contextListing.deletedAt == null &&
          (!row.roomId || row.room?.status === "published"),
        contextTitle,
        participantName: profileName(otherParticipant?.user.profile),
        participantAvatarUrl: otherParticipant?.user.profile?.photoUrl ?? null,
        myRole: userId === hostUserId ? "host" : "tenant",
        lastMessage: messagePreview(lastMessage),
        lastMessageSenderName,
        lastMessageAt: lastMessage?.createdAt ?? row.updatedAt,
        unreadCount: unreadCounts.get(row.id) ?? 0,
        otherParticipantLastReadAt: otherParticipant?.lastReadAt ?? null,
        relatedBooking: relatedBooking
          ? { id: relatedBooking.id, status: relatedBooking.status }
          : null,
        updatedAt: row.updatedAt,
      };
    });

    return {
      items,
      page,
      pageSize,
      hasMore,
    };
  }

  private async findUnreadConversationIds(
    userId: string,
    perspective?: "tenant" | "host",
  ) {
    const perspectiveCondition =
      perspective === "host"
        ? Prisma.sql`l.host_user_id = ${userId}::uuid`
        : perspective === "tenant"
          ? Prisma.sql`l.host_user_id <> ${userId}::uuid`
          : Prisma.sql`TRUE`;
    const rows = await this.prisma.$queryRaw<
      Array<{ conversationId: string }>
    >(Prisma.sql`
      SELECT cp.conversation_id AS "conversationId"
      FROM conversation_participants cp
      JOIN conversations c ON c.id = cp.conversation_id
      LEFT JOIN rooms r ON r.id = c.room_id
      JOIN listings l ON l.id = COALESCE(c.listing_id, r.listing_id)
      WHERE cp.user_id = ${userId}::uuid
        AND ${perspectiveCondition}
        AND EXISTS (
          SELECT 1
          FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_user_id <> ${userId}::uuid
            AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
            AND m.metadata->>'deleted' IS DISTINCT FROM 'true'
        )
    `);
    return rows.map((row) => row.conversationId);
  }

  private async getUnreadCounts(userId: string, conversationIds: string[]) {
    if (!conversationIds.length) return new Map<string, number>();

    const rows = await this.prisma.$queryRaw<
      Array<{ conversationId: string; unreadCount: number }>
    >(Prisma.sql`
      SELECT
        cp.conversation_id AS "conversationId",
        COUNT(m.id)::int AS "unreadCount"
      FROM conversation_participants cp
      LEFT JOIN messages m
        ON m.conversation_id = cp.conversation_id
        AND m.sender_user_id <> ${userId}::uuid
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        AND m.metadata->>'deleted' IS DISTINCT FROM 'true'
      WHERE cp.user_id = ${userId}::uuid
        AND cp.conversation_id IN (${Prisma.join(
          conversationIds.map((id) => Prisma.sql`${id}::uuid`),
        )})
      GROUP BY cp.conversation_id
    `);

    return new Map(
      rows.map((row) => [row.conversationId, Number(row.unreadCount)]),
    );
  }

  async findOne(userId: string, conversationId: string) {
    await getAuthorizedConversation(this.prisma, userId, conversationId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        listingId: true,
        roomId: true,
        createdAt: true,
        updatedAt: true,
        listing: { select: { id: true, title: true } },
        room: { select: { id: true, name: true, listingId: true } },
        participants: {
          select: {
            userId: true,
            role: true,
            user: { select: { profile: { select: PROFILE_SELECT } } },
          },
        },
      },
    });

    if (!conversation)
      throw new NotFoundException("Conversación no encontrada.");

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        type: true,
        content: true,
        metadata: true,
        createdAt: true,
        sender: { select: { profile: { select: PROFILE_SELECT } } },
      },
    });

    return {
      ...conversation,
      messages: messages.reverse().map((message) => {
        const metadata =
          message.metadata && typeof message.metadata === "object"
            ? (message.metadata as Record<string, unknown>)
            : {};
        return {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderUserId,
          senderName: profileName(message.sender.profile),
          type: message.type,
          content: metadata.deleted === true ? null : message.content,
          createdAt: message.createdAt,
          edited: metadata.edited === true,
          deleted: metadata.deleted === true,
        };
      }),
    };
  }
}
