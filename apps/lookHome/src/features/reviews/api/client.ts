import type {
  BookingReview,
  BookingReviewStatus,
  CreateReviewPayload,
} from "../types";

async function readResponse<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.assign(`/login?redirect=${encodeURIComponent(returnTo)}`);
    }
    throw new Error(data?.message || fallback);
  }
  return data as T;
}

export async function getMyBookingReviewStatusRequest(bookingId: string) {
  const response = await fetch(
    `/api/reviews/booking/${encodeURIComponent(bookingId)}/me`,
    { credentials: "include", cache: "no-store" },
  );
  return readResponse<BookingReviewStatus>(
    response,
    "No se pudo consultar el estado de la reseña.",
  );
}

export async function createReviewRequest(
  payload: CreateReviewPayload,
): Promise<{ message: string; review: BookingReview }> {
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      ...payload,
      comment: payload.comment?.trim() || undefined,
    }),
  });
  return readResponse(response, "No se pudo enviar la reseña.");
}
