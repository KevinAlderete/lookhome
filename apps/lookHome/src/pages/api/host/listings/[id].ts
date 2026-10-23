import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/host/listings/${encodeURIComponent(params.id ?? "")}`,
    method: "PATCH",
    body: await request.json().catch(() => null),
  });

  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};
