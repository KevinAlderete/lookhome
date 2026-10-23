import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateMessageDto } from "./dto/update-message.dto";
import { ListMessagesQueryDto } from "./dto/list-messages-query.dto";
import { getAuthorizedConversation } from "../conversations/conversation-access";
import { publishMessageEvent } from "./message-events";

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  private toInputJsonValue(value?: Record<string, any>): Prisma.InputJsonValue {
    return (value ?? {}) as Prisma.InputJsonValue;
  }

  private toMessageResponse(message: any) {
    const metadata =
      message.metadata && typeof message.metadata === "object"
        ? (message.metadata as Record<string, unknown>)
        : {};
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      type: message.type,
      content: metadata.deleted === true ? null : message.content,
      createdAt: message.createdAt,
      sender: message.sender,
      edited: metadata.edited === true,
      deleted: metadata.deleted === true,
    };
  }

  async sendMessage(userId: string, dto: SendMessageDto) {
    const authorized = await getAuthorizedConversation(
      this.prisma,
      userId,
      dto.conversationId,
    );
    const recipientUserId = authorized.participants.find(
      (participant) => participant.userId !== userId,
    )?.userId;
    if (!recipientUserId)
      throw new NotFoundException("Conversación no encontrada.");
    const content = dto.content?.trim() || null;
    if (dto.type !== "text" || dto.mediaIds?.length) {
      throw new BadRequestException(
        "En esta versión solo se admiten mensajes de texto.",
      );
    }
    if (!content) {
      throw new BadRequestException("Escribe un mensaje antes de enviarlo.");
    }

    if (content.length > 2000) {
      throw new BadRequestException(
        "El mensaje no puede superar 2000 caracteres.",
      );
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const pairLockKey = `user-pair:${[userId, recipientUserId].sort().join(":")}`;
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${pairLockKey}, 0))`,
      );
      const block = await tx.userBlock.findFirst({
        where: {
          OR: [
            { blockerUserId: userId, blockedUserId: recipientUserId },
            { blockerUserId: recipientUserId, blockedUserId: userId },
          ],
        },
        select: { blockerUserId: true },
      });
      if (block) {
        throw new ForbiddenException(
          "No puedes enviar mensajes en esta conversación.",
        );
      }

      if (dto.clientMessageId) {
        const lockKey = `${dto.conversationId}:${userId}:${dto.clientMessageId}`;
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
        );

        const existing = await tx.message.findFirst({
          where: {
            conversationId: dto.conversationId,
            senderUserId: userId,
            metadata: {
              path: ["clientMessageId"],
              equals: dto.clientMessageId,
            },
          },
          include: {
            sender: {
              select: {
                id: true,
                profile: {
                  select: {
                    displayName: true,
                    photoUrl: true,
                  },
                },
              },
            },
          },
        });
        if (existing) {
          if (existing.content !== content) {
            throw new BadRequestException(
              "El identificador de reintento ya se usó para otro mensaje.",
            );
          }
          return existing;
        }
      }

      const created = await tx.message.create({
        data: {
          conversation: {
            connect: { id: dto.conversationId },
          },
          sender: {
            connect: { id: userId },
          },
          type: "text",
          content,
          metadata: this.toInputJsonValue({
            edited: false,
            ...(dto.clientMessageId
              ? { clientMessageId: dto.clientMessageId }
              : {}),
          }),
        },
        include: {
          sender: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                  photoUrl: true,
                },
              },
            },
          },
        },
      });

      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: {
          updatedAt: new Date(),
        },
      });

      await tx.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: dto.conversationId,
            userId,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });

      const preferences = await tx.notificationPreference.findUnique({
        where: { userId: recipientUserId },
        select: { prefs: true },
      });
      const prefs =
        preferences?.prefs && typeof preferences.prefs === "object"
          ? (preferences.prefs as Record<string, unknown>)
          : {};
      if (prefs.messages !== false) {
        await tx.notification.create({
          data: {
            user: { connect: { id: recipientUserId } },
            type: "message.received",
            title: "Nuevo mensaje",
            body: "Tienes un mensaje nuevo en una conversación.",
            status: "sent",
            data: this.toInputJsonValue({
              conversationId: dto.conversationId,
              messageId: created.id,
              perspective:
                recipientUserId === authorized.hostUserId ? "host" : "tenant",
            }),
            sentAt: new Date(),
          },
        });
      }
      await publishMessageEvent(tx, {
        type: "message.created",
        userIds: [recipientUserId],
        conversationId: dto.conversationId,
        actorUserId: userId,
        messageId: created.id,
      });

      return created;
    });

    return {
      message: "Mensaje enviado correctamente.",
      item: this.toMessageResponse(message),
    };
  }

  async listConversationMessages(
    userId: string,
    conversationId: string,
    query: ListMessagesQueryDto,
  ) {
    await getAuthorizedConversation(this.prisma, userId, conversationId);

    const hasBeforeDate = Boolean(query.beforeCreatedAt);
    const hasBeforeId = Boolean(query.beforeId);
    const hasAfterDate = Boolean(query.afterCreatedAt);
    const hasAfterId = Boolean(query.afterId);
    if (hasBeforeDate !== hasBeforeId || hasAfterDate !== hasAfterId) {
      throw new BadRequestException("El cursor de mensajes está incompleto.");
    }
    if (hasBeforeDate && hasAfterDate) {
      throw new BadRequestException(
        "Usa el cursor anterior o posterior, no ambos a la vez.",
      );
    }

    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 30)));
    const where: any = { conversationId };
    if (hasBeforeDate && query.beforeCreatedAt && query.beforeId) {
      const before = new Date(query.beforeCreatedAt);
      where.OR = [
        { createdAt: { lt: before } },
        { createdAt: before, id: { lt: query.beforeId } },
      ];
    }
    if (hasAfterDate && query.afterCreatedAt && query.afterId) {
      const after = new Date(query.afterCreatedAt);
      where.OR = [
        { createdAt: { gt: after } },
        { createdAt: after, id: { gt: query.afterId } },
      ];
    }

    const orderBy = hasAfterDate
      ? [{ createdAt: "asc" as const }, { id: "asc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const syncedAt = new Date().toISOString();
    const select = {
      id: true,
      conversationId: true,
      senderUserId: true,
      type: true,
      content: true,
      metadata: true,
      createdAt: true,
      sender: {
        select: {
          id: true,
          profile: {
            select: {
              displayName: true,
              photoUrl: true,
            },
          },
        },
      },
    } as const;
    const [fetched, changedIds] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy,
        ...(hasBeforeDate || hasAfterDate
          ? {}
          : { skip: (page - 1) * pageSize }),
        take: pageSize + 1,
        select,
      }),
      query.changedSince
        ? this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
            SELECT id
            FROM messages
            WHERE conversation_id = ${conversationId}::uuid
              AND (
                (
                  metadata->>'editedAt' IS NOT NULL
                  AND (metadata->>'editedAt')::timestamptz >= ${query.changedSince}::timestamptz
                )
                OR (
                  metadata->>'deletedAt' IS NOT NULL
                  AND (metadata->>'deletedAt')::timestamptz >= ${query.changedSince}::timestamptz
                )
              )
            ORDER BY created_at DESC, id DESC
            LIMIT 500
          `)
        : Promise.resolve([]),
    ]);

    const hasMore = fetched.length > pageSize;
    const pageItems = fetched.slice(0, pageSize);
    const changedItems = changedIds.length
      ? await this.prisma.message.findMany({
          where: {
            conversationId,
            id: { in: changedIds.map((item) => item.id) },
          },
          select,
        })
      : [];
    const byId = new Map<string, (typeof pageItems)[number]>();
    for (const item of [...pageItems, ...changedItems]) byId.set(item.id, item);
    const items = [...byId.values()]
      .sort((a, b) => {
        const timeOrder = a.createdAt.getTime() - b.createdAt.getTime();
        return (
          (hasAfterDate ? timeOrder : -timeOrder) ||
          (hasAfterDate ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id))
        );
      })
      .map((item) => {
        const metadata =
          item.metadata && typeof item.metadata === "object"
            ? (item.metadata as Record<string, unknown>)
            : {};
        const deleted = metadata.deleted === true;
        return {
          id: item.id,
          conversationId: item.conversationId,
          senderUserId: item.senderUserId,
          type: item.type,
          content: deleted ? null : item.content,
          createdAt: item.createdAt,
          sender: item.sender,
          edited: metadata.edited === true,
          deleted,
        };
      });
    const cursorMessage = pageItems.length
      ? pageItems[pageItems.length - 1]
      : null;

    return {
      pageSize,
      hasMore,
      nextCursor:
        hasMore && cursorMessage
          ? { createdAt: cursorMessage.createdAt, id: cursorMessage.id }
          : null,
      items,
      syncedAt,
    };
  }

  async updateMessage(
    userId: string,
    messageId: string,
    dto: UpdateMessageDto,
  ) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        type: true,
        content: true,
        metadata: true,
      },
    });

    if (!message) {
      throw new NotFoundException("Mensaje no encontrado.");
    }

    const authorized = await getAuthorizedConversation(
      this.prisma,
      userId,
      message.conversationId,
    );
    if (message.senderUserId !== userId) {
      throw new ForbiddenException("Solo puedes editar tus propios mensajes.");
    }

    if (message.type !== "text") {
      throw new BadRequestException(
        "Solo los mensajes de texto pueden editarse.",
      );
    }

    const currentMetadata =
      message.metadata && typeof message.metadata === "object"
        ? (message.metadata as Record<string, any>)
        : {};
    if (currentMetadata.deleted === true) {
      throw new BadRequestException("No puedes editar un mensaje eliminado.");
    }
    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException("El mensaje no puede quedar vacío.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedMessage = await tx.message.update({
        where: { id: messageId },
        data: {
          content,
          metadata: this.toInputJsonValue({
            ...currentMetadata,
            edited: true,
            editedAt: new Date().toISOString(),
          }),
        },
        select: {
          id: true,
          conversationId: true,
          senderUserId: true,
          type: true,
          content: true,
          metadata: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                  photoUrl: true,
                },
              },
            },
          },
        },
      });
      await tx.conversation.update({
        where: { id: message.conversationId },
        data: { updatedAt: new Date() },
      });
      await publishMessageEvent(tx, {
        type: "message.updated",
        userIds: authorized.participants
          .map((participant) => participant.userId)
          .filter((participantId) => participantId !== userId),
        conversationId: message.conversationId,
        actorUserId: userId,
        messageId,
      });
      return updatedMessage;
    });

    return {
      message: "Mensaje actualizado correctamente.",
      item: this.toMessageResponse(updated),
    };
  }

  async removeMessage(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        senderUserId: true,
        metadata: true,
      },
    });

    if (!message) {
      throw new NotFoundException("Mensaje no encontrado.");
    }

    const authorized = await getAuthorizedConversation(
      this.prisma,
      userId,
      message.conversationId,
    );
    if (message.senderUserId !== userId) {
      throw new ForbiddenException(
        "Solo puedes eliminar tus propios mensajes.",
      );
    }

    const currentMetadata =
      message.metadata && typeof message.metadata === "object"
        ? (message.metadata as Record<string, any>)
        : {};

    if (currentMetadata.deleted === true) {
      throw new BadRequestException("El mensaje ya fue eliminado.");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedMessage = await tx.message.update({
        where: { id: messageId },
        data: {
          content: null,
          metadata: this.toInputJsonValue({
            ...currentMetadata,
            deleted: true,
            deletedAt: new Date().toISOString(),
          }),
        },
        select: {
          id: true,
          conversationId: true,
          senderUserId: true,
          type: true,
          content: true,
          metadata: true,
          createdAt: true,
          sender: {
            select: {
              id: true,
              profile: {
                select: {
                  displayName: true,
                  photoUrl: true,
                },
              },
            },
          },
        },
      });
      await tx.conversation.update({
        where: { id: message.conversationId },
        data: { updatedAt: new Date() },
      });
      await publishMessageEvent(tx, {
        type: "message.deleted",
        userIds: authorized.participants
          .map((participant) => participant.userId)
          .filter((participantId) => participantId !== userId),
        conversationId: message.conversationId,
        actorUserId: userId,
        messageId,
      });
      return updatedMessage;
    });

    return {
      message: "Mensaje eliminado correctamente.",
      item: this.toMessageResponse(updated),
    };
  }

  async markConversationRead(userId: string, conversationId: string) {
    const authorized = await getAuthorizedConversation(
      this.prisma,
      userId,
      conversationId,
    );
    const readAt = new Date();
    const otherUserIds = authorized.participants
      .map((participant) => participant.userId)
      .filter((participantId) => participantId !== userId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const participant = await tx.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
        data: { lastReadAt: readAt },
      });
      await publishMessageEvent(tx, {
        type: "conversation.read",
        userIds: otherUserIds,
        conversationId,
        actorUserId: userId,
        readAt: readAt.toISOString(),
      });
      return participant;
    });

    return {
      message: "Conversación marcada como leída.",
      participant: updated,
    };
  }
}
