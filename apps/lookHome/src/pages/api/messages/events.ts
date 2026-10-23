import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ cookies, request }) => {
  const accessToken = cookies.get("lh_access_token")?.value;
  if (!accessToken) {
    return Response.json({ message: "No autorizado." }, { status: 401 });
  }

  const apiUrl = import.meta.env.PUBLIC_API_URL?.replace(/\/+$/, "");
  if (!apiUrl) {
    return Response.json(
      { message: "El servicio de mensajería no está disponible." },
      { status: 503 },
    );
  }

  try {
    const upstream = await fetch(`${apiUrl}/messages/events`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
      signal: request.signal,
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(upstream.body, {
        status: upstream.status || 502,
        headers: {
          "Cache-Control": "private, no-store",
          "Content-Type":
            upstream.headers.get("Content-Type") ?? "application/json",
        },
      });
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Cache-Control": "private, no-store, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch {
    return Response.json(
      { message: "No se pudo conectar al servicio de mensajería." },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
};
