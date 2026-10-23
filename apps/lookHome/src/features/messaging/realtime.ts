export type MessagingRealtimeEvent = {
  type: string;
  data: Record<string, unknown>;
};

const eventTypes = [
  "status",
  "message.created",
  "message.updated",
  "message.deleted",
  "conversation.read",
  "conversation.blocked",
  "conversation.unblocked",
];

const subscribers = new Set<(event: MessagingRealtimeEvent) => void>();
let source: EventSource | null = null;
let lastConnectionStatus: boolean | null = null;

function publish(event: MessagingRealtimeEvent) {
  if (event.type === "status") {
    lastConnectionStatus = event.data.connected === true;
  } else if (event.type === "connection.open") {
    lastConnectionStatus = true;
  } else if (event.type === "connection.error") {
    lastConnectionStatus = false;
  }
  for (const subscriber of subscribers) subscriber(event);
}

function connect() {
  if (source || typeof EventSource === "undefined") return;
  source = new EventSource("/api/messages/events", { withCredentials: true });
  source.onopen = () => publish({ type: "connection.open", data: {} });
  source.onerror = () => publish({ type: "connection.error", data: {} });
  for (const type of eventTypes) {
    source.addEventListener(type, (event) => {
      let data: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse((event as MessageEvent<string>).data);
        if (parsed && typeof parsed === "object") data = parsed;
      } catch {
        data = {};
      }
      publish({ type, data });
    });
  }
}

export function subscribeToMessageEvents(
  subscriber: (event: MessagingRealtimeEvent) => void,
) {
  subscribers.add(subscriber);
  if (lastConnectionStatus !== null) {
    subscriber({
      type: "status",
      data: { connected: lastConnectionStatus },
    });
  }
  connect();
  return () => {
    subscribers.delete(subscriber);
    if (!subscribers.size && source) {
      source.close();
      source = null;
      lastConnectionStatus = null;
    }
  };
}
