import { apiServer } from "@/lib/api/server";
import { buildSearchApiQuery } from "./query";
import type {
  LocationSelectionType,
  LocationSuggestion,
  SearchFilters,
  SearchMarkers,
  SearchResultItem,
  SearchResults,
} from "../types";

type RawSearchResponse = {
  items?: unknown[];
  rows?: unknown[];
  total?: number;
  totalRows?: number;
  page?: number;
  pageSize?: number;
  queryId?: string | number;
};

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function toNumberOrNull(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priceValue(value: unknown) {
  if (!value || typeof value !== "object") return value;
  return firstDefined(
    (value as { rentAmount?: unknown }).rentAmount,
    (value as { amount?: unknown }).amount,
    (value as { value?: unknown }).value,
  );
}

type UnknownRecord = Record<string, unknown>;

function toRecord(value: unknown): UnknownRecord {
  return value != null && typeof value === "object"
    ? (value as UnknownRecord)
    : {};
}

function firstRecord(value: unknown): UnknownRecord {
  return Array.isArray(value) ? toRecord(value[0]) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function locationName(value: unknown) {
  if (typeof value === "string") return value;
  const location = toRecord(value);
  return firstDefined(stringValue(location.name), stringValue(location.label));
}

export function normalizeSearchItem(raw: unknown): SearchResultItem {
  const source = toRecord(raw);
  const entity = toRecord(source.data ?? raw);
  const listing = toRecord(entity.listing);
  const addressValue = entity.address ?? listing.address;
  const address = toRecord(addressValue);
  const pricing = toRecord(entity.pricing);
  const rooms = Array.isArray(entity.rooms) ? entity.rooms.map(toRecord) : [];
  const singleRoom = rooms.length === 1 ? rooms[0] : {};
  const roomPricing = toRecord(singleRoom.pricing);
  const media = firstRecord(entity.media);
  const nestedMedia = toRecord(media.media);
  const photo = firstRecord(entity.photos);
  const entityType = String(
    source.entityType ?? entity.entityType ?? "",
  ).toLowerCase();
  const resourceType: "room" | "listing" =
    entityType === "room" || (!entityType && entity.listingId != null)
      ? "room"
      : "listing";
  const resourceId = String(source.entityId ?? entity.id ?? source.id);
  const legacyMultipleOffers =
    entity.legacyMultipleOffers === true || rooms.length > 1;
  const unitTypeValue = legacyMultipleOffers
    ? undefined
    : firstDefined(
        stringValue(entity.unitType),
        stringValue(singleRoom.unitType),
      );
  const unitType =
    unitTypeValue === "entire_place" ||
    unitTypeValue === "private_room" ||
    unitTypeValue === "shared_bed"
      ? unitTypeValue
      : null;
  const accommodationTypeValue = stringValue(entity.accommodationType);
  const propertyTypeValue = stringValue(
    entity.propertyType ?? listing.propertyType,
  );
  const accommodationType =
    accommodationTypeValue === "house" ||
    accommodationTypeValue === "apartment" ||
    accommodationTypeValue === "room"
      ? accommodationTypeValue
      : unitType === "private_room" || unitType === "shared_bed"
        ? "room"
        : unitType === "entire_place" &&
            (propertyTypeValue === "house" || propertyTypeValue === "apartment")
          ? propertyTypeValue
          : null;

  const imageUrl = firstDefined(
    stringValue(entity.coverImage),
    stringValue(entity.imageUrl),
    stringValue(entity.image),
    stringValue(entity.thumbnail),
    stringValue(nestedMedia.thumbnailPublicUrl),
    stringValue(nestedMedia.publicUrl),
    stringValue(media.url),
    stringValue(photo.url),
    stringValue(listing.coverImage),
  );

  const rawPrice = legacyMultipleOffers
    ? null
    : firstDefined(
        priceValue(entity.price),
        priceValue(entity.priceNight),
        priceValue(entity.basePrice),
        priceValue(entity.nightlyPrice),
        priceValue(pricing.rentAmount),
        priceValue(roomPricing.rentAmount),
      );
  const price = toNumberOrNull(rawPrice);
  const rentalModeValue = legacyMultipleOffers
    ? undefined
    : firstDefined(
        stringValue(entity.rentalMode),
        stringValue(pricing.rentalMode),
        stringValue(roomPricing.rentalMode),
      );
  const rentalMode =
    rentalModeValue === "nightly" || rentalModeValue === "monthly"
      ? rentalModeValue
      : null;
  const currencyCode =
    firstDefined(
      stringValue(entity.currencyCode),
      stringValue(pricing.currencyCode),
      stringValue(roomPricing.currencyCode),
    ) ?? null;
  const formattedPrice =
    price == null
      ? null
      : new Intl.NumberFormat("es-PE", {
          maximumFractionDigits: 0,
        }).format(price);
  const currencyLabel = currencyCode === "PEN" ? "S/" : currencyCode;

  const explicitPriceLabel = legacyMultipleOffers
    ? undefined
    : stringValue(entity.priceLabel);
  const priceLabel =
    explicitPriceLabel ??
    (formattedPrice != null && rentalMode && currencyCode
      ? `${currencyLabel} ${formattedPrice} por ${rentalMode === "monthly" ? "mes" : "día"}${currencyCode === "PEN" ? " (PEN)" : ""}`
      : null);

  const title =
    firstDefined(
      stringValue(entity.title),
      stringValue(entity.name),
      stringValue(entity.listingTitle),
    ) ?? "Propiedad sin título";

  const district = firstDefined(
    locationName(entity.district),
    locationName(address.district),
    stringValue(entity.addressDistrict),
  );
  const city = firstDefined(
    locationName(entity.city),
    locationName(address.city),
    stringValue(entity.addressCity),
  );
  const line1 = stringValue(address.line1);
  const addressLabel =
    [line1, district, city].filter(Boolean).join(", ") || undefined;

  const bedrooms = firstDefined(entity.bedroomCount, entity.bedrooms);
  const maxGuests = firstDefined(
    entity.maxGuests,
    entity.maxOccupancy,
    singleRoom.maxGuests,
    singleRoom.maxOccupancy,
  );
  const beds = firstDefined(entity.bedCount, entity.beds);
  const bathrooms = firstDefined(
    entity.bathroomCount,
    entity.bathrooms,
    entity.baths,
  );

  const areaLabel =
    stringValue(entity.areaLabel) ??
    (entity.areaSqft
      ? `${entity.areaSqft} sqft`
      : (entity.areaM2 ?? entity.floorAreaM2)
        ? `${entity.areaM2 ?? entity.floorAreaM2} m²`
        : null);

  const statusLabel =
    stringValue(entity.statusLabel) ??
    (String(entity.status ?? entity.listingStatus).toUpperCase() === "PUBLISHED"
      ? "PUBLICADO"
      : String(entity.status ?? entity.listingStatus).toUpperCase() === "PAUSED"
        ? "PAUSADO"
        : "ACTIVO");

  const href =
    resourceType === "room"
      ? `/habitaciones/${resourceId}`
      : `/listings/${resourceId}`;

  const favoriteOffers = Array.isArray(entity.favoriteOffers)
    ? entity.favoriteOffers.flatMap((offer) => {
        const favoriteOffer = toRecord(offer);
        const roomId = stringValue(favoriteOffer.roomId);
        return roomId
          ? [{ roomId, isFavorite: Boolean(favoriteOffer.isFavorite) }]
          : [];
      })
    : rooms.flatMap((room) => {
        const roomId = stringValue(room.id);
        return roomId ? [{ roomId, isFavorite: Boolean(room.isFavorite) }] : [];
      });
  const uniqueRoomId =
    rooms.length === 1 ? stringValue(singleRoom.id) : undefined;
  const favoriteRoomId =
    resourceType === "room"
      ? resourceId
      : legacyMultipleOffers
        ? null
        : (stringValue(entity.favoriteRoomId) ?? uniqueRoomId ?? null);

  return {
    id: resourceId,
    resourceType,
    accommodationType,
    legacyMultipleOffers,
    unitType,
    rentalMode,
    maxGuests: toNumberOrNull(maxGuests),
    title,
    description: stringValue(entity.description) ?? null,
    href,
    addressLabel,
    imageUrl,
    currencyCode,
    price,
    priceLabel,
    bedrooms: toNumberOrNull(bedrooms),
    beds: toNumberOrNull(beds),
    bathrooms: toNumberOrNull(bathrooms),
    areaLabel,
    statusLabel,
    isFavorite: Boolean(entity.isFavorite ?? singleRoom.isFavorite),
    favoriteRoomId,
    ...(favoriteOffers.length ? { favoriteOffers } : {}),
    lat: toNumberOrNull(address.lat),
    lng: toNumberOrNull(address.lng),
  };
}

export async function getSearchResults(
  request: Request,
  filters: SearchFilters,
): Promise<SearchResults> {
  const payload = await apiServer<RawSearchResponse>(request, "/search", {
    query: buildSearchApiQuery(filters),
  });

  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.rows)
      ? payload.rows
      : [];

  const items = rawItems.map(normalizeSearchItem);
  const total = Number(payload.total ?? payload.totalRows ?? items.length);

  return {
    items,
    total,
    page: Number(payload.page ?? filters.page ?? 1),
    pageSize: Number(payload.pageSize ?? filters.pageSize ?? 12),
    queryId:
      payload.queryId == null || payload.queryId === ""
        ? undefined
        : String(payload.queryId),
  };
}

export async function getFeaturedSearchResults(
  request: Request,
): Promise<SearchResults> {
  const payload = await apiServer<RawSearchResponse>(
    request,
    "/search/featured",
  );
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.rows)
      ? payload.rows
      : [];
  const items = rawItems.map(normalizeSearchItem);

  return {
    items,
    total: Number(payload.total ?? payload.totalRows ?? items.length),
    page: Number(payload.page ?? 1),
    pageSize: Number(payload.pageSize ?? 6),
  };
}

export async function getLocationSelection(
  request: Request,
  type: LocationSelectionType,
  id: string,
): Promise<LocationSuggestion | null> {
  const response = await apiServer<{ item?: LocationSuggestion }>(
    request,
    "/search/locations/resolve",
    { query: { type, id } },
  );
  return response.item ?? null;
}

export function normalizeSearchMarkers(payload: unknown): SearchMarkers {
  const source = toRecord(payload);
  return {
    items: Array.isArray(source.items)
      ? source.items.map(normalizeSearchItem)
      : [],
    total: Number(source.total) || 0,
    limit: Number(source.limit) || 0,
    truncated: Boolean(source.truncated),
  };
}
