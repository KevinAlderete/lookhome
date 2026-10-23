export type RentalMode = "nightly" | "monthly";

export type PublicPhoto = { id: string; url: string };

export type PublicOffer = {
  id: string;
  name: string;
  description: string | null;
  offerType: string | null;
  isFurnished: boolean;
  maxGuests: number | null;
  bedrooms: number | null;
  beds: number | null;
  bathrooms: number | null;
  areaM2: number | null;
  availableFrom: string | null;
  pricing: {
    rentalMode: RentalMode;
    currencyCode: string;
    rentAmount: number;
    depositAmount: number | null;
    cleaningFee: number | null;
    minStayNights: number | null;
    maxStayNights: number | null;
    minTermMonths: number | null;
    maxTermMonths: number | null;
  } | null;
  photos: PublicPhoto[];
  amenities: string[];
};

export type PublicListing = {
  id: string;
  title: string;
  description: string | null;
  legacyMultipleOffers: boolean;
  propertyType: string | null;
  address: {
    line1: string | null;
    district: string | null;
    city: string | null;
    region: string | null;
    lat: number | null;
    lng: number | null;
  };
  host: { id: string; name: string; image: string | null } | null;
  rules: {
    notes: string | null;
    petsAllowed: boolean | null;
    smokingAllowed: boolean | null;
    partiesAllowed: boolean | null;
  };
  photos: PublicPhoto[];
  amenities: string[];
  offers: PublicOffer[];
};

export type PublicReviewPage = {
  items: Array<{
    id: string;
    roomId: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    authorName: string;
    authorPhotoUrl: string | null;
  }>;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  averageRating: number | null;
};

function numberOrNull(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function label(value: any): string | null {
  const result = typeof value === "string" ? value : value?.name;
  return typeof result === "string" && result.trim() ? result.trim() : null;
}

function photosFrom(raw: any): PublicPhoto[] {
  if (!Array.isArray(raw)) return [];
  const byUrl = new Map<string, PublicPhoto>();
  for (const item of raw) {
    const url = item?.url ?? item?.media?.publicUrl;
    if (typeof url !== "string" || !url.trim()) continue;
    if (!byUrl.has(url))
      byUrl.set(url, { id: String(item?.id ?? item?.media?.id ?? url), url });
  }
  return [...byUrl.values()];
}

function amenitiesFrom(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.flatMap((item: any) => {
        const name = label(item?.amenity ?? item);
        return name ? [name] : [];
      }),
    ),
  ];
}

export function normalizeOffer(raw: any): PublicOffer {
  const mode = raw?.pricing?.rentalMode;
  const rentAmount = numberOrNull(raw?.pricing?.rentAmount);
  const currencyCode = raw?.pricing?.currencyCode;
  const pricing =
    (mode === "monthly" || mode === "nightly") &&
    rentAmount != null &&
    typeof currencyCode === "string" &&
    currencyCode
      ? {
          rentalMode: mode as RentalMode,
          currencyCode,
          rentAmount,
          depositAmount:
            mode === "monthly" ? numberOrNull(raw.pricing.depositAmount) : null,
          cleaningFee:
            mode === "nightly" ? numberOrNull(raw.pricing.cleaningFee) : null,
          minStayNights: raw.pricing.minStayNights ?? null,
          maxStayNights: raw.pricing.maxStayNights ?? null,
          minTermMonths: raw.pricing.minTermMonths ?? null,
          maxTermMonths: raw.pricing.maxTermMonths ?? null,
        }
      : null;

  return {
    id: String(raw.id),
    name: String(raw.name || "Oferta de alquiler"),
    description: label(raw.description),
    offerType: raw.unitType ?? null,
    isFurnished: Boolean(raw.isFurnished),
    maxGuests: numberOrNull(raw.maxGuests),
    bedrooms: numberOrNull(raw.bedroomCount),
    beds: numberOrNull(raw.bedCount),
    bathrooms: numberOrNull(raw.bathroomCount),
    areaM2: numberOrNull(raw.floorAreaM2),
    availableFrom: raw.availableFrom ? String(raw.availableFrom) : null,
    pricing,
    photos: photosFrom(raw.media),
    amenities: amenitiesFrom(raw.amenities),
  };
}

export function normalizeListing(raw: any): PublicListing {
  const offers = Array.isArray(raw.rooms) ? raw.rooms.map(normalizeOffer) : [];
  const rules =
    raw.rules && typeof raw.rules === "object" && !Array.isArray(raw.rules)
      ? raw.rules
      : {};
  const ruleValue = (value: unknown) =>
    typeof value === "boolean" ? value : null;

  return {
    id: String(raw.id),
    title: String(raw.title || "Anuncio sin título"),
    description: label(raw.description),
    legacyMultipleOffers:
      Boolean(raw.legacyMultipleOffers) || offers.length > 1,
    propertyType: raw.propertyType ?? null,
    address: {
      line1: label(raw.address?.line1),
      district: label(raw.address?.district),
      city: label(raw.address?.city),
      region: label(raw.address?.region),
      lat: numberOrNull(raw.address?.lat),
      lng: numberOrNull(raw.address?.lng),
    },
    host: raw.host?.id
      ? {
          id: String(raw.host.id),
          name: label(raw.host.name) || "Anfitrión",
          image: raw.host.image ?? null,
        }
      : null,
    rules: {
      notes: label(rules.notes),
      petsAllowed: ruleValue(rules.petsAllowed),
      smokingAllowed: ruleValue(rules.smokingAllowed),
      partiesAllowed: ruleValue(rules.partiesAllowed),
    },
    photos: photosFrom(raw.media),
    amenities: amenitiesFrom(raw.amenities),
    offers,
  };
}

export function offerTypeLabel(type: string | null): string {
  if (type === "entire_place") return "Vivienda completa";
  if (type === "shared_bed") return "Cama compartida";
  if (type === "private_room") return "Habitación privada";
  return "Oferta de alquiler";
}

export function priceLabel(offer: PublicOffer): string | null {
  if (!offer.pricing) return null;
  const { currencyCode, rentAmount, rentalMode } = offer.pricing;
  return `${currencyCode === "PEN" ? "S/" : currencyCode} ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(rentAmount)} por ${rentalMode === "monthly" ? "mes" : "día"}${currencyCode === "PEN" ? " (PEN)" : ""}`;
}

export function amountLabel(
  amount: number | null | undefined,
  currencyCode: string,
): string {
  return amount == null
    ? "—"
    : `${currencyCode === "PEN" ? "S/" : currencyCode} ${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(amount)}${currencyCode === "PEN" ? " (PEN)" : ""}`;
}

export function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(date);
}

export function minimumDateInPeru(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
