import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const POST: APIRoute = async ({ params, request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" },
      },
    );
  }
  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para confirmar la carga." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const body = await request.json().catch(() => null);
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken,
    path: `/media/${encodeURIComponent(params.id ?? "")}/complete`,
    method: "POST",
    body,
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};
