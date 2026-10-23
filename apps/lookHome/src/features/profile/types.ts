import type { SearchResultItem } from "@/features/search/types";

export type ProfileUser = {
  id: string;
  email?: string | null;
  phoneE164?: string | null;
  status?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  contactVerification?: {
    email: boolean;
    phone: boolean;
  };
  roles?: string[];
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    displayName?: string | null;
    photoUrl?: string | null;
    locale?: string | null;
    timezone?: string | null;
  } | null;
};

export type PublicHostProfile = {
  profile: {
    displayName: string;
    photoUrl: string | null;
  };
  items: SearchResultItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserSessionStatus =
  | "active"
  | "expired"
  | "revoked"
  | "reauthentication_required";

export type UserSessionRow = {
  id: string;
  deviceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  createdAt?: string | null;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  status: UserSessionStatus;
  isCurrent: boolean;
};
