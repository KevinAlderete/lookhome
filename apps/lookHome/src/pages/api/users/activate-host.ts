import type { APIRoute } from "astro";
import { proxyJsonWithAuth } from "@/lib/api/proxy";

export const prerender = false;

export const POST: APIRoute = async ({ cookies, redirect }) => {
  const accessToken = cookies.get("lh_access_token")?.value;

  if (!accessToken) {
    return redirect("/login?redirect=%2Fpublicar", 303);
  }

  const result = await proxyJsonWithAuth({
    apiUrl: import.meta.env.PUBLIC_API_URL,
    accessToken,
    path: "/users/me/activate-host",
    method: "POST",
  }).catch(() => null);

  if (result?.ok) {
    return redirect("/host/anuncios/nuevo", 303);
  }

  if (result?.status === 401) {
    return redirect("/login?redirect=%2Fpublicar", 303);
  }

  return redirect("/publicar?error=activation", 303);
};
