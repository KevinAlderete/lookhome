import React, { useEffect, useRef, useState } from "react";
import type { PublicPhoto } from "@/features/listings/public";

type Props = { photos: PublicPhoto[]; title: string };

export default function ListingGallery({ photos, title }: Props) {
  const [active, setActive] = useState(0);
  const [loadedPhotos, setLoadedPhotos] = useState<Set<string>>(
    () => new Set(),
  );
  const [failedPhotos, setFailedPhotos] = useState<Set<string>>(
    () => new Set(),
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mainImageRef = useRef<HTMLImageElement>(null);
  const selected = photos[active];
  const selectedLoaded = loadedPhotos.has(selected?.url ?? "");
  const selectedFailed = failedPhotos.has(selected?.url ?? "");
  const markPhotoLoaded = (url: string) => {
    setLoadedPhotos((current) => new Set(current).add(url));
  };
  const markPhotoFailed = (url: string) => {
    setFailedPhotos((current) => new Set(current).add(url));
  };
  useEffect(() => {
    if (!selected || !mainImageRef.current?.complete) return;
    if (mainImageRef.current.naturalWidth > 0) {
      markPhotoLoaded(selected.url);
    } else {
      markPhotoFailed(selected.url);
    }
  }, [selected?.url]);
  const showPhoto = (index: number) =>
    setActive((current) => (current + index + photos.length) % photos.length);

  const openLightbox = () => dialogRef.current?.showModal();

  if (!photos.length) {
    return (
      <section aria-label={`Fotos de ${title}`}>
        <div
          role="status"
          className="grid aspect-[16/10] place-items-center rounded-[28px] border border-dashed border-warm-gray/20 bg-white px-6 text-center"
        >
          <div>
            <svg
              viewBox="0 0 48 48"
              aria-hidden="true"
              className="mx-auto h-12 w-12 text-terracotta-strong/70"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <rect x="5" y="9" width="38" height="30" rx="5" />
              <circle cx="18" cy="20" r="3" />
              <path d="m7 34 11-10 7 6 5-4 11 9" />
            </svg>
            <p className="mt-3 font-semibold text-warm-gray">
              Este anuncio aún no tiene fotos
            </p>
            <p className="mt-1 text-sm text-warm-gray/70">
              Puedes revisar sus características y condiciones abajo.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={`Fotos de ${title}`} className="min-w-0 space-y-3">
      <figure className="overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_rgba(80,76,74,0.09)]">
        <button
          type="button"
          onClick={openLightbox}
          disabled={!selectedLoaded || selectedFailed}
          aria-label={`Ampliar foto ${active + 1} de ${title}`}
          className="relative block w-full bg-cream focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-terracotta-strong disabled:cursor-default"
        >
          {selectedFailed ? (
            <span
              role="alert"
              className="grid aspect-[16/10] place-items-center px-6 text-sm text-warm-gray/75"
            >
              No se pudo cargar esta foto. Puedes elegir otra imagen.
            </span>
          ) : (
            <>
              <img
                ref={mainImageRef}
                src={selected.url}
                alt={`Foto ${active + 1} de ${title}`}
                width={1280}
                height={800}
                fetchPriority={active === 0 ? "high" : undefined}
                onLoad={() => markPhotoLoaded(selected.url)}
                onError={() => markPhotoFailed(selected.url)}
                className="aspect-[16/10] w-full bg-cream object-cover"
              />
              {!selectedLoaded && (
                <span
                  role="status"
                  className="absolute inset-0 grid place-items-center bg-cream/90 text-sm text-warm-gray/75"
                >
                  Cargando fotografía…
                </span>
              )}
            </>
          )}
        </button>
        <figcaption className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-warm-gray sm:px-5">
          <span aria-live="polite" aria-atomic="true">
            Foto {active + 1} de {photos.length}
          </span>
          {photos.length > 1 && (
            <span className="flex gap-2">
              <button
                type="button"
                onClick={() => showPhoto(-1)}
                aria-label="Ver foto anterior"
                className="min-h-11 rounded-xl border border-warm-gray/15 px-3 font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => showPhoto(1)}
                aria-label="Ver foto siguiente"
                className="min-h-11 rounded-xl border border-warm-gray/15 px-3 font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Siguiente
              </button>
            </span>
          )}
        </figcaption>
      </figure>
      <dialog
        ref={dialogRef}
        aria-label={`Galería de fotos de ${title}`}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          if (photos.length < 2) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            showPhoto(-1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            showPhoto(1);
          }
        }}
        className="m-auto h-[min(92dvh,64rem)] w-[min(96vw,80rem)] max-w-none overflow-hidden rounded-2xl border-0 bg-warm-gray p-0 text-white shadow-2xl backdrop:bg-black/80"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <h2 className="min-w-0 truncate text-base font-bold sm:text-lg">
              Fotos de {title}
            </h2>
            <div className="flex shrink-0 items-center gap-3">
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-white/75"
              >
                Foto {active + 1} de {photos.length}
              </p>
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="min-h-11 rounded-xl border border-white/25 px-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Cerrar
              </button>
            </div>
          </header>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-3 pb-4 sm:gap-4 sm:px-6">
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() => showPhoto(-1)}
                aria-label="Ver foto anterior"
                className="min-h-11 shrink-0 rounded-xl border border-white/25 px-3 font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Anterior
              </button>
            )}
            {selectedFailed ? (
              <p
                role="alert"
                className="px-6 text-center text-sm text-white/80"
              >
                No se pudo cargar esta fotografía.
              </p>
            ) : (
              <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center">
                {!selectedLoaded && (
                  <p role="status" className="absolute text-sm text-white/75">
                    Cargando fotografía…
                  </p>
                )}
                <img
                  src={selected.url}
                  alt={`Foto ${active + 1} de ${title}`}
                  onLoad={() => markPhotoLoaded(selected.url)}
                  onError={() => markPhotoFailed(selected.url)}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}
            {photos.length > 1 && (
              <button
                type="button"
                onClick={() => showPhoto(1)}
                aria-label="Ver foto siguiente"
                className="min-h-11 shrink-0 rounded-xl border border-white/25 px-3 font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Siguiente
              </button>
            )}
          </div>
        </div>
      </dialog>
      {photos.length > 1 && (
        <div
          className="flex gap-2 overflow-x-auto pb-2"
          aria-label="Elegir una foto"
        >
          {photos.map((photo, index) => (
            <button
              key={`${photo.id}-${index}`}
              type="button"
              onClick={() => setActive(index)}
              aria-label={`Mostrar foto ${index + 1} de ${title}`}
              aria-pressed={active === index}
              className={`h-20 w-24 shrink-0 overflow-hidden rounded-xl border-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong sm:h-24 sm:w-32 ${active === index ? "border-terracotta-strong" : "border-transparent hover:border-warm-gray/40"}`}
            >
              <img
                src={photo.url}
                alt=""
                width={160}
                height={120}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
