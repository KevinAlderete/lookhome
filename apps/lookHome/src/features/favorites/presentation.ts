import type {
  FavoriteItem,
  FavoriteRentalMode,
  FavoriteUnavailableReason,
} from "./types";

export type FavoriteModeFilter = "all" | FavoriteRentalMode | "unspecified";

export type FavoriteSort = "recent" | "name" | "price";

const UNAVAILABLE_REASON_LABELS: Record<FavoriteUnavailableReason, string> = {
  listing_deleted: "Anuncio retirado",
  listing_draft: "Anuncio no publicado",
  listing_pending_review: "Anuncio en revisión",
  listing_paused: "Anuncio pausado por el anfitrión",
  listing_suspended: "Anuncio suspendido",
  listing_archived: "Anuncio archivado",
  offer_draft: "Oferta no publicada",
  offer_paused: "Oferta pausada por el anfitrión",
  booking_accepted: "Solicitud aprobada",
  booking_active: "Estancia en curso",
  booking_disputed: "Solicitud en revisión",
};

export function favoriteAvailabilityLabel(reason: FavoriteUnavailableReason) {
  return UNAVAILABLE_REASON_LABELS[reason];
}

export function addRemovedFavorite(stack: FavoriteItem[], item: FavoriteItem) {
  return [item, ...stack.filter((favorite) => favorite.id !== item.id)];
}

export function removeFromFavoriteUndoStack(
  stack: FavoriteItem[],
  favoriteId: string,
) {
  return stack.filter((favorite) => favorite.id !== favoriteId);
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-PE");
}

function recentFirst(left: FavoriteItem, right: FavoriteItem) {
  const leftTime = left.savedAt ? new Date(left.savedAt).getTime() : 0;
  const rightTime = right.savedAt ? new Date(right.savedAt).getTime() : 0;
  return (
    (Number.isFinite(rightTime) ? rightTime : 0) -
      (Number.isFinite(leftTime) ? leftTime : 0) ||
    left.title.localeCompare(right.title, "es-PE")
  );
}

export function canSortFavoritesByPrice(
  items: FavoriteItem[],
  mode: FavoriteModeFilter,
) {
  if (mode === "all" || mode === "unspecified") return false;
  const pricedItems = items.filter(
    (item) => item.rentalMode === mode && item.rentAmount != null,
  );
  if (pricedItems.some((item) => !item.currencyCode)) return false;
  const currencies = new Set(pricedItems.map((item) => item.currencyCode));
  return pricedItems.length > 0 && currencies.size === 1;
}

export function filterAndSortFavorites(
  items: FavoriteItem[],
  options: {
    query?: string;
    mode?: FavoriteModeFilter;
    sort?: FavoriteSort;
  } = {},
) {
  const query = options.query ? normalizeSearch(options.query.trim()) : "";
  const mode = options.mode ?? "all";
  const sort = options.sort ?? "recent";
  const filtered = items.filter((item) => {
    const matchesMode =
      mode === "all" ||
      (mode === "unspecified" ? !item.rentalMode : item.rentalMode === mode);
    const searchableText = normalizeSearch(
      [item.title, item.listingTitle, item.addressLabel]
        .filter(Boolean)
        .join(" "),
    );
    return matchesMode && (!query || searchableText.includes(query));
  });

  if (sort === "name") {
    return filtered.sort((left, right) =>
      left.title.localeCompare(right.title, "es-PE"),
    );
  }
  if (sort === "price" && canSortFavoritesByPrice(filtered, mode)) {
    return filtered.sort((left, right) => {
      if (left.rentAmount == null) return 1;
      if (right.rentAmount == null) return -1;
      return left.rentAmount - right.rentAmount;
    });
  }
  return filtered.sort(recentFirst);
}
