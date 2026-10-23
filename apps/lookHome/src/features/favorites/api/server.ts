import { apiServer } from "@/lib/api/server";
import { type FavoriteItem, type FavoriteUnavailableReason } from "../types";

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function formatFavoriteAmount(value: number, currencyCode: string) {
  const amount = new Intl.NumberFormat("es-PE", {
    maximumFractionDigits: 2,
  }).format(value);
  return `${currencyCode === "PEN" ? "S/" : currencyCode} ${amount}`;
}

const unavailableReasons = new Set<FavoriteUnavailableReason>([
  "listing_deleted",
  "listing_draft",
  "listing_pending_review",
  "listing_paused",
  "listing_suspended",
  "listing_archived",
  "offer_draft",
  "offer_paused",
  "booking_accepted",
  "booking_active",
  "booking_disputed",
]);

function normalizeFavorite(raw: any): FavoriteItem {
  const room = raw.room ?? raw;
  const listing = room.listing ?? raw.listing ?? null;

  const roomId = String(firstDefined(room.id, raw.roomId, raw.id) ?? "");
  const title =
    firstDefined(room.name, room.title, listing?.title, raw.title) ??
    "Favorito";

  const imageUrl = firstDefined(
    room.coverImage,
    room.imageUrl,
    room.image,
    room.media?.[0]?.media?.thumbnailPublicUrl,
    room.media?.[0]?.media?.publicUrl,
    room.media?.[0]?.url,
    listing?.media?.[0]?.media?.thumbnailPublicUrl,
    listing?.media?.[0]?.media?.publicUrl,
    listing?.media?.[0]?.url,
  );

  const district = firstDefined(
    room.district,
    listing?.address?.district?.name,
    listing?.address?.district,
  );
  const city = firstDefined(
    room.city,
    listing?.address?.city?.name,
    listing?.address?.city,
  );
  const line1 = firstDefined(listing?.address?.line1, room.addressLine);
  const addressLabel = [line1, district, city].filter(Boolean).join(", ");

  const mode = room.pricing?.rentalMode;
  const rentalMode = mode === "monthly" || mode === "nightly" ? mode : null;
  const currency =
    typeof room.pricing?.currencyCode === "string"
      ? room.pricing.currencyCode
      : null;
  const parsedRent = Number(room.pricing?.rentAmount);
  const rentAmount =
    room.pricing?.rentAmount != null && Number.isFinite(parsedRent)
      ? parsedRent
      : null;
  const parsedDeposit = Number(room.pricing?.depositAmount);
  const depositLabel =
    rentalMode === "monthly" &&
    room.pricing?.depositAmount != null &&
    Number.isFinite(parsedDeposit) &&
    parsedDeposit > 0 &&
    currency
      ? `Depósito: ${formatFavoriteAmount(parsedDeposit, currency)}${currency === "PEN" ? " (PEN)" : ""}`
      : null;
  const parsedCleaningFee = Number(room.pricing?.cleaningFee);
  const cleaningFeeLabel =
    rentalMode === "nightly" &&
    room.pricing?.cleaningFee != null &&
    Number.isFinite(parsedCleaningFee) &&
    parsedCleaningFee > 0 &&
    currency
      ? `Limpieza: ${formatFavoriteAmount(parsedCleaningFee, currency)}${currency === "PEN" ? " (PEN)" : ""}`
      : null;
  const priceLabel =
    rentAmount != null && rentalMode && currency
      ? `${formatFavoriteAmount(rentAmount, currency)} por ${rentalMode === "monthly" ? "mes" : "noche"}${currency === "PEN" ? " (PEN)" : ""}`
      : "Precio no disponible";

  return {
    id: String(firstDefined(raw.id, roomId)),
    roomId,
    listingId: listing?.id ?? null,
    listingTitle: listing?.title ?? null,
    title,
    href: `/habitaciones/${roomId}`,
    addressLabel,
    imageUrl,
    priceLabel,
    rentalMode,
    currencyCode: currency,
    rentAmount,
    savedAt: firstDefined(raw.createdAt, raw.savedAt)
      ? String(firstDefined(raw.createdAt, raw.savedAt))
      : null,
    unitType: typeof room.unitType === "string" ? room.unitType : null,
    depositLabel,
    cleaningFeeLabel,
    beds: room.bedCount != null ? Number(room.bedCount) : null,
    bathrooms: room.bathroomCount != null ? Number(room.bathroomCount) : null,
    areaLabel:
      room.areaLabel ??
      (room.areaSqft
        ? `${room.areaSqft} sqft`
        : room.floorAreaM2
          ? `${room.floorAreaM2} m²`
          : null),
    availabilityReason: unavailableReasons.has(raw.availabilityReason)
      ? raw.availabilityReason
      : null,
  };
}

export async function getMyFavorites(
  request: Request,
): Promise<FavoriteItem[]> {
  const payload = await apiServer<any>(request, "/favorites/me");

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.rows)
        ? payload.rows
        : [];

  return rows.map(normalizeFavorite);
}
