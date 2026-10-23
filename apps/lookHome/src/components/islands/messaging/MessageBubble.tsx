import type { FormEvent, RefObject } from "react";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/constants";
import type {
  ChatMessageItem,
  MessageReportReason,
} from "@/features/messaging/types";

type Props = {
  message: ChatMessageItem;
  showSenderName: boolean;
  lastOutgoingMessage: boolean;
  lastOutgoingMessageRead: boolean;
  editing: boolean;
  editDraft: string;
  savingEdit: boolean;
  deletingMessage: boolean;
  deleteConfirmationOpen: boolean;
  reported: boolean;
  reporting: boolean;
  submittingReport: boolean;
  reportReason: MessageReportReason;
  reportDetails: string;
  reportError: string | null;
  deleteConfirmRef: RefObject<HTMLButtonElement | null>;
  setMessageElementRef: (
    messageId: string,
    element: HTMLElement | null,
  ) => void;
  setEditFieldRef: (
    messageId: string,
    element: HTMLTextAreaElement | null,
  ) => void;
  setEditButtonRef: (
    messageId: string,
    element: HTMLButtonElement | null,
  ) => void;
  setDeleteButtonRef: (
    messageId: string,
    element: HTMLButtonElement | null,
  ) => void;
  onEditDraftChange: (value: string) => void;
  onSubmitEdit: (event: FormEvent<HTMLFormElement>) => void;
  onCancelEdit: (messageId: string) => void;
  onStartEdit: (message: ChatMessageItem) => void;
  onDelete: (message: ChatMessageItem) => void;
  onStartDelete: (messageId: string) => void;
  onCancelDelete: (messageId: string) => void;
  onStartReport: (messageId: string) => void;
  onReport: (message: ChatMessageItem) => void;
  onReportReasonChange: (reason: MessageReportReason) => void;
  onReportDetailsChange: (details: string) => void;
  onCancelReport: () => void;
};

