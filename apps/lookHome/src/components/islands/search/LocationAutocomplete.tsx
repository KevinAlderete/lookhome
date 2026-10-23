import { useEffect, useId, useRef, useState } from "react";
import type {
  LocationSelectionType,
  LocationSuggestion,
} from "@/features/search/types";

type Props = {
  value: string;
  selection: LocationSuggestion | null;
  onValueChange: (value: string) => void;
  onSelectionChange: (selection: LocationSuggestion | null) => void;
  inputId?: string;
  placeholder?: string;
  labelText?: string;
  labelClassName?: string;
  describedBy?: string;
  type?: LocationSelectionType;
};

export default function LocationAutocomplete({
  value,
  selection,
  onValueChange,
  onSelectionChange,
  inputId = "search-location",
  placeholder = "Distrito, provincia o departamento",
  labelText = "Ubicación",
  labelClassName = "sr-only",
  describedBy,
  type,
}: Props) {
  const listId = useId();
  const [items, setItems] = useState<LocationSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const abortRef = useRef<AbortController | null>(null);
  const displayValue = selection?.label ?? value;

  useEffect(() => {
    if (selection) {
      abortRef.current?.abort();
      setItems([]);
      setOpen(false);
      setLoading(false);
      setError(false);
      return;
    }
    const normalizedQuery = value.trim();
    if (normalizedQuery.length < 2) {
      abortRef.current?.abort();
      setItems([]);
      setOpen(false);
      setLoading(false);
      setError(false);
      setActiveIndex(-1);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(false);
    setOpen(true);

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/locations/suggest?q=${encodeURIComponent(normalizedQuery)}${type ? `&type=${encodeURIComponent(type)}` : ""}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("No se pudieron cargar ubicaciones");

        const data = (await response.json()) as {
          items?: LocationSuggestion[];
        };
        if (controller.signal.aborted) return;
        setItems(Array.isArray(data.items) ? data.items : []);
        setActiveIndex(-1);
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          setItems([]);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [selection, type, value]);

  const selectItem = (item: LocationSuggestion) => {
    onValueChange("");
    onSelectionChange(item);
    setOpen(false);
    setActiveIndex(-1);
  };

  const editText = (nextValue: string) => {
    if (selection) onSelectionChange(null);
    onValueChange(nextValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % items.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? items.length - 1 : current - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectItem(items[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const status = loading
    ? "Buscando ubicaciones..."
    : error
      ? "No pudimos cargar las ubicaciones. Intenta nuevamente."
      : items.length === 0
        ? "No encontramos ubicaciones con ese nombre."
        : "";

  return (
    <div className="relative w-full min-w-0 flex-1">
      <label htmlFor={inputId} className={labelClassName}>
        {labelText}
      </label>
      <input
        id={inputId}
        type="search"
        value={displayValue}
        onChange={(event) => editText(event.target.value)}
        onFocus={() => !selection && value.trim().length >= 2 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={200}
        role="combobox"
        aria-describedby={describedBy}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
        }
        className="h-12 w-full rounded-xl border border-warm-gray/25 bg-white px-4 text-base text-warm-gray outline-none transition placeholder:text-warm-gray/55 focus:border-terracotta focus:ring-2 focus:ring-terracotta/25"
      />

      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label="Ubicaciones sugeridas"
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-72 overflow-auto rounded-2xl border border-warm-gray/15 bg-white p-2 shadow-[0_18px_50px_rgba(80,76,74,0.18)]"
        >
          {status && (
            <p
              className={`px-3 py-3 text-sm ${error ? "text-red-700" : "text-warm-gray/70"}`}
              role={error ? "alert" : "status"}
              aria-live="polite"
            >
              {status}
            </p>
          )}

          {!loading &&
            !error &&
            items.map((item, index) => (
              <button
                id={`${listId}-${index}`}
                key={item.id}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectItem(item)}
                className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-warm-gray transition hover:bg-cream aria-selected:bg-cream"
              >
                <span className="block font-semibold">{item.label}</span>
                <span className="text-xs capitalize text-warm-gray/65">
                  {item.type === "city"
                    ? "Provincia"
                    : item.type === "region"
                      ? "Departamento"
                      : item.type === "district"
                        ? "Distrito"
                        : "País"}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
