import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const DELETE: APIRoute = async ({ params, request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sessionId = params.sessionId ?? "";
  if (!UUID_V4.test(sessionId)) {
    return Response.json(
      { message: "La sesión seleccionada no es válida." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para administrar tus sesiones." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await proxyJsonWithAuth({
      apiUrl: import.meta.env.PUBLIC_API_URL,
      accessToken,
      path: `/auth/sessions/${sessionId}`,
      method: "DELETE",
    });
    const currentSession = Boolean(result.ok && result.data?.currentSession);
    if (currentSession) {
      cookies.delete("lh_access_token", { path: "/" });
      cookies.delete("lh_refresh_token", { path: "/" });
    }

    return Response.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { message: "No pudimos cerrar esta sesión. Inténtalo nuevamente." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
