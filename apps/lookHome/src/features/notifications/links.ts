import type { AppNotification } from "./types";

export function notificationConversationHref(item: AppNotification) {
  const conversationId = item.data?.conversationId;
  if (typeof conversationId !== "string" || !conversationId) return "/mensajes";
  return `/mensajes?conversationId=${encodeURIComponent(conversationId)}`;
}

export function notificationHref(item: AppNotification) {
  const bookingId = item.data?.bookingId;
  if (item.type.startsWith("booking.") && typeof bookingId === "string") {
    const perspective = item.data?.perspective === "host" ? "host" : "tenant";
    const base = perspective === "host" ? "/host/reservas" : "/reservas";
    return `${base}/${encodeURIComponent(bookingId)}`;
  }
  return notificationConversationHref(item);
}

export function notificationActionLabel(item: AppNotification) {
  return item.type.startsWith("booking.")
    ? "Ver solicitud"
    : "Abrir conversación";
}
