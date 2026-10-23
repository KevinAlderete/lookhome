import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const PUT: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null);
  const targetType = body?.targetType === "room" ? "room" : "listing";
  const targetId = typeof body?.targetId === "string" ? body.targetId : "";
  const mediaIds = Array.isArray(body?.mediaIds) ? body.mediaIds : [];

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/media/${targetType}/${encodeURIComponent(targetId)}/order`,
    method: "PUT",
    body: { mediaIds },
  });

  return Response.json(result.data, { status: result.status });
};
