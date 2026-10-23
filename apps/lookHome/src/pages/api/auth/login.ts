import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();

    const response = await fetch(buildApiUrl("/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          message: data?.message || "No se pudo iniciar sesión.",
        }),
        {
          status: response.status,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const accessToken = data?.tokens?.accessToken;
    const refreshToken = data?.tokens?.refreshToken;

    if (!accessToken || !refreshToken) {
      return new Response(
        JSON.stringify({
          message: "El backend no devolvió tokens válidos.",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
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

    return new Response(
      JSON.stringify({
        message: data?.message || "Login correcto.",
        user: data?.user ?? null,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch {
    return new Response(
      JSON.stringify({
        message: "No se pudo procesar el login.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
};
