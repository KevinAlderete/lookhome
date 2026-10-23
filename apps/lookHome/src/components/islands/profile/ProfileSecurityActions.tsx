import { useState } from "react";
import { logoutAllRequest } from "@/features/profile/api/client";

export default function ProfileSecurityActions() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLogoutAll = async () => {
    if (loading) return;
    if (
      !window.confirm(
        "Se cerrará esta sesión y todas las sesiones de tu cuenta. Tendrás que iniciar sesión nuevamente.",
      )
    ) {
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const result = await logoutAllRequest();
      setMessage(result.message);
      if (result.localLoggedOut) {
        window.setTimeout(() => {
          window.location.assign("/login");
        }, 900);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo cerrar todas las sesiones.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-[24px] bg-white p-6 shadow-[0_18px_50px_rgba(80,76,74,0.08)]">
      <h3 className="text-xl font-bold text-warm-gray">Seguridad</h3>
      <p className="mt-2 text-sm text-warm-gray/70">
        Cierra todas tus sesiones activas en otros dispositivos.
      </p>

      {message && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status" aria-live="polite">
          {message}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleLogoutAll}
        disabled={loading}
        className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-red-200 px-4 py-2.5 font-semibold text-red-800 transition hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {loading ? "Cerrando sesiones…" : "Cerrar todas las sesiones"}
      </button>
    </div>
  );
}
