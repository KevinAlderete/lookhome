import type { Prisma } from "../generated/prisma/client";

export const PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES = [
  "accepted",
  "active",
  "disputed",
] as const;

export function roomsWithoutBlockingBookings() {
  return {
    none: {
      bookings: {
        some: {
          status: { in: [...PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES] },
        },
      },
    },
  } satisfies NonNullable<Prisma.ListingWhereInput["rooms"]>;
}

export function listingWithoutBlockingBookings(): Prisma.ListingWhereInput {
  return {
    rooms: roomsWithoutBlockingBookings(),
  };
}
