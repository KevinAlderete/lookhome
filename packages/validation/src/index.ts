import { z } from "zod";

export const propertyTypeSchema = z.enum([
  "house",
  "apartment",
  "building",
  "shared_house",
  "other",
]);
export const offerTypeSchema = z.enum([
  "entire_place",
  "private_room",
  "shared_bed",
]);
export const unitTypeSchema = offerTypeSchema;
export const rentalModeSchema = z.enum(["nightly", "monthly"]);

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const listingDraftSchema = z
  .object({
    listing: z.object({
      title: z.string().trim().min(1).max(160),
      description: z.string().trim().min(1).max(5000),
      propertyType: propertyTypeSchema,
      address: z.object({
        countryCode: z.literal("PE"),
        regionId: z.string().uuid(),
        cityId: z.string().uuid(),
        districtId: z.string().uuid(),
        line1: z.string().trim().min(1).max(300),
        line2: z.string().trim().max(300).optional(),
        postalCode: z.string().trim().max(20).optional(),
        lat: z.number().min(-18.5).max(0.1),
        lng: z.number().min(-81.5).max(-68.5),
        precision: z.literal("exact"),
      }),
    }),
    offer: z.object({
      description: z.string().trim().max(5000).optional(),
      offerType: offerTypeSchema,
      isFurnished: z.boolean(),
      maxGuests: z.number().int().min(1).max(100),
      bedrooms: z.number().int().min(0).max(100),
      beds: z.number().int().min(1).max(100),
      bathrooms: z.number().min(0.5).max(100),
      pricing: z.object({
        currencyCode: z.literal("PEN"),
        rentAmount: z.number().positive(),
        depositAmount: z.number().nonnegative(),
        cleaningFee: z.number().nonnegative().optional(),
        rentalMode: rentalModeSchema,
      }),
      minStayNights: z.number().int().min(1).max(365).optional(),
      maxStayNights: z.number().int().min(1).max(365).optional(),
      minTermMonths: z.number().int().min(1).max(120).optional(),
      maxTermMonths: z.number().int().min(1).max(120).optional(),
      amenityIds: z.array(z.string().uuid()).max(100),
      houseRules: z.string().trim().max(3000).optional(),
      petsAllowed: z.boolean(),
      smokingAllowed: z.boolean(),
      partiesAllowed: z.boolean(),
    }),
    availability: z
      .object({
        startDate: dateSchema.optional(),
        endDate: dateSchema.optional(),
        availableFrom: dateSchema.optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.offer.pricing.rentalMode === "nightly") {
      const hasStart = Boolean(value.availability?.startDate);
      const hasEnd = Boolean(value.availability?.endDate);
      if (hasStart !== hasEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["availability"],
          message: "Envía ambas fechas del rango nocturno o ninguna",
        });
      } else if (
        value.availability?.startDate &&
        value.availability.endDate &&
        value.availability.startDate >= value.availability.endDate
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["availability", "endDate"],
          message: "La fecha final debe ser posterior",
        });
      }
      if (
        (value.offer.minStayNights ?? 1) >
        (value.offer.maxStayNights ?? Number.MAX_SAFE_INTEGER)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["offer", "maxStayNights"],
          message: "La estadía máxima es inválida",
        });
      }
      if (value.offer.pricing.depositAmount > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["offer", "pricing", "depositAmount"],
          message: "El depósito solo aplica al alquiler mensual",
        });
      }
    } else {
      if (
        (value.offer.minTermMonths ?? 1) >
        (value.offer.maxTermMonths ?? Number.MAX_SAFE_INTEGER)
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["offer", "maxTermMonths"],
          message: "El plazo máximo es inválido",
        });
      }
      if ((value.offer.pricing.cleaningFee ?? 0) > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["offer", "pricing", "cleaningFee"],
          message: "El cargo de limpieza solo aplica al alquiler nocturno",
        });
      }
    }
  });

export type ListingDraft = z.infer<typeof listingDraftSchema>;
export type PropertyType = z.infer<typeof propertyTypeSchema>;
export type OfferType = z.infer<typeof offerTypeSchema>;
export type UnitType = OfferType;
export type RentalMode = z.infer<typeof rentalModeSchema>;
