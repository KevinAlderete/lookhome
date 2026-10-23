import type { ReactNode, RefObject } from "react";
import type { ChatMessageItem } from "@/features/messaging/types";
import {
  formatMessageDayLabel,
  isSameMessageGroup,
  shouldShowMessageDayLabel,
} from "@/features/messaging/presentation";

type Props = {
  messages: ChatMessageItem[];
  viewportRef: RefObject<HTMLDivElement | null>;
  hasMoreMessages: boolean;
  loadingOlderMessages: boolean;
  loadingMessages: boolean;
  messageLoadFailed: boolean;
  newMessageCount: number;
  liveAnnouncement: string;
  onScroll: () => void;
  onLoadOlder: () => void;
  onRetry: () => void;
  onJumpToLatest: () => void;
  renderMessage: (
    message: ChatMessageItem,
    index: number,
    showSenderName: boolean,
  ) => ReactNode;
};

export default function MessageTimeline({
  messages,
  viewportRef,
  hasMoreMessages,
  loadingOlderMessages,
  loadingMessages,
  messageLoadFailed,
  newMessageCount,
  liveAnnouncement,
  onScroll,
  onLoadOlder,
  onRetry,
  onJumpToLatest,
  renderMessage,
}: Props) {
  return (
    <>
      <div
        ref={viewportRef}
        onScroll={onScroll}
        role="region"
        tabIndex={0}
        aria-label="Historial de mensajes"
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta-strong sm:px-6"
      >
        {hasMoreMessages && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onLoadOlder}
              disabled={loadingOlderMessages || loadingMessages}
              className="min-h-11 rounded-xl border border-warm-gray/15 bg-white px-4 py-2 text-sm font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              {loadingOlderMessages
                ? "Cargando mensajes…"
                : "Cargar mensajes anteriores"}
            </button>
          </div>
        )}

        {loadingMessages && messages.length === 0 ? (
          <p
            role="status"
            className="py-8 text-center text-sm text-warm-gray/80"
          >
            Cargando mensajes…
          </p>
        ) : messageLoadFailed ? (
          <div className="space-y-3 py-8 text-center">
            <p className="text-sm text-warm-gray/80">
              No se cargó el historial. Comprueba tu conexión e inténtalo de
              nuevo.
            </p>
            <button
              type="button"
              onClick={onRetry}
              disabled={loadingMessages}
              className="min-h-11 rounded-xl border border-warm-gray/15 px-4 py-2 text-sm font-semibold text-warm-gray hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              Reintentar carga
            </button>
          </div>
        ) : messages.length ? (
          <ol role="list" aria-label="Mensajes" className="flex flex-col">
            {messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const showDayLabel = shouldShowMessageDayLabel(
                previousMessage?.createdAtIso,
                message.createdAtIso,
              );
              const sameMessageGroup = isSameMessageGroup(
                previousMessage,
                message,
              );

              return (
                <li
                  key={message.id}
                  className={`flex min-w-0 flex-col [content-visibility:auto] [contain-intrinsic-size:auto_144px] ${
                    index === 0
                      ? "gap-3"
                      : sameMessageGroup
                        ? "mt-1 gap-1"
                        : "mt-4 gap-3"
                  }`}
                >
                  {showDayLabel && (
                    <div className="flex justify-center">
                      <time
                        dateTime={message.createdAtIso}
                        className="rounded-full bg-cream px-3 py-1 text-xs font-semibold text-warm-gray/75"
                      >
                        {formatMessageDayLabel(message.createdAtIso)}
                      </time>
                    </div>
                  )}
                  {renderMessage(message, index, !sameMessageGroup)}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="py-10 text-center text-sm text-warm-gray/80">
            Aún no hay mensajes. Puedes escribir el primero.
          </p>
        )}

        {newMessageCount > 0 && (
          <div className="sticky bottom-2 flex justify-center">
            <button
              type="button"
              onClick={onJumpToLatest}
              className="min-h-11 rounded-full bg-warm-gray px-4 py-2 text-sm font-semibold text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              {newMessageCount}{" "}
              {newMessageCount === 1 ? "mensaje nuevo" : "mensajes nuevos"}
            </button>
          </div>
        )}
      </div>

      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {liveAnnouncement}
      </p>
    </>
  );
}
