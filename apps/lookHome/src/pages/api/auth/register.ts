import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      { message: "Body inválido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(buildApiUrl("/auth/register"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return Response.json(
        { message: data?.message || "No se pudo crear la cuenta." },
        { status: response.status, headers: { "Cache-Control": "no-store" } },
      );
    }

    const accessToken = data?.tokens?.accessToken;
    const refreshToken = data?.tokens?.refreshToken;
    if (!accessToken || !refreshToken) {
      return Response.json(
        { message: "El backend no devolvió tokens válidos." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    cookies.set("lh_access_token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: import.meta.env.PROD,
      path: "/",
      maxAge: 60 * 15,
    });
    cookies.set("lh_refresh_token", refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: import.meta.env.PROD,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return Response.json(
      {
        message: data?.message || "Cuenta creada correctamente.",
        user: data?.user ?? null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { message: "No se pudo procesar el registro." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
};
