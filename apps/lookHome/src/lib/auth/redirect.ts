export function safeInternalRedirect(
  value: string | null | undefined,
  fallback = "/",
) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  const url = new URL(value, "http://lookhome.local");

  return url.origin === "http://lookhome.local"
    ? `${url.pathname}${url.search}${url.hash}`
    : fallback;
}
