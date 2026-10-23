import type { FavoriteItem } from "@/features/favorites/types";
import { favoriteAvailabilityLabel } from "@/features/favorites/presentation";

type Props = {
  item: FavoriteItem;
  busy: boolean;
  disabled?: boolean;
  onRemove: () => void;
};

function rentalModeLabel(mode: FavoriteItem["rentalMode"]) {
  if (mode === "nightly") return "Por noche";
  if (mode === "monthly") return "Por mes";
  return "Modalidad por confirmar";
}

function unitTypeLabel(unitType: FavoriteItem["unitType"]) {
  if (unitType === "entire_place") return "Vivienda completa";
  if (unitType === "private_room") return "Habitación privada";
  if (unitType === "shared_bed") return "Cama compartida";
  return null;
}

export default function FavoriteCard({
  item,
  busy,
  disabled = false,
  onRemove,
}: Props) {
  const unitLabel = unitTypeLabel(item.unitType);
  const unavailableLabel = item.availabilityReason
    ? favoriteAvailabilityLabel(item.availabilityReason)
    : null;

  const content = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-cream">
        <img
          src={item.imageUrl || "/property-placeholder.svg"}
          alt=""
          width={640}
          height={480}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none"
        />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-warm-gray shadow-sm">
          {rentalModeLabel(item.rentalMode)}
        </span>
      </div>
      <div className="min-w-0 space-y-2 px-5 pb-4 pt-5">
        {item.listingTitle && item.listingTitle !== item.title && (
          <p className="truncate text-xs font-semibold uppercase tracking-[0.1em] text-warm-gray/60">
            {item.listingTitle}
          </p>
        )}
        <h2 className="line-clamp-2 break-words text-lg font-bold leading-snug text-warm-gray">
          {item.title}
        </h2>
        {unavailableLabel && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
            No disponible: {unavailableLabel.toLocaleLowerCase("es-PE")}. No
            puedes abrirla ni enviar una solicitud mientras esté oculta.
          </p>
        )}
        {unitLabel && (
          <p className="text-sm font-semibold text-terracotta-strong">
            {unitLabel}
          </p>
        )}
        {item.addressLabel && (
          <p className="line-clamp-1 break-words text-sm text-warm-gray/75">
            {item.addressLabel}
          </p>
        )}
        <p
          className={`pt-1 font-bold ${
            item.rentAmount != null && item.currencyCode
              ? "text-lg text-terracotta-strong"
              : "text-sm text-warm-gray/70"
          }`}
        >
          {item.priceLabel || "Precio no disponible"}
        </p>
        {item.depositLabel && (
          <p className="text-xs text-warm-gray/75">{item.depositLabel}</p>
        )}
        {item.cleaningFeeLabel && (
          <p className="text-xs text-warm-gray/75">{item.cleaningFeeLabel}</p>
        )}
        {(item.beds != null || item.bathrooms != null || item.areaLabel) && (
          <ul
            aria-label="Características de la oferta"
            className="flex flex-wrap gap-2 pt-1 text-xs text-warm-gray/75"
          >
            {item.beds != null && (
              <li className="rounded-full bg-cream px-2.5 py-1">
                {item.beds} {item.beds === 1 ? "cama" : "camas"}
              </li>
            )}
            {item.bathrooms != null && (
              <li className="rounded-full bg-cream px-2.5 py-1">
                {item.bathrooms} {item.bathrooms === 1 ? "baño" : "baños"}
              </li>
            )}
            {item.areaLabel && (
              <li className="rounded-full bg-cream px-2.5 py-1">
                {item.areaLabel}
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-warm-gray/10 bg-white shadow-[0_12px_36px_rgba(80,76,74,0.07)] transition-shadow hover:shadow-[0_18px_44px_rgba(80,76,74,0.12)]">
      {unavailableLabel ? (
        <div className="block min-w-0 cursor-default">{content}</div>
      ) : (
        <a
          href={item.href}
          className="block min-w-0 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-terracotta-strong"
        >
          {content}
        </a>
      )}
      <footer className="mt-auto flex items-center justify-between gap-3 border-t border-warm-gray/10 px-5 py-3">
        {unavailableLabel ? (
          <span className="text-sm font-semibold text-warm-gray/70">
            No disponible
          </span>
        ) : (
          <a
            href={item.href}
            className="inline-flex min-h-11 items-center font-semibold text-terracotta-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          >
            Ver oferta
          </a>
        )}
        <button
          type="button"
          disabled={busy || disabled}
          onClick={onRemove}
          aria-label={`Quitar ${item.title} de favoritos`}
          className="min-h-11 rounded-xl px-3 text-sm font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Quitando…" : "Quitar"}
        </button>
      </footer>
    </article>
  );
}
