import type { GeoCascadeResponse } from "../types";

type GetGeoCascadeParams = {
  countryCode?: string;
  regionId?: string;
  cityId?: string;
};

function buildGeoCascadeUrl(params: GetGeoCascadeParams = {}) {
  const url = new URL("/api/geo/cascade", window.location.origin);

  if (params.countryCode) {
    url.searchParams.set("countryCode", params.countryCode);
  }

  if (params.regionId) {
    url.searchParams.set("regionId", params.regionId);
  }

  if (params.cityId) {
    url.searchParams.set("cityId", params.cityId);
  }

  return url.toString();
}

export async function getGeoCascade(
  params: GetGeoCascadeParams = {},
  signal?: AbortSignal,
): Promise<GeoCascadeResponse> {
  const response = await fetch(buildGeoCascadeUrl(params), {
    method: "GET",
    signal,
    headers: {
      Accept: "application/json",
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo cargar la ubicación.");
  }

  return data as GeoCascadeResponse;
}
