import type { SearchResultItem } from "@/features/search/types";

export function getInternalHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return "/buscar";
  }

  if (typeof window === "undefined") return href;

  const url = new URL(href, window.location.origin);
  return url.origin === window.location.origin
    ? `${url.pathname}${url.search}${url.hash}`
    : "/buscar";
}

export function toFeatureCollection(items: SearchResultItem[]) {
  return {
    type: "FeatureCollection" as const,
    features: items
      .filter((item) => item.lat != null && item.lng != null)
      .map((item) => ({
        type: "Feature" as const,
        id: item.id,
        properties: {
          id: item.id,
          title: item.title,
          description: item.description ?? "",
          imageUrl: item.imageUrl ?? "",
          priceLabel:
            item.priceLabel ??
            (item.legacyMultipleOffers ? "Ver ofertas" : "Ver precio"),
          href: getInternalHref(item.href),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [item.lng as number, item.lat as number],
        },
      })),
  };
}
