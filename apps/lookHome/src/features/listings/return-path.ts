const HOST_PROFILE_PATH =
  /^\/anfitriones\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ListingReturnTarget = {
  href: string;
  label: string;
};

export function resolveListingReturnTarget(
  value: string | null | undefined,
  origin: string,
): ListingReturnTarget {
  const fallback = { href: "/buscar", label: "Volver a los resultados" };
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const target = new URL(value, origin);
    if (target.origin !== origin) return fallback;
    const href = `${target.pathname}${target.search}${target.hash}`;
    if (target.pathname === "/buscar") return { href, label: fallback.label };
    if (HOST_PROFILE_PATH.test(target.pathname)) {
      return { href, label: "Volver al perfil del anfitrión" };
    }
  } catch {
    return fallback;
  }

  return fallback;
}
