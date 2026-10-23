import type { APIRoute } from "astro";
import { proxyJson } from "@/lib/api/proxy";

export const prerender = false;

const API_URL = import.meta.env.PUBLIC_API_URL;

export const GET: APIRoute = async ({ url }) => {
  const countryCode = url.searchParams.get("countryCode");

  const result = await proxyJson({
    apiUrl: API_URL,
    path: "/geo/tree",
    method: "GET",
    query: {
      countryCode,
    },
  });

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
    },
  });
};
