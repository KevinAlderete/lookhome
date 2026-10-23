import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";

export const prerender = false;

export const GET: APIRoute = async ({ url, request }) => {
  const q = url.searchParams.get("q")?.trim() ?? "";
  const requestedType = url.searchParams.get("type");
  const type = ["country", "region", "city", "district"].includes(
    requestedType ?? "",
  )
    ? requestedType
    : undefined;

  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ items: [] }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(
      buildApiUrl("/search/locations/suggest", { q, type }),
      {
        headers: {
          accept: "application/json",
          cookie: request.headers.get("cookie") ?? "",
        },
      },
    );

    const data = await response.json().catch(() => ({ items: [] }));

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({
        items: [],
        message: "No se pudieron cargar las ubicaciones.",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
