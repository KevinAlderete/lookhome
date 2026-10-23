import type { LocationSelectionType } from "./dto/resolve-location.dto";

export type LocationFilters = {
  countryCode: string;
  regionId?: string;
  cityId?: string;
  districtId?: string;
};

export type LocationSuggestion = {
  type: LocationSelectionType;
  id: string;
  name: string;
  label: string;
  context: {
    country: string;
    region: string | null;
    city: string | null;
    district: string | null;
  };
  filters: LocationFilters;
};

export function normalizeLocationSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-PE")
    .replace(/\b(?:jr\.?|jiron)\b/gu, "jiron")
    .replace(/\b(?:av\.?|avenida)\b/gu, "avenida")
    .replace(/\b(?:psje\.?|pasaje)\b/gu, "pasaje")
    .replace(/\burb\.?\b/gu, "urbanizacion")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const result = new Set<string>();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    result.add(padded.slice(index, index + 3));
  }
  return result;
}

function trigramSimilarity(left: string, right: string): number {
  const leftTrigrams = trigrams(left);
  const rightTrigrams = trigrams(right);
  if (!leftTrigrams.size || !rightTrigrams.size) return 0;
  let intersection = 0;
  for (const trigram of leftTrigrams) {
    if (rightTrigrams.has(trigram)) intersection += 1;
  }
  return (2 * intersection) / (leftTrigrams.size + rightTrigrams.size);
}

export type LocationMatchTier = 0 | 1 | 2 | 3 | 4;

export function locationMatchTier(
  query: string,
  suggestion: LocationSuggestion,
): LocationMatchTier {
  const normalizedQuery = normalizeLocationSearchText(query);
  if (!normalizedQuery) return 0;

  const normalizedName = normalizeLocationSearchText(suggestion.name);
  const normalizedLabel = normalizeLocationSearchText(suggestion.label);
  if (normalizedName === normalizedQuery || normalizedLabel === normalizedQuery) {
    return 4;
  }
  if (
    normalizedName.startsWith(normalizedQuery) ||
    normalizedLabel.startsWith(normalizedQuery)
  ) {
    return 3;
  }
  if (
    normalizedName.includes(normalizedQuery) ||
    normalizedLabel.includes(normalizedQuery)
  ) {
    return 2;
  }

  // Approximate matching is deliberately a low-priority fallback. It ranks
  // candidates but never rewrites or silently selects the user's input.
  if (normalizedQuery.length < 4) return 0;
  const similarity = Math.max(
    trigramSimilarity(normalizedQuery, normalizedName),
    trigramSimilarity(normalizedQuery, normalizedLabel),
  );
  return similarity >= 0.32 ? 1 : 0;
}

export function locationTypeRank(type: LocationSelectionType): number {
  return { district: 0, city: 1, region: 2, country: 3 }[type];
}
