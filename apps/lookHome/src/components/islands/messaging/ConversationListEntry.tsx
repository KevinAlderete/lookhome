import {
  formatConversationListTime,
  formatMessageTimestamp,
} from "@/features/messaging/presentation";
import type { ConversationListItem } from "@/features/messaging/types";

type Props = {
  conversation: ConversationListItem;
  active: boolean;
  onSelect: (conversationId: string) => void;
  setButtonRef: (
    conversationId: string,
    element: HTMLButtonElement | null,
  ) => void;
};

export default function ConversationListEntry({
  conversation,
  active,
  onSelect,
  setButtonRef,
}: Props) {
  const initials = conversation.participantName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div
      role="listitem"
      className="[content-visibility:auto] [contain-intrinsic-size:auto_76px]"
    >
      <button
        ref={(element) => setButtonRef(conversation.id, element)}
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-pressed={active}
        className={`flex min-h-[76px] w-full items-center gap-3 border-b border-warm-gray/8 px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-terracotta-strong ${
          active ? "bg-white" : "hover:bg-white/70"
        }`}
      >
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
            {initials || "P"}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-warm-gray">
              {conversation.participantName}
            </span>
            <time
              dateTime={conversation.lastMessageAt}
              className="shrink-0 text-[10px] text-warm-gray/75"
            >
              {formatConversationListTime(conversation.lastMessageAt)}
            </time>
            {conversation.unreadCount > 0 && (
              <span className="grid min-h-6 min-w-6 shrink-0 place-items-center rounded-full bg-terracotta-strong px-1.5 text-xs font-bold text-white">
                <span aria-hidden="true">{conversation.unreadCount}</span>
                <span className="sr-only">
                  {conversation.unreadCount}{" "}
                  {conversation.unreadCount === 1
                    ? "mensaje sin leer"
                    : "mensajes sin leer"}
                </span>
              </span>
            )}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 whitespace-nowrap rounded-full bg-terracotta/10 px-2 py-0.5 text-[10px] font-semibold text-terracotta-strong">
              {conversation.myRole === "host"
                ? "Como anfitrión"
                : "Como huésped"}
            </span>
            <span className="truncate text-xs font-medium text-warm-gray/80">
              {conversation.contextTitle}
            </span>
          </span>
          <span className="mt-1 block truncate text-xs text-warm-gray/80">
            {conversation.lastMessageSenderName
              ? `${conversation.lastMessageSenderName}: `
              : ""}
            {conversation.lastMessage}
          </span>
          <span className="sr-only">
            Último mensaje: {formatMessageTimestamp(conversation.lastMessageAt)}
          </span>
        </span>
      </button>
    </div>
  );
}
