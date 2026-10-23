import maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import { toFeatureCollection } from "./SearchMapData";

export const SOURCE_ID = "rental-units";
export const CLUSTER_LAYER_ID = "rental-clusters";
export const CLUSTER_COUNT_LAYER_ID = "rental-cluster-count";
export const PRICE_BACKGROUND_LAYER_ID = "rental-price-background";
export const PRICE_LAYER_ID = "rental-price";
export const POI_SOURCE_ID = "openmaptiles";
export const POI_LAYER_ID = "nearby-points-of-interest";
export const LIGHT_STYLE = "https://tiles.openfreemap.org/styles/positron";
export const DARK_STYLE = "https://tiles.openfreemap.org/styles/dark";

const VISIBLE_POI_TYPES = [
  "restaurant",
  "cafe",
  "fast_food",
  "bar",
  "lodging",
  "hotel",
  "hostel",
  "guest_house",
  "grocery",
  "shop",
  "supermarket",
  "marketplace",
  "convenience",
  "mall",
  "pharmacy",
  "hospital",
  "clinic",
  "doctors",
  "dentist",
  "school",
  "kindergarten",
  "college",
  "university",
  "library",
  "police",
  "fire_station",
  "town_hall",
  "townhall",
  "community_centre",
  "museum",
  "cinema",
  "theatre",
  "park",
  "playground",
  "stadium",
  "bus",
  "bus_stop",
  "railway",
  "station",
  "bank",
  "atm",
];

const PRIORITY_POI_TYPES = [
  "school",
  "kindergarten",
  "college",
  "university",
  "hospital",
  "clinic",
  "doctors",
  "pharmacy",
  "police",
  "fire_station",
  "town_hall",
  "townhall",
  "library",
];

export function installPoiLayer(map: MapLibreMap) {
  if (map.getLayer(POI_LAYER_ID) || !map.getSource(POI_SOURCE_ID)) return;

  const isDarkStyle = String(map.getStyle().name ?? "")
    .toLowerCase()
    .includes("dark");

  map.addLayer({
    id: POI_LAYER_ID,
    type: "symbol",
    source: POI_SOURCE_ID,
    "source-layer": "poi",
    minzoom: 12,
    filter: [
      "all",
      ["has", "name"],
      [
        "any",
        ["match", ["get", "class"], VISIBLE_POI_TYPES, true, false],
        ["match", ["get", "subclass"], VISIBLE_POI_TYPES, true, false],
      ],
    ],
    layout: {
      "icon-image": [
        "match",
        ["coalesce", ["get", "subclass"], ["get", "class"]],
        ["restaurant", "cafe", "fast_food", "bar"],
        "restaurant_11",
        ["lodging", "hotel", "hostel", "guest_house"],
        "lodging_11",
        [
          "grocery",
          "shop",
          "supermarket",
          "marketplace",
          "convenience",
          "mall",
        ],
        "grocery_11",
        "pharmacy",
        "pharmacy_11",
        ["hospital", "clinic", "doctors", "dentist"],
        "hospital_11",
        ["school", "kindergarten"],
        "school_11",
        ["college", "university"],
        "college_11",
        "library",
        "library_11",
        "police",
        "police_11",
        "fire_station",
        "fire_station_11",
        ["town_hall", "townhall"],
        "town_hall_11",
        "museum",
        "museum_11",
        "cinema",
        "cinema_11",
        "theatre",
        "theatre_11",
        "park",
        "park_11",
        "playground",
        "playground_11",
        "stadium",
        "stadium_11",
        ["bus", "bus_stop"],
        "bus_11",
        ["railway", "station"],
        "railway_11",
        ["bank", "atm"],
        "bank_11",
        "marker_11",
      ],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 12, 0.72, 16, 0.95],
      "icon-padding": 4,
      "text-field": [
        "coalesce",
        ["get", "name:es"],
        ["get", "name"],
        ["get", "name_en"],
      ],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 12],
      "text-offset": [0, 1.25],
      "text-anchor": "top",
      "text-max-width": 9,
      "text-optional": true,
      "symbol-sort-key": [
        "case",
        [
          "any",
          ["match", ["get", "class"], PRIORITY_POI_TYPES, true, false],
          [
            "match",
            ["get", "subclass"],
            PRIORITY_POI_TYPES,
            true,
            false,
          ],
        ],
        0,
        ["coalesce", ["get", "rank"], 99],
      ],
    },
    paint: {
      "icon-opacity": 0.9,
      "text-color": isDarkStyle ? "#fff7f0" : "#504c4a",
      "text-halo-color": isDarkStyle ? "#282321" : "#fffdfa",
      "text-halo-width": 1.5,
      "text-halo-blur": 0.4,
    },
  });
}

export function installPropertyLayers(
  map: MapLibreMap,
  data: ReturnType<typeof toFeatureCollection>,
) {
  const existingSource = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (existingSource) {
    existingSource.setData(data);
    return;
  }

  map.addSource(SOURCE_ID, {
    type: "geojson",
    data,
    cluster: true,
    clusterRadius: 52,
    clusterMaxZoom: 14,
  });
  map.addLayer({
    id: CLUSTER_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#504c4a",
      "circle-radius": ["step", ["get", "point_count"], 19, 10, 24, 50, 30],
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 12,
    },
    paint: { "text-color": "#ffffff" },
  });
  map.addLayer({
    id: PRICE_BACKGROUND_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "active"], false],
        "#504c4a",
        "#a84f32",
      ],
      "circle-radius": 28,
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
    },
  });
  map.addLayer({
    id: PRICE_LAYER_ID,
    type: "symbol",
    source: SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "priceLabel"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 11,
      "text-max-width": 5,
      "text-allow-overlap": true,
    },
    paint: { "text-color": "#ffffff" },
  });
}

export class ThemeControl {
  private map: MapLibreMap | null = null;
  private button: HTMLButtonElement | null = null;
  private dark = false;

  onAdd(map: MapLibreMap) {
    this.map = map;
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Cambiar modo del mapa";
    button.setAttribute("aria-label", "Cambiar modo del mapa");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "18");
    icon.setAttribute("height", "18");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.8");
    icon.setAttribute("aria-hidden", "true");
    const iconCircle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    iconCircle.setAttribute("cx", "12");
    iconCircle.setAttribute("cy", "12");
    iconCircle.setAttribute("r", "4");
    const iconRays = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    iconRays.setAttribute(
      "d",
      "M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42",
    );
    icon.append(iconCircle, iconRays);
    button.append(icon);
    button.addEventListener("click", () => {
      this.dark = !this.dark;
      button.setAttribute("aria-pressed", String(this.dark));
      map.setStyle(this.dark ? DARK_STYLE : LIGHT_STYLE);
    });
    container.append(button);
    this.button = button;
    return container;
  }

  onRemove() {
    this.button?.remove();
    this.map = null;
    this.button = null;
  }
}
