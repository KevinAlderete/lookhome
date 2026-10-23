import { apiServer } from "@/lib/api/server";
import { resolveRentalMode } from "@/features/host/rooms/pricing";
import type { BookingRow, BookingSummary } from "../types";

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find(
    (value) => value !== undefined && value !== null && value !== "",
  );
}

function formatDate(value: unknown) {
  if (!value) return "—";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
}

export function formatBookingAmount(value: unknown, currencyCode: unknown): string {
  if (value == null || !currencyCode || !Number.isFinite(Number(value))) return "—";
  const code = String(currencyCode);
  return `${code === "PEN" ? "S/" : code} ${new Intl.NumberFormat("es-PE", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value))}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBooking(raw: any): BookingRow {
  const guestName =
    firstDefined(
      raw.tenant?.profile?.displayName,
      raw.guestName,
      raw.tenantName,
    ) ?? "Huésped";

  const propertyTitle =
    firstDefined(
      raw.room?.listing?.title,
      raw.room?.title,
      raw.propertyTitle,
      raw.listingTitle,
      raw.roomTitle,
    ) ?? "Propiedad";

  const snapshotAmount = raw.pricingSnapshot?.totalAmount;
  const currencyCode = raw.pricingSnapshot?.currencyCode;
  const estimatedAmount = formatBookingAmount(snapshotAmount, currencyCode);
  const startDate = firstDefined(raw.startDate, raw.checkIn, raw.from);
  const rentalMode = resolveRentalMode({
    rentalMode: firstDefined(raw.rentalMode, raw.pricingSnapshot?.rentalMode),
    billingPeriod: raw.pricingSnapshot?.billingPeriod,
  });
  const quantity = Number(
    firstDefined(raw.pricingSnapshot?.billingQuantity, raw.termMonths),
  );
  const durationLabel =
    Number.isInteger(quantity) && quantity > 0 && rentalMode
      ? `${quantity} ${rentalMode === "monthly" ? "meses" : "noches"}`
      : null;
  const depositValue = raw.pricingSnapshot?.depositAmount;
  const cleaningFeeValue = raw.pricingSnapshot?.cleaningFee;

  return {
    id: String(firstDefined(raw.id, raw.bookingId) ?? crypto.randomUUID()),
    guestName,
    hostName: String(raw.host?.profile?.displayName || "Anfitrión"),
    propertyTitle,
    checkIn: formatDate(startDate),
    checkOut: formatDate(firstDefined(raw.endDate, raw.checkOut, raw.to)),
    startsAt: startDate ? String(startDate) : null,
    guests: toNumber(
      firstDefined(raw.guestCount, raw.guests, raw.totalGuests) ?? 1,
    ),
    estimatedAmount,
    rentAmount: raw.pricingSnapshot?.rentAmount != null && rentalMode && currencyCode
      ? `${formatBookingAmount(raw.pricingSnapshot.rentAmount, currencyCode)} por ${rentalMode === "monthly" ? "mes" : rentalMode === "nightly" ? "noche" : "período"}`
      : null,
    status: String(firstDefined(raw.status, raw.bookingStatus) ?? "requested"),
    rentalMode,
    durationLabel,
    depositAmount:
      depositValue != null && Number(depositValue) > 0
        ? formatBookingAmount(depositValue, currencyCode)
        : null,
    cleaningFee:
      cleaningFeeValue != null && Number(cleaningFeeValue) > 0
        ? formatBookingAmount(cleaningFeeValue, currencyCode)
        : null,
  };
}

export async function getBookings(request: Request): Promise<BookingRow[]> {
  const payload = await apiServer<any>(request, "/bookings");

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.rows)
        ? payload.rows
        : [];

  return rows.map(normalizeBooking);
}

export async function getHostBookings(
  request: Request,
  accessToken?: string,
): Promise<BookingRow[]> {
  const payload = await apiServer<any>(request, "/bookings/host/me", { accessToken });
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : null;
  if (!rows) {
    throw new Error("La API no devolvió la lista de solicitudes del anfitrión.");
  }
  return rows.map(normalizeBooking);
}

export async function getMyBookings(
  request: Request,
  accessToken?: string,
): Promise<BookingRow[]> {
  const payload = await apiServer<any>(request, "/bookings/me", { accessToken });
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : null;
  if (!rows) {
    throw new Error("La API no devolvió la lista de solicitudes del huésped.");
  }
  return rows.map(normalizeBooking);
}

export async function getBookingById(request: Request, id: string) {
  return apiServer<any>(request, `/bookings/${encodeURIComponent(id)}`);
}

export async function getHostBookingById(
  request: Request,
  id: string,
  accessToken?: string,
) {
  return apiServer<any>(request, `/bookings/host/me/${encodeURIComponent(id)}`, {
    accessToken,
  });
}

export async function getMyBookingById(
  request: Request,
  id: string,
  accessToken?: string,
) {
  return apiServer<any>(request, `/bookings/me/${encodeURIComponent(id)}`, {
    accessToken,
  });
}

export function summarizeBookings(rows: BookingRow[]): BookingSummary {
  let approved = 0;
  let pending = 0;
  let completed = 0;

  for (const row of rows) {
    const status = row.status.toUpperCase();
    if (status === "ACCEPTED" || status === "CONFIRMED" || status === "ACTIVE") {
      approved += 1;
    } else if (status === "REQUESTED" || status === "PENDING") {
      pending += 1;
    } else if (status === "COMPLETED") {
      completed += 1;
    }
  }

  return {
    total: rows.length,
    approved,
    pending,
    completed,
  };
}
