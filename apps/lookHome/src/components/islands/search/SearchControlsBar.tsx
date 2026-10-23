import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import LocationAutocomplete from "./LocationAutocomplete";
import SearchFiltersPanel from "./SearchFiltersPanel";
import type {
  AccommodationType,
  LocationSuggestion,
  PropertyType,
  SearchFilters,
} from "@/features/search/types";
import {
  removeSearchFilterParams,
  searchHref,
  updateSearchFormParams,
} from "@/features/search/search-params";
import {
  editLocationQuery,
  locationSelectionFormFields,
  selectStructuredLocation,
} from "@/features/search/location-state";

type SearchControlsBarProps = {
  initialValues?: SearchFilters;
  preservedQuery?: string;
  initialLocationSelection?: LocationSuggestion | null;
};

const legacyPropertyTypeLabels: Record<PropertyType, string> = {
  house: "Casa",
  apartment: "Departamento",
  building: "Edificio",
  shared_house: "Casa compartida",
  other: "Otro inmueble",
};

const accommodationTypeLabels: Record<AccommodationType, string> = {
  house: "Casa",
  apartment: "Departamento",
  room: "Cuarto/habitación",
};

export default function SearchControlsBar({
  initialValues = {},
  preservedQuery = "",
  initialLocationSelection = null,
}: SearchControlsBarProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const filtersPanelRef = useRef<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState(initialValues.q ?? "");
  const [rentalMode, setRentalMode] = useState(initialValues.rentalMode ?? "");
  const [locationSelection, setLocationSelection] =
    useState<LocationSuggestion | null>(initialLocationSelection);
  const [navigating, setNavigating] = useState(false);
  const priceUnitLabel =
    rentalMode === "nightly"
      ? "PEN por día"
      : rentalMode === "monthly"
        ? "PEN por mes"
        : null;

  const updateLocationText = (value: string) => {
    const next = editLocationQuery(value);
    setQ(next.query);
    setLocationSelection(next.selection);
  };
  const updateLocationSelection = (selection: LocationSuggestion | null) => {
    if (!selection) {
      setLocationSelection(null);
      return;
    }
    const next = selectStructuredLocation(selection);
    setQ(next.query);
    setLocationSelection(next.selection);
  };

  const activeFilters = [
    initialValues.minPrice && {
      key: "minPrice",
      label: `Desde S/ ${initialValues.minPrice}${priceUnitLabel ? ` (${priceUnitLabel})` : " (elige modalidad)"}`,
    },
    initialValues.maxPrice && {
      key: "maxPrice",
      label: `Hasta S/ ${initialValues.maxPrice}${priceUnitLabel ? ` (${priceUnitLabel})` : " (elige modalidad)"}`,
    },
    initialValues.guests && {
      key: "guests",
      label: `${initialValues.guests} huésped${initialValues.guests === "1" ? "" : "es"}`,
    },
    initialValues.accommodationType && {
      key: "accommodationType",
      label: accommodationTypeLabels[initialValues.accommodationType],
    },
    initialValues.propertyType && {
      key: "propertyType",
      label: `Filtro anterior: ${legacyPropertyTypeLabels[initialValues.propertyType]}`,
    },
    initialValues.rentalMode && {
      key: "rentalMode",
      label: initialValues.rentalMode === "monthly" ? "Por mes" : "Por día",
    },
  ].filter(Boolean) as Array<{ key: string; label: string }>;
  const activeFilterCount = activeFilters.length + (locationSelection ? 1 : 0);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        return;
      }
      if (event.key !== "Tab" || !filtersPanelRef.current) return;

      const focusable = Array.from(
        filtersPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleModalKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleModalKeyDown);
      filterButtonRef.current?.focus();
    };
  }, [filtersOpen]);

  const removeFilterHref = (key: string) =>
    searchHref(removeSearchFilterParams(preservedQuery, key));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const minPriceInput = form.elements.namedItem(
      "minPrice",
    ) as HTMLInputElement | null;
    const maxPriceInput = form.elements.namedItem(
      "maxPrice",
    ) as HTMLInputElement | null;
    minPriceInput?.setCustomValidity("");
    maxPriceInput?.setCustomValidity("");

    if (
      minPriceInput?.value &&
      maxPriceInput?.value &&
      Number(minPriceInput.value) > Number(maxPriceInput.value)
    ) {
      minPriceInput.setCustomValidity(
        "El precio mínimo no puede superar al precio máximo.",
      );
      minPriceInput.reportValidity();
      return;
    }

    const selectedRentalMode = (
      form.elements.namedItem("rentalMode") as RadioNodeList | null
    )?.value;
    if (
      (minPriceInput?.value || maxPriceInput?.value) &&
      !selectedRentalMode
    ) {
      const priceInput = minPriceInput?.value ? minPriceInput : maxPriceInput;
      priceInput?.setCustomValidity(
        "Elige Por día o Por mes para filtrar precios sin mezclar modalidades.",
      );
      priceInput?.reportValidity();
      return;
    }

    const values = new FormData(form);
    const entries: Array<[string, string]> = [];
    values.forEach((value, name) => entries.push([name, String(value)]));
    const params = updateSearchFormParams(preservedQuery, entries);

    setNavigating(true);
    window.location.assign(searchHref(params));
  };

  return (
    <form
      action="/buscar"
      method="GET"
      onSubmit={handleSubmit}
      aria-busy={navigating}
      className="pointer-events-none"
    >
      <input type="hidden" name="q" value={q} />
      {locationSelectionFormFields(locationSelection).map((field) => (
        <input key={field.name} type="hidden" name={field.name} value={field.value} />
      ))}
      {initialValues.pageSize && (
        <input type="hidden" name="pageSize" value={initialValues.pageSize} />
      )}

      <div className="pointer-events-auto fixed left-[max(.75rem,env(safe-area-inset-left))] right-[max(.75rem,env(safe-area-inset-right))] top-[4.85rem] z-[35] flex h-14 items-center gap-2 rounded-2xl border border-warm-gray/15 bg-white/96 p-1.5 shadow-[0_4px_16px_rgba(48,43,41,0.08)] backdrop-blur-sm sm:left-[10rem] sm:right-[15rem] sm:top-3 sm:z-50 lg:left-[13rem] lg:right-[23rem]">
        <span
          className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#fae9e2] text-[#a84f32]"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
        </span>
        <LocationAutocomplete
          value={q}
          selection={locationSelection}
          onValueChange={updateLocationText}
          onSelectionChange={updateLocationSelection}
          inputId="immersive-search-location"
          placeholder="Distrito, provincia o departamento"
        />
        <button
          ref={filterButtonRef}
          type="button"
          onClick={() => setFiltersOpen(true)}
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-warm-gray/15 bg-cream text-warm-gray hover:border-terracotta-strong focus-visible:outline-2 focus-visible:outline-terracotta-strong lg:hidden"
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          aria-controls="advanced-filters-panel"
          aria-label={`Abrir filtros${activeFilterCount ? `, ${activeFilterCount} activos` : ""}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M4 7h16M7 12h10M10 17h4" />
          </svg>
          {activeFilterCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#a84f32] px-1 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          type="submit"
          disabled={navigating}
            className="h-11 shrink-0 rounded-xl bg-terracotta px-4 text-sm font-semibold text-white transition hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-terracotta-strong disabled:cursor-wait disabled:opacity-70 sm:px-5"
        >
          <span className="hidden sm:inline">
            {navigating ? "Buscando..." : "Buscar"}
          </span>
          <span className="sm:hidden" aria-hidden="true">
            Ir
          </span>
        </button>
      </div>

      <SearchFiltersPanel
        open={filtersOpen}
        navigating={navigating}
        initialValues={initialValues}
        locationSelection={locationSelection}
        activeFilters={activeFilters}
        activeFilterCount={activeFilterCount}
        rentalMode={rentalMode}
        closeButtonRef={closeButtonRef}
        panelRef={filtersPanelRef}
        removeFilterHref={removeFilterHref}
        onRentalModeChange={setRentalMode}
        onClose={() => setFiltersOpen(false)}
      />
      <SearchFiltersPanel
        open={filtersOpen}
        navigating={navigating}
        initialValues={initialValues}
        locationSelection={locationSelection}
        activeFilters={activeFilters}
        activeFilterCount={activeFilterCount}
        rentalMode={rentalMode}
        closeButtonRef={closeButtonRef}
        panelRef={filtersPanelRef}
        removeFilterHref={removeFilterHref}
        onRentalModeChange={setRentalMode}
        onClose={() => setFiltersOpen(false)}
      />
    </form>
  );
}
