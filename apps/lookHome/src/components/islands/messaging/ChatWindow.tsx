import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  blockConversationRequest,
  deleteMessageRequest,
  getConversationBlockStatusRequest,
  getConversationMessagesRequest,
  getMyConversationsRequest,
  markConversationReadRequest,
  reportMessageRequest,
  sendMessageRequest,
  startContactRequest,
  unblockConversationRequest,
  updateMessageRequest,
} from "@/features/messaging/api/client";
import { normalizeChatMessage } from "@/features/messaging/normalize";
import { mergeConversationMessages } from "@/features/messaging/merge";
import { subscribeToMessageEvents } from "@/features/messaging/realtime";
import { MAX_MESSAGE_LENGTH } from "@/features/messaging/constants";
import ConversationHeader from "./ConversationHeader";
import ConversationSidebar from "./ConversationSidebar";
import ContactStartPanel from "./ContactStartPanel";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";
import MessageTimeline from "./MessageTimeline";
import type {
  ChatMessageItem,
  ContactContext,
  ConversationBlockStatus,
  ConversationListItem,
  MessageCursor,
  MessageReportReason,
} from "@/features/messaging/types";

const POLL_INTERVAL_MS = 20_000;

type ChatWindowProps = {
  conversations: ConversationListItem[];
  messages: ChatMessageItem[];
  initialHasMoreMessages?: boolean;
  initialMessageCursor?: MessageCursor | null;
  initialMessageSyncedAt?: string | null;
  initialMessagesLoaded?: boolean;
  initialConversationId?: string | null;
  openConversationOnMobile?: boolean;
  hostLayout?: boolean;
  initialConversationUnavailable?: boolean;
  currentUserId?: string | null;
  hasMoreConversations?: boolean;
  perspective?: "tenant" | "host";
  canFilterByRole?: boolean;
  searchQuery?: string;
  unreadOnly?: boolean;
  contactContext?: ContactContext | null;
  initialLoadError?: string | null;
};

function sortMessages(items: ChatMessageItem[]) {
  return [...items].sort((a, b) => {
    const dateOrder = a.createdAtIso.localeCompare(b.createdAtIso);
    return dateOrder || a.id.localeCompare(b.id);
  });
}

function mergeConversations(
  current: ConversationListItem[],
  incoming: ConversationListItem[],
) {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const conversation of incoming) byId.set(conversation.id, conversation);
  return [...byId.values()].sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
      b.id.localeCompare(a.id),
  );
}

function isNearBottom(element: HTMLDivElement | null) {
  if (!element) return true;
  return element.scrollHeight - element.scrollTop - element.clientHeight < 120;
}

function messageCursor(message: ChatMessageItem): MessageCursor {
  return { createdAt: message.createdAtIso, id: message.id };
}

function requestErrorMessage(error: unknown, fallback: string) {
  if (error instanceof TypeError) {
    return `No se pudo conectar. ${fallback}`;
  }
  return error instanceof Error ? error.message : fallback;
}

