import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, cookies, request }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json({ message: "Solicitud de origen no permitido." }, { status: 403 });
  }
  if (!params.id) {
    return new Response(JSON.stringify({ message: "Conversación inválida." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/messages/conversation/${encodeURIComponent(params.id)}/read`,
    method: "PATCH",
  });

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
};
