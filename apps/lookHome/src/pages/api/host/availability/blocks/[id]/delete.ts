import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const POST: APIRoute = async ({ params, cookies }) => {
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/availability/blocks/${encodeURIComponent(params.id ?? "")}`,
    method: "DELETE",
  });

  return Response.json(result.data, { status: result.status });
};
