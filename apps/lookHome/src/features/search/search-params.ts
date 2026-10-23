import type { SearchFilters } from "./types";

const ACCOMMODATION_TYPES = ["house", "apartment", "room"] as const;
const PROPERTY_TYPES = [
  "house",
  "apartment",
  "building",
  "shared_house",
  "other",
] as const;
const LOCATION_TYPES = ["country", "region", "city", "district"] as const;
const FILTER_CONTROLLED_PARAMS = [
  "q",
  "countryCode",
  "regionId",
  "cityId",
  "districtId",
  "locationType",
  "locationId",
  "minPrice",
  "maxPrice",
  "guests",
  "accommodationType",
  "rentalMode",
  "page",
  "pageSize",
  "entityType",
  "queryId",
] as const;
const LOCATION_PARAMS = [
  "countryCode",
  "regionId",
  "cityId",
  "districtId",
  "locationType",
  "locationId",
] as const;

function enumValue<const T extends readonly string[]>(
  value: string | null,
  values: T,
): T[number] | undefined {
  return value && values.includes(value) ? (value as T[number]) : undefined;
}

export function parseSearchFilters(params: URLSearchParams): SearchFilters {
  return {
    q: params.get("q") ?? "",
    entityType: "listing",
    countryCode: params.get("countryCode") ?? "",
    regionId: params.get("regionId") ?? "",
    cityId: params.get("cityId") ?? "",
    districtId: params.get("districtId") ?? "",
    locationType: enumValue(params.get("locationType"), LOCATION_TYPES),
    locationId: params.get("locationId") ?? undefined,
    south: params.get("south") ?? undefined,
    west: params.get("west") ?? undefined,
    north: params.get("north") ?? undefined,
    east: params.get("east") ?? undefined,
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    page: params.get("page") ?? "",
    pageSize: params.get("pageSize") ?? "",
    guests: params.get("guests") ?? "",
    accommodationType: enumValue(
      params.get("accommodationType"),
      ACCOMMODATION_TYPES,
    ),
    propertyType: enumValue(params.get("propertyType"), PROPERTY_TYPES),
    rentalMode: enumValue(params.get("rentalMode"), ["nightly", "monthly"]),
    queryId: params.get("queryId") ?? undefined,
  };
}

export function updateSearchFormParams(
  preservedQuery: string,
  entries: Iterable<readonly [string, string]>,
) {
  const params = new URLSearchParams(preservedQuery);
  FILTER_CONTROLLED_PARAMS.forEach((name) => params.delete(name));

  for (const [name, value] of entries) {
    const normalizedValue = value.trim();
    if (normalizedValue) params.set(name, normalizedValue);
  }

  params.delete("page");
  params.delete("queryId");
  return params;
}

export function removeSearchFilterParams(
  preservedQuery: string,
  key: string,
) {
  const params = new URLSearchParams(preservedQuery);
  if (key === "location") {
    LOCATION_PARAMS.forEach((name) => params.delete(name));
  } else {
    params.delete(key);
  }
  params.delete("entityType");
  params.delete("page");
  params.delete("queryId");
  return params;
}

export function searchHref(params: URLSearchParams) {
  const query = params.toString();
  return query ? `/buscar?${query}` : "/buscar";
}
