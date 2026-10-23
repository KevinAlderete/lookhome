import type {
  OfferType,
  PropertyType,
  RentalMode,
} from "@roomly/validation";

export type { OfferType, PropertyType, RentalMode };
export type UnitType = OfferType;

export type OfferPricing = {
  currencyCode: "PEN";
  rentAmount: number;
  depositAmount: number;
  cleaningFee?: number;
  rentalMode: RentalMode;
};

export type ListingDraftOffer = {
  description?: string;
  offerType: OfferType;
  isFurnished: boolean;
  maxGuests: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  pricing: OfferPricing;
  minStayNights?: number;
  maxStayNights?: number;
  minTermMonths?: number;
  maxTermMonths?: number;
  amenityIds: string[];
  houseRules?: string;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  partiesAllowed: boolean;
};

export type ListingDraftRequest = {
  listing?: {
    title?: string;
    description?: string;
    propertyType?: PropertyType;
    address?: Partial<{
      countryCode: "PE";
      regionId: string | null;
      cityId: string | null;
      districtId: string | null;
      regionName?: string;
      cityName?: string;
      districtName?: string;
      line1: string;
      line2: string;
      postalCode: string;
      lat: number | null;
      lng: number | null;
      precision: "exact";
      locationConfirmed: boolean;
    }>;
  };
  offer?: {
    description?: string | null;
    offerType?: OfferType | null;
    isFurnished?: boolean | null;
    maxGuests?: number | null;
    bedrooms?: number | null;
    beds?: number | null;
    bathrooms?: number | null;
    minStayNights?: number | null;
    maxStayNights?: number | null;
    minTermMonths?: number | null;
    maxTermMonths?: number | null;
    amenityIds?: string[];
    houseRules?: string | null;
    petsAllowed?: boolean;
    smokingAllowed?: boolean;
    partiesAllowed?: boolean;
    pricing?: {
      currencyCode?: "PEN" | null;
      rentAmount?: number | null;
      depositAmount?: number | null;
      cleaningFee?: number | null;
      rentalMode?: RentalMode | null;
    };
  };
  availability?: {
    startDate?: string | null;
    endDate?: string | null;
    availableFrom?: string | null;
  };
  currentStep?: number;
  expectedVersion?: number;
};

export type PublishListingDraftResponse = {
  listingId: string;
  offerId: string;
  listingStatus: "published";
  unitStatus: "published";
  message?: string;
};

export type AmenityOption = {
  id: string;
  name: string;
  code?: string | null;
  category?: string | null;
};
