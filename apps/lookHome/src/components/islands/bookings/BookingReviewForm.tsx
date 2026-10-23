import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createReviewRequest,
  getMyBookingReviewStatusRequest,
} from "@/features/reviews/api/client";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/constants";
import type {
  BookingReview,
  BookingReviewStatus,
} from "@/features/reviews/types";

const RATING_LABELS = ["Muy mala", "Mala", "Regular", "Buena", "Excelente"];

type Props = {
  bookingId: string;
  revieweeName: string;
  publication: "offer" | "request";
  bookingStatus: string;
  initialStatus: BookingReviewStatus | null;
  initialStatusError: boolean;
};

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Lima",
  });
}

function ReviewReceipt({
  sectionId,
  review,
  title,
  publication,
  announce = false,
}: {
  sectionId: string;
  review: BookingReview;
  title: string;
  publication: "offer" | "request";
  announce?: boolean;
}) {
  return (
    <section
      id={sectionId}
      aria-labelledby="booking-review-receipt-title"
      role={announce ? "status" : undefined}
      aria-live={announce ? "polite" : undefined}
      className="rounded-3xl border border-green-200 bg-green-50 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-green-800">
            {announce
              ? publication === "offer"
                ? "Reseña enviada"
                : "Valoración enviada"
              : publication === "offer"
                ? "Tu reseña"
                : "Tu valoración"}
          </p>
          <h2
            id="booking-review-receipt-title"
            className="mt-1 text-xl font-bold text-warm-gray"
          >
            {announce
              ? "Gracias por compartir tu experiencia"
              : "Ya compartiste tu experiencia"}
          </h2>
          <p className="mt-1 text-sm text-warm-gray/75">Para {title}</p>
          <p className="mt-3 inline-flex min-h-9 items-center rounded-full border border-green-200 bg-white px-3 text-xs font-semibold text-green-900">
            {publication === "offer"
              ? "Visible en la oferta"
              : "No se publica en el anuncio"}
          </p>
        </div>
        <span
          role="img"
          className="inline-flex min-h-10 items-center rounded-full border border-green-200 bg-white px-3 text-sm font-bold text-green-800"
          aria-label={`${review.rating} de 5 estrellas`}
        >
          {review.rating} / 5
        </span>
      </div>
      <p className="mt-4 whitespace-pre-wrap break-words rounded-2xl bg-white/80 px-4 py-3 text-sm leading-6 text-warm-gray">
        {review.comment || "No agregaste un comentario."}
      </p>
      {review.createdAt && (
        <p className="mt-2 text-xs text-warm-gray/65">
          Enviada el {formatReviewDate(review.createdAt)}
        </p>
      )}
    </section>
  );
}

