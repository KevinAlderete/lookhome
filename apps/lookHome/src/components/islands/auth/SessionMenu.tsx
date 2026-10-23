import { useEffect, useMemo, useRef, useState } from "react";
import { logoutRequest } from "@/features/auth/api/client";
import type { PublicProfileUpdate } from "@/features/profile/events";
import { getMyNotificationsRequest } from "@/features/notifications/api/client";
import { subscribeToMessageEvents } from "@/features/messaging/realtime";

type SessionMenuProps = {
  displayName: string;
  avatarUrl: string;
  roles?: string[];
};

export default function SessionMenu({
  displayName,
  avatarUrl,
  roles = [],
}: SessionMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shownName, setShownName] = useState(displayName);
  const [shownAvatar, setShownAvatar] = useState(avatarUrl);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleProfileUpdate = (
      event: WindowEventMap["lookhome:profile-public-updated"],
    ) => {
      const update: PublicProfileUpdate = event.detail;
      setShownName(update.displayName);
      if (update.photoUrl) setShownAvatar(update.photoUrl);
    };
    window.addEventListener(
      "lookhome:profile-public-updated",
      handleProfileUpdate,
    );
    return () =>
      window.removeEventListener(
        "lookhome:profile-public-updated",
        handleProfileUpdate,
      );
  }, []);

  useEffect(() => {
    let active = true;
    const refreshUnreadCount = async () => {
      try {
        const page = await getMyNotificationsRequest(1, 1);
        if (active) setUnreadNotifications(page.unreadCount);
      } catch {
        // The account menu remains usable when notifications are temporarily unavailable.
      }
    };
    const onUnreadCount = (event: Event) => {
      const count = Number(
        (event as CustomEvent<{ count?: number }>).detail?.count,
      );
      if (Number.isFinite(count) && count >= 0) {
        setUnreadNotifications(Math.floor(count));
      }
    };
    void refreshUnreadCount();
    const unsubscribe = subscribeToMessageEvents((event) => {
      if (event.type === "message.created") void refreshUnreadCount();
    });
    const intervalId = window.setInterval(
      () => void refreshUnreadCount(),
      60_000,
    );
    window.addEventListener(
      "lookhome:notifications-unread-count",
      onUnreadCount,
    );
    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(intervalId);
      window.removeEventListener(
        "lookhome:notifications-unread-count",
        onUnreadCount,
      );
    };
  }, []);

  const normalizedRoles = useMemo(
    () => roles.map((r) => String(r).toUpperCase()),
    [roles],
  );

  const canHost = normalizedRoles.some((r) => ["HOST", "ADMIN"].includes(r));
  const isAdmin = normalizedRoles.includes("ADMIN");

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);

    try {
      await logoutRequest();
      window.location.href = "/";
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${open ? "Cerrar" : "Abrir"} el menú de cuenta de ${shownName}${unreadNotifications > 0 ? `. Tienes ${unreadNotifications} ${unreadNotifications === 1 ? "notificación sin leer" : "notificaciones sin leer"}` : ""}`}
        aria-expanded={open}
        aria-controls={open ? "session-menu-links" : undefined}
        className="flex items-center gap-3 rounded-2xl border border-warm-gray/12 bg-white px-3 py-2 shadow-sm transition hover:border-terracotta/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
      >
        <span className="relative shrink-0">
          <img
            src={shownAvatar}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
          {unreadNotifications > 0 && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-terracotta-strong px-1 text-[10px] font-bold text-white ring-2 ring-white"
            >
              {unreadNotifications > 99 ? "99+" : unreadNotifications}
            </span>
          )}
        </span>

        <div className="hidden text-left sm:block">
          <div className="text-sm font-semibold text-warm-gray">
            {shownName}
          </div>
          <div className="text-xs text-warm-gray/55">Mi cuenta</div>
        </div>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-3 w-64 overflow-hidden rounded-2xl border border-warm-gray/10 bg-white shadow-[0_24px_70px_rgba(80,76,74,0.14)]">
          <div className="border-b border-warm-gray/8 px-4 py-4">
            <div className="text-sm font-semibold text-warm-gray">
              {shownName}
            </div>
          </div>

          <nav id="session-menu-links" className="flex flex-col p-2">
            <a
              href="/favoritos"
              className="rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Favoritos
            </a>
            <a
              href="/reservas"
              className="rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Mis solicitudes
            </a>
            <a
              href="/mensajes"
              className="rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Mensajes
            </a>
            <a
              href="/notificaciones"
              className="flex items-center justify-between rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Notificaciones
              {unreadNotifications > 0 && (
                <span className="rounded-full bg-terracotta/12 px-2 py-0.5 text-xs font-bold text-terracotta-strong">
                  {unreadNotifications > 99 ? "99+" : unreadNotifications} sin
                  leer
                </span>
              )}
            </a>
            <a
              href="/perfil"
              className="rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Perfil
            </a>

            {canHost && (
              <a
                href="/host"
                className="rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Panel host
              </a>
            )}

            {isAdmin && (
              <a
                href="/admin"
                className="rounded-xl px-3 py-2 text-sm text-warm-gray transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Panel admin
              </a>
            )}

            <button
              type="button"
              onClick={handleLogout}
              disabled={loading}
              className="mt-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-terracotta-strong transition hover:bg-terracotta/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-70"
            >
              {loading ? "Saliendo..." : "Cerrar sesión"}
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
