import type {
  ChatMessageItem,
  ConversationListItem,
  ConversationPage,
  MessagePage,
} from "./types";

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

export function profileDisplayName(profile: any): string {
  const fullName = [profile?.firstName, profile?.lastName]
    .filter(
      (part: unknown): part is string =>
        typeof part === "string" && Boolean(part.trim()),
    )
    .join(" ");
  return String(profile?.displayName?.trim() || fullName || "Participante");
}

export function formatMessageDateTime(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
}

function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`La API devolvió una conversación sin ${label}.`);
  }
  return value;
}

export function normalizeConversation(raw: any): ConversationListItem {
  const id = requiredId(
    firstDefined(raw?.id, raw?.conversationId),
    "identificador",
  );
  const unreadCount = Number(raw?.unreadCount ?? 0);

  return {
    id,
    listingId: raw?.listingId ? String(raw.listingId) : null,
    listingTitle: raw?.listingTitle ? String(raw.listingTitle) : null,
    roomId: raw?.roomId ? String(raw.roomId) : null,
    roomName: raw?.roomName ? String(raw.roomName) : null,
    contextIsPublic: raw?.contextIsPublic === true,
    contextTitle: String(
      raw?.contextTitle ?? raw?.listingTitle ?? raw?.roomName ?? "Conversación",
    ),
    participantName: String(raw?.participantName ?? "Participante"),
    participantAvatarUrl: raw?.participantAvatarUrl
      ? String(raw.participantAvatarUrl)
      : null,
    myRole: raw?.myRole === "host" ? "host" : "tenant",
    lastMessage: String(raw?.lastMessage ?? "Aún no hay mensajes."),
    lastMessageSenderName: raw?.lastMessageSenderName
      ? String(raw.lastMessageSenderName)
      : null,
    lastMessageAt: String(raw?.lastMessageAt ?? raw?.updatedAt ?? ""),
    unreadCount:
      Number.isFinite(unreadCount) && unreadCount > 0
        ? Math.floor(unreadCount)
        : 0,
    otherParticipantLastReadAt: raw?.otherParticipantLastReadAt
      ? String(raw.otherParticipantLastReadAt)
      : null,
    relatedBooking:
      raw?.relatedBooking?.id != null
        ? {
            id: String(raw.relatedBooking.id),
            status: String(raw.relatedBooking.status ?? "requested"),
          }
        : null,
    updatedAt: String(raw?.updatedAt ?? ""),
  };
}

export function normalizeConversationPage(payload: any): ConversationPage {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  return {
    items: rows.map(normalizeConversation),
    page: Math.max(1, Number(payload?.page) || 1),
    pageSize: Math.max(1, Number(payload?.pageSize) || rows.length || 25),
    hasMore: Boolean(payload?.hasMore),
  };
}

export function normalizeChatMessage(
  raw: any,
  currentUserId?: string | null,
  fallbackConversationId?: string,
): ChatMessageItem {
  const id = requiredId(
    firstDefined(raw?.id, raw?.messageId),
    "identificador de mensaje",
  );
  const senderId = String(
    firstDefined(
      raw?.senderId,
      raw?.senderUserId,
      raw?.userId,
      raw?.sender?.id,
    ) ?? "",
  );
  const conversationId = String(
    firstDefined(raw?.conversationId, raw?.threadId, fallbackConversationId) ??
      "",
  );
  const createdAtIso = String(firstDefined(raw?.createdAt, raw?.sentAt) ?? "");
  const metadata =
    raw?.metadata && typeof raw.metadata === "object" ? raw.metadata : {};
  const deleted = raw?.deleted === true || metadata.deleted === true;
  const edited = raw?.edited === true || metadata.edited === true;
  const isMine =
    currentUserId != null && senderId
      ? senderId === String(currentUserId)
      : Boolean(raw?.isMine);
  const body = deleted
    ? "Mensaje eliminado"
    : String(firstDefined(raw?.content, raw?.body, raw?.message) ?? "");

  return {
    id,
    conversationId,
    senderId,
    senderName: isMine
      ? "Tú"
      : String(
          firstDefined(raw?.senderName, raw?.sender?.name) ??
            profileDisplayName(raw?.sender?.profile ?? raw?.user?.profile),
        ),
    body,
    createdAt: formatMessageDateTime(createdAtIso),
    createdAtIso,
    isMine,
    edited,
    deleted,
  };
}

export function normalizeMessagePage(
  payload: any,
  currentUserId?: string | null,
  conversationId?: string,
): MessagePage {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.rows)
        ? payload.rows
        : [];

  return {
    items: rows.map((row: any) =>
      normalizeChatMessage(row, currentUserId, conversationId),
    ),
    pageSize: Math.max(1, Number(payload?.pageSize) || rows.length || 30),
    hasMore: Boolean(payload?.hasMore),
    nextCursor:
      payload?.nextCursor?.createdAt && payload?.nextCursor?.id
        ? {
            createdAt: String(payload.nextCursor.createdAt),
            id: String(payload.nextCursor.id),
          }
        : null,
    syncedAt: payload?.syncedAt ? String(payload.syncedAt) : null,
  };
}
