import { isSameOriginMutation } from "./same-origin";
import { buildApiUrl } from "./url";

export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;
const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const MAX_MULTIPART_BODY_BYTES =
  MAX_IMAGE_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES;

type ImageUploadResult =
  | { ok: true; file: File }
  | { ok: false; response: Response };

function errorResponse(message: string, status: number) {
  return Response.json(
    { message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readSingleImageUpload(
  request: Request,
  accessToken: string | undefined,
  options: {
    apiUrl?: string;
    requiredRole?: "host";
    verifySession?: boolean;
  } = {},
): Promise<ImageUploadResult> {
  if (!isSameOriginMutation(request)) {
    return {
      ok: false,
      response: errorResponse("Solicitud de origen no permitido.", 403),
    };
  }

  if (!accessToken) {
    return {
      ok: false,
      response: errorResponse("Inicia sesión para subir una imagen.", 401),
    };
  }

  if (options.verifySession && !options.apiUrl) {
    return {
      ok: false,
      response: errorResponse("No pudimos verificar tu sesión. Inténtalo de nuevo.", 503),
    };
  }

  if (options.apiUrl) {
    let session: Response;
    try {
      session = await fetch(buildApiUrl("/auth/me", undefined, options.apiUrl), {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });
    } catch {
      return {
        ok: false,
        response: errorResponse("No pudimos verificar tu sesión. Inténtalo de nuevo.", 503),
      };
    }
    if (session.status === 401 || session.status === 403) {
      return {
        ok: false,
        response: errorResponse("Inicia sesión para subir una imagen.", 401),
      };
    }
    if (!session.ok) {
      return {
        ok: false,
        response: errorResponse("No pudimos verificar tu sesión. Inténtalo de nuevo.", 503),
      };
    }
    if (options.requiredRole) {
      const data = await session.json().catch(() => null);
      const roles = Array.isArray(data?.roles)
        ? data.roles.map((role: unknown) => String(role).toLowerCase())
        : [];
      if (!roles.includes("host") && !roles.includes("admin")) {
        return {
          ok: false,
          response: errorResponse("No tienes permiso para subir fotos de anuncios.", 403),
        };
      }
    }
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength != null) {
    if (!/^\d+$/.test(contentLength)) {
      return {
        ok: false,
        response: errorResponse("La solicitud multipart no es válida.", 400),
      };
    }
    if (Number(contentLength) > MAX_MULTIPART_BODY_BYTES) {
      return {
        ok: false,
        response: errorResponse("La imagen debe pesar 8 MB o menos.", 413),
      };
    }
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data\s*;\s*boundary=/i.test(contentType)) {
    return {
      ok: false,
      response: errorResponse("Envía una imagen en formato multipart.", 400),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      response: errorResponse("Debes seleccionar una imagen.", 400),
    };
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_MULTIPART_BODY_BYTES) {
        await reader.cancel();
        return {
          ok: false,
          response: errorResponse("La imagen debe pesar 8 MB o menos.", 413),
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      response: errorResponse("No pudimos leer la imagen seleccionada.", 400),
    };
  } finally {
    reader.releaseLock();
  }

  try {
    const boundedParts = chunks.map((chunk) => {
      const copy = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(copy).set(chunk);
      return copy;
    });
    const boundedBody = new Blob(boundedParts, { type: contentType });
    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: { "Content-Type": contentType },
      body: boundedBody,
    });
    const form = await boundedRequest.formData();
    const entries = [...form.entries()];
    const file = entries[0]?.[1];
    if (
      entries.length !== 1 ||
      entries[0][0] !== "file" ||
      !(file instanceof File) ||
      file.size <= 0 ||
      file.size > MAX_IMAGE_UPLOAD_BYTES
    ) {
      return {
        ok: false,
        response: errorResponse(
          "Selecciona una imagen de hasta 8 MB.",
          file instanceof File && file.size > MAX_IMAGE_UPLOAD_BYTES ? 413 : 400,
        ),
      };
    }
    return { ok: true, file };
  } catch {
    return {
      ok: false,
      response: errorResponse("No pudimos leer la imagen seleccionada.", 400),
    };
  }
}

export function imageFormData(file: File) {
  const form = new FormData();
  form.append("file", file, file.name || "imagen");
  return form;
}
