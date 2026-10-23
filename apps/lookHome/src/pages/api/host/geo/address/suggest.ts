import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const GET: APIRoute = async ({ url, cookies }) => {
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: "/host/geo/address/suggest",
    query: {
      q: url.searchParams.get("q") ?? "",
      mode: url.searchParams.get("mode") ?? "autocomplete",
      regionId: url.searchParams.get("regionId"),
      cityId: url.searchParams.get("cityId"),
      districtId: url.searchParams.get("districtId"),
    },
  });

  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};
