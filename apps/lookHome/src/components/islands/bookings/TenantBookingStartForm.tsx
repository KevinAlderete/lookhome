import { useRef, useState } from "react";
import { startBookingRequest } from "@/features/bookings/api/client";

type Props = {
  bookingId: string;
  startDateLabel: string;
  canStart: boolean;
  startWindowExpired: boolean;
};

export default function TenantBookingStartForm({
  bookingId,
  startDateLabel,
  canStart,
  startWindowExpired,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const startStay = async () => {
    if (loading || success) return;
    setLoading(true);
    setError(null);

    try {
      await startBookingRequest(bookingId);
      setSuccess(true);
      window.setTimeout(() => window.location.reload(), 800);
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "No se pudo confirmar el inicio de la estancia.",
      );
      setLoading(false);
      window.requestAnimationFrame(() => errorRef.current?.focus());
    }
  };

  return (
    <section
      aria-busy={loading}
      className="rounded-3xl border border-terracotta-strong/15 bg-white p-5 shadow-[0_12px_36px_rgba(80,76,74,0.06)] sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-6"
    >
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta-strong">
          Solicitud aprobada
        </p>
        <h2 className="mt-1 text-xl font-bold text-warm-gray">
          Confirmar inicio de la estancia
        </h2>
        <p className="mt-2 text-sm leading-6 text-warm-gray/75">
          {canStart
            ? "Cuando hayas ingresado al alojamiento, confirma aquí el inicio."
            : startWindowExpired
              ? "La fecha de salida prevista ya pasó. Escribe al anfitrión para revisar el estado de la solicitud."
              : `Podrás confirmar el inicio desde el ${startDateLabel}.`}
        </p>
        {error && (
          <p
            ref={errorRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="mt-3 text-sm font-semibold text-red-800 focus:outline-2 focus:outline-offset-2 focus:outline-red-900"
          >
            {error}
          </p>
        )}
        {success && (
          <p
            role="status"
            aria-live="polite"
            className="mt-3 text-sm font-semibold text-green-800"
          >
            Inicio confirmado. Actualizando el detalle…
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void startStay()}
        disabled={!canStart || loading || success}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-terracotta-strong px-5 text-sm font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:bg-warm-gray/20 disabled:text-warm-gray/55 sm:mt-0 sm:w-auto sm:shrink-0"
      >
        {loading
          ? "Confirmando…"
          : success
            ? "Inicio confirmado"
            : "Confirmar inicio"}
      </button>
    </section>
  );
}
