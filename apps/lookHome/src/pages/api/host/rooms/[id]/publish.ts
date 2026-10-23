import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";

export const prerender = false;
export const PATCH: APIRoute = async ({ params, cookies }) => {
  const id = params.id;
  const accessToken = cookies.get("lh_access_token")?.value;

  if (!id || !accessToken) {
    return new Response(JSON.stringify({ message: "No autorizado." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response = await fetch(
    buildApiUrl(`/rooms/${encodeURIComponent(id)}/publish`),
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    },
  );

  const data = await response.json().catch(() => null);

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
};
