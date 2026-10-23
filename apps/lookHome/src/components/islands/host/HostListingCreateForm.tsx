import { useEffect, useId, useRef, useState } from "react";
import HostAddressPicker from "./HostAddressPicker";
import { useGeoCascade } from "@/features/geo/hooks/useGeoCascade";
import type {
  AmenityOption,
  ListingDraftRequest,
  OfferType,
  PropertyType,
  PublishListingDraftResponse,
  RentalMode,
} from "@/features/host/onboarding/contracts";
import {
  currentStepFromStored,
  currentStepToStored,
  HOST_LISTING_KIND_OPTIONS,
  listingKindFromModel,
  modelValuesForListingKind,
  type HostListingKind,
} from "@/features/host/onboarding/form-model";

type Props = {
  hostUserId?: string;
  listing?: any;
};

type FormState = {
  listingKind: HostListingKind | null;
  listing: {
    title: string;
    description: string;
    propertyType: PropertyType;
    address: {
      line1: string;
      line2: string;
      postalCode: string;
      lat: string;
      lng: string;
      locationConfirmed: boolean;
    };
  };
  offer: {
    description: string;
    offerType: OfferType | null;
    isFurnished: boolean;
    maxGuests: string;
    bedrooms: string;
    beds: string;
    bathrooms: string;
    pricing: {
      rentalMode: RentalMode | null;
      rentAmount: string;
      depositAmount: string;
      cleaningFee: string;
    };
    minStayNights: string;
    maxStayNights: string;
    minTermMonths: string;
    maxTermMonths: string;
    amenityIds: string[];
    houseRules: string;
    petsAllowed: boolean;
    smokingAllowed: boolean;
    partiesAllowed: boolean;
  };
  availability: {
    startDate: string;
    endDate: string;
    availableFrom: string;
  };
};

type Photo = {
  id: string;
  mediaId?: string;
  file?: File;
  previewUrl: string;
  status: "pending" | "uploading" | "uploaded" | "error";
  progress?: number;
  error?: string;
};

class DraftConflictError extends Error {}

const STEPS = [
  "¿Qué vas a ofrecer?",
  "¿Dónde está el alojamiento?",
  "Describe el alojamiento",
  "Precio y disponibilidad",
  "¿Qué ofrece y qué reglas tiene?",
  "Agrega fotos del alojamiento",
  "Revisa tu anuncio",
] as const;

const STAGES = [
  { label: "El alojamiento", firstStep: 0, lastStep: 2 },
  { label: "El anuncio", firstStep: 3, lastStep: 5 },
  { label: "Publicación", firstStep: 6, lastStep: 6 },
] as const;

const DRAFT_STORAGE_KEY = "lookhome.host.listing-draft-key";
const MAX_PHOTOS = 12;
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const EMPTY_FORM: FormState = {
  listingKind: null,
  listing: {
    title: "",
    description: "",
    propertyType: "other",
    address: {
      line1: "",
      line2: "",
      postalCode: "",
      lat: "",
      lng: "",
      locationConfirmed: false,
    },
  },
  offer: {
    description: "",
    offerType: null,
    isFurnished: false,
    maxGuests: "1",
    bedrooms: "1",
    beds: "1",
    bathrooms: "1",
    pricing: {
      rentalMode: null,
      rentAmount: "",
      depositAmount: "0",
      cleaningFee: "",
    },
    minStayNights: "1",
    maxStayNights: "",
    minTermMonths: "1",
    maxTermMonths: "",
    amenityIds: [],
    houseRules: "",
    petsAllowed: false,
    smokingAllowed: false,
    partiesAllowed: false,
  },
  availability: { startDate: "", endDate: "", availableFrom: "" },
};

function apiError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(" · ");
  }
  return fallback;
}

function uploadPhotoFile(
  url: string,
  body: FormData,
  fileName: string,
  onProgress: (percentage: number) => void,
) {
  return new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(
          Math.min(100, Math.round((event.loaded / event.total) * 100)),
        );
      }
    });
    request.addEventListener("load", () => {
      let data: unknown = null;
      try {
        data = JSON.parse(request.responseText || "null");
      } catch {
        // The transport error below remains actionable if the server did not return JSON.
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(apiError(data, `No se pudo subir ${fileName}.`)));
        return;
      }
      resolve(data);
    });
    request.addEventListener("error", () => {
      reject(
        new Error(
          `No se pudo subir ${fileName}. Revisa tu conexión e inténtalo de nuevo.`,
        ),
      );
    });
    request.addEventListener("abort", () =>
      reject(new Error(`Se canceló la carga de ${fileName}.`)),
    );
    request.send(body);
  });
}

function uploadSignedPhotoFile(
  url: string,
  file: File,
  headers: Record<string, string>,
  fileName: string,
  onProgress: (percentage: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      }
    });
    request.addEventListener("load", () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`No se pudo subir ${fileName} al almacenamiento.`));
        return;
      }
      resolve();
    });
    request.addEventListener("error", () =>
      reject(new Error(`No se pudo subir ${fileName}. Revisa tu conexión e inténtalo de nuevo.`)),
    );
    request.addEventListener("abort", () =>
      reject(new Error(`Se canceló la carga de ${fileName}.`)),
    );
    request.send(file);
  });
}

