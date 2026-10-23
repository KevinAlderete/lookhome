import { apiServer } from "@/lib/api/server";
import { normalizeSearchItem } from "@/features/search/api/server";
import type {
  ProfileUser,
  PublicHostProfile,
  UserSessionRow,
  UserSessionStatus,
} from "../types";

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatDateTime(value: unknown) {
  if (!value) return "—";

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("es-PE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Lima",
  });
}

function normalizeSession(raw: any): UserSessionRow {
  const status: UserSessionStatus = [
    "active",
    "expired",
    "revoked",
    "reauthentication_required",
  ].includes(raw?.status)
    ? raw.status
    : raw?.revokedAt
      ? "revoked"
      : "expired";

  return {
    id: String(raw?.id ?? ""),
    deviceId: raw?.deviceId ?? null,
    userAgent: raw?.userAgent ?? null,
    ip: raw?.ip ?? null,
    createdAt: formatDateTime(raw?.createdAt),
    expiresAt: formatDateTime(raw?.expiresAt),
    lastUsedAt: formatDateTime(raw?.lastUsedAt),
    revokedAt: raw?.revokedAt ? formatDateTime(raw.revokedAt) : null,
    status,
    isCurrent: Boolean(raw?.isCurrent),
  };
}

export async function getProfileMe(
  request: Request,
  accessToken?: string,
): Promise<ProfileUser> {
  const payload = await apiServer<ProfileUser>(request, "/users/me", {
    accessToken,
  });
  return payload;
}

export async function getProfileSessions(
  request: Request,
  accessToken?: string,
): Promise<UserSessionRow[]> {
  const payload = await apiServer<any>(request, "/auth/sessions", {
    accessToken,
  });

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.rows)
        ? payload.rows
        : [];

  return rows.map(normalizeSession);
}

export async function getPublicHostProfile(
  request: Request,
  hostUserId: string,
  page = 1,
): Promise<PublicHostProfile> {
  if (!UUID_V4.test(hostUserId)) {
    throw new Error("El perfil público solicitado no es válido.");
  }

  const payload = await apiServer<any>(
    request,
    `/listings/hosts/${hostUserId}/profile`,
    { query: { page, pageSize: 12 }, accessToken: null },
  );
  return {
    profile: {
      displayName: String(payload?.profile?.displayName ?? "Anfitrión"),
      photoUrl: typeof payload?.profile?.photoUrl === "string"
        ? payload.profile.photoUrl
        : null,
    },
    items: Array.isArray(payload?.items)
      ? payload.items.map(normalizeSearchItem)
      : [],
    total: Number(payload?.total) || 0,
    page: Number(payload?.page) || page,
    pageSize: Number(payload?.pageSize) || 12,
  };
}
