import type { SearchAreaBounds } from "../url-state";
import type { PropertyType, SearchFilters } from "../types";

type SearchQueryOptions = {
  bounds?: SearchAreaBounds;
  includePagination?: boolean;
};

type SearchApiQuery = Record<string, string | number | undefined>;

const PROPERTY_TYPES: readonly PropertyType[] = [
  "house",
  "apartment",
  "building",
  "shared_house",
  "other",
];
const ACCOMMODATION_TYPES = ["house", "apartment", "room"] as const;
const RENTAL_MODES = ["nightly", "monthly"] as const;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function positiveQueryValue(value?: string, integer = false) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) &&
    parsed > 0 &&
    (!integer || Number.isInteger(parsed))
    ? value
    : undefined;
}

function uuidQueryValue(value?: string) {
  return value && UUID_V4.test(value) ? value : undefined;
}

function coordinateQueryValue(value?: string) {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : undefined;
}

function boundsFromFilters(filters: SearchFilters): SearchAreaBounds | undefined {
  const rawValues = [filters.south, filters.west, filters.north, filters.east];
  if (rawValues.some((value) => value == null || value.trim() === "")) {
    return undefined;
  }

  const south = Number(filters.south);
  const west = Number(filters.west);
  const north = Number(filters.north);
  const east = Number(filters.east);
  const values = [south, west, north, east];

  if (
    values.some((value) => !Number.isFinite(value)) ||
    south < -90 ||
    north > 90 ||
    west < -180 ||
    east > 180 ||
    south >= north ||
    west >= east
  ) {
    return undefined;
  }

  return { south, west, north, east };
}

function validBounds(bounds: SearchAreaBounds): boolean {
  return (
    [bounds.south, bounds.west, bounds.north, bounds.east].every(
      Number.isFinite,
    ) &&
    bounds.south >= -90 &&
    bounds.north <= 90 &&
    bounds.west >= -180 &&
    bounds.east <= 180 &&
    bounds.south < bounds.north &&
    bounds.west < bounds.east
  );
}

function isAccommodationType(
  value: string | undefined,
): value is (typeof ACCOMMODATION_TYPES)[number] {
  return ACCOMMODATION_TYPES.some((type) => type === value);
}

function isRentalMode(
  value: string | undefined,
): value is (typeof RENTAL_MODES)[number] {
  return RENTAL_MODES.some((mode) => mode === value);
}

export function buildSearchApiQuery(
  filters: SearchFilters,
  options: SearchQueryOptions = {},
): SearchApiQuery {
  const bounds = options.bounds
    ? validBounds(options.bounds)
      ? options.bounds
      : undefined
    : boundsFromFilters(filters);
  const rentalMode = isRentalMode(filters.rentalMode)
    ? filters.rentalMode
    : undefined;
  const propertyType = PROPERTY_TYPES.includes(
    filters.propertyType as PropertyType,
  )
    ? filters.propertyType
    : undefined;
  const locationId = filters.locationId?.trim();
  const hasLocationSelection = Boolean(
    filters.locationType && locationId && locationId.length <= 100,
  );

  return {
    q: filters.q?.trim() || undefined,
    countryCode: filters.countryCode === "PE" ? "PE" : undefined,
    regionId: uuidQueryValue(filters.regionId),
    cityId: uuidQueryValue(filters.cityId),
    districtId: uuidQueryValue(filters.districtId),
    locationType: hasLocationSelection ? filters.locationType : undefined,
    locationId: hasLocationSelection ? locationId : undefined,
    south: bounds ? String(bounds.south) : undefined,
    west: bounds ? String(bounds.west) : undefined,
    north: bounds ? String(bounds.north) : undefined,
    east: bounds ? String(bounds.east) : undefined,
    minPrice: rentalMode ? positiveQueryValue(filters.minPrice) : undefined,
    maxPrice: rentalMode ? positiveQueryValue(filters.maxPrice) : undefined,
    guests: positiveQueryValue(filters.guests, true),
    accommodationType: isAccommodationType(filters.accommodationType)
      ? filters.accommodationType
      : undefined,
    propertyType,
    rentalMode,
    entityType: filters.entityType === "room" ? "room" : "listing",
    ...(options.includePagination === false
      ? {}
      : {
          page: positiveQueryValue(filters.page, true),
          pageSize: positiveQueryValue(filters.pageSize, true),
        }),
  };
}

export function buildSearchApiQueryString(
  filters: SearchFilters,
  options: SearchQueryOptions = {},
) {
  const params = new URLSearchParams();
  const query = buildSearchApiQuery(filters, options);

  Object.entries(query).forEach(([name, value]) => {
    if (value !== undefined && String(value).trim()) {
      params.set(name, String(value));
    }
  });

  return params.toString();
}
