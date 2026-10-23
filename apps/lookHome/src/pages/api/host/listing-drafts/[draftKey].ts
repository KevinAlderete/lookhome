import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

const forward = async (method: "GET" | "PUT", context: Parameters<APIRoute>[0]) => {
  const { params, request, cookies } = context;
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/host/listing-drafts/${encodeURIComponent(params.draftKey ?? "")}`,
    method,
    ...(method === "PUT" ? { body: await request.json().catch(() => null) } : {}),
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};

export const GET: APIRoute = (context) => forward("GET", context);
export const PUT: APIRoute = (context) => forward("PUT", context);