function asString(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

function fromListing(listing: any): FormState {
  if (!listing) return EMPTY_FORM;
  const offer = listing.offer ?? {};
  const pricing = offer.pricing ?? {};
  const availabilityRule = Array.isArray(offer.availabilityRules)
    ? offer.availabilityRules.find(
        (rule: any) => rule.ruleType === "open_range",
      )
    : null;
  const address = listing.address ?? {};
  return {
    listingKind: listingKindFromModel(listing.propertyType, offer.offerType),
    listing: {
      title: asString(listing.title),
      description: asString(listing.description),
      propertyType: (listing.propertyType ?? "other") as PropertyType,
      address: {
        line1: asString(address.line1),
        line2: asString(address.line2),
        postalCode: asString(address.postalCode),
        lat: asString(address.lat),
        lng: asString(address.lng),
        locationConfirmed:
          address.precision === "exact" &&
          address.lat != null &&
          address.lng != null,
      },
    },
    offer: {
      description: asString(offer.description),
      offerType: (offer.offerType ?? null) as OfferType | null,
      isFurnished: Boolean(offer.isFurnished),
      maxGuests: asString(offer.maxOccupancy ?? offer.maxGuests, "1"),
      bedrooms: asString(offer.bedroomCount ?? offer.bedrooms, "0"),
      beds: asString(offer.bedCount ?? offer.beds, "1"),
      bathrooms: asString(offer.bathroomCount ?? offer.bathrooms, "1"),
      pricing: {
        rentalMode:
          pricing.rentalMode === "nightly" || pricing.rentalMode === "monthly"
            ? pricing.rentalMode
            : null,
        rentAmount: asString(pricing.rentAmount),
        depositAmount: asString(pricing.depositAmount, "0"),
        cleaningFee: asString(pricing.cleaningFee),
      },
      minStayNights: asString(pricing.minStayNights, "1"),
      maxStayNights: asString(pricing.maxStayNights),
      minTermMonths: asString(pricing.minTermMonths, "1"),
      maxTermMonths: asString(pricing.maxTermMonths),
      amenityIds: Array.isArray(offer.amenities)
        ? offer.amenities.map((item: any) => String(item.amenityId ?? item.id))
        : [],
      houseRules: asString(listing.rules?.notes),
      petsAllowed: Boolean(listing.rules?.petsAllowed),
      smokingAllowed: Boolean(listing.rules?.smokingAllowed),
      partiesAllowed: Boolean(listing.rules?.partiesAllowed),
    },
    availability: {
      startDate: availabilityRule?.startDate
        ? String(availabilityRule.startDate).slice(0, 10)
        : "",
      endDate: availabilityRule?.endDate
        ? String(availabilityRule.endDate).slice(0, 10)
        : "",
      availableFrom: offer.availableFrom
        ? String(offer.availableFrom).slice(0, 10)
        : "",
    },
  };
}

function fromDraftData(data: any): FormState {
  const base = fromListing({
    ...(data?.listing ?? {}),
    address: data?.listing?.address,
    offer: {
      ...(data?.offer ?? {}),
      offerType: data?.offer?.offerType,
      maxOccupancy: data?.offer?.maxGuests,
      bedroomCount: data?.offer?.bedrooms,
      bedCount: data?.offer?.beds,
      bathroomCount: data?.offer?.bathrooms,
      amenities: (data?.offer?.amenityIds ?? []).map((id: string) => ({ id })),
    },
    rules: {
      notes: data?.offer?.houseRules,
      petsAllowed: data?.offer?.petsAllowed,
      smokingAllowed: data?.offer?.smokingAllowed,
      partiesAllowed: data?.offer?.partiesAllowed,
    },
  });
  const pricing = data?.offer?.pricing;
  return {
    ...base,
    listing: {
      ...base.listing,
      address: {
        ...base.listing.address,
        locationConfirmed: Boolean(data?.listing?.address?.locationConfirmed),
      },
    },
    offer: {
      ...base.offer,
      pricing: {
        rentalMode:
          pricing?.rentalMode === "nightly" || pricing?.rentalMode === "monthly"
            ? pricing.rentalMode
            : null,
        rentAmount: asString(pricing?.rentAmount),
        depositAmount: asString(pricing?.depositAmount, "0"),
        cleaningFee: asString(pricing?.cleaningFee),
      },
      minStayNights: asString(data?.offer?.minStayNights, "1"),
      maxStayNights: asString(data?.offer?.maxStayNights),
      minTermMonths: asString(data?.offer?.minTermMonths, "1"),
      maxTermMonths: asString(data?.offer?.maxTermMonths),
      amenityIds: Array.isArray(data?.offer?.amenityIds)
        ? data.offer.amenityIds.map(String)
        : [],
    },
    availability: {
      startDate: asString(data?.availability?.startDate),
      endDate: asString(data?.availability?.endDate),
      availableFrom: asString(data?.availability?.availableFrom),
    },
  };
}

function numberOrNull(value: string) {
  if (value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function draftPayload(
  form: FormState,
  step: number,
  geo: {
    regionId: string;
    cityId: string;
    districtId: string;
    regionName?: string;
    cityName?: string;
    districtName?: string;
  },
  version?: number,
  preserveOfferDescription = false,
): ListingDraftRequest {
  const mode = form.offer.pricing.rentalMode;
  const address = form.listing.address;
  const payload: ListingDraftRequest = {
    currentStep: currentStepToStored(step),
    listing: {
      title: form.listing.title,
      description: form.listing.description,
      propertyType: form.listing.propertyType,
      address: {
        countryCode: "PE",
        regionId: geo.regionId || null,
        cityId: geo.cityId || null,
        districtId: geo.districtId || null,
        regionName: geo.regionName,
        cityName: geo.cityName,
        districtName: geo.districtName,
        line1: address.line1,
        line2: address.line2,
        postalCode: address.postalCode,
        lat: numberOrNull(address.lat),
        lng: numberOrNull(address.lng),
        precision: "exact",
        locationConfirmed: address.locationConfirmed,
      },
    },
    offer: {
      description: preserveOfferDescription
        ? form.offer.description
        : form.listing.description,
      offerType: form.offer.offerType,
      isFurnished: form.offer.isFurnished,
      maxGuests: numberOrNull(form.offer.maxGuests),
      bedrooms: numberOrNull(form.offer.bedrooms),
      beds: numberOrNull(form.offer.beds),
      bathrooms: numberOrNull(form.offer.bathrooms),
      pricing: {
        currencyCode: "PEN",
        rentalMode: mode,
        rentAmount: numberOrNull(form.offer.pricing.rentAmount),
        depositAmount:
          mode === "monthly"
            ? numberOrNull(form.offer.pricing.depositAmount)
            : null,
        cleaningFee:
          mode === "nightly"
            ? numberOrNull(form.offer.pricing.cleaningFee)
            : null,
      },
      minStayNights:
        mode === "nightly" ? numberOrNull(form.offer.minStayNights) : null,
      maxStayNights:
        mode === "nightly" ? numberOrNull(form.offer.maxStayNights) : null,
      minTermMonths:
        mode === "monthly" ? numberOrNull(form.offer.minTermMonths) : null,
      maxTermMonths:
        mode === "monthly" ? numberOrNull(form.offer.maxTermMonths) : null,
      amenityIds: form.offer.amenityIds,
      houseRules: form.offer.houseRules,
      petsAllowed: form.offer.petsAllowed,
      smokingAllowed: form.offer.smokingAllowed,
      partiesAllowed: form.offer.partiesAllowed,
    },
    availability: {
      startDate:
        mode === "nightly" ? form.availability.startDate || null : null,
      endDate: mode === "nightly" ? form.availability.endDate || null : null,
      availableFrom:
        mode === "monthly" ? form.availability.availableFrom || null : null,
    },
  };
  if (version && version > 0) payload.expectedVersion = version;
  return payload;
}

export default function HostListingCreateForm({
  hostUserId = "",
  listing,
}: Props) {
  const headingId = useId();
  const checklistId = useId();
  const editing = Boolean(listing?.id);
  const editNeedsOffer = editing && Number(listing?.offerCount ?? 0) === 0;
  const preserveOfferDescription = Boolean(
    editing &&
    !editNeedsOffer &&
    String(listing?.offer?.description ?? "").trim() &&
    String(listing?.offer?.description).trim() !==
      String(listing?.description ?? "").trim(),
  );
  const [form, setForm] = useState<FormState>(() => fromListing(listing));
  const [step, setStep] = useState(0);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const draftVersionRef = useRef(0);
  const [draftLoading, setDraftLoading] = useState(!listing || editNeedsOffer);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const [legacyNotice, setLegacyNotice] = useState<{
    listingId: string;
    text: string;
  } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>(() =>
    (listing?.media ?? []).map((item: any, index: number) => {
      const mediaId = String(item.mediaId ?? item.media?.id ?? item.id);
      return {
        id: mediaId,
        mediaId,
        previewUrl: item.media?.publicUrl ?? item.publicUrl ?? "",
        status: "uploaded" as const,
        sortOrder: index,
      } as Photo;
    }),
  );
  const [amenities, setAmenities] = useState<AmenityOption[]>([]);
  const [amenitiesError, setAmenitiesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingRentalMode, setPendingRentalMode] = useState<RentalMode | null>(
    null,
  );
  const [modeChangeNotice, setModeChangeNotice] = useState<string | null>(null);
  const [locationConfirmationNotice, setLocationConfirmationNotice] = useState<
    string | null
  >(null);
  const [retryAction, setRetryAction] = useState<(() => void) | null>(null);
  const [retryLabel, setRetryLabel] = useState("Reintentar");
  const dirtyRef = useRef(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const photoRef = useRef(photos);
  const restoredGeoRef = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const fileInputId = useId();

  const geo = useGeoCascade("PE");
  const {
    regionId,
    cityId,
    districtId,
    regions,
    cities,
    districts,
    loadingInitial,
    loadingRegions,
    loadingCities,
    loadingDistricts,
    error: geoError,
    setRegionId,
    setCityId,
    setDistrictId,
    setSelection,
  } = geo;
  const geoContext = {
    regionId,
    cityId,
    districtId,
    regionName: regions.find((item) => item.id === regionId)?.name ?? "",
    cityName: cities.find((item) => item.id === cityId)?.name ?? "",
    districtName: districts.find((item) => item.id === districtId)?.name ?? "",
  };
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };
  const clearDirty = () => {
    dirtyRef.current = false;
    setDirty(false);
  };
  useEffect(() => {
    photoRef.current = photos;
  }, [photos]);
  useEffect(() => {
    if (error || geoError) errorSummaryRef.current?.focus();
  }, [error, geoError]);
  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [dirty]);
  useEffect(
    () => () => {
      photoRef.current.forEach((photo) => {
        if (photo.file) URL.revokeObjectURL(photo.previewUrl);
      });
    },
    [],
  );

  useEffect(() => {
    if (!listing || restoredGeoRef.current || !listing.address?.regionId)
      return;
    restoredGeoRef.current = true;
    void setSelection({
      regionId: String(listing.address.regionId),
      cityId: String(listing.address.cityId ?? ""),
      districtId: String(listing.address.districtId ?? ""),
    });
  }, [listing, setSelection]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/catalog/amenities", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            apiError(data, "No se pudieron cargar las comodidades."),
          );
        const rows = Array.isArray(data)
          ? data
          : (data?.items ?? data?.amenities ?? []);
        setAmenities(
          rows
            .filter(
              (item: any) =>
                String(item?.code ?? "").toLowerCase() !== "furnished",
            )
            .map((item: any) => ({
              id: String(item.id),
              name: String(item.name),
              code: item.code ?? null,
              category: item.category ?? null,
            })),
        );
      })
      .catch((loadError) => {
        if ((loadError as Error).name !== "AbortError")
          setAmenitiesError(
            loadError instanceof Error
              ? loadError.message
              : "No se pudieron cargar las comodidades.",
          );
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!hostUserId || (editing && !editNeedsOffer)) {
      setDraftLoading(false);
      return;
    }
    let cancelled = false;
    const storageKey = editNeedsOffer
      ? `${DRAFT_STORAGE_KEY}:${hostUserId}:listing:${listing.id}`
      : `${DRAFT_STORAGE_KEY}:${hostUserId}`;
    let key: string;
    try {
      const fromUrl = editNeedsOffer
        ? null
        : new URLSearchParams(window.location.search).get("draftKey");
      let storedKey = editNeedsOffer
        ? localStorage.getItem(storageKey)
        : (fromUrl ?? localStorage.getItem(storageKey));
      if (!storedKey && !editNeedsOffer)
        storedKey = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (
        !storedKey ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          storedKey,
        )
      )
        storedKey = crypto.randomUUID();
      key = storedKey;
      localStorage.setItem(storageKey, key);
    } catch {
      setDraftLoadFailed(true);
      setDraftLoading(false);
      setError(
        "No se pudo guardar la clave de recuperación en este navegador. Habilita el almacenamiento local e inténtalo de nuevo.",
      );
      return;
    }
    setDraftKey(key);
    const loadRequest = editNeedsOffer
      ? fetch(`/api/host/listings/${encodeURIComponent(listing.id)}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creationKey: key }),
        })
      : fetch(`/api/host/listing-drafts/${encodeURIComponent(key)}`);
    loadRequest
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (cancelled) return;
        if (response.status === 404 && !editNeedsOffer) return;
        if (!response.ok)
          throw new Error(apiError(data, "No pudimos recuperar el borrador."));
        if (data?.publishedListingId || data?.legacyPublished) {
          const listingId = data.publishedListingId ?? data.listingId;
          if (listingId)
            window.location.replace(
              `/host/anuncios/${encodeURIComponent(listingId)}/editar`,
            );
          return;
        }
        if (data?.legacyNeedsReview) {
          setLegacyNotice({
            listingId: String(data.listingId),
            text: `Este borrador anterior contiene ${data.offerCount} ofertas distintas. Se conservaron sin cambios; no podemos escoger una para convertirla automáticamente.`,
          });
          return;
        }
        if (typeof data?.draftKey === "string" && data.draftKey !== key) {
          setDraftKey(data.draftKey);
          localStorage.setItem(storageKey, data.draftKey);
        }
        draftVersionRef.current = Number(data?.version ?? 0);
        setStep(currentStepFromStored(data?.currentStep));
        const restored = fromDraftData(data?.draftData ?? {});
        setForm(restored);
        const restoredAddress = data?.draftData?.listing?.address;
        if (restoredAddress?.regionId) {
          void setSelection({
            regionId: String(restoredAddress.regionId),
            cityId: String(restoredAddress.cityId ?? ""),
            districtId: String(restoredAddress.districtId ?? ""),
          });
        }
        setPhotos(
          (data?.photos ?? []).map((photo: any) => ({
            id: String(photo.mediaId ?? photo.id),
            mediaId: String(photo.mediaId ?? photo.id),
            previewUrl: String(photo.url ?? ""),
            status: "uploaded" as const,
          })),
        );
      })
      .catch((loadError) => {
        if (!cancelled) {
          setDraftLoadFailed(true);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No pudimos recuperar el borrador.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDraftLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [editing, editNeedsOffer, hostUserId, listing?.id, setSelection]);

  const clearFeedback = () => {
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setRetryAction(null);
    setRetryLabel("Reintentar");
  };

  const updateListing = (patch: Partial<FormState["listing"]>) => {
    markDirty();
    clearFeedback();
    setForm((current) => ({
      ...current,
      listing: { ...current.listing, ...patch },
    }));
  };
  const updateAddress = (patch: Partial<FormState["listing"]["address"]>) => {
    markDirty();
    clearFeedback();
    setForm((current) => ({
      ...current,
      listing: {
        ...current.listing,
        address: { ...current.listing.address, ...patch },
      },
    }));
  };
  const updateOffer = (patch: Partial<FormState["offer"]>) => {
    markDirty();
    clearFeedback();
    setForm((current) => ({
      ...current,
      offer: { ...current.offer, ...patch },
    }));
  };
  const updateAvailability = (patch: Partial<FormState["availability"]>) => {
    markDirty();
    clearFeedback();
    setForm((current) => ({
      ...current,
      availability: { ...current.availability, ...patch },
    }));
  };

  const applyRentalMode = (
    rentalMode: RentalMode,
    confirmedDiscard = false,
  ) => {
    markDirty();
    clearFeedback();
    setForm((current) => ({
      ...current,
      offer: {
        ...current.offer,
        pricing: {
          rentalMode,
          rentAmount: "",
          depositAmount: "0",
          cleaningFee: "",
        },
        minStayNights: "1",
        maxStayNights: "",
        minTermMonths: "1",
        maxTermMonths: "",
      },
      availability: { startDate: "", endDate: "", availableFrom: "" },
    }));
    setPendingRentalMode(null);
    setModeChangeNotice(
      confirmedDiscard
        ? "Modalidad actualizada. Las condiciones anteriores dejaron de aplicarse."
        : null,
    );
  };

  const hasCurrentModeData = (mode: RentalMode) => {
    if (form.offer.pricing.rentAmount.trim()) return true;
    if (mode === "nightly") {
      return Boolean(
        form.offer.pricing.cleaningFee.trim() ||
        form.offer.minStayNights !== "1" ||
        form.offer.maxStayNights.trim() ||
        form.availability.startDate ||
        form.availability.endDate,
      );
    }
    return Boolean(
      (form.offer.pricing.depositAmount.trim() &&
        form.offer.pricing.depositAmount !== "0") ||
      form.offer.minTermMonths !== "1" ||
      form.offer.maxTermMonths.trim() ||
      form.availability.availableFrom,
    );
  };

  const requestRentalMode = (rentalMode: RentalMode) => {
    if (rentalMode === form.offer.pricing.rentalMode) return;
    setModeChangeNotice(null);
    if (
      form.offer.pricing.rentalMode &&
      hasCurrentModeData(form.offer.pricing.rentalMode)
    ) {
      setPendingRentalMode(rentalMode);
      return;
    }
    applyRentalMode(rentalMode);
  };

  const chooseListingKind = (kind: HostListingKind) => {
    const mapped = modelValuesForListingKind(kind);
    markDirty();
    clearFeedback();
    setForm((current) => ({
      ...current,
      listingKind: kind,
      listing: { ...current.listing, propertyType: mapped.propertyType },
      offer: {
        ...current.offer,
        offerType: mapped.offerType,
        ...(kind === "room" ? { bedrooms: "1" } : {}),
      },
    }));
  };

  const validateStep = (
    target: number,
  ): { field: string; message: string } | null => {
    const mode = form.offer.pricing.rentalMode;
    if (target === 0 && !form.listingKind && (!editing || editNeedsOffer))
      return {
        field: "listingKind",
        message: "Elige Casa, Departamento o Cuarto/habitación.",
      };
    if (target === 0 && !mode)
      return { field: "rentalMode", message: "Elige Por día o Por mes." };
    if (target === 1) {
      const lat = numberOrNull(form.listing.address.lat);
      const lng = numberOrNull(form.listing.address.lng);
      if (!regionId || !cityId || !districtId)
        return {
          field: "administrative",
          message: "Selecciona departamento, provincia y distrito.",
        };
      if (!form.listing.address.line1.trim())
        return { field: "line1", message: "Completa la dirección exacta." };
      if (
        lat == null ||
        lng == null ||
        lat < -18.5 ||
        lat > 0.1 ||
        lng < -81.5 ||
        lng > -68.5
      )
        return { field: "map", message: "Coloca el pin dentro del Perú." };
      if (!form.listing.address.locationConfirmed)
        return {
          field: "map",
          message: "Revisa el pin y confirma la ubicación.",
        };
    }
    if (target === 2) {
      if (!form.listing.title.trim())
        return { field: "title", message: "Completa el título del anuncio." };
      if (!form.listing.description.trim())
        return {
          field: "description",
          message: "Completa la descripción del alojamiento.",
        };
      if (
        !Number.isInteger(Number(form.offer.maxGuests)) ||
        Number(form.offer.maxGuests) < 1 ||
        Number(form.offer.maxGuests) > 100
      )
        return {
          field: "maxGuests",
          message: "Indica entre 1 y 100 huéspedes.",
        };
      if (
        form.listingKind !== "room" &&
        (!Number.isInteger(Number(form.offer.bedrooms)) ||
          Number(form.offer.bedrooms) < 0 ||
          Number(form.offer.bedrooms) > 100)
      )
        return {
          field: "bedrooms",
          message: "Indica entre 0 y 100 dormitorios.",
        };
      if (
        !Number.isInteger(Number(form.offer.beds)) ||
        Number(form.offer.beds) < 1 ||
        Number(form.offer.beds) > 100
      )
        return { field: "beds", message: "Indica entre 1 y 100 camas." };
      if (
        !Number.isFinite(Number(form.offer.bathrooms)) ||
        Number(form.offer.bathrooms) < 0.5 ||
        Number(form.offer.bathrooms) > 100
      )
        return {
          field: "bathrooms",
          message: "Indica entre medio baño y 100 baños.",
        };
    }
    if (target === 3) {
      if (!mode)
        return { field: "rentalMode", message: "Elige Por día o Por mes." };
      if (
        !Number.isFinite(Number(form.offer.pricing.rentAmount)) ||
        Number(form.offer.pricing.rentAmount) <= 0
      )
        return {
          field: "rentAmount",
          message: "Indica un precio mayor que cero en PEN.",
        };
      if (
        mode === "monthly" &&
        (!Number.isFinite(Number(form.offer.pricing.depositAmount)) ||
          Number(form.offer.pricing.depositAmount) < 0)
      )
        return {
          field: "depositAmount",
          message: "Indica el depósito en PEN; puede ser 0.",
        };
      if (
        mode === "nightly" &&
        form.offer.pricing.cleaningFee.trim() &&
        (!Number.isFinite(Number(form.offer.pricing.cleaningFee)) ||
          Number(form.offer.pricing.cleaningFee) < 0)
      )
        return {
          field: "cleaningFee",
          message: "Indica un cargo de limpieza válido en PEN.",
        };
      if (
        mode === "nightly" &&
        (!Number.isInteger(Number(form.offer.minStayNights)) ||
          Number(form.offer.minStayNights) < 1 ||
          Number(form.offer.minStayNights) > 365)
      )
        return {
          field: "minStayNights",
          message: "La estadía mínima debe ser de 1 a 365 noches.",
        };
      if (
        mode === "nightly" &&
        form.offer.maxStayNights &&
        (!Number.isInteger(Number(form.offer.maxStayNights)) ||
          Number(form.offer.maxStayNights) > 365 ||
          Number(form.offer.maxStayNights) < Number(form.offer.minStayNights))
      )
        return {
          field: "maxStayNights",
          message:
            "Indica un máximo de hasta 365 noches, igual o mayor que el mínimo.",
        };
      if (
        mode === "monthly" &&
        (!Number.isInteger(Number(form.offer.minTermMonths)) ||
          Number(form.offer.minTermMonths) < 1 ||
          Number(form.offer.minTermMonths) > 120)
      )
        return {
          field: "minTermMonths",
          message: "El plazo mínimo debe ser de 1 a 120 meses.",
        };
      if (
        mode === "monthly" &&
        form.offer.maxTermMonths &&
        (!Number.isInteger(Number(form.offer.maxTermMonths)) ||
          Number(form.offer.maxTermMonths) > 120 ||
          Number(form.offer.maxTermMonths) < Number(form.offer.minTermMonths))
      )
        return {
          field: "maxTermMonths",
          message:
            "Indica un máximo de hasta 120 meses, igual o mayor que el mínimo.",
        };
      if (
        mode === "nightly" &&
        Boolean(form.availability.startDate) !==
          Boolean(form.availability.endDate)
      )
        return {
          field: "endDate",
          message: "Indica ambas fechas del rango o deja las dos vacías.",
        };
      if (
        mode === "nightly" &&
        form.availability.startDate &&
        form.availability.endDate &&
        form.availability.startDate >= form.availability.endDate
      )
        return {
          field: "endDate",
          message: "La fecha de fin debe ser posterior a la de inicio.",
        };
    }
    if (target === 5 && (!editing || editNeedsOffer) && photos.length === 0)
      return {
        field: "photos",
        message: "Agrega al menos una foto para publicar.",
      };
    return null;
  };

  const uploadPendingPhotos = async () => {
    if ((editing && !editNeedsOffer) || !draftKey) return;
    let uploadedPhotos = [...photos];
    for (const [index, photo] of uploadedPhotos.entries()) {
      if (!photo.file || photo.mediaId) continue;
      setProgress(`Subiendo foto ${index + 1} de ${photos.length}…`);
      setPhotos((current) =>
        current.map((item) =>
          item.id === photo.id
            ? { ...item, status: "uploading", progress: 0, error: undefined }
            : item,
        ),
      );
      const formData = new FormData();
      formData.append("file", photo.file);
      const params = new URLSearchParams({
        sortOrder: String(index),
        isCover: String(index === 0),
      });
      try {
        const progress = (percentage: number) =>
          setPhotos((current) =>
            current.map((item) =>
              item.id === photo.id ? { ...item, progress: percentage } : item,
            ),
          );
        const intentResponse = await fetch(
          `/api/host/listing-drafts/${encodeURIComponent(draftKey)}/photos/${encodeURIComponent(photo.id)}/upload-intent?sortOrder=${index}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              uploadKey: photo.id,
              sizeBytes: photo.file.size,
              mimeType: photo.file.type,
            }),
          },
        );
        const intent = await intentResponse.json().catch(() => null);
        if (!intentResponse.ok)
          throw new Error(apiError(intent, `No se pudo preparar ${photo.file.name}.`));

        let data: any;
        if (intent?.mode === "proxy") {
          data = await uploadPhotoFile(
            `/api/host/listing-drafts/${encodeURIComponent(draftKey)}/photos/${encodeURIComponent(photo.id)}?${params}`,
            formData,
            photo.file.name,
            progress,
          );
        } else {
          if (!intent?.mediaId || !intent?.uploadUrl || !intent?.headers) {
            throw new Error("El servidor no devolvió los datos de carga directa.");
          }
          if (!intent.completed) {
            await uploadSignedPhotoFile(
              intent.uploadUrl,
              photo.file,
              intent.headers,
              photo.file.name,
              progress,
            );
          }
          const completeResponse = await fetch(
            `/api/host/listing-drafts/${encodeURIComponent(draftKey)}/photos/${encodeURIComponent(photo.id)}/complete`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mediaId: intent.mediaId,
                uploadKey: photo.id,
                sortOrder: index,
                isCover: index === 0,
              }),
            },
          );
          data = await completeResponse.json().catch(() => null);
          if (!completeResponse.ok) {
            throw new Error(apiError(data, `No se pudo confirmar ${photo.file.name}.`));
          }
        }
        if (!data?.mediaId || typeof data.url !== "string")
          throw new Error(
            `El servidor no confirmó la carga de ${photo.file.name}.`,
          );
        draftVersionRef.current = Number(
          data?.version ?? draftVersionRef.current,
        );
        const uploadedUrl = String(data.url ?? photo.previewUrl);
        if (photo.previewUrl.startsWith("blob:"))
          URL.revokeObjectURL(photo.previewUrl);
        uploadedPhotos = uploadedPhotos.map((item) =>
          item.id === photo.id
            ? {
                id: String(data.mediaId),
                mediaId: String(data.mediaId),
                previewUrl: uploadedUrl,
                status: "uploaded",
                progress: 100,
              }
            : item,
        );
        setPhotos(uploadedPhotos);
      } catch (uploadError) {
        const message =
          uploadError instanceof Error
            ? uploadError.message
            : `No se pudo subir ${photo.file.name}.`;
        uploadedPhotos = uploadedPhotos.map((item) =>
          item.id === photo.id
            ? { ...item, status: "error", error: message }
            : item,
        );
        setPhotos(uploadedPhotos);
        throw new Error(message);
      }
    }
    const ids = uploadedPhotos
      .map((photo) => photo.mediaId)
      .filter((id): id is string => Boolean(id));
    if (ids.length) {
      const response = await fetch(
        `/api/host/listing-drafts/${encodeURIComponent(draftKey)}/photos/order`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaIds: ids }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          apiError(data, "No se pudo guardar el orden de las fotos."),
        );
      if (data?.version) {
        draftVersionRef.current = Number(data.version);
      }
    }
  };

  const save = async (nextStep = step, exit = false) => {
    setSaving(true);
    clearFeedback();
    setSuccess(null);
    setProgress("Guardando…");
    try {
      if (editing && !editNeedsOffer) {
        const response = await fetch(
          `/api/host/listings/${encodeURIComponent(listing.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              draftPayload(
                form,
                nextStep,
                geoContext,
                undefined,
                preserveOfferDescription,
              ),
            ),
          },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            apiError(data, "No se pudieron guardar los cambios."),
          );
        setSuccess("Cambios guardados.");
      } else {
        if (!draftKey)
          throw new Error(
            "No se pudo iniciar el borrador. Inténtalo de nuevo.",
          );
        await uploadPendingPhotos();
        const response = await fetch(
          `/api/host/listing-drafts/${encodeURIComponent(draftKey)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              draftPayload(form, nextStep, geoContext, draftVersionRef.current),
            ),
          },
        );
        const data = await response.json().catch(() => null);
        if (response.status === 409)
          throw new DraftConflictError(
            "El borrador cambió en otra sesión. Recarga la versión guardada antes de continuar.",
          );
        if (!response.ok)
          throw new Error(apiError(data, "No se pudo guardar el borrador."));
        draftVersionRef.current = Number(
          data?.version ?? draftVersionRef.current,
        );
        setSuccess("Borrador guardado");
      }
      clearDirty();
      setProgress(null);
      if (exit) {
        window.location.assign("/host/anuncios");
        return;
      }
      if (nextStep !== step) setStep(nextStep);
    } catch (saveError) {
      setProgress(null);
      const message =
        saveError instanceof Error
          ? saveError.message
          : "No se pudieron guardar los cambios.";
      setError(
        saveError instanceof DraftConflictError
          ? message
          : `No se pudo guardar. Tus datos siguen en pantalla. ${message}`,
      );
      if (saveError instanceof DraftConflictError) {
        setRetryLabel("Recargar borrador");
        setRetryAction(() => () => window.location.reload());
      } else {
        setRetryAction(() => () => {
          void save(nextStep, exit);
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!canPublish) {
      setError("Completa los requisitos pendientes antes de publicar.");
      return;
    }
    setSaving(true);
    clearFeedback();
    setProgress("Guardando y comprobando los requisitos…");
    try {
      if (editing && !editNeedsOffer) {
        const response = await fetch(
          `/api/host/listings/${encodeURIComponent(listing.id)}/publish`,
          { method: "PATCH" },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(apiError(data, "No se pudo publicar el anuncio."));
      } else {
        await uploadPendingPhotos();
        const saveResponse = await fetch(
          `/api/host/listing-drafts/${encodeURIComponent(draftKey!)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              draftPayload(form, 6, geoContext, draftVersionRef.current),
            ),
          },
        );
        const saved = await saveResponse.json().catch(() => null);
        if (saveResponse.status === 409)
          throw new DraftConflictError(
            "El borrador cambió en otra sesión. Recarga la versión guardada antes de continuar.",
          );
        if (!saveResponse.ok)
          throw new Error(apiError(saved, "No se pudo guardar el borrador."));
        draftVersionRef.current = Number(
          saved?.version ?? draftVersionRef.current,
        );
        const response = await fetch(
          `/api/host/listing-drafts/${encodeURIComponent(draftKey!)}/publish`,
          { method: "POST" },
        );
        const data = (await response
          .json()
          .catch(() => null)) as PublishListingDraftResponse | null;
        if (!response.ok)
          throw new Error(apiError(data, "No se pudo publicar el anuncio."));
        if (!data?.listingId)
          throw new Error("La API no devolvió el anuncio publicado.");
        const storageKey = editNeedsOffer
          ? `${DRAFT_STORAGE_KEY}:${hostUserId}:listing:${listing.id}`
          : `${DRAFT_STORAGE_KEY}:${hostUserId}`;
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* El anuncio ya quedó publicado. */
        }
        if (
          !editNeedsOffer &&
          localStorage.getItem(DRAFT_STORAGE_KEY) === draftKey
        ) {
          try {
            localStorage.removeItem(DRAFT_STORAGE_KEY);
          } catch {
            /* El anuncio ya quedó publicado. */
          }
        }
        clearDirty();
        window.location.assign(
          `/host/anuncios/${encodeURIComponent(data.listingId)}/editar`,
        );
        return;
      }
      window.location.reload();
    } catch (publishError) {
      if ((!editing || editNeedsOffer) && draftKey) {
        try {
          const recovery = await fetch(
            `/api/host/listing-drafts/${encodeURIComponent(draftKey)}`,
          );
          const saved = await recovery.json().catch(() => null);
          const publishedId =
            saved?.publishedListingId ??
            (saved?.legacyPublished ? saved?.listingId : null);
          if (recovery.ok && publishedId) {
            const storageKey = editNeedsOffer
              ? `${DRAFT_STORAGE_KEY}:${hostUserId}:listing:${listing.id}`
              : `${DRAFT_STORAGE_KEY}:${hostUserId}`;
            try {
              localStorage.removeItem(storageKey);
            } catch {
              /* El anuncio ya quedó publicado. */
            }
            clearDirty();
            window.location.assign(
              `/host/anuncios/${encodeURIComponent(publishedId)}/editar`,
            );
            return;
          }
          if (
            !(publishError instanceof DraftConflictError) &&
            recovery.ok &&
            Number.isFinite(Number(saved?.version))
          ) {
            draftVersionRef.current = Number(saved.version);
          }
        } catch {
          // The visible publish error below remains the recovery path.
        }
      }
      const message =
        publishError instanceof Error
          ? publishError.message
          : "No se pudo publicar el anuncio.";
      setError(
        publishError instanceof DraftConflictError
          ? message
          : `No se pudo publicar. Tus datos siguen en pantalla. ${message}`,
      );
      if (publishError instanceof DraftConflictError) {
        setRetryLabel("Recargar borrador");
        setRetryAction(() => () => window.location.reload());
      } else {
        setRetryAction(() => () => {
          void publish();
        });
      }
      setProgress(null);
      setSaving(false);
    }
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const selected = Array.from(files);
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type))
        rejected.push(`${file.name}: usa JPG, PNG o WEBP.`);
      else if (file.size <= 0 || file.size > MAX_PHOTO_SIZE)
        rejected.push(`${file.name}: debe pesar hasta 8 MB.`);
      else accepted.push(file);
    }
    const availableSlots = Math.max(0, MAX_PHOTOS - photos.length);
    const toAdd = accepted.slice(0, availableSlots);
    if (accepted.length > availableSlots)
      rejected.push(
        `Puedes agregar hasta ${MAX_PHOTOS} fotos; se añadieron las ${toAdd.length} válidas disponibles.`,
      );
    if (toAdd.length) {
      markDirty();
      setPhotos((current) => [
        ...current,
        ...toAdd.map((file) => ({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
          status: "pending" as const,
        })),
      ]);
    }
    clearFeedback();
    if (rejected.length) {
      const message = rejected.join(" ");
      setError(message);
      setFieldErrors({ photos: message });
    }
  };

  const removePhoto = async (photo: Photo) => {
    if (photo.mediaId && !window.confirm("¿Quitar esta foto del borrador?"))
      return;
    if (photo.mediaId && draftKey && (!editing || editNeedsOffer)) {
      setSaving(true);
      clearFeedback();
      try {
        const response = await fetch(
          `/api/host/listing-drafts/${encodeURIComponent(draftKey)}/photos/${encodeURIComponent(photo.mediaId)}`,
          { method: "DELETE" },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(apiError(data, "No se pudo quitar la foto."));
        draftVersionRef.current = Number(
          data?.version ?? draftVersionRef.current,
        );
      } catch (removeError) {
        const message =
          removeError instanceof Error
            ? removeError.message
            : "No se pudo quitar la foto.";
        setError(message);
        setRetryAction(() => () => {
          void removePhoto(photo);
        });
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    if (photo.file) URL.revokeObjectURL(photo.previewUrl);
    markDirty();
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
  };

  const movePhoto = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= photos.length) return;
    markDirty();
    setPhotos((current) => {
      const result = [...current];
      const [photo] = result.splice(index, 1);
      result.splice(target, 0, photo);
      return result;
    });
  };

  const toggleAmenity = (id: string) =>
    updateOffer({
      amenityIds: form.offer.amenityIds.includes(id)
        ? form.offer.amenityIds.filter((value) => value !== id)
        : [...form.offer.amenityIds, id],
    });

  const next = async () => {
    const invalid = validateStep(step);
    if (invalid) {
      setFieldErrors({ [invalid.field]: invalid.message });
      setError(invalid.message);
      return;
    }
    setFieldErrors({});
    await save(Math.min(6, step + 1));
  };

  const locationConfirmed = form.listing.address.locationConfirmed;
  const activeMode = form.offer.pricing.rentalMode;
  const currentStage = STAGES.findIndex(
    (stage) => step >= stage.firstStep && step <= stage.lastStep,
  );
  const addressIsReady = validateStep(1) === null;
  const detailsAreReady = validateStep(2) === null;
  const pricingIsReady = validateStep(3) === null;
  const selectedKindLabel = form.listingKind
    ? HOST_LISTING_KIND_OPTIONS.find((item) => item.value === form.listingKind)
        ?.label
    : editing && !editNeedsOffer
      ? "Clasificación anterior conservada"
      : "Sin elegir";
  const amenityCategoryLabels: Record<string, string> = {
    room: "Dormitorio",
    property: "Alojamiento",
    building: "Edificio",
    safety: "Seguridad",
    internet: "Internet",
    kitchen: "Cocina",
    other: "Otros",
  };
  const amenitiesByCategory = amenities.reduce<Record<string, AmenityOption[]>>(
    (groups, amenity) => {
      const key = String(amenity.category ?? "other").toLowerCase();
      (groups[key] ??= []).push(amenity);
      return groups;
    },
    {},
  );
  const formatPEN = (value: string | number) => {
    if (String(value).trim() === "") return "—";
    const amount = Number(value);
    return Number.isFinite(amount)
      ? new Intl.NumberFormat("es-PE", {
          style: "currency",
          currency: "PEN",
          maximumFractionDigits: 2,
        }).format(amount)
      : "—";
  };
  const fieldAnchorId = (field: string) =>
    field === "line1" ? "host-address-line1" : `${headingId}-field-${field}`;
  const renderFieldError = (field: string) =>
    fieldErrors[field] ? (
      <p
        id={`${fieldAnchorId(field)}-error`}
        className="mt-1 text-sm font-medium text-red-800"
        role="alert"
      >
        {fieldErrors[field]}
      </p>
    ) : null;
  const publicationChecklist = [
    { label: "Tipo y modalidad", met: validateStep(0) === null, step: 0 },
    { label: "Ubicación exacta confirmada", met: addressIsReady, step: 1 },
    {
      label: "Título y descripción",
      met: Boolean(
        form.listing.title.trim() && form.listing.description.trim(),
      ),
      step: 2,
    },
    { label: "Capacidad y características", met: detailsAreReady, step: 2 },
    { label: "Precio y condiciones", met: pricingIsReady, step: 3 },
    {
      label: "Al menos una foto",
      met: (editing && !editNeedsOffer) || photos.length > 0,
      step: 5,
    },
  ];
  const canPublish = publicationChecklist.every((item) => item.met);
  const recommendations = [
    {
      label: "Agrega más fotos para mostrar distintos espacios",
      met: photos.length >= 3,
      step: 5,
    },
    {
      label: "Completa la disponibilidad si ya la conoces",
      met:
        activeMode === "monthly"
          ? Boolean(form.availability.availableFrom)
          : Boolean(form.availability.startDate && form.availability.endDate),
      step: 3,
    },
    {
      label: "Selecciona las comodidades que ofrece",
      met: form.offer.amenityIds.length > 0,
      step: 4,
    },
  ];
  const stepTitle =
    step === 6 && editing && !editNeedsOffer
      ? "Revisa tu anuncio"
      : STEPS[step];
  const addressPickerValue = {
    line1: form.listing.address.line1,
    line2: form.listing.address.line2,
    postalCode: form.listing.address.postalCode,
    lat: form.listing.address.lat,
    lng: form.listing.address.lng,
  };

  if (draftLoading) {
    return (
      <div className="rounded-3xl bg-white p-8 text-warm-gray" role="status">
        Recuperando el borrador guardado…
      </div>
    );
  }
  if (draftLoadFailed && (!editing || editNeedsOffer)) {
    return (
      <section
        className="rounded-3xl border border-red-200 bg-white p-6"
        aria-labelledby="draft-recovery-error"
      >
        <h2
          id="draft-recovery-error"
          className="text-xl font-bold text-warm-gray"
        >
          No pudimos verificar el borrador guardado
        </h2>
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error ?? "No pudimos recuperar el borrador."}
        </p>
        <p className="mt-2 text-sm text-warm-gray/70">
          Tus datos no se reemplazaron. Vuelve a intentarlo para recuperar la
          versión guardada.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-11 rounded-xl bg-terracotta px-4 font-semibold text-[#231f1d] hover:bg-soft-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
        >
          Volver a intentar
        </button>
      </section>
    );
  }
  if (legacyNotice) {
    return (
      <div
        className="space-y-4 rounded-3xl border border-amber-300 bg-amber-50 p-6"
        role="alert"
      >
        <h2 className="text-xl font-bold text-warm-gray">
          Este anuncio necesita una revisión
        </h2>
        <p className="text-sm leading-6 text-warm-gray">{legacyNotice.text}</p>
        <a
          className="inline-flex min-h-11 items-center rounded-xl bg-terracotta px-4 font-semibold text-[#231f1d] hover:bg-soft-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          href={`/host/anuncios/${encodeURIComponent(legacyNotice.listingId)}/editar`}
        >
          Ver anuncio conservado
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (step === 6)
          void (editing && !editNeedsOffer ? save(step) : publish());
        else void next();
      }}
      noValidate
      aria-busy={saving}
      className="rounded-[24px] bg-white p-4 shadow-[0_18px_50px_rgba(80,76,74,0.08)] sm:p-6"
    >
      <div className="border-b border-warm-gray/10 pb-5">
        <p className="text-sm font-semibold text-terracotta">
          Etapa {currentStage + 1} de {STAGES.length} ·{" "}
          {STAGES[currentStage].label}
        </p>
        <h2
          id={headingId}
          className="mt-1 text-balance text-2xl font-bold text-warm-gray"
        >
          {stepTitle}
        </h2>
        <p className="mt-1 text-sm text-warm-gray/70">
          Paso {step + 1} de {STEPS.length}
        </p>
        <ol
          aria-label="Etapas de publicación"
          className="mt-4 grid grid-cols-3 gap-2"
        >
          {STAGES.map((stage, index) => (
            <li
              key={stage.label}
              aria-current={index === currentStage ? "step" : undefined}
              className={`rounded-xl px-3 py-2 text-center text-xs font-semibold sm:text-sm ${index === currentStage ? "bg-terracotta/10 text-terracotta-strong" : index < currentStage ? "bg-cream text-warm-gray" : "bg-warm-gray/5 text-warm-gray/60"}`}
            >
              {stage.label}
            </li>
          ))}
        </ol>
      </div>

      {(error || geoError) && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <p>{error ?? geoError}</p>
          {Object.keys(fieldErrors)[0] && (
            <a
              className="mt-2 inline-flex min-h-10 items-center font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              href={`#${fieldAnchorId(Object.keys(fieldErrors)[0])}`}
            >
              Ir al campo
            </a>
          )}
          {retryAction && (
            <button
              type="button"
              onClick={retryAction}
              disabled={saving}
              className="ml-3 mt-2 min-h-10 rounded-lg border border-red-300 bg-white px-3 font-semibold text-red-900 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              {retryLabel}
            </button>
          )}
        </div>
      )}

      <fieldset disabled={saving} className="mt-6 min-w-0 border-0 p-0">
        <legend className="sr-only">{stepTitle}</legend>
        <div
          aria-labelledby={headingId}
          className={saving ? "pointer-events-none" : ""}
        >
          {step === 0 && (
            <div className="space-y-6">
              <fieldset
                id={fieldAnchorId("listingKind")}
                tabIndex={-1}
                aria-describedby={
                  fieldErrors.listingKind
                    ? `${fieldAnchorId("listingKind")}-error`
                    : undefined
                }
              >
                <legend className="font-semibold text-warm-gray">
                  Tipo de alojamiento
                </legend>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  {HOST_LISTING_KIND_OPTIONS.map((item) => (
                    <label
                      key={item.value}
                      className={`cursor-pointer rounded-2xl border p-4 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta-strong ${form.listingKind === item.value ? "border-terracotta bg-terracotta/5" : "border-warm-gray/15 hover:border-terracotta/50"}`}
                    >
                      <input
                        className="sr-only"
                        type="radio"
                        name="listingKind"
                        value={item.value}
                        checked={form.listingKind === item.value}
                        onChange={() => chooseListingKind(item.value)}
                      />
                      <span className="block font-semibold text-warm-gray">
                        {item.label}
                      </span>
                      <span className="mt-1 block text-sm text-warm-gray/70">
                        {item.description}
                      </span>
                    </label>
                  ))}
                </div>
                {renderFieldError("listingKind")}
                {editing && !editNeedsOffer && !form.listingKind && (
                  <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    La clasificación anterior se conservará mientras no elijas
                    una de estas opciones.
                  </p>
                )}
              </fieldset>
              <fieldset
                id={fieldAnchorId("rentalMode")}
                tabIndex={-1}
                aria-describedby={
                  fieldErrors.rentalMode
                    ? `${fieldAnchorId("rentalMode")}-error`
                    : undefined
                }
              >
                <legend className="font-semibold text-warm-gray">
                  ¿Cómo se alquilará?
                </legend>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(["nightly", "monthly"] as const).map((mode) => (
                    <label
                      key={mode}
                      className={`flex min-h-12 cursor-pointer items-center rounded-xl border p-4 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta-strong ${activeMode === mode ? "border-terracotta bg-terracotta/5" : "border-warm-gray/15 hover:border-terracotta/50"}`}
                    >
                      <input
                        type="radio"
                        name="rentalMode"
                        value={mode}
                        checked={activeMode === mode}
                        onChange={() => requestRentalMode(mode)}
                      />
                      <span className="ml-2 font-semibold text-warm-gray">
                        {mode === "nightly" ? "Por día" : "Por mes"}
                      </span>
                    </label>
                  ))}
                </div>
                {renderFieldError("rentalMode")}
                {pendingRentalMode && activeMode && (
                  <div
                    className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4"
                    role="group"
                    aria-live="polite"
                    aria-labelledby={`${headingId}-mode-change-title`}
                    aria-describedby={`${headingId}-mode-change-description`}
                  >
                    <h3
                      id={`${headingId}-mode-change-title`}
                      className="font-bold text-amber-950"
                    >
                      ¿Cambiar modalidad?
                    </h3>
                    <p
                      id={`${headingId}-mode-change-description`}
                      className="mt-1 text-sm leading-6 text-amber-950"
                    >
                      Si continúas, se quitarán{" "}
                      {activeMode === "monthly"
                        ? "el precio mensual, el depósito, el plazo y la fecha de ingreso"
                        : "el precio por día, la limpieza, los límites de noches y el rango de disponibilidad"}
                      . No se convertirán a la otra modalidad.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => applyRentalMode(pendingRentalMode, true)}
                        className="min-h-11 rounded-xl bg-terracotta px-4 font-semibold text-[#231f1d] hover:bg-soft-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                      >
                        Cambiar a{" "}
                        {pendingRentalMode === "nightly"
                          ? "Por día"
                          : "Por mes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRentalMode(null)}
                        className="min-h-11 rounded-xl border border-warm-gray/20 bg-white px-4 font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                      >
                        Mantener modalidad
                      </button>
                    </div>
                  </div>
                )}
                {modeChangeNotice && (
                  <p
                    className="mt-3 text-sm text-warm-gray/75"
                    role="status"
                    aria-live="polite"
                  >
                    {modeChangeNotice}
                  </p>
                )}
              </fieldset>
              {form.listingKind && (
                <fieldset>
                  <legend className="text-sm font-semibold text-warm-gray">
                    ¿Está amoblado?
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-5">
                    {[true, false].map((value) => (
                      <label
                        key={String(value)}
                        className="flex min-h-11 items-center gap-2"
                      >
                        <input
                          type="radio"
                          name="isFurnished"
                          checked={form.offer.isFurnished === value}
                          onChange={() => updateOffer({ isFurnished: value })}
                        />
                        {value ? "Sí" : "No"}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-terracotta/20 bg-terracotta/5 p-4">
                <p className="text-sm leading-6 text-warm-gray">
                  <strong>
                    La dirección exacta será visible en el anuncio publicado.
                  </strong>{" "}
                  El piso o interior se mantendrán privados.
                </p>
              </div>
              <div
                id={fieldAnchorId("administrative")}
                tabIndex={-1}
                className="grid gap-3 md:grid-cols-3"
                aria-describedby={
                  fieldErrors.administrative
                    ? `${fieldAnchorId("administrative")}-error`
                    : undefined
                }
              >
                <label className="space-y-2">
                  <span className="text-sm font-semibold">Departamento</span>
                  <select
                    name="regionId"
                    value={regionId}
                    disabled={loadingInitial || loadingRegions}
                    aria-invalid={Boolean(fieldErrors.administrative)}
                    aria-describedby={
                      fieldErrors.administrative
                        ? `${fieldAnchorId("administrative")}-error`
                        : undefined
                    }
                    onChange={(event) => {
                      if (locationConfirmed)
                        setLocationConfirmationNotice(
                          "Cambiaste una división administrativa. Revisa la dirección y el pin, y vuelve a confirmar la ubicación.",
                        );
                      updateAddress({ locationConfirmed: false });
                      void setRegionId(event.target.value);
                    }}
                    className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    <option value="">Selecciona</option>
                    {regions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold">Provincia</span>
                  <select
                    name="cityId"
                    value={cityId}
                    disabled={!regionId || loadingCities}
                    aria-invalid={Boolean(fieldErrors.administrative)}
                    aria-describedby={
                      fieldErrors.administrative
                        ? `${fieldAnchorId("administrative")}-error`
                        : undefined
                    }
                    onChange={(event) => {
                      if (locationConfirmed)
                        setLocationConfirmationNotice(
                          "Cambiaste una división administrativa. Revisa la dirección y el pin, y vuelve a confirmar la ubicación.",
                        );
                      updateAddress({ locationConfirmed: false });
                      void setCityId(event.target.value);
                    }}
                    className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    <option value="">Selecciona</option>
                    {cities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-semibold">Distrito</span>
                  <select
                    name="districtId"
                    value={districtId}
                    disabled={!cityId || loadingDistricts}
                    aria-invalid={Boolean(fieldErrors.administrative)}
                    aria-describedby={
                      fieldErrors.administrative
                        ? `${fieldAnchorId("administrative")}-error`
                        : undefined
                    }
                    onChange={(event) => {
                      if (locationConfirmed)
                        setLocationConfirmationNotice(
                          "Cambiaste una división administrativa. Revisa la dirección y el pin, y vuelve a confirmar la ubicación.",
                        );
                      updateAddress({ locationConfirmed: false });
                      setDistrictId(event.target.value);
                    }}
                    className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    <option value="">Selecciona</option>
                    {districts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {renderFieldError("administrative")}
              <div id={fieldAnchorId("map")} tabIndex={-1}>
                <div tabIndex={-1}>
                  <HostAddressPicker
                    value={addressPickerValue}
                    confirmed={locationConfirmed}
                    line1Error={fieldErrors.line1}
                    mapError={fieldErrors.map}
                    administrativeContext={{
                      regionId,
                      cityId,
                      districtId,
                      region:
                        geo.regions.find((item) => item.id === regionId)
                          ?.name ?? null,
                      city:
                        geo.cities.find((item) => item.id === cityId)?.name ??
                        null,
                      district:
                        geo.districts.find((item) => item.id === districtId)
                          ?.name ?? null,
                    }}
                    onChange={(value) => {
                      const changed =
                        value.line1 !== form.listing.address.line1 ||
                        value.lat !== form.listing.address.lat ||
                        value.lng !== form.listing.address.lng;
                      if (locationConfirmed && changed)
                        setLocationConfirmationNotice(
                          "Cambiaste la dirección o el pin. Revisa el punto y vuelve a confirmar la ubicación.",
                        );
                      updateAddress(value);
                    }}
                    onConfirmedChange={(value) => {
                      if (value) setLocationConfirmationNotice(null);
                      else if (locationConfirmed)
                        setLocationConfirmationNotice(
                          "Cambiaste la dirección o el pin. Revisa el punto y vuelve a confirmar la ubicación.",
                        );
                      updateAddress({ locationConfirmed: value });
                    }}
                    onAdministrativeChange={async (selection) => {
                      if (locationConfirmed)
                        setLocationConfirmationNotice(
                          "Cambiaste una división administrativa. Revisa la dirección y el pin, y vuelve a confirmar la ubicación.",
                        );
                      updateAddress({ locationConfirmed: false });
                      await setSelection(selection);
                    }}
                  />
                </div>
              </div>
              {locationConfirmationNotice && (
                <p
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
                  role="status"
                  aria-live="polite"
                >
                  {locationConfirmationNotice}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-semibold">Título</span>
                <input
                  id={fieldAnchorId("title")}
                  name="title"
                  autoComplete="off"
                  value={form.listing.title}
                  maxLength={160}
                  aria-invalid={Boolean(fieldErrors.title)}
                  aria-describedby={
                    fieldErrors.title
                      ? `${fieldAnchorId("title")}-error`
                      : undefined
                  }
                  onChange={(event) =>
                    updateListing({ title: event.target.value })
                  }
                  className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  placeholder="Ej. Habitación luminosa cerca del parque…"
                />
                {renderFieldError("title")}
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-semibold">
                  Descripción del alojamiento
                </span>
                <textarea
                  id={fieldAnchorId("description")}
                  name="description"
                  value={form.listing.description}
                  maxLength={5000}
                  rows={5}
                  aria-invalid={Boolean(fieldErrors.description)}
                  aria-describedby={
                    fieldErrors.description
                      ? `${fieldAnchorId("description")}-error`
                      : undefined
                  }
                  onChange={(event) =>
                    updateListing({ description: event.target.value })
                  }
                  className="w-full rounded-xl border border-warm-gray/15 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  placeholder="Describe los espacios y lo que hace especial este alojamiento…"
                />
                {renderFieldError("description")}
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold">
                  Capacidad máxima (huéspedes)
                </span>
                <input
                  id={fieldAnchorId("maxGuests")}
                  name="maxGuests"
                  autoComplete="off"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={form.offer.maxGuests}
                  aria-invalid={Boolean(fieldErrors.maxGuests)}
                  aria-describedby={
                    fieldErrors.maxGuests
                      ? `${fieldAnchorId("maxGuests")}-error`
                      : undefined
                  }
                  onChange={(event) =>
                    updateOffer({ maxGuests: event.target.value })
                  }
                  className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
                {renderFieldError("maxGuests")}
              </label>
              {form.listingKind !== "room" && (
                <label className="space-y-2">
                  <span className="text-sm font-semibold">Dormitorios</span>
                  <input
                    id={fieldAnchorId("bedrooms")}
                    name="bedrooms"
                    autoComplete="off"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={form.offer.bedrooms}
                    aria-invalid={Boolean(fieldErrors.bedrooms)}
                    aria-describedby={
                      fieldErrors.bedrooms
                        ? `${fieldAnchorId("bedrooms")}-error`
                        : undefined
                    }
                    onChange={(event) =>
                      updateOffer({ bedrooms: event.target.value })
                    }
                    className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  />
                  {renderFieldError("bedrooms")}
                </label>
              )}
              <label className="space-y-2">
                <span className="text-sm font-semibold">Camas</span>
                <input
                  id={fieldAnchorId("beds")}
                  name="beds"
                  autoComplete="off"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={form.offer.beds}
                  aria-invalid={Boolean(fieldErrors.beds)}
                  aria-describedby={
                    fieldErrors.beds
                      ? `${fieldAnchorId("beds")}-error`
                      : undefined
                  }
                  onChange={(event) =>
                    updateOffer({ beds: event.target.value })
                  }
                  className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
                {renderFieldError("beds")}
              </label>
              <label className="space-y-2">
                <span className="text-sm font-semibold">Baños</span>
                <input
                  id={fieldAnchorId("bathrooms")}
                  name="bathrooms"
                  autoComplete="off"
                  type="number"
                  min="0.5"
                  max="100"
                  step="0.5"
                  value={form.offer.bathrooms}
                  aria-invalid={Boolean(fieldErrors.bathrooms)}
                  aria-describedby={
                    fieldErrors.bathrooms
                      ? `${fieldAnchorId("bathrooms")}-error`
                      : undefined
                  }
                  onChange={(event) =>
                    updateOffer({ bathrooms: event.target.value })
                  }
                  className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
                {renderFieldError("bathrooms")}
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <section
                aria-labelledby={`${headingId}-price-title`}
                className="space-y-4"
              >
                <div>
                  <h3
                    id={`${headingId}-price-title`}
                    className="font-semibold text-warm-gray"
                  >
                    Precio y condiciones
                  </h3>
                  <p className="mt-1 text-sm text-warm-gray/70">
                    Moneda: soles peruanos (PEN).
                  </p>
                </div>
                {!activeMode ? (
                  <p className="rounded-xl bg-cream p-4 text-sm">
                    Vuelve al paso 1 y elige Por día o Por mes.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold">
                        Precio por {activeMode === "monthly" ? "mes" : "día"}{" "}
                        (PEN)
                      </span>
                      <input
                        id={fieldAnchorId("rentAmount")}
                        name="rentAmount"
                        autoComplete="off"
                        type="number"
                        min="0.01"
                        step="0.01"
                        inputMode="decimal"
                        value={form.offer.pricing.rentAmount}
                        aria-invalid={Boolean(fieldErrors.rentAmount)}
                        aria-describedby={
                          fieldErrors.rentAmount
                            ? `${fieldAnchorId("rentAmount")}-error`
                            : undefined
                        }
                        onChange={(event) =>
                          updateOffer({
                            pricing: {
                              ...form.offer.pricing,
                              rentAmount: event.target.value,
                            },
                          })
                        }
                        className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                      />
                      {renderFieldError("rentAmount")}
                    </label>
                    {activeMode === "monthly" ? (
                      <>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold">
                            Depósito (PEN)
                          </span>
                          <input
                            id={fieldAnchorId("depositAmount")}
                            name="depositAmount"
                            autoComplete="off"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={form.offer.pricing.depositAmount}
                            aria-invalid={Boolean(fieldErrors.depositAmount)}
                            aria-describedby={
                              fieldErrors.depositAmount
                                ? `${fieldAnchorId("depositAmount")}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateOffer({
                                pricing: {
                                  ...form.offer.pricing,
                                  depositAmount: event.target.value,
                                },
                              })
                            }
                            className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                          />
                          <span className="text-xs text-warm-gray/70">
                            Se muestra aparte del precio mensual. Si no
                            solicitas depósito, indica 0.
                          </span>
                          {renderFieldError("depositAmount")}
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold">
                            Plazo mínimo (meses)
                          </span>
                          <input
                            id={fieldAnchorId("minTermMonths")}
                            name="minTermMonths"
                            autoComplete="off"
                            type="number"
                            min="1"
                            max="120"
                            value={form.offer.minTermMonths}
                            aria-invalid={Boolean(fieldErrors.minTermMonths)}
                            aria-describedby={
                              fieldErrors.minTermMonths
                                ? `${fieldAnchorId("minTermMonths")}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateOffer({ minTermMonths: event.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                          />
                          {renderFieldError("minTermMonths")}
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold">
                            Plazo máximo (meses, opcional)
                          </span>
                          <input
                            id={fieldAnchorId("maxTermMonths")}
                            name="maxTermMonths"
                            autoComplete="off"
                            type="number"
                            min="1"
                            max="120"
                            value={form.offer.maxTermMonths}
                            aria-invalid={Boolean(fieldErrors.maxTermMonths)}
                            aria-describedby={
                              fieldErrors.maxTermMonths
                                ? `${fieldAnchorId("maxTermMonths")}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateOffer({ maxTermMonths: event.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                          />
                          {renderFieldError("maxTermMonths")}
                        </label>
                      </>
                    ) : (
                      <>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold">
                            Cargo de limpieza (PEN, opcional)
                          </span>
                          <input
                            id={fieldAnchorId("cleaningFee")}
                            name="cleaningFee"
                            autoComplete="off"
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={form.offer.pricing.cleaningFee}
                            aria-invalid={Boolean(fieldErrors.cleaningFee)}
                            aria-describedby={
                              fieldErrors.cleaningFee
                                ? `${fieldAnchorId("cleaningFee")}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateOffer({
                                pricing: {
                                  ...form.offer.pricing,
                                  cleaningFee: event.target.value,
                                },
                              })
                            }
                            className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                          />
                          {renderFieldError("cleaningFee")}
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold">
                            Estadía mínima (noches)
                          </span>
                          <input
                            id={fieldAnchorId("minStayNights")}
                            name="minStayNights"
                            autoComplete="off"
                            type="number"
                            min="1"
                            max="365"
                            value={form.offer.minStayNights}
                            aria-invalid={Boolean(fieldErrors.minStayNights)}
                            aria-describedby={
                              fieldErrors.minStayNights
                                ? `${fieldAnchorId("minStayNights")}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateOffer({ minStayNights: event.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                          />
                          {renderFieldError("minStayNights")}
                        </label>
                        <label className="space-y-2">
                          <span className="text-sm font-semibold">
                            Estadía máxima (noches, opcional)
                          </span>
                          <input
                            id={fieldAnchorId("maxStayNights")}
                            name="maxStayNights"
                            autoComplete="off"
                            type="number"
                            min="1"
                            max="365"
                            value={form.offer.maxStayNights}
                            aria-invalid={Boolean(fieldErrors.maxStayNights)}
                            aria-describedby={
                              fieldErrors.maxStayNights
                                ? `${fieldAnchorId("maxStayNights")}-error`
                                : undefined
                            }
                            onChange={(event) =>
                              updateOffer({ maxStayNights: event.target.value })
                            }
                            className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                          />
                          {renderFieldError("maxStayNights")}
                        </label>
                      </>
                    )}
                  </div>
                )}
              </section>
              <section
                aria-labelledby={`${headingId}-availability-title`}
                className="space-y-3 border-t border-warm-gray/10 pt-5"
              >
                <div>
                  <h3
                    id={`${headingId}-availability-title`}
                    className="font-semibold text-warm-gray"
                  >
                    Disponibilidad{" "}
                    <span className="font-normal text-warm-gray/65">
                      (opcional)
                    </span>
                  </h3>
                  <p className="mt-1 text-sm text-warm-gray/70">
                    Puedes dejarla sin especificar y gestionarla después desde
                    el anuncio.
                  </p>
                </div>
                {activeMode === "nightly" ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold">
                        Disponible desde
                      </span>
                      <input
                        id={fieldAnchorId("startDate")}
                        name="startDate"
                        autoComplete="off"
                        type="date"
                        value={form.availability.startDate}
                        onChange={(event) =>
                          updateAvailability({ startDate: event.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                      />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold">
                        Disponible hasta
                      </span>
                      <input
                        id={fieldAnchorId("endDate")}
                        name="endDate"
                        autoComplete="off"
                        type="date"
                        min={form.availability.startDate || undefined}
                        value={form.availability.endDate}
                        aria-invalid={Boolean(fieldErrors.endDate)}
                        aria-describedby={
                          fieldErrors.endDate
                            ? `${fieldAnchorId("endDate")}-error`
                            : undefined
                        }
                        onChange={(event) =>
                          updateAvailability({ endDate: event.target.value })
                        }
                        className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                      />
                      {renderFieldError("endDate")}
                    </label>
                  </div>
                ) : activeMode === "monthly" ? (
                  <label className="block max-w-md space-y-2">
                    <span className="text-sm font-semibold">
                      Disponible desde
                    </span>
                    <input
                      id={fieldAnchorId("availableFrom")}
                      name="availableFrom"
                      autoComplete="off"
                      type="date"
                      value={form.availability.availableFrom}
                      onChange={(event) =>
                        updateAvailability({
                          availableFrom: event.target.value,
                        })
                      }
                      className="h-11 w-full rounded-xl border border-warm-gray/15 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                    />
                  </label>
                ) : (
                  <p className="text-sm text-warm-gray/65">
                    Elige una modalidad para indicar disponibilidad.
                  </p>
                )}
              </section>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <section aria-labelledby={`${headingId}-amenities-title`}>
                <h3
                  id={`${headingId}-amenities-title`}
                  className="font-semibold text-warm-gray"
                >
                  Lo que ofrece el alojamiento
                </h3>
                {amenitiesError ? (
                  <p
                    role="alert"
                    className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                  >
                    {amenitiesError}
                  </p>
                ) : amenities.length === 0 ? (
                  <p className="mt-3 text-sm text-warm-gray/70" role="status">
                    No hay comodidades disponibles para seleccionar.
                  </p>
                ) : (
                  <div className="mt-4 space-y-5">
                    {Object.entries(amenitiesByCategory).map(
                      ([category, items]) => (
                        <fieldset key={category}>
                          <legend className="mb-2 text-sm font-semibold text-warm-gray">
                            {amenityCategoryLabels[category] ??
                              "Otras comodidades"}
                          </legend>
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {items.map((item) => (
                              <label
                                key={item.id}
                                className="flex min-h-11 items-center gap-3 rounded-xl border border-warm-gray/15 p-3 text-sm hover:bg-cream/60"
                              >
                                <input
                                  type="checkbox"
                                  name="amenityIds"
                                  value={item.id}
                                  checked={form.offer.amenityIds.includes(
                                    item.id,
                                  )}
                                  onChange={() => toggleAmenity(item.id)}
                                />
                                {item.name}
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      ),
                    )}
                  </div>
                )}
              </section>
              <section
                aria-labelledby={`${headingId}-rules-title`}
                className="border-t border-warm-gray/10 pt-5"
              >
                <h3
                  id={`${headingId}-rules-title`}
                  className="font-semibold text-warm-gray"
                >
                  Reglas para quien se hospede
                </h3>
                <fieldset className="mt-3 grid gap-3 sm:grid-cols-3">
                  <legend className="sr-only">Reglas principales</legend>
                  {(
                    [
                      ["Se aceptan mascotas", "petsAllowed"],
                      ["Se permite fumar", "smokingAllowed"],
                      ["Se permiten fiestas", "partiesAllowed"],
                    ] as const
                  ).map(([label, key]) => (
                    <label
                      key={key}
                      className="flex min-h-11 items-center gap-2 rounded-xl border border-warm-gray/15 p-3 text-sm font-semibold"
                    >
                      <input
                        type="checkbox"
                        name={key}
                        checked={form.offer[key]}
                        onChange={(event) =>
                          updateOffer({ [key]: event.target.checked } as any)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <label className="mt-4 block space-y-2">
                  <span className="text-sm font-semibold">
                    Otras reglas (opcional)
                  </span>
                  <textarea
                    name="houseRules"
                    maxLength={3000}
                    rows={4}
                    value={form.offer.houseRules}
                    onChange={(event) =>
                      updateOffer({ houseRules: event.target.value })
                    }
                    className="w-full rounded-xl border border-warm-gray/15 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                    placeholder="Ej. Horario de silencio o visitas…"
                  />
                </label>
              </section>
            </div>
          )}

          {step === 5 &&
            (editing && !editNeedsOffer ? (
              <section className="rounded-2xl border border-warm-gray/15 p-5">
                <h3 className="text-lg font-bold text-warm-gray">
                  Fotos del alojamiento
                </h3>
                <p className="mt-2 text-sm leading-6 text-warm-gray/70">
                  La galería y su portada se administran desde el anuncio.
                </p>
                <a
                  href={`/host/anuncios/${encodeURIComponent(listing.id)}/fotos`}
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-terracotta px-4 font-semibold text-[#231f1d] hover:bg-soft-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  Administrar fotos
                </a>
              </section>
            ) : (
              <section
                id={fieldAnchorId("photos")}
                tabIndex={-1}
                aria-describedby={
                  fieldErrors.photos
                    ? `${fieldAnchorId("photos")}-error`
                    : undefined
                }
              >
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-sm leading-6 text-warm-gray/75">
                      JPG, PNG o WEBP · hasta 8 MB por foto.
                    </p>
                    <p className="mt-1 text-xs text-warm-gray/65">
                      La primera foto será la portada. Puedes ordenar con los
                      botones o arrastrar.
                    </p>
                  </div>
                  <p
                    className="rounded-full bg-cream px-3 py-2 text-sm font-semibold"
                    aria-live="polite"
                  >
                    {photos.length} de {MAX_PHOTOS} fotos
                  </p>
                </div>
                <label
                  htmlFor={fileInputId}
                  className="mt-4 flex min-h-28 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-terracotta/35 bg-cream/60 p-5 text-center font-semibold text-warm-gray hover:border-terracotta focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta-strong"
                >
                  Seleccionar fotos
                  <input
                    id={fileInputId}
                    name="photos"
                    className="sr-only"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      addPhotos(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {renderFieldError("photos")}
                {photos.length > 0 && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {photos.map((photo, index) => (
                      <figure
                        key={photo.id}
                        draggable={!saving}
                        onDragStart={() => setDraggedId(photo.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggedId) return;
                          const from = photos.findIndex(
                            (item) => item.id === draggedId,
                          );
                          const to = photos.findIndex(
                            (item) => item.id === photo.id,
                          );
                          if (from < 0 || to < 0 || from === to) return;
                          markDirty();
                          setPhotos((current) => {
                            const result = [...current];
                            const [moved] = result.splice(from, 1);
                            result.splice(to, 0, moved);
                            return result;
                          });
                          setDraggedId(null);
                        }}
                        className="select-none overflow-hidden rounded-2xl border border-warm-gray/15"
                      >
                        <img
                          src={photo.previewUrl}
                          alt={`Foto ${index + 1} del alojamiento`}
                          width="480"
                          height="360"
                          className="h-40 w-full object-cover"
                        />{" "}
                        <figcaption className="space-y-3 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <strong className="block">
                                {index === 0 ? "Portada" : `Foto ${index + 1}`}
                              </strong>
                              <span
                                className={`mt-1 block text-sm ${photo.status === "error" ? "text-red-800" : "text-warm-gray/70"}`}
                                role={
                                  photo.status === "error" ? "alert" : "status"
                                }
                                aria-live={
                                  photo.status === "error"
                                    ? "assertive"
                                    : "polite"
                                }
                              >
                                {photo.status === "uploaded"
                                  ? "Cargada"
                                  : photo.status === "uploading"
                                    ? "Subiendo…"
                                    : photo.status === "error"
                                      ? (photo.error ?? "No se pudo cargar")
                                      : "Pendiente de carga"}
                              </span>
                              {photo.status === "uploading" && (
                                <div className="mt-2 flex items-center gap-2">
                                  <progress
                                    aria-label={`Carga de la foto ${index + 1}`}
                                    className="h-2 min-w-0 flex-1 accent-terracotta"
                                    max={100}
                                    value={photo.progress ?? 0}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className="text-xs tabular-nums text-warm-gray/70"
                                  >
                                    {photo.progress ?? 0}%
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void removePhoto(photo)}
                              className="min-h-10 rounded-lg px-2 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-50"
                            >
                              Quitar
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={saving || index === 0}
                              onClick={() => movePhoto(index, -1)}
                              aria-label={`Mover foto ${index + 1} antes`}
                              className="min-h-11 rounded-lg border border-warm-gray/20 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-40"
                            >
                              Mover antes
                            </button>
                            <button
                              type="button"
                              disabled={saving || index === photos.length - 1}
                              onClick={() => movePhoto(index, 1)}
                              aria-label={`Mover foto ${index + 1} después`}
                              className="min-h-11 rounded-lg border border-warm-gray/20 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-40"
                            >
                              Mover después
                            </button>
                          </div>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
              </section>
            ))}

          {step === 6 && (
            <section
              aria-label="Vista previa y revisión del anuncio"
              className="space-y-6"
            >
              <section
                aria-labelledby={`${headingId}-preview-title`}
                className="space-y-4"
              >
                <h3
                  id={`${headingId}-preview-title`}
                  className="text-lg font-bold text-warm-gray"
                >
                  Así se verá tu anuncio
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <section className="rounded-2xl bg-cream p-4">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Tipo y modalidad
                    </h4>
                    <p className="mt-1 font-semibold">{selectedKindLabel}</p>
                    <p className="mt-1 text-sm">
                      {activeMode === "monthly"
                        ? "Por mes"
                        : activeMode === "nightly"
                          ? "Por día"
                          : "Modalidad pendiente"}
                      {form.offer.isFurnished ? " · Amoblado" : ""}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-cream p-4">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Precio y condiciones
                    </h4>
                    <p className="mt-1 text-xl font-bold">
                      {formatPEN(form.offer.pricing.rentAmount)} por{" "}
                      {activeMode === "monthly" ? "mes" : "día"}
                    </p>
                    {activeMode === "monthly" ? (
                      <>
                        <p className="mt-1 text-sm">
                          Depósito:{" "}
                          {formatPEN(form.offer.pricing.depositAmount)}
                        </p>
                        <p className="mt-1 text-sm">
                          Plazo: {form.offer.minTermMonths} meses mínimo
                          {form.offer.maxTermMonths
                            ? ` · ${form.offer.maxTermMonths} meses máximo`
                            : ""}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm">
                          Cargo de limpieza:{" "}
                          {form.offer.pricing.cleaningFee
                            ? formatPEN(form.offer.pricing.cleaningFee)
                            : "No especificado"}
                        </p>
                        <p className="mt-1 text-sm">
                          Estadía: {form.offer.minStayNights} noches mínimo
                          {form.offer.maxStayNights
                            ? ` · ${form.offer.maxStayNights} noches máximo`
                            : ""}
                        </p>
                      </>
                    )}
                  </section>
                  <section className="rounded-2xl bg-cream p-4">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Ubicación pública
                    </h4>
                    <p className="mt-1 font-semibold">
                      {form.listing.address.line1 || "Dirección pendiente"}
                    </p>
                    <p className="mt-1 text-sm">
                      {[
                        districts.find((item) => item.id === districtId)?.name,
                        cities.find((item) => item.id === cityId)?.name,
                        regions.find((item) => item.id === regionId)?.name,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="mt-2 text-xs text-warm-gray/70">
                      La dirección exacta y el pin serán públicos. El piso o
                      interior no se mostrarán.
                    </p>
                  </section>
                  <section className="rounded-2xl bg-cream p-4">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Título y descripción
                    </h4>
                    <p className="mt-1 font-semibold">
                      {form.listing.title || "Título pendiente"}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6">
                      {form.listing.description || "Descripción pendiente"}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-cream p-4">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Capacidad
                    </h4>
                    <p className="mt-1 text-sm">
                      Hasta {form.offer.maxGuests || "—"} huéspedes ·{" "}
                      {form.offer.beds || "—"} camas ·{" "}
                      {form.offer.bathrooms || "—"} baños
                      {form.listingKind !== "room"
                        ? ` · ${form.offer.bedrooms || "—"} dormitorios`
                        : ""}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-cream p-4">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Disponibilidad
                    </h4>
                    <p className="mt-1 text-sm">
                      {activeMode === "nightly"
                        ? form.availability.startDate &&
                          form.availability.endDate
                          ? `${form.availability.startDate} al ${form.availability.endDate}`
                          : "No especificada"
                        : form.availability.availableFrom
                          ? `Disponible desde ${form.availability.availableFrom}`
                          : "No especificada"}
                    </p>
                  </section>
                  <section className="rounded-2xl bg-cream p-4 sm:col-span-2">
                    <h4 className="text-sm font-semibold text-warm-gray/70">
                      Comodidades y reglas
                    </h4>
                    <p className="mt-1 text-sm">
                      {form.offer.amenityIds.length
                        ? amenities
                            .filter((item) =>
                              form.offer.amenityIds.includes(item.id),
                            )
                            .map((item) => item.name)
                            .join(", ")
                        : "Sin comodidades seleccionadas"}
                    </p>
                    <p className="mt-2 text-sm">
                      {[
                        form.offer.petsAllowed
                          ? "Acepta mascotas"
                          : "No acepta mascotas",
                        form.offer.smokingAllowed
                          ? "Permite fumar"
                          : "No permite fumar",
                        form.offer.partiesAllowed
                          ? "Permite fiestas"
                          : "No permite fiestas",
                      ].join(" · ")}
                    </p>
                    {form.offer.houseRules.trim() && (
                      <p className="mt-2 whitespace-pre-line text-sm">
                        {form.offer.houseRules}
                      </p>
                    )}
                  </section>
                </div>
                {photos.length > 0 && (
                  <section aria-label="Fotos del anuncio">
                    <h4 className="mb-2 text-sm font-semibold text-warm-gray/70">
                      Fotos y portada
                    </h4>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {photos.map((photo, index) => (
                        <figure
                          key={photo.id}
                          className="overflow-hidden rounded-xl border border-warm-gray/10"
                        >
                          <img
                            src={photo.previewUrl}
                            alt={
                              index === 0
                                ? "Portada del alojamiento"
                                : `Foto ${index + 1} del alojamiento`
                            }
                            width="480"
                            height="360"
                            className="h-28 w-full object-cover"
                          />
                          {index === 0 && (
                            <figcaption className="px-2 py-1 text-xs font-semibold">
                              Portada
                            </figcaption>
                          )}
                        </figure>
                      ))}
                    </div>
                  </section>
                )}
              </section>
              <section
                id={checklistId}
                aria-labelledby={`${headingId}-requirements-title`}
                className="rounded-2xl border border-warm-gray/15 p-4"
                aria-live="polite"
              >
                <h3
                  id={`${headingId}-requirements-title`}
                  className="font-bold text-warm-gray"
                >
                  Requisitos para publicar
                </h3>
                <ul className="mt-3 divide-y divide-warm-gray/10">
                  {publicationChecklist.map((item) => (
                    <li
                      key={item.label}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className={
                            item.met
                              ? "font-bold text-emerald-700"
                              : "font-bold text-red-700"
                          }
                        >
                          {item.met ? "✓" : "!"}
                        </span>
                        {item.label}
                        <span
                          className={`font-semibold ${item.met ? "text-emerald-700" : "text-red-700"}`}
                        >
                          {item.met ? "Listo" : "Pendiente"}
                        </span>
                      </span>
                      {!item.met && (
                        <button
                          type="button"
                          onClick={() => {
                            clearFeedback();
                            setStep(item.step);
                          }}
                          aria-label={`Completar: ${item.label}`}
                          className="min-h-10 rounded-lg px-3 font-semibold text-terracotta-strong underline underline-offset-2 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                        >
                          Completar
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <section
                aria-labelledby={`${headingId}-recommendations-title`}
                className="rounded-2xl border border-warm-gray/15 bg-cream/50 p-4"
              >
                <h3
                  id={`${headingId}-recommendations-title`}
                  className="font-bold text-warm-gray"
                >
                  Recomendaciones{" "}
                  <span className="font-normal text-warm-gray/65">
                    (no bloquean la publicación)
                  </span>
                </h3>
                <ul className="mt-2 space-y-1">
                  {recommendations.map((item) => (
                    <li
                      key={item.label}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>{item.label}</span>
                      {!item.met && (
                        <button
                          type="button"
                          onClick={() => {
                            clearFeedback();
                            setStep(item.step);
                          }}
                          className="min-h-10 px-2 font-semibold text-terracotta-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                        >
                          Ver paso
                        </button>
                      )}
                      {item.met && (
                        <span className="font-semibold text-emerald-700">
                          Listo
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              {editing && (
                <div className="flex flex-wrap gap-3">
                  <a
                    href={`/host/anuncios/${encodeURIComponent(listing.id)}/fotos`}
                    className="min-h-11 rounded-xl border border-warm-gray/20 px-4 py-2 text-sm font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    Fotos
                  </a>
                  {listing.offerCount === 1 && (
                    <a
                      href={`/host/anuncios/${encodeURIComponent(listing.id)}/disponibilidad`}
                      className="min-h-11 rounded-xl border border-warm-gray/20 px-4 py-2 text-sm font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                    >
                      Disponibilidad
                    </a>
                  )}
                  <a
                    href={
                      listing.listingStatus === "published" &&
                      !listing.visibilityIssue
                        ? `/listings/${encodeURIComponent(listing.id)}`
                        : `/host/anuncios/${encodeURIComponent(listing.id)}/vista-previa`
                    }
                    className="min-h-11 rounded-xl border border-warm-gray/20 px-4 py-2 text-sm font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    {listing.listingStatus === "published" &&
                    !listing.visibilityIssue
                      ? "Vista pública"
                      : "Vista previa"}
                  </a>
                </div>
              )}
            </section>
          )}
        </div>
      </fieldset>

      {progress && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl bg-terracotta/5 px-4 py-3 text-sm font-semibold"
        >
          {progress}
        </p>
      )}
      {success && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {success}
        </p>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              clearFeedback();
              setStep((current) => Math.max(0, current - 1));
            }}
            disabled={step === 0 || saving}
            className="min-h-11 rounded-xl border border-warm-gray/15 px-4 font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:invisible"
          >
            Anterior
          </button>
          {(!editing || editNeedsOffer) && (
            <button
              type="button"
              onClick={() => void save(step, true)}
              disabled={saving || !draftKey}
              className="min-h-11 rounded-xl border border-warm-gray/15 px-4 font-semibold hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              Guardar borrador y salir
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={saving}
          aria-describedby={step === 6 ? checklistId : undefined}
          className="min-h-11 rounded-xl bg-terracotta px-5 font-semibold text-[#231f1d] hover:bg-soft-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? "Guardando…"
            : step === 6
              ? editing && !editNeedsOffer
                ? "Guardar cambios"
                : "Publicar anuncio"
              : "Guardar y continuar"}
        </button>
      </div>
    </form>
  );
}
