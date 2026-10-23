export type BookingRow = {
  id: string;
  guestName: string;
  hostName?: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  startsAt: string | null;
  guests: number;
  estimatedAmount: string;
  rentAmount?: string | null;
  status: string;
  rentalMode?: "nightly" | "monthly" | null;
  durationLabel?: string | null;
  depositAmount?: string | null;
  cleaningFee?: string | null;
};

export type BookingSummary = {
  total: number;
  approved: number;
  pending: number;
  completed: number;
};
