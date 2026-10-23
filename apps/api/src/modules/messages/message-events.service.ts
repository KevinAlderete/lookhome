import {
  Injectable,
  Logger,
  MessageEvent,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "pg";
import { Observable, Subscriber } from "rxjs";
import { MESSAGE_EVENTS_CHANNEL, MessageRealtimeEvent } from "./message-events";

@Injectable()
export class MessageEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessageEventsService.name);
  private readonly subscribers = new Map<
    string,
    Set<Subscriber<MessageEvent>>
  >();
  private client: Client | null = null;
  private listening = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connecting = false;
  private shuttingDown = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    void this.connect();
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const client = this.client;
    this.client = null;
    this.listening = false;
    if (client) await client.end().catch(() => undefined);
  }

  streamForUser(userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const userSubscribers = this.subscribers.get(userId) ?? new Set();
      userSubscribers.add(subscriber);
      this.subscribers.set(userId, userSubscribers);
      subscriber.next({
        type: "status",
        data: { connected: this.listening },
      });

      const heartbeat = setInterval(() => {
        if (!subscriber.closed) {
          subscriber.next({
            type: "heartbeat",
            data: { at: new Date().toISOString() },
          });
        }
      }, 25_000);

      return () => {
        clearInterval(heartbeat);
        userSubscribers.delete(subscriber);
        if (!userSubscribers.size) this.subscribers.delete(userId);
      };
    });
  }

  private async connect() {
    const connectionString = this.config.get<string>(
      "MESSAGE_EVENTS_DATABASE_URL",
    );
    if (!connectionString || this.connecting || this.shuttingDown) return;

    this.connecting = true;
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 5_000,
    });
    this.client = client;
    client.on("notification", (notification) => {
      if (
        notification.channel !== MESSAGE_EVENTS_CHANNEL ||
        !notification.payload
      )
        return;
      this.deliver(notification.payload);
    });
    client.on("error", () => this.disconnected(client));
    client.on("end", () => this.disconnected(client));

    try {
      await client.connect();
      await client.query(`LISTEN ${MESSAGE_EVENTS_CHANNEL}`);
      if (this.shuttingDown) {
        await client.end().catch(() => undefined);
        return;
      }
      this.listening = true;
      this.logger.log("El canal de eventos de mensajería está conectado.");
      this.broadcastStatus(true);
    } catch {
      this.disconnected(client);
      await client.end().catch(() => undefined);
      this.logger.warn(
        "No se pudo conectar el canal de eventos; el chat continuará usando sondeo automático.",
      );
    } finally {
      this.connecting = false;
    }
  }

  private disconnected(client: Client) {
    if (this.client !== client) return;
    this.client = null;
    this.listening = false;
    this.broadcastStatus(false);
    if (this.shuttingDown || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, 15_000);
    this.reconnectTimer.unref?.();
  }

  private deliver(payload: string) {
    let event: MessageRealtimeEvent;
    try {
      event = JSON.parse(payload) as MessageRealtimeEvent;
    } catch {
      this.logger.warn("Se descartó un evento de mensajería malformado.");
      return;
    }
    if (
      !event.id ||
      !event.type ||
      !event.conversationId ||
      !Array.isArray(event.userIds)
    ) {
      this.logger.warn("Se descartó un evento de mensajería incompleto.");
      return;
    }

    const data = {
      conversationId: event.conversationId,
      actorUserId: event.actorUserId,
      ...(event.messageId ? { messageId: event.messageId } : {}),
      ...(event.readAt ? { readAt: event.readAt } : {}),
    };
    for (const userId of event.userIds) {
      for (const subscriber of this.subscribers.get(userId) ?? []) {
        if (!subscriber.closed) {
          subscriber.next({ id: event.id, type: event.type, data });
        }
      }
    }
  }

  private broadcastStatus(connected: boolean) {
    for (const userSubscribers of this.subscribers.values()) {
      for (const subscriber of userSubscribers) {
        if (!subscriber.closed) {
          subscriber.next({ type: "status", data: { connected } });
        }
      }
    }
  }
}
