import { useRef, useState, type FormEvent } from "react";
import { updateBookingStatusRequest } from "@/features/bookings/api/client";
import { bookingStatusMeta } from "@/features/bookings/status";

const NEXT_STATUSES: Record<string, string[]> = {
  requested: ["accepted", "rejected", "cancelled"],
  accepted: ["cancelled"],
  active: ["completed"],
};

const ACTION_DETAILS: Record<
  string,
  { title: string; description: string; tone: "positive" | "danger" }
> = {
  accepted: {
    title: "Aprobar solicitud",
    description:
      "Al aprobarla, las fechas se bloquean en el calendario. El pago se coordina directamente con el huésped.",
    tone: "positive",
  },
  rejected: {
    title: "Rechazar solicitud",
    description:
      "La solicitud dejará de estar vigente. No podrás reabrirla desde este panel.",
    tone: "danger",
  },
  cancelled: {
    title: "Cancelar solicitud",
    description:
      "La solicitud dejará de estar vigente y se retirará cualquier bloqueo de calendario asociado.",
    tone: "danger",
  },
  completed: {
    title: "Marcar estancia como completada",
    description:
      "Confirma cuando la estancia haya terminado. Esto habilitará las reseñas para ambas partes.",
    tone: "positive",
  },
};

const SUCCESS_MESSAGES: Record<string, string> = {
  accepted: "La solicitud fue aprobada correctamente.",
  rejected: "La solicitud fue rechazada correctamente.",
  cancelled: "La solicitud fue cancelada correctamente.",
  completed: "La estancia fue marcada como completada.",
};

type Props = {
  bookingId: string;
  currentStatus: string;
};

