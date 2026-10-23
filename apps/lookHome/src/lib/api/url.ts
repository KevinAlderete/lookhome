type Query = Record<string, string | number | boolean | null | undefined>;

export function buildApiUrl(
  path: string,
  query?: Query,
  apiUrl = import.meta.env.PUBLIC_API_URL,
) {
  if (!apiUrl) {
    throw new Error("PUBLIC_API_URL no está configurada.");
  }

  const base = new URL(apiUrl);
  const basePath = base.pathname.replace(/\/+$/, "");
  base.pathname = basePath.endsWith("/api") ? basePath : `${basePath}/api`;
  base.search = "";
  base.hash = "";

  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(normalizedPath, `${base.toString().replace(/\/$/, "")}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}
