import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json({ message: "Solicitud de origen no permitido." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);

  if (!body) {
    return new Response(JSON.stringify({ message: "Body inválido." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: "/bookings",
    method: "POST",
    body,
  });

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" },
  });
};