export default function MessageBubble({
  message,
  showSenderName,
  lastOutgoingMessage,
  lastOutgoingMessageRead,
  editing,
  editDraft,
  savingEdit,
  deletingMessage,
  deleteConfirmationOpen,
  reported,
  reporting,
  submittingReport,
  reportReason,
  reportDetails,
  reportError,
  deleteConfirmRef,
  setMessageElementRef,
  setEditFieldRef,
  setEditButtonRef,
  setDeleteButtonRef,
  onEditDraftChange,
  onSubmitEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onStartDelete,
  onCancelDelete,
  onStartReport,
  onReport,
  onReportReasonChange,
  onReportDetailsChange,
  onCancelReport,
}: Props) {
  const revealDesktopActions =
    "xl:group-hover/message:max-h-32 xl:group-focus-within/message:max-h-32 xl:group-hover/message:overflow-visible xl:group-focus-within/message:overflow-visible xl:group-hover/message:opacity-100 xl:group-focus-within/message:opacity-100 xl:group-hover/message:pointer-events-auto xl:group-focus-within/message:pointer-events-auto xl:group-hover/message:mt-2 xl:group-focus-within/message:mt-2";
  const hiddenDesktopActions =
    "xl:max-h-0 xl:overflow-hidden xl:opacity-0 xl:pointer-events-none xl:mt-0";
  const ownActionVisibility = deleteConfirmationOpen
    ? "xl:max-h-32 xl:overflow-visible xl:opacity-100 xl:pointer-events-auto xl:mt-2"
    : hiddenDesktopActions;
  const otherActionVisibility =
    reporting || reported
      ? "xl:max-h-none xl:overflow-visible xl:opacity-100 xl:pointer-events-auto xl:mt-2"
      : hiddenDesktopActions;

  return (
    <article
      ref={(element) => setMessageElementRef(message.id, element)}
      tabIndex={-1}
      aria-label={`${message.senderName}, ${message.createdAt}`}
      className={`group/message max-w-[90%] rounded-2xl px-4 py-3 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong sm:max-w-[78%] ${
        message.isMine
          ? "self-end bg-terracotta-strong text-white"
          : "self-start bg-cream text-warm-gray"
      }`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs font-semibold opacity-85">
        {showSenderName && <span>{message.senderName}</span>}
        <time dateTime={message.createdAtIso}>{message.createdAt}</time>
        {message.edited && !message.deleted && <span>Editado</span>}
      </div>

      {editing ? (
        <form onSubmit={onSubmitEdit} className="space-y-2">
          <label className="sr-only" htmlFor={`edit-${message.id}`}>
            Editar mensaje
          </label>
          <textarea
            ref={(element) => setEditFieldRef(message.id, element)}
            id={`edit-${message.id}`}
            name="editedMessage"
            value={editDraft}
            onChange={(event) => onEditDraftChange(event.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-describedby={`edit-message-length-${message.id}`}
            autoComplete="off"
            rows={3}
            className="min-h-20 w-full rounded-lg border border-warm-gray/20 bg-white px-3 py-2 text-sm text-warm-gray outline-none focus-visible:ring-2 focus-visible:ring-terracotta-strong"
          />
          <div className="flex flex-wrap justify-end gap-2 text-warm-gray">
            <button
              type="button"
              onClick={() => onCancelEdit(message.id)}
              className="min-h-11 rounded-lg px-3 text-xs font-semibold hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingEdit || !editDraft.trim()}
              className="min-h-11 rounded-lg bg-terracotta-strong px-3 text-xs font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              {savingEdit ? "Guardando…" : "Guardar"}
            </button>
          </div>
          <p
            id={`edit-message-length-${message.id}`}
            className="text-right text-[11px] text-warm-gray/80"
          >
            Caracteres: {editDraft.length}/{MAX_MESSAGE_LENGTH}
          </p>
        </form>
      ) : (
        <p
          className={`whitespace-pre-wrap break-words text-sm leading-6 ${message.deleted ? "italic opacity-80" : ""}`}
        >
          {message.body}
        </p>
      )}

      {message.isMine && !message.deleted && !editing && (
        <div
          className={`mt-2 flex flex-wrap items-center justify-end gap-2 transition-[opacity,max-height,margin] duration-150 motion-reduce:transition-none ${ownActionVisibility} ${deleteConfirmationOpen ? "" : revealDesktopActions}`}
        >
          <button
            type="button"
            ref={(element) => setEditButtonRef(message.id, element)}
            onClick={() => onStartEdit(message)}
            aria-label={`Editar tu mensaje, enviado ${message.createdAt}`}
            className="min-h-11 rounded-lg px-2 text-xs font-semibold underline underline-offset-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Editar
          </button>
          {deleteConfirmationOpen ? (
            <span className="flex flex-wrap items-center gap-1 rounded-lg bg-black/10 px-2 py-1">
              <span className="px-1 text-xs">¿Eliminar este mensaje?</span>
              <button
                type="button"
                ref={deleteConfirmRef}
                onClick={() => onDelete(message)}
                disabled={deletingMessage}
                className="min-h-11 rounded-md px-2 text-xs font-bold underline hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
              >
                {deletingMessage ? "Eliminando…" : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => onCancelDelete(message.id)}
                className="min-h-11 rounded-md px-2 text-xs font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Cancelar
              </button>
            </span>
          ) : (
            <button
              type="button"
              ref={(element) => setDeleteButtonRef(message.id, element)}
              onClick={() => onStartDelete(message.id)}
              aria-label={`Eliminar tu mensaje, enviado ${message.createdAt}`}
              className="min-h-11 rounded-lg px-2 text-xs font-semibold underline underline-offset-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Eliminar
            </button>
          )}
        </div>
      )}

      {!message.isMine && !message.deleted && (
        <div
          className={`mt-2 flex justify-end transition-[opacity,max-height,margin] duration-150 motion-reduce:transition-none ${otherActionVisibility} ${reporting || reported ? "" : revealDesktopActions}`}
        >
          {reported ? (
            <p role="status" className="text-xs text-warm-gray/75">
              Reporte enviado a moderación.
            </p>
          ) : reporting ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onReport(message);
              }}
              className="w-full space-y-2 border-t border-warm-gray/10 pt-3"
            >
              <label
                htmlFor={`report-reason-${message.id}`}
                className="block text-xs font-semibold"
              >
                Motivo del reporte
              </label>
              <select
                id={`report-reason-${message.id}`}
                value={reportReason}
                onChange={(event) =>
                  onReportReasonChange(
                    event.target.value as MessageReportReason,
                  )
                }
                className="min-h-11 w-full rounded-lg border border-warm-gray/20 bg-white px-3 text-sm text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                <option value="scam">Posible estafa</option>
                <option value="spam">Spam</option>
                <option value="harassment">Acoso</option>
                <option value="inappropriate">Contenido inapropiado</option>
                <option value="other">Otro motivo</option>
              </select>
              <label
                htmlFor={`report-details-${message.id}`}
                className="block text-xs font-semibold"
              >
                Detalles (opcional)
              </label>
              <textarea
                id={`report-details-${message.id}`}
                value={reportDetails}
                onChange={(event) => onReportDetailsChange(event.target.value)}
                maxLength={1000}
                rows={2}
                autoComplete="off"
                placeholder="Añade información para el equipo de moderación…"
                className="w-full resize-y rounded-lg border border-warm-gray/20 bg-white px-3 py-2 text-sm text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              />
              {reportError && (
                <p role="alert" className="text-xs text-red-800">
                  {reportError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={submittingReport}
                  onClick={onCancelReport}
                  className="min-h-11 rounded-lg px-3 text-xs font-semibold hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="min-h-11 rounded-lg bg-warm-gray px-3 text-xs font-semibold text-white hover:bg-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
                >
                  {submittingReport ? "Enviando…" : "Enviar reporte"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => onStartReport(message.id)}
              aria-label={`Reportar mensaje de ${message.senderName}, enviado ${message.createdAt}`}
              className="min-h-11 rounded-lg px-2 text-xs font-semibold underline underline-offset-2 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Reportar mensaje
            </button>
          )}
        </div>
      )}

      {message.isMine && !message.deleted && lastOutgoingMessage && (
        <p
          className="mt-1 text-right text-[11px] opacity-75"
          aria-label={
            lastOutgoingMessageRead
              ? "El otro participante leyó este mensaje"
              : "Mensaje enviado"
          }
        >
          {lastOutgoingMessageRead ? "Leído" : "Enviado"}
        </p>
      )}
    </article>
  );
}
