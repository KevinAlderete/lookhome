import { apiServer } from "@/lib/api/server";
import type { BookingReviewStatus } from "../types";

export function getMyBookingReviewStatus(
  request: Request,
  bookingId: string,
  accessToken?: string,
) {
  return apiServer<BookingReviewStatus>(
    request,
    `/reviews/booking/${encodeURIComponent(bookingId)}/me`,
    { accessToken },
  );
}
