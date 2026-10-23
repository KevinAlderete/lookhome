import "dotenv/config";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep, join } from "node:path";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { B2StorageService } from "../src/modules/media/b2-storage.service";

type LocalMediaRow = {
  id: string;
  ownerUserId: string | null;
  type: string;
  visibility: "staged" | "public" | "deleting";
  mimeType: string;
  sizeBytes: bigint;
  storageKey: string;
  publicUrl: string | null;
  thumbnailStorageKey: string | null;
  thumbnailPublicUrl: string | null;
  thumbnailSizeBytes: bigint | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  width: number | null;
  height: number | null;
};

type PreparedMedia = {
  media: LocalMediaRow;
  detail: Buffer;
  thumbnail: Buffer | null;
  thumbnailStorageKey: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
};

const APPLY = process.argv.includes("--apply");
const MAX_MIGRATION_OBJECT_BYTES = 32 * 1024 * 1024;

function withinRoot(root: string, key: string) {
  const absoluteRoot = resolve(root);
  const filePath = resolve(absoluteRoot, key);
  const rel = relative(absoluteRoot, filePath);
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error("Se encontró una ruta de archivo inválida; migración cancelada.");
  }
  return filePath;
}

function publicImageUrl(
  apiUrl: string,
  mediaId: string,
  variant: "thumbnail" | "detail",
) {
  return `${apiUrl.replace(/\/$/, "")}/api/media/${encodeURIComponent(mediaId)}/image?variant=${variant}`;
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function verifyB2Object(
  b2: B2StorageService,
  key: string,
  visibility: "public" | "staged",
  expected: Buffer,
) {
  const head = await b2.head(key, visibility);
  if (head.sizeBytes !== expected.length) {
    throw new Error(`La verificación de tamaño falló para un objeto de medios.`);
  }
  const downloaded = await b2.getBuffer(
    key,
    visibility,
    Math.max(expected.length, 1),
  );
  if (sha256(downloaded) !== sha256(expected)) {
    throw new Error("La verificación SHA-256 de un objeto de medios falló.");
  }
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(resolve(root, prefix), { withFileTypes: true }).catch(
    () => [],
  );
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath.replace(/\\/g, "/"));
    }
  }
  return files;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL debe estar configurado.");

  const publicRoot = resolve(
    process.env.UPLOAD_ROOT ?? join(process.cwd(), "uploads"),
  );
  const privateRoot = resolve(
    process.env.PRIVATE_UPLOAD_ROOT ?? join(process.cwd(), "private-uploads"),
  );
  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

  try {
    const target = await prisma.$queryRaw<Array<{ database: string; schema: string }>>`
      SELECT current_database() AS database, current_schema() AS schema
    `;
    const rows = (await prisma.media.findMany({
      where: { storageProvider: "local", visibility: { in: ["staged", "public"] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        ownerUserId: true,
        type: true,
        visibility: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
        publicUrl: true,
        thumbnailStorageKey: true,
        thumbnailPublicUrl: true,
        thumbnailSizeBytes: true,
        thumbnailWidth: true,
        thumbnailHeight: true,
        width: true,
        height: true,
      },
    })) as LocalMediaRow[];

    const unsupported = rows.filter((row) => row.type !== "image");
    if (unsupported.length) {
      throw new Error(
        `Se encontraron ${unsupported.length} medios que no son imágenes; no se migró ningún registro.`,
      );
    }

    const prepared: PreparedMedia[] = [];
    const missing: string[] = [];
    for (const media of rows) {
      if (media.visibility === "deleting") continue;
      const sourceRoot = media.visibility === "staged" ? privateRoot : publicRoot;
      const detailPath = withinRoot(sourceRoot, media.storageKey);
      try {
        await access(detailPath);
      } catch {
        missing.push(media.id);
        continue;
      }
      const detail = await readFile(detailPath);
      if (detail.length > MAX_MIGRATION_OBJECT_BYTES) {
        throw new Error(
          `Un archivo excede ${MAX_MIGRATION_OBJECT_BYTES} bytes; no se migró ningún registro.`,
        );
      }
      if (BigInt(detail.length) !== media.sizeBytes) {
        throw new Error(
          "El tamaño local no coincide con `Media.sizeBytes`; no se migró ningún registro.",
        );
      }

      let thumbnail: Buffer | null = null;
      let thumbnailStorageKey = media.thumbnailStorageKey;
      let thumbnailWidth = media.thumbnailWidth;
      let thumbnailHeight = media.thumbnailHeight;
      if (thumbnailStorageKey) {
        const thumbnailPath = withinRoot(sourceRoot, thumbnailStorageKey);
        try {
          thumbnail = await readFile(thumbnailPath);
        } catch {
          missing.push(media.id);
          continue;
        }
        if (
          media.thumbnailSizeBytes != null &&
          BigInt(thumbnail.length) !== media.thumbnailSizeBytes
        ) {
          throw new Error(
            "El tamaño local de miniatura no coincide con Media; no se migró ningún registro.",
          );
        }
      } else {
        const generated = await sharp(detail, { limitInputPixels: 40_000_000 })
          .rotate()
          .resize(480, 480, { fit: "inside", withoutEnlargement: true })
          .webp({ quality: 76, effort: 4 })
          .toBuffer({ resolveWithObject: true });
        thumbnail = generated.data;
        thumbnailWidth = generated.info.width;
        thumbnailHeight = generated.info.height;
        const base = media.storageKey.replace(/\.[^/.]+$/, "");
        thumbnailStorageKey = `${base}-thumb.webp`;
      }
      prepared.push({
        media,
        detail,
        thumbnail,
        thumbnailStorageKey,
        thumbnailWidth,
        thumbnailHeight,
      });
    }

    const knownPublicKeys = new Set<string>();
    const knownPrivateKeys = new Set<string>();
    for (const media of rows) {
      const keys = [media.storageKey, media.thumbnailStorageKey].filter(
        (key): key is string => Boolean(key),
      );
      const known = media.visibility === "staged" ? knownPrivateKeys : knownPublicKeys;
      for (const key of keys) known.add(key.replace(/\\/g, "/"));
    }
    const localPublicFiles = await listFiles(publicRoot);
    const localPrivateFiles = await listFiles(privateRoot);
    const unreferencedPublicFiles = localPublicFiles.filter(
      (key) => !knownPublicKeys.has(key) && !key.startsWith("pending/"),
    ).length;
    const unreferencedPrivateFiles = localPrivateFiles.filter(
      (key) => !knownPrivateKeys.has(key) && !key.startsWith("pending/"),
    ).length;

    if (missing.length) {
      throw new Error(
        `Faltan archivos locales para ${missing.length} registros Media; no se migró ningún registro.`,
      );
    }

    console.log(
      JSON.stringify(
        {
          mode: APPLY ? "apply" : "dry-run",
          target: target[0],
          localMediaRows: rows.length,
          unreferencedLocalFiles: {
            public: unreferencedPublicFiles,
            private: unreferencedPrivateFiles,
          },
          detailAndThumbnailBytes: prepared.reduce(
            (total, item) => total + item.detail.length + (item.thumbnail?.length ?? 0),
            0,
          ),
          operation: !prepared.length
            ? "No hay filas Media locales; no se subieron objetos ni se actualizaron filas."
            : APPLY
              ? "Se copiarán y verificarán objetos B2 antes de actualizar cada fila. Los originales locales no se eliminan."
              : "Solo inventario: no se crean objetos ni se actualiza Neon. Ejecuta con --apply para copiar y verificar.",
        },
        null,
        2,
      ),
    );

    if (!APPLY || !prepared.length) return;
    const b2 = new B2StorageService();
    b2.settings();
    const apiPublicUrl =
      process.env.API_PUBLIC_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;

    for (const item of prepared) {
      const { media } = item;
      const visibility: "staged" | "public" =
        media.visibility === "public" ? "public" : "staged";
      const detailType = media.mimeType || "application/octet-stream";
      await b2.putBuffer(media.storageKey, item.detail, detailType, visibility);
      await verifyB2Object(b2, media.storageKey, visibility, item.detail);
      if (item.thumbnail && item.thumbnailStorageKey) {
        await b2.putBuffer(
          item.thumbnailStorageKey,
          item.thumbnail,
          "image/webp",
          visibility,
        );
        await verifyB2Object(
          b2,
          item.thumbnailStorageKey,
          visibility,
          item.thumbnail,
        );
      }

      await prisma.$transaction(async (tx) => {
        const current = await tx.media.findUnique({
          where: { id: media.id },
          select: { storageProvider: true, visibility: true, storageKey: true },
        });
        if (
          !current ||
          current.storageProvider !== "local" ||
          current.visibility !== media.visibility ||
          current.storageKey !== media.storageKey
        ) {
          throw new Error("El registro Media cambió durante la migración; vuelve a inventariar.");
        }
        await tx.media.update({
          where: { id: media.id },
          data: {
            storageProvider: "b2",
            publicUrl:
              visibility === "public"
                ? publicImageUrl(apiPublicUrl, media.id, "detail")
                : null,
            thumbnailStorageKey: item.thumbnailStorageKey,
            thumbnailPublicUrl:
              visibility === "public" && item.thumbnailStorageKey
                ? publicImageUrl(apiPublicUrl, media.id, "thumbnail")
                : null,
            thumbnailSizeBytes: item.thumbnail
              ? BigInt(item.thumbnail.length)
              : null,
            thumbnailWidth: item.thumbnailWidth,
            thumbnailHeight: item.thumbnailHeight,
          },
        });
      });
    }

    console.log(`Migrados y verificados ${prepared.length} registros Media. Los archivos locales permanecen como respaldo.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(
    "Migración de medios detenida:",
    error instanceof Error ? error.message : "error desconocido",
  );
  process.exitCode = 1;
});
