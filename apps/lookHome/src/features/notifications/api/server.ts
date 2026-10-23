import { apiServer } from "@/lib/api/server";
import type { AppNotificationPage } from "../types";

export async function getMyNotifications(
  request: Request,
  options: { page?: number; pageSize?: number } = {},
  accessToken?: string,
): Promise<AppNotificationPage> {
  const payload = await apiServer<any>(request, "/notifications/me", {
    accessToken,
    query: { page: options.page ?? 1, pageSize: options.pageSize ?? 20 },
  });
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("La API no devolvió la lista de notificaciones.");
  }
  return {
    items: payload.items,
    page: Math.max(1, Number(payload.page) || 1),
    pageSize: Math.max(1, Number(payload.pageSize) || 20),
    total: Math.max(0, Number(payload.total) || 0),
    unreadCount: Math.max(0, Number(payload.unreadCount) || 0),
    hasMore: Boolean(payload.hasMore),
  };
}
