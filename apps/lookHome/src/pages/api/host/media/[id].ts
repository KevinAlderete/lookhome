import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";
import { isSameOriginMutation } from "@/lib/api/same-origin";

export const prerender = false;

export const DELETE: APIRoute = async ({ params, cookies, request }) => {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { message: "Solicitud de origen no permitido." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para quitar esta imagen." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = await fetch(
    buildApiUrl(`/media/${encodeURIComponent(params.id ?? "")}`, undefined, import.meta.env.PUBLIC_API_URL),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
  return Response.json(await response.json().catch(() => null), { status: response.status });
};
