export type ConversationRole = "host" | "tenant";

export type ConversationListItem = {
  id: string;
  listingId: string | null;
  listingTitle: string | null;
  roomId: string | null;
  roomName: string | null;
  contextIsPublic: boolean;
  contextTitle: string;
  participantName: string;
  participantAvatarUrl: string | null;
  myRole: ConversationRole;
  lastMessage: string;
  lastMessageSenderName: string | null;
  lastMessageAt: string;
  unreadCount: number;
  otherParticipantLastReadAt: string | null;
  relatedBooking: { id: string; status: string } | null;
  updatedAt: string;
};

export type ConversationPage = {
  items: ConversationListItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type ChatMessageItem = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  createdAtIso: string;
  isMine: boolean;
  edited: boolean;
  deleted: boolean;
};

export type MessageCursor = {
  createdAt: string;
  id: string;
};

export type MessagePage = {
  items: ChatMessageItem[];
  pageSize: number;
  hasMore: boolean;
  nextCursor: MessageCursor | null;
  syncedAt: string | null;
};

export type ContactContext = {
  listingId?: string;
  roomId?: string;
};

export type ConversationBlockStatus = {
  blockedByMe: boolean;
  blockedMe: boolean;
};

export type MessageReportReason =
  "scam" | "spam" | "harassment" | "inappropriate" | "other";
