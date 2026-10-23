import type { SearchAreaBounds } from "./url-state";

export type SearchUiEventMap = {
  "lookhome:listing-hover": { listingId: string | null };
  "lookhome:marker-hover": { listingId: string | null };
  "lookhome:search-area": SearchAreaBounds;
  "lookhome:sheet-change": { expanded: boolean };
};

declare global {
  interface WindowEventMap {
    "lookhome:listing-hover": CustomEvent<SearchUiEventMap["lookhome:listing-hover"]>;
    "lookhome:marker-hover": CustomEvent<SearchUiEventMap["lookhome:marker-hover"]>;
    "lookhome:search-area": CustomEvent<SearchUiEventMap["lookhome:search-area"]>;
    "lookhome:sheet-change": CustomEvent<SearchUiEventMap["lookhome:sheet-change"]>;
  }
}

export function dispatchSearchUiEvent<K extends keyof SearchUiEventMap>(
  name: K,
  detail: SearchUiEventMap[K],
) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
