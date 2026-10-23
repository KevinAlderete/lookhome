import { apiServer } from "@/lib/api/server";
import { normalizeConversationPage, normalizeMessagePage } from "../normalize";
import type { MessageCursor } from "../types";

export async function getMyConversations(
  request: Request,
  options: {
    page?: number;
    pageSize?: number;
    conversationId?: string;
    perspective?: "tenant" | "host";
    search?: string;
    unreadOnly?: boolean;
  } = {},
) {
  const payload = await apiServer<any>(request, "/conversations/me", {
    query: {
      page: options.page ?? 1,
      pageSize: options.pageSize ?? 25,
      conversationId: options.conversationId,
      perspective: options.perspective,
      search: options.search,
      unreadOnly: options.unreadOnly,
    },
  });
  return normalizeConversationPage(payload);
}

export async function getConversationMessages(
  request: Request,
  conversationId: string,
  currentUserId?: string | null,
  options: {
    pageSize?: number;
    before?: MessageCursor | null;
    after?: MessageCursor | null;
    changedSince?: string | null;
  } = {},
) {
  const payload = await apiServer<any>(
    request,
    `/messages/conversation/${encodeURIComponent(conversationId)}`,
    {
      query: {
        pageSize: options.pageSize ?? 30,
        beforeCreatedAt: options.before?.createdAt,
        beforeId: options.before?.id,
        afterCreatedAt: options.after?.createdAt,
        afterId: options.after?.id,
        changedSince: options.changedSince,
      },
    },
  );
  return normalizeMessagePage(payload, currentUserId, conversationId);
}
