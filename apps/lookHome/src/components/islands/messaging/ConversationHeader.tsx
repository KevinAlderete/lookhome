import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  ConversationBlockStatus,
  ConversationListItem,
} from "@/features/messaging/types";

type Props = {
  conversation: ConversationListItem;
  contextUrl: string | null;
  relatedBookingUrl: string | null;
  participantInitials: string | undefined;
  conversationHeadingRef: RefObject<HTMLHeadingElement | null>;
  blockButtonRef: RefObject<HTMLButtonElement | null>;
  blockConfirmationHeadingRef: RefObject<HTMLHeadingElement | null>;
  blockStatus: ConversationBlockStatus | null;
  blockStatusPending: boolean;
  blockStatusError: string | null;
  selectedConversationBlocked: boolean;
  confirmingBlock: boolean;
  blockMutation: boolean;
  connectionState: "active" | "retrying";
  realtimeConnected: boolean;
  readError: boolean;
  retryingRead: boolean;
  error: string | null;
  showInboxRetry: boolean;
  retryingInbox: boolean;
  onBackToList: () => void;
  onToggleBlock: () => void;
  onCancelBlockConfirmation: () => void;
  onConfirmBlock: () => void;
  onRetryBlockStatus: () => void;
  onRetryRead: () => void;
  onRetryInbox: () => void;
};

