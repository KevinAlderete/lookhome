import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies, url }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para subir una imagen." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = await request.json().catch(() => null);
  const query = new URLSearchParams();
  const sortOrder = url.searchParams.get("sortOrder");
  if (sortOrder != null) query.set("sortOrder", sortOrder);
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken,
    path: `/host/listing-drafts/${encodeURIComponent(params.draftKey ?? "")}/photos/${encodeURIComponent(params.photoKey ?? "")}/upload-intent?${query}`,
    method: "POST",
    body,
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};
