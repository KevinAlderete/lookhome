import { useEffect, useState } from "react";
import {
  getMyNotificationsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
} from "@/features/notifications/api/client";
import type {
  AppNotification,
  AppNotificationPage,
} from "@/features/notifications/types";
import { subscribeToMessageEvents } from "@/features/messaging/realtime";
import {
  notificationActionLabel,
  notificationHref,
} from "@/features/notifications/links";

type Props = { initialPage: AppNotificationPage };

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Lima",
      }).format(date);
}

function announceUnreadCount(count: number) {
  window.dispatchEvent(
    new CustomEvent("lookhome:notifications-unread-count", {
      detail: { count },
    }),
  );
}

export default function NotificationInbox({ initialPage }: Props) {
  const [items, setItems] = useState(initialPage.items);
  const [unreadCount, setUnreadCount] = useState(initialPage.unreadCount);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (initialPage.page !== 1) return;
    let active = true;
    const refresh = async () => {
      try {
        const page = await getMyNotificationsRequest(1, initialPage.pageSize);
        if (!active) return;
        setItems(page.items);
        setUnreadCount(page.unreadCount);
        setHasMore(page.hasMore);
        announceUnreadCount(page.unreadCount);
        setStatus("Notificaciones actualizadas.");
      } catch (refreshError) {
        if (active) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "No se pudieron actualizar las notificaciones.",
          );
        }
      }
    };
    const unsubscribe = subscribeToMessageEvents((event) => {
      if (event.type === "message.created") void refresh();
    });
    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [initialPage.page, initialPage.pageSize]);

  const markRead = async (item: AppNotification) => {
    if (item.readAt || busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await markNotificationReadRequest(item.id);
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((row) =>
          row.id === item.id ? { ...row, readAt, status: "read" } : row,
        ),
      );
      const nextUnreadCount = Math.max(0, unreadCount - 1);
      setUnreadCount(nextUnreadCount);
      announceUnreadCount(nextUnreadCount);
      setStatus("Notificación marcada como leída.");
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "No se pudo marcar la notificación.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const markAllRead = async () => {
    if (!unreadCount || markingAll) return;
    setMarkingAll(true);
    setError(null);
    try {
      await markAllNotificationsReadRequest();
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((row) =>
          row.readAt ? row : { ...row, readAt, status: "read" },
        ),
      );
      setUnreadCount(0);
      announceUnreadCount(0);
      setStatus("Todas las notificaciones están leídas.");
    } catch (markError) {
      setError(
        markError instanceof Error
          ? markError.message
          : "No se pudieron actualizar las notificaciones.",
      );
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <section aria-label="Notificaciones de tu cuenta" className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {unreadCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3">
          <p className="text-sm text-warm-gray">
            Tienes {unreadCount}{" "}
            {unreadCount === 1
              ? "notificación sin leer"
              : "notificaciones sin leer"}
            .
          </p>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={markingAll}
            className="min-h-11 rounded-xl px-3 text-sm font-semibold text-terracotta-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
          >
            {markingAll ? "Actualizando…" : "Marcar todas como leídas"}
          </button>
        </div>
      )}
      {items.length ? (
        <ol className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className={`rounded-2xl border p-4 ${item.readAt ? "border-warm-gray/10 bg-white" : "border-terracotta/30 bg-white shadow-sm"}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="break-words font-semibold text-warm-gray">
                      {item.title}
                    </h2>
                    {!item.readAt && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-terracotta-strong"
                        aria-label="Sin leer"
                      />
                    )}
                  </div>
                  <p className="mt-1 break-words text-sm leading-6 text-warm-gray/80">
                    {item.body}
                  </p>
                  <time
                    dateTime={item.createdAt}
                    className="mt-2 block text-xs text-warm-gray/70"
                  >
                    {dateLabel(item.createdAt)}
                  </time>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={notificationHref(item)}
                    onClick={(event) => {
                      if (item.readAt) return;
                      event.preventDefault();
                      void markRead(item).finally(() => {
                        window.location.assign(notificationHref(item));
                      });
                    }}
                    className="inline-flex min-h-11 items-center rounded-xl bg-terracotta-strong px-3 text-sm font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    {notificationActionLabel(item)}
                  </a>
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void markRead(item)}
                      disabled={busyId === item.id}
                      className="min-h-11 rounded-xl px-3 text-sm font-semibold text-warm-gray underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
                    >
                      {busyId === item.id ? "Actualizando…" : "Marcar leída"}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-3xl border border-warm-gray/10 bg-white p-8 text-center">
          <h2 className="text-lg font-bold">Aún no tienes notificaciones</h2>
          <p className="mt-2 text-sm text-warm-gray/75">
            Los avisos de tus solicitudes y mensajes aparecerán aquí.
          </p>
        </div>
      )}
      {hasMore && (
        <a
          href={`/notificaciones?page=${initialPage.page + 1}`}
          className="inline-flex min-h-11 items-center rounded-xl border border-warm-gray/15 bg-white px-4 text-sm font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
        >
          Cargar notificaciones anteriores
        </a>
      )}
    </section>
  );
}
