import { useEffect, useId, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FilterSpecification, Map as MapLibreMap } from "maplibre-gl";
import {
  coordinatesForAcceptedAddress,
  confirmationAfterPinMove,
  isCurrentRequest,
} from "@/features/search/location-state";

type AddressValue = {
  line1: string;
  line2: string;
  postalCode: string;
  lat: string;
  lng: string;
};

export type HostAddressSuggestion = {
  id: string;
  label: string;
  line1: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  type: string | null;
  precision:
    "address-candidate" | "street-reference" | "place-reference" | "poi";
  relevance: number | null;
  administrativeMatch: "matched" | "different" | "unknown";
  administrativeResolution: "unique" | "partial" | "unresolved";
  context: {
    country: string | null;
    region: string | null;
    city: string | null;
    district: string | null;
  };
  regionId: string | null;
  cityId: string | null;
  districtId: string | null;
};

export type HostAdministrativeContext = {
  regionId: string;
  cityId: string;
  districtId: string;
  region: string | null;
  city: string | null;
  district: string | null;
};

type HostAddressPickerProps = {
  value: AddressValue;
  confirmed: boolean;
  line1Error?: string;
  mapError?: string;
  onChange: (value: AddressValue) => void;
  onConfirmedChange: (confirmed: boolean) => void;
  administrativeContext: HostAdministrativeContext;
  onAdministrativeChange: (value: {
    regionId: string;
    cityId: string;
    districtId: string;
  }) => void | Promise<void>;
};

const PERU_CENTER: [number, number] = [-77.0428, -12.0464];
const OPEN_FREE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const IMPORTANT_POI_FILTER: FilterSpecification = [
  "any",
  ["match", ["get", "class"], ["school", "hospital"], true, false],
  [
    "match",
    ["get", "subclass"],
    [
      "university",
      "college",
      "school",
      "kindergarten",
      "hospital",
      "clinic",
      "doctors",
      "pharmacy",
      "police",
      "fire_station",
      "townhall",
      "library",
      "community_centre",
      "supermarket",
      "mall",
      "marketplace",
    ],
    true,
    false,
  ],
];

function addImportantPoiLayers(map: MapLibreMap) {
  if (!map.getSource("openmaptiles")) return;

  const beforeId = map.getLayer("poi_r1") ? "poi_r1" : undefined;
  map.addLayer(
    {
      id: "host-important-poi-points",
      type: "circle",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: 14,
      filter: IMPORTANT_POI_FILTER,
      paint: {
        "circle-color": [
          "match",
          ["get", "class"],
          "school",
          "#2563eb",
          "hospital",
          "#dc2626",
          "#d97706",
        ],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 3, 18, 6],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    },
    beforeId,
  );
  map.addLayer(
    {
      id: "host-important-poi-labels",
      type: "symbol",
      source: "openmaptiles",
      "source-layer": "poi",
      minzoom: 15,
      filter: IMPORTANT_POI_FILTER,
      layout: {
        "text-field": ["coalesce", ["get", "name"], ["get", "name_en"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 0.8],
        "text-max-width": 10,
      },
      paint: {
        "text-color": "#3f3a37",
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.5,
      },
    },
    beforeId,
  );
}

function coordinateValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function isWithinPeruBounds(lat: number, lng: number) {
  return lat >= -18.5 && lat <= 0.1 && lng >= -81.5 && lng <= -68.5;
}

function apiMessage(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(" ");
  }
  return fallback;
}

function contextLabel(item: HostAddressSuggestion) {
  return [item.context.district, item.context.city, item.context.region]
    .filter(Boolean)
    .join(", ");
}

