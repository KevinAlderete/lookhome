export async function proxyJsonWithAuth(args: {
  apiUrl: string;
  accessToken?: string;
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
}) {
  const { apiUrl, accessToken, path, method = "GET", query, body } = args;

  const url = buildApiUrl(path, query, apiUrl).toString();

  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

export async function proxyFormDataWithAuth(args: {
  apiUrl: string;
  accessToken?: string;
  path: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body: FormData;
}) {
  const { apiUrl, accessToken, path, query, body } = args;
  const response = await fetch(buildApiUrl(path, query, apiUrl), {
    method: "POST",
    headers: {
      accept: "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body,
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

export async function proxyJson(args: {
  apiUrl: string;
  path: string;
  method?: string;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}) {
  const { apiUrl, path, method = "GET", query, body, signal } = args;

  const url = buildApiUrl(path, query, apiUrl);

  const response = await fetch(url.toString(), {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });

  const data = await response.json().catch(() => null);

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}
import { buildApiUrl } from "./url";