export default function HostBookingStatusForm({
  bookingId,
  currentStatus,
}: Props) {
  const normalizedCurrentStatus = currentStatus.trim().toLowerCase();
  const allowedStatuses = NEXT_STATUSES[normalizedCurrentStatus] ?? [];
  const [status, setStatus] = useState("");
  const [confirmationStatus, setConfirmationStatus] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const submissionLockRef = useRef(false);
  const currentStatusMeta = bookingStatusMeta(currentStatus);
  const selectedStatus =
    allowedStatuses.length === 1 ? allowedStatuses[0] : status;
  const selectedAction = ACTION_DETAILS[selectedStatus];
  const isDestructive =
    selectedStatus === "rejected" || selectedStatus === "cancelled";
  const needsConfirmation = isDestructive || selectedStatus === "completed";
  const isConfirming = confirmationStatus === selectedStatus;
  const guidance =
    normalizedCurrentStatus === "requested"
      ? "Elige una respuesta para el huésped. Antes de enviar una decisión, podrás revisarla."
      : normalizedCurrentStatus === "accepted"
        ? "La solicitud está aprobada. El huésped podrá confirmar el inicio desde la fecha de ingreso."
        : normalizedCurrentStatus === "active"
          ? "La estancia está en curso. Puedes marcarla completada cuando haya terminado; si no lo haces, el sistema la finalizará después de la fecha de salida."
          : "Esta solicitud ya no permite cambios desde el panel del anfitrión.";

  const handleUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStatus || submissionLockRef.current || loading) return;

    if (needsConfirmation && !isConfirming) {
      setConfirmationStatus(selectedStatus);
      setMessage(null);
      return;
    }

    submissionLockRef.current = true;
    setLoading(true);
    setMessage(null);

    try {
      await updateBookingStatusRequest(bookingId, selectedStatus);

      setMessage({
        kind: "success",
        text:
          SUCCESS_MESSAGES[selectedStatus] ??
          "La solicitud se actualizó correctamente.",
      });
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar la solicitud.",
      });
      submissionLockRef.current = false;
      setLoading(false);
    }
  };

  const handleActionChange = (nextStatus: string) => {
    setStatus(nextStatus);
    setConfirmationStatus(null);
    setMessage(null);
  };

  const confirmationCopy =
    selectedStatus === "rejected"
      ? "¿Confirmas que quieres rechazar esta solicitud? No podrás reabrirla desde este panel."
      : selectedStatus === "cancelled"
        ? "¿Confirmas que quieres cancelar esta solicitud? La acción retirará cualquier bloqueo de calendario asociado."
        : "¿Confirmas que la estancia ya terminó? Al marcarla completada, huésped y anfitrión podrán enviar sus reseñas.";

  return (
    <section
      aria-busy={loading}
      className="rounded-3xl border border-warm-gray/10 bg-white p-5 shadow-[0_18px_50px_rgba(80,76,74,0.06)] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="host-eyebrow">Respuesta al huésped</p>
          <h2 className="text-xl font-bold text-warm-gray">Cambiar estado</h2>
        </div>
        <span className={`host-status host-status--${currentStatusMeta.tone}`}>
          {currentStatusMeta.label}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-warm-gray/70">{guidance}</p>

      {allowedStatuses.length > 0 ? (
        <form onSubmit={handleUpdate} className="mt-5">
          {allowedStatuses.length > 1 ? (
            <fieldset disabled={loading} className="min-w-0">
              <legend className="mb-3 text-sm font-bold text-warm-gray">
                Selecciona una respuesta
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {allowedStatuses.map((item) => {
                  const action = ACTION_DETAILS[item];
                  const selected = status === item;
                  const danger = action?.tone === "danger";

                  return (
                    <label
                      key={item}
                      className={`relative flex min-h-32 cursor-pointer gap-3 rounded-2xl border p-4 transition-colors ${
                        selected
                          ? danger
                            ? "border-red-400 bg-red-50"
                            : "border-terracotta-strong bg-cream"
                          : "border-warm-gray/15 bg-white hover:border-warm-gray/30 hover:bg-cream/60"
                      } ${loading ? "cursor-not-allowed opacity-70" : ""}`}
                    >
                      <input
                        id={`booking-${bookingId}-${item}`}
                        type="radio"
                        name={`booking-action-${bookingId}`}
                        value={item}
                        checked={selected}
                        onChange={() => handleActionChange(item)}
                        className="peer sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border transition-colors ${
                          selected
                            ? "border-terracotta-strong bg-terracotta-strong text-white"
                            : "border-warm-gray/30 bg-white text-transparent"
                        } peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-terracotta-strong`}
                      >
                        <svg viewBox="0 0 16 16" className="size-3" fill="none">
                          <path
                            d="m3.5 8 3 3 6-6"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                          />
                        </svg>
                      </span>
                      <span className="min-w-0">
                        <span className="block font-bold text-warm-gray">
                          {action?.title ?? item}
                        </span>
                        <span className="mt-1 block text-sm leading-5 text-warm-gray/70">
                          {action?.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <div
              className={`rounded-2xl border p-4 ${
                selectedAction?.tone === "danger"
                  ? "border-red-200 bg-red-50"
                  : "border-terracotta-strong/15 bg-cream"
              }`}
            >
              <p
                className={`text-xs font-bold uppercase tracking-[0.1em] ${
                  selectedAction?.tone === "danger"
                    ? "text-red-800"
                    : "text-terracotta-strong"
                }`}
              >
                Única acción disponible
              </p>
              <h3 className="mt-1 font-bold text-warm-gray">
                {selectedAction?.title ?? "Cancelar solicitud"}
              </h3>
              <p className="mt-1 text-sm leading-5 text-warm-gray/75">
                {selectedAction?.description}
              </p>
            </div>
          )}

          {needsConfirmation && isConfirming && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 ${
                isDestructive
                  ? "border-red-200 bg-red-50"
                  : "border-green-200 bg-green-50"
              }`}
            >
              <p
                role="status"
                aria-live="polite"
                className={`font-bold ${
                  isDestructive ? "text-red-900" : "text-green-900"
                }`}
              >
                {selectedStatus === "rejected"
                  ? "Confirma el rechazo"
                  : selectedStatus === "cancelled"
                    ? "Confirma la cancelación"
                    : "Confirma la finalización"}
              </p>
              <p
                className={`mt-1 text-sm leading-5 ${
                  isDestructive ? "text-red-900/80" : "text-green-900/80"
                }`}
              >
                {confirmationCopy}
              </p>
              <button
                type="button"
                onClick={() => setConfirmationStatus(null)}
                disabled={loading}
                className={`mt-2 min-h-10 text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${
                  isDestructive
                    ? "text-red-900 focus-visible:outline-red-800"
                    : "text-green-900 focus-visible:outline-green-800"
                }`}
              >
                Volver a revisar
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={!selectedStatus || loading}
            className={`mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-warm-gray/25 disabled:text-warm-gray/55 disabled:shadow-none ${
              selectedAction?.tone === "danger"
                ? "bg-red-700 shadow-[0_8px_18px_rgba(153,45,45,0.15)] hover:bg-red-800 focus-visible:outline-red-800"
                : "bg-terracotta-strong shadow-[0_8px_18px_rgba(168,79,50,0.18)] hover:brightness-95 focus-visible:outline-terracotta-strong"
            }`}
          >
            {loading ? (
              <>
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-4 animate-spin motion-reduce:animate-none"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    strokeOpacity="0.35"
                    strokeWidth="3"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth="3"
                  />
                </svg>
                Actualizando…
              </>
            ) : !selectedStatus ? (
              "Selecciona una respuesta"
            ) : needsConfirmation && isConfirming ? (
              selectedStatus === "rejected" ? (
                "Confirmar rechazo"
              ) : selectedStatus === "cancelled" ? (
                "Confirmar cancelación"
              ) : (
                "Confirmar finalización"
              )
            ) : selectedStatus === "accepted" ? (
              "Aprobar solicitud"
            ) : selectedStatus === "rejected" ? (
              "Revisar rechazo"
            ) : selectedStatus === "cancelled" ? (
              "Revisar cancelación"
            ) : (
              "Revisar finalización"
            )}
          </button>
        </form>
      ) : (
        <div className="mt-5 rounded-2xl border border-warm-gray/10 bg-cream px-4 py-4">
          <p className="font-semibold text-warm-gray">
            No hay acciones disponibles
          </p>
          <p className="mt-1 text-sm leading-5 text-warm-gray/70">
            Esta solicitud ya no admite cambios desde el panel del anfitrión.
          </p>
        </div>
      )}

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          aria-live={message.kind === "error" ? "assertive" : "polite"}
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            message.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
