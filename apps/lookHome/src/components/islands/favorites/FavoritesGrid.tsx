import { useMemo, useState } from "react";
import { toggleFavoriteRequest } from "@/features/favorites/api/client";
import {
  addRemovedFavorite,
  canSortFavoritesByPrice,
  filterAndSortFavorites,
  removeFromFavoriteUndoStack,
  type FavoriteModeFilter,
  type FavoriteSort,
} from "@/features/favorites/presentation";
import type { FavoriteItem } from "@/features/favorites/types";
import FavoriteCard from "./FavoriteCard";

type Props = { items: FavoriteItem[] };

export default function FavoritesGrid({ items }: Props) {
  const [savedItems, setSavedItems] = useState(items);
  const [removedItems, setRemovedItems] = useState<FavoriteItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FavoriteModeFilter>("all");
  const [sort, setSort] = useState<FavoriteSort>("recent");

  const priceSortAvailable = canSortFavoritesByPrice(
    filterAndSortFavorites(savedItems, { query, mode }),
    mode,
  );
  const selectedSort =
    sort === "price" && !priceSortAvailable ? "recent" : sort;
  const visibleItems = useMemo(
    () =>
      filterAndSortFavorites(savedItems, {
        query,
        mode,
        sort: selectedSort,
      }),
    [savedItems, query, mode, selectedSort],
  );
  const hasFilters = Boolean(
    query.trim() || mode !== "all" || selectedSort !== "recent",
  );
  const latestRemoved = removedItems[0];

  const changeFavorite = async (
    item: FavoriteItem,
    shouldFavorite: boolean,
  ) => {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await toggleFavoriteRequest({ roomId: item.roomId, shouldFavorite });
      if (shouldFavorite) {
        setSavedItems((current) =>
          current.some((favorite) => favorite.id === item.id)
            ? current
            : [...current, item],
        );
        setRemovedItems((current) =>
          removeFromFavoriteUndoStack(current, item.id),
        );
      } else {
        setSavedItems((current) =>
          current.filter((favorite) => favorite.id !== item.id),
        );
        setRemovedItems((current) => addRemovedFavorite(current, item));
      }
    } catch {
      setError(
        "No pudimos actualizar tus favoritos. Comprueba tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setBusyId(null);
    }
  };

  const clearFilters = () => {
    setQuery("");
    setMode("all");
    setSort("recent");
  };

  return (
    <section aria-label="Anuncios guardados" className="space-y-5">
      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {latestRemoved && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warm-gray/15 bg-white p-4 text-sm text-warm-gray">
          <div role="status" aria-live="polite" className="min-w-0 break-words">
            <p>Quitaste “{latestRemoved.title}” de favoritos.</p>
            {removedItems.length > 1 && (
              <p className="mt-1 text-xs text-warm-gray/70">
                Tienes {removedItems.length} ofertas que puedes recuperar.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={Boolean(busyId)}
              onClick={() => void changeFavorite(latestRemoved, true)}
              aria-label={`Deshacer la acción de quitar ${latestRemoved.title} de favoritos`}
              className="min-h-11 rounded-xl px-4 font-semibold text-terracotta-strong underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong disabled:opacity-60"
            >
              {busyId === latestRemoved.id ? "Restaurando…" : "Deshacer"}
            </button>
            <button
              type="button"
              onClick={() => setRemovedItems([])}
              className="min-h-11 rounded-xl px-3 text-warm-gray/70 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              aria-label="Cerrar avisos de favoritos quitados"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {!savedItems.length ? (
        <div className="rounded-3xl border border-warm-gray/10 bg-white p-8 text-center shadow-[0_12px_36px_rgba(80,76,74,0.07)] sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-terracotta-strong">
            Tu lista personal
          </p>
          <h2 className="mt-2 text-xl font-bold text-warm-gray">
            Aún no tienes favoritos
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-warm-gray/75">
            Guarda ofertas para volver a consultar su modalidad, precio y
            condiciones cuando quieras.
          </p>
          <a
            href="/buscar"
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-terracotta-strong px-5 text-sm font-semibold text-white hover:bg-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
          >
            Explorar ofertas
          </a>
        </div>
      ) : (
        <>
          <section
            aria-label="Buscar y ordenar favoritos"
            className="rounded-2xl border border-warm-gray/10 bg-white p-4 shadow-[0_8px_24px_rgba(80,76,74,0.04)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p
                className="text-sm font-semibold text-warm-gray"
                aria-live="polite"
                aria-atomic="true"
              >
                {visibleItems.length} de {savedItems.length}{" "}
                {savedItems.length === 1
                  ? "oferta guardada"
                  : "ofertas guardadas"}
              </p>
              {hasFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-11 rounded-lg px-3 text-sm font-semibold text-terracotta-strong underline underline-offset-2 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_220px]">
              <div>
                <label
                  htmlFor="favorites-search"
                  className="mb-1 block text-xs font-semibold text-warm-gray"
                >
                  Buscar en tus favoritos
                </label>
                <input
                  id="favorites-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="Nombre, anuncio o ubicación"
                  className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 text-sm text-warm-gray placeholder:text-warm-gray/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                />
              </div>
              <div>
                <label
                  htmlFor="favorites-mode"
                  className="mb-1 block text-xs font-semibold text-warm-gray"
                >
                  Modalidad
                </label>
                <select
                  id="favorites-mode"
                  value={mode}
                  onChange={(event) => {
                    setMode(event.target.value as FavoriteModeFilter);
                    setSort("recent");
                  }}
                  className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 text-sm text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  <option value="all">Todas</option>
                  <option value="nightly">Por noche</option>
                  <option value="monthly">Por mes</option>
                  <option value="unspecified">Por confirmar</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="favorites-sort"
                  className="mb-1 block text-xs font-semibold text-warm-gray"
                >
                  Ordenar por
                </label>
                <select
                  id="favorites-sort"
                  value={selectedSort}
                  onChange={(event) =>
                    setSort(event.target.value as FavoriteSort)
                  }
                  className="h-11 w-full rounded-xl border border-warm-gray/15 bg-white px-3 text-sm text-warm-gray focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
                >
                  <option value="recent">Más recientes</option>
                  <option value="name">Nombre A–Z</option>
                  {priceSortAvailable && (
                    <option value="price">Precio menor a mayor</option>
                  )}
                </select>
              </div>
            </div>
          </section>

          {!visibleItems.length ? (
            <div className="rounded-3xl border border-dashed border-warm-gray/20 bg-white p-8 text-center">
              <h2 className="font-bold text-warm-gray">
                No hay ofertas que coincidan
              </h2>
              <p className="mt-2 text-sm leading-6 text-warm-gray/70">
                Cambia la búsqueda o la modalidad para ver otros favoritos.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 min-h-11 rounded-xl px-4 text-sm font-semibold text-terracotta-strong underline underline-offset-2 hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta-strong"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <FavoriteCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  disabled={Boolean(busyId && busyId !== item.id)}
                  onRemove={() => void changeFavorite(item, false)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
