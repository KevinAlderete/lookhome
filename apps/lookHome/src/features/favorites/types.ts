export type FavoriteRentalMode = "nightly" | "monthly";

export type FavoriteUnavailableReason =
  | "listing_deleted"
  | "listing_draft"
  | "listing_pending_review"
  | "listing_paused"
  | "listing_suspended"
  | "listing_archived"
  | "offer_draft"
  | "offer_paused"
  | "booking_accepted"
  | "booking_active"
  | "booking_disputed";

export type FavoriteItem = {
  id: string;
  roomId: string;
  listingId?: string | null;
  listingTitle?: string | null;
  title: string;
  href: string;
  addressLabel?: string;
  imageUrl?: string | null;
  priceLabel?: string | null;
  rentalMode?: FavoriteRentalMode | null;
  currencyCode?: string | null;
  rentAmount?: number | null;
  savedAt?: string | null;
  unitType?: string | null;
  depositLabel?: string | null;
  cleaningFeeLabel?: string | null;
  beds?: number | null;
  bathrooms?: number | null;
  areaLabel?: string | null;
  availabilityReason?: FavoriteUnavailableReason | null;
};
