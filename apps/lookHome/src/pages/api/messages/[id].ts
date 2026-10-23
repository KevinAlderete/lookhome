import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json({ message: "Solicitud de origen no permitido." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      { message: "Escribe el mensaje actualizado." },
      { status: 400 },
    );
  }
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/messages/${encodeURIComponent(params.id ?? "")}`,
    method: "PATCH",
    body,
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
};

export const DELETE: APIRoute = async ({ params, cookies, request }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json({ message: "Solicitud de origen no permitido." }, { status: 403 });
  }
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/messages/${encodeURIComponent(params.id ?? "")}`,
    method: "DELETE",
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
};
