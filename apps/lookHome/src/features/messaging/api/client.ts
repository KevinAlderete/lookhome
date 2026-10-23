import {
  normalizeConversation,
  normalizeConversationPage,
  normalizeMessagePage,
} from "../normalize";
import type {
  ContactContext,
  ConversationBlockStatus,
  MessageCursor,
  MessageReportReason,
} from "../types";

async function readResponse(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/login?redirect=${encodeURIComponent(returnTo)}`);
    }
    throw new Error(data?.message || fallback);
  }
  return data;
}

type SendMessagePayload = {
  conversationId: string;
  body: string;
  clientMessageId: string;
};

export async function sendMessageRequest(payload: SendMessagePayload) {
  const response = await fetch("/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({
      conversationId: payload.conversationId,
      type: "text",
      content: payload.body,
      clientMessageId: payload.clientMessageId,
    }),
  });

  return readResponse(response, "No se pudo enviar el mensaje.");
}

export async function getConversationMessagesRequest(
  conversationId: string,
  options: {
    before?: MessageCursor | null;
    after?: MessageCursor | null;
    pageSize?: number;
    changedSince?: string | null;
  } = {},
  currentUserId?: string | null,
) {
  const query = new URLSearchParams();
  query.set("pageSize", String(options.pageSize ?? 30));
  if (options.before) {
    query.set("beforeCreatedAt", options.before.createdAt);
    query.set("beforeId", options.before.id);
  }
  if (options.after) {
    query.set("afterCreatedAt", options.after.createdAt);
    query.set("afterId", options.after.id);
  }
  if (options.changedSince) query.set("changedSince", options.changedSince);
  const response = await fetch(
    `/api/messages/conversation/${encodeURIComponent(conversationId)}?${query.toString()}`,
    { credentials: "include", cache: "no-store" },
  );
  const data = await readResponse(
    response,
    "No se pudieron cargar los mensajes.",
  );

  return normalizeMessagePage(data, currentUserId, conversationId);
}

export async function getMyConversationsRequest(
  page = 1,
  pageSize = 25,
  perspective?: "tenant" | "host",
  filters: { search?: string; unreadOnly?: boolean } = {},
) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (perspective) query.set("perspective", perspective);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.unreadOnly) query.set("unreadOnly", "true");
  const response = await fetch(`/api/conversations?${query}`, {
    credentials: "include",
    cache: "no-store",
  });
  const data = await readResponse(
    response,
    "No se pudieron cargar las conversaciones.",
  );
  return normalizeConversationPage(data);
}

export async function startContactRequest(
  context: ContactContext,
  initialMessage: string,
  clientMessageId: string,
) {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ ...context, initialMessage, clientMessageId }),
  });
  const data = await readResponse(
    response,
    "No se pudo iniciar la conversación.",
  );
  if (!data?.conversation?.id || !data?.initialMessage?.id) {
    throw new Error("La API no devolvió el mensaje inicial.");
  }
  return {
    conversation: normalizeConversation(data.conversation),
    initialMessage: data.initialMessage,
  };
}

export async function getConversationBlockStatusRequest(
  conversationId: string,
): Promise<ConversationBlockStatus> {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/block`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  const data = await readResponse(
    response,
    "No se pudo consultar el estado de la conversación.",
  );
  return {
    blockedByMe: data?.blockedByMe === true,
    blockedMe: data?.blockedMe === true,
  };
}

async function updateConversationBlockRequest(
  conversationId: string,
  method: "POST" | "DELETE",
) {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(conversationId)}/block`,
    {
      method,
      credentials: "include",
      cache: "no-store",
    },
  );
  const data = await readResponse(
    response,
    "No se pudo actualizar el bloqueo.",
  );
  return {
    blockedByMe: data?.blockedByMe === true,
    blockedMe: data?.blockedMe === true,
  };
}

export function blockConversationRequest(conversationId: string) {
  return updateConversationBlockRequest(conversationId, "POST");
}

export function unblockConversationRequest(conversationId: string) {
  return updateConversationBlockRequest(conversationId, "DELETE");
}

export async function reportMessageRequest(
  messageId: string,
  reason: MessageReportReason,
  details?: string,
) {
  const response = await fetch("/api/moderation/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      entityType: "message",
      entityId: messageId,
      reason,
      details: details?.trim() || undefined,
    }),
  });
  return readResponse(response, "No se pudo reportar el mensaje.");
}

export async function markConversationReadRequest(conversationId: string) {
  const response = await fetch(
    `/api/messages/conversation/${encodeURIComponent(conversationId)}/read`,
    {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
    },
  );

  return readResponse(response, "No se pudo marcar como leído.");
}

export async function updateMessageRequest(messageId: string, content: string) {
  const response = await fetch(
    `/api/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ content }),
    },
  );
  const data = await readResponse(response, "No se pudo editar el mensaje.");
  return data?.item ?? data;
}

export async function deleteMessageRequest(messageId: string) {
  const response = await fetch(
    `/api/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      credentials: "include",
    },
  );
  const data = await readResponse(response, "No se pudo eliminar el mensaje.");
  return data?.item ?? data;
}
