import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const POST: APIRoute = async ({ cookies, request }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessToken = cookies.get("lh_access_token")?.value;

  if (!accessToken) {
    cookies.delete("lh_access_token", { path: "/" });
    cookies.delete("lh_refresh_token", { path: "/" });

    return Response.json(
      {
        message: "No hay sesión activa.",
        localLoggedOut: true,
        remoteRevoked: false,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = await fetch(buildApiUrl("/auth/logout-all"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      accept: "application/json",
    },
  }).catch(() => null);

  cookies.delete("lh_access_token", { path: "/" });
  cookies.delete("lh_refresh_token", { path: "/" });

  const data = response ? await response.json().catch(() => null) : null;
  const remoteRevoked = Boolean(response?.ok);

  return Response.json(
    {
      message: remoteRevoked
        ? data?.message || "Todas las sesiones fueron cerradas."
        : "Se cerró esta sesión, pero no se pudo confirmar el cierre de las demás.",
      localLoggedOut: true,
      remoteRevoked,
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
};
