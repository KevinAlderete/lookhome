import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const PATCH: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para cambiar tu contraseña." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { message: "Los datos de contraseña no son válidos." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await proxyJsonWithAuth({
      apiUrl: import.meta.env.PUBLIC_API_URL,
      accessToken,
      path: "/users/me/password",
      method: "PATCH",
      body,
    });
    if (result.ok) {
      cookies.delete("lh_access_token", { path: "/" });
      cookies.delete("lh_refresh_token", { path: "/" });
    }
    return Response.json(
      result.ok ? { ...result.data, requiresLogin: true } : result.data,
      {
      status: result.status,
      headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return Response.json(
      { message: "No pudimos cambiar la contraseña. Inténtalo nuevamente." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
