import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para verificar tu correo." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const result = await proxyJsonWithAuth({
      apiUrl: import.meta.env.PUBLIC_API_URL,
      accessToken,
      path: "/auth/request-email-verification",
      method: "POST",
    });
    return Response.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { message: "No pudimos solicitar el correo de verificación." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
