import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: "/conversations/me",
    query: {
      page: url.searchParams.get("page") ?? 1,
      pageSize: url.searchParams.get("pageSize") ?? 25,
      conversationId: url.searchParams.get("conversationId"),
      perspective: url.searchParams.get("perspective"),
      search: url.searchParams.get("search"),
      unreadOnly: url.searchParams.get("unreadOnly"),
    },
  });

  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json({ message: "Solicitud de origen no permitido." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      { message: "Indica el anuncio o la unidad." },
      { status: 400 },
    );
  }

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: "/conversations",
    method: "POST",
    body,
  });

  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
};
