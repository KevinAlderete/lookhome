import type { AppNotificationPage } from "../types";

async function readResponse(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || fallback);
  return data;
}

export async function getMyNotificationsRequest(
  page = 1,
  pageSize = 20,
): Promise<AppNotificationPage> {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  const response = await fetch(`/api/notifications?${query}`, {
    credentials: "include",
    cache: "no-store",
  });
  return readResponse(
    response,
    "No se pudieron actualizar las notificaciones.",
  );
}

export async function markNotificationReadRequest(notificationId: string) {
  const response = await fetch(
    `/api/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "PATCH",
      credentials: "include",
      cache: "no-store",
    },
  );
  return readResponse(
    response,
    "No se pudo marcar la notificación como leída.",
  );
}

export async function markAllNotificationsReadRequest() {
  const response = await fetch("/api/notifications/read-all", {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
  });
  return readResponse(
    response,
    "No se pudieron marcar las notificaciones como leídas.",
  );
}
