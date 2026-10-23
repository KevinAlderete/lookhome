import { useState } from "react";
import type { FormEvent } from "react";
import type { LocationSuggestion } from "@/features/search/types";
import LocationAutocomplete from "./LocationAutocomplete";
import {
  editLocationQuery,
  locationSelectionFormFields,
  selectStructuredLocation,
} from "@/features/search/location-state";

export default function HomeLocationSearch() {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<LocationSuggestion | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const updateQuery = (value: string) => {
    const next = editLocationQuery(value);
    setQuery(next.query);
    setSelection(next.selection);
  };

  const updateSelection = (nextSelection: LocationSuggestion | null) => {
    if (!nextSelection) {
      setSelection(null);
      return;
    }
    const next = selectStructuredLocation(nextSelection);
    setQuery(next.query);
    setSelection(next.selection);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (submitting) {
      event.preventDefault();
      return;
    }
    setSubmitting(true);
  };

  return (
    <form
      action="/buscar"
      method="GET"
      onSubmit={handleSubmit}
      aria-busy={submitting}
      className="w-full min-w-0 max-w-2xl rounded-2xl border border-warm-gray/12 bg-white p-3 shadow-[0_4px_12px_rgba(48,43,41,0.08)] sm:p-4"
    >
      <input type="hidden" name="q" value={query} />
      {locationSelectionFormFields(selection).map((field) => (
        <input
          key={field.name}
          type="hidden"
          name={field.name}
          value={field.value}
        />
      ))}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="w-full min-w-0">
          <LocationAutocomplete
            value={query}
            selection={selection}
            onValueChange={updateQuery}
            onSelectionChange={updateSelection}
            inputId="home-location"
            labelText="¿Dónde quieres vivir?"
            labelClassName="mb-2 block text-sm font-semibold text-warm-gray"
            describedBy="home-location-help"
            placeholder="Distrito, provincia o departamento"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-12 w-full rounded-xl bg-terracotta px-6 font-semibold text-white transition hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-wait disabled:opacity-70 sm:w-auto"
        >
          {submitting ? "Buscando…" : "Buscar viviendas"}
        </button>
      </div>
      <p id="home-location-help" className="mt-2 px-1 text-xs leading-5 text-warm-gray/65">
        Busca por distrito, provincia o departamento en Perú.
      </p>
    </form>
  );
}
