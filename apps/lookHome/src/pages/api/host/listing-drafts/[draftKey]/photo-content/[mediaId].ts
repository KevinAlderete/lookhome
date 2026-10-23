import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";

export const prerender = false;

export const GET: APIRoute = async ({ params, cookies, url }) => {
  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json(
      { message: "Inicia sesión para ver las fotos del borrador." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const upstream = await fetch(
      buildApiUrl(
        `/host/listing-drafts/${encodeURIComponent(params.draftKey ?? "")}/photo-content/${encodeURIComponent(params.mediaId ?? "")}`,
        { variant: url.searchParams.get("variant") },
        import.meta.env.PUBLIC_API_URL,
      ),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json(
      { message: "No pudimos cargar la vista previa de la foto." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
