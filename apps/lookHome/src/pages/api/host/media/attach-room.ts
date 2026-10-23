import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null);
  const query = new URLSearchParams();

  if (body?.sortOrder != null) query.set("sortOrder", String(body.sortOrder));
  if (body?.isCover != null) query.set("isCover", String(body.isCover));

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/media/attach/room/${encodeURIComponent(body?.roomId ?? "")}/${encodeURIComponent(body?.mediaId ?? "")}?${query}`,
    method: "POST",
  });

  return Response.json(result.data, { status: result.status });
};
