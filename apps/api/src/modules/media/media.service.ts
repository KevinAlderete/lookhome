import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import sharp from "sharp";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { CreateMediaDto } from "./dto/create-media.dto";
import { MediaTypeDto } from "./dto/create-media.dto";
import { MAX_IMAGE_UPLOAD_BYTES } from "./upload-limits";
import { B2StorageService } from "./b2-storage.service";

type MediaUploadScope = "listing" | "listing-draft" | "profile";
type ProcessedImage = {
  detail: { data: Buffer; width: number; height: number };
  thumbnail: { data: Buffer; width: number; height: number };
};

const MAX_IMAGE_PIXELS = 40_000_000;
const DETAIL_MAX_EDGE = 1600;
const THUMBNAIL_MAX_EDGE = 480;
const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const DEFAULT_USER_STORAGE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
const UNREFERENCED_MEDIA_RETENTION_MS = 24 * 60 * 60 * 1000;
const MEDIA_CLEANUP_BATCH_SIZE = 100;

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly b2: B2StorageService = new B2StorageService(),
  ) {}

  async create(currentUserId: string, input: CreateMediaDto) {
    const owner = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true },
    });

    if (!owner) {
      throw new BadRequestException("Usuario autenticado no existe.");
    }

    const media = await this.prisma.media.create({
      data: {
        owner: {
          connect: { id: currentUserId },
        },
        type: input.type,
        visibility: "public",
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        storageProvider: input.storageProvider,
        storageKey: input.storageKey,
        publicUrl: input.publicUrl ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        durationSec: input.durationSec ?? null,
        hashSha256: input.hashSha256 ?? null,
      },
    });

    return {
      message: "Media creado correctamente.",
      media,
    };
  }

  async findOne(user: any, id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            phoneE164: true,
          },
        },
      },
    });

    if (!media) {
      throw new NotFoundException("Media no encontrado.");
    }
    if (media.visibility === "deleting") {
      throw new NotFoundException("Media no encontrado.");
    }

    this.assertMediaOwner(user, media.ownerUserId);
    return {
      id: media.id,
      type: media.type,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      publicUrl: media.publicUrl,
      thumbnailPublicUrl: media.thumbnailPublicUrl,
      width: media.width,
      height: media.height,
      createdAt: media.createdAt,
    };
  }

  async remove(user: any, id: string) {
    const exists = await this.prisma.media.findUnique({
      where: { id },
      select: { id: true, ownerUserId: true },
    });

    if (!exists) {
      throw new NotFoundException("Media no encontrado.");
    }

    if (!this.isPrivileged(user) && exists.ownerUserId !== user.id) {
      throw new ForbiddenException("No eres propietario de este archivo.");
    }

    const queued = await this.prisma.$transaction((tx) =>
      this.markDeletingIfUnreferenced(tx, id),
    );
    if (queued) await this.cleanupDeletingMedia([id]);

    return {
      removed: queued,
      message: queued
        ? "Media retirado correctamente."
        : "El archivo sigue asociado a otro contenido y se conservó.",
    };
  }

  async removeFromListing(user: any, listingId: string, mediaId: string) {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((role: any) => String(typeof role === "string" ? role : role?.name ?? role?.code ?? role?.slug ?? role?.role ?? role?.id).toLowerCase())
      : [];
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, ...(roles.includes("admin") ? {} : { hostUserId: user.id }) },
      include: { _count: { select: { rooms: true } }, rooms: { take: 2, select: { id: true } } },
    });
    if (!listing) throw new NotFoundException("Anuncio no encontrado.");
    if (listing._count.rooms > 1) {
      throw new ConflictException("La galería de un anuncio anterior con varias ofertas queda protegida hasta una revisión.");
    }

    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: { id: true, ownerUserId: true },
    });
    if (!media) return { message: "La foto ya se había quitado de la galería." };
    this.assertMediaOwner(user, media.ownerUserId);
    const roomId = listing.rooms[0]?.id;
    const [listingLink, roomLink] = await Promise.all([
      this.prisma.listingMedia.findUnique({ where: { listingId_mediaId: { listingId, mediaId } }, select: { mediaId: true } }),
      roomId
        ? this.prisma.roomMedia.findUnique({ where: { roomId_mediaId: { roomId, mediaId } }, select: { mediaId: true } })
        : null,
    ]);
    if (!listingLink && !roomLink) throw new NotFoundException("La foto no pertenece a este anuncio.");

    const queued = await this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, mediaId);
      await this.migrateSingleRoomGalleryToListing(tx, listingId);
      await tx.listingMedia.deleteMany({ where: { listingId, mediaId } });
      await this.reorderListingGallery(tx, listingId);
      return this.markDeletingIfUnreferenced(tx, mediaId, true);
    });

    if (queued) await this.cleanupDeletingMedia([mediaId]);
    return { message: "Foto quitada de la galería del anuncio." };
  }

  async attachToListing(
    user: any,
    listingId: string,
    mediaId: string,
    sortOrder = 0,
    isCover = false,
  ) {
    this.assertSortOrder(sortOrder);
    const [listing, media] = await Promise.all([
      this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { id: true },
      }),
      this.prisma.media.findUnique({
        where: { id: mediaId },
        select: { id: true, ownerUserId: true, type: true, visibility: true },
      }),
    ]);

    if (!listing) {
      throw new BadRequestException("listingId no existe.");
    }

    if (!media) {
      throw new BadRequestException("mediaId no existe.");
    }
    if (media.type !== "image") {
      throw new BadRequestException("La galería solo admite imágenes.");
    }
    if (media.visibility !== "public" && media.visibility !== "staged") {
      throw new BadRequestException("La foto todavía no está disponible para la galería pública.");
    }

    this.assertMediaOwner(user, media.ownerUserId);

    const promotedIds: string[] = [];
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await this.lockMedia(tx, mediaId);
        const current = await tx.media.findUnique({
          where: { id: mediaId },
          select: { visibility: true },
        });
        if (!current) throw new NotFoundException("Media no encontrado.");
        if (current.visibility === "staged") {
          if (await this.hasMediaReferences(tx, mediaId)) {
            throw new ConflictException("La foto staged ya está asociada a otro contenido.");
          }
          await this.promoteStagedPhotos(tx, [mediaId], promotedIds);
        } else if (current.visibility !== "public") {
          throw new ConflictException("La foto ya no está disponible.");
        }
        await this.migrateSingleRoomGalleryToListing(tx, listingId);
        return this.attachToListingGallery(
          tx,
          listingId,
          mediaId,
          sortOrder,
          isCover,
        );
      });
    } catch (error) {
      await this.rollbackStagedPromotion(promotedIds);
      throw error;
    }
    await this.completeStagedPromotion(promotedIds);

    return {
      message: "Media asociado al listing correctamente.",
      item: result,
    };
  }

  async attachToRoom(
    user: any,
    roomId: string,
    mediaId: string,
    sortOrder = 0,
    isCover = false,
  ) {
    this.assertSortOrder(sortOrder);
    const [room, media] = await Promise.all([
      this.prisma.room.findUnique({
        where: { id: roomId },
        select: { id: true },
      }),
      this.prisma.media.findUnique({
        where: { id: mediaId },
        select: { id: true, ownerUserId: true, type: true, visibility: true },
      }),
    ]);

    if (!room) {
      throw new BadRequestException("roomId no existe.");
    }

    if (!media) {
      throw new BadRequestException("mediaId no existe.");
    }
    if (media.type !== "image") {
      throw new BadRequestException("La galería solo admite imágenes.");
    }
    if (media.visibility !== "public" && media.visibility !== "staged") {
      throw new BadRequestException("La foto todavía no está disponible para la galería pública.");
    }

    this.assertMediaOwner(user, media.ownerUserId);

    const promotedIds: string[] = [];
    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        await this.lockMedia(tx, mediaId);
        const current = await tx.media.findUnique({
          where: { id: mediaId },
          select: { visibility: true },
        });
        if (!current) throw new NotFoundException("Media no encontrado.");
        if (current.visibility === "staged") {
          if (await this.hasMediaReferences(tx, mediaId)) {
            throw new ConflictException("La foto staged ya está asociada a otro contenido.");
          }
          await this.promoteStagedPhotos(tx, [mediaId], promotedIds);
        } else if (current.visibility !== "public") {
          throw new ConflictException("La foto ya no está disponible.");
        }
        return this.attachToRoomGallery(tx, roomId, mediaId, sortOrder, isCover);
      });
    } catch (error) {
      await this.rollbackStagedPromotion(promotedIds);
      throw error;
    }
    await this.completeStagedPromotion(promotedIds);

    return {
      message: "Media asociado al room correctamente.",
      item: result,
    };
  }

  async reorderListing(_user: any, listingId: string, mediaIds: string[]) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException("Listing no encontrado.");
    const items = await this.prisma.$transaction(async (tx) => {
      await this.migrateSingleRoomGalleryToListing(tx, listingId);
      return this.reorderListingGallery(tx, listingId, mediaIds);
    });
    return { message: "Galería del listing reordenada correctamente.", items };
  }

  async reorderRoom(_user: any, roomId: string, mediaIds: string[]) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      select: { id: true },
    });
    if (!room) throw new NotFoundException("Room no encontrado.");
    const items = await this.prisma.$transaction((tx) =>
      this.reorderRoomGallery(tx, roomId, mediaIds),
    );
    return { message: "Galería del room reordenada correctamente.", items };
  }

  async attachToListingGallery(
    tx: Prisma.TransactionClient,
    listingId: string,
    mediaId: string,
    sortOrder: number,
    isCover = false,
  ) {
    await this.lockListingGallery(tx, listingId);
    const current = await tx.listingMedia.findMany({
      where: { listingId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { mediaId: "asc" }],
    });
    if (!current.some((item) => item.mediaId === mediaId)) {
      if (current.length >= 12) {
        throw new BadRequestException("Puedes asociar como máximo 12 fotos al anuncio.");
      }
      const nextOrder = current.length
        ? Math.max(...current.map((item) => item.sortOrder)) + 1
        : 0;
      await tx.listingMedia.create({
        data: {
          listingId,
          mediaId,
          sortOrder: nextOrder,
          isCover: nextOrder === 0,
        },
      });
    }
    const orderedIds = current
      .map((item) => item.mediaId)
      .filter((id) => id !== mediaId);
    orderedIds.splice(
      Math.min(isCover ? 0 : sortOrder, orderedIds.length),
      0,
      mediaId,
    );
    await this.reorderListingGallery(tx, listingId, orderedIds);
    return tx.listingMedia.findUnique({
      where: { listingId_mediaId: { listingId, mediaId } },
      include: { media: true },
    });
  }

  async attachToRoomGallery(
    tx: Prisma.TransactionClient,
    roomId: string,
    mediaId: string,
    sortOrder: number,
    isCover = false,
  ) {
    await this.lockRoomGallery(tx, roomId);
    const current = await tx.roomMedia.findMany({
      where: { roomId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { mediaId: "asc" }],
    });
    if (!current.some((item) => item.mediaId === mediaId)) {
      const nextOrder = current.length
        ? Math.max(...current.map((item) => item.sortOrder)) + 1
        : 0;
      await tx.roomMedia.create({
        data: {
          roomId,
          mediaId,
          sortOrder: nextOrder,
          isCover: nextOrder === 0,
        },
      });
    }
    const orderedIds = current
      .map((item) => item.mediaId)
      .filter((id) => id !== mediaId);
    orderedIds.splice(
      Math.min(isCover ? 0 : sortOrder, orderedIds.length),
      0,
      mediaId,
    );
    await this.reorderRoomGallery(tx, roomId, orderedIds);
    return tx.roomMedia.findUnique({
      where: { roomId_mediaId: { roomId, mediaId } },
      include: { media: true },
    });
  }

  async reorderListingGallery(
    tx: Prisma.TransactionClient,
    listingId: string,
    requestedOrder?: string[],
  ) {
    await this.lockListingGallery(tx, listingId);
    return this.reorderGallery(tx.listingMedia, { listingId }, requestedOrder);
  }

  async reorderRoomGallery(
    tx: Prisma.TransactionClient,
    roomId: string,
    requestedOrder?: string[],
  ) {
    await this.lockRoomGallery(tx, roomId);
    return this.reorderGallery(tx.roomMedia, { roomId }, requestedOrder);
  }

  private async lockListingGallery(
    tx: Prisma.TransactionClient,
    listingId: string,
  ) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "listings" WHERE "id" = ${listingId}::uuid FOR UPDATE`,
    );
  }

  private async lockRoomGallery(tx: Prisma.TransactionClient, roomId: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "rooms" WHERE "id" = ${roomId}::uuid FOR UPDATE`,
    );
  }

  private async migrateSingleRoomGalleryToListing(
    tx: Prisma.TransactionClient,
    listingId: string,
  ) {
    await this.lockListingGallery(tx, listingId);
    const rooms = await tx.room.findMany({
      where: { listingId },
      take: 2,
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (rooms.length > 1) {
      throw new ConflictException(
        "Este anuncio tiene varias ofertas históricas. La galería queda protegida hasta su revisión.",
      );
    }
    if (!rooms.length) return;

    const [listingItems, roomItems] = await Promise.all([
      tx.listingMedia.findMany({
        where: { listingId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { mediaId: "asc" }],
        select: { mediaId: true, sortOrder: true },
      }),
      tx.roomMedia.findMany({
        where: { roomId: rooms[0].id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { mediaId: "asc" }],
        select: { mediaId: true },
      }),
    ]);
    if (!roomItems.length) return;

    const listingIds = new Set(listingItems.map((item) => item.mediaId));
    let nextOrder = Math.max(-1, ...listingItems.map((item) => item.sortOrder)) + 1;
    for (const item of roomItems) {
      if (listingIds.has(item.mediaId)) continue;
      await tx.listingMedia.create({
        data: { listingId, mediaId: item.mediaId, sortOrder: nextOrder++, isCover: false },
      });
    }
    await tx.roomMedia.deleteMany({ where: { roomId: rooms[0].id } });
    const union = [...listingItems.map((item) => item.mediaId), ...roomItems.map((item) => item.mediaId).filter((id) => !listingIds.has(id))];
    await this.reorderListingGallery(tx, listingId, union);
  }

  private async reorderGallery(
    delegate: any,
    ownerWhere: { listingId: string } | { roomId: string },
    requestedOrder?: string[],
  ) {
    const rows: Array<{ mediaId: string; sortOrder: number }> =
      await delegate.findMany({
        where: ownerWhere,
        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
          { mediaId: "asc" },
        ],
      });
    const currentIds = rows.map((item) => item.mediaId);
    const orderedIds = requestedOrder ?? currentIds;
    if (
      orderedIds.length !== currentIds.length ||
      new Set(orderedIds).size !== orderedIds.length ||
      orderedIds.some((mediaId) => !currentIds.includes(mediaId))
    ) {
      throw new BadRequestException(
        "La lista debe incluir exactamente todos los IDs de la galería.",
      );
    }
    if (rows.length === 0) return [];

    const offset =
      Math.max(...rows.map((item) => item.sortOrder), rows.length) +
      rows.length +
      1;
    await delegate.updateMany({
      where: ownerWhere,
      data: { sortOrder: { increment: offset }, isCover: false },
    });
    for (const [sortOrder, mediaId] of orderedIds.entries()) {
      await delegate.update({
        where: {
          ...("listingId" in ownerWhere
            ? {
                listingId_mediaId: {
                  listingId: ownerWhere.listingId,
                  mediaId,
                },
              }
            : {
                roomId_mediaId: {
                  roomId: ownerWhere.roomId,
                  mediaId,
                },
              }),
        },
        data: { sortOrder, isCover: sortOrder === 0 },
      });
    }
    return delegate.findMany({
      where: ownerWhere,
      orderBy: { sortOrder: "asc" },
      include: { media: true },
    });
  }

  private assertSortOrder(sortOrder: number) {
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new BadRequestException(
        "sortOrder debe ser un entero no negativo.",
      );
    }
  }

  async uploadImage(
    currentUserId: string,
    file: any,
    uploadKey: string = randomUUID(),
    scope: MediaUploadScope = "listing",
  ) {
    if (this.b2.isConfigured) {
      throw new ConflictException(
        "Usa el flujo de carga directa para subir imágenes a B2.",
      );
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadKey)) {
      throw new BadRequestException("uploadKey debe ser un UUID versión 4.");
    }
    if (!file) {
      throw new BadRequestException("Debes seleccionar una imagen.");
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadRequestException(
        "La imagen debe pesar entre 1 byte y 8 MB.",
      );
    }
    const mimeType = this.detectImageMimeType(file.buffer);
    if (!mimeType || mimeType !== file.mimetype) {
      throw new BadRequestException(
        "La firma del archivo no coincide con una imagen JPG, PNG o WEBP válida.",
      );
    }
    let processed: ProcessedImage;
    try {
      processed = await this.processImage(file.buffer);
    } catch {
      throw new BadRequestException(
        "La imagen está dañada o no se puede procesar.",
      );
    }
    if (
      processed.detail.data.length > MAX_IMAGE_UPLOAD_BYTES ||
      processed.thumbnail.data.length > MAX_THUMBNAIL_BYTES
    ) {
      throw new BadRequestException(
        "No se pudieron generar versiones de imagen dentro del tamaño permitido.",
      );
    }
    const hashSha256 = createHash("sha256")
      .update(processed.detail.data)
      .digest("hex");

    const expectedVisibility = scope === "listing-draft" ? "staged" : "public";
    const existing = await this.prisma.media.findUnique({
      where: {
        ownerUserId_uploadKey: { ownerUserId: currentUserId, uploadKey },
      },
    });
    if (existing) {
      return this.reuseUpload(
        existing,
        expectedVisibility,
        hashSha256,
        processed,
      );
    }

    const keyBase = join(
      scope === "profile" ? "profiles" : "listings",
      currentUserId,
      randomUUID(),
    ).replace(/\\/g, "/");
    const storageKey = `${keyBase}.webp`;
    const thumbnailStorageKey = `${keyBase}-thumb.webp`;
    const pendingPaths = [
      this.localPath(join("pending", `${randomUUID()}.webp`), true),
      this.localPath(join("pending", `${randomUUID()}-thumb.webp`), true),
    ];
    await Promise.all(
      pendingPaths.map((pendingPath) =>
        mkdir(dirname(pendingPath), { recursive: true }),
      ),
    );
    await Promise.all([
      writeFile(pendingPaths[0], processed.detail.data),
      writeFile(pendingPaths[1], processed.thumbnail.data),
    ]);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${currentUserId}::uuid FOR UPDATE`,
        );
        const owner = await tx.user.findUnique({
          where: { id: currentUserId },
          select: { id: true },
        });
        if (!owner) {
          throw new BadRequestException("Usuario autenticado no existe.");
        }
        const raced = await tx.media.findUnique({
          where: {
            ownerUserId_uploadKey: {
              ownerUserId: currentUserId,
              uploadKey,
            },
          },
        });
        if (raced) return { media: raced, created: false };
        const usage = await tx.media.aggregate({
          where: { ownerUserId: currentUserId },
          _sum: { sizeBytes: true, thumbnailSizeBytes: true },
        });
        const usedBytes =
          Number(usage._sum.sizeBytes ?? 0n) +
          Number(usage._sum.thumbnailSizeBytes ?? 0n);
        const newBytes =
          processed.detail.data.length + processed.thumbnail.data.length;
        if (usedBytes + newBytes > this.userStorageQuotaBytes()) {
          throw new BadRequestException(
            "Alcanzaste el espacio máximo para fotos. Elimina imágenes que ya no uses e inténtalo de nuevo.",
          );
        }

        const created = await tx.media.create({
          data: {
            ownerUserId: currentUserId,
            type: MediaTypeDto.IMAGE,
            visibility: "staged",
            mimeType: "image/webp",
            sizeBytes: BigInt(processed.detail.data.length),
            storageProvider: "local",
            storageKey,
            publicUrl: null,
            thumbnailStorageKey,
            thumbnailPublicUrl: null,
            thumbnailSizeBytes: BigInt(processed.thumbnail.data.length),
            thumbnailWidth: processed.thumbnail.width,
            thumbnailHeight: processed.thumbnail.height,
            width: processed.detail.width,
            height: processed.detail.height,
            hashSha256,
            uploadKey,
          },
        });
        return { media: created, created: true };
      });
      if (!result.created) {
        return this.reuseUpload(
          result.media,
          expectedVisibility,
          hashSha256,
          processed,
        );
      }

      await this.repairStoredFiles(result.media, processed);
      if (expectedVisibility === "public") {
        const promoted = await this.promoteUnattachedUpload(result.media.id);
        return { message: "Imagen cargada correctamente.", media: promoted };
      }
      return { message: "Imagen cargada correctamente.", media: result.media };
    } catch (error) {
      let persisted: any = null;
      try {
        persisted = await this.prisma.media.findUnique({
          where: {
            ownerUserId_uploadKey: { ownerUserId: currentUserId, uploadKey },
          },
        });
      } catch {
        // La carga puede haberse confirmado; no borrar archivos con estado incierto.
      }

      if (
        persisted?.hashSha256 === hashSha256 &&
        persisted?.visibility !== "deleting"
      ) {
        await this.repairStoredFiles(persisted, processed);
        return this.reuseUpload(
          persisted,
          expectedVisibility,
          hashSha256,
          processed,
        );
      }
      if (persisted) {
        throw new ConflictException(
          "La clave de foto ya fue usada con otro archivo.",
        );
      }
      throw error;
    } finally {
      await Promise.all(
        pendingPaths.map((pendingPath) =>
          unlink(pendingPath).catch(() => undefined),
        ),
      );
    }
  }

  async fileExists(
    storageKey: string,
    visibility: "staged" | "public" | "deleting" = "public",
    storageProvider = "local",
  ) {
    if (visibility === "deleting") return false;
    if (storageProvider === "b2") {
      try {
        await this.b2.head(storageKey, visibility);
        return true;
      } catch {
        return false;
      }
    }
    try {
      await access(this.localPath(storageKey, visibility === "staged"));
      return true;
    } catch {
      return false;
    }
  }

  private async discardInvalidB2Upload(mediaId: string) {
    const queued = await this.prisma.$transaction((tx) =>
      this.markDeletingIfUnreferenced(tx, mediaId),
    );
    if (queued) await this.cleanupDeletingMedia([mediaId]);
  }

  async createUploadIntent(
    currentUserId: string,
    uploadKey: string,
    fileSize: number,
    mimeType: string,
    scope: MediaUploadScope = "listing",
  ) {
    if (!this.b2.isConfigured) return { mode: "proxy" as const };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadKey)) {
      throw new BadRequestException("uploadKey debe ser un UUID versión 4.");
    }
    if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadRequestException("La imagen debe pesar entre 1 byte y 8 MB.");
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) {
      throw new BadRequestException("Formato de imagen no soportado.");
    }

    let media = await this.prisma.media.findUnique({
      where: { ownerUserId_uploadKey: { ownerUserId: currentUserId, uploadKey } },
    });
    if (media) {
      if (media.storageProvider !== "b2" || media.ownerUserId !== currentUserId) {
        throw new ConflictException("La clave de carga ya se usó con otro proveedor.");
      }
      if (media.visibility === "deleting") {
        throw new ConflictException("La carga anterior ya se retiró; selecciona la foto otra vez.");
      }
      if (media.thumbnailStorageKey) {
        const finalPrefix = scope === "profile" ? "profiles/" : "listings/";
        if (!media.storageKey.startsWith(finalPrefix)) {
          throw new ConflictException("La clave de carga ya se usó con otro propósito.");
        }
        return { mode: "direct" as const, completed: true, mediaId: media.id };
      }
      if (
        !media.storageKey.startsWith(
          `incoming/${scope === "profile" ? "profile" : "listings"}/${currentUserId}/`,
        ) ||
        Number(media.sizeBytes) !== fileSize ||
        media.mimeType !== mimeType
      ) {
        throw new ConflictException("La clave de carga ya se usó con otros datos.");
      }
    } else {
      const sourceKey = `incoming/${scope === "profile" ? "profile" : "listings"}/${currentUserId}/${uploadKey}.source`;
      const prepared = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${currentUserId}::uuid FOR UPDATE`,
        );
        const owner = await tx.user.findUnique({
          where: { id: currentUserId },
          select: { id: true },
        });
        if (!owner) throw new BadRequestException("Usuario autenticado no existe.");
        const raced = await tx.media.findUnique({
          where: { ownerUserId_uploadKey: { ownerUserId: currentUserId, uploadKey } },
        });
        if (raced) return raced;
        const usage = await tx.media.aggregate({
          where: { ownerUserId: currentUserId },
          _sum: { sizeBytes: true, thumbnailSizeBytes: true },
        });
        const usedBytes =
          Number(usage._sum.sizeBytes ?? 0n) +
          Number(usage._sum.thumbnailSizeBytes ?? 0n);
        if (usedBytes + fileSize > this.userStorageQuotaBytes()) {
          throw new BadRequestException(
            "Alcanzaste el espacio máximo para fotos. Elimina imágenes que ya no uses e inténtalo de nuevo.",
          );
        }
        return tx.media.create({
          data: {
            ownerUserId: currentUserId,
            type: MediaTypeDto.IMAGE,
            visibility: "staged",
            mimeType,
            sizeBytes: BigInt(fileSize),
            storageProvider: "b2",
            storageKey: sourceKey,
            publicUrl: null,
            uploadKey,
          },
        });
      });
      media = prepared;
      if (
        media.storageProvider !== "b2" ||
        media.ownerUserId !== currentUserId ||
        Number(media.sizeBytes) !== fileSize ||
        media.mimeType !== mimeType
      ) {
        throw new ConflictException("La clave de carga ya se usó con otros datos.");
      }
      if (media.thumbnailStorageKey) {
        return { mode: "direct" as const, completed: true, mediaId: media.id };
      }
    }

    const uploadUrl = await this.b2.createPresignedPutUrl({
      key: media.storageKey,
      contentType: mimeType,
      contentLength: fileSize,
      expiresInSeconds: 600,
    });
    return {
      mode: "direct" as const,
      completed: false,
      mediaId: media.id,
      uploadUrl,
      headers: { "Content-Type": mimeType },
      expiresInSeconds: 600,
    };
  }

  async completeDirectUpload(
    currentUserId: string,
    mediaId: string,
    uploadKey: string,
    scope: MediaUploadScope,
  ) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (
      !media ||
      media.ownerUserId !== currentUserId ||
      media.uploadKey !== uploadKey ||
      media.storageProvider !== "b2"
    ) {
      throw new NotFoundException("Carga de imagen no encontrada.");
    }
    if (media.visibility === "deleting") {
      throw new ConflictException("La carga de imagen ya fue retirada.");
    }
    if (media.thumbnailStorageKey) {
      const finalPrefix = scope === "profile" ? "profiles/" : "listings/";
      if (!media.storageKey.startsWith(finalPrefix)) {
        throw new ConflictException("La carga se completó con otro propósito.");
      }
      if (scope === "profile" && media.visibility === "staged") {
        const published = await this.promoteUnattachedUpload(media.id);
        return { message: "Imagen cargada correctamente.", media: published };
      }
      return { message: "Imagen ya cargada.", media };
    }

    const sourceKey = media.storageKey;
    const incomingPrefix =
      `incoming/${scope === "profile" ? "profile" : "listings"}/${currentUserId}/`;
    if (
      media.visibility !== "staged" ||
      !sourceKey.startsWith(incomingPrefix)
    ) {
      throw new ConflictException("La carga no está en un estado válido.");
    }

    let processed: ProcessedImage;
    let source: Buffer;
    let head: { sizeBytes: number; mimeType: string };
    try {
      head = await this.b2.head(sourceKey, "staged");
      source = await this.b2.getBuffer(
        sourceKey,
        "staged",
        MAX_IMAGE_UPLOAD_BYTES,
      );
    } catch {
      throw new BadRequestException("No se pudo verificar la imagen en B2.");
    }
    if (
      head.sizeBytes <= 0 ||
      head.sizeBytes > MAX_IMAGE_UPLOAD_BYTES ||
      head.sizeBytes !== Number(media.sizeBytes)
    ) {
      await this.discardInvalidB2Upload(media.id);
      throw new BadRequestException(
        "El tamaño de la imagen no coincide con la carga autorizada.",
      );
    }
    const detectedMimeType = this.detectImageMimeType(source);
    if (!detectedMimeType || detectedMimeType !== media.mimeType) {
      await this.discardInvalidB2Upload(media.id);
      throw new BadRequestException(
        "La firma del archivo no coincide con una imagen válida.",
      );
    }
    try {
      processed = await this.processImage(source);
    } catch {
      await this.discardInvalidB2Upload(media.id);
      throw new BadRequestException("La imagen está dañada o no se puede procesar.");
    }
    if (
      processed.detail.data.length > MAX_IMAGE_UPLOAD_BYTES ||
      processed.thumbnail.data.length > MAX_THUMBNAIL_BYTES
    ) {
      await this.discardInvalidB2Upload(media.id);
      throw new BadRequestException("Las variantes WebP superan el tamaño permitido.");
    }

    const keyBase = join(
      scope === "profile" ? "profiles" : "listings",
      currentUserId,
      media.id,
    ).replace(/\\/g, "/");
    const detailKey = `${keyBase}.webp`;
    const thumbnailKey = `${keyBase}-thumb.webp`;
    let updated: any;
    try {
      await this.b2.putBuffer(detailKey, processed.detail.data, "image/webp", "staged");
      await this.b2.putBuffer(thumbnailKey, processed.thumbnail.data, "image/webp", "staged");
      updated = await this.prisma.$transaction(async (tx) => {
        await this.lockMedia(tx, media.id);
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${currentUserId}::uuid FOR UPDATE`,
        );
        const current = await tx.media.findUnique({ where: { id: media.id } });
        if (
          !current ||
          current.ownerUserId !== currentUserId ||
          current.storageProvider !== "b2" ||
          current.visibility !== "staged" ||
          current.thumbnailStorageKey
        ) {
          throw new ConflictException("La carga cambió mientras se procesaba.");
        }
        const usage = await tx.media.aggregate({
          where: { ownerUserId: currentUserId },
          _sum: { sizeBytes: true, thumbnailSizeBytes: true },
        });
        const usedBytes =
          Number(usage._sum.sizeBytes ?? 0n) +
          Number(usage._sum.thumbnailSizeBytes ?? 0n);
        const newBytes = processed.detail.data.length + processed.thumbnail.data.length;
        if (usedBytes - Number(current.sizeBytes) + newBytes > this.userStorageQuotaBytes()) {
          throw new BadRequestException("Alcanzaste el espacio máximo para fotos.");
        }
        return tx.media.update({
          where: { id: media.id },
          data: {
            storageKey: detailKey,
            thumbnailStorageKey: thumbnailKey,
            mimeType: "image/webp",
            sizeBytes: BigInt(processed.detail.data.length),
            thumbnailSizeBytes: BigInt(processed.thumbnail.data.length),
            width: processed.detail.width,
            height: processed.detail.height,
            thumbnailWidth: processed.thumbnail.width,
            thumbnailHeight: processed.thumbnail.height,
            hashSha256: createHash("sha256").update(processed.detail.data).digest("hex"),
          },
        });
      });
    } catch (error) {
      const current = await this.prisma.media.findUnique({
        where: { id: media.id },
        select: { storageKey: true, thumbnailStorageKey: true },
      }).catch(() => null);
      if (current?.storageKey !== detailKey) {
        await Promise.all([
          this.b2.delete(detailKey).catch(() => undefined),
          this.b2.delete(thumbnailKey).catch(() => undefined),
        ]);
      }
      throw error;
    }
    await this.b2.delete(sourceKey).catch(() => undefined);

    if (scope === "profile") {
      const published = await this.promoteUnattachedUpload(media.id);
      return { message: "Imagen cargada correctamente.", media: published };
    }
    return { message: "Imagen cargada correctamente.", media: updated };
  }

  private async createUploadIntentUnused(
    currentUserId: string,
    uploadKey: string,
    fileSize: number,
    mimeType: string,
    scope: MediaUploadScope = "listing",
  ) {
    if (!this.b2.isConfigured) return { mode: "proxy" as const };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uploadKey)) {
      throw new BadRequestException("uploadKey debe ser un UUID versión 4.");
    }
    if (!Number.isInteger(fileSize) || fileSize <= 0 || fileSize > MAX_IMAGE_UPLOAD_BYTES) {
      throw new BadRequestException("La imagen debe pesar entre 1 byte y 8 MB.");
    }
    if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) {
      throw new BadRequestException("Formato de imagen no soportado.");
    }

    let media = await this.prisma.media.findUnique({
      where: { ownerUserId_uploadKey: { ownerUserId: currentUserId, uploadKey } },
    });
    if (media) {
      if (media.storageProvider !== "b2" || media.ownerUserId !== currentUserId) {
        throw new ConflictException(
          "La carga existente usa otro proveedor de almacenamiento; migra el medio antes de reintentar.",
        );
      }
      if (media.thumbnailStorageKey && media.visibility !== "deleting") {
        return { mode: "direct" as const, completed: true, mediaId: media.id };
      }
      if (
        media.visibility === "deleting" ||
        !media.storageKey.startsWith(`incoming/${currentUserId}/`) ||
        Number(media.sizeBytes) !== fileSize ||
        media.mimeType !== mimeType
      ) {
        throw new ConflictException("La clave de foto ya fue usada con otros datos.");
      }
    } else {
      const sourceKey = `incoming/${currentUserId}/${uploadKey}.source`;
      const prepared = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${currentUserId}::uuid FOR UPDATE`,
        );
        const owner = await tx.user.findUnique({
          where: { id: currentUserId },
          select: { id: true },
        });
        if (!owner) throw new BadRequestException("Usuario autenticado no existe.");
        const raced = await tx.media.findUnique({
          where: { ownerUserId_uploadKey: { ownerUserId: currentUserId, uploadKey } },
        });
        if (raced) return raced;
        const usage = await tx.media.aggregate({
          where: { ownerUserId: currentUserId },
          _sum: { sizeBytes: true, thumbnailSizeBytes: true },
        });
        const usedBytes =
          Number(usage._sum.sizeBytes ?? 0n) +
          Number(usage._sum.thumbnailSizeBytes ?? 0n);
        if (usedBytes + fileSize > this.userStorageQuotaBytes()) {
          throw new BadRequestException(
            "Alcanzaste el espacio máximo para fotos. Elimina imágenes que ya no uses e inténtalo de nuevo.",
          );
        }
        return tx.media.create({
          data: {
            ownerUserId: currentUserId,
            type: MediaTypeDto.IMAGE,
            visibility: "staged",
            mimeType,
            sizeBytes: BigInt(fileSize),
            storageProvider: "b2",
            storageKey: sourceKey,
            publicUrl: null,
            hashSha256: null,
            uploadKey,
          },
        });
      });
      media = prepared;
      if (media.storageProvider !== "b2" || media.ownerUserId !== currentUserId) {
        throw new ConflictException("La clave de foto ya fue usada con otro propósito.");
      }
    }

    if (media.thumbnailStorageKey) {
      return { mode: "direct" as const, completed: true, mediaId: media.id };
    }
    const uploadUrl = await this.b2.createPresignedPutUrl({
      key: media.storageKey,
      contentType: mimeType,
      contentLength: fileSize,
      expiresInSeconds: 600,
    });
    return {
      mode: "direct" as const,
      completed: false,
      mediaId: media.id,
      uploadUrl,
      headers: { "Content-Type": mimeType },
      expiresInSeconds: 600,
    };
  }

  private async completeB2UploadUnused(
    currentUserId: string,
    mediaId: string,
    uploadKey: string,
    scope: MediaUploadScope,
  ) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.ownerUserId !== currentUserId || media.uploadKey !== uploadKey) {
      throw new NotFoundException("Carga de imagen no encontrada.");
    }
    if (media.storageProvider !== "b2") {
      throw new ConflictException("La imagen no pertenece al proveedor B2.");
    }
    if (media.visibility === "deleting") {
      throw new ConflictException("La carga de imagen ya fue retirada.");
    }
    if (media.thumbnailStorageKey && media.hashSha256) {
      if (scope === "profile" && media.visibility === "staged") {
        const published = await this.promoteUnattachedUpload(media.id);
        return { message: "Imagen cargada correctamente.", media: published };
      }
      return { message: "Imagen ya cargada.", media };
    }
    if (
      media.visibility !== "staged" ||
      !media.storageKey.startsWith(`incoming/${currentUserId}/`)
    ) {
      throw new ConflictException("La carga no está en un estado válido.");
    }

    let source: Buffer;
    let processed: ProcessedImage;
    try {
      const head = await this.b2.head(media.storageKey, "staged");
      if (
        head.sizeBytes <= 0 ||
        head.sizeBytes > MAX_IMAGE_UPLOAD_BYTES ||
        head.sizeBytes !== Number(media.sizeBytes)
      ) {
        throw new BadRequestException("El tamaño de la imagen no coincide con la carga autorizada.");
      }
      source = await this.b2.getBuffer(media.storageKey, "staged", MAX_IMAGE_UPLOAD_BYTES);
      const detectedMimeType = this.detectImageMimeType(source);
      if (!detectedMimeType || detectedMimeType !== media.mimeType) {
        throw new BadRequestException("La firma del archivo no coincide con una imagen válida.");
      }
      processed = await this.processImage(source);
    } catch (error) {
      if (error instanceof BadRequestException) {
        const queued = await this.prisma.$transaction((tx) =>
          this.markDeletingIfUnreferenced(tx, media.id),
        );
        if (queued) await this.cleanupDeletingMedia([media.id]);
        throw error;
      }
      throw new BadRequestException("No se pudo verificar la imagen en B2.");
    }
    if (
      processed.detail.data.length > MAX_IMAGE_UPLOAD_BYTES ||
      processed.thumbnail.data.length > MAX_THUMBNAIL_BYTES
    ) {
      throw new BadRequestException("Las variantes WebP superan el tamaño permitido.");
    }

    const keyBase = join(
      scope === "profile" ? "profiles" : "listings",
      currentUserId,
      media.id,
    ).replace(/\\/g, "/");
    const detailKey = `${keyBase}.webp`;
    const thumbnailKey = `${keyBase}-thumb.webp`;
    await this.b2.putBuffer(detailKey, processed.detail.data, "image/webp", "staged");
    await this.b2.putBuffer(thumbnailKey, processed.thumbnail.data, "image/webp", "staged");

    await this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, media.id);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "users" WHERE "id" = ${currentUserId}::uuid FOR UPDATE`,
      );
      const current = await tx.media.findUnique({ where: { id: media.id } });
      if (
        !current ||
        current.ownerUserId !== currentUserId ||
        current.storageProvider !== "b2" ||
        current.visibility !== "staged" ||
        current.thumbnailStorageKey
      ) {
        throw new ConflictException("La carga cambió mientras se procesaba.");
      }
      const usage = await tx.media.aggregate({
        where: { ownerUserId: currentUserId },
        _sum: { sizeBytes: true, thumbnailSizeBytes: true },
      });
      const usedBytes =
        Number(usage._sum.sizeBytes ?? 0n) +
        Number(usage._sum.thumbnailSizeBytes ?? 0n);
      const replacementBytes =
        processed.detail.data.length + processed.thumbnail.data.length;
      if (usedBytes - Number(current.sizeBytes) + replacementBytes > this.userStorageQuotaBytes()) {
        throw new BadRequestException("Alcanzaste el espacio máximo para fotos.");
      }
      await tx.media.update({
        where: { id: media.id },
        data: {
          storageKey: detailKey,
          thumbnailStorageKey: thumbnailKey,
          mimeType: "image/webp",
          sizeBytes: BigInt(processed.detail.data.length),
          thumbnailSizeBytes: BigInt(processed.thumbnail.data.length),
          width: processed.detail.width,
          height: processed.detail.height,
          thumbnailWidth: processed.thumbnail.width,
          thumbnailHeight: processed.thumbnail.height,
          hashSha256: createHash("sha256").update(processed.detail.data).digest("hex"),
        },
      });
    });
    await this.b2.delete(media.storageKey).catch(() => undefined);

    if (scope === "profile") {
      const published = await this.promoteUnattachedUpload(media.id);
      return { message: "Imagen cargada correctamente.", media: published };
    }
    const completed = await this.prisma.media.findUnique({ where: { id: media.id } });
    return { message: "Imagen cargada correctamente.", media: completed };
  }

  private async processImage(buffer: Buffer): Promise<ProcessedImage> {
    const detail = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize(DETAIL_MAX_EDGE, DETAIL_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumbnail = await sharp(buffer, { limitInputPixels: MAX_IMAGE_PIXELS })
      .rotate()
      .resize(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 76, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    return {
      detail: {
        data: detail.data,
        width: detail.info.width,
        height: detail.info.height,
      },
      thumbnail: {
        data: thumbnail.data,
        width: thumbnail.info.width,
        height: thumbnail.info.height,
      },
    };
  }

  async getImageFile(
    media: {
      storageKey: string;
      thumbnailStorageKey?: string | null;
      visibility: "staged" | "public" | "deleting";
      mimeType: string;
      storageProvider: string;
    },
    variant: "thumbnail" | "detail" = "thumbnail",
  ) {
    if (media.visibility === "deleting") {
      throw new NotFoundException("La imagen ya no está disponible.");
    }
    const thumbnailKey =
      variant === "thumbnail" ? media.thumbnailStorageKey : null;
    const storageKey = thumbnailKey ?? media.storageKey;
    const mimeType = thumbnailKey ? "image/webp" : media.mimeType;
    return {
      stream:
        media.storageProvider === "b2"
          ? await this.b2.getStream(storageKey, media.visibility)
          : createReadStream(
              this.localPath(storageKey, media.visibility === "staged"),
            ),
      mimeType,
    };
  }

  async getPublicImageUrl(
    mediaId: string,
    variant: "thumbnail" | "detail" = "thumbnail",
  ) {
    const media = await this.prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        type: true,
        visibility: true,
        storageProvider: true,
        storageKey: true,
        thumbnailStorageKey: true,
      },
    });
    if (!media || media.type !== "image" || media.visibility !== "public") {
      throw new NotFoundException("Imagen pública no encontrada.");
    }

    const key =
      variant === "thumbnail" && media.thumbnailStorageKey
        ? media.thumbnailStorageKey
        : media.storageKey;
    if (media.storageProvider === "b2") {
      return this.b2.createPresignedGetUrl({ key, expiresInSeconds: 600 });
    }
    throw new NotFoundException("Imagen pública no encontrada.");
  }

  async lockAndAssertStagedImage(
    tx: Prisma.TransactionClient,
    mediaId: string,
    ownerUserId: string,
  ) {
    await this.lockMedia(tx, mediaId);
    const media = await tx.media.findUnique({
      where: { id: mediaId },
      select: { ownerUserId: true, type: true, visibility: true },
    });
    if (
      !media ||
      media.ownerUserId !== ownerUserId ||
      media.type !== "image" ||
      media.visibility !== "staged"
    ) {
      throw new ConflictException("La foto ya no está disponible para este borrador.");
    }
  }

  async promoteStagedPhotos(
    tx: Prisma.TransactionClient,
    mediaIds: string[],
    promotedIds: string[],
  ) {
    for (const mediaId of [...new Set(mediaIds)]) {
      await this.lockMedia(tx, mediaId);
      const media = await tx.media.findUnique({ where: { id: mediaId } });
      if (!media) throw new NotFoundException("Foto del borrador no encontrada.");
      if (media.visibility === "public") continue;
      if (
        media.visibility !== "staged" ||
        !["local", "b2"].includes(media.storageProvider)
      ) {
        throw new ConflictException("La foto no se puede publicar en este estado.");
      }

      if (media.storageProvider === "local") {
        promotedIds.push(media.id);
        const privatePaths = [
          this.localPath(media.storageKey, true),
          ...(media.thumbnailStorageKey
            ? [this.localPath(media.thumbnailStorageKey, true)]
            : []),
        ];
        const publicPaths = [
          this.localPath(media.storageKey, false),
          ...(media.thumbnailStorageKey
            ? [this.localPath(media.thumbnailStorageKey, false)]
            : []),
        ];
        for (const privatePath of privatePaths) await access(privatePath);
        for (const [index, publicPath] of publicPaths.entries()) {
          await mkdir(dirname(publicPath), { recursive: true });
          await copyFile(privatePaths[index], publicPath);
        }
      }

      await tx.media.update({
        where: { id: media.id },
        data: {
          visibility: "public",
          publicUrl:
            media.storageProvider === "b2"
              ? this.b2PublicUrl(media.id, "detail")
              : this.publicUrl(
                  media.storageKey,
                  process.env.API_PUBLIC_URL ??
                    `http://localhost:${process.env.PORT ?? 3000}`,
                ),
          thumbnailPublicUrl: media.thumbnailStorageKey
            ? media.storageProvider === "b2"
              ? this.b2PublicUrl(media.id, "thumbnail")
              : this.publicUrl(
                  media.thumbnailStorageKey,
                  process.env.API_PUBLIC_URL ??
                    `http://localhost:${process.env.PORT ?? 3000}`,
                )
            : null,
        },
      });
    }
  }

  async rollbackStagedPromotion(mediaIds: string[]) {
    if (!mediaIds.length) return;
    const rows = await this.prisma.media.findMany({
      where: { id: { in: [...new Set(mediaIds)] }, visibility: "staged" },
      select: { storageProvider: true, storageKey: true, thumbnailStorageKey: true },
    }).catch(() => []);
    for (const media of rows) {
      for (const key of [media.storageKey, media.thumbnailStorageKey]) {
        if (!key) continue;
        if (media.storageProvider === "local") {
          await unlink(this.localPath(key, false)).catch(() => undefined);
        }
      }
    }
  }

  async completeStagedPromotion(mediaIds: string[]) {
    if (!mediaIds.length) return;
    const rows = await this.prisma.media.findMany({
      where: { id: { in: [...new Set(mediaIds)] }, visibility: "public" },
      select: { storageProvider: true, storageKey: true, thumbnailStorageKey: true },
    });
    for (const media of rows) {
      for (const key of [media.storageKey, media.thumbnailStorageKey]) {
        if (!key) continue;
        if (media.storageProvider === "local") {
          await unlink(this.localPath(key, true)).catch(() => undefined);
        }
      }
    }
  }

  async maintainStorage() {
    const cutoff = new Date(Date.now() - UNREFERENCED_MEDIA_RETENTION_MS);
    await this.privatizeLegacyDraftPhotos();
    const orphaned = await this.prisma.media.findMany({
      where: {
        visibility: { in: ["staged", "public"] },
        updatedAt: { lt: cutoff },
        listingMedia: { none: {} },
        roomMedia: { none: {} },
        hostListingDraftPhotos: { none: {} },
        messageMedia: { none: {} },
        avatarProfiles: { none: {} },
      },
      orderBy: { createdAt: "asc" },
      take: MEDIA_CLEANUP_BATCH_SIZE,
      select: { id: true },
    });

    for (const media of orphaned) {
      const queued = await this.prisma.$transaction((tx) =>
        this.markDeletingIfUnreferenced(tx, media.id),
      );
      if (queued) await this.cleanupDeletingMedia([media.id]);
    }

    const staleStaged = await this.prisma.media.findMany({
      where: {
        visibility: "staged",
        storageProvider: "local",
        updatedAt: { lt: cutoff },
      },
      orderBy: { updatedAt: "asc" },
      take: MEDIA_CLEANUP_BATCH_SIZE,
      select: { id: true },
    });
    for (const { id } of staleStaged) {
      await this.cleanupAbandonedPromotionCopy(id);
    }

    const publicMedia = await this.prisma.media.findMany({
      where: {
        type: "image",
        visibility: "public",
        storageProvider: "local",
        updatedAt: { lt: cutoff },
        thumbnailStorageKey: { not: null },
      },
      orderBy: { createdAt: "asc" },
      take: MEDIA_CLEANUP_BATCH_SIZE,
      select: { id: true },
    });
    for (const { id } of publicMedia) {
      await this.cleanupPrivatePromotionCopies(id);
    }

    await this.cleanupB2CompletedSourceObjects(cutoff);
    await this.cleanupDeletingMedia();
    await this.cleanupExpiredPendingFiles(cutoff);
  }

  private async privatizeLegacyDraftPhotos() {
    const candidates = await this.prisma.media.findMany({
      where: {
        storageProvider: "local",
        visibility: "public",
        ownerUserId: { not: null },
        hostListingDraftPhotos: { some: {} },
        listingMedia: { none: {} },
        roomMedia: { none: {} },
        messageMedia: { none: {} },
        avatarProfiles: { none: {} },
      },
      orderBy: { createdAt: "asc" },
      take: MEDIA_CLEANUP_BATCH_SIZE,
      select: { id: true },
    });

    for (const { id } of candidates) {
      let keysToHide: string[] = [];
      await this.prisma.$transaction(async (tx) => {
        await this.lockMedia(tx, id);
        const media = await tx.media.findUnique({
          where: { id },
          select: {
            visibility: true,
            type: true,
            ownerUserId: true,
            storageProvider: true,
            storageKey: true,
            thumbnailStorageKey: true,
            publicUrl: true,
            thumbnailPublicUrl: true,
            listingMedia: { take: 1, select: { mediaId: true } },
            roomMedia: { take: 1, select: { mediaId: true } },
            hostListingDraftPhotos: { take: 1, select: { mediaId: true } },
            messageMedia: { take: 1, select: { mediaId: true } },
            avatarProfiles: { take: 1, select: { userId: true } },
          },
        });
        if (
          !media ||
          media.type !== "image" ||
          !media.ownerUserId ||
          media.visibility !== "public" ||
          media.storageProvider !== "local" ||
          !media.hostListingDraftPhotos.length ||
          media.listingMedia.length ||
          media.roomMedia.length ||
          media.messageMedia.length ||
          media.avatarProfiles.length
        ) {
          return;
        }
        const urls = [media.publicUrl, media.thumbnailPublicUrl].filter(
          (url): url is string => Boolean(url),
        );
        if (
          urls.length &&
          (await tx.userProfile.findFirst({
            where: { photoUrl: { in: urls } },
            select: { userId: true },
          }))
        ) {
          return;
        }

        const keys = [media.storageKey, media.thumbnailStorageKey].filter(
          (key): key is string => Boolean(key),
        );
        for (const key of keys) {
          const publicPath = this.localPath(key, false);
          const privatePath = this.localPath(key, true);
          await access(publicPath);
          await mkdir(dirname(privatePath), { recursive: true });
          await copyFile(publicPath, privatePath);
        }
        await tx.media.update({
          where: { id },
          data: {
            visibility: "staged",
            publicUrl: null,
            thumbnailPublicUrl: null,
          },
        });
        keysToHide = keys;
      });

      for (const key of keysToHide) {
        await unlink(this.localPath(key, false)).catch(() => undefined);
      }
    }
  }

  private async reuseUpload(
    existing: any,
    expectedVisibility: "staged" | "public",
    hashSha256: string,
    processed: ProcessedImage,
  ) {
    if (existing.visibility === "deleting" || existing.hashSha256 !== hashSha256) {
      throw new ConflictException(
        "La clave de foto ya fue usada con otra imagen o propósito.",
      );
    }
    await this.repairStoredFiles(existing, processed);
    if (expectedVisibility === "staged" && existing.visibility !== "staged") {
      throw new ConflictException(
        "La clave de foto ya fue usada con otro propósito.",
      );
    }
    if (expectedVisibility === "public" && existing.visibility === "staged") {
      const promoted = await this.promoteUnattachedUpload(existing.id);
      return { message: "Imagen ya cargada.", media: promoted };
    }
    if (existing.visibility !== expectedVisibility) {
      throw new ConflictException(
        "La clave de foto ya fue usada con otro propósito.",
      );
    }
    return { message: "Imagen ya cargada.", media: existing };
  }

  private async promoteUnattachedUpload(mediaId: string) {
    const promotedIds: string[] = [];
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockMedia(tx, mediaId);
        const media = await tx.media.findUnique({
          where: { id: mediaId },
          select: { visibility: true },
        });
        if (!media) throw new NotFoundException("La imagen ya no está disponible.");
        if (media.visibility === "public") return;
        if (media.visibility !== "staged" || await this.hasMediaReferences(tx, mediaId)) {
          throw new ConflictException(
            "La foto pertenece a un borrador y no puede publicarse desde esta carga.",
          );
        }
        await this.promoteStagedPhotos(tx, [mediaId], promotedIds);
      });
    } catch (error) {
      await this.rollbackStagedPromotion(promotedIds);
      throw error;
    }
    await this.completeStagedPromotion(promotedIds);
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.visibility !== "public") {
      throw new ConflictException("No se pudo publicar la imagen cargada.");
    }
    return media;
  }

  private async repairStoredFiles(media: any, processed: ProcessedImage) {
    if (media.storageProvider === "b2") {
      const visibility = media.visibility === "public" ? "public" : "staged";
      const ensureObject = async (key: string, contents: Buffer) => {
        try {
          const object = await this.b2.head(key, visibility);
          if (object.sizeBytes === contents.length) return;
        } catch {
          // Re-upload an object that is absent after an interrupted promotion.
        }
        await this.b2.putBuffer(key, contents, "image/webp", visibility);
      };
      await ensureObject(media.storageKey, processed.detail.data);
      if (media.thumbnailStorageKey) {
        await ensureObject(media.thumbnailStorageKey, processed.thumbnail.data);
      }
      return;
    }
    const isPrivate = media.visibility === "staged";
    await this.writeMissingFile(
      this.localPath(media.storageKey, isPrivate),
      processed.detail.data,
    );
    if (media.thumbnailStorageKey) {
      await this.writeMissingFile(
        this.localPath(media.thumbnailStorageKey, isPrivate),
        processed.thumbnail.data,
      );
    }
  }

  private async writeMissingFile(targetPath: string, contents: Buffer) {
    try {
      const existing = await readFile(targetPath);
      if (existing.equals(contents)) return;
    } catch {
      // Recreate files that are absent or corrupted after an interrupted write.
    }
    await mkdir(dirname(targetPath), { recursive: true });
    const pendingPath = this.localPath(
      join("pending", `${randomUUID()}.webp`),
      true,
    );
    await mkdir(dirname(pendingPath), { recursive: true });
    try {
      await writeFile(pendingPath, contents);
      await copyFile(pendingPath, targetPath);
    } finally {
      await unlink(pendingPath).catch(() => undefined);
    }
  }

  private async cleanupExpiredPendingFiles(cutoff: Date) {
    const pendingRoot = this.localPath("pending", true);
    const entries = await readdir(pendingRoot, { withFileTypes: true }).catch(
      () => null,
    );
    if (!entries) return;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = join(pendingRoot, entry.name);
      try {
        const info = await stat(filePath);
        if (info.mtime < cutoff) await unlink(filePath);
      } catch {
        // A concurrently completed upload may already have removed the temporary file.
      }
    }
  }

  private userStorageQuotaBytes() {
    const configured = Number(process.env.MEDIA_MAX_STORAGE_BYTES_PER_USER);
    return Number.isSafeInteger(configured) && configured > 0
      ? configured
      : DEFAULT_USER_STORAGE_QUOTA_BYTES;
  }

  private publicUrl(storageKey: string, apiUrl: string) {
    const encodedKey = storageKey.split("/").map(encodeURIComponent).join("/");
    return `${apiUrl.replace(/\/$/, "")}/uploads/${encodedKey}`;
  }

  private b2PublicUrl(mediaId: string, variant: "thumbnail" | "detail") {
    const apiUrl =
      process.env.API_PUBLIC_URL ??
      `http://localhost:${process.env.PORT ?? 3000}`;
    return `${apiUrl.replace(/\/$/, "")}/api/media/${encodeURIComponent(mediaId)}/image?variant=${variant}`;
  }

  private async lockMedia(tx: Prisma.TransactionClient, mediaId: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "media" WHERE "id" = ${mediaId}::uuid FOR UPDATE`,
    );
  }

  private async assertPublicMedia(
    tx: Prisma.TransactionClient,
    mediaId: string,
  ) {
    const media = await tx.media.findUnique({
      where: { id: mediaId },
      select: { visibility: true, type: true },
    });
    if (!media || media.visibility !== "public" || media.type !== "image") {
      throw new ConflictException("La foto ya no está disponible para esta galería.");
    }
  }

  private async markDeletingIfUnreferenced(
    tx: Prisma.TransactionClient,
    mediaId: string,
    alreadyLocked = false,
  ) {
    if (!alreadyLocked) await this.lockMedia(tx, mediaId);
    const media = await tx.media.findUnique({
      where: { id: mediaId },
      select: {
        visibility: true,
        publicUrl: true,
        thumbnailPublicUrl: true,
        listingMedia: { take: 1, select: { mediaId: true } },
        roomMedia: { take: 1, select: { mediaId: true } },
        hostListingDraftPhotos: { take: 1, select: { mediaId: true } },
        messageMedia: { take: 1, select: { mediaId: true } },
        avatarProfiles: { take: 1, select: { userId: true } },
      },
    });
    if (!media) return false;
    if (media.visibility === "deleting") return true;
    if (
      media.listingMedia.length ||
      media.roomMedia.length ||
      media.hostListingDraftPhotos.length ||
      media.messageMedia.length ||
      media.avatarProfiles.length
    ) {
      return false;
    }
    const referencedUrls = [media.publicUrl, media.thumbnailPublicUrl].filter(
      (url): url is string => Boolean(url),
    );
    if (
      referencedUrls.length &&
      (await tx.userProfile.findFirst({
        where: { photoUrl: { in: referencedUrls } },
        select: { userId: true },
      }))
    ) {
      return false;
    }
    await tx.media.update({
      where: { id: mediaId },
      data: { visibility: "deleting" },
    });
    return true;
  }

  private async cleanupDeletingMedia(mediaIds?: string[]) {
    const rows = await this.prisma.media.findMany({
      where: {
        visibility: "deleting",
        ...(mediaIds?.length ? { id: { in: mediaIds } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: MEDIA_CLEANUP_BATCH_SIZE,
      select: {
        id: true,
        storageProvider: true,
        ownerUserId: true,
        uploadKey: true,
        storageKey: true,
        thumbnailStorageKey: true,
      },
    });
    for (const media of rows) {
      let failed = false;
      if (media.storageProvider === "b2") {
        const keys = [media.storageKey, media.thumbnailStorageKey].filter(
          (key): key is string => Boolean(key),
        );
        if (media.ownerUserId && media.uploadKey) {
          const sourceScope = media.storageKey.startsWith("profiles/")
            ? "profile"
            : "listings";
          const sourceKey = media.storageKey.startsWith("incoming/")
            ? media.storageKey
            : `incoming/${sourceScope}/${media.ownerUserId}/${media.uploadKey}.source`;
          keys.push(sourceKey);
        }
        for (const key of new Set(keys)) {
          try {
            await this.b2.delete(key);
          } catch {
            failed = true;
          }
        }
      } else if (media.storageProvider === "local") {
        for (const key of [media.storageKey, media.thumbnailStorageKey]) {
          if (!key) continue;
          for (const isPrivate of [false, true]) {
            try {
              await unlink(this.localPath(key, isPrivate));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "ENOENT") failed = true;
            }
          }
        }
      } else {
        continue;
      }
      if (failed) continue;

      await this.prisma.$transaction(async (tx) => {
        await this.lockMedia(tx, media.id);
        if (await this.hasMediaReferences(tx, media.id)) return;
        await tx.media.deleteMany({
          where: {
            id: media.id,
            visibility: "deleting",
            listingMedia: { none: {} },
            roomMedia: { none: {} },
            hostListingDraftPhotos: { none: {} },
            messageMedia: { none: {} },
            avatarProfiles: { none: {} },
          },
        });
      });
    }
  }

  private async hasMediaReferences(
    tx: Prisma.TransactionClient,
    mediaId: string,
  ) {
    const media = await tx.media.findUnique({
      where: { id: mediaId },
      select: {
        publicUrl: true,
        thumbnailPublicUrl: true,
        listingMedia: { take: 1, select: { mediaId: true } },
        roomMedia: { take: 1, select: { mediaId: true } },
        hostListingDraftPhotos: { take: 1, select: { mediaId: true } },
        messageMedia: { take: 1, select: { mediaId: true } },
        avatarProfiles: { take: 1, select: { userId: true } },
      },
    });
    if (!media) return false;
    if (
      media.listingMedia.length ||
      media.roomMedia.length ||
      media.hostListingDraftPhotos.length ||
      media.messageMedia.length ||
      media.avatarProfiles.length
    ) {
      return true;
    }
    const urls = [media.publicUrl, media.thumbnailPublicUrl].filter(
      (url): url is string => Boolean(url),
    );
    return Boolean(
      urls.length &&
        (await tx.userProfile.findFirst({
          where: { photoUrl: { in: urls } },
          select: { userId: true },
        })),
    );
  }

  private async cleanupAbandonedPromotionCopy(mediaId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, mediaId);
      const media = await tx.media.findUnique({
        where: { id: mediaId },
        select: {
          visibility: true,
          storageProvider: true,
          storageKey: true,
          thumbnailStorageKey: true,
        },
      });
      if (!media || media.visibility !== "staged") return;
      if (media.storageProvider === "b2") return;
      for (const key of [media.storageKey, media.thumbnailStorageKey]) {
        if (!key) continue;
        await unlink(this.localPath(key, false)).catch(() => undefined);
      }
    });
  }

  private async cleanupPrivatePromotionCopies(mediaId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockMedia(tx, mediaId);
      const media = await tx.media.findUnique({
        where: { id: mediaId },
        select: {
          visibility: true,
          storageProvider: true,
          storageKey: true,
          thumbnailStorageKey: true,
        },
      });
      if (
        !media ||
        media.visibility !== "public" ||
        media.storageProvider !== "local" ||
        !media.thumbnailStorageKey
      ) return;
      for (const key of [media.storageKey, media.thumbnailStorageKey]) {
        if (!key) continue;
        try {
          await access(this.localPath(key, false));
          await unlink(this.localPath(key, true)).catch(() => undefined);
        } catch {
          return;
        }
      }
    });
  }

  private async cleanupB2CompletedSourceObjects(cutoff: Date) {
    const rows = await this.prisma.media.findMany({
      where: {
        storageProvider: "b2",
        visibility: { in: ["staged", "public"] },
        thumbnailStorageKey: { not: null },
        updatedAt: { lt: cutoff },
      },
      orderBy: { createdAt: "asc" },
      take: MEDIA_CLEANUP_BATCH_SIZE,
      select: { ownerUserId: true, uploadKey: true, storageKey: true },
    });
    for (const media of rows) {
      if (!media.ownerUserId || !media.uploadKey) continue;
      const sourceScope = media.storageKey.startsWith("profiles/")
        ? "profile"
        : "listings";
      const sourceKey = media.storageKey.startsWith("incoming/")
        ? media.storageKey
        : `incoming/${sourceScope}/${media.ownerUserId}/${media.uploadKey}.source`;
      await this.b2.delete(sourceKey).catch(() => undefined);
    }
  }

  private detectImageMimeType(buffer: Buffer): string | null {
    if (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    )
      return "image/jpeg";
    if (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
      return "image/png";
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    )
      return "image/webp";
    return null;
  }

  private localPath(storageKey: string, isPrivate = false) {
    const root = isPrivate ? this.privateStorageRoot() : this.publicStorageRoot();
    const filePath = resolve(root, storageKey);
    if (
      filePath !== root &&
      !filePath.startsWith(`${root}\\`) &&
      !filePath.startsWith(`${root}/`)
    ) {
      throw new BadRequestException("Ruta de almacenamiento inválida.");
    }
    return filePath;
  }

  private publicStorageRoot() {
    return resolve(process.env.UPLOAD_ROOT ?? join(process.cwd(), "uploads"));
  }

  private privateStorageRoot() {
    const root = resolve(
      process.env.PRIVATE_UPLOAD_ROOT ??
        join(process.cwd(), "private-uploads"),
    );
    const publicRoot = this.publicStorageRoot();
    const relativePath = relative(publicRoot, root);
    if (
      !relativePath ||
      (!isAbsolute(relativePath) &&
        relativePath !== ".." &&
        !relativePath.startsWith(`..${sep}`))
    ) {
      throw new Error("PRIVATE_UPLOAD_ROOT debe estar fuera de UPLOAD_ROOT.");
    }
    return root;
  }

  private isPrivileged(user: any) {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];
    return roles.includes("admin") || roles.includes("support");
  }

  private assertMediaOwner(user: any, ownerUserId: string | null) {
    if (!this.isPrivileged(user) && ownerUserId !== user.id) {
      throw new ForbiddenException("No eres propietario de este archivo.");
    }
  }
}
