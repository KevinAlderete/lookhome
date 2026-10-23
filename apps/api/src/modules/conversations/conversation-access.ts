import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";

export function hasValidConversationPair(
  hostUserId: string | null | undefined,
  participantUserIds: string[],
) {
  return Boolean(
    hostUserId &&
    participantUserIds.length === 2 &&
    participantUserIds.includes(hostUserId) &&
    participantUserIds[0] !== participantUserIds[1],
  );
}

export async function getAuthorizedConversation(
  prisma: PrismaService,
  userId: string,
  conversationId: string,
) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      listingId: true,
      roomId: true,
      listing: { select: { id: true, hostUserId: true } },
      room: {
        select: {
          id: true,
          listingId: true,
          listing: { select: { id: true, hostUserId: true } },
        },
      },
      participants: { select: { userId: true } },
    },
  });

  if (!conversation) throw new NotFoundException("Conversación no encontrada.");
  if (
    !conversation.participants.some(
      (participant) => participant.userId === userId,
    )
  ) {
    throw new NotFoundException("Conversación no encontrada.");
  }

  const listingId = conversation.listingId ?? conversation.room?.listingId;
  const hostUserId =
    conversation.listing?.hostUserId ?? conversation.room?.listing?.hostUserId;
  const participantUserIds = conversation.participants.map(
    (participant) => participant.userId,
  );

  if (
    !listingId ||
    (conversation.roomId && conversation.room?.listingId !== listingId) ||
    !hasValidConversationPair(hostUserId, participantUserIds)
  ) {
    // Hide malformed legacy conversations rather than disclose their context.
    throw new NotFoundException("Conversación no encontrada.");
  }

  return { ...conversation, listingId, hostUserId };
}
