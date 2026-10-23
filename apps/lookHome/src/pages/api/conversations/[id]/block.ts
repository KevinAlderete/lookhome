import type { APIContext, APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies }) => {
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/conversations/${encodeURIComponent(params.id ?? "")}/block-status`,
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};

async function mutateBlock(
  request: Request,
  cookies: APIContext["cookies"],
  id: string | undefined,
  method: "POST" | "DELETE",
) {
  if (!isSameOriginMutation(request)) {
    return Response.json({ message: "Solicitud de origen no permitido." }, { status: 403 });
  }
  if (!id) return Response.json({ message: "Conversación inválida." }, { status: 400 });
  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken: cookies.get("lh_access_token")?.value,
    path: `/conversations/${encodeURIComponent(id)}/block`,
    method,
  });
  return Response.json(result.data, {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const POST: APIRoute = ({ params, request, cookies }) =>
  mutateBlock(request, cookies, params.id, "POST");

export const DELETE: APIRoute = ({ params, request, cookies }) =>
  mutateBlock(request, cookies, params.id, "DELETE");
