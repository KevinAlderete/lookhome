import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { buildSearchApiQueryString } from "@/features/search/api/query";
import { dispatchSearchUiEvent } from "@/features/search/events";
import type { SearchAreaBounds } from "@/features/search/url-state";
import { toFeatureCollection } from "./SearchMapData";
import {
  CLUSTER_COUNT_LAYER_ID,
  CLUSTER_LAYER_ID,
  DARK_STYLE,
  LIGHT_STYLE,
  POI_LAYER_ID,
  POI_SOURCE_ID,
  PRICE_BACKGROUND_LAYER_ID,
  PRICE_LAYER_ID,
  SOURCE_ID,
  ThemeControl,
  installPoiLayer,
  installPropertyLayers,
} from "./SearchMapLayers";
import {
  createPoiPopupContent,
  createSearchPopupContent,
} from "./SearchMapPopups";
import type {
  SearchFilters,
  SearchResultItem,
} from "@/features/search/types";

type SearchBounds = SearchAreaBounds;

type SearchMapProps = {
  center?: [number, number];
  zoom?: number;
  className?: string;
  items?: SearchResultItem[];
  searchFilters?: SearchFilters;
  initialBounds?: SearchBounds;
};

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getMapPadding() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width >= 1024) {
    return { top: 100, right: 332, bottom: 84, left: 352 };
  }
  if (width >= 640) {
    return { top: 92, right: 28, bottom: 82, left: 348 };
  }

  const expanded =
    document.querySelector<HTMLElement>(".immersive-search")?.dataset
      .sheetState === "expanded";
  return {
    top: 142,
    right: 28,
    bottom: Math.min(
      Math.round(height * (expanded ? 0.78 : 0.42)) + 26,
      Math.max(40, height - 182),
    ),
    left: 28,
  };
}

