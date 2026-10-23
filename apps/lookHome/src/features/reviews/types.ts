export type BookingReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
};

export type BookingReviewStatus = {
  bookingId: string;
  revieweeUserId: string;
  canReview: boolean;
  reason: "already_reviewed" | "booking_not_reviewable" | null;
  review: BookingReview | null;
};

export type CreateReviewPayload = {
  bookingId: string;
  revieweeUserId: string;
  rating: number;
  comment?: string;
};
