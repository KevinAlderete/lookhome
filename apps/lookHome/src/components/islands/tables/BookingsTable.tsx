import { bookingStatusMeta } from "@/features/bookings/status";

type BookingRow = {
  id: string;
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  estimatedAmount: string;
  status: string;
  rentalMode?: "nightly" | "monthly" | null;
  durationLabel?: string | null;
  depositAmount?: string | null;
  cleaningFee?: string | null;
};

type BookingsTableProps = {
  rows: BookingRow[];
  emptyText?: string;
  detailBase?: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function BookingsTable({
  rows,
  emptyText = "No hay solicitudes para mostrar.",
  detailBase = "/reservas",
}: BookingsTableProps) {
  if (!rows.length) {
    return <div className="host-empty-state">{emptyText}</div>;
  }

  return (
    <section
      className="host-bookings-list"
      aria-label="Solicitudes de alquiler"
    >
      <div className="host-bookings-summary">
        <strong>
          {rows.length} {rows.length === 1 ? "solicitud" : "solicitudes"}
        </strong>
        <p>
          Selecciona una solicitud para revisar sus datos y acciones
          disponibles.
        </p>
      </div>

      {rows.map((row) => {
        const status = bookingStatusMeta(row.status);
        return (
          <article className="host-booking-row" key={row.id}>
            <div className="host-booking-guest">
              <span className="host-avatar-initials" aria-hidden="true">
                {initials(row.guestName) || "H"}
              </span>
              <span>
                <span>Huésped</span>
                <strong>{row.guestName}</strong>
              </span>
            </div>

            <div className="host-booking-property">
              <span>Propiedad</span>
              <strong>{row.propertyTitle}</strong>
              <span>
                {row.rentalMode === "nightly"
                  ? "Por noche"
                  : row.rentalMode === "monthly"
                    ? "Por mes"
                    : "Modalidad no indicada"}
              </span>
              {row.rentalMode === "nightly" && (
                <span>
                  {row.guests} {row.guests === 1 ? "huésped" : "huéspedes"}
                </span>
              )}
            </div>

            <dl className="host-booking-dates">
              <div>
                <dt>{row.rentalMode === "monthly" ? "Ingreso" : "Check-in"}</dt>
                <dd>{row.checkIn}</dd>
              </div>
              <div>
                <dt>
                  {row.rentalMode === "monthly" ? "Fin del plazo" : "Check-out"}
                </dt>
                <dd>{row.checkOut}</dd>
              </div>
              {row.durationLabel && (
                <div>
                  <dt>Duración</dt>
                  <dd>{row.durationLabel}</dd>
                </div>
              )}
            </dl>

            <div className="host-booking-amount">
              <span>Estimación del alquiler</span>
              <strong>{row.estimatedAmount}</strong>
              {row.depositAmount && (
                <small>Depósito incluido: {row.depositAmount}</small>
              )}
              {row.cleaningFee && (
                <small>Limpieza incluida: {row.cleaningFee}</small>
              )}
            </div>

            <div className="host-booking-actions">
              <span className={`host-status host-status--${status.tone}`}>
                {status.label}
              </span>
              <a
                className="host-booking-link"
                href={`${detailBase}/${encodeURIComponent(row.id)}`}
              >
                Ver detalle
              </a>
            </div>
          </article>
        );
      })}
    </section>
  );
}
