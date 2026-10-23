import { apiServer } from "@/lib/api/server";
import type { HostListingItem } from "@/features/host/listings/types";

export type HostListingsQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  propertyType?: string;
  offerType?: string;
  rentalMode?: string;
  hostUserId?: string;
};

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function localDate(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeZone: "America/Lima",
      }).format(date);
}

function normalizeListing(raw: any): HostListingItem {
  if (!raw?.id && !raw?.listingId) {
    throw new Error("La API devolvió un anuncio sin identificador.");
  }
  const offer = raw.offer ?? null;
  const amount = offer?.pricing?.rentAmount;
  const mode = offer?.pricing?.rentalMode;
  return {
    id: String(firstDefined(raw.id, raw.listingId)),
    draftKey: raw.draftKey ?? null,
    title: firstDefined(raw.title, raw.name) ?? "Anuncio",
    description: raw.description ?? null,
    propertyType: raw.propertyType ?? null,
    status: String(firstDefined(raw.listingStatus, raw.status, "draft")),
    offerType: offer?.offerType ?? null,
    rentalMode: mode === "nightly" || mode === "monthly" ? mode : null,
    price: amount == null ? null : String(amount),
    maxGuests: offer?.maxGuests ?? null,
    offerCount: Number(raw.offerCount ?? (offer ? 1 : 0)),
    isDraftRecord: Boolean(raw.isDraftRecord),
    requiresOfferReview: Boolean(raw.requiresOfferReview),
    missingOffer: Boolean(raw.missingOffer),
    publicOfferCount: Number(
      raw.publicOfferCount ?? (raw.offer?.status === "published" ? 1 : 0),
    ),
    visibilityIssue: Boolean(raw.visibilityIssue),
    bookingVisibilityIssue: Boolean(raw.bookingVisibilityIssue),
    bookingVisibilityReason:
      raw.bookingVisibilityReason === "accepted" ||
      raw.bookingVisibilityReason === "active" ||
      raw.bookingVisibilityReason === "disputed"
        ? raw.bookingVisibilityReason
        : null,
    offerNeedsActivation: Boolean(raw.offerNeedsActivation),
    coverUrl:
      offer?.coverUrl ??
      raw.media?.[0]?.media?.thumbnailPublicUrl ??
      raw.media?.[0]?.media?.publicUrl ??
      null,
    city: raw.address?.city?.name ?? raw.city ?? null,
    district: raw.address?.district?.name ?? raw.district ?? null,
    createdAt: localDate(raw.publishedAt ?? raw.updatedAt ?? raw.createdAt),
    updatedAt: localDate(raw.updatedAt ?? raw.createdAt),
  };
}

export async function getHostListings(
  request: Request,
  query: HostListingsQuery = {},
) {
  const payload = await apiServer<any>(request, "/host/listings", {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
      propertyType: query.propertyType,
      offerType: query.offerType,
      rentalMode: query.rentalMode,
      hostUserId: query.hostUserId,
    },
  });

  const rows = Array.isArray(payload?.items) ? payload.items : [];

  return {
    page: payload?.page ?? 1,
    pageSize: payload?.pageSize ?? 12,
    total: payload?.total ?? rows.length,
    totalPages: payload?.totalPages ?? 1,
    items: rows.map(normalizeListing),
  };
}

export async function getHostListingById(request: Request, id: string) {
  return apiServer<any>(request, `/host/listings/${id}`);
}
