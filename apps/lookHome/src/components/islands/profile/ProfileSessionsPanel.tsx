import { useState } from "react";
import { revokeSessionRequest } from "@/features/profile/api/client";
import type { UserSessionRow, UserSessionStatus } from "@/features/profile/types";

type Props = { initialRows: UserSessionRow[] };

function statusLabel(status: UserSessionStatus) {
  switch (status) {
    case "active":
      return "Activa";
    case "expired":
      return "Expirada";
    case "reauthentication_required":
      return "Requiere iniciar sesión";
    case "revoked":
      return "Cerrada";
  }
}

function statusClasses(status: UserSessionStatus) {
  if (status === "active") return "bg-green-100 text-green-800";
  if (status === "reauthentication_required") {
    return "bg-amber-100 text-amber-900";
  }
  return "bg-warm-gray/10 text-warm-gray/70";
}

function deviceLabel(userAgent?: string | null) {
  const agent = userAgent ?? "";
  const platform = /android/i.test(agent)
    ? "Android"
    : /iphone|ipad/i.test(agent)
      ? "iPhone o iPad"
      : /windows/i.test(agent)
        ? "Windows"
        : /macintosh|mac os/i.test(agent)
          ? "Mac"
          : /linux/i.test(agent)
            ? "Linux"
            : "Dispositivo";
  const browser = /edg\//i.test(agent)
    ? "Edge"
    : /firefox\//i.test(agent)
      ? "Firefox"
      : /chrome\//i.test(agent) && !/edg\//i.test(agent)
        ? "Chrome"
        : /safari\//i.test(agent) && !/chrome\//i.test(agent)
          ? "Safari"
          : "Navegador";
  return `${browser} · ${platform}`;
}

export default function ProfileSessionsPanel({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const revoke = async (row: UserSessionRow) => {
    if (revokingId) return;
    const confirmation = row.isCurrent
      ? "Esta es la sesión de este dispositivo. Al cerrarla volverás a la pantalla de inicio de sesión. ¿Continuar?"
      : "Esta sesión dejará de poder renovar su acceso. ¿Quieres cerrarla?";
    if (!window.confirm(confirmation)) return;

    setRevokingId(row.id);
    setMessage(null);
    setError(null);
    try {
      const result = await revokeSessionRequest(row.id);
      setRows((current) =>
        current.map((item) =>
          item.id === row.id
            ? { ...item, status: "revoked", revokedAt: "Ahora" }
            : item,
        ),
      );
      if (result.currentSession) {
        window.location.assign("/login");
        return;
      }
      setMessage(result.message || "La sesión fue cerrada.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos cerrar esta sesión. Inténtalo nuevamente.",
      );
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <section
      className="rounded-3xl border border-warm-gray/10 bg-white p-5 shadow-[0_12px_36px_rgba(80,76,74,0.07)] sm:p-7"
      aria-labelledby="profile-sessions-title"
    >
      <div>
        <p className="text-sm font-semibold text-terracotta-strong">Seguridad</p>
        <h2 id="profile-sessions-title" className="mt-1 text-2xl font-bold">
          Sesiones y dispositivos
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-warm-gray/70">
          Revisa dónde has iniciado sesión y cierra cualquier acceso que no
          reconozcas.
        </p>
      </div>

      {message && (
        <p
          className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-5 rounded-xl bg-cream px-4 py-5 text-sm text-warm-gray/70">
          No hay sesiones para mostrar.
        </p>
      ) : (
        <ul className="mt-5 grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="min-w-0 rounded-2xl border border-warm-gray/12 bg-cream/65 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-words font-semibold text-warm-gray">
                    {deviceLabel(row.userAgent)}
                  </p>
                  <p className="mt-1 text-xs text-warm-gray/65">
                    Último uso: {row.lastUsedAt || "Sin registro"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.isCurrent && (
                    <span className="rounded-full bg-terracotta/15 px-2.5 py-1 text-xs font-semibold text-[#753a25]">
                      Este dispositivo
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(row.status)}`}
                  >
                    {statusLabel(row.status)}
                  </span>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-warm-gray/55">Inicio</dt>
                  <dd className="mt-0.5 text-warm-gray/80">{row.createdAt || "—"}</dd>
                </div>
                <div>
                  <dt className="text-warm-gray/55">Vence</dt>
                  <dd className="mt-0.5 text-warm-gray/80">{row.expiresAt || "—"}</dd>
                </div>
              </dl>

              <details className="mt-3 border-t border-warm-gray/10 pt-3">
                <summary className="cursor-pointer text-xs font-semibold text-warm-gray/70 focus-visible:outline-2 focus-visible:outline-terracotta">
                  Detalles de conexión
                </summary>
                <dl className="mt-2 grid gap-2 text-xs">
                  <div>
                    <dt className="text-warm-gray/55">Dirección IP</dt>
                    <dd className="mt-0.5 break-all text-warm-gray/80">
                      {row.ip || "No disponible"}
                    </dd>
                  </div>
                </dl>
              </details>

              {row.status !== "revoked" && (
                <button
                  type="button"
                  onClick={() => void revoke(row)}
                  disabled={revokingId !== null}
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-800 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-60"
                >
                  {revokingId === row.id
                    ? "Cerrando…"
                    : row.isCurrent
                      ? "Cerrar esta sesión"
                      : "Revocar sesión"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
