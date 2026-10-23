type ProfileMutationResponse = { message: string };

async function requestJson<T extends ProfileMutationResponse>(
  url: string,
  method: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "No se pudo completar la solicitud.");
  }

  return data as T;
}

export type UpdateProfileInput = {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  locale?: "es-PE";
  timezone?: "America/Lima";
};

export async function updateProfileRequest(input: UpdateProfileInput) {
  return requestJson<ProfileMutationResponse>(
    "/api/users/me/profile",
    "PATCH",
    input,
  );
}

export async function updatePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return requestJson<ProfileMutationResponse>(
    "/api/users/me/password",
    "PATCH",
    input,
  );
}

export async function uploadAvatarRequest(file: File, uploadKey: string) {
  const intentResponse = await fetch("/api/users/me/avatar/upload-intent", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadKey, sizeBytes: file.size, mimeType: file.type }),
  });
  const intent = await intentResponse.json().catch(() => null);
  if (!intentResponse.ok) {
    throw new Error(intent?.message || "No se pudo preparar la foto.");
  }

  if (intent?.mode === "proxy") {
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `/api/users/me/avatar?uploadKey=${encodeURIComponent(uploadKey)}`,
      { method: "POST", credentials: "include", body: formData },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || "No se pudo actualizar la foto.");
    }
    return data as ProfileMutationResponse & { photoUrl?: string | null };
  }

  if (typeof intent?.mediaId !== "string" || typeof intent?.uploadUrl !== "string") {
    throw new Error("El servidor no devolvió los datos de carga directa.");
  }
  if (!intent.completed) {
    const upload = await fetch(intent.uploadUrl, {
      method: "PUT",
      headers: intent.headers,
      body: file,
    });
    if (!upload.ok) throw new Error("No se pudo subir la foto al almacenamiento.");
  }
  const completeResponse = await fetch("/api/users/me/avatar/complete", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaId: intent.mediaId, uploadKey }),
  });
  const data = await completeResponse.json().catch(() => null);
  if (!completeResponse.ok) {
    throw new Error(data?.message || "No se pudo confirmar la foto.");
  }
  return data as ProfileMutationResponse & { photoUrl?: string | null };
}

export async function revokeSessionRequest(sessionId: string) {
  return requestJson<ProfileMutationResponse & { currentSession: boolean }>(
    `/api/auth/sessions/${encodeURIComponent(sessionId)}`,
    "DELETE",
  );
}

export async function requestEmailVerification() {
  return requestJson<ProfileMutationResponse>(
    "/api/auth/request-email-verification",
    "POST",
  );
}

export async function logoutAllRequest() {
  return requestJson<
    ProfileMutationResponse & { localLoggedOut: boolean; remoteRevoked: boolean }
  >("/api/auth/logout-all", "POST");
}
