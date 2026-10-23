import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { Prisma, RentalMode } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { MediaService } from "../media/media.service";
import { UpsertListingDraftDto } from "./dto/upsert-listing-draft.dto";
import { ListingsService } from "./listings.service";

type DraftData = {
  listing?: Record<string, any>;
  offer?: Record<string, any>;
  availability?: Record<string, any>;
};

const PERU_BOUNDS = {
  minLat: -18.5,
  maxLat: 0.1,
  minLng: -81.5,
  maxLng: -68.5,
};

@Injectable()
export class ListingOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: ListingsService,
    private readonly media: MediaService,
  ) {}

  async saveDraft(
    hostUserId: string,
    creationKey: string,
    input: UpsertListingDraftDto,
  ) {
    await this.assertActiveHost(hostUserId);
    const draft = await this.ensureDraft(hostUserId, creationKey);
    if (draft.publishedListingId) {
      throw new ConflictException("Este borrador ya se publicó.");
    }
    if (
      input.expectedVersion != null &&
      input.expectedVersion !== draft.version
    ) {
      throw new ConflictException(
        "El borrador cambió en otra sesión. Recarga los datos guardados antes de continuar.",
      );
    }

    const previous = (draft.draftData ?? {}) as DraftData;
    const next = this.deepMerge(previous, {
      ...(input.listing ? { listing: input.listing } : {}),
      ...(input.offer ? { offer: input.offer } : {}),
      ...(input.availability ? { availability: input.availability } : {}),
    }) as DraftData;
    this.validatePartialDraft(next);
    const searchText = await this.draftSearchText(next);

    const updated = await this.prisma.hostListingDraft.updateMany({
      where: { id: draft.id, version: draft.version },
      data: {
        draftData: next as Prisma.InputJsonValue,
        title:
          typeof next.listing?.title === "string"
            ? next.listing.title.trim() || null
            : null,
        searchText,
        propertyType: next.listing?.propertyType ?? null,
        offerType: next.offer?.offerType ?? null,
        rentalMode: next.offer?.pricing?.rentalMode ?? null,
        currentStep: input.currentStep ?? draft.currentStep,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        "El borrador cambió en otra sesión. Recarga los datos guardados antes de continuar.",
      );
    }
    if (draft.legacyListingId) {
      await this.prisma.listing.update({
        where: { id: draft.legacyListingId },
        data: { updatedAt: new Date() },
      });
    }
    return this.serializeDraft(hostUserId, creationKey);
  }

  async beginLegacyListingDraft(
    hostUserId: string,
    listingId: string,
    creationKey: string,
  ) {
    await this.assertActiveHost(hostUserId);
    const alreadyKeyed = await this.prisma.hostListingDraft.findUnique({
      where: { hostUserId_creationKey: { hostUserId, creationKey } },
      select: { id: true },
    });
    if (alreadyKeyed) return this.serializeDraft(hostUserId, creationKey);
    const existingDraft = await this.prisma.hostListingDraft.findUnique({
      where: { legacyListingId: listingId },
      select: { creationKey: true, hostUserId: true },
    });
    if (existingDraft) {
      if (existingDraft.hostUserId !== hostUserId)
        throw new NotFoundException("Anuncio no encontrado.");
      return this.serializeDraft(hostUserId, existingDraft.creationKey);
    }
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        hostUserId,
        listingStatus: { in: ["draft", "paused", "published"] },
        deletedAt: null,
      },
      include: {
        address: { include: { region: true, city: true, district: true } },
        _count: { select: { rooms: true } },
        media: {
          include: {
            media: { select: { id: true, publicUrl: true, ownerUserId: true } },
          },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        },
      },
    });
    if (!listing) throw new NotFoundException("Anuncio no encontrado.");
    if (listing._count.rooms > 1) {
      throw new ConflictException(
        "Este anuncio antiguo contiene varias ofertas y requiere revisión; no se migró.",
      );
    }
    if (listing._count.rooms !== 0) {
      throw new ConflictException(
        "El anuncio ya tiene una oferta asociada. Abre su editor para actualizarla.",
      );
    }
    const data = this.fromListing(listing, null);
    const photos = listing.media.filter(
      (photo) => photo.media.ownerUserId === hostUserId,
    );
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const draft = await tx.hostListingDraft.create({
          data: {
            hostUserId,
            creationKey,
            legacyListingId: listing.id,
            draftData: data as Prisma.InputJsonValue,
            title: data.listing?.title ?? null,
            searchText:
              [
                data.listing?.title,
                data.listing?.description,
                listing.address.region?.name,
                listing.address.city?.name,
                listing.address.district?.name,
              ]
                .filter(Boolean)
                .join(" ") || null,
            propertyType: data.listing?.propertyType ?? null,
          },
        });
        if (photos.length) {
          await tx.hostListingDraftPhoto.createMany({
            data: photos.map((photo, sortOrder) => ({
              hostListingDraftId: draft.id,
              mediaId: photo.mediaId,
              sortOrder,
              isCover: sortOrder === 0,
            })),
          });
        }
        await tx.listing.update({
          where: { id: listing.id },
          data: { updatedAt: new Date() },
        });
        return draft;
      });
      return this.serializeDraft(hostUserId, row.creationKey);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.prisma.hostListingDraft.findUnique({
          where: { legacyListingId: listingId },
          select: { hostUserId: true, creationKey: true },
        });
        if (raced?.hostUserId === hostUserId)
          return this.serializeDraft(hostUserId, raced.creationKey);
      }
      throw error;
    }
  }

  async getDraft(hostUserId: string, creationKey: string) {
    const row = await this.findOrImportLegacyDraft(hostUserId, creationKey);
    if (!row) throw new NotFoundException("Borrador no encontrado.");
    if (row.legacyNeedsReview) {
      return {
        draftKey: creationKey,
        legacyNeedsReview: true,
        listingId: row.listingId,
        listingTitle: row.listingTitle,
        offerCount: row.offerCount,
      };
    }
    return this.serializeDraft(hostUserId, creationKey);
  }

  async uploadPhoto(
    user: any,
    creationKey: string,
    photoKey: string,
    file: any,
    rawSortOrder?: string,
    isCover = false,
  ) {
    const sortOrder = rawSortOrder == null ? 0 : Number(rawSortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 11) {
      throw new BadRequestException(
        "sortOrder debe ser un entero entre 0 y 11.",
      );
    }
    const draft = await this.ensureDraft(user.id, creationKey);
    if (draft.publishedListingId) {
      throw new ConflictException(
        "No se pueden cambiar fotos de un anuncio publicado desde el borrador.",
      );
    }

    const uploaded = await this.media.uploadImage(
      user.id,
      file,
      photoKey,
      "listing-draft",
    );
    if (
      uploaded.media.type !== "image" ||
      uploaded.media.ownerUserId !== user.id
    ) {
      throw new ForbiddenException(
        "La foto no pertenece al anfitrión autenticado.",
      );
    }

    return this.attachPhotoToDraft(
      user,
      creationKey,
      draft,
      photoKey,
      uploaded.media,
      sortOrder,
      isCover,
    );
  }

  async createDraftPhotoUploadIntent(
    user: any,
    creationKey: string,
    photoKey: string,
    fileSize: number,
    mimeType: string,
    rawSortOrder?: string,
  ) {
    const sortOrder = rawSortOrder == null ? 0 : Number(rawSortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 11) {
      throw new BadRequestException(
        "sortOrder debe ser un entero entre 0 y 11.",
      );
    }
    const draft = await this.ensureDraft(user.id, creationKey);
    if (draft.publishedListingId) {
      throw new ConflictException(
        "No se pueden cambiar fotos de un anuncio publicado desde el borrador.",
      );
    }
    const existingMedia = await this.prisma.media.findUnique({
      where: { ownerUserId_uploadKey: { ownerUserId: user.id, uploadKey: photoKey } },
      select: { id: true },
    });
    const alreadyAttached = existingMedia
      ? await this.prisma.hostListingDraftPhoto.findUnique({
          where: {
            hostListingDraftId_mediaId: {
              hostListingDraftId: draft.id,
              mediaId: existingMedia.id,
            },
          },
          select: { mediaId: true },
        })
      : null;
    const photoCount = await this.prisma.hostListingDraftPhoto.count({
      where: { hostListingDraftId: draft.id },
    });
    if (!alreadyAttached && photoCount >= 12) {
      throw new BadRequestException("Puedes subir como máximo 12 fotos.");
    }
    return this.media.createUploadIntent(
      user.id,
      photoKey,
      fileSize,
      mimeType,
      "listing-draft",
    );
  }

  async completeDraftPhotoUpload(
    user: any,
    creationKey: string,
    photoKey: string,
    mediaId: string,
    uploadKey: string,
    sortOrder: number,
    isCover = false,
  ) {
    if (photoKey !== uploadKey) {
      throw new BadRequestException("La clave de carga no coincide con la foto.");
    }
    const draft = await this.ensureDraft(user.id, creationKey);
    if (draft.publishedListingId) {
      throw new ConflictException("El borrador ya se publicó.");
    }
    const result = await this.media.completeDirectUpload(
      user.id,
      mediaId,
      uploadKey,
      "listing-draft",
    );
    return this.attachPhotoToDraft(
      user,
      creationKey,
      draft,
      photoKey,
      result.media,
      sortOrder,
      isCover,
    );
  }

  private async attachPhotoToDraft(
    user: any,
    creationKey: string,
    draft: any,
    photoKey: string,
    media: any,
    sortOrder: number,
    isCover: boolean,
  ) {
    if (media.type !== "image" || media.ownerUserId !== user.id) {
      throw new ForbiddenException(
        "La foto no pertenece al anfitrión autenticado.",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "host_listing_drafts" WHERE "id" = ${draft.id}::uuid FOR UPDATE`,
      );
      await this.media.lockAndAssertStagedImage(
        tx,
        media.id,
        user.id,
      );
      const current = await tx.hostListingDraft.findUnique({
        where: { id: draft.id },
        select: { id: true, version: true, publishedListingId: true },
      });
      if (!current || current.publishedListingId) {
        throw new ConflictException("El borrador ya no admite cambios.");
      }
      const rows = await tx.hostListingDraftPhoto.findMany({
        where: { hostListingDraftId: draft.id },
        orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
        select: { mediaId: true },
      });
      const ids = rows.map((row) => row.mediaId);
      const alreadyAttached = ids.includes(media.id);
      if (!alreadyAttached && ids.length >= 12) {
        throw new BadRequestException("Puedes subir como máximo 12 fotos.");
      }
      if (!alreadyAttached) {
        await tx.hostListingDraftPhoto.create({
          data: {
            hostListingDraftId: draft.id,
            mediaId: media.id,
            sortOrder: ids.length + 20,
          },
        });
        ids.push(media.id);
      }
      const withoutPhoto = ids.filter((id) => id !== media.id);
      withoutPhoto.splice(
        Math.min(isCover ? 0 : sortOrder, withoutPhoto.length),
        0,
        media.id,
      );
      await this.persistDraftPhotoOrder(tx, draft.id, withoutPhoto);
      await tx.hostListingDraft.update({
        where: { id: draft.id },
        data: { version: { increment: 1 } },
      });
      return tx.hostListingDraftPhoto.findUnique({
        where: {
            hostListingDraftId_mediaId: {
              hostListingDraftId: draft.id,
              mediaId: media.id,
          },
        },
        include: { media: { select: { id: true, publicUrl: true } } },
      });
    });

    return {
      photoKey,
      mediaId: media.id,
      url: this.draftPhotoPreviewUrl(creationKey, media.id),
      sortOrder: result?.sortOrder ?? sortOrder,
      isCover: result?.isCover ?? false,
      version: draft.version + 1,
    };
  }

  async reorderPhotos(
    hostUserId: string,
    creationKey: string,
    mediaIds: string[],
  ) {
    const draft = await this.findOrImportLegacyDraft(hostUserId, creationKey);
    if (!draft || draft.legacyNeedsReview)
      throw new NotFoundException("Borrador no encontrado.");
    if (draft.publishedListingId)
      throw new ConflictException("El anuncio ya está publicado.");
    if (mediaIds.length > 12 || new Set(mediaIds).size !== mediaIds.length) {
      throw new BadRequestException(
        "La galería debe contener hasta 12 fotos sin repetir.",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "host_listing_drafts" WHERE "id" = ${draft.id}::uuid FOR UPDATE`,
      );
      const current = await tx.hostListingDraftPhoto.findMany({
        where: { hostListingDraftId: draft.id },
        select: { mediaId: true },
      });
      const currentIds = current.map((item) => item.mediaId);
      if (
        currentIds.length !== mediaIds.length ||
        mediaIds.some((id) => !currentIds.includes(id))
      ) {
        throw new BadRequestException(
          "La lista debe incluir exactamente las fotos de este borrador.",
        );
      }
      await this.persistDraftPhotoOrder(tx, draft.id, mediaIds);
      await tx.hostListingDraft.update({
        where: { id: draft.id },
        data: { version: { increment: 1 } },
      });
    });
    return {
      message: "Fotos reordenadas correctamente.",
      ...(await this.serializeDraft(hostUserId, creationKey)),
    };
  }

  async removeDraftPhoto(
    hostUserId: string,
    creationKey: string,
    mediaId: string,
  ) {
    const draft = await this.findOrImportLegacyDraft(hostUserId, creationKey);
    if (!draft || draft.legacyNeedsReview)
      throw new NotFoundException("Borrador no encontrado.");
    if (draft.publishedListingId)
      throw new ConflictException("El anuncio ya está publicado.");
    let removed = false;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "host_listing_drafts" WHERE "id" = ${draft.id}::uuid FOR UPDATE`,
      );
      const photo = await tx.hostListingDraftPhoto.findFirst({
        where: { hostListingDraftId: draft.id, mediaId },
        select: { mediaId: true },
      });
      if (!photo) return;
      removed = true;
      await tx.hostListingDraftPhoto.delete({
        where: {
          hostListingDraftId_mediaId: { hostListingDraftId: draft.id, mediaId },
        },
      });
      const remaining = await tx.hostListingDraftPhoto.findMany({
        where: { hostListingDraftId: draft.id },
        orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
        select: { mediaId: true },
      });
      await this.persistDraftPhotoOrder(
        tx,
        draft.id,
        remaining.map((row) => row.mediaId),
      );
      await tx.hostListingDraft.update({
        where: { id: draft.id },
        data: { version: { increment: 1 } },
      });
    });
    if (!removed) {
      return {
        message: "La foto ya no estaba en el borrador.",
        ...(await this.serializeDraft(hostUserId, creationKey)),
      };
    }
    await this.media.remove({ id: hostUserId, roles: ["host"] }, mediaId);
    return {
      message: "Foto quitada del borrador.",
      ...(await this.serializeDraft(hostUserId, creationKey)),
    };
  }

  async getDraftPhotoFile(
    hostUserId: string,
    creationKey: string,
    mediaId: string,
    variant: "thumbnail" | "detail" = "thumbnail",
  ) {
    const draft = await this.findOrImportLegacyDraft(hostUserId, creationKey);
    if (!draft || draft.legacyNeedsReview || draft.publishedListingId) {
      throw new NotFoundException("Foto de borrador no encontrada.");
    }
    const photo = await this.prisma.hostListingDraftPhoto.findUnique({
      where: {
        hostListingDraftId_mediaId: {
          hostListingDraftId: draft.id,
          mediaId,
        },
      },
      select: {
        media: {
          select: {
            ownerUserId: true,
            type: true,
            visibility: true,
            mimeType: true,
            storageProvider: true,
            storageKey: true,
            thumbnailStorageKey: true,
          },
        },
      },
    });
    if (
      !photo ||
      photo.media.ownerUserId !== hostUserId ||
      photo.media.type !== "image"
    ) {
      throw new NotFoundException("Foto de borrador no encontrada.");
    }
    const imageFile = await this.media.getImageFile(photo.media, variant);
    const key =
      variant === "thumbnail" && photo.media.thumbnailStorageKey
        ? photo.media.thumbnailStorageKey
        : photo.media.storageKey;
    if (!(await this.media.fileExists(
      key,
      photo.media.visibility,
      photo.media.storageProvider,
    ))) {
      throw new NotFoundException("La foto guardada ya no está disponible.");
    }
    return imageFile;
  }

  async publish(hostUserId: string, creationKey: string) {
    const existing = await this.findOrImportLegacyDraft(
      hostUserId,
      creationKey,
    );
    if (!existing || existing.legacyNeedsReview) {
      throw new ConflictException(
        "El anuncio antiguo tiene varias ofertas; no se publicó ni se modificó.",
      );
    }
    if (existing.publishedListingId) {
      return {
        message: "El anuncio ya estaba publicado.",
        listingId: existing.publishedListingId,
        listingStatus: "published",
      };
    }
    const data = (existing.draftData ?? {}) as DraftData;
    this.validateReadyToPublish(data);
    await this.validateCompleteInput(hostUserId, data);
    const photos = await this.prisma.hostListingDraftPhoto.findMany({
      where: { hostListingDraftId: existing.id },
      include: {
        media: {
          select: {
            id: true,
            type: true,
            ownerUserId: true,
            visibility: true,
            storageProvider: true,
            storageKey: true,
            thumbnailStorageKey: true,
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
    });
    if (photos.length === 0)
      throw new BadRequestException(
        "Agrega al menos una foto antes de publicar.",
      );
    if (
      photos.length > 12 ||
      photos.some(
        (photo) =>
          photo.media.type !== "image" ||
          photo.media.ownerUserId !== hostUserId ||
          photo.media.visibility === "deleting",
      )
    ) {
      throw new BadRequestException(
        "La galería contiene fotos no válidas para este anuncio.",
      );
    }
    for (const photo of photos) {
      if (
        !(await this.media.fileExists(
          photo.media.storageKey,
          photo.media.visibility,
          photo.media.storageProvider,
        )) ||
        (photo.media.thumbnailStorageKey &&
          !(await this.media.fileExists(
            photo.media.thumbnailStorageKey,
            photo.media.visibility,
            photo.media.storageProvider,
          )))
      ) {
        throw new BadRequestException(
          "Una foto guardada ya no está disponible. Elimínala o vuelve a subirla.",
        );
      }
    }

    const promotedMediaIds: string[] = [];
    let listing: any;
    try {
      listing = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${hostUserId}:${creationKey}`}, 0))`;
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "host_listing_drafts" WHERE "id" = ${existing.id}::uuid FOR UPDATE`,
      );
      const current = await tx.hostListingDraft.findUnique({
        where: { id: existing.id },
      });
      if (!current) throw new NotFoundException("Borrador no encontrado.");
      if (current.publishedListingId)
        return tx.listing.findUnique({
          where: { id: current.publishedListingId },
        });

      await this.media.promoteStagedPhotos(
        tx,
        photos.map((photo) => photo.mediaId),
        promotedMediaIds,
      );

      const address = data.listing!.address!;
      const listingData = {
        title: data.listing!.title!.trim(),
        description: data.listing!.description!.trim(),
        propertyType: data.listing!.propertyType!,
        listingStatus: "published" as const,
        visibilityPrecision: "exact" as const,
        rules: this.rulesData(data),
        minStayNights:
          data.offer!.pricing!.rentalMode === "nightly"
            ? (data.offer!.minStayNights ?? 1)
            : null,
        maxStayNights:
          data.offer!.pricing!.rentalMode === "nightly"
            ? (data.offer!.maxStayNights ?? null)
            : null,
        publishedAt: new Date(),
      };
      const addressData = this.addressData(address);
      let listingId: string;
      let roomId: string;
      if (current.legacyListingId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${current.legacyListingId}))`;
        const old = await tx.listing.findFirst({
          where: { id: current.legacyListingId, hostUserId },
          include: { rooms: { take: 2, orderBy: { createdAt: "asc" } } },
        });
        if (!old)
          throw new NotFoundException(
            "El anuncio anterior ya no está disponible.",
          );
        if (old.rooms.length > 1)
          throw new ConflictException(
            "El anuncio anterior tiene varias ofertas; no se modificó.",
          );
        const oldOfferCount = await tx.room.count({
          where: { listingId: old.id },
        });
        if (oldOfferCount > 1)
          throw new ConflictException(
            "El anuncio anterior tiene varias ofertas; no se modificó.",
          );
        await tx.address.update({
          where: { id: old.addressId },
          data: addressData,
        });
        await tx.listing.update({ where: { id: old.id }, data: listingData });
        listingId = old.id;
        const roomData = this.roomData(old.id, data);
        if (old.rooms[0]) {
          roomId = old.rooms[0].id;
          await tx.room.update({
            where: { id: roomId },
            data: { ...roomData, status: "published" },
          });
        } else {
          const room = await tx.room.create({
            data: { ...roomData, status: "published" },
          });
          roomId = room.id;
        }
      } else {
        const createdAddress = await tx.address.create({ data: addressData });
        const createdListing = await tx.listing.create({
          data: {
            ...listingData,
            hostUserId,
            addressId: createdAddress.id,
            creationKey,
            creationPayloadHash: createHash("sha256")
              .update(JSON.stringify(data))
              .digest("hex"),
          },
        });
        listingId = createdListing.id;
        const room = await tx.room.create({
          data: { ...this.roomData(listingId, data), status: "published" },
        });
        roomId = room.id;
      }

      await this.upsertPricing(tx, roomId, data);
      await this.replaceAmenities(
        tx,
        listingId,
        roomId,
        data.offer!.amenityIds ?? [],
      );
      await this.replaceListingPhotos(
        tx,
        listingId,
        roomId,
        photos.map((photo) => photo.mediaId),
      );
      await tx.hostListingDraftPhoto.deleteMany({
        where: { hostListingDraftId: current.id },
      });
      await this.saveInitialAvailability(tx, roomId, data);
      await tx.hostListingDraft.update({
        where: { id: current.id },
        data: { publishedListingId: listingId, version: { increment: 1 } },
      });
       return tx.listing.findUnique({ where: { id: listingId } });
       }, { maxWait: 10_000, timeout: 60_000 });
    } catch (error) {
      await this.media.rollbackStagedPromotion(promotedMediaIds);
      throw error;
    }
    await this.media.completeStagedPromotion(promotedMediaIds);

    if (!listing)
      throw new BadRequestException("No se pudo publicar el anuncio.");
    return {
      message: "Anuncio publicado correctamente.",
      listingId: listing.id,
      offerId: (
        await this.prisma.room.findFirst({
          where: { listingId: listing.id },
          select: { id: true },
        })
      )?.id,
      listingStatus: "published",
    };
  }

  async updateListingOffer(
    user: any,
    listingId: string,
    input: UpsertListingDraftDto,
  ) {
    const roles: string[] = Array.isArray(user?.roles)
      ? user.roles
          .map((role: any) =>
            typeof role === "string"
              ? role
              : (role?.name ??
                role?.code ??
                role?.slug ??
                role?.role ??
                role?.id),
          )
          .filter(Boolean)
          .map((role: unknown) => String(role).toLowerCase())
      : [];
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        ...(roles.includes("admin") ? {} : { hostUserId: user.id }),
      },
      include: {
        address: { include: { region: true, city: true, district: true } },
        _count: { select: { rooms: true } },
        rooms: {
          take: 2,
          orderBy: { createdAt: "asc" },
          include: { pricing: true, amenities: true, availabilityRules: true },
        },
      },
    });
    if (!listing) throw new NotFoundException("Anuncio no encontrado.");
    if (listing._count.rooms === 0) {
      throw new ConflictException(
        "Completa este anuncio desde su borrador para guardar una oferta y sus fotos antes de publicarlo.",
      );
    }
    if (listing._count.rooms > 1) {
      throw new ConflictException(
        "Este anuncio antiguo tiene varias ofertas. Sus datos se conservaron y no se cambiarán sin una revisión específica.",
      );
    }
    if (
      ["archived", "suspended", "pending_review"].includes(
        listing.listingStatus,
      )
    ) {
      throw new ConflictException(
        "El estado actual del anuncio no permite editar la oferta.",
      );
    }

    const prior = this.fromListing(listing, listing.rooms[0] ?? null);
    const next = this.deepMerge(prior, {
      ...(input.listing ? { listing: input.listing } : {}),
      ...(input.offer ? { offer: input.offer } : {}),
      ...(input.availability ? { availability: input.availability } : {}),
    }) as DraftData;
    this.validateReadyToPublish(next, false);
    await this.validateCompleteInput(listing.hostUserId, next);
    const address = next.listing!.address!;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${listingId}))`;
      const currentOfferCount = await tx.room.count({ where: { listingId } });
      if (currentOfferCount > 1)
        throw new ConflictException(
          "El anuncio ya tiene varias ofertas anteriores; no se modificó.",
        );
      await tx.address.update({
        where: { id: listing.addressId },
        data: this.addressData(address),
      });
      const updatedListing = await tx.listing.update({
        where: { id: listingId },
        data: {
          title: next.listing!.title!.trim(),
          description: next.listing!.description!.trim(),
          propertyType: next.listing!.propertyType!,
          visibilityPrecision: "exact",
          rules: this.rulesData(next),
          minStayNights:
            next.offer!.pricing!.rentalMode === "nightly"
              ? (next.offer!.minStayNights ?? 1)
              : null,
          maxStayNights:
            next.offer!.pricing!.rentalMode === "nightly"
              ? (next.offer!.maxStayNights ?? null)
              : null,
        },
      });
      const roomData = this.roomData(listingId, next);
      let room: any;
      if (listing.rooms[0]) {
        if (currentOfferCount !== 1)
          throw new ConflictException(
            "La oferta cambió mientras editabas. Recarga el anuncio.",
          );
        room = await tx.room.update({
          where: { id: listing.rooms[0].id },
          data: roomData,
        });
      } else {
        if (currentOfferCount > 0)
          throw new ConflictException(
            "El anuncio ya tiene una oferta asociada. Recarga sus datos antes de guardar.",
          );
        room = await tx.room.create({ data: roomData });
      }
      await this.upsertPricing(tx, room.id, next);
      await this.replaceAmenities(
        tx,
        listingId,
        room.id,
        next.offer!.amenityIds ?? [],
      );
      if (
        next.availability &&
        next.offer!.pricing!.rentalMode === "monthly" &&
        Object.prototype.hasOwnProperty.call(next.availability, "availableFrom")
      ) {
        await tx.room.update({
          where: { id: room.id },
          data: {
            availableFrom: next.availability.availableFrom
              ? this.dateOnly(next.availability.availableFrom)
              : null,
          },
        });
      }
      if (
        next.availability &&
        next.offer!.pricing!.rentalMode === "nightly" &&
        (Object.prototype.hasOwnProperty.call(next.availability, "startDate") ||
          Object.prototype.hasOwnProperty.call(next.availability, "endDate"))
      ) {
        const start = next.availability.startDate
          ? this.dateOnly(next.availability.startDate)
          : null;
        const end = next.availability.endDate
          ? this.dateOnly(next.availability.endDate)
          : null;
        if (Boolean(start) !== Boolean(end) || (start && end && start >= end)) {
          throw new BadRequestException(
            "Indica un rango nocturno con fechas válidas.",
          );
        }
        await tx.availabilityRule.deleteMany({
          where: { roomId: room.id, ruleType: "open_range" },
        });
        if (start && end)
          await tx.availabilityRule.create({
            data: {
              roomId: room.id,
              ruleType: "open_range",
              startDate: start,
              endDate: end,
            },
          });
      }
      return updatedListing;
    });
    return {
      message: "Anuncio actualizado correctamente.",
      listing: await this.listings.findMineById(user, result.id),
    };
  }

  private async findOrImportLegacyDraft(
    hostUserId: string,
    creationKey: string,
  ): Promise<any | null> {
    const found = await this.prisma.hostListingDraft.findUnique({
      where: { hostUserId_creationKey: { hostUserId, creationKey } },
      include: {
        photos: {
          include: {
            media: { select: { id: true, publicUrl: true, ownerUserId: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
        },
      },
    });
    if (found) return found;
    const legacy = await this.prisma.listing.findUnique({
      where: { hostUserId_creationKey: { hostUserId, creationKey } },
      include: {
        address: { include: { region: true, city: true, district: true } },
        _count: { select: { rooms: true } },
        media: {
          include: {
            media: { select: { id: true, publicUrl: true, ownerUserId: true } },
          },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        },
        rooms: {
          take: 2,
          orderBy: { createdAt: "asc" },
          include: {
            pricing: true,
            amenities: true,
            media: {
              include: {
                media: {
                  select: { id: true, publicUrl: true, ownerUserId: true },
                },
              },
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
            },
            availabilityRules: true,
          },
        },
      },
    });
    if (!legacy) return null;
    if (legacy.listingStatus === "published") {
      return {
        legacyPublished: true,
        listingId: legacy.id,
        listingTitle: legacy.title,
        offerCount: legacy._count.rooms,
      };
    }
    if (legacy.listingStatus !== "draft") {
      return {
        legacyNeedsReview: true,
        listingId: legacy.id,
        listingTitle: legacy.title,
        offerCount: legacy._count.rooms,
      };
    }
    if (legacy._count.rooms > 1) {
      return {
        legacyNeedsReview: true,
        listingId: legacy.id,
        listingTitle: legacy.title,
        offerCount: legacy._count.rooms,
      };
    }
    const data = this.fromListing(legacy, legacy.rooms[0] ?? null);
    const roomPhotos = legacy.rooms[0]?.media ?? [];
    const ids = [
      ...new Set([
        ...legacy.media.map((photo) => photo.mediaId),
        ...roomPhotos.map((photo) => photo.mediaId),
      ]),
    ];
    try {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.hostListingDraft.create({
          data: {
            hostUserId,
            creationKey,
            draftData: data as Prisma.InputJsonValue,
            title: data.listing?.title ?? null,
            searchText:
              [
                data.listing?.title,
                data.listing?.description,
                legacy.address.region?.name,
                legacy.address.city?.name,
                legacy.address.district?.name,
              ]
                .filter(Boolean)
                .join(" ") || null,
            propertyType: data.listing?.propertyType ?? null,
            offerType: data.offer?.offerType ?? null,
            rentalMode: data.offer?.pricing?.rentalMode ?? null,
            currentStep: 7,
            legacyListingId: legacy.id,
          },
        });
        const ownedPhotos = [
          ...legacy.media.map((photo) => photo.media),
          ...roomPhotos.map((photo) => photo.media),
        ].filter(
          (photo, index, all) =>
            ids.includes(photo.id) &&
            all.findIndex((entry) => entry.id === photo.id) === index &&
            photo.ownerUserId === hostUserId,
        );
        if (ownedPhotos.length) {
          await tx.hostListingDraftPhoto.createMany({
            data: ownedPhotos.map((photo, index) => ({
              hostListingDraftId: row.id,
              mediaId: photo.id,
              sortOrder: index,
              isCover: index === 0,
            })),
          });
        }
        await tx.listing.update({
          where: { id: legacy.id },
          data: { updatedAt: new Date() },
        });
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
    }
    return this.prisma.hostListingDraft.findUnique({
      where: { hostUserId_creationKey: { hostUserId, creationKey } },
      include: {
        photos: {
          include: {
            media: { select: { id: true, publicUrl: true, ownerUserId: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
        },
      },
    });
  }

  private async ensureDraft(hostUserId: string, creationKey: string) {
    const existing = await this.findOrImportLegacyDraft(
      hostUserId,
      creationKey,
    );
    if (existing?.legacyNeedsReview) {
      throw new ConflictException(
        "Este borrador antiguo contiene varias ofertas y no se modificó.",
      );
    }
    if (existing) return existing;
    try {
      return await this.prisma.hostListingDraft.create({
        data: { hostUserId, creationKey, draftData: {} },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await this.prisma.hostListingDraft.findUnique({
          where: { hostUserId_creationKey: { hostUserId, creationKey } },
        });
        if (raced) return raced;
      }
      throw error;
    }
  }

  private async serializeDraft(hostUserId: string, creationKey: string) {
    const draft = await this.prisma.hostListingDraft.findUnique({
      where: { hostUserId_creationKey: { hostUserId, creationKey } },
      include: {
        photos: {
          include: { media: { select: { id: true, publicUrl: true } } },
          orderBy: [{ sortOrder: "asc" }, { mediaId: "asc" }],
        },
      },
    });
    if (!draft) throw new NotFoundException("Borrador no encontrado.");
    return {
      draftKey: creationKey,
      version: draft.version,
      currentStep: draft.currentStep,
      draftData: draft.draftData,
      legacyListingId: draft.legacyListingId,
      publishedListingId: draft.publishedListingId,
      photos: draft.photos.map((photo) => ({
        id: photo.mediaId,
        mediaId: photo.mediaId,
        url: this.draftPhotoPreviewUrl(creationKey, photo.mediaId),
        sortOrder: photo.sortOrder,
        isCover: photo.isCover,
      })),
    };
  }

  private draftPhotoPreviewUrl(creationKey: string, mediaId: string) {
    return `/api/host/listing-drafts/${encodeURIComponent(creationKey)}/photo-content/${encodeURIComponent(mediaId)}?variant=thumbnail`;
  }

  private async persistDraftPhotoOrder(
    tx: Prisma.TransactionClient,
    draftId: string,
    mediaIds: string[],
  ) {
    if (!mediaIds.length) return;
    const rows = await tx.hostListingDraftPhoto.findMany({
      where: { hostListingDraftId: draftId },
      select: { sortOrder: true },
    });
    const offset =
      Math.max(mediaIds.length, ...rows.map((row) => row.sortOrder)) +
      mediaIds.length +
      1;
    await tx.hostListingDraftPhoto.updateMany({
      where: { hostListingDraftId: draftId },
      data: { sortOrder: { increment: offset }, isCover: false },
    });
    for (const [sortOrder, mediaId] of mediaIds.entries()) {
      await tx.hostListingDraftPhoto.update({
        where: {
          hostListingDraftId_mediaId: { hostListingDraftId: draftId, mediaId },
        },
        data: { sortOrder, isCover: sortOrder === 0 },
      });
    }
  }

  private validatePartialDraft(data: DraftData) {
    if (data.listing?.title != null && String(data.listing.title).length > 160)
      throw new BadRequestException(
        "El título no puede superar 160 caracteres.",
      );
    if (
      data.listing?.description != null &&
      String(data.listing.description).length > 5000
    )
      throw new BadRequestException(
        "La descripción no puede superar 5000 caracteres.",
      );
    const address = data.listing?.address;
    if (
      address?.lat != null &&
      (Number(address.lat) < PERU_BOUNDS.minLat ||
        Number(address.lat) > PERU_BOUNDS.maxLat)
    )
      throw new BadRequestException("La latitud debe estar dentro de Perú.");
    if (
      address?.lng != null &&
      (Number(address.lng) < PERU_BOUNDS.minLng ||
        Number(address.lng) > PERU_BOUNDS.maxLng)
    )
      throw new BadRequestException("La longitud debe estar dentro de Perú.");
    const pricing = data.offer?.pricing;
    if (
      pricing?.rentalMode === "nightly" &&
      Number(pricing.depositAmount ?? 0) > 0
    )
      throw new BadRequestException(
        "El depósito solo aplica a ofertas mensuales.",
      );
    if (
      pricing?.rentalMode === "monthly" &&
      Number(pricing.cleaningFee ?? 0) > 0
    )
      throw new BadRequestException(
        "El cargo de limpieza solo aplica a ofertas nocturnas.",
      );
    if (
      pricing?.rentalMode === "nightly" &&
      data.offer?.maxStayNights != null &&
      Number(data.offer.minStayNights ?? 1) > Number(data.offer.maxStayNights)
    )
      throw new BadRequestException(
        "El mínimo de noches no puede superar el máximo.",
      );
    if (
      pricing?.rentalMode === "monthly" &&
      data.offer?.maxTermMonths != null &&
      Number(data.offer.minTermMonths ?? 1) > Number(data.offer.maxTermMonths)
    )
      throw new BadRequestException(
        "El plazo mínimo no puede superar el máximo.",
      );
  }

  private async draftSearchText(data: DraftData) {
    const address = data.listing?.address;
    const [region, city, district] = await Promise.all([
      address?.regionId
        ? this.prisma.region.findUnique({
            where: { id: address.regionId },
            select: { name: true },
          })
        : null,
      address?.cityId
        ? this.prisma.city.findUnique({
            where: { id: address.cityId },
            select: { name: true },
          })
        : null,
      address?.districtId
        ? this.prisma.district.findUnique({
            where: { id: address.districtId },
            select: { name: true },
          })
        : null,
    ]);
    return [
      data.listing?.title,
      data.listing?.description,
      address?.regionName,
      address?.cityName,
      address?.districtName,
      region?.name,
      city?.name,
      district?.name,
    ]
      .filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
      .join(" ");
  }

  private validateReadyToPublish(data: DraftData, requirePhotos = true) {
    const listing = data.listing;
    const offer = data.offer;
    const address = listing?.address;
    const pricing = offer?.pricing;
    if (!listing?.title?.trim())
      throw new BadRequestException("Completa el título del anuncio.");
    if (!listing.description?.trim())
      throw new BadRequestException("Completa la descripción del anuncio.");
    if (!listing.propertyType)
      throw new BadRequestException(
        "Selecciona Casa, Departamento o Cuarto/habitación.",
      );
    if (
      !address ||
      address.countryCode !== "PE" ||
      !address.regionId ||
      !address.cityId ||
      !address.districtId ||
      !address.line1?.trim() ||
      address.precision !== "exact" ||
      address.locationConfirmed !== true ||
      !hasExactCoordinates(address.lat, address.lng)
    ) {
      throw new BadRequestException(
        "Confirma la dirección exacta y sus divisiones administrativas antes de publicar.",
      );
    }
    if (!offer?.offerType || typeof offer.isFurnished !== "boolean")
      throw new BadRequestException(
        "Completa el tipo y las características de la oferta.",
      );
    if (
      !Number.isInteger(offer.maxGuests) ||
      offer.maxGuests! < 1 ||
      !Number.isInteger(offer.bedrooms) ||
      offer.bedrooms! < 0 ||
      !Number.isInteger(offer.beds) ||
      offer.beds! < 1 ||
      !Number.isFinite(offer.bathrooms) ||
      offer.bathrooms! < 0.5
    ) {
      throw new BadRequestException(
        "Completa la capacidad, dormitorios, camas y baños.",
      );
    }
    if (
      !pricing ||
      pricing.currencyCode !== "PEN" ||
      !pricing.rentalMode ||
      !Number.isFinite(pricing.rentAmount) ||
      pricing.rentAmount! <= 0
    ) {
      throw new BadRequestException(
        "Indica un precio mayor que cero en PEN y su modalidad.",
      );
    }
    if (
      pricing.rentalMode === "monthly" &&
      (!Number.isFinite(pricing.depositAmount) || pricing.depositAmount! < 0)
    ) {
      throw new BadRequestException(
        "Indica el depósito mensual en PEN; puede ser 0.",
      );
    }
    if (pricing.rentalMode === "nightly" && (pricing.depositAmount ?? 0) > 0)
      throw new BadRequestException(
        "El depósito solo aplica a ofertas mensuales.",
      );
    if (
      pricing.rentalMode === "nightly" &&
      data.availability?.startDate &&
      data.availability?.endDate &&
      data.availability.startDate >= data.availability.endDate
    )
      throw new BadRequestException(
        "La fecha de fin debe ser posterior a la fecha de inicio.",
      );
    if (
      Boolean(data.availability?.startDate) !==
        Boolean(data.availability?.endDate) &&
      pricing.rentalMode === "nightly"
    )
      throw new BadRequestException(
        "Indica las dos fechas del rango nocturno o deja ambas vacías.",
      );
    if (requirePhotos && !data.offer!.amenityIds) data.offer!.amenityIds = [];
  }

  private async validateCompleteInput(hostUserId: string, data: DraftData) {
    const address = data.listing!.address!;
    await this.listings.validateAddressHierarchy({
      countryCode: "PE",
      regionId: address.regionId,
      cityId: address.cityId,
      districtId: address.districtId,
    } as any);
    const ids: string[] = [
      ...new Set<string>((data.offer!.amenityIds ?? []) as string[]),
    ];
    if (ids.length) {
      const amenities = await this.prisma.amenity.findMany({
        where: { id: { in: ids } },
        select: { id: true, code: true },
      });
      if (amenities.length !== ids.length)
        throw new BadRequestException(
          "Una o más comodidades ya no están disponibles.",
        );
      data.offer!.amenityIds = amenities
        .filter((item) => item.code !== "furnished")
        .map((item) => item.id);
    }
    const currency = await this.prisma.currency.findUnique({
      where: { code: "PEN" },
      select: { code: true },
    });
    if (!currency)
      throw new BadRequestException("La moneda PEN no está configurada.");
    const host = await this.prisma.user.findUnique({
      where: { id: hostUserId },
      select: { status: true },
    });
    if (!host || host.status !== "active")
      throw new BadRequestException("El anfitrión no está activo.");
  }

  private fromListing(listing: any, room: any | null): DraftData {
    const address = listing.address ?? {};
    const amenities =
      room?.amenities?.map((item: any) => item.amenityId ?? item.id) ?? [];
    const pricing = room?.pricing;
    const rules =
      listing.rules && typeof listing.rules === "object" ? listing.rules : {};
    const availability = room?.availabilityRules?.find(
      (rule: any) => rule.ruleType === "open_range",
    );
    return {
      listing: {
        title: listing.title ?? "",
        description: listing.description ?? "",
        propertyType: listing.propertyType,
        address: {
          countryCode: address.countryCode ?? "PE",
          regionId: address.regionId ?? "",
          cityId: address.cityId ?? "",
          districtId: address.districtId ?? "",
          regionName: address.region?.name ?? "",
          cityName: address.city?.name ?? "",
          districtName: address.district?.name ?? "",
          line1: address.line1 ?? "",
          line2: address.line2 ?? "",
          postalCode: address.postalCode ?? "",
          lat: address.lat == null ? null : Number(address.lat),
          lng: address.lng == null ? null : Number(address.lng),
          precision: address.precision ?? "exact",
          locationConfirmed:
            address.precision === "exact" &&
            hasExactCoordinates(address.lat, address.lng),
        },
      },
      offer: room
        ? {
            description: room.description ?? "",
            offerType:
              room.unitType ??
              (room.roomType === "shared" ? "shared_bed" : "private_room"),
            isFurnished: Boolean(room.isFurnished),
            maxGuests: room.maxOccupancy ?? 1,
            bedrooms: room.bedroomCount ?? 0,
            beds: room.bedCount ?? 1,
            bathrooms:
              room.bathroomCount == null ? 1 : Number(room.bathroomCount),
            pricing: pricing
              ? {
                  currencyCode: pricing.currencyCode,
                  rentAmount: Number(pricing.rentAmount),
                  depositAmount:
                    pricing.depositAmount == null
                      ? 0
                      : Number(pricing.depositAmount),
                  cleaningFee:
                    pricing.cleaningFee == null
                      ? null
                      : Number(pricing.cleaningFee),
                  rentalMode: pricing.rentalMode,
                }
              : {},
            minStayNights: pricing?.minStayNights ?? 1,
            maxStayNights: pricing?.maxStayNights ?? null,
            minTermMonths: pricing?.minTermMonths ?? 1,
            maxTermMonths: pricing?.maxTermMonths ?? null,
            amenityIds: amenities,
            houseRules: rules.notes ?? "",
            petsAllowed: Boolean(rules.petsAllowed),
            smokingAllowed: Boolean(rules.smokingAllowed),
            partiesAllowed: Boolean(rules.partiesAllowed),
          }
        : {},
      availability: availability
        ? {
            startDate: this.dateString(availability.startDate),
            endDate: this.dateString(availability.endDate),
          }
        : room?.availableFrom
          ? { availableFrom: this.dateString(room.availableFrom) }
          : {},
    };
  }

  private deepMerge(target: any, source: any): any {
    if (!source || typeof source !== "object" || Array.isArray(source))
      return source;
    const result =
      target && typeof target === "object" && !Array.isArray(target)
        ? { ...target }
        : {};
    for (const [key, value] of Object.entries(source)) {
      result[key] =
        value && typeof value === "object" && !Array.isArray(value)
          ? this.deepMerge(result[key], value)
          : value;
    }
    return result;
  }

  private addressData(address: any) {
    return {
      countryCode: "PE",
      regionId: address.regionId,
      cityId: address.cityId,
      districtId: address.districtId,
      line1: address.line1.trim(),
      line2: address.line2?.trim() || null,
      postalCode: address.postalCode?.trim() || null,
      lat: Number(address.lat),
      lng: Number(address.lng),
      geohash: address.geohash?.trim() || null,
      precision: "exact" as const,
    };
  }

  private roomData(listingId: string, data: DraftData) {
    const offer = data.offer!;
    const shared = offer.offerType === "shared_bed";
    return {
      listingId,
      name: data.listing!.title!.trim(),
      description: offer.description?.trim() || null,
      roomType: shared ? ("shared" as const) : ("private" as const),
      unitType: offer.offerType!,
      isFurnished: offer.isFurnished!,
      bathroomType: shared ? ("shared" as const) : ("private" as const),
      bathroomCount: offer.bathrooms!,
      bedroomCount: offer.bedrooms!,
      maxOccupancy: offer.maxGuests!,
      bedCount: offer.beds!,
      availableFrom:
        data.offer!.pricing!.rentalMode === "monthly" &&
        data.availability?.availableFrom
          ? this.dateOnly(data.availability.availableFrom)
          : null,
    };
  }

  private pricingData(data: DraftData) {
    const offer = data.offer!;
    const pricing = offer.pricing!;
    const nightly = pricing.rentalMode === RentalMode.nightly;
    return {
      currencyCode: "PEN",
      rentAmount: pricing.rentAmount!,
      billingPeriod: nightly ? ("daily" as const) : ("monthly" as const),
      rentalMode: pricing.rentalMode!,
      minStayNights: nightly ? (offer.minStayNights ?? 1) : null,
      maxStayNights: nightly ? (offer.maxStayNights ?? null) : null,
      minTermMonths: nightly ? null : (offer.minTermMonths ?? 1),
      maxTermMonths: nightly ? null : (offer.maxTermMonths ?? null),
      depositAmount: nightly ? null : (pricing.depositAmount ?? 0),
      utilitiesIncluded: false,
      utilitiesDetail: {} as Prisma.InputJsonValue,
      cleaningFee: nightly ? (pricing.cleaningFee ?? null) : null,
    };
  }

  private rulesData(data: DraftData): Prisma.InputJsonValue {
    const offer = data.offer!;
    return {
      notes: offer.houseRules?.trim() ?? "",
      petsAllowed: Boolean(offer.petsAllowed),
      smokingAllowed: Boolean(offer.smokingAllowed),
      partiesAllowed: Boolean(offer.partiesAllowed),
    };
  }

  private async upsertPricing(
    tx: Prisma.TransactionClient,
    roomId: string,
    data: DraftData,
  ) {
    await tx.roomPricing.upsert({
      where: { roomId },
      create: { roomId, ...this.pricingData(data) },
      update: this.pricingData(data),
    });
  }

  private async replaceAmenities(
    tx: Prisma.TransactionClient,
    listingId: string,
    roomId: string,
    amenityIds: string[],
  ) {
    await tx.roomAmenity.deleteMany({ where: { roomId } });
    await tx.listingAmenity.deleteMany({ where: { listingId } });
    if (!amenityIds.length) return;
    await tx.roomAmenity.createMany({
      data: amenityIds.map((amenityId) => ({ roomId, amenityId })),
    });
    await tx.listingAmenity.createMany({
      data: amenityIds.map((amenityId) => ({ listingId, amenityId })),
    });
  }

  private async replaceListingPhotos(
    tx: Prisma.TransactionClient,
    listingId: string,
    roomId: string,
    mediaIds: string[],
  ) {
    await tx.listingMedia.deleteMany({ where: { listingId } });
    // Legacy single-offer listings used to associate every photo twice. The draft
    // import keeps the union; saving the gallery makes the listing the only owner.
    await tx.roomMedia.deleteMany({ where: { roomId } });
    if (mediaIds.length) {
      await tx.listingMedia.createMany({
        data: mediaIds.map((mediaId, sortOrder) => ({
          listingId,
          mediaId,
          sortOrder,
          isCover: sortOrder === 0,
        })),
      });
    }
  }

  private async saveInitialAvailability(
    tx: Prisma.TransactionClient,
    roomId: string,
    data: DraftData,
  ) {
    const dates = data.availability;
    if (
      data.offer!.pricing!.rentalMode === "nightly" &&
      dates?.startDate &&
      dates.endDate
    ) {
      await tx.availabilityRule.create({
        data: {
          roomId,
          ruleType: "open_range",
          startDate: this.dateOnly(dates.startDate),
          endDate: this.dateOnly(dates.endDate),
        },
      });
    }
  }

  private dateOnly(value: string) {
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException("La fecha no es válida.");
    return date;
  }

  private dateString(value: Date | string | null | undefined) {
    return value ? new Date(value).toISOString().slice(0, 10) : null;
  }

  private async assertActiveHost(hostUserId: string) {
    const host = await this.prisma.user.findUnique({
      where: { id: hostUserId },
      select: { status: true },
    });
    if (!host || host.status !== "active")
      throw new BadRequestException("El anfitrión no está activo.");
  }
}

function hasExactCoordinates(lat: unknown, lng: unknown) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= PERU_BOUNDS.minLat &&
    latitude <= PERU_BOUNDS.maxLat &&
    longitude >= PERU_BOUNDS.minLng &&
    longitude <= PERU_BOUNDS.maxLng
  );
}
