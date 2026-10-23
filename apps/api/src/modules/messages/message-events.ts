import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";

export const MESSAGE_EVENTS_CHANNEL = "lookhome_message_events";

export type MessageRealtimeEventType =
  | "message.created"
  | "message.updated"
  | "message.deleted"
  | "conversation.read"
  | "conversation.blocked"
  | "conversation.unblocked";

export type MessageRealtimeEvent = {
  id: string;
  type: MessageRealtimeEventType;
  userIds: string[];
  conversationId: string;
  actorUserId: string;
  messageId?: string;
  readAt?: string;
};

export async function publishMessageEvent(
  tx: Prisma.TransactionClient,
  event: Omit<MessageRealtimeEvent, "id">,
) {
  const payload: MessageRealtimeEvent = {
    ...event,
    id: randomUUID(),
    userIds: [...new Set(event.userIds)],
  };
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_notify(${MESSAGE_EVENTS_CHANNEL}, ${JSON.stringify(payload)})`,
  );
}
