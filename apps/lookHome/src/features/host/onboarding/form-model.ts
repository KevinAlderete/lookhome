import type { OfferType, PropertyType } from "@roomly/validation";

export type HostListingKind = "house" | "apartment" | "room";

export const HOST_LISTING_KIND_OPTIONS: ReadonlyArray<{
  value: HostListingKind;
  label: string;
  description: string;
}> = [
  { value: "house", label: "Casa", description: "Alquila una casa." },
  {
    value: "apartment",
    label: "Departamento",
    description: "Alquila un departamento.",
  },
  {
    value: "room",
    label: "Cuarto/habitación",
    description: "Alquila un cuarto o una habitación.",
  },
];

type ListingKindMapping = {
  propertyType: PropertyType;
  offerType: OfferType;
};

const LISTING_KIND_MAPPING: Record<HostListingKind, ListingKindMapping> = {
  house: { propertyType: "house", offerType: "entire_place" },
  apartment: { propertyType: "apartment", offerType: "entire_place" },
  // The current schema requires a physical propertyType even for a room offer.
  // `other` is the neutral existing enum; the offer itself remains private_room.
  room: { propertyType: "other", offerType: "private_room" },
};

export function modelValuesForListingKind(
  kind: HostListingKind,
): ListingKindMapping {
  return LISTING_KIND_MAPPING[kind];
}

export function listingKindFromModel(
  propertyType: PropertyType | string | null | undefined,
  offerType: OfferType | string | null | undefined,
): HostListingKind | null {
  if (offerType === "private_room" || offerType === "shared_bed") return "room";
  if (offerType !== "entire_place") return null;
  if (propertyType === "house") return "house";
  if (propertyType === "apartment") return "apartment";
  return null;
}

/**
 * `currentStep` predates the seven-step form and is persisted by the API.
 * Keep writing the old indices so a draft can be opened by either UI version.
 */
export function currentStepFromStored(value: unknown): number {
  const stored = Number(value);
  if (!Number.isInteger(stored)) return 0;
  const bounded = Math.min(7, Math.max(0, stored));
  return bounded >= 4 ? bounded - 1 : bounded;
}

export function currentStepToStored(value: number): number {
  const bounded = Math.min(6, Math.max(0, Math.trunc(value)));
  return bounded >= 4 ? bounded + 1 : bounded;
}
