import { buildApiUrl } from "./url";

type RequestInitLike = RequestInit & {
  query?: Record<string, string | number | boolean | null | undefined>;
  accessToken?: string | null;
};

function getAccessTokenFromCookieHeader(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;\s*)lh_access_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function apiServer<T>(
  request: Request,
  path: string,
  init: RequestInitLike = {},
): Promise<T> {
  const { query, headers, accessToken: explicitAccessToken, ...rest } = init;
  const accessToken =
    explicitAccessToken === null
      ? null
      : explicitAccessToken ?? getAccessTokenFromCookieHeader(request);

  const response = await fetch(buildApiUrl(path, query).toString(), {
    ...rest,
    headers: {
      ...(headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || `API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}