export default function ChatWindow({
  conversations: initialConversations,
  messages: initialMessages,
  initialHasMoreMessages = false,
  initialMessageCursor = null,
  initialMessageSyncedAt = null,
  initialMessagesLoaded = false,
  initialConversationId,
  openConversationOnMobile = false,
  hostLayout = false,
  initialConversationUnavailable = false,
  currentUserId,
  hasMoreConversations: initialHasMoreConversations = false,
  perspective,
  canFilterByRole = false,
  searchQuery = "",
  unreadOnly = false,
  contactContext,
  initialLoadError,
}: ChatWindowProps) {
  const [activeContactContext, setActiveContactContext] = useState(
    contactContext ?? null,
  );
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(
    contactContext
      ? null
      : initialConversationUnavailable
        ? null
        : (initialConversationId ?? initialConversations[0]?.id ?? null),
  );
  const [localMessages, setLocalMessages] = useState(() =>
    sortMessages(initialMessages),
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageLoadFailed, setMessageLoadFailed] = useState(
    Boolean(initialConversationId && !initialMessagesLoaded),
  );
  const [readErrorConversationId, setReadErrorConversationId] = useState<
    string | null
  >(null);
  const [retryingRead, setRetryingRead] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [loadingMoreConversations, setLoadingMoreConversations] =
    useState(false);
  const [retryingInbox, setRetryingInbox] = useState(false);
  const [startingContact, setStartingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialLoadError ?? null);
  const [connectionState, setConnectionState] = useState<"active" | "retrying">(
    "active",
  );
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "conversation">(
    contactContext || openConversationOnMobile ? "conversation" : "list",
  );
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteConfirmMessageId, setDeleteConfirmMessageId] = useState<
    string | null
  >(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [blockStatus, setBlockStatus] =
    useState<ConversationBlockStatus | null>(null);
  const [blockStatusError, setBlockStatusError] = useState<string | null>(null);
  const [blockMutation, setBlockMutation] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [reportingMessageId, setReportingMessageId] = useState<string | null>(
    null,
  );
  const [reportReason, setReportReason] =
    useState<MessageReportReason>("inappropriate");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportedMessageIds, setReportedMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [hasMoreConversations, setHasMoreConversations] = useState(
    initialHasMoreConversations,
  );
  const [hasMoreMessages, setHasMoreMessages] = useState(
    initialHasMoreMessages,
  );

  const viewportRef = useRef<HTMLDivElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const firstContactFieldRef = useRef<HTMLTextAreaElement>(null);
  const conversationHeadingRef = useRef<HTMLHeadingElement>(null);
  const conversationListHeadingRef = useRef<HTMLHeadingElement>(null);
  const messageElementRefs = useRef(new Map<string, HTMLElement>());
  const editFieldRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const editButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const blockButtonRef = useRef<HTMLButtonElement>(null);
  const blockConfirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const conversationButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const currentUserIdRef = useRef(currentUserId);
  const selectedConversationRef = useRef(selectedConversationId);
  const mobileDefaultSelectionHandledRef = useRef(
    Boolean(contactContext || openConversationOnMobile),
  );
  const previousSelectedConversationRef = useRef<string | null>(null);
  const localMessagesRef = useRef(localMessages);
  const loadedConversationsRef = useRef(
    new Set(
      initialConversationId && initialMessagesLoaded
        ? [initialConversationId]
        : [],
    ),
  );
  const olderCursorRef = useRef(new Map<string, MessageCursor | null>());
  const hasMoreMessagesRef = useRef(new Map<string, boolean>());
  const messageSyncTimesRef = useRef(new Map<string, string>());
  const contactStartedRef = useRef(false);
  const contactDraftRef = useRef("");
  const initialContactRetryRef = useRef<{
    body: string;
    clientMessageId: string;
  } | null>(null);
  const sendLockRef = useRef(false);
  const retryMessagesRef = useRef(
    new Map<string, { body: string; clientMessageId: string }>(),
  );
  const draftsByConversationRef = useRef(new Map<string, string>());
  const scrollAfterUpdateRef = useRef(true);
  const conversationPageRef = useRef(1);
  const refreshNowRef = useRef<(() => void) | null>(null);

  if (initialConversationId) {
    olderCursorRef.current.set(initialConversationId, initialMessageCursor);
    hasMoreMessagesRef.current.set(
      initialConversationId,
      initialHasMoreMessages,
    );
    if (initialMessageSyncedAt) {
      messageSyncTimesRef.current.set(
        initialConversationId,
        initialMessageSyncedAt,
      );
    }
  }

  const selectedMessages = useMemo(
    () =>
      localMessages
        .filter((item) => item.conversationId === selectedConversationId)
        .sort(
          (a, b) =>
            a.createdAtIso.localeCompare(b.createdAtIso) ||
            a.id.localeCompare(b.id),
        ),
    [localMessages, selectedConversationId],
  );
  const selectedConversation = useMemo(
    () =>
      conversations.find((item) => item.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const deferInitialMobileDefault =
    !mobileDefaultSelectionHandledRef.current &&
    !contactContext &&
    !openConversationOnMobile;
  const selectedParticipantInitials = selectedConversation?.participantName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const lastOutgoingMessage = [...selectedMessages]
    .reverse()
    .find((message) => message.isMine);
  const lastOutgoingMessageRead = Boolean(
    lastOutgoingMessage &&
    selectedConversation?.otherParticipantLastReadAt &&
    new Date(selectedConversation.otherParticipantLastReadAt).getTime() >=
      new Date(lastOutgoingMessage.createdAtIso).getTime(),
  );

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    localMessagesRef.current = localMessages;
  }, [localMessages]);

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (
      !deferInitialMobileDefault ||
      !window.matchMedia("(max-width: 767px)").matches
    ) {
      return;
    }
    mobileDefaultSelectionHandledRef.current = true;
    if (!selectedConversationId) return;

    draftsByConversationRef.current.set(selectedConversationId, draft);
    selectedConversationRef.current = null;
    setSelectedConversationId(null);
    setDraft("");
    setHasMoreMessages(false);
    setLoadingMessages(false);
  }, [deferInitialMobileDefault, draft, selectedConversationId]);

  useEffect(() => {
    if (
      selectedConversationId &&
      previousSelectedConversationRef.current !== selectedConversationId
    ) {
      if (
        !deferInitialMobileDefault ||
        !window.matchMedia("(max-width: 767px)").matches
      ) {
        requestAnimationFrame(() =>
          conversationHeadingRef.current?.focus({ preventScroll: true }),
        );
      }
    }
    previousSelectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    if (!editingMessageId) return;
    requestAnimationFrame(() => {
      const field = editFieldRefs.current.get(editingMessageId);
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  }, [editingMessageId]);

  useEffect(() => {
    if (!deleteConfirmMessageId) return;
    requestAnimationFrame(() => deleteConfirmRef.current?.focus());
  }, [deleteConfirmMessageId]);

  useEffect(() => {
    if (!confirmingBlock) return;
    requestAnimationFrame(() => blockConfirmationHeadingRef.current?.focus());
  }, [confirmingBlock]);

  useLayoutEffect(() => {
    if (!scrollAfterUpdateRef.current || !selectedConversationId) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: reducedMotion ? "instant" : "smooth",
    });
    scrollAfterUpdateRef.current = false;
  }, [selectedConversationId, selectedMessages.length]);

  const updateConversationUrl = (
    conversationId: string | null,
    historyMode: "push" | "replace",
  ) => {
    const url = new URL(window.location.href);
    url.searchParams.delete("contact");
    url.searchParams.delete("listingId");
    url.searchParams.delete("roomId");
    if (conversationId) {
      url.searchParams.set("conversationId", conversationId);
    } else {
      url.searchParams.delete("conversationId");
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentState =
      window.history.state && typeof window.history.state === "object"
        ? window.history.state
        : {};
    const nextState = { ...currentState, conversationId };
    if (historyMode === "push") {
      window.history.pushState(nextState, "", nextUrl);
    } else {
      window.history.replaceState(nextState, "", nextUrl);
    }
  };

  const clearContactQuery = (conversationId: string) => {
    updateConversationUrl(conversationId, "replace");
  };

  const refreshConversationList = useCallback(async () => {
    const page = await getMyConversationsRequest(1, 25, perspective, {
      search: searchQuery,
      unreadOnly,
    });
    setConversations((current) => mergeConversations(current, page.items));
    setHasMoreConversations(page.hasMore);
    return page;
  }, [perspective, searchQuery, unreadOnly]);

  const startContact = useCallback(
    async (initialBody: string) => {
      if (
        !activeContactContext ||
        contactStartedRef.current ||
        !currentUserIdRef.current
      )
        return;
      const text = initialBody.trim();
      if (!text) {
        setContactError("Escribe un mensaje para iniciar la conversación.");
        return;
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        setContactError(
          `El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`,
        );
        return;
      }
      contactStartedRef.current = true;
      setStartingContact(true);
      setMobileView("conversation");
      setContactError(null);
      setError(null);

      const previousRetry = initialContactRetryRef.current;
      const retry =
        previousRetry?.body === text
          ? previousRetry
          : { body: text, clientMessageId: crypto.randomUUID() };
      initialContactRetryRef.current = retry;
      try {
        const started = await startContactRequest(
          activeContactContext,
          text,
          retry.clientMessageId,
        );
        const createdConversation = started.conversation;
        const conversationId = createdConversation.id;
        const normalized = normalizeChatMessage(
          started.initialMessage,
          currentUserIdRef.current,
          conversationId,
        );
        initialContactRetryRef.current = null;
        contactDraftRef.current = "";
        scrollAfterUpdateRef.current = true;
        setLocalMessages((current) =>
          mergeConversationMessages(current, [normalized], conversationId),
        );
        draftsByConversationRef.current.delete(conversationId);
        setDraft("");
        setActiveContactContext(null);
        setContactError(null);
        setError(null);
        setLiveAnnouncement("Mensaje enviado.");
        setConversations((current) =>
          mergeConversations(current, [createdConversation]),
        );
        setSelectedConversationId(conversationId);
        setMobileView("conversation");
        setNewMessageCount(0);
        clearContactQuery(conversationId);
        try {
          await refreshConversationList();
        } catch {
          setError(
            "El mensaje se envió, pero no se pudo actualizar la bandeja. Se actualizará automáticamente.",
          );
        }
      } catch (startError) {
        contactStartedRef.current = false;
        setContactError(
          requestErrorMessage(
            startError,
            "Comprueba tu conexión e inténtalo de nuevo. Tu texto se conservó.",
          ),
        );
        contactDraftRef.current = text;
        setDraft(text);
      } finally {
        setStartingContact(false);
      }
    },
    [activeContactContext, refreshConversationList],
  );

  const markSelectedRead = useCallback(async (conversationId: string) => {
    try {
      await markConversationReadRequest(conversationId);
      setConversations((items) =>
        items.map((item) =>
          item.id === conversationId ? { ...item, unreadCount: 0 } : item,
        ),
      );
      setReadErrorConversationId((current) =>
        current === conversationId ? null : current,
      );
      return true;
    } catch {
      setReadErrorConversationId(conversationId);
      return false;
    }
  }, []);

  const retrySelectedRead = async () => {
    if (!selectedConversationId || retryingRead) return;
    setRetryingRead(true);
    await markSelectedRead(selectedConversationId);
    setRetryingRead(false);
  };

  const loadCurrentMessages = useCallback(
    async (conversationId: string, initial: boolean) => {
      const existing = sortMessages(
        localMessagesRef.current.filter(
          (item) => item.conversationId === conversationId,
        ),
      );
      const latest = existing[existing.length - 1];

      if (!initial && latest) {
        let cursor = messageCursor(latest);
        const allIncoming: ChatMessageItem[] = [];
        for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
          const page = await getConversationMessagesRequest(
            conversationId,
            {
              after: cursor,
              pageSize: 50,
              changedSince: messageSyncTimesRef.current.get(conversationId),
            },
            currentUserIdRef.current,
          );
          if (page.syncedAt)
            messageSyncTimesRef.current.set(conversationId, page.syncedAt);
          allIncoming.push(...page.items);
          if (!page.items.length || !page.hasMore || !page.nextCursor) break;
          cursor = page.nextCursor;
        }
        return allIncoming;
      }

      const page = await getConversationMessagesRequest(
        conversationId,
        {
          pageSize: 30,
          changedSince: messageSyncTimesRef.current.get(conversationId),
        },
        currentUserIdRef.current,
      );
      if (page.syncedAt)
        messageSyncTimesRef.current.set(conversationId, page.syncedAt);
      olderCursorRef.current.set(conversationId, page.nextCursor);
      hasMoreMessagesRef.current.set(conversationId, page.hasMore);
      if (selectedConversationRef.current === conversationId) {
        setHasMoreMessages(page.hasMore);
      }
      return page.items;
    },
    [],
  );

  useEffect(() => {
    if (
      deferInitialMobileDefault &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      return;
    }
    if (!selectedConversationId) return;
    let cancelled = false;
    const conversationId = selectedConversationId;
    setMobileView("conversation");
    setError(null);
    setReadErrorConversationId(null);
    setMessageLoadFailed(false);
    setNewMessageCount(0);
    setLoadingMessages(!loadedConversationsRef.current.has(conversationId));

    const load = async () => {
      try {
        const initial = !loadedConversationsRef.current.has(conversationId);
        const wasNearBottom = isNearBottom(viewportRef.current);
        const incoming = await loadCurrentMessages(conversationId, initial);
        if (cancelled || selectedConversationRef.current !== conversationId)
          return;
        setMessageLoadFailed(false);
        if (incoming.length) {
          scrollAfterUpdateRef.current = initial || wasNearBottom;
          setLocalMessages((current) =>
            mergeConversationMessages(current, incoming, conversationId),
          );
        } else if (initial) {
          scrollAfterUpdateRef.current = true;
        }
        loadedConversationsRef.current.add(conversationId);
        await markSelectedRead(conversationId);
      } catch (loadError) {
        if (!cancelled && selectedConversationRef.current === conversationId) {
          setMessageLoadFailed(true);
          setError(
            requestErrorMessage(
              loadError,
              "Comprueba tu conexión e inténtalo de nuevo.",
            ),
          );
        }
      } finally {
        if (!cancelled && selectedConversationRef.current === conversationId) {
          setLoadingMessages(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    deferInitialMobileDefault,
    loadCurrentMessages,
    markSelectedRead,
    selectedConversationId,
  ]);

  useEffect(() => {
    setConfirmingBlock(false);
    if (
      deferInitialMobileDefault &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      setBlockStatus(null);
      setBlockStatusError(null);
      return;
    }
    if (!selectedConversationId) {
      setBlockStatus(null);
      setBlockStatusError(null);
      return;
    }
    let cancelled = false;
    setBlockStatus(null);
    setBlockStatusError(null);
    void getConversationBlockStatusRequest(selectedConversationId)
      .then((status) => {
        if (!cancelled) setBlockStatus(status);
      })
      .catch((statusError) => {
        if (!cancelled)
          setBlockStatusError(
            requestErrorMessage(
              statusError,
              "No se pudo comprobar el estado de bloqueo.",
            ),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [deferInitialMobileDefault, selectedConversationId]);

  const toggleSelectedBlock = async () => {
    const conversationId = selectedConversationId;
    if (!conversationId || blockMutation || !blockStatus) return;
    const shouldUnblock = blockStatus.blockedByMe;
    if (!shouldUnblock && !confirmingBlock) {
      setConfirmingBlock(true);
      return;
    }
    setBlockMutation(true);
    setBlockStatusError(null);
    try {
      const next = shouldUnblock
        ? await unblockConversationRequest(conversationId)
        : await blockConversationRequest(conversationId);
      setBlockStatus(next);
      setLiveAnnouncement(
        shouldUnblock ? "Persona desbloqueada." : "Persona bloqueada.",
      );
      if (!shouldUnblock) {
        setConfirmingBlock(false);
        requestAnimationFrame(() => blockButtonRef.current?.focus());
      }
      setError(null);
    } catch (blockFailure) {
      setBlockStatusError(
        requestErrorMessage(
          blockFailure,
          "No se pudo actualizar el bloqueo. Comprueba tu conexión e inténtalo de nuevo.",
        ),
      );
    } finally {
      setBlockMutation(false);
    }
  };

  const retryBlockStatus = async () => {
    if (!selectedConversationId) return;
    setBlockStatusError(null);
    try {
      setBlockStatus(
        await getConversationBlockStatusRequest(selectedConversationId),
      );
    } catch (blockFailure) {
      setBlockStatusError(
        requestErrorMessage(
          blockFailure,
          "No se pudo consultar el estado de bloqueo.",
        ),
      );
    }
  };

  const retryMessageHistory = async () => {
    const conversationId = selectedConversationId;
    if (!conversationId || loadingMessages) return;
    setLoadingMessages(true);
    setMessageLoadFailed(false);
    setError(null);
    try {
      const page = await getConversationMessagesRequest(
        conversationId,
        { pageSize: 30 },
        currentUserIdRef.current,
      );
      if (selectedConversationRef.current !== conversationId) return;
      setLocalMessages((current) =>
        mergeConversationMessages(current, page.items, conversationId),
      );
      olderCursorRef.current.set(conversationId, page.nextCursor);
      hasMoreMessagesRef.current.set(conversationId, page.hasMore);
      if (page.syncedAt)
        messageSyncTimesRef.current.set(conversationId, page.syncedAt);
      setHasMoreMessages(page.hasMore);
      loadedConversationsRef.current.add(conversationId);
      if (selectedConversationRef.current === conversationId) {
        await markSelectedRead(conversationId);
      }
    } catch (loadError) {
      if (selectedConversationRef.current === conversationId) {
        setMessageLoadFailed(true);
        setError(
          requestErrorMessage(
            loadError,
            "Comprueba tu conexión e inténtalo de nuevo.",
          ),
        );
      }
    } finally {
      if (selectedConversationRef.current === conversationId) {
        setLoadingMessages(false);
      }
    }
  };

  const handleSelectConversation = (conversationId: string) => {
    mobileDefaultSelectionHandledRef.current = true;
    const previousConversationId = selectedConversationRef.current;
    if (previousConversationId && previousConversationId !== conversationId) {
      draftsByConversationRef.current.set(previousConversationId, draft);
    } else if (activeContactContext && !previousConversationId) {
      contactDraftRef.current = draft;
    }
    selectedConversationRef.current = conversationId;
    setActiveContactContext(null);
    setDraft(draftsByConversationRef.current.get(conversationId) ?? "");
    setError(null);
    setSelectedConversationId(conversationId);
    setMobileView("conversation");
    setNewMessageCount(0);
    setBlockStatus(null);
    setBlockStatusError(null);
    setConfirmingBlock(false);
    setHasMoreMessages(hasMoreMessagesRef.current.get(conversationId) ?? false);
    scrollAfterUpdateRef.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.get("conversationId") !== conversationId) {
      updateConversationUrl(conversationId, "push");
    }
    if (selectedConversationRef.current === conversationId) {
      requestAnimationFrame(() => conversationHeadingRef.current?.focus());
    }
  };

  const backToConversationList = () => {
    mobileDefaultSelectionHandledRef.current = true;
    setMobileView("list");
    if (selectedConversationId) updateConversationUrl(null, "replace");
    requestAnimationFrame(() => {
      const selectedButton = selectedConversationId
        ? conversationButtonRefs.current.get(selectedConversationId)
        : null;
      (selectedButton ?? conversationListHeadingRef.current)?.focus();
    });
  };

  useEffect(() => {
    const handlePopState = () => {
      mobileDefaultSelectionHandledRef.current = true;
      const url = new URL(window.location.href);
      const conversationId = url.searchParams.get("conversationId");
      const restoredContactContext =
        url.searchParams.get("contact") === "1"
          ? (contactContext ?? null)
          : null;
      const previousConversationId = selectedConversationRef.current;
      if (previousConversationId) {
        draftsByConversationRef.current.set(previousConversationId, draft);
      }

      const conversation = conversations.find(
        (item) => item.id === conversationId,
      );
      if (!conversation) {
        selectedConversationRef.current = null;
        setSelectedConversationId(null);
        setDraft(restoredContactContext ? contactDraftRef.current : "");
        setActiveContactContext(restoredContactContext);
        setMobileView(restoredContactContext ? "conversation" : "list");
        setNewMessageCount(0);
        setHasMoreMessages(false);
        setLoadingMessages(false);
        setMessageLoadFailed(false);
        setBlockStatus(null);
        setBlockStatusError(null);
        setConfirmingBlock(false);
        if (conversationId) {
          setError(
            "No se pudo restaurar esa conversación. Elige una de la bandeja.",
          );
        } else {
          setError(null);
        }
        requestAnimationFrame(() => {
          if (restoredContactContext) {
            firstContactFieldRef.current?.focus();
            return;
          }
          const previousButton = previousConversationId
            ? conversationButtonRefs.current.get(previousConversationId)
            : null;
          (previousButton ?? conversationListHeadingRef.current)?.focus();
        });
        return;
      }

      selectedConversationRef.current = conversation.id;
      setActiveContactContext(null);
      setDraft(draftsByConversationRef.current.get(conversation.id) ?? "");
      setSelectedConversationId(conversation.id);
      setMobileView("conversation");
      setBlockStatus(null);
      setBlockStatusError(null);
      setConfirmingBlock(false);
      setHasMoreMessages(
        hasMoreMessagesRef.current.get(conversation.id) ?? false,
      );
      setNewMessageCount(0);
      setError(null);
      scrollAfterUpdateRef.current = true;
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [contactContext, conversations, draft]);

  const loadOlderMessages = async () => {
    if (!selectedConversationId || loadingOlderMessages) return;
    const cursor = olderCursorRef.current.get(selectedConversationId);
    if (!cursor) return;
    const conversationId = selectedConversationId;
    const viewport = viewportRef.current;
    const oldHeight = viewport?.scrollHeight ?? 0;
    const oldTop = viewport?.scrollTop ?? 0;
    setLoadingOlderMessages(true);
    setError(null);
    try {
      const page = await getConversationMessagesRequest(
        conversationId,
        { before: cursor, pageSize: 30 },
        currentUserIdRef.current,
      );
      if (selectedConversationRef.current !== conversationId) return;
      scrollAfterUpdateRef.current = false;
      setLocalMessages((current) =>
        mergeConversationMessages(current, page.items, conversationId),
      );
      olderCursorRef.current.set(conversationId, page.nextCursor);
      hasMoreMessagesRef.current.set(conversationId, page.hasMore);
      setHasMoreMessages(page.hasMore);
      requestAnimationFrame(() => {
        const currentViewport = viewportRef.current;
        if (
          !currentViewport ||
          selectedConversationRef.current !== conversationId
        )
          return;
        currentViewport.scrollTop =
          oldTop + currentViewport.scrollHeight - oldHeight;
      });
    } catch (loadError) {
      setError(
        requestErrorMessage(
          loadError,
          "No se pudieron cargar mensajes anteriores. Comprueba tu conexión.",
        ),
      );
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const loadMoreConversations = async () => {
    if (loadingMoreConversations || !hasMoreConversations) return;
    const nextPage = conversationPageRef.current + 1;
    setLoadingMoreConversations(true);
    setError(null);
    try {
      const page = await getMyConversationsRequest(nextPage, 25, perspective, {
        search: searchQuery,
        unreadOnly,
      });
      setConversations((current) => mergeConversations(current, page.items));
      setHasMoreConversations(page.hasMore);
      conversationPageRef.current = nextPage;
    } catch (loadError) {
      setError(
        requestErrorMessage(
          loadError,
          "No se pudieron cargar más conversaciones. Comprueba tu conexión.",
        ),
      );
    } finally {
      setLoadingMoreConversations(false);
    }
  };

  const retryInbox = async () => {
    if (retryingInbox) return;
    setRetryingInbox(true);
    setError(null);
    try {
      const page = await refreshConversationList();
      conversationPageRef.current = 1;
      if (!selectedConversationRef.current && page.items[0]) {
        setSelectedConversationId(page.items[0].id);
      }
    } catch (loadError) {
      setError(
        requestErrorMessage(
          loadError,
          "No se pudieron cargar las conversaciones. Comprueba tu conexión e inténtalo de nuevo.",
        ),
      );
    } finally {
      setRetryingInbox(false);
    }
  };

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const conversationId = selectedConversationId;
    const text = draft.trim();
    if (!text || !conversationId || sendLockRef.current || sending) return;
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`);
      return;
    }

    const previousRetry = retryMessagesRef.current.get(conversationId);
    const retry =
      previousRetry?.body === text
        ? previousRetry
        : { body: text, clientMessageId: crypto.randomUUID() };
    retryMessagesRef.current.set(conversationId, retry);
    sendLockRef.current = true;
    setSending(true);
    setError(null);

    try {
      const created = await sendMessageRequest({
        conversationId,
        body: text,
        clientMessageId: retry.clientMessageId,
      });
      const item = created?.item ?? created;
      const normalized = normalizeChatMessage(
        item,
        currentUserIdRef.current,
        conversationId,
      );
      scrollAfterUpdateRef.current =
        selectedConversationRef.current === conversationId &&
        isNearBottom(viewportRef.current);
      setLocalMessages((current) =>
        mergeConversationMessages(current, [normalized], conversationId),
      );
      retryMessagesRef.current.delete(conversationId);
      draftsByConversationRef.current.delete(conversationId);
      if (selectedConversationRef.current === conversationId) {
        setDraft("");
        setNewMessageCount(0);
      }
      void refreshConversationList().catch(() => undefined);
    } catch (sendError) {
      if (selectedConversationRef.current === conversationId) {
        setError(
          requestErrorMessage(
            sendError,
            "No se pudo enviar el mensaje. El texto se conservó para que puedas reintentarlo.",
          ),
        );
      }
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  };

  const handleEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMessageId || savingEdit) return;
    const text = editDraft.trim();
    if (!text) {
      setError("El mensaje no puede quedar vacío.");
      return;
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      setError(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres.`);
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await updateMessageRequest(editingMessageId, text);
      const normalized = normalizeChatMessage(
        updated,
        currentUserIdRef.current,
        selectedConversationId ?? undefined,
      );
      setLocalMessages((current) =>
        mergeConversationMessages(
          current,
          [normalized],
          normalized.conversationId,
        ),
      );
      setEditingMessageId(null);
      setEditDraft("");
      requestAnimationFrame(() =>
        messageElementRefs.current.get(normalized.id)?.focus(),
      );
      void refreshConversationList().catch(() => undefined);
    } catch (editError) {
      setError(
        requestErrorMessage(
          editError,
          "No se pudo editar el mensaje. El texto se conservó para que puedas reintentarlo.",
        ),
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (message: ChatMessageItem) => {
    if (deletingMessage || !message.isMine || message.deleted) return;
    setDeletingMessage(true);
    setError(null);
    try {
      const deleted = await deleteMessageRequest(message.id);
      const normalized = normalizeChatMessage(
        deleted,
        currentUserIdRef.current,
        message.conversationId,
      );
      setLocalMessages((current) =>
        mergeConversationMessages(
          current,
          [normalized],
          message.conversationId,
        ),
      );
      setDeleteConfirmMessageId(null);
      requestAnimationFrame(() =>
        messageElementRefs.current.get(message.id)?.focus(),
      );
      void refreshConversationList().catch(() => undefined);
    } catch (deleteError) {
      setError(
        requestErrorMessage(
          deleteError,
          "No se pudo eliminar el mensaje. Comprueba tu conexión e inténtalo de nuevo.",
        ),
      );
    } finally {
      setDeletingMessage(false);
    }
  };

  const handleReportMessage = async (message: ChatMessageItem) => {
    if (submittingReport || message.isMine || message.deleted) return;
    setSubmittingReport(true);
    setReportError(null);
    try {
      await reportMessageRequest(message.id, reportReason, reportDetails);
      setReportedMessageIds((current) => new Set(current).add(message.id));
      setReportingMessageId(null);
      setReportDetails("");
      setLiveAnnouncement("El reporte fue enviado al equipo de moderación.");
    } catch (error) {
      setReportError(
        requestErrorMessage(
          error,
          "No se pudo enviar el reporte. Comprueba tu conexión e inténtalo de nuevo.",
        ),
      );
    } finally {
      setSubmittingReport(false);
    }
  };

  useEffect(() => {
    let active = true;
    let timeoutId: number | undefined;
    let inFlight = false;

    const schedule = () => {
      if (!active) return;
      timeoutId = window.setTimeout(
        () => void refresh(),
        realtimeConnected ? 60_000 : POLL_INTERVAL_MS,
      );
    };

    const refresh = async () => {
      if (!active || document.visibilityState !== "visible" || inFlight) return;
      inFlight = true;
      try {
        const conversationId = selectedConversationRef.current;
        if (conversationId) {
          const existing = sortMessages(
            localMessagesRef.current.filter(
              (item) => item.conversationId === conversationId,
            ),
          );
          const wasNearBottom = isNearBottom(viewportRef.current);
          const incoming: ChatMessageItem[] = [];
          let cursor = existing.length
            ? messageCursor(existing[existing.length - 1])
            : null;
          if (!cursor) {
            const page = await getConversationMessagesRequest(
              conversationId,
              {
                pageSize: 30,
                changedSince: messageSyncTimesRef.current.get(conversationId),
              },
              currentUserIdRef.current,
            );
            if (page.syncedAt) {
              messageSyncTimesRef.current.set(conversationId, page.syncedAt);
            }
            incoming.push(...page.items);
            olderCursorRef.current.set(conversationId, page.nextCursor);
            hasMoreMessagesRef.current.set(conversationId, page.hasMore);
            if (selectedConversationRef.current === conversationId) {
              setHasMoreMessages(page.hasMore);
            }
          } else {
            for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
              const page = await getConversationMessagesRequest(
                conversationId,
                {
                  after: cursor,
                  pageSize: 50,
                  changedSince: messageSyncTimesRef.current.get(conversationId),
                },
                currentUserIdRef.current,
              );
              if (page.syncedAt) {
                messageSyncTimesRef.current.set(conversationId, page.syncedAt);
              }
              incoming.push(...page.items);
              if (!page.items.length || !page.hasMore || !page.nextCursor)
                break;
              cursor = page.nextCursor;
            }
          }

          if (
            active &&
            document.visibilityState === "visible" &&
            selectedConversationRef.current === conversationId
          ) {
            if (incoming.length) {
              const existingById = new Map(
                existing.map((item) => [item.id, item]),
              );
              const newCount = incoming.filter(
                (item) => !existingById.has(item.id) && !item.isMine,
              ).length;
              const changedCount = incoming.filter((item) => {
                const oldItem = existingById.get(item.id);
                return Boolean(
                  oldItem &&
                  (oldItem.body !== item.body ||
                    oldItem.edited !== item.edited ||
                    oldItem.deleted !== item.deleted),
                );
              }).length;
              scrollAfterUpdateRef.current = wasNearBottom;
              setLocalMessages((current) =>
                mergeConversationMessages(current, incoming, conversationId),
              );
              if (newCount > 0) {
                const newestIncoming = [...incoming]
                  .reverse()
                  .find((item) => !existingById.has(item.id) && !item.isMine);
                const announcementTime = new Date().toLocaleTimeString(
                  "es-PE",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  },
                );
                setLiveAnnouncement(
                  `${newestIncoming?.senderName ?? "Participante"} envió ${newCount} ${newCount === 1 ? "mensaje nuevo" : "mensajes nuevos"}. ${announcementTime}.`,
                );
              } else if (changedCount > 0) {
                const announcementTime = new Date().toLocaleTimeString(
                  "es-PE",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  },
                );
                setLiveAnnouncement(
                  changedCount === 1
                    ? `Se actualizó un mensaje de la conversación. ${announcementTime}.`
                    : `Se actualizaron ${changedCount} mensajes de la conversación. ${announcementTime}.`,
                );
              }
              if (!wasNearBottom) {
                setNewMessageCount((count) => count + newCount);
              }
              if (newCount > 0) await markSelectedRead(conversationId);
            }
          }
        }

        if (!active || document.visibilityState !== "visible") return;
        const page = await getMyConversationsRequest(1, 25, perspective, {
          search: searchQuery,
          unreadOnly,
        });
        if (active) {
          setConversations((current) =>
            mergeConversations(current, page.items),
          );
          setHasMoreConversations(page.hasMore);
          setConnectionState("active");
          if (!selectedConversationRef.current) setError(null);
        }
      } catch {
        if (active) setConnectionState("retrying");
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const triggerRefresh = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      void refresh();
    };
    refreshNowRef.current = triggerRefresh;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        if (timeoutId) window.clearTimeout(timeoutId);
        return;
      }
      if (timeoutId) window.clearTimeout(timeoutId);
      void refresh();
    };
    const onOffline = () => setConnectionState("retrying");
    const onOnline = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      void refresh();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      active = false;
      if (refreshNowRef.current === triggerRefresh) {
        refreshNowRef.current = null;
      }
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [
    markSelectedRead,
    perspective,
    realtimeConnected,
    searchQuery,
    unreadOnly,
  ]);

  useEffect(() => {
    if (!currentUserId) {
      setRealtimeConnected(false);
      return;
    }
    return subscribeToMessageEvents((event) => {
      if (event.type === "status") {
        setRealtimeConnected(event.data.connected === true);
        return;
      }
      if (event.type === "connection.open") setRealtimeConnected(true);
      if (event.type === "connection.error") setRealtimeConnected(false);
      if (
        event.type === "conversation.blocked" ||
        event.type === "conversation.unblocked"
      ) {
        const eventConversationId = event.data.conversationId;
        const conversationId = selectedConversationRef.current;
        if (
          conversationId &&
          typeof eventConversationId === "string" &&
          eventConversationId === conversationId
        ) {
          void getConversationBlockStatusRequest(conversationId)
            .then((status) => {
              if (selectedConversationRef.current === conversationId) {
                setBlockStatus(status);
                setBlockStatusError(null);
              }
            })
            .catch(() => {
              setBlockStatusError(
                "Vuelve a intentar consultar el estado de bloqueo.",
              );
            });
        }
      }
      refreshNowRef.current?.();
    });
  }, [currentUserId]);

  const contextUrl =
    selectedConversation?.contextIsPublic && selectedConversation?.roomId
      ? `/habitaciones/${encodeURIComponent(selectedConversation.roomId)}`
      : selectedConversation?.contextIsPublic && selectedConversation?.listingId
        ? `/listings/${encodeURIComponent(selectedConversation.listingId)}`
        : null;
  const selectedConversationBlocked =
    blockStatus?.blockedByMe === true || blockStatus?.blockedMe === true;
  const blockStatusPending =
    Boolean(selectedConversation) && !blockStatus && !blockStatusError;
  const relatedBookingUrl = selectedConversation?.relatedBooking
    ? selectedConversation.myRole === "host"
      ? `/host/reservas/${encodeURIComponent(selectedConversation.relatedBooking.id)}`
      : `/reservas/${encodeURIComponent(selectedConversation.relatedBooking.id)}`
    : null;
  const mobilePanelHeight = hostLayout
    ? "h-[calc(100dvh-285px)]"
    : "h-[calc(100dvh-250px)]";
  const setConversationButtonRef = useCallback(
    (conversationId: string, element: HTMLButtonElement | null) => {
      if (element) conversationButtonRefs.current.set(conversationId, element);
      else conversationButtonRefs.current.delete(conversationId);
    },
    [],
  );
  const setMessageElementRef = (
    messageId: string,
    element: HTMLElement | null,
  ) => {
    if (element) messageElementRefs.current.set(messageId, element);
    else messageElementRefs.current.delete(messageId);
  };
  const setEditFieldRef = (
    messageId: string,
    element: HTMLTextAreaElement | null,
  ) => {
    if (element) editFieldRefs.current.set(messageId, element);
    else editFieldRefs.current.delete(messageId);
  };
  const setEditButtonRef = (
    messageId: string,
    element: HTMLButtonElement | null,
  ) => {
    if (element) editButtonRefs.current.set(messageId, element);
    else editButtonRefs.current.delete(messageId);
  };
  const setDeleteButtonRef = (
    messageId: string,
    element: HTMLButtonElement | null,
  ) => {
    if (element) deleteButtonRefs.current.set(messageId, element);
    else deleteButtonRefs.current.delete(messageId);
  };
  const cancelEdit = (messageId: string) => {
    setEditingMessageId(null);
    setEditDraft("");
    requestAnimationFrame(() => editButtonRefs.current.get(messageId)?.focus());
  };
  const cancelDeleteConfirmation = (messageId: string) => {
    setDeleteConfirmMessageId(null);
    requestAnimationFrame(() =>
      deleteButtonRefs.current.get(messageId)?.focus(),
    );
  };
  const startReport = (messageId: string) => {
    setReportingMessageId(messageId);
    setReportError(null);
  };
  const cancelReport = () => {
    setReportingMessageId(null);
    setReportError(null);
    setReportDetails("");
  };
  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (selectedConversationId) {
      draftsByConversationRef.current.set(selectedConversationId, value);
    }
  };
  const jumpToLatestMessages = () => {
    scrollAfterUpdateRef.current = true;
    setNewMessageCount(0);
    const viewport = viewportRef.current;
    if (!viewport) return;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <div
      className={`grid ${mobilePanelHeight} min-h-[380px] max-h-[900px] overflow-hidden rounded-[28px] border border-warm-gray/12 bg-white shadow-[0_18px_50px_rgba(80,76,74,0.08)] lg:h-[min(78dvh,900px)] lg:min-h-[680px] lg:max-h-none lg:grid-cols-[minmax(230px,320px)_minmax(0,1fr)]`}
    >
      <p
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {connectionState === "active"
          ? realtimeConnected
            ? "Los eventos de mensajería en tiempo real están activos."
            : "La actualización automática está activa."
          : "Sin conexión. Se intentará actualizar automáticamente."}
      </p>
      <ConversationSidebar
        conversations={conversations}
        selectedConversationId={selectedConversationId}
        mobileView={mobileView}
        headingRef={conversationListHeadingRef}
        canFilterByRole={canFilterByRole}
        perspective={perspective}
        searchQuery={searchQuery}
        unreadOnly={unreadOnly}
        startingContact={startingContact}
        hasMoreConversations={hasMoreConversations}
        loadingMoreConversations={loadingMoreConversations}
        error={error}
        retryingInbox={retryingInbox}
        onSelectConversation={handleSelectConversation}
        onSetConversationButtonRef={setConversationButtonRef}
        onLoadMoreConversations={() => void loadMoreConversations()}
        onRetryInbox={() => void retryInbox()}
      />

      <section
        aria-label={
          selectedConversation
            ? `Conversación con ${selectedConversation.participantName}`
            : "Chat"
        }
        className={`${mobileView === "list" ? "hidden" : "flex"} min-h-[380px] min-w-0 flex-col lg:min-h-[680px] lg:flex`}
      >
        {selectedConversation ? (
          <>
            <ConversationHeader
              key={selectedConversation.id}
              conversation={selectedConversation}
              contextUrl={contextUrl}
              relatedBookingUrl={relatedBookingUrl}
              participantInitials={selectedParticipantInitials}
              conversationHeadingRef={conversationHeadingRef}
              blockButtonRef={blockButtonRef}
              blockConfirmationHeadingRef={blockConfirmationHeadingRef}
              blockStatus={blockStatus}
              blockStatusPending={blockStatusPending}
              blockStatusError={blockStatusError}
              selectedConversationBlocked={selectedConversationBlocked}
              confirmingBlock={confirmingBlock}
              blockMutation={blockMutation}
              connectionState={connectionState}
              realtimeConnected={realtimeConnected}
              readError={readErrorConversationId === selectedConversation.id}
              retryingRead={retryingRead}
              error={error}
              showInboxRetry={Boolean(error && conversations.length === 0)}
              retryingInbox={retryingInbox}
              onBackToList={backToConversationList}
              onToggleBlock={() => void toggleSelectedBlock()}
              onCancelBlockConfirmation={() => setConfirmingBlock(false)}
              onConfirmBlock={() => void toggleSelectedBlock()}
              onRetryBlockStatus={() => void retryBlockStatus()}
              onRetryRead={() => void retrySelectedRead()}
              onRetryInbox={() => void retryInbox()}
            />

            <MessageTimeline
              messages={selectedMessages}
              viewportRef={viewportRef}
              hasMoreMessages={hasMoreMessages}
              loadingOlderMessages={loadingOlderMessages}
              loadingMessages={loadingMessages}
              messageLoadFailed={messageLoadFailed}
              newMessageCount={newMessageCount}
              liveAnnouncement={liveAnnouncement}
              onScroll={() => {
                if (isNearBottom(viewportRef.current)) setNewMessageCount(0);
              }}
              onLoadOlder={() => void loadOlderMessages()}
              onRetry={() => void retryMessageHistory()}
              onJumpToLatest={jumpToLatestMessages}
              renderMessage={(message, _index, showSenderName) => (
                <MessageBubble
                  message={message}
                  showSenderName={showSenderName}
                  lastOutgoingMessage={message.id === lastOutgoingMessage?.id}
                  lastOutgoingMessageRead={lastOutgoingMessageRead}
                  editing={editingMessageId === message.id}
                  editDraft={editDraft}
                  savingEdit={savingEdit}
                  deletingMessage={deletingMessage}
                  deleteConfirmationOpen={deleteConfirmMessageId === message.id}
                  reported={reportedMessageIds.has(message.id)}
                  reporting={reportingMessageId === message.id}
                  submittingReport={submittingReport}
                  reportReason={reportReason}
                  reportDetails={reportDetails}
                  reportError={reportError}
                  deleteConfirmRef={deleteConfirmRef}
                  setMessageElementRef={setMessageElementRef}
                  setEditFieldRef={setEditFieldRef}
                  setEditButtonRef={setEditButtonRef}
                  setDeleteButtonRef={setDeleteButtonRef}
                  onEditDraftChange={setEditDraft}
                  onSubmitEdit={handleEdit}
                  onCancelEdit={cancelEdit}
                  onStartEdit={(item) => {
                    setEditingMessageId(item.id);
                    setEditDraft(item.body);
                    setError(null);
                  }}
                  onDelete={(item) => void handleDelete(item)}
                  onStartDelete={setDeleteConfirmMessageId}
                  onCancelDelete={cancelDeleteConfirmation}
                  onStartReport={startReport}
                  onReport={(item) => void handleReportMessage(item)}
                  onReportReasonChange={setReportReason}
                  onReportDetailsChange={setReportDetails}
                  onCancelReport={cancelReport}
                />
              )}
            />

            <MessageComposer
              draft={draft}
              sending={sending}
              blocked={selectedConversationBlocked}
              blockStatusKnown={Boolean(blockStatus)}
              blockStatusError={blockStatusError}
              formRef={composerFormRef}
              onDraftChange={handleDraftChange}
              onSubmit={handleSend}
            />
          </>
        ) : activeContactContext ? (
          <ContactStartPanel
            starting={startingContact}
            error={contactError}
            draft={draft}
            fieldRef={firstContactFieldRef}
            onBack={backToConversationList}
            onDraftChange={(value) => {
              setDraft(value);
              contactDraftRef.current = value;
              setContactError(null);
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void startContact(draft);
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
            <h2 className="text-lg font-bold text-warm-gray">
              Selecciona una conversación
            </h2>
            <p className="max-w-sm text-sm leading-6 text-warm-gray/80">
              El historial y las respuestas aparecen aquí. Tus mensajes son
              independientes de las solicitudes de alquiler.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
