export type PropertyType =
  "house" | "apartment" | "building" | "shared_house" | "other";
export type AccommodationType = "house" | "apartment" | "room";

export type LocationSelectionType = "country" | "region" | "city" | "district";

export type LocationSuggestion = {
  type: LocationSelectionType;
  id: string;
  name: string;
  label: string;
  context: {
    country: string;
    region: string | null;
    city: string | null;
    district: string | null;
  };
  filters: {
    countryCode: string;
    regionId?: string;
    cityId?: string;
    districtId?: string;
  };
};

export type SearchFilters = {
  q?: string;
  entityType?: "listing" | "room";
  countryCode?: string;
  regionId?: string;
  cityId?: string;
  districtId?: string;
  locationType?: LocationSelectionType;
  locationId?: string;
  south?: string;
  west?: string;
  north?: string;
  east?: string;
  minPrice?: string;
  maxPrice?: string;
  page?: string;
  pageSize?: string;
  guests?: string;
  accommodationType?: AccommodationType;
  /** Legacy physical-property filter preserved for older shared URLs. */
  propertyType?: PropertyType;
  rentalMode?: "nightly" | "monthly";
  queryId?: string;
};

export type SearchResults = {
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
  queryId?: string;
};

export type SearchMarkers = {
  items: SearchResultItem[];
  total: number;
  limit: number;
  truncated: boolean;
};

export type SearchResultItem = {
  id: string;
  resourceType: "listing" | "room";
  accommodationType?: AccommodationType | null;
  legacyMultipleOffers?: boolean;
  unitType?: "entire_place" | "private_room" | "shared_bed" | null;
  rentalMode?: "nightly" | "monthly" | null;
  maxGuests?: number | null;
  title: string;
  description?: string | null;
  href: string;
  addressLabel?: string;
  imageUrl?: string | null;
  currencyCode?: string | null;
  price?: number | string | null;
  priceLabel?: string | null;
  bedrooms?: number | null;
  beds?: number | null;
  bathrooms?: number | null;
  areaLabel?: string | null;
  statusLabel?: string | null;
  isFavorite?: boolean;
  favoriteRoomId?: string | null;
  favoriteOffers?: Array<{ roomId: string; isFavorite: boolean }>;
  lat?: number | null;
  lng?: number | null;
};
