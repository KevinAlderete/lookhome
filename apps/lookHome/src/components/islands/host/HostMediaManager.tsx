import { useId, useState } from "react";

type Props = { listingId: string; listingPhotoCount: number };
type Message = { kind: "error" | "success"; text: string };

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 8 * 1024 * 1024;
const MAX_PHOTOS = 12;

function responseMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object" || !("message" in data)) return fallback;
  const message = (data as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(" · ");
  return fallback;
}

export default function HostMediaManager({ listingId, listingPhotoCount }: Props) {
  const inputId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const atCapacity = listingPhotoCount >= MAX_PHOTOS;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (atCapacity) {
      setMessage({ kind: "error", text: "El anuncio ya tiene 12 fotos. Quita una antes de agregar otra." });
      return;
    }
    if (!file) {
      setMessage({ kind: "error", text: "Selecciona una foto para continuar." });
      return;
    }
    if (!ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_SIZE) {
      setMessage({ kind: "error", text: "Usa una imagen JPG, PNG o WEBP de hasta 8 MB." });
      return;
    }
    setLoading(true);
    let uploadedMediaId: string | null = null;
    try {
      const key = uploadKey ?? crypto.randomUUID();
      setUploadKey(key);
      const intentResponse = await fetch("/api/host/media/upload-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadKey: key, sizeBytes: file.size, mimeType: file.type }),
      });
      const intent = await intentResponse.json().catch(() => null);
      if (!intentResponse.ok) throw new Error(responseMessage(intent, "No se pudo preparar la carga."));

      let mediaId: string;
      if (intent?.mode === "proxy") {
        const formData = new FormData();
        formData.append("file", file);
        const uploadResponse = await fetch(`/api/host/media/upload?uploadKey=${encodeURIComponent(key)}`, { method: "POST", body: formData });
        const uploadData = await uploadResponse.json().catch(() => null);
        if (!uploadResponse.ok) throw new Error(responseMessage(uploadData, "No se pudo subir la foto."));
        mediaId = uploadData?.media?.id;
      } else {
        if (typeof intent?.mediaId !== "string" || typeof intent?.uploadUrl !== "string") {
          throw new Error("El servidor no devolvió los datos de carga directa.");
        }
        mediaId = intent.mediaId;
        uploadedMediaId = mediaId;
        if (!intent.completed) {
          const directResponse = await fetch(intent.uploadUrl, {
            method: "PUT",
            headers: intent.headers,
            body: file,
          });
          if (!directResponse.ok) throw new Error("No se pudo subir la foto al almacenamiento.");
        }
        const completeResponse = await fetch(
          `/api/host/media/${encodeURIComponent(mediaId)}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uploadKey: key }),
          },
        );
        const completeData = await completeResponse.json().catch(() => null);
        if (!completeResponse.ok) throw new Error(responseMessage(completeData, "No se pudo confirmar la carga."));
      }
      if (typeof mediaId !== "string") throw new Error("La carga no devolvió el identificador de la foto.");
      uploadedMediaId = mediaId;

      const attachResponse = await fetch("/api/host/media/attach-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, mediaId, sortOrder: listingPhotoCount, isCover: listingPhotoCount === 0 }),
      });
      const attachData = await attachResponse.json().catch(() => null);
      if (!attachResponse.ok) throw new Error(responseMessage(attachData, "La foto se subió, pero no se pudo asociar al anuncio."));
      setMessage({ kind: "success", text: "Foto agregada al anuncio." });
      window.setTimeout(() => window.location.reload(), 500);
    } catch (uploadError) {
      if (uploadedMediaId) {
        try {
          const cleanupResponse = await fetch(
            `/api/host/media/${encodeURIComponent(uploadedMediaId)}`,
            { method: "DELETE" },
          );
          const cleanupData = await cleanupResponse.json().catch(() => null);
          if (cleanupResponse.ok && cleanupData?.removed === true) {
            setUploadKey(null);
          }
        } catch {
          // La clave idempotente permite reintentar; el barrido del servidor limpia huérfanos.
        }
      }
      setMessage({ kind: "error", text: uploadError instanceof Error ? uploadError.message : "No se pudo completar la carga." });
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} aria-busy={loading} className="rounded-[24px] bg-white p-6 shadow-[0_18px_50px_rgba(80,76,74,0.08)] md:p-8">
      <p className="text-sm font-bold text-terracotta">Galería del anuncio</p>
      <h2 className="mt-1 text-2xl font-bold text-warm-gray">Agregar una foto</h2>
      <p className="mt-2 text-sm text-warm-gray/70">JPG, PNG o WEBP, máximo 8 MB por imagen y 12 fotos en total. La primera foto será la portada.</p>
      <label htmlFor={inputId} className={`mt-5 flex min-h-28 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed px-5 py-6 text-center font-semibold ${atCapacity ? "cursor-not-allowed border-warm-gray/15 text-warm-gray/50" : "border-terracotta/30 bg-cream/50 text-warm-gray"}`}>
        {atCapacity ? "Límite de 12 fotos alcanzado" : file ? file.name : "Seleccionar una imagen"}
        <input id={inputId} name="photo" className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" disabled={loading || atCapacity} onChange={(event) => { const selected = event.currentTarget.files?.[0] ?? null; setFile(selected); setUploadKey(selected ? crypto.randomUUID() : null); setMessage(null); }} />
      </label>
      {file && <p className="mt-2 text-sm text-warm-gray/65">{(file.size / 1024 / 1024).toFixed(2)} MB</p>}
      {message && <p role={message.kind === "error" ? "alert" : "status"} aria-live={message.kind === "error" ? "assertive" : "polite"} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{message.text}</p>}
      <button type="submit" disabled={loading || atCapacity} className="mt-5 min-h-11 rounded-xl bg-terracotta px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Subiendo foto…" : "Agregar foto al anuncio"}</button>
    </form>
  );
}