export default function BookingReviewForm({
  bookingId,
  revieweeName,
  publication,
  bookingStatus,
  initialStatus,
  initialStatusError,
}: Props) {
  const [status, setStatus] = useState<BookingReviewStatus | null>(
    initialStatus,
  );
  const [statusError, setStatusError] = useState<string | null>(
    initialStatusError
      ? "No pudimos comprobar si esta solicitud admite una reseña."
      : null,
  );
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingError, setRatingError] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successReview, setSuccessReview] = useState<BookingReview | null>(
    null,
  );
  const submissionLockRef = useRef(false);
  const submitErrorRef = useRef<HTMLDivElement>(null);
  const ratingErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (submitError) {
      submitErrorRef.current?.focus();
    } else if (ratingError) {
      ratingErrorRef.current?.focus();
    }
  }, [submitError, ratingError]);

  const checkReviewStatus = async () => {
    if (checkingStatus) return;
    setCheckingStatus(true);
    setStatusError(null);
    try {
      setStatus(await getMyBookingReviewStatusRequest(bookingId));
    } catch (error) {
      setStatusError(
        error instanceof Error
          ? error.message
          : "No pudimos comprobar si esta solicitud admite una reseña.",
      );
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!status?.canReview || submissionLockRef.current || submitting) {
      return;
    }
    if (rating < 1 || rating > 5) {
      setRatingError(true);
      return;
    }

    submissionLockRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setRatingError(false);
    try {
      const result = await createReviewRequest({
        bookingId,
        revieweeUserId: status.revieweeUserId,
        rating,
        comment: comment.trim() || undefined,
      });
      setSuccessReview(result.review);
      setStatus({
        ...status,
        canReview: false,
        reason: "already_reviewed",
        review: result.review,
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "No se pudo enviar la reseña. Tu texto se conservó para que puedas reintentarlo.",
      );
      submissionLockRef.current = false;
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
  };

  if (successReview) {
    return (
      <ReviewReceipt
        sectionId="booking-review"
        review={successReview}
        title={revieweeName}
        publication={publication}
        announce
      />
    );
  }

  if (status?.review) {
    return (
      <ReviewReceipt
        sectionId="booking-review"
        review={status.review}
        title={revieweeName}
        publication={publication}
      />
    );
  }

  if (status && !status.canReview) {
    return (
      <section
        id="booking-review"
        className="rounded-3xl border border-warm-gray/10 bg-cream p-5 sm:p-6"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-warm-gray/60">
          Tu experiencia
        </p>
        <h2 className="mt-1 text-xl font-bold text-warm-gray">
          {publication === "offer"
            ? "Reseña en la oferta"
            : "Valoración de la solicitud"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-warm-gray/75">
          {status.reason === "already_reviewed"
            ? "Ya compartiste tu experiencia en esta solicitud."
            : bookingStatus === "active"
              ? "La estancia está en curso. Podrás compartir tu reseña cuando figure como completada."
              : bookingStatus === "disputed"
                ? "La solicitud está en revisión. Podrás compartir tu reseña cuando se resuelva y figure como completada."
                : "Podrás compartir tu experiencia cuando la solicitud figure como completada."}
        </p>
      </section>
    );
  }

  if (!status || statusError) {
    return (
      <section
        id="booking-review"
        aria-labelledby="booking-review-status-title"
        className="rounded-3xl border border-warm-gray/10 bg-white p-5 shadow-[0_12px_36px_rgba(80,76,74,0.06)] sm:p-6"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta-strong">
          Tu experiencia
        </p>
        <h2
          id="booking-review-status-title"
          className="mt-1 text-xl font-bold text-warm-gray"
        >
          ¿Cómo fue tu experiencia con {revieweeName}?
        </h2>
        {statusError ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p role="alert">{statusError}</p>
            <button
              type="button"
              onClick={() => void checkReviewStatus()}
              disabled={checkingStatus}
              className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900 disabled:opacity-60"
            >
              {checkingStatus ? "Comprobando…" : "Reintentar"}
            </button>
          </div>
        ) : (
          <p role="status" className="mt-3 text-sm text-warm-gray/70">
            Comprobando si esta solicitud admite una reseña…
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      id="booking-review"
      aria-labelledby="booking-review-title"
      className="rounded-3xl border border-warm-gray/10 bg-white p-5 shadow-[0_12px_36px_rgba(80,76,74,0.06)] sm:p-6"
    >
      <header className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta-strong">
          {publication === "offer"
            ? "Reseña pública de la oferta"
            : "Valoración de la solicitud"}
        </p>
        <h2
          id="booking-review-title"
          className="mt-1 text-xl font-bold text-warm-gray"
        >
          ¿Cómo fue tu experiencia con {revieweeName}?
        </h2>
        <p className="mt-2 text-sm leading-6 text-warm-gray/75">
          {publication === "offer"
            ? `Comparte cómo fue tu experiencia con ${revieweeName} en esta oferta y ayuda a otras personas a decidir.`
            : `Cuéntanos cómo fue tu experiencia con ${revieweeName} durante esta solicitud.`}
        </p>
      </header>

      <div className="mt-4 rounded-2xl border border-warm-gray/10 bg-cream p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-warm-gray/60">
          Visibilidad de tu valoración
        </p>
        <p className="mt-1 font-semibold text-warm-gray">
          {publication === "offer"
            ? "Se mostrará en la oferta"
            : "No se publicará en el anuncio"}
        </p>
        <p className="mt-1 text-sm leading-6 text-warm-gray/75">
          {publication === "offer"
            ? "Aparecerá junto a tu nombre visible y foto de perfil. Tus datos de contacto no se mostrarán."
            : "Quedará asociada a esta solicitud. Tus datos de contacto no se compartirán."}
        </p>
      </div>

      {submitError && (
        <div
          ref={submitErrorRef}
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          aria-labelledby={`review-submit-error-title-${bookingId}`}
          className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 focus:outline-2 focus:outline-offset-2 focus:outline-red-900"
        >
          <h3
            id={`review-submit-error-title-${bookingId}`}
            className="font-bold"
          >
            {publication === "offer"
              ? "No se pudo enviar la reseña"
              : "No se pudo enviar la valoración"}
          </h3>
          <p className="mt-1">{submitError}</p>
          <p className="mt-1 text-xs">
            Conservamos tu puntuación y comentario para que puedas reintentarlo.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-5">
        <fieldset
          disabled={submitting}
          aria-describedby={`review-rating-help-${bookingId}${ratingError ? ` review-rating-error-${bookingId}` : ""}`}
        >
          <legend className="text-sm font-bold text-warm-gray">
            ¿Qué puntuación le das a {revieweeName}?
          </legend>
          <p
            id={`review-rating-help-${bookingId}`}
            className="mt-1 text-xs text-warm-gray/65"
          >
            La puntuación es obligatoria. El comentario es opcional.
          </p>
          {ratingError && (
            <p
              ref={ratingErrorRef}
              id={`review-rating-error-${bookingId}`}
              role="alert"
              tabIndex={-1}
              className="mt-2 rounded-lg text-sm font-semibold text-red-800 focus:outline-2 focus:outline-offset-2 focus:outline-red-900"
            >
              Selecciona una puntuación para enviar la reseña.
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {RATING_LABELS.map((label, index) => {
              const value = index + 1;
              const selected = rating === value;
              const filled = rating >= value;
              return (
                <label
                  key={value}
                  className="cursor-pointer rounded-xl focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-terracotta-strong"
                >
                  <input
                    type="radio"
                    name={`review-rating-${bookingId}`}
                    value={value}
                    checked={selected}
                    aria-invalid={ratingError || undefined}
                    onChange={() => {
                      setRating(value);
                      setRatingError(false);
                    }}
                    className="peer sr-only"
                  />
                  <span
                    className={`grid size-11 place-items-center rounded-xl border transition-colors ${
                      selected
                        ? "border-terracotta-strong bg-cream"
                        : "border-transparent hover:border-warm-gray/15 hover:bg-cream"
                    }`}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className={`size-6 ${filled ? "text-terracotta-strong" : "text-warm-gray/35"}`}
                      fill={filled ? "currentColor" : "none"}
                    >
                      <path
                        d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"
                        stroke="currentColor"
                        strokeLinejoin="round"
                        strokeWidth="1.5"
                      />
                    </svg>
                    <span className="sr-only">
                      {value} de 5: {label}
                    </span>
                  </span>
                </label>
              );
            })}
            <span
              aria-live="polite"
              className="ml-1 text-sm font-semibold text-warm-gray/75"
            >
              {rating
                ? `${rating} de 5 · ${RATING_LABELS[rating - 1]}`
                : "Elige de 1 a 5 estrellas"}
            </span>
          </div>
        </fieldset>

        <div>
          <label
            htmlFor={`review-comment-${bookingId}`}
            className="block text-sm font-bold text-warm-gray"
          >
            Comentario{" "}
            <span className="font-normal text-warm-gray/65">(opcional)</span>
          </label>
          <textarea
            id={`review-comment-${bookingId}`}
            name={`review-comment-${bookingId}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={4}
            disabled={submitting}
            autoComplete="off"
            placeholder="Comparte detalles que puedan ayudar a otras personas…"
            aria-describedby={`review-comment-count-${bookingId}`}
            className="mt-2 min-h-28 w-full resize-y rounded-xl border border-warm-gray/15 bg-white px-4 py-3 text-sm leading-6 text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:bg-cream"
          />
          <p
            id={`review-comment-count-${bookingId}`}
            className="mt-1 text-right text-xs text-warm-gray/65"
          >
            {comment.length}/{MAX_MESSAGE_LENGTH} caracteres
          </p>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-terracotta-strong px-5 text-sm font-semibold text-white transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-55"
        >
          {submitting
            ? "Enviando…"
            : publication === "offer"
              ? "Publicar reseña"
              : "Enviar valoración"}
        </button>
      </form>
    </section>
  );
}
