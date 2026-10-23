import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies, request }) => {
  const url = new URL(request.url);
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/messages/conversation/${encodeURIComponent(params.id ?? "")}`,
    query: {
      page: url.searchParams.get("page"),
      pageSize: url.searchParams.get("pageSize") ?? 30,
      beforeCreatedAt: url.searchParams.get("beforeCreatedAt"),
      beforeId: url.searchParams.get("beforeId"),
      afterCreatedAt: url.searchParams.get("afterCreatedAt"),
      afterId: url.searchParams.get("afterId"),
      changedSince: url.searchParams.get("changedSince"),
    },
  });

  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
};
