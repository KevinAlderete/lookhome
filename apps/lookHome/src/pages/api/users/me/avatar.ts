import type { APIRoute } from "astro";
import { proxyFormDataWithAuth } from "@/lib/api/proxy";
import { imageFormData, readSingleImageUpload } from "@/lib/api/image-upload";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url }) => {
  const accessToken = cookies.get("lh_access_token")?.value;
  const upload = await readSingleImageUpload(request, accessToken, {
    apiUrl: import.meta.env.PUBLIC_API_URL,
    verifySession: true,
  });
  if (!upload.ok) return upload.response;
  const uploadKey = url.searchParams.get("uploadKey") ?? undefined;

  try {
    const result = await proxyFormDataWithAuth({
      apiUrl: import.meta.env.PUBLIC_API_URL,
      accessToken,
      path: "/users/me/avatar",
      query: { uploadKey },
      body: imageFormData(upload.file),
    });
    return Response.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { message: "No pudimos cargar la foto. Inténtalo nuevamente." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
};
