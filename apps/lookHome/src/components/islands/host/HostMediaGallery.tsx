import { useEffect, useRef, useState } from "react";

export type HostMediaGalleryItem = {
  id: string;
  publicUrl: string | null;
  thumbnailUrl?: string | null;
  sortOrder: number;
  isCover: boolean;
};

type Props = {
  items: HostMediaGalleryItem[];
  targetId: string;
  targetLabel: string;
  compact?: boolean;
};

function apiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const message = (payload as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(" ");
  return fallback;
}

export default function HostMediaGallery({
  items: initialItems,
  targetId,
  targetLabel,
  compact = false,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const draggedId = useRef<string | null>(null);
  const normalizationStarted = useRef(false);

  const persistOrder = async (orderedItems: HostMediaGalleryItem[]) => {
    const response = await fetch("/api/host/media/order", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType: "listing",
        targetId,
        mediaIds: orderedItems.map((item) => item.id),
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        apiError(data, "No se pudo guardar el orden de las fotos."),
      );
    }
  };

  useEffect(() => {
    if (normalizationStarted.current || initialItems.length === 0) return;
    const needsNormalization = initialItems.some(
      (item, index) =>
        item.sortOrder !== index || item.isCover !== (index === 0),
    );
    if (!needsNormalization) return;

    normalizationStarted.current = true;
    setLoading(true);
    void persistOrder(initialItems)
      .then(() => {
        setItems((current) =>
          current.map((item, index) => ({
            ...item,
            sortOrder: index,
            isCover: index === 0,
          })),
        );
        setMessage({
          kind: "success",
          text: "Se normalizó el orden y la portada de la galería.",
        });
      })
      .catch((error) => {
        setMessage({
          kind: "error",
          text:
            error instanceof Error
              ? error.message
              : "No se pudo normalizar la galería.",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const reorder = async (fromIndex: number, toIndex: number) => {
    if (
      loading ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      toIndex >= items.length
    )
      return;

    const previous = items;
    const updated = [...items];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    const normalized = updated.map((item, index) => ({
      ...item,
      sortOrder: index,
      isCover: index === 0,
    }));
    setItems(normalized);
    setLoading(true);
    setMessage(null);
    try {
      await persistOrder(normalized);
      setMessage({ kind: "success", text: "Orden guardado." });
    } catch (error) {
      setItems(previous);
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el orden de las fotos.",
      });
    } finally {
      setLoading(false);
    }
  };

  const remove = async (item: HostMediaGalleryItem) => {
    if (!window.confirm("¿Eliminar esta foto del anuncio?"))
      return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/host/media/listing/${encodeURIComponent(targetId)}/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(apiError(data, "No se pudo eliminar la foto."));

      const remaining = items
        .filter((current) => current.id !== item.id)
        .map((current, index) => ({
          ...current,
          sortOrder: index,
          isCover: index === 0,
        }));
      if (remaining.length > 0) await persistOrder(remaining);
      window.location.reload();
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar la foto.",
      });
      setLoading(false);
    }
  };

  return (
    <div aria-busy={loading}>
      <p className="sr-only" aria-live="polite">
        {loading ? "Actualizando la galería." : message?.text}
      </p>
      {message?.kind === "error" && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {message.text}
        </p>
      )}
      <div
        className={
          compact
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {items.map((item, index) => (
          <article
            key={item.id}
            draggable={!loading}
            onDragStart={(event) => {
              draggedId.current = item.id;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", item.id);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = draggedId.current;
              draggedId.current = null;
              if (!sourceId) return;
              void reorder(
                items.findIndex((current) => current.id === sourceId),
                index,
              );
            }}
            onDragEnd={() => {
              draggedId.current = null;
            }}
            className="overflow-hidden rounded-2xl border border-warm-gray/10 bg-cream/50"
          >
            <div className="relative aspect-[4/3] bg-warm-gray/10">
              {item.publicUrl ? (
                <img
                  src={item.thumbnailUrl || item.publicUrl}
                  alt={`Foto ${index + 1} de ${targetLabel}`}
                  width={compact ? 480 : 640}
                  height={compact ? 360 : 480}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-warm-gray/55">
                  Vista previa no disponible
                </div>
              )}
              {index === 0 && (
                <span className="absolute left-3 top-3 rounded-full bg-terracotta px-3 py-1 text-xs font-bold text-white shadow-sm">
                  Portada
                </span>
              )}
            </div>
            <div className="space-y-3 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-bold text-warm-gray">
                  {index === 0 ? "Primera foto" : `Foto ${index + 1}`}
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void remove(item)}
                  className="min-h-10 rounded-lg px-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading || index === 0}
                  onClick={() => void reorder(index, index - 1)}
                  aria-label={`Mover foto ${index + 1} de ${targetLabel} antes`}
                  className="min-h-11 rounded-lg border border-warm-gray/15 px-2 py-2 text-xs font-semibold text-warm-gray hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Mover antes
                </button>
                <button
                  type="button"
                  disabled={loading || index === items.length - 1}
                  onClick={() => void reorder(index, index + 1)}
                  aria-label={`Mover foto ${index + 1} de ${targetLabel} después`}
                  className="min-h-11 rounded-lg border border-warm-gray/15 px-2 py-2 text-xs font-semibold text-warm-gray hover:bg-cream disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Mover después
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
