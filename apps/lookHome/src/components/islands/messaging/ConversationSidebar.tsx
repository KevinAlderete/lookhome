import { useState } from "react";
import ConversationListEntry from "./ConversationListEntry";
import type { RefObject } from "react";
import type {
  ConversationListItem,
  ConversationRole,
} from "@/features/messaging/types";

type Props = {
  conversations: ConversationListItem[];
  selectedConversationId: string | null;
  mobileView: "list" | "conversation";
  headingRef: RefObject<HTMLHeadingElement | null>;
  canFilterByRole: boolean;
  perspective?: ConversationRole;
  searchQuery: string;
  unreadOnly: boolean;
  startingContact: boolean;
  hasMoreConversations: boolean;
  loadingMoreConversations: boolean;
  error: string | null;
  retryingInbox: boolean;
  onSelectConversation: (conversationId: string) => void;
  onSetConversationButtonRef: (
    conversationId: string,
    element: HTMLButtonElement | null,
  ) => void;
  onLoadMoreConversations: () => void;
  onRetryInbox: () => void;
};

export default function ConversationSidebar({
  conversations,
  selectedConversationId,
  mobileView,
  headingRef,
  canFilterByRole,
  perspective,
  searchQuery,
  unreadOnly,
  startingContact,
  hasMoreConversations,
  loadingMoreConversations,
  error,
  retryingInbox,
  onSelectConversation,
  onSetConversationButtonRef,
  onLoadMoreConversations,
  onRetryInbox,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(perspective || unreadOnly),
  );
  const hasActiveFilters = Boolean(
    searchQuery.trim() || unreadOnly || perspective,
  );
  const secondaryFilterCount =
    Number(Boolean(perspective)) + Number(unreadOnly);
  const hostPerspective =
    perspective === "host" || (canFilterByRole && !perspective);

  return (
    <aside
      aria-label="Conversaciones"
      className={`${mobileView === "conversation" ? "hidden" : "flex"} min-h-0 min-w-0 flex-col border-r border-warm-gray/8 bg-cream/70 lg:flex`}
    >
      <div className="border-b border-warm-gray/8 px-5 py-4">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-bold text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
        >
          Conversaciones
        </h2>
        <p className="mt-1 text-xs text-warm-gray/80">
          Ordenadas por actividad reciente.
        </p>
        <form method="get" action="/mensajes" className="mt-4 space-y-2">
          <label htmlFor="conversation-search" className="sr-only">
            Buscar conversaciones por persona u oferta
          </label>
          <input
            id="conversation-search"
            name="search"
            type="search"
            maxLength={100}
            defaultValue={searchQuery}
            placeholder="Buscar conversaciones…"
            autoComplete="off"
            className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 text-sm text-warm-gray placeholder:text-warm-gray/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          />
          <details
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
            className="group rounded-xl border border-warm-gray/12 bg-white px-3"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong">
              <span>Filtros</span>
              <span className="flex items-center gap-2">
                {secondaryFilterCount > 0 && (
                  <span className="rounded-full bg-terracotta/12 px-2 py-0.5 text-xs text-terracotta-strong">
                    {secondaryFilterCount}{" "}
                    {secondaryFilterCount === 1 ? "activo" : "activos"}
                  </span>
                )}
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
              </span>
            </summary>
            <div className="space-y-2 border-t border-warm-gray/10 py-3">
              {canFilterByRole && (
                <div>
                  <label
                    htmlFor="conversation-perspective"
                    className="mb-1 block text-xs font-semibold text-warm-gray"
                  >
                    Conversaciones de
                  </label>
                  <select
                    id="conversation-perspective"
                    name="perspective"
                    defaultValue={perspective ?? "all"}
                    className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 text-sm text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    <option value="all">Todos los roles</option>
                    <option value="host">Como anfitrión</option>
                    <option value="tenant">Como huésped</option>
                  </select>
                </div>
              )}
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-warm-gray">
                <input
                  type="checkbox"
                  name="unreadOnly"
                  value="true"
                  defaultChecked={unreadOnly}
                  className="size-4 accent-terracotta-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
                Solo no leídos
              </label>
            </div>
          </details>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-xl bg-terracotta-strong px-3 text-sm font-semibold text-white hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
            >
              Buscar
            </button>
            {hasActiveFilters && (
              <a
                href="/mensajes"
                className="inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-terracotta-strong underline underline-offset-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Limpiar
              </a>
            )}
          </div>
        </form>
        {hasActiveFilters && (
          <ul
            aria-label="Filtros aplicados"
            className="mt-3 flex list-none flex-wrap gap-1.5 p-0"
          >
            {searchQuery.trim() && (
              <li className="max-w-full truncate rounded-full border border-warm-gray/12 bg-white px-2.5 py-1 text-[11px] text-warm-gray">
                <span className="font-semibold">Búsqueda:</span>{" "}
                <span title={searchQuery}>{searchQuery}</span>
              </li>
            )}
            {perspective && (
              <li className="rounded-full border border-warm-gray/12 bg-white px-2.5 py-1 text-[11px] text-warm-gray">
                {perspective === "host" ? "Como anfitrión" : "Como huésped"}
              </li>
            )}
            {unreadOnly && (
              <li className="rounded-full border border-warm-gray/12 bg-white px-2.5 py-1 text-[11px] text-warm-gray">
                Solo no leídos
              </li>
            )}
          </ul>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        role="list"
      >
        {conversations.map((conversation) => (
          <ConversationListEntry
            key={conversation.id}
            conversation={conversation}
            active={conversation.id === selectedConversationId}
            onSelect={onSelectConversation}
            setButtonRef={onSetConversationButtonRef}
          />
        ))}
        {hasMoreConversations && (
          <div className="p-3">
            <button
              type="button"
              onClick={onLoadMoreConversations}
              disabled={loadingMoreConversations}
              className="min-h-11 w-full rounded-xl border border-warm-gray/15 px-3 py-2 text-sm font-semibold text-warm-gray hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              {loadingMoreConversations
                ? "Cargando…"
                : "Cargar más conversaciones"}
            </button>
          </div>
        )}
        {!conversations.length && !startingContact && !error && (
          <div className="px-5 py-8 text-center text-sm leading-6 text-warm-gray/80">
            {hasActiveFilters ? (
              <>
                <h3 className="font-bold text-warm-gray">
                  No encontramos conversaciones
                </h3>
                <p className="mt-2">
                  {searchQuery.trim()
                    ? "Prueba con otro nombre u oferta, o limpia los filtros."
                    : unreadOnly
                      ? "No tienes conversaciones sin leer con estos filtros."
                      : perspective === "host"
                        ? "No hay conversaciones como anfitrión con estos filtros."
                        : "No hay conversaciones como huésped con estos filtros."}
                </p>
                <a
                  href="/mensajes"
                  className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-warm-gray/15 bg-white px-4 font-semibold text-terracotta-strong hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  Limpiar filtros
                </a>
              </>
            ) : (
              <>
                <p>
                  Aún no tienes conversaciones.{" "}
                  {hostPerspective
                    ? "Las consultas de huéspedes sobre tus anuncios aparecerán aquí."
                    : "Contacta al anfitrión desde la oferta que te interesa."}
                </p>
                {(!canFilterByRole || perspective === "tenant") && (
                  <a
                    href="/buscar"
                    className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-terracotta-strong px-4 font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                  >
                    Explorar anuncios
                  </a>
                )}
              </>
            )}
          </div>
        )}
        {!conversations.length && error && (
          <div className="space-y-3 px-5 py-8 text-center">
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
            <button
              type="button"
              onClick={onRetryInbox}
              disabled={retryingInbox}
              className="min-h-11 rounded-xl border border-warm-gray/15 px-4 text-sm font-semibold text-warm-gray hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              {retryingInbox ? "Reintentando…" : "Reintentar conversaciones"}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