function fitMapToItems(map: MapLibreMap, items: SearchResultItem[]) {
  const points = items.filter((item) => item.lat != null && item.lng != null);
  if (points.length === 0) return;

  const duration = prefersReducedMotion() ? 0 : 650;
  const padding = getMapPadding();
  if (points.length === 1) {
    map.easeTo({
      center: [points[0].lng as number, points[0].lat as number],
      zoom: 14,
      padding,
      duration,
    });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  points.forEach((item) => {
    bounds.extend([item.lng as number, item.lat as number]);
  });
  map.fitBounds(bounds, {
    padding,
    maxZoom: 14,
    duration,
  });
}

function currentMapBounds(map: MapLibreMap): SearchBounds {
  const bounds = map.getBounds();
  return {
    south: bounds.getSouth(),
    west: bounds.getWest(),
    north: bounds.getNorth(),
    east: bounds.getEast(),
  };
}

function boundsChanged(left: SearchBounds | null, right: SearchBounds) {
  if (!left) return true;
  return (
    Math.abs(left.south - right.south) > 0.002 ||
    Math.abs(left.west - right.west) > 0.002 ||
    Math.abs(left.north - right.north) > 0.002 ||
    Math.abs(left.east - right.east) > 0.002
  );
}

export default function SearchMap({
  center = [-77.0428, -12.0464],
  zoom = 12,
  className = "",
  items = [],
  searchFilters = {},
  initialBounds,
}: SearchMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const itemsRef = useRef<SearchResultItem[]>(items);
  const dataRef = useRef(toFeatureCollection(items));
  const activeIdRef = useRef<string | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const refreshLayersRef = useRef<(() => void) | null>(null);
  const filtersRef = useRef(searchFilters);
  const committedBoundsRef = useRef<SearchBounds | null>(null);
  const markersLoadedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [hasMoved, setHasMoved] = useState(false);
  const [markerLoading, setMarkerLoading] = useState(false);
  const [markerError, setMarkerError] = useState(false);
  const [markerTruncated, setMarkerTruncated] = useState(false);
  const [markerStats, setMarkerStats] = useState<{
    returned: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    filtersRef.current = searchFilters;
  }, [searchFilters]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: LIGHT_STYLE,
        center,
        zoom,
        maxBounds: [
          [-81.5, -18.5],
          [-68.5, 0.1],
        ],
      });
    } catch (initializationError) {
      console.error("No se pudo inicializar el mapa:", initializationError);
      setStatus("error");
      return;
    }

    let loadedOnce = false;
    let mapReady = false;
    let initializingMap = true;
    let markerAbort: AbortController | null = null;
    let markerRequestId = 0;
    let moveTimer = 0;
    const startupTimer = window.setTimeout(() => {
      if (!mapReady) setStatus("error");
    }, 15_000);

    const markReady = () => {
      if (mapReady) return;
      mapReady = true;
      window.clearTimeout(startupTimer);
      setStatus("ready");
    };

    const refreshLayers = () => {
      if (!map.isStyleLoaded()) return;
      try {
        installPoiLayer(map);
        installPropertyLayers(map, dataRef.current);
      } catch (layerError) {
        console.error("No se pudieron añadir las capas del mapa:", layerError);
      }
    };
    refreshLayersRef.current = refreshLayers;

    const onStyleLoad = () => {
      refreshLayers();
      map.once("idle", refreshLayers);
      markReady();
    };

    const onLoad = () => {
      refreshLayers();
      if (loadedOnce) return;
      loadedOnce = true;
      map.resize();
      map
        .getCanvas()
        .setAttribute(
          "aria-label",
          "Mapa interactivo de anuncios y lugares cercanos",
        );
      if (initialBounds) {
        map.fitBounds(
          [
            [initialBounds.west, initialBounds.south],
            [initialBounds.east, initialBounds.north],
          ],
          { padding: getMapPadding(), maxZoom: 13, duration: 0 },
        );
      } else {
        fitMapToItems(map, itemsRef.current);
      }
      map.once("idle", () => {
        initializingMap = false;
        const visibleBounds = currentMapBounds(map);
        committedBoundsRef.current = visibleBounds;
        setHasMoved(false);
        void fetchMarkers(visibleBounds);
      });
    };

    const fetchMarkers = async (bounds: SearchBounds) => {
      markerAbort?.abort();
      const controller = new AbortController();
      markerAbort = controller;
      const requestId = ++markerRequestId;
      setMarkerLoading(true);
      setMarkerError(false);
      setMarkerStats(null);
      try {
        const query = buildSearchApiQueryString(filtersRef.current, {
          bounds,
          includePagination: false,
        });
        const response = await fetch(`/api/search/markers?${query}`, {
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error("No se pudieron cargar los anuncios de esta zona.");
        }
        if (controller.signal.aborted || requestId !== markerRequestId) return;
        const nextItems = Array.isArray(data?.items)
          ? (data.items as SearchResultItem[])
          : [];
        const total = Number(data?.total);
        markersLoadedRef.current = true;
        itemsRef.current = nextItems;
        dataRef.current = toFeatureCollection(nextItems);
        setMarkerTruncated(Boolean(data?.truncated));
        setMarkerStats({
          returned: nextItems.length,
          total: Number.isFinite(total) ? total : nextItems.length,
        });
        refreshLayersRef.current?.();
      } catch (requestError) {
        if (
          !controller.signal.aborted &&
          requestId === markerRequestId &&
          (requestError as Error).name !== "AbortError"
        ) {
          setMarkerError(true);
        }
      } finally {
        if (!controller.signal.aborted && requestId === markerRequestId) {
          setMarkerLoading(false);
        }
      }
    };

    const onMoveEnd = () => {
      if (initializingMap) return;
      const visibleBounds = currentMapBounds(map);
      markerAbort?.abort();
      markerRequestId += 1;
      setHasMoved(boundsChanged(committedBoundsRef.current, visibleBounds));
      window.clearTimeout(moveTimer);
      moveTimer = window.setTimeout(() => {
        void fetchMarkers(visibleBounds);
      }, 220);
    };

    const onError = (event: maplibregl.ErrorEvent) => {
      console.error("Error del mapa:", event?.error ?? event);
      if (!mapReady) setStatus("error");
    };

    map.on("style.load", onStyleLoad);
    map.on("load", onLoad);
    map.on("moveend", onMoveEnd);
    map.on("error", onError);
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );
    map.addControl(new ThemeControl(), "top-right");

    map.on("click", (event) => {
      const layers = [
        CLUSTER_LAYER_ID,
        PRICE_BACKGROUND_LAYER_ID,
        PRICE_LAYER_ID,
        POI_LAYER_ID,
      ].filter((layerId) => Boolean(map.getLayer(layerId)));
      if (layers.length === 0) return;
      const features = map.queryRenderedFeatures(event.point, { layers });
      const feature = features[0];
      if (!feature) return;

      if (feature.layer.id === POI_LAYER_ID) {
        if (feature.geometry.type !== "Point") return;
        const coordinates = feature.geometry.coordinates as [number, number];
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({
          offset: 16,
          maxWidth: "240px",
        })
          .setLngLat(coordinates)
          .setDOMContent(createPoiPopupContent(feature.properties ?? {}))
          .addTo(map);
        return;
      }

      if (feature.properties?.cluster) {
        const source = map.getSource(SOURCE_ID) as GeoJSONSource;
        const clusterId = Number(feature.properties.cluster_id);
        void source.getClusterExpansionZoom(clusterId).then((nextZoom) => {
          const coordinates =
            feature.geometry.type === "Point"
              ? (feature.geometry.coordinates as [number, number])
              : null;
          if (coordinates)
            map.easeTo({
              center: coordinates,
              zoom: nextZoom,
              duration: prefersReducedMotion() ? 0 : 500,
            });
        });
        return;
      }

      const item = itemsRef.current.find(
        (candidate) => candidate.id === feature.properties?.id,
      );
      if (!item || item.lat == null || item.lng == null) return;

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({
        offset: 30,
        maxWidth: "260px",
      })
        .setLngLat([item.lng, item.lat])
        .setDOMContent(createSearchPopupContent(item))
        .addTo(map);
      dispatchSearchUiEvent("lookhome:marker-hover", {
        listingId: item.id,
      });
    });

    map.on("mousemove", (event) => {
      const layers = [
        PRICE_BACKGROUND_LAYER_ID,
        PRICE_LAYER_ID,
        POI_LAYER_ID,
      ].filter((layerId) => Boolean(map.getLayer(layerId)));
      const features =
        layers.length > 0
          ? map.queryRenderedFeatures(event.point, { layers })
          : [];
      const listingFeature = features.find(
        (feature) => feature.source === SOURCE_ID,
      );
      const id = listingFeature?.properties?.id ?? null;
      const isOverPoi = features.some(
        (feature) => feature.layer.id === POI_LAYER_ID,
      );
      map.getCanvas().style.cursor = id || isOverPoi ? "pointer" : "";
      if (activeIdRef.current === id) return;
      if (activeIdRef.current) {
        map.setFeatureState(
          { source: SOURCE_ID, id: activeIdRef.current },
          { active: false },
        );
      }
      if (id) map.setFeatureState({ source: SOURCE_ID, id }, { active: true });
      activeIdRef.current = id;
      dispatchSearchUiEvent("lookhome:marker-hover", { listingId: id });
    });
    map.on("mouseleave", () => {
      if (activeIdRef.current) {
        map.setFeatureState(
          { source: SOURCE_ID, id: activeIdRef.current },
          { active: false },
        );
        activeIdRef.current = null;
      }
      dispatchSearchUiEvent("lookhome:marker-hover", { listingId: null });
    });

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        map.resize();
      });
    });
    resizeObserver.observe(containerRef.current);
    const handleSheetChange = () => {
      map.resize();
    };
    window.addEventListener("lookhome:sheet-change", handleSheetChange);
    mapRef.current = map;

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("lookhome:sheet-change", handleSheetChange);
      window.cancelAnimationFrame(resizeFrame);
      window.clearTimeout(moveTimer);
      markerAbort?.abort();
      window.clearTimeout(startupTimer);
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      refreshLayersRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.easeTo({
      center,
      zoom,
      duration: prefersReducedMotion() ? 0 : 500,
    });
  }, [center, zoom]);

  useEffect(() => {
    if (markersLoadedRef.current) return;
    itemsRef.current = items;
    dataRef.current = toFeatureCollection(items);
    refreshLayersRef.current?.();
  }, [items]);

  useEffect(() => {
    const handleListingHover = (
      event: WindowEventMap["lookhome:listing-hover"],
    ) => {
      const listingId = event.detail.listingId;
      const map = mapRef.current;
      if (!map || !map.getSource(SOURCE_ID)) return;
      if (activeIdRef.current) {
        map.setFeatureState(
          { source: SOURCE_ID, id: activeIdRef.current },
          { active: false },
        );
      }
      if (listingId) {
        map.setFeatureState(
          { source: SOURCE_ID, id: listingId },
          { active: true },
        );
        const item = itemsRef.current.find(
          (candidate) => candidate.id === listingId,
        );
        if (item?.lat != null && item.lng != null) {
          map.easeTo({
            center: [item.lng, item.lat],
            duration: prefersReducedMotion() ? 0 : 350,
          });
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({
            offset: 30,
            maxWidth: "260px",
            closeButton: false,
          })
            .setLngLat([item.lng, item.lat])
            .setDOMContent(createSearchPopupContent(item))
            .addTo(map);
        }
      } else {
        popupRef.current?.remove();
        popupRef.current = null;
      }
      activeIdRef.current = listingId;
    };

    window.addEventListener("lookhome:listing-hover", handleListingHover);
    return () =>
      window.removeEventListener("lookhome:listing-hover", handleListingHover);
  }, []);

  return (
    <div
      className={`relative overflow-hidden bg-[#f5efe8] ${className}`}
      role="region"
      aria-label="Mapa de resultados"
      aria-busy={status === "loading" || markerLoading}
    >
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
      {status === "ready" && hasMoved && (
        <button
          type="button"
          onClick={() => {
            const map = mapRef.current;
            if (!map) return;
            dispatchSearchUiEvent(
              "lookhome:search-area",
              currentMapBounds(map),
            );
          }}
          className="search-area-button absolute left-1/2 top-[8.35rem] z-20 min-h-11 -translate-x-1/2 rounded-full border border-warm-gray/15 bg-white px-5 text-sm font-bold text-warm-gray shadow-[0_12px_32px_rgba(44,36,31,0.22)] transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-terracotta disabled:cursor-wait disabled:opacity-70 sm:top-[7.6rem]"
          disabled={markerLoading}
        >
          {markerLoading ? "Actualizando anuncios…" : "Buscar en esta zona"}
        </button>
      )}
      {markerError && status === "ready" && (
        <p
          role="alert"
          className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-white px-4 py-2 text-center text-xs font-semibold text-red-700 shadow"
        >
          No se pudieron actualizar los anuncios del mapa.
        </p>
      )}
      {markerStats && status === "ready" && (
        <p
          role="status"
          className="search-map-count absolute z-10 rounded-xl bg-white/95 px-3 py-2 text-xs font-semibold text-warm-gray shadow"
        >
          {`Anuncios recibidos: ${markerStats.returned} de ${markerStats.total} en esta zona.`}
          {markerTruncated && " Acerca el mapa para ver más."}
        </p>
      )}
      {status === "loading" && (
        <div
          className="absolute inset-0 z-10 grid place-items-center bg-cream/85"
          role="status"
        >
          <span className="rounded-full border border-warm-gray/15 bg-white px-4 py-2 text-sm font-bold text-warm-gray shadow-sm">
            Cargando mapa...
          </span>
        </div>
      )}
      {status === "error" && (
        <div
          className="absolute inset-0 z-10 grid place-items-center bg-cream px-6 text-center"
          role="alert"
        >
          <div>
            <p className="font-bold text-warm-gray">
              No pudimos cargar el mapa
            </p>
            <p className="mt-1 text-sm text-warm-gray/75">
              La lista de anuncios sigue disponible.
            </p>
          </div>
        </div>
      )}
      {status === "ready" && dataRef.current.features.length === 0 && (
        <div
          className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2 rounded-full border border-warm-gray/15 bg-white/95 px-4 py-2 text-center text-xs font-bold text-warm-gray shadow-sm"
          role="status"
        >
          No hay anuncios con ubicación en esta búsqueda
        </div>
      )}
      {status === "ready" && (
        <div
          className="pointer-events-none absolute bottom-5 right-4 z-10 hidden max-w-xs flex-wrap items-center justify-end gap-x-3 gap-y-1.5 rounded-xl border border-warm-gray/15 bg-white/95 px-3 py-2 text-[10px] font-bold text-warm-gray shadow-sm lg:flex"
          aria-label="Leyenda del mapa"
        >
          <span className="text-terracotta">POI en ubicación exacta</span>
          <span>Educación</span>
          <span>Salud</span>
          <span>Servicios</span>
          <span className="font-semibold text-warm-gray/65">
            Alojamientos: domicilio exacto
          </span>
        </div>
      )}
    </div>
  );
}
