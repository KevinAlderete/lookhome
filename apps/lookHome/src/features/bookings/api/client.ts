export type CreateBookingPayload = {
  roomId: string;
  startDate: string;
  endDate?: string;
  termMonths?: number;
  guestCount?: number;
  message?: string;
};

export async function createBookingRequest(payload: CreateBookingPayload) {
  const response = await fetch("/api/bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo enviar la solicitud.");
  }

  if (
    typeof data?.booking?.id !== "string" ||
    data.booking.status !== "requested"
  ) {
    throw new Error(
      "No se pudo confirmar el envío. Revisa Mis solicitudes antes de volver a intentarlo.",
    );
  }

  return data;
}

export async function updateBookingStatusRequest(
  bookingId: string,
  status: string,
) {
  const response = await fetch(
    `/api/bookings/${encodeURIComponent(bookingId)}/status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ status }),
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo actualizar la reserva.");
  }

  return data;
}

export async function startBookingRequest(bookingId: string) {
  const response = await fetch(
    `/api/bookings/${encodeURIComponent(bookingId)}/start`,
    {
      method: "PATCH",
      credentials: "include",
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo confirmar el inicio.");
  }

  return data;
}