function suggestionType(type: string | null) {
  const labels: Record<string, string> = {
    address: "Dirección",
    road: "Calle o vía",
    poi: "Lugar",
    place: "Ciudad",
    locality: "Localidad",
    neighbourhood: "Zona o barrio",
    municipality: "Distrito",
    municipal_district: "Distrito",
    joint_municipality: "Distrito",
    joint_submunicipality: "Distrito",
    subregion: "Provincia",
    county: "Provincia",
    region: "Departamento",
    district: "Distrito",
  };
  return type ? (labels[type] ?? "Ubicación") : "Ubicación";
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function HostAddressPicker({
  value,
  confirmed,
  line1Error,
  mapError,
  onChange,
  onConfirmedChange,
  administrativeContext,
  onAdministrativeChange,
}: HostAddressPickerProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onConfirmedChangeRef = useRef(onConfirmedChange);
  const onAdministrativeChangeRef = useRef(onAdministrativeChange);
  const valueRef = useRef(value);
  const confirmedRef = useRef(confirmed);
  const administrativeContextKeyRef = useRef(
    `${administrativeContext.regionId}:${administrativeContext.cityId}:${administrativeContext.districtId}`,
  );
  const searchAbortRef = useRef<AbortController | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const searchRequestIdRef = useRef(0);
  const reverseRequestIdRef = useRef(0);
  const skipNextSearchRef = useRef(false);
  const [query, setQuery] = useState(value.line1);
  const [suggestions, setSuggestions] = useState<HostAddressSuggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mapStatus, setMapStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [reverseSuggestion, setReverseSuggestion] =
    useState<HostAddressSuggestion | null>(null);
  const [appliedSuggestion, setAppliedSuggestion] =
    useState<HostAddressSuggestion | null>(null);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
    onConfirmedChangeRef.current = onConfirmedChange;
    onAdministrativeChangeRef.current = onAdministrativeChange;
    valueRef.current = value;
    confirmedRef.current = confirmed;
  }, [
    administrativeContext,
    confirmed,
    onAdministrativeChange,
    onChange,
    onConfirmedChange,
    value,
  ]);

  useEffect(() => {
    const nextKey = `${administrativeContext.regionId}:${administrativeContext.cityId}:${administrativeContext.districtId}`;
    if (administrativeContextKeyRef.current !== nextKey) {
      setAppliedSuggestion(null);
      administrativeContextKeyRef.current = nextKey;
    }
  }, [
    administrativeContext.regionId,
    administrativeContext.cityId,
    administrativeContext.districtId,
  ]);

  async function requestAddressSuggestions(
    searchQuery: string,
    mode: "autocomplete" | "complete",
  ) {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const requestId = ++searchRequestIdRef.current;
    setSearching(true);
    setSuggestions([]);
    setSearchError(null);
    setSearchMessage(null);
    setSearchOpen(true);

    try {
      const params = new URLSearchParams({ q: searchQuery, mode });
      if (administrativeContext.regionId)
        params.set("regionId", administrativeContext.regionId);
      if (administrativeContext.cityId)
        params.set("cityId", administrativeContext.cityId);
      if (administrativeContext.districtId)
        params.set("districtId", administrativeContext.districtId);

      const response = await fetch(
        `/api/host/geo/address/suggest?${params.toString()}`,
        { signal: controller.signal },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          apiMessage(data, "No pudimos buscar direcciones en este momento."),
        );
      }
      if (
        !isCurrentRequest(
          controller.signal,
          requestId,
          searchRequestIdRef.current,
        )
      ) {
        return;
      }
      setSuggestions(Array.isArray(data?.items) ? data.items : []);
      setSearchMessage(
        data?.retriedWithoutHouseNumber
          ? "Probamos también sin el número de puerta; revisa la calle y el contexto sugeridos."
          : null,
      );
      setActiveIndex(-1);
    } catch (requestError) {
      if (
        isCurrentRequest(
          controller.signal,
          requestId,
          searchRequestIdRef.current,
        ) &&
        (requestError as Error).name !== "AbortError"
      ) {
        setSuggestions([]);
        setSearchError(
          requestError instanceof Error
            ? requestError.message
            : "No pudimos buscar direcciones en este momento.",
        );
      }
    } finally {
      if (
        isCurrentRequest(
          controller.signal,
          requestId,
          searchRequestIdRef.current,
        )
      ) {
        setSearching(false);
      }
    }
  }

  async function reverseLookup(lat: number, lng: number) {
    reverseAbortRef.current?.abort();
    const controller = new AbortController();
    reverseAbortRef.current = controller;
    const requestId = ++reverseRequestIdRef.current;
    setReverseLoading(true);
    setReverseSuggestion(null);

    try {
      const params = new URLSearchParams({
        lat: formatCoordinate(lat),
        lng: formatCoordinate(lng),
      });
      const response = await fetch(
        `/api/host/geo/address/reverse?${params.toString()}`,
        { signal: controller.signal },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          apiMessage(data, "No pudimos identificar la dirección del pin."),
        );
      }

      if (
        !isCurrentRequest(
          controller.signal,
          requestId,
          reverseRequestIdRef.current,
        )
      ) {
        return;
      }

      setReverseSuggestion(data?.item ?? null);
      if (!data?.item) {
        setLocationMessage(
          "No encontramos una dirección para este punto. Puedes escribirla manualmente.",
        );
      }
    } catch (requestError) {
      if (
        isCurrentRequest(
          controller.signal,
          requestId,
          reverseRequestIdRef.current,
        ) &&
        (requestError as Error).name !== "AbortError"
      ) {
        setLocationMessage(
          requestError instanceof Error
            ? requestError.message
            : "No pudimos identificar la dirección del pin.",
        );
      }
    } finally {
      if (
        isCurrentRequest(
          controller.signal,
          requestId,
          reverseRequestIdRef.current,
        )
      ) {
        setReverseLoading(false);
      }
    }
  }

  function setPosition(lat: number, lng: number, reverse = true) {
    if (!isWithinPeruBounds(lat, lng)) {
      setLocationMessage("Selecciona una ubicación dentro de Perú.");
      const previousLat = coordinateValue(valueRef.current.lat);
      const previousLng = coordinateValue(valueRef.current.lng);
      if (previousLat != null && previousLng != null) {
        markerRef.current?.setLngLat([previousLng, previousLat]);
      }
      return;
    }

    const previousValue = valueRef.current;
    const nextValue = {
      ...previousValue,
      lat: formatCoordinate(lat),
      lng: formatCoordinate(lng),
    };
    const nextConfirmed = confirmationAfterPinMove(
      confirmedRef.current,
      { lat: previousValue.lat, lng: previousValue.lng },
      { lat: nextValue.lat, lng: nextValue.lng },
    );
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
    confirmedRef.current = nextConfirmed;
    onConfirmedChangeRef.current(nextConfirmed);
    setLocationMessage(null);

    const map = mapRef.current;
    if (map) {
      let marker = markerRef.current;
      if (!marker) {
        const newMarker = new maplibregl.Marker({
          color: "#a84f32",
          draggable: true,
        })
          .setLngLat([lng, lat])
          .addTo(map);
        newMarker.on("dragend", () => {
          const position = newMarker.getLngLat();
          setPosition(position.lat, position.lng);
        });
        markerRef.current = newMarker;
        marker = newMarker;
      }

      marker.setLngLat([lng, lat]);
      map.easeTo({
        center: [lng, lat],
        zoom: Math.max(map.getZoom(), 18),
        duration: prefersReducedMotion() ? 0 : 350,
      });
    }

    if (reverse) {
      setAppliedSuggestion(null);
      void reverseLookup(lat, lng);
    }
  }

  function applySuggestion(
    item: HostAddressSuggestion,
    preserveCurrentPosition = false,
  ) {
    searchAbortRef.current?.abort();
    searchRequestIdRef.current += 1;
    reverseAbortRef.current?.abort();
    reverseRequestIdRef.current += 1;
    const currentLat = coordinateValue(valueRef.current.lat);
    const currentLng = coordinateValue(valueRef.current.lng);
    const nextPosition = coordinatesForAcceptedAddress(
      { lat: currentLat, lng: currentLng },
      { lat: item.lat, lng: item.lng },
      preserveCurrentPosition,
    );
    const nextLat = nextPosition.lat;
    const nextLng = nextPosition.lng;
    skipNextSearchRef.current = true;
    setQuery(item.label);
    setSearchOpen(false);
    setSearching(false);
    setSuggestions([]);
    setActiveIndex(-1);
    setReverseSuggestion(null);
    setReverseLoading(false);
    setAppliedSuggestion(item);
    setSearchError(null);
    setSearchMessage(null);
    const nextValue = {
      ...valueRef.current,
      line1: item.line1,
      postalCode: item.postalCode ?? valueRef.current.postalCode,
      lat: formatCoordinate(nextLat),
      lng: formatCoordinate(nextLng),
    };
    valueRef.current = nextValue;
    onChangeRef.current(nextValue);
    confirmedRef.current = false;
    onConfirmedChangeRef.current(false);
    setPosition(nextLat, nextLng, false);
  }

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      setSearching(false);
      return;
    }
    if (normalizedQuery.length < 3) {
      searchAbortRef.current?.abort();
      searchRequestIdRef.current += 1;
      setSuggestions([]);
      setSearchOpen(false);
      setSearching(false);
      setSearchError(null);
      setSearchMessage(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void requestAddressSuggestions(normalizedQuery, "autocomplete");
    }, 350);

    return () => {
      window.clearTimeout(timer);
      searchAbortRef.current?.abort();
    };
  }, [
    query,
    administrativeContext.cityId,
    administrativeContext.districtId,
    administrativeContext.regionId,
  ]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const latitude = coordinateValue(value.lat);
    const longitude = coordinateValue(value.lng);
    const initialCenter: [number, number] =
      latitude != null && longitude != null
        ? [longitude, latitude]
        : PERU_CENTER;
    let loaded = false;
    let map: MapLibreMap;

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: OPEN_FREE_MAP_STYLE,
        center: initialCenter,
        zoom: latitude != null && longitude != null ? 18 : 5,
        maxBounds: [
          [-81.5, -18.5],
          [-68.5, 0.1],
        ],
      });
    } catch {
      setMapStatus("error");
      return;
    }

    const startupTimer = window.setTimeout(() => {
      if (!loaded) setMapStatus("error");
    }, 15_000);
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    map.on("click", (event) => setPosition(event.lngLat.lat, event.lngLat.lng));
    map.on("load", () => {
      loaded = true;
      window.clearTimeout(startupTimer);
      addImportantPoiLayers(map);
      map.resize();
      map
        .getCanvas()
        .setAttribute("aria-label", "Mapa para confirmar la dirección exacta");
      setMapStatus("ready");
    });
    map.on("error", () => {
      if (!loaded) setMapStatus("error");
    });

    if (latitude != null && longitude != null) {
      setPosition(latitude, longitude, false);
    }

    return () => {
      window.clearTimeout(startupTimer);
      searchAbortRef.current?.abort();
      reverseAbortRef.current?.abort();
      markerRef.current?.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const latitude = coordinateValue(value.lat);
    const longitude = coordinateValue(value.lng);
    if (latitude != null && longitude != null) {
      markerRef.current?.setLngLat([longitude, latitude]);
    }
  }, [value.lat, value.lng]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage(
        "Tu navegador no permite obtener la ubicación actual.",
      );
      return;
    }

    setGpsLoading(true);
    setLocationMessage("Obteniendo tu ubicación…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsLoading(false);
        setPosition(position.coords.latitude, position.coords.longitude);
        setLocationMessage(
          `Ubicación detectada con una precisión aproximada de ${Math.round(position.coords.accuracy)} m.`,
        );
      },
      (positionError) => {
        setGpsLoading(false);
        const messages: Record<number, string> = {
          1: "No diste permiso para usar tu ubicación.",
          2: "Tu ubicación actual no está disponible.",
          3: "La búsqueda de tu ubicación tardó demasiado.",
        };
        setLocationMessage(
          messages[positionError.code] ??
            "No pudimos obtener tu ubicación actual.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  };

  const completeAddressSearch = () => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length >= 3) {
      void requestAddressSuggestions(normalizedQuery, "complete");
    }
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter" && activeIndex >= 0 && suggestions.length > 0) {
      event.preventDefault();
      applySuggestion(suggestions[activeIndex]);
    } else if (event.key === "Enter") {
      event.preventDefault();
      completeAddressSearch();
    } else if (!searchOpen || suggestions.length === 0) {
      return;
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
    } else if (event.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const latitude = coordinateValue(value.lat);
  const longitude = coordinateValue(value.lng);
  const canConfirm = Boolean(
    administrativeContext.regionId &&
    administrativeContext.cityId &&
    administrativeContext.districtId &&
    value.line1.trim() &&
    latitude != null &&
    longitude != null &&
    isWithinPeruBounds(latitude, longitude),
  );

  return (
    <section className="space-y-5" aria-label="Selecciona la ubicación exacta">
      <div className="rounded-2xl border border-warm-gray/12 bg-cream/45 p-4 sm:p-5">
        <label
          htmlFor="host-address-search"
          className="text-sm font-bold text-warm-gray"
        >
          Busca la dirección del alojamiento
        </label>
        <p className="mt-1 text-sm text-warm-gray/80">
          Escribe una calle, avenida, edificio o lugar cercano en Perú.
        </p>
        {(administrativeContext.district ||
          administrativeContext.city ||
          administrativeContext.region) && (
          <p className="mt-1 text-xs text-warm-gray/80">
            Contexto elegido:{" "}
            {[
              administrativeContext.district,
              administrativeContext.city,
              administrativeContext.region,
              "Perú",
            ]
              .filter(Boolean)
              .join(", ")}
            . Se prioriza en el orden, pero no excluye otros distritos.
          </p>
        )}
        <div className="relative mt-3">
          <div className="flex items-center gap-3 rounded-2xl border border-warm-gray/20 bg-white px-4 shadow-sm focus-within:border-terracotta focus-within:ring-2 focus-within:ring-terracotta/20">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 shrink-0 text-terracotta"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
            <input
              id="host-address-search"
              name="addressSearch"
              type="search"
              value={query}
              onChange={(event) => {
                setAppliedSuggestion(null);
                setSearchMessage(null);
                setQuery(event.target.value);
              }}
              onFocus={() => query.trim().length >= 3 && setSearchOpen(true)}
              onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Ej. Av. Arequipa 1234, Lince…"
              autoComplete="off"
              maxLength={200}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={searchOpen}
              aria-controls={listId}
              aria-activedescendant={
                activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
              }
              aria-busy={searching}
              className="h-14 min-w-0 flex-1 bg-transparent text-base text-warm-gray outline-none placeholder:text-warm-gray/50"
            />
            {searching && (
              <span className="text-xs font-semibold text-warm-gray/80">
                Buscando…
              </span>
            )}
          </div>

          {searchOpen && (
            <div
              id={listId}
              role="listbox"
              aria-label="Direcciones sugeridas"
              className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-2xl border border-warm-gray/15 bg-white p-2 shadow-[0_22px_60px_rgba(80,76,74,0.2)]"
            >
              {searchError ? (
                <div className="px-3 py-3" role="alert">
                  <p className="text-sm font-semibold text-red-700">
                    {searchError}
                  </p>
                  <p className="mt-1 text-xs text-warm-gray/80">
                    Puedes ubicar el pin y completar la dirección manualmente.
                  </p>
                </div>
              ) : !searching && suggestions.length === 0 ? (
                <p
                  className="px-3 py-3 text-sm text-warm-gray/80"
                  role="status"
                >
                  No encontramos sugerencias útiles. Prueba con la calle y el
                  distrito o coloca el pin manualmente.
                </p>
              ) : (
                suggestions.map((item, index) => (
                  <button
                    id={`${listId}-${index}`}
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={activeIndex === index}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => applySuggestion(item)}
                    className="flex w-full gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong aria-selected:bg-cream"
                  >
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-terracotta/10 text-terracotta">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M12 21s6-5.4 6-11a6 6 0 1 0-12 0c0 5.6 6 11 6 11Z" />
                        <circle cx="12" cy="10" r="2" />
                      </svg>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-warm-gray">
                        {item.line1}
                      </span>
                      <span className="mt-0.5 block text-xs text-warm-gray/80">
                        {[suggestionType(item.type), contextLabel(item)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      {item.precision === "street-reference" && (
                        <span className="mt-1 block text-xs font-semibold text-terracotta">
                          Referencia de calle · ajusta el pin a la entrada
                        </span>
                      )}
                      {item.precision === "place-reference" && (
                        <span className="mt-1 block text-xs font-semibold text-terracotta">
                          Referencia aproximada · confirma el punto en el mapa
                        </span>
                      )}
                      {item.administrativeMatch === "different" && (
                        <span className="mt-1 block text-xs font-semibold text-amber-800">
                          Está fuera de la división administrativa seleccionada
                        </span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={completeAddressSearch}
              disabled={query.trim().length < 3 || searching}
              className="min-h-10 rounded-xl border border-terracotta/35 bg-white px-3 text-sm font-bold text-terracotta hover:bg-terracotta/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {searching ? "Buscando…" : "Buscar dirección completa"}
            </button>
            <span className="text-xs text-warm-gray/80">
              Las sugerencias al escribir no verifican el número de puerta.
            </span>
          </div>
          {searchMessage && (
            <p className="mt-2 text-xs text-warm-gray/75" role="status">
              {searchMessage}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-semibold text-warm-gray">
            Dirección exacta
          </span>
          <input
            id="host-address-line1"
            name="line1"
            value={value.line1}
            aria-invalid={Boolean(line1Error)}
            aria-describedby={
              line1Error
                ? "host-address-line1-error"
                : "host-address-line1-hint"
            }
            onChange={(event) => {
              setAppliedSuggestion(null);
              onChange({ ...value, line1: event.target.value });
              confirmedRef.current = false;
              onConfirmedChange(false);
            }}
            required
            autoComplete="street-address"
            maxLength={300}
            className="h-12 w-full rounded-xl border border-warm-gray/12 px-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            placeholder="Avenida, calle y número"
          />
          {line1Error ? (
            <span
              id="host-address-line1-error"
              className="block text-sm font-medium text-red-800"
              role="alert"
            >
              {line1Error}
            </span>
          ) : (
            <span
              id="host-address-line1-hint"
              className="block text-xs text-warm-gray/80"
            >
              Si no encuentras la dirección, escríbela y coloca el pin
              manualmente.
            </span>
          )}
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Piso o interior{" "}
            <span className="font-normal text-warm-gray/80">(privado)</span>
          </span>
          <input
            name="line2"
            value={value.line2}
            onChange={(event) =>
              onChange({ ...value, line2: event.target.value })
            }
            maxLength={300}
            autoComplete="address-line2"
            className="h-12 w-full rounded-xl border border-warm-gray/12 px-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            placeholder="Ej. Dpto. 302, torre B…"
          />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-semibold text-warm-gray">
            Código postal (opcional)
          </span>
          <input
            name="postalCode"
            value={value.postalCode}
            onChange={(event) =>
              onChange({ ...value, postalCode: event.target.value })
            }
            autoComplete="postal-code"
            maxLength={20}
            className="h-12 w-full rounded-xl border border-warm-gray/12 px-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative min-h-80 overflow-hidden rounded-2xl border border-warm-gray/12 bg-cream lg:min-h-[30rem]">
          <div className="absolute inset-0">
            <div ref={containerRef} className="h-full w-full" />
          </div>
          {mapStatus === "loading" && (
            <div
              className="absolute inset-0 z-10 grid place-items-center bg-cream/90"
              role="status"
            >
              <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-warm-gray shadow-sm">
                Cargando mapa…
              </span>
            </div>
          )}
          {mapStatus === "error" && (
            <div
              className="absolute inset-0 z-10 grid place-items-center bg-cream px-6 text-center"
              role="alert"
            >
              <div>
                <p className="font-bold text-warm-gray">
                  No pudimos cargar el mapa
                </p>
                <p className="mt-1 text-sm text-warm-gray/80">
                  Completa la dirección manualmente e inténtalo nuevamente.
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={gpsLoading}
            className="absolute left-3 top-3 z-20 flex min-h-11 items-center gap-2 rounded-xl border border-warm-gray/10 bg-white px-3 text-sm font-semibold text-warm-gray shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-wait disabled:opacity-60"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-terracotta"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
            {gpsLoading ? "Localizando…" : "Usar mi ubicación"}
          </button>
        </div>

        <aside className="space-y-3 rounded-2xl border border-warm-gray/12 bg-white p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-terracotta">
              Ajusta el pin
            </p>
            <h3 className="mt-1 text-lg font-bold text-warm-gray">
              ¿Está en el lugar correcto?
            </h3>
            <p className="mt-2 text-sm leading-6 text-warm-gray/80">
              Haz clic en el mapa o arrastra el pin hasta la entrada del
              alojamiento.
            </p>
          </div>

          <div
            className="flex flex-wrap gap-x-3 gap-y-2 rounded-xl bg-cream px-3 py-2 text-[11px] font-semibold text-warm-gray/80"
            aria-label="Leyenda de lugares importantes"
          >
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
              Educación
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600" />
              Salud
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-600" />
              Servicios
            </span>
          </div>

          {reverseLoading && (
            <p
              className="rounded-xl bg-cream px-3 py-3 text-sm text-warm-gray/80"
              role="status"
            >
              Identificando la dirección del pin…
            </p>
          )}

          {reverseSuggestion && (
            <div className="rounded-xl border border-terracotta/20 bg-terracotta/5 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-terracotta">
                Dirección sugerida
              </p>
              <p className="mt-1 text-sm font-semibold text-warm-gray">
                {reverseSuggestion.line1}
              </p>
              {contextLabel(reverseSuggestion) && (
                <p className="mt-1 text-xs text-warm-gray/80">
                  {contextLabel(reverseSuggestion)}
                </p>
              )}
              <button
                type="button"
                onClick={() => applySuggestion(reverseSuggestion, true)}
                className="mt-3 min-h-10 rounded px-1 text-sm font-bold text-terracotta underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Usar esta dirección
              </button>
            </div>
          )}

          {appliedSuggestion && (
            <div className="rounded-xl border border-warm-gray/15 bg-cream/70 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-terracotta">
                Ubicación sugerida por MapTiler
              </p>
              <p className="mt-1 text-sm font-semibold text-warm-gray">
                {appliedSuggestion.precision === "street-reference"
                  ? "Encontramos la calle. Ajusta el pin para señalar la entrada exacta."
                  : appliedSuggestion.precision === "place-reference"
                    ? "Es una referencia aproximada. Ajusta el pin para señalar la entrada exacta."
                    : "Revisa el punto sugerido y ajusta el pin a la entrada exacta."}
              </p>
              {appliedSuggestion.administrativeResolution !== "unique" && (
                <p className="mt-2 text-xs text-warm-gray/80">
                  {appliedSuggestion.administrativeResolution === "partial"
                    ? "La relación con el catálogo INEI es parcial; verifica manualmente departamento, provincia y distrito."
                    : "No se asignaron códigos INEI. Selecciona manualmente departamento, provincia y distrito."}
                </p>
              )}
              {(appliedSuggestion.regionId ||
                appliedSuggestion.cityId ||
                appliedSuggestion.districtId) && (
                <button
                  type="button"
                  onClick={() => {
                    void onAdministrativeChangeRef.current({
                      regionId: appliedSuggestion.regionId ?? "",
                      cityId: appliedSuggestion.cityId ?? "",
                      districtId: appliedSuggestion.districtId ?? "",
                    });
                  }}
                  className="mt-3 min-h-10 rounded-lg border border-terracotta/35 bg-white px-3 text-xs font-bold text-terracotta hover:bg-terracotta/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  Usar división administrativa sugerida
                </button>
              )}
            </div>
          )}

          {locationMessage && (
            <p
              className="text-sm text-warm-gray/80"
              role="status"
              aria-live="polite"
            >
              {locationMessage}
            </p>
          )}

          {(!administrativeContext.regionId ||
            !administrativeContext.cityId ||
            !administrativeContext.districtId) && (
            <p
              className="rounded-xl bg-cream px-3 py-2 text-xs leading-5 text-warm-gray/75"
              role="status"
            >
              Selecciona departamento, provincia y distrito antes de confirmar
              el pin.
            </p>
          )}

          {latitude != null && longitude != null && (
            <div className="rounded-xl bg-cream px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-terracotta">
                Coordenadas exactas del pin
              </p>
              <p className="mt-1 font-mono text-xs text-warm-gray/80">
                {latitude.toFixed(6)}, {longitude.toFixed(6)}
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={!canConfirm}
            aria-describedby={mapError ? "host-address-map-error" : undefined}
            onClick={() => {
              onConfirmedChangeRef.current(true);
              setLocationMessage("Ubicación exacta confirmada.");
            }}
            className={`min-h-12 w-full rounded-xl px-4 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-50 ${confirmed ? "bg-emerald-100 text-emerald-800" : "bg-terracotta text-[#231f1d] hover:bg-soft-coral"}`}
          >
            {confirmed ? "Ubicación confirmada" : "Confirmar ubicación"}
          </button>
          {mapError && (
            <p
              id="host-address-map-error"
              className="text-sm font-medium text-red-800"
              role="alert"
            >
              {mapError}
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
