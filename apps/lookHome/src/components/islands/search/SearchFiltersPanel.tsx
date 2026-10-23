import type { RefObject } from "react";
import type { SearchFilters, LocationSuggestion } from "@/features/search/types";

type ActiveFilter = { key: string; label: string };

type SearchFiltersPanelProps = {
  open: boolean;
  navigating: boolean;
  initialValues: SearchFilters;
  locationSelection: LocationSuggestion | null;
  activeFilters: ActiveFilter[];
  activeFilterCount: number;
  rentalMode: string;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  removeFilterHref: (key: string) => string;
  onRentalModeChange: (mode: string) => void;
  onClose: () => void;
};

const accommodationTypes = [
  { value: "house", label: "Casa" },
  { value: "apartment", label: "Departamento" },
  { value: "room", label: "Cuarto/habitación" },
] as const;

const rentalModes = [
  { value: "", label: "Todas" },
  { value: "monthly", label: "Por mes" },
  { value: "nightly", label: "Por día" },
] as const;

export default function SearchFiltersPanel({
  open,
  navigating,
  initialValues,
  locationSelection,
  activeFilters,
  activeFilterCount,
  rentalMode,
  closeButtonRef,
  panelRef,
  removeFilterHref,
  onRentalModeChange,
  onClose,
}: SearchFiltersPanelProps) {
  const priceUnitLabel =
    rentalMode === "nightly"
      ? "PEN por día"
      : rentalMode === "monthly"
        ? "PEN por mes"
        : null;

  return (
    <>
      {open && (
        <button
          type="button"
          className="pointer-events-auto fixed inset-0 z-[55] bg-warm-gray/50 backdrop-blur-[2px] lg:hidden"
          onClick={onClose}
          aria-label="Cerrar filtros"
        />
      )}

      <aside
        ref={panelRef}
        id="advanced-filters-panel"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-labelledby="filters-title"
        className={`${open ? "flex" : "hidden"} pointer-events-auto fixed bottom-[max(.75rem,env(safe-area-inset-bottom))] left-[max(.75rem,env(safe-area-inset-left))] right-[max(.75rem,env(safe-area-inset-right))] top-[max(.75rem,env(safe-area-inset-top))] z-[60] flex-col overflow-hidden rounded-3xl border border-warm-gray/15 bg-white text-warm-gray shadow-[0_20px_48px_rgba(48,43,41,0.16)] sm:left-auto sm:w-[min(25rem,calc(100%-2rem))] lg:bottom-4 lg:right-4 lg:top-[5.25rem] lg:z-[39] lg:flex lg:w-[20rem] lg:rounded-2xl`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-warm-gray/10 px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-terracotta-strong">
              Refina tu búsqueda
            </p>
            <h2 id="filters-title" className="text-lg font-bold">
              Filtros
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full border border-warm-gray/20 text-xl leading-none hover:bg-cream focus-visible:outline-2 focus-visible:outline-terracotta-strong lg:hidden"
            aria-label="Cerrar filtros"
          >
            &times;
          </button>
          {activeFilterCount > 0 && (
            <span className="hidden rounded-full bg-[#fae9e2] px-3 py-1.5 text-xs font-semibold text-terracotta-strong lg:inline-flex">
              {activeFilterCount} activos
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {locationSelection ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-warm-gray/12 bg-cream px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-warm-gray/65">
                  Ubicación
                </p>
                <p className="mt-0.5 break-words text-sm font-semibold text-warm-gray">
                  {locationSelection.label}
                </p>
                <p className="mt-1 text-[11px] text-warm-gray/65">
                  Cámbiala desde el buscador superior.
                </p>
              </div>
              <a
                href={removeFilterHref("location")}
                data-search-navigation
                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-terracotta-strong hover:bg-white focus-visible:outline-2 focus-visible:outline-terracotta-strong"
                aria-label={`Quitar ubicación: ${locationSelection.label}`}
              >
                Quitar
              </a>
            </div>
          ) : (
            <p className="rounded-xl bg-cream px-3 py-2.5 text-xs leading-relaxed text-warm-gray/70">
              La ubicación se selecciona desde el buscador superior.
            </p>
          )}

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Filtros activos">
              {activeFilters.map((filter) => (
                <a
                  key={filter.key}
                  href={removeFilterHref(filter.key)}
                  data-search-navigation
                  className="rounded-full border border-terracotta-strong/30 bg-[#fae9e2] px-3 py-1.5 text-xs font-semibold text-terracotta-strong hover:border-terracotta-strong focus-visible:outline-2 focus-visible:outline-terracotta-strong"
                  aria-label={`Quitar filtro: ${filter.label}`}
                >
                  {filter.label} <span aria-hidden="true">&times;</span>
                </a>
              ))}
            </div>
          )}

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-warm-gray/75">
              Tipo de alojamiento
            </legend>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="accommodationType"
                  value=""
                  defaultChecked={!initialValues.accommodationType}
                />
                <span className="flex min-h-11 items-center justify-center rounded-xl border border-warm-gray/20 bg-cream px-2 text-center text-xs font-semibold peer-checked:border-terracotta-strong peer-checked:bg-[#fae9e2] peer-checked:text-terracotta-strong peer-focus-visible:outline-2 peer-focus-visible:outline-terracotta-strong">
                  Todas
                </span>
              </label>
              {accommodationTypes.map((type) => (
                <label key={type.value} className="cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="accommodationType"
                    value={type.value}
                    defaultChecked={initialValues.accommodationType === type.value}
                  />
                  <span className="flex min-h-11 items-center justify-center rounded-xl border border-warm-gray/20 bg-cream px-2 text-center text-xs font-semibold peer-checked:border-terracotta-strong peer-checked:bg-[#fae9e2] peer-checked:text-terracotta-strong peer-focus-visible:outline-2 peer-focus-visible:outline-terracotta-strong">
                    {type.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-warm-gray/75">
              Modalidad
            </legend>
            <div className="grid grid-cols-3 gap-1.5">
              {rentalModes.map((mode) => (
                <label key={mode.value || "all"} className="cursor-pointer">
                  <input
                    className="peer sr-only"
                    type="radio"
                    name="rentalMode"
                    value={mode.value}
                    checked={rentalMode === mode.value}
                    onChange={() => onRentalModeChange(mode.value)}
                  />
                  <span className="flex min-h-11 items-center justify-center rounded-xl border border-warm-gray/20 bg-cream px-1 text-center text-xs font-semibold peer-checked:border-terracotta-strong peer-checked:bg-[#fae9e2] peer-checked:text-terracotta-strong peer-focus-visible:outline-2 peer-focus-visible:outline-terracotta-strong">
                    {mode.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-warm-gray/75">
              Precio {priceUnitLabel ? `(${priceUnitLabel})` : "(PEN)"}
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold">
                Desde
                <input
                  type="number"
                  name="minPrice"
                  min="1"
                  step="0.01"
                  defaultValue={initialValues.minPrice ?? ""}
                  inputMode="decimal"
                  placeholder="100.00"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 outline-none focus:border-terracotta-strong focus:ring-2 focus:ring-terracotta-strong/20"
                />
              </label>
              <label className="text-xs font-semibold">
                Hasta
                <input
                  type="number"
                  name="maxPrice"
                  min="1"
                  step="0.01"
                  defaultValue={initialValues.maxPrice ?? ""}
                  inputMode="decimal"
                  placeholder="1500.00"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 outline-none focus:border-terracotta-strong focus:ring-2 focus:ring-terracotta-strong/20"
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-warm-gray/70">
              Los precios se comparan solo dentro de la modalidad elegida.
            </p>
          </fieldset>

          <label className="block text-xs font-semibold">
            Huéspedes
            <input
              type="number"
              name="guests"
              min="1"
              step="1"
              defaultValue={initialValues.guests ?? ""}
              inputMode="numeric"
              placeholder="Cantidad"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-warm-gray/20 bg-cream px-3 outline-none focus:border-terracotta-strong focus:ring-2 focus:ring-terracotta-strong/20"
            />
          </label>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-warm-gray/10 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <a
            href="/buscar"
            data-search-navigation
            className="flex h-11 items-center justify-center rounded-xl border border-warm-gray/25 text-sm font-bold hover:bg-cream focus-visible:outline-2 focus-visible:outline-terracotta"
          >
            Limpiar
          </a>
          <button
            type="submit"
            disabled={navigating}
            className="h-11 rounded-xl bg-terracotta px-4 text-sm font-bold text-[#231f1d] hover:bg-soft-coral focus-visible:outline-2 focus-visible:outline-warm-gray disabled:cursor-wait disabled:opacity-70"
          >
            {navigating ? "Aplicando…" : "Aplicar filtros"}
          </button>
        </div>
      </aside>
    </>
  );
}
