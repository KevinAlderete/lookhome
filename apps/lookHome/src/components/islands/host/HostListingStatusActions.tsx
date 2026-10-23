import { useState } from "react";

type Props = {
  listingId: string;
  status: string;
  visibilityIssue?: boolean;
  bookingVisibilityIssue?: boolean;
  offerNeedsActivation?: boolean;
};

export default function HostListingStatusActions({
  listingId,
  status,
  visibilityIssue = false,
  bookingVisibilityIssue = false,
  offerNeedsActivation = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action =
    status === "published" &&
    visibilityIssue &&
    offerNeedsActivation &&
    !bookingVisibilityIssue
      ? "publish"
      : status === "published"
        ? "pause"
        : "publish";
  const label =
    status === "published" && bookingVisibilityIssue
      ? "Pausar anuncio"
      : status === "published" && visibilityIssue && offerNeedsActivation
        ? "Activar oferta en la búsqueda"
        : status === "published" && visibilityIssue
          ? "Pausar anuncio para reactivarlo"
          : status === "published"
            ? "Pausar anuncio"
            : status === "paused"
              ? "Reactivar anuncio"
              : "Publicar anuncio";

  const run = async (nextAction: "publish" | "pause" | "archive") => {
    if (
      nextAction === "archive" &&
      !window.confirm(
        "¿Archivar este anuncio? Dejará de aparecer en la búsqueda.",
      )
    )
      return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/host/listings/${encodeURIComponent(listingId)}/${nextAction}`,
        { method: "PATCH" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof data?.message === "string"
            ? data.message
            : "No se pudo cambiar el estado.",
        );
      window.location.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo cambiar el estado.",
      );
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void run(action)}
        disabled={loading}
        className="min-h-11 rounded-xl bg-terracotta px-4 font-semibold text-white hover:bg-soft-coral disabled:opacity-60"
      >
        {loading ? "Actualizando…" : label}
      </button>
      {status === "paused" && (
        <button
          type="button"
          onClick={() => void run("archive")}
          disabled={loading}
          className="min-h-11 rounded-xl border border-warm-gray/15 bg-white px-4 font-semibold text-warm-gray hover:bg-cream disabled:opacity-60"
        >
          Archivar
        </button>
      )}
      {error && (
        <p
          role="alert"
          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
