import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403 },
    );
  }

  if (!params.id) {
    return Response.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/bookings/${encodeURIComponent(params.id)}/start`,
    method: "PATCH",
  });

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
};
