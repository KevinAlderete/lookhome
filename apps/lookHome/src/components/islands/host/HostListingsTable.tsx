import { useState } from "react";
import type { HostListingItem } from "@/features/host/listings/types";

type Props = {
  rows: HostListingItem[];
  initialError?: string | null;
  hasFilters?: boolean;
};

const STATUS: Record<
  string,
  { label: string; detail: string; styles: string }
> = {
  draft: {
    label: "Borrador",
    detail: "Solo tú puedes verlo.",
    styles: "border-warm-gray/20 bg-cream text-warm-gray",
  },
  pending_review: {
    label: "En revisión",
    detail: "La revisión aún no es una publicación pública.",
    styles: "border-amber-300 bg-amber-50 text-amber-900",
  },
  published: {
    label: "Publicado",
    detail: "Visible en la búsqueda pública.",
    styles: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  paused: {
    label: "Pausado",
    detail: "No aparece en la búsqueda pública.",
    styles: "border-amber-300 bg-amber-50 text-amber-900",
  },
  suspended: {
    label: "Suspendido",
    detail: "Solo moderación puede cambiar este estado.",
    styles: "border-red-300 bg-red-50 text-red-800",
  },
  archived: {
    label: "Archivado",
    detail: "No aparece en la búsqueda pública.",
    styles: "border-warm-gray/20 bg-cream text-warm-gray",
  },
};

const OFFER_TYPE: Record<string, string> = {
  entire_place: "Vivienda completa",
  private_room: "Cuarto/habitación",
  shared_bed: "Cama compartida",
};

const PROPERTY_TYPE: Record<string, string> = {
  house: "Casa",
  apartment: "Departamento",
  building: "Edificio",
  shared_house: "Casa compartida",
  other: "Otro inmueble",
};

function listingKindLabel(row: HostListingItem) {
  if (row.isDraftRecord && !row.offerType) return "Tipo pendiente";
  if (row.offerType === "private_room" || row.offerType === "shared_bed")
    return "Cuarto/habitación";
  if (row.propertyType === "house") return "Casa";
  if (row.propertyType === "apartment") return "Departamento";
  return PROPERTY_TYPE[row.propertyType ?? ""] ?? "Anuncio";
}

function formatPEN(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(
        amount,
      )
    : String(value);
}

function ListingActions({
  row,
  loading,
  onAction,
}: {
  row: HostListingItem;
  loading: boolean;
  onAction: (action: "publish" | "pause" | "archive") => void;
}) {
  if (row.isDraftRecord && row.draftKey) {
    return (
      <a
        href={`/host/anuncios/nuevo?draftKey=${encodeURIComponent(row.draftKey)}`}
        className="inline-flex min-h-10 items-center rounded-xl bg-terracotta px-3 font-semibold text-white hover:bg-soft-coral"
      >
        Continuar borrador
      </a>
    );
  }
  const canCompleteOffer = Boolean(
    row.missingOffer && ["draft", "paused", "published"].includes(row.status),
  );
  const canEdit =
    !row.requiresOfferReview &&
    !row.missingOffer &&
    !["pending_review", "suspended", "archived"].includes(row.status);
  return (
    <div className="flex flex-wrap gap-2">
      {canEdit && (
        <a
          href={`/host/anuncios/${encodeURIComponent(row.id)}/editar`}
          className="inline-flex min-h-10 items-center rounded-xl border border-warm-gray/20 px-3 font-semibold hover:bg-cream"
        >
          Editar anuncio
        </a>
      )}
      {!canEdit && !canCompleteOffer && (
        <a
          href={`/host/anuncios/${encodeURIComponent(row.id)}/editar`}
          className="inline-flex min-h-10 items-center rounded-xl border border-warm-gray/20 px-3 font-semibold hover:bg-cream"
        >
          Ver estado
        </a>
      )}
      {row.status === "published" && (
        <>
          {!row.missingOffer &&
            !row.visibilityIssue &&
            !row.bookingVisibilityIssue && (
              <a
                href={`/listings/${encodeURIComponent(row.id)}`}
                className="inline-flex min-h-10 items-center rounded-xl border border-warm-gray/20 px-3 font-semibold hover:bg-cream"
              >
                Vista pública
              </a>
            )}
          {row.visibilityIssue &&
          row.offerNeedsActivation &&
          !row.bookingVisibilityIssue &&
          row.offerCount === 1 ? (
            <button
              type="button"
              onClick={() => onAction("publish")}
              disabled={loading}
              className="min-h-10 rounded-xl bg-terracotta px-3 font-semibold text-white hover:bg-soft-coral disabled:opacity-60"
            >
              Activar oferta
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onAction("pause")}
              disabled={loading}
              className="min-h-10 rounded-xl border border-warm-gray/20 px-3 font-semibold hover:bg-cream disabled:opacity-60"
            >
              Pausar
            </button>
          )}
        </>
      )}
      {row.status === "draft" && (
        <button
          type="button"
          onClick={() => onAction("publish")}
          disabled={loading || row.requiresOfferReview || row.missingOffer}
          className="min-h-10 rounded-xl bg-terracotta px-3 font-semibold text-white hover:bg-soft-coral disabled:opacity-60"
        >
          Publicar
        </button>
      )}
      {row.status === "paused" && (
        <>
          <button
            type="button"
            onClick={() => onAction("publish")}
            disabled={loading || row.requiresOfferReview || row.missingOffer}
            className="min-h-10 rounded-xl bg-terracotta px-3 font-semibold text-white hover:bg-soft-coral disabled:opacity-60"
          >
            Reactivar
          </button>
          {!row.requiresOfferReview && (
            <button
              type="button"
              onClick={() => onAction("archive")}
              disabled={loading}
              className="min-h-10 rounded-xl border border-warm-gray/20 px-3 font-semibold disabled:opacity-60"
            >
              Archivar
            </button>
          )}
        </>
      )}
      {row.status === "pending_review" && (
        <span className="inline-flex min-h-10 items-center rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900">
          Esperando revisión
        </span>
      )}
      {row.status === "suspended" && (
        <span className="inline-flex min-h-10 items-center rounded-xl border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-800">
          Gestionado por moderación
        </span>
      )}
      {row.status === "archived" && (
        <span className="inline-flex min-h-10 items-center rounded-xl border border-warm-gray/20 bg-cream px-3 text-sm font-semibold">
          Archivado
        </span>
      )}
      {row.requiresOfferReview && (
        <a
          href={`/host/anuncios/${encodeURIComponent(row.id)}/editar`}
          className="inline-flex min-h-10 items-center rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900"
        >
          Revisar anuncio anterior
        </a>
      )}
      {canCompleteOffer && (
        <a
          href={`/host/anuncios/${encodeURIComponent(row.id)}/editar`}
          className="inline-flex min-h-10 items-center rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-semibold text-amber-900"
        >
          Completar oferta
        </a>
      )}
    </div>
  );
}

