import type {
  RentalMode,
  UnitType,
} from "@/features/host/onboarding/contracts";

type StoredPricingMode = {
  rentalMode?: string | null;
  billingPeriod?: string | null;
};

function billingPeriodRentalMode(
  billingPeriod?: string | null,
): RentalMode | null {
  if (billingPeriod === "daily") return "nightly";
  if (billingPeriod === "monthly") return "monthly";
  return null;
}

export function resolveRentalMode(
  pricing: StoredPricingMode | null | undefined,
): RentalMode | null {
  if (!pricing) return null;
  const explicitMode =
    pricing.rentalMode === "nightly" || pricing.rentalMode === "monthly"
      ? pricing.rentalMode
      : null;
  const legacyMode = billingPeriodRentalMode(pricing.billingPeriod);

  if (explicitMode && legacyMode && explicitMode !== legacyMode) return null;
  return explicitMode ?? legacyMode;
}

export function legacyRoomType(unitType: UnitType): "private" | "shared" {
  return unitType === "shared_bed" ? "shared" : "private";
}
