import type { APIRoute } from "astro";
import { buildApiUrl } from "@/lib/api/url";
import { imageFormData, readSingleImageUpload } from "@/lib/api/image-upload";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
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
        "/media/upload",
        { uploadKey: url.searchParams.get("uploadKey") },
        import.meta.env.PUBLIC_API_URL,
      ),
      {
        method: "POST",
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