export default function HostListingsTable({
  rows,
  initialError = null,
  hasFilters = false,
}: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  const handleAction = async (
    row: HostListingItem,
    action: "publish" | "pause" | "archive",
  ) => {
    setLoadingId(row.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/host/listings/${encodeURIComponent(row.id)}/${action}`,
        { method: "PATCH" },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(data?.message || "No se pudo actualizar el anuncio.");
      window.location.reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo actualizar el anuncio.",
      );
      setLoadingId(null);
    }
  };

  if (error)
    return (
      <section
        className="rounded-3xl border border-red-200 bg-white p-7"
        aria-labelledby="host-listings-load-error"
      >
        <h2
          id="host-listings-load-error"
          className="text-xl font-bold text-warm-gray"
        >
          No se cargaron los anuncios
        </h2>
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-11 rounded-xl bg-terracotta px-4 font-semibold text-white"
        >
          Intentar de nuevo
        </button>
      </section>
    );

  if (!rows.length)
    return hasFilters ? (
      <section className="rounded-3xl border border-dashed border-warm-gray/25 bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-warm-gray">
          No encontramos anuncios con estos filtros
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-warm-gray/70">
          Prueba con otra búsqueda o quita los filtros.
        </p>
        <a
          href="/host/anuncios"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl border border-warm-gray/20 px-5 font-semibold"
        >
          Quitar filtros
        </a>
      </section>
    ) : (
      <section className="rounded-3xl border border-dashed border-warm-gray/25 bg-white p-8 text-center">
        <h2 className="text-xl font-bold text-warm-gray">
          Todavía no tienes anuncios
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-warm-gray/70">
          Crea una oferta con precio, modalidad y ubicación. Puedes guardarla
          como borrador y retomarla después.
        </p>
        <a
          href="/host/anuncios/nuevo"
          className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-terracotta px-5 font-semibold text-white"
        >
          Crear anuncio
        </a>
      </section>
    );

  const renderStatus = (row: HostListingItem) => {
    if (row.bookingVisibilityIssue) {
      const reason =
        row.bookingVisibilityReason === "active"
          ? "Hay una estancia en curso. El anuncio volverá a la búsqueda al completarse."
          : row.bookingVisibilityReason === "disputed"
            ? "La solicitud está en revisión. El anuncio permanecerá oculto hasta que se resuelva."
            : "Hay una solicitud aprobada. El anuncio volverá a la búsqueda cuando deje de estar activa.";
      return (
        <div>
          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
            Oculto temporalmente
          </span>
          <span className="mt-1 block max-w-64 text-xs leading-5 text-warm-gray/65">
            {reason}
          </span>
        </div>
      );
    }
    if (row.visibilityIssue)
      return (
        <div>
          <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
            {row.missingOffer
              ? "Sin oferta pública"
              : row.offerNeedsActivation
                ? "Oferta no visible"
                : "Oferta pausada"}
          </span>
          <span className="mt-1 block text-xs text-warm-gray/65">
            {row.missingOffer
              ? "Completa una oferta para aparecer en la búsqueda."
              : row.offerNeedsActivation
                ? "La oferta quedó como borrador. Actívala para aparecer en la búsqueda."
                : "Pausa y reactiva el anuncio para volver a mostrar la oferta."}
          </span>
        </div>
      );
    const state = STATUS[row.status] ?? STATUS.draft;
    return (
      <div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${state.styles}`}
        >
          {state.label}
        </span>
        <span className="mt-1 block text-xs text-warm-gray/65">
          {state.detail}
        </span>
      </div>
    );
  };
  const renderOffer = (row: HostListingItem) => {
    if (row.requiresOfferReview)
      return (
        <span className="text-sm font-semibold text-amber-900">
          Anuncio anterior: varias ofertas
        </span>
      );
    if (row.missingOffer && !row.isDraftRecord)
      return (
        <span className="text-sm font-semibold text-amber-900">
          Anuncio anterior sin oferta asociada
        </span>
      );
    if (!row.offerType && !row.rentalMode && row.isDraftRecord)
      return (
        <span className="text-sm text-warm-gray/65">Oferta incompleta</span>
      );
    const type = OFFER_TYPE[row.offerType ?? ""] ?? "Oferta pendiente";
    const price =
      row.price != null && row.rentalMode
        ? `S/ ${formatPEN(row.price)} por ${row.rentalMode === "nightly" ? "día" : "mes"}`
        : "Precio pendiente";
    return (
      <div>
        <span className="block font-semibold">{type}</span>
        <span className="mt-1 block text-sm text-warm-gray/75">{price}</span>
        {row.maxGuests != null && (
          <span className="mt-1 block text-xs text-warm-gray/65">
            Hasta {row.maxGuests} huéspedes
          </span>
        )}
      </div>
    );
  };

  return (
    <section aria-label="Anuncios" className="space-y-3">
      <p className="text-sm text-warm-gray/70">
        {rows.length} anuncios en esta página
      </p>
      <div className="overflow-hidden rounded-3xl bg-white shadow-[0_18px_50px_rgba(80,76,74,0.08)]">
        {error && (
          <p
            role="alert"
            className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="hidden min-w-full border-collapse md:table">
            <caption className="sr-only">
              Anuncios del anfitrión, oferta, ubicación, estado y acciones
            </caption>
            <thead className="bg-cream">
              <tr className="text-left text-sm text-warm-gray/75">
                <th scope="col" className="px-5 py-4 font-semibold">
                  Anuncio
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Espacio y precio
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Ubicación
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Estado
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Actualizado
                </th>
                <th scope="col" className="px-5 py-4 font-semibold">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-warm-gray/10 align-top text-sm"
                >
                  <td className="max-w-xs px-5 py-4">
                    <strong className="block break-words text-warm-gray [overflow-wrap:anywhere]">
                      {row.title}
                    </strong>
                    <span className="mt-1 block text-xs text-warm-gray/65">
                      {listingKindLabel(row)}
                    </span>
                    {row.requiresOfferReview && (
                      <p className="mt-2 text-xs leading-5 text-amber-900">
                        No se combinaron sus ofertas anteriores. Se requiere
                        revisión antes de editar o publicar.
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">{renderOffer(row)}</td>
                  <td className="px-5 py-4 text-warm-gray/75">
                    {[row.district, row.city].filter(Boolean).join(", ") ||
                      "Ubicación pendiente"}
                  </td>
                  <td className="px-5 py-4">{renderStatus(row)}</td>
                  <td className="px-5 py-4 text-warm-gray/75">
                    {row.updatedAt ?? row.createdAt ?? "—"}
                  </td>
                  <td className="max-w-sm px-5 py-4">
                    <ListingActions
                      row={row}
                      loading={loadingId === row.id}
                      onAction={(action) => void handleAction(row, action)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-3 p-3 md:hidden">
          {rows.map((row) => (
            <article
              key={row.id}
              className="rounded-2xl border border-warm-gray/12 p-4"
            >
              <div className="flex gap-3">
                {row.coverUrl && (
                  <img
                    src={row.coverUrl}
                    alt=""
                    width="80"
                    height="80"
                    loading="lazy"
                    className="h-20 w-20 shrink-0 rounded-xl object-cover"
                  />
                )}
                <div className="min-w-0">
                  <h2 className="break-words font-bold text-warm-gray [overflow-wrap:anywhere]">
                    {row.title}
                  </h2>
                  <p className="mt-1 text-xs text-warm-gray/65">
                    {listingKindLabel(row)}
                  </p>
                  <p className="mt-1 text-xs text-warm-gray/65">
                    {[row.district, row.city].filter(Boolean).join(", ") ||
                      "Ubicación pendiente"}
                  </p>
                </div>
              </div>
              <div className="mt-4">{renderOffer(row)}</div>
              <div className="mt-4">{renderStatus(row)}</div>
              <p className="mt-3 text-xs text-warm-gray/65">
                Actualizado: {row.updatedAt ?? row.createdAt ?? "—"}
              </p>
              <div className="mt-4">
                <ListingActions
                  row={row}
                  loading={loadingId === row.id}
                  onAction={(action) => void handleAction(row, action)}
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
