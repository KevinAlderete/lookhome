import type { APIRoute } from "astro";
import { proxyJson } from "@/lib/api/proxy";

export const prerender = false;

export const GET: APIRoute = async () => {
  const result = await proxyJson({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    path: "/catalog/amenities",
    method: "GET",
  });

  return Response.json(result.data, { status: result.status });
};
