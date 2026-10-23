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
  const refreshToken = cookies.get("lh_refresh_token")?.value;

  try {
    if (accessToken && refreshToken) {
      await fetch(buildApiUrl("/auth/logout"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => null);
    }
  } finally {
    cookies.delete("lh_access_token", { path: "/" });
    cookies.delete("lh_refresh_token", { path: "/" });
  }

  return Response.json(
    {
      message: "Logout correcto.",
    },
    {
      status: 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
};
