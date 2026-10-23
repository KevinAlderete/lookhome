import React, { useEffect, useMemo, useRef, useState } from "react";
import { createBookingRequest } from "@/features/bookings/api/client";

type BookingCardProps = {
  resourceId: string;
  price?: number | string | null;
  rentalMode: "nightly" | "monthly";
  currencyCode?: string;
  isAuthenticated?: boolean;
  returnPath?: string;
  maxGuests?: number | null;
  depositAmount?: number | string | null;
  cleaningFee?: number | string | null;
  minStayNights?: number | null;
  maxStayNights?: number | null;
  minTermMonths?: number | null;
  maxTermMonths?: number | null;
  minimumDate?: string;
};

function toNumber(value: number | string | null | undefined) {
  if (value == null || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function diffNights(checkIn: string, checkOut: string) {
  if (!checkIn || !checkOut) return 0;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  const ms = end.getTime() - start.getTime();
  const nights = Math.ceil(ms / (1000 * 60 * 60 * 24));
  return nights > 0 ? nights : 0;
}

export default function BookingCard({
  resourceId,
  price,
  rentalMode,
  currencyCode = "PEN",
  isAuthenticated = false,
  returnPath = "/buscar",
  maxGuests = 1,
  depositAmount = null,
  cleaningFee = 0,
  minStayNights = 1,
  maxStayNights = null,
  minTermMonths = 1,
  maxTermMonths = null,
  minimumDate,
}: BookingCardProps) {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [termMonths, setTermMonths] = useState(String(minTermMonths ?? 1));
  const [guests, setGuests] = useState("1");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const submissionLockRef = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const numericPrice = toNumber(price);
  const currencySymbol = currencyCode === "PEN" ? "S/" : currencyCode;
  const nights = useMemo(
    () => diffNights(checkIn, checkOut),
    [checkIn, checkOut],
  );
  const quantity = rentalMode === "monthly" ? Number(termMonths) || 0 : nights;
  const subtotal = numericPrice * quantity;
  const requestedDeposit =
    rentalMode === "monthly" ? toNumber(depositAmount) : 0;
  const depositIsKnown =
    depositAmount != null && String(depositAmount).trim() !== "";
  const oneTimeCleaningFee =
    rentalMode === "nightly" ? toNumber(cleaningFee) : 0;
  const estimatedTotal = subtotal + requestedDeposit + oneTimeCleaningFee;
  const formatPEN = (value: number) =>
    new Intl.NumberFormat("es-PE", { maximumFractionDigits: 2 }).format(value);

  const handleReserve = async () => {
    if (submissionLockRef.current) return;
    setError(null);
    setSuccess(null);

    if (!checkIn || (rentalMode === "nightly" && !checkOut)) {
      setError(
        rentalMode === "monthly"
          ? "Selecciona la fecha de ingreso."
          : "Selecciona check-in y check-out.",
      );
      return;
    }

    if (!Number.isInteger(quantity) || quantity <= 0) {
      setError("La duración solicitada no es válida.");
      return;
    }
    if (rentalMode === "nightly" && quantity < (minStayNights ?? 1)) {
      setError(`La estadía mínima es de ${minStayNights ?? 1} noches.`);
      return;
    }
    if (
      rentalMode === "nightly" &&
      maxStayNights != null &&
      quantity > maxStayNights
    ) {
      setError(`La estadía máxima es de ${maxStayNights} noches.`);
      return;
    }
    if (rentalMode === "monthly" && quantity < (minTermMonths ?? 1)) {
      setError(`El plazo mínimo es de ${minTermMonths ?? 1} meses.`);
      return;
    }
    if (
      rentalMode === "monthly" &&
      maxTermMonths != null &&
      quantity > maxTermMonths
    ) {
      setError(`El plazo máximo es de ${maxTermMonths} meses.`);
      return;
    }
    if (
      rentalMode === "nightly" &&
      (Number(guests) < 1 || Number(guests) > (Number(maxGuests) || 1))
    ) {
      setError(
        `La capacidad máxima es de ${Number(maxGuests) || 1} huéspedes.`,
      );
      return;
    }

    submissionLockRef.current = true;
    setLoading(true);

    try {
      const result = await createBookingRequest({
        roomId: resourceId,
        startDate: checkIn,
        ...(rentalMode === "nightly" ? { endDate: checkOut } : {}),
        ...(rentalMode === "monthly" ? { termMonths: quantity } : {}),
        ...(rentalMode === "nightly" ? { guestCount: Number(guests) } : {}),
        message: message.trim() || undefined,
      });

      const bookingId: string = result.booking.id;
      setSuccess("Solicitud enviada. Espera la respuesta del anfitrión.");

      setTimeout(() => {
        window.location.href = `/reservas/${encodeURIComponent(bookingId)}`;
      }, 900);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo enviar la solicitud.",
      );
      submissionLockRef.current = false;
      setLoading(false);
    }
  };

  return (
    <section
      id="solicitud"
      aria-label="Enviar solicitud de alquiler"
      className="scroll-mt-6 rounded-[24px] bg-white p-6 shadow-[0_18px_60px_rgba(80,76,74,0.12)]"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-warm-gray/60">Precio</p>
          <p className="text-3xl font-black text-warm-gray">
            {currencySymbol} {numericPrice ? formatPEN(numericPrice) : "--"}
          </p>
          <p className="text-xs font-semibold text-warm-gray/75">
            Moneda: {currencyCode}
          </p>
        </div>
        <p className="text-sm text-warm-gray/60">
          por {rentalMode === "monthly" ? "mes" : "día"}
        </p>
      </div>
      {(rentalMode === "monthly"
        ? minTermMonths !== 1 || maxTermMonths != null
        : minStayNights !== 1 || maxStayNights != null) && (
        <p className="mt-2 text-xs leading-5 text-warm-gray/70">
          {rentalMode === "monthly"
            ? `Plazo: ${minTermMonths ?? 1} ${(minTermMonths ?? 1) === 1 ? "mes" : "meses"} mínimo${maxTermMonths != null ? ` · ${maxTermMonths} ${maxTermMonths === 1 ? "mes" : "meses"} máximo` : ""}`
            : `Estadía: ${minStayNights ?? 1} ${(minStayNights ?? 1) === 1 ? "noche" : "noches"} mínimo${maxStayNights != null ? ` · ${maxStayNights} ${maxStayNights === 1 ? "noche" : "noches"} máximo` : ""}`}
        </p>
      )}

      {!isAuthenticated ? (
        <div className="mt-6 border-t border-warm-gray/10 pt-5">
          <p className="text-sm leading-6 text-warm-gray/75">
            Inicia sesión para elegir tus fechas y enviar una solicitud. El
            anfitrión deberá aprobarla.
          </p>
          <a
            href={`/login?redirect=${encodeURIComponent(`${returnPath}#solicitud`)}`}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-terracotta-strong px-4 text-sm font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          >
            Iniciar sesión para solicitar
          </a>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleReserve();
          }}
        >
          <div className="mt-6 grid gap-3">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-warm-gray">
                {rentalMode === "monthly" ? "Fecha de ingreso" : "Check-in"}
              </span>
              <input
                name="checkIn"
                autoComplete="off"
                type="date"
                min={minimumDate}
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="h-11 w-full rounded-xl border border-warm-gray/12 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              />
            </label>

            {rentalMode === "nightly" ? (
              <label className="space-y-2">
                <span className="text-sm font-semibold text-warm-gray">
                  Check-out
                </span>
                <input
                  name="checkOut"
                  autoComplete="off"
                  type="date"
                  min={checkIn || minimumDate}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="h-11 w-full rounded-xl border border-warm-gray/12 bg-white px-3 text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
              </label>
            ) : (
              <label className="space-y-2">
                <span className="text-sm font-semibold text-warm-gray">
                  Duración en meses
                </span>
                <input
                  name="termMonths"
                  autoComplete="off"
                  type="number"
                  inputMode="numeric"
                  min={String(minTermMonths ?? 1)}
                  max={
                    maxTermMonths == null ? undefined : String(maxTermMonths)
                  }
                  value={termMonths}
                  onChange={(e) => setTermMonths(e.target.value)}
                  className="h-11 w-full rounded-xl border border-warm-gray/12 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
              </label>
            )}

            {rentalMode === "nightly" && (
              <label className="space-y-2">
                <span className="text-sm font-semibold text-warm-gray">
                  Huéspedes
                </span>
                <select
                  name="guestCount"
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="h-11 w-full rounded-xl border border-warm-gray/12 px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  {Array.from({
                    length: Math.max(Number(maxGuests) || 1, 1),
                  }).map((_, index) => {
                    const value = String(index + 1);
                    return (
                      <option key={value} value={value}>
                        {value} {index === 0 ? "huésped" : "huéspedes"}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}

            <label className="space-y-2">
              <span className="text-sm font-semibold text-warm-gray">
                Mensaje para acompañar la solicitud (opcional)
              </span>
              <textarea
                name="bookingMessage"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                autoComplete="off"
                placeholder="Cuéntale algo sobre tu estadía…"
                className="w-full rounded-xl border border-warm-gray/12 px-3 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl bg-cream px-4 py-4">
            <div className="flex items-center justify-between text-sm text-warm-gray/70">
              <span>{rentalMode === "monthly" ? "Meses" : "Noches"}</span>
              <span>{quantity || "--"}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm text-warm-gray/70">
              <span>Subtotal del alquiler</span>
              <span>
                {currencySymbol} {subtotal ? formatPEN(subtotal) : "--"}
              </span>
            </div>
            {rentalMode === "monthly" &&
              depositIsKnown &&
              requestedDeposit > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm text-warm-gray/70">
                  <span>Depósito solicitado</span>
                  <span>
                    {currencySymbol} {formatPEN(requestedDeposit)}
                  </span>
                </div>
              )}
            {rentalMode === "monthly" &&
              depositIsKnown &&
              requestedDeposit === 0 && (
                <div className="mt-2 flex items-center justify-between text-sm text-warm-gray/70">
                  <span>Depósito</span>
                  <span>No solicitado</span>
                </div>
              )}
            {rentalMode === "monthly" && !depositIsKnown && (
              <div className="mt-2 flex items-center justify-between text-sm text-warm-gray/70">
                <span>Depósito</span>
                <span>Por confirmar</span>
              </div>
            )}
            {rentalMode === "nightly" && oneTimeCleaningFee > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm text-warm-gray/70">
                <span>Limpieza</span>
                <span>
                  {currencySymbol} {formatPEN(oneTimeCleaningFee)}
                </span>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-warm-gray/10 pt-3 text-sm font-bold text-warm-gray">
              <span>
                {rentalMode === "monthly"
                  ? depositIsKnown
                    ? "Estimación: plazo y depósito"
                    : "Estimación del plazo"
                  : "Estimación total del alquiler"}
              </span>
              <span>
                {currencySymbol}{" "}
                {estimatedTotal ? formatPEN(estimatedTotal) : "--"}
              </span>
            </div>
          </div>

          <p className="mt-4 text-xs leading-5 text-warm-gray/65">
            <span>
              El anfitrión debe aprobar la solicitud; enviarla no confirma la
              reserva.
            </span>
            {rentalMode === "monthly" && !depositIsKnown && (
              <span> El depósito se confirmará con el anfitrión.</span>
            )}
            <span>
              {" "}
              El pago se coordina directamente entre huésped y anfitrión.
              LOOKHOME no procesa pagos.
            </span>
          </p>

          {error && (
            <div
              ref={errorRef}
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"
            >
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-2xl bg-terracotta-strong px-5 py-4 text-center font-semibold text-white shadow-[0_18px_45px_rgba(168,79,50,0.24)] transition hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? "Enviando…" : "Enviar solicitud"}
          </button>
        </form>
      )}
    </section>
  );
}
