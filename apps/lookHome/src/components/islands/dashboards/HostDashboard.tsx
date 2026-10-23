import { bookingStatusMeta } from "@/features/bookings/status";

type HostStat = {
  label: string;
  value: string;
};

type HostDashboardProps = {
  stats: HostStat[];
  bookingSectionTitle?: string;
  recentBookings?: Array<{
    id: string;
    guestName: string;
    propertyTitle: string;
    checkIn: string;
    checkOut: string;
    estimatedAmount: string;
    rentalMode?: "nightly" | "monthly" | null;
    durationLabel?: string | null;
    status: string;
  }>;
  recentMessages?: Array<{
    id: string;
    participantName: string;
    contextTitle: string;
    preview: string;
    lastMessageAt: string;
    unreadCount?: number;
  }>;
  messageError?: string | null;
  bookingError?: string | null;
};

const statIcons = [
  <path
    key="calendar"
    d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"
  />,
  <path key="check" d="M20 11a8 8 0 1 1-4.7-7.3M9 11l3 3 8-8" />,
  <path key="clock" d="M12 7v5l3 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z" />,
  <path key="home" d="M3 11 12 4l9 7M5 10v10h14V10M9 20v-6h6v6" />,
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatConversationTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
}

export default function HostDashboard({
  stats,
  bookingSectionTitle = "Próximas reservas",
  recentBookings = [],
  recentMessages = [],
  messageError = null,
  bookingError = null,
}: HostDashboardProps) {
  return (
    <div className="host-dashboard">
      <section
        className="host-dashboard-intro"
        aria-labelledby="host-dashboard-title"
      >
        <div>
          <p className="host-eyebrow">Resumen de actividad</p>
          <h1 id="host-dashboard-title">Tu operación, de un vistazo.</h1>
          <p>
            Revisa el movimiento de tus alojamientos y atiende lo importante
            desde un solo lugar.
          </p>
        </div>
        <div className="host-dashboard-actions">
          <a className="host-button-secondary" href="/host/reservas">
            Ver solicitudes
          </a>
          <a className="host-button-primary" href="/host/anuncios/nuevo">
            Nuevo anuncio
          </a>
        </div>
      </section>

      <section className="host-stats-grid" aria-label="Indicadores de reservas">
        {stats.map((stat, index) => (
          <article className="host-stat-card" key={stat.label}>
            <span className="host-stat-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">{statIcons[index] ?? statIcons[0]}</svg>
            </span>
            <p className="host-stat-label">{stat.label}</p>
            <p className="host-stat-value">{stat.value}</p>
          </article>
        ))}
      </section>

      <div className="host-dashboard-grid">
        <section
          className="host-panel"
          aria-labelledby="dashboard-bookings-title"
        >
          <div className="host-panel-header">
            <div>
              <h2 id="dashboard-bookings-title">{bookingSectionTitle}</h2>
              <p>Fechas, huéspedes y estado actual</p>
            </div>
            <a className="host-panel-link" href="/host/reservas">
              Ver todas
            </a>
          </div>

          {bookingError ? (
            <div className="host-empty-state" role="alert">
              {bookingError}{" "}
              <a
                href="/host"
                className="font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Reintentar
              </a>
            </div>
          ) : recentBookings.length ? (
            <div className="host-booking-stack">
              {recentBookings.map((item) => {
                const status = bookingStatusMeta(item.status);
                return (
                  <a
                    className="host-reservation-card"
                    href={`/host/reservas/${item.id}`}
                    key={item.id}
                  >
                    <span className="host-avatar-initials" aria-hidden="true">
                      {initials(item.guestName) || "H"}
                    </span>
                    <span className="host-reservation-main">
                      <strong>{item.guestName}</strong>
                      <span>{item.propertyTitle}</span>
                      <span className="host-reservation-meta">
                        {item.checkIn} al {item.checkOut}
                      </span>
                    </span>
                    <span className="host-reservation-side">
                      <span className="block text-xs text-warm-gray/80">
                        Estimación del alquiler
                      </span>
                      <strong>{item.estimatedAmount}</strong>
                      <span className="block text-xs text-warm-gray/80">
                        {item.rentalMode === "monthly"
                          ? "Por mes"
                          : item.rentalMode === "nightly"
                            ? "Por noche"
                            : "Modalidad no indicada"}
                        {item.durationLabel ? ` · ${item.durationLabel}` : ""}
                      </span>
                      <span
                        className={`host-status host-status--${status.tone}`}
                      >
                        {status.label}
                      </span>
                    </span>
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="host-empty-state">
              Aún no hay solicitudes para mostrar.
            </div>
          )}
        </section>

        <section
          className="host-panel"
          aria-labelledby="dashboard-messages-title"
        >
          <div className="host-panel-header">
            <div>
              <h2 id="dashboard-messages-title">Mensajes</h2>
              <p>Conversaciones con huéspedes</p>
            </div>
            <a className="host-panel-link" href="/mensajes">
              Abrir bandeja
            </a>
          </div>

          {recentMessages.length ? (
            <div className="host-message-stack">
              {recentMessages.map((item) => (
                <a
                  className="host-message-card"
                  href={`/mensajes?conversationId=${encodeURIComponent(item.id)}`}
                  key={item.id}
                >
                  <span className="host-avatar-initials" aria-hidden="true">
                    {initials(item.participantName) || "H"}
                  </span>
                  <span>
                    <strong>{item.participantName}</strong>
                    <span className="host-message-context">
                      {item.contextTitle}
                    </span>
                    <time
                      className="host-message-time"
                      dateTime={item.lastMessageAt}
                    >
                      {formatConversationTimestamp(item.lastMessageAt)}
                    </time>
                    <p>{item.preview}</p>
                  </span>
                  {item.unreadCount ? (
                    <span
                      className="host-unread-count"
                      aria-label={`${item.unreadCount} ${item.unreadCount === 1 ? "mensaje" : "mensajes"} sin leer`}
                    >
                      {item.unreadCount}
                    </span>
                  ) : (
                    <span className="host-card-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </a>
              ))}
            </div>
          ) : messageError ? (
            <div className="host-empty-state" role="status">
              No se pudieron cargar las conversaciones. Vuelve a abrir la
              bandeja para intentarlo de nuevo.
            </div>
          ) : (
            <div className="host-empty-state">
              No tienes conversaciones recientes.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
