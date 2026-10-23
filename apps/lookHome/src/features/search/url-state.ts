import type { LocationSelectionType } from "./types";

export type SearchAreaBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export function locationLookupFromParams(params: URLSearchParams) {
  const type = params.get("locationType");
  const id = params.get("locationId");
  if (
    type &&
    id &&
    ["country", "region", "city", "district"].includes(type)
  ) {
    return { type: type as LocationSelectionType, id };
  }

  const districtId = params.get("districtId");
  if (districtId) return { type: "district" as const, id: districtId };
  const cityId = params.get("cityId");
  if (cityId) return { type: "city" as const, id: cityId };
  const regionId = params.get("regionId");
  if (regionId) return { type: "region" as const, id: regionId };
  const countryCode = params.get("countryCode");
  if (countryCode) return { type: "country" as const, id: countryCode };
  return null;
}

export function buildAreaSearchUrl(
  currentUrl: string,
  bounds: SearchAreaBounds,
): string | null {
  if (
    ![bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite) ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south >= bounds.north ||
    bounds.west >= bounds.east
  ) {
    return null;
  }

  const url = new URL(currentUrl, "http://lookhome.local");
  url.searchParams.set("south", bounds.south.toFixed(5));
  url.searchParams.set("west", bounds.west.toFixed(5));
  url.searchParams.set("north", bounds.north.toFixed(5));
  url.searchParams.set("east", bounds.east.toFixed(5));
  url.searchParams.delete("page");
  url.searchParams.delete("queryId");
  return `${url.pathname}${url.search}`;
}
