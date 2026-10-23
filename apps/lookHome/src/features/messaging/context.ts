import type { ContactContext, ConversationRole } from "./types";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMessageContextId(
  value: string | null | undefined,
): value is string {
  return Boolean(value && UUID_V4_PATTERN.test(value));
}

export function conversationPerspectiveFromSearchParams(
  params: URLSearchParams,
  canFilterByRole: boolean,
): ConversationRole | undefined {
  if (!canFilterByRole) return undefined;
  const perspective = params.get("perspective");
  return perspective === "host" || perspective === "tenant"
    ? perspective
    : undefined;
}

export function contactContextFromSearchParams(params: URLSearchParams): {
  context: ContactContext | null;
  invalid: boolean;
} {
  if (params.get("contact") !== "1") return { context: null, invalid: false };
  const listingId = params.get("listingId");
  const roomId = params.get("roomId");
  const hasListing = isMessageContextId(listingId);
  const hasRoom = isMessageContextId(roomId);
  const invalid =
    (!hasListing && !hasRoom) ||
    (listingId !== null && !hasListing) ||
    (roomId !== null && !hasRoom);
  if (invalid) return { context: null, invalid: true };
  return {
    context: {
      ...(hasListing ? { listingId: listingId! } : {}),
      ...(hasRoom ? { roomId: roomId! } : {}),
    },
    invalid: false,
  };
}
