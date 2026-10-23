import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";
import { imageFormData, readSingleImageUpload } from "@/lib/api/image-upload";

export const prerender = false;

export const PUT: APIRoute = async ({ params, request, cookies, url }) => {
  const accessToken = cookies.get("lh_access_token")?.value;
  const upload = await readSingleImageUpload(request, accessToken, {
    apiUrl: import.meta.env.PUBLIC_API_URL,
    requiredRole: "host",
    verifySession: true,
  });
  if (!upload.ok) return upload.response;

  try {
    const response = await fetch(
      buildApiUrl(
        `/host/listing-drafts/${encodeURIComponent(params.draftKey ?? "")}/photos/${encodeURIComponent(params.photoKey ?? "")}`,
        {
          sortOrder: url.searchParams.get("sortOrder"),
          isCover: url.searchParams.get("isCover"),
        },
        import.meta.env.PUBLIC_API_URL,
      ),
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: imageFormData(upload.file),
      },
    );
    return Response.json(await response.json().catch(() => null), {
      status: response.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { message: "No pudimos cargar la foto. Inténtalo nuevamente." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};

export const DELETE: APIRoute = async ({ params, cookies }) => {
  const result = await fetch(
    buildApiUrl(
      `/host/listing-drafts/${encodeURIComponent(params.draftKey ?? "")}/photos/${encodeURIComponent(params.photoKey ?? "")}`,
      undefined,
      import.meta.env.PUBLIC_API_URL,
    ),
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        ...(cookies.get("lh_access_token")?.value
          ? { Authorization: `Bearer ${cookies.get("lh_access_token")?.value}` }
          : {}),
      },
    },
  );
  return Response.json(await result.json().catch(() => null), {
    status: result.status,
    headers: { "Cache-Control": "private, no-store" },
  });
};
