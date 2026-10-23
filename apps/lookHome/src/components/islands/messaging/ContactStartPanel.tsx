import type { FormEvent, RefObject } from "react";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/constants";

type Props = {
  starting: boolean;
  error: string | null;
  draft: string;
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  onBack: () => void;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function ContactStartPanel({
  starting,
  error,
  draft,
  fieldRef,
  onBack,
  onDraftChange,
  onSubmit,
}: Props) {
  return starting ? (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 min-h-11 rounded-xl border border-warm-gray/15 px-4 py-2 text-sm font-semibold text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong lg:hidden"
      >
        Volver a conversaciones
      </button>
      <p role="status" className="text-base font-semibold text-warm-gray">
        Iniciando conversación…
      </p>
      <p className="max-w-sm text-sm leading-6 text-warm-gray/80">
        Tu consulta se vinculará al anuncio o unidad. No crea una reserva.
      </p>
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 min-h-11 rounded-xl border border-warm-gray/15 px-4 py-2 text-sm font-semibold text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong lg:hidden"
      >
        Volver a conversaciones
      </button>
      <div className="max-w-md space-y-3 text-left">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta-strong">
            Nuevo mensaje
          </p>
          <h2 className="mt-1 text-xl font-bold text-warm-gray">
            Consulta sobre esta oferta
          </h2>
          <p className="mt-2 text-sm leading-6 text-warm-gray/80">
            Envía un mensaje al anfitrión. Esto no crea ni aprueba una solicitud
            de alquiler.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        <form onSubmit={onSubmit} className="space-y-3">
          <label
            htmlFor="first-contact-message"
            className="block text-sm font-semibold text-warm-gray"
          >
            Tu primer mensaje
          </label>
          <textarea
            ref={fieldRef}
            id="first-contact-message"
            name="firstContactMessage"
            rows={4}
            maxLength={MAX_MESSAGE_LENGTH}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            autoComplete="off"
            placeholder="Escribe una consulta sobre el anuncio…"
            aria-describedby="first-contact-count"
            className="w-full resize-y rounded-xl border border-warm-gray/15 bg-white px-3 py-3 text-sm text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          />
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-warm-gray/75">
            <span id="first-contact-count">
              {draft.length}/{MAX_MESSAGE_LENGTH} caracteres
            </span>
            <button
              type="submit"
              disabled={!draft.trim() || draft.length > MAX_MESSAGE_LENGTH}
              className="min-h-11 rounded-xl bg-terracotta-strong px-4 text-sm font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enviar consulta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
