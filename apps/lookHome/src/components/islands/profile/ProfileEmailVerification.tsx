import { useState } from "react";
import { requestEmailVerification } from "@/features/profile/api/client";

export default function ProfileEmailVerification() {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async () => {
    if (sending) return;
    setSending(true);
    setMessage(null);
    setError(null);
    try {
      const result = await requestEmailVerification();
      setMessage(result.message || "Te enviamos un enlace para verificar el correo.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No pudimos solicitar la verificación. Inténtalo nuevamente.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={handleRequest}
        disabled={sending}
        className="inline-flex min-h-10 items-center rounded-lg border border-terracotta/30 px-3 text-xs font-semibold text-[#753a25] transition hover:bg-terracotta/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta disabled:cursor-wait disabled:opacity-60"
      >
        {sending ? "Enviando…" : "Reenviar verificación"}
      </button>
      {message && (
        <p className="mt-2 text-xs text-green-800" role="status" aria-live="polite">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-2 text-xs text-red-800" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
