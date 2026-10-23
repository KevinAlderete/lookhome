import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
  if (!params.bookingId) {
    return Response.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/reviews/booking/${encodeURIComponent(params.bookingId)}/me`,
    method: "GET",
  });

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
};
