import type { FormEvent, RefObject } from "react";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/constants";

type Props = {
  draft: string;
  sending: boolean;
  blocked: boolean;
  blockStatusKnown: boolean;
  blockStatusError: string | null;
  formRef: RefObject<HTMLFormElement | null>;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function MessageComposer({
  draft,
  sending,
  blocked,
  blockStatusKnown,
  blockStatusError,
  formRef,
  onDraftChange,
  onSubmit,
}: Props) {
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="border-t border-warm-gray/8 bg-white px-4 py-4 sm:px-6"
    >
      <label
        htmlFor="message-draft"
        className="mb-2 block text-sm font-semibold text-warm-gray"
      >
        Tu mensaje
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <textarea
          id="message-draft"
          name="message"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !(event.nativeEvent as KeyboardEvent).isComposing
            ) {
              event.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          maxLength={MAX_MESSAGE_LENGTH}
          autoComplete="off"
          rows={2}
          placeholder="Escribe un mensaje…"
          disabled={sending || blocked || !blockStatusKnown}
          aria-describedby={`message-hint message-length${!blockStatusKnown ? " message-block-hint" : ""}`}
          className="min-h-20 min-w-0 w-full flex-1 resize-y rounded-2xl border border-warm-gray/15 bg-white px-4 py-3 text-sm text-warm-gray outline-none focus-visible:ring-2 focus-visible:ring-terracotta-strong disabled:bg-cream"
        />
        <button
          type="submit"
          disabled={
            sending ||
            blocked ||
            !blockStatusKnown ||
            !draft.trim() ||
            draft.length > MAX_MESSAGE_LENGTH
          }
          className="min-h-11 shrink-0 rounded-2xl bg-terracotta-strong px-4 py-3 font-semibold text-white transition hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-warm-gray/80">
        <span id="message-hint">
          Enter para enviar; Shift+Enter para un salto de línea.
        </span>
        <span id="message-length">
          Caracteres: {draft.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
      {!blockStatusKnown && (
        <p
          id="message-block-hint"
          role={blockStatusError ? "alert" : "status"}
          aria-live={blockStatusError ? "assertive" : "polite"}
          className={`mt-2 text-xs ${blockStatusError ? "text-red-800" : "text-warm-gray/75"}`}
        >
          {blockStatusError
            ? "El envío está desactivado hasta que se pueda comprobar el estado de esta conversación."
            : "Comprobando si puedes enviar mensajes…"}
        </p>
      )}
      <p className="mt-2 text-xs text-warm-gray/80">
        Este mensaje no crea ni confirma una solicitud de alquiler.
      </p>
    </form>
  );
}
