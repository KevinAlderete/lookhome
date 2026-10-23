import { defineMiddleware } from "astro:middleware";
import type { AstroCookies } from "astro";
import { buildApiUrl } from "@/lib/api/url";
function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isProtectedPath(pathname: string) {
  return [
    "/favoritos",
    "/mensajes",
    "/notificaciones",
    "/reservas",
    "/perfil",
    "/publicar",
    "/host",
    "/admin",
  ].some((prefix) => matchesPathPrefix(pathname, prefix));
}

function isHostPath(pathname: string) {
  return matchesPathPrefix(pathname, "/host");
}

function isAdminPath(pathname: string) {
  return matchesPathPrefix(pathname, "/admin");
}

function shouldResolveSession(pathname: string) {
  if (matchesPathPrefix(pathname, "/api") || pathname.startsWith("/_")) {
    return false;
  }

  return !/\.[a-z0-9]+$/i.test(pathname);
}

function extractRoles(user: any): string[] {
  const result = new Set<string>();

  if (Array.isArray(user?.roles)) {
    for (const role of user.roles) {
      if (typeof role === "string") {
        result.add(role.toUpperCase());
        continue;
      }

      if (role && typeof role === "object") {
        const value =
          role.name ?? role.code ?? role.slug ?? role.id ?? role.role;

        if (value) {
          result.add(String(value).toUpperCase());
        }
      }
    }
  }

  return [...result];
}

type AuthRequestResult<T> =
  | { status: "ok"; data: T }
  | { status: "unauthorized" }
  | { status: "unavailable" };

async function fetchMe(accessToken: string): Promise<AuthRequestResult<any>> {
  try {
    const response = await fetch(buildApiUrl("/auth/me"), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
    });

    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "unavailable" };

    return { status: "ok", data: await response.json() };
  } catch {
    return { status: "unavailable" };
  }
}

async function refreshTokens(
  refreshToken: string,
): Promise<AuthRequestResult<any>> {
  try {
    const response = await fetch(buildApiUrl("/auth/refresh"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.status === 401) return { status: "unauthorized" };
    if (!response.ok) return { status: "unavailable" };

    return { status: "ok", data: await response.json() };
  } catch {
    return { status: "unavailable" };
  }
}

function readJwtExp(token: string): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof parsed.exp === "number" && Number.isFinite(parsed.exp)
      ? parsed.exp
      : null;
  } catch {
    return null;
  }
}

function needsTokenRefresh(token: string): boolean {
  const exp = readJwtExp(token);
  if (exp == null) return true;
  return exp - Date.now() / 1000 <= 30;
}

async function ensureFreshAccessToken(context: {
  cookies: AstroCookies;
}): Promise<"ok" | "refreshed" | "missing" | "invalid" | "unavailable"> {
  const accessToken = context.cookies.get("lh_access_token")?.value ?? null;

  if (accessToken && !needsTokenRefresh(accessToken)) {
    return "ok";
  }

  const refreshToken = context.cookies.get("lh_refresh_token")?.value ?? null;
  if (!refreshToken) return "missing";

  const refreshed = await refreshTokens(refreshToken);

  if (refreshed.status === "ok") {
    const newAccessToken = refreshed.data?.tokens?.accessToken;
    const newRefreshToken = refreshed.data?.tokens?.refreshToken;

    if (!newAccessToken || !newRefreshToken) {
      return "unavailable";
    }

    context.cookies.set("lh_access_token", newAccessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: import.meta.env.PROD,
      path: "/",
      maxAge: 60 * 15,
    });

    context.cookies.set("lh_refresh_token", newRefreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: import.meta.env.PROD,
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return "refreshed";
  }

  if (refreshed.status === "unauthorized") {
    context.cookies.delete("lh_access_token", { path: "/" });
    context.cookies.delete("lh_refresh_token", { path: "/" });
    return "invalid";
  }

  return "unavailable";
}

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  const { pathname, search } = context.url;

  if (matchesPathPrefix(pathname, "/api")) {
    await ensureFreshAccessToken(context);
    return next();
  }

  if (!shouldResolveSession(pathname)) {
    return next();
  }

  const accessToken = context.cookies.get("lh_access_token")?.value ?? null;
  const refreshToken = context.cookies.get("lh_refresh_token")?.value ?? null;
  let sessionUnavailable = false;

  if (import.meta.env.PUBLIC_API_URL) {
    let payload: any = null;
    const meResult = accessToken
      ? await fetchMe(accessToken)
      : { status: "unauthorized" as const };

    if (meResult.status === "ok") {
      payload = meResult.data;
    } else if (meResult.status === "unavailable") {
      sessionUnavailable = true;
    } else if (refreshToken) {
      const refreshed = await refreshTokens(refreshToken);

      if (refreshed.status === "ok") {
        const newAccessToken = refreshed.data?.tokens?.accessToken;
        const newRefreshToken = refreshed.data?.tokens?.refreshToken;

        if (newAccessToken && newRefreshToken) {
          context.cookies.set("lh_access_token", newAccessToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: import.meta.env.PROD,
            path: "/",
            maxAge: 60 * 15,
          });

          context.cookies.set("lh_refresh_token", newRefreshToken, {
            httpOnly: true,
            sameSite: "lax",
            secure: import.meta.env.PROD,
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
          });

          const refreshedMe = await fetchMe(newAccessToken);

          if (refreshedMe.status === "ok") {
            payload = refreshedMe.data;
          } else {
            sessionUnavailable = true;
          }
        } else {
          sessionUnavailable = true;
        }
      } else if (refreshed.status === "unauthorized") {
        context.cookies.delete("lh_access_token", { path: "/" });
        context.cookies.delete("lh_refresh_token", { path: "/" });
      } else {
        sessionUnavailable = true;
      }
    }

    if (payload) {
      context.locals.user = payload.user ?? payload;
    }
  }

  const user = context.locals.user;
  const roles = extractRoles(user);

  const isAuthPage = pathname === "/login" || pathname === "/registro";

  if (isAuthPage && user) {
    return context.redirect("/");
  }

  if (isProtectedPath(pathname) && sessionUnavailable) {
    return new Response("No se pudo verificar la sesión. Inténtalo de nuevo.", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": "5",
      },
    });
  }

  if (isProtectedPath(pathname) && !user) {
    const callbackUrl = encodeURIComponent(`${pathname}${search}`);
    return context.redirect(`/login?redirect=${callbackUrl}`);
  }

  if (
    isHostPath(pathname) &&
    !roles.some((r) => ["HOST", "ADMIN"].includes(r))
  ) {
    return context.redirect("/");
  }

  if (isAdminPath(pathname) && !roles.includes("ADMIN")) {
    return context.redirect("/");
  }

  return next();
});