export default function ConversationHeader({
  conversation,
  contextUrl,
  relatedBookingUrl,
  participantInitials,
  conversationHeadingRef,
  blockButtonRef,
  blockConfirmationHeadingRef,
  blockStatus,
  blockStatusPending,
  blockStatusError,
  selectedConversationBlocked,
  confirmingBlock,
  blockMutation,
  connectionState,
  realtimeConnected,
  readError,
  retryingRead,
  error,
  showInboxRetry,
  retryingInbox,
  onBackToList,
  onToggleBlock,
  onCancelBlockConfirmation,
  onConfirmBlock,
  onRetryBlockStatus,
  onRetryRead,
  onRetryInbox,
}: Props) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const moreActionsRef = useRef<HTMLDetailsElement | null>(null);
  const moreActionsSummaryRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!actionsOpen) return;

    const closeOnPointerOutside = (event: PointerEvent) => {
      if (confirmingBlock || blockMutation) return;
      if (
        event.target instanceof Node &&
        !moreActionsRef.current?.contains(event.target)
      ) {
        setActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (blockMutation) return;
      if (confirmingBlock) onCancelBlockConfirmation();
      setActionsOpen(false);
      requestAnimationFrame(() => moreActionsSummaryRef.current?.focus());
    };

    document.addEventListener("pointerdown", closeOnPointerOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [actionsOpen, blockMutation, confirmingBlock, onCancelBlockConfirmation]);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-warm-gray/8 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBackToList}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-warm-gray/12 text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong lg:hidden"
            aria-label="Volver a conversaciones"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
            >
              <path
                d="m15 18-6-6 6-6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
          {conversation.participantAvatarUrl ? (
            <img
              src={conversation.participantAvatarUrl}
              alt=""
              width={40}
              height={40}
              className="size-10 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-terracotta/15 text-xs font-bold text-terracotta-strong"
            >
              {participantInitials || "P"}
            </span>
          )}
          <div className="min-w-0">
            <h2
              ref={conversationHeadingRef}
              tabIndex={-1}
              className="truncate text-base font-bold text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong sm:text-lg"
            >
              {conversation.participantName}
            </h2>
            {contextUrl ? (
              <a
                href={contextUrl}
                className="mt-0.5 block truncate text-xs font-semibold text-terracotta-strong underline-offset-2 hover:underline"
              >
                {conversation.contextTitle}
              </a>
            ) : (
              <p className="mt-0.5 truncate text-xs text-warm-gray/80">
                {conversation.contextTitle}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {relatedBookingUrl && (
            <a
              href={relatedBookingUrl}
              className="inline-flex min-h-11 items-center rounded-xl border border-warm-gray/15 px-3 py-2 text-xs font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong sm:text-sm"
            >
              Ver solicitud relacionada
            </a>
          )}
          <details
            ref={moreActionsRef}
            open={actionsOpen || confirmingBlock}
            onToggle={(event) => {
              if (
                (confirmingBlock || blockMutation) &&
                !event.currentTarget.open
              ) {
                setActionsOpen(true);
                return;
              }
              setActionsOpen(event.currentTarget.open);
            }}
            className="group relative"
          >
            <summary
              ref={(element) => {
                moreActionsSummaryRef.current = element;
              }}
              className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-warm-gray/15 bg-white px-3 text-xs font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong sm:text-sm"
            >
              Más opciones
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-4 transition-transform group-open:rotate-180"
                fill="none"
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                />
              </svg>
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-warm-gray/12 bg-white p-2 shadow-[0_14px_35px_rgba(80,76,74,0.16)]">
              <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-warm-gray/60">
                Seguridad
              </p>
              {blockStatus ? (
                <button
                  ref={blockButtonRef}
                  type="button"
                  onClick={onToggleBlock}
                  disabled={blockMutation || confirmingBlock}
                  aria-expanded={confirmingBlock}
                  aria-controls={
                    confirmingBlock
                      ? "block-participant-confirmation"
                      : undefined
                  }
                  className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta-strong disabled:opacity-60"
                >
                  {blockMutation
                    ? "Actualizando…"
                    : blockStatus.blockedByMe
                      ? "Desbloquear persona"
                      : "Bloquear persona"}
                </button>
              ) : blockStatusPending ? (
                <p
                  role="status"
                  className="px-3 py-2 text-sm text-warm-gray/70"
                >
                  Comprobando bloqueo…
                </p>
              ) : blockStatusError ? (
                <p className="px-3 py-2 text-sm text-red-800">
                  Estado de bloqueo no disponible
                </p>
              ) : null}
            </div>
          </details>
        </div>
      </header>

      {confirmingBlock && blockStatus && !blockStatus.blockedByMe && (
        <section
          id="block-participant-confirmation"
          aria-labelledby="block-participant-title"
          aria-describedby="block-participant-description"
          className="mx-4 mt-3 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 sm:mx-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h3
              id="block-participant-title"
              ref={blockConfirmationHeadingRef}
              tabIndex={-1}
              className="font-bold text-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900"
            >
              ¿Bloquear a {conversation.participantName}?
            </h3>
            <p
              id="block-participant-description"
              className="mt-1 text-sm leading-5 text-amber-950/85"
            >
              No podrá enviarte mensajes nuevos. Conservarás el historial y
              podrás desbloquear a esta persona después.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setActionsOpen(false);
                onCancelBlockConfirmation();
                requestAnimationFrame(() =>
                  moreActionsSummaryRef.current?.focus(),
                );
              }}
              className="min-h-11 rounded-xl border border-amber-900/20 bg-white px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900"
            >
              Mantener conversación
            </button>
            <button
              type="button"
              onClick={onConfirmBlock}
              disabled={blockMutation}
              className="min-h-11 rounded-xl bg-amber-900 px-3 text-sm font-semibold text-white hover:bg-amber-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:opacity-60"
            >
              {blockMutation ? "Bloqueando…" : "Confirmar bloqueo"}
            </button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-gray/8 bg-cream/50 px-4 py-2 text-xs text-warm-gray/80 sm:px-6">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`size-2 rounded-full ${
              connectionState === "retrying"
                ? "bg-amber-600"
                : realtimeConnected
                  ? "bg-green-700"
                  : "bg-warm-gray/45"
            }`}
          />
          {connectionState === "active"
            ? realtimeConnected
              ? "Mensajes en tiempo real"
              : "Actualización automática cada 20 s"
            : "Conexión inestable · reintentando"}
        </span>
        {conversation.unreadCount > 0 && (
          <span className="font-semibold">
            {conversation.unreadCount} sin leer
          </span>
        )}
      </div>

      {readError && (
        <p
          role="status"
          aria-live="polite"
          className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6"
        >
          Los mensajes están disponibles, pero no pudimos actualizar su estado
          de lectura.
          <button
            type="button"
            onClick={onRetryRead}
            disabled={retryingRead}
            className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-900 disabled:opacity-60"
          >
            {retryingRead ? "Actualizando…" : "Reintentar"}
          </button>
        </p>
      )}

      {blockStatusError && (
        <div
          role="alert"
          className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-6"
        >
          <span>
            No se pudo consultar o actualizar el bloqueo. {blockStatusError}
          </span>
          <button
            type="button"
            onClick={onRetryBlockStatus}
            className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-900"
          >
            Reintentar
          </button>
        </div>
      )}

      {selectedConversationBlocked && (
        <p
          role="status"
          className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:mx-6"
        >
          {blockStatus?.blockedByMe
            ? "Bloqueaste a esta persona. No podrá enviarte mensajes nuevos."
            : "Esta persona bloqueó la conversación. No puedes enviar mensajes nuevos."}
        </p>
      )}

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-6"
        >
          {error}
        </p>
      )}
      {showInboxRetry && (
        <button
          type="button"
          onClick={onRetryInbox}
          disabled={retryingInbox}
          className="min-h-11 rounded-xl border border-warm-gray/15 px-4 py-2 text-sm font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
        >
          {retryingInbox ? "Reintentando…" : "Reintentar bandeja"}
        </button>
      )}
    </>
  );
}
