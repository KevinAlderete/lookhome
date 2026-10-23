import type { LocationSuggestion } from "./types";

export type LocationInputState = {
  query: string;
  selection: LocationSuggestion | null;
};

export function editLocationQuery(query: string): LocationInputState {
  return { query, selection: null };
}

export function selectStructuredLocation(
  selection: LocationSuggestion,
): LocationInputState {
  return { query: "", selection };
}

export function locationSelectionFormFields(
  selection: LocationSuggestion | null,
): Array<{ name: string; value: string }> {
  if (!selection) return [];
  return [
    { name: "locationType", value: selection.type },
    { name: "locationId", value: selection.id },
    { name: "countryCode", value: selection.filters.countryCode },
    ...(selection.filters.regionId
      ? [{ name: "regionId", value: selection.filters.regionId }]
      : []),
    ...(selection.filters.cityId
      ? [{ name: "cityId", value: selection.filters.cityId }]
      : []),
    ...(selection.filters.districtId
      ? [{ name: "districtId", value: selection.filters.districtId }]
      : []),
  ];
}

export function isCurrentRequest(
  signal: AbortSignal,
  requestId: number,
  currentRequestId: number,
) {
  return !signal.aborted && requestId === currentRequestId;
}

export function confirmationAfterPinMove(
  wasConfirmed: boolean,
  previous: { lat: string; lng: string },
  next: { lat: string; lng: string },
) {
  return (
    wasConfirmed && previous.lat === next.lat && previous.lng === next.lng
  );
}

export function coordinatesForAcceptedAddress(
  current: { lat: number | null; lng: number | null },
  suggestion: { lat: number; lng: number },
  preserveCurrentPin: boolean,
) {
  return preserveCurrentPin && current.lat != null && current.lng != null
    ? { lat: current.lat, lng: current.lng }
    : { lat: suggestion.lat, lng: suggestion.lng };
}
