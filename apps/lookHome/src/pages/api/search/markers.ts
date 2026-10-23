import type { APIRoute } from "astro";
import { proxyJson } from "@/lib/api/proxy";
import { normalizeSearchMarkers } from "@/features/search/api/server";

export const prerender = false;

const allowedParams = [
  "q",
  "entityType",
  "countryCode",
  "regionId",
  "cityId",
  "districtId",
  "locationType",
  "locationId",
  "south",
  "west",
  "north",
  "east",
  "minPrice",
  "maxPrice",
  "guests",
  "accommodationType",
  "propertyType",
  "rentalMode",
] as const;

export const GET: APIRoute = async ({ url, request }) => {
  const query = Object.fromEntries(
    allowedParams.flatMap((name) => {
      const value = url.searchParams.get(name);
      return value == null ? [] : [[name, value]];
    }),
  );

  try {
    const result = await proxyJson({
      apiUrl: import.meta.env.PUBLIC_API_URL,
      path: "/search/markers",
      query,
      signal: request.signal,
    });
    return Response.json(
      result.ok ? normalizeSearchMarkers(result.data) : result.data,
      { status: result.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { message: "No se pudieron cargar los anuncios de esta zona." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
