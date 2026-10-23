export type BookingStatusMeta = {
  label: string;
  tone: "positive" | "warning" | "danger" | "neutral";
};

export function bookingStatusMeta(status: string): BookingStatusMeta {
  switch (status.trim().toLowerCase()) {
    case "requested":
    case "pending":
      return { label: "Pendiente", tone: "warning" };
    case "accepted":
    case "confirmed":
      return { label: "Aprobada", tone: "positive" };
    case "paid":
    case "refunded":
      return { label: "Estado histórico", tone: "neutral" };
    case "active":
      return { label: "En curso", tone: "positive" };
    case "completed":
      return { label: "Completada", tone: "positive" };
    case "rejected":
      return { label: "Rechazada", tone: "danger" };
    case "cancelled":
    case "canceled":
      return { label: "Cancelada", tone: "danger" };
    case "disputed":
      return { label: "En revisión", tone: "warning" };
    default:
      return { label: status || "Sin estado", tone: "neutral" };
  }
}
