import type { APIRoute } from "astro";
import { proxyJson } from "@/lib/api/proxy";

export const prerender = false;

const API_URL = import.meta.env.PUBLIC_API_URL;

export const GET: APIRoute = async ({ url }) => {
  const countryCode = url.searchParams.get("countryCode");
  const regionId = url.searchParams.get("regionId");
  const cityId = url.searchParams.get("cityId");

  const result = await proxyJson({
    apiUrl: API_URL,
    path: "/geo/cascade",
    method: "GET",
    query: {
      countryCode,
      regionId,
      cityId,
    },
  });

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
