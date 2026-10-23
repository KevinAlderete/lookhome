import type { ChatMessageItem } from "./types";

function orderMessages(items: ChatMessageItem[]) {
  return [...items].sort((a, b) => {
    const dateOrder = a.createdAtIso.localeCompare(b.createdAtIso);
    return dateOrder || a.id.localeCompare(b.id);
  });
}

export function mergeConversationMessages(
  current: ChatMessageItem[],
  incoming: ChatMessageItem[],
  conversationId: string,
) {
  const otherConversations = current.filter(
    (item) => item.conversationId !== conversationId,
  );
  const byId = new Map(
    current
      .filter((item) => item.conversationId === conversationId)
      .map((item) => [item.id, item]),
  );
  for (const message of incoming) byId.set(message.id, message);
  return [...otherConversations, ...orderMessages([...byId.values()])];
}
