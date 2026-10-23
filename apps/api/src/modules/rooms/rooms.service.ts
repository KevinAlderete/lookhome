import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  BillingPeriod,
  Prisma,
  RentalMode,
} from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import {
  BathroomTypeDto,
  CreateRoomDto,
  RoomTypeDto,
} from "./dto/create-room.dto";
import { CreateUnitDto } from "./dto/create-unit.dto";
import { FindRoomsQueryDto } from "./dto/find-rooms-query.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { toPublicUnit } from "../../lib/public-catalog";
import { roomsWithoutBlockingBookings } from "../../lib/public-listing-visibility";

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  private toInputJsonValue(value?: Record<string, any>): Prisma.InputJsonValue {
    return (value ?? {}) as Prisma.InputJsonValue;
  }

  async findAll(query: FindRoomsQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 12)));
    const skip = (page - 1) * pageSize;

    const where: any = {
      status: "published",
      listing: {
        listingStatus: "published",
        deletedAt: null,
        rooms: roomsWithoutBlockingBookings(),
      },
    };

    if (query.listingId) {
      where.listingId = query.listingId;
    }

    if (query.roomType) {
      where.roomType = query.roomType;
    }

    if (query.bathroomType) {
      where.bathroomType = query.bathroomType;
    }

    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: "insensitive" } },
        { description: { contains: query.q, mode: "insensitive" } },
      ];
    }

    if (query.minPrice != null || query.maxPrice != null) {
      where.pricing = {
        ...(query.minPrice != null
          ? { rentAmount: { gte: Number(query.minPrice) } }
          : {}),
        ...(query.maxPrice != null
          ? query.minPrice != null
            ? {
                rentAmount: {
                  gte: Number(query.minPrice),
                  lte: Number(query.maxPrice),
                },
              }
            : {
                rentAmount: {
                  lte: Number(query.maxPrice),
                },
              }
          : {}),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }],
        include: {
          listing: {
            include: {
              address: {
                include: { region: true, city: true, district: true },
              },
              media: {
                where: { isCover: true },
                take: 1,
                include: { media: true },
              },
            },
          },
          pricing: true,
          media: {
            orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
            include: {
              media: true,
            },
          },
          amenities: {
            include: {
              amenity: true,
            },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items: items.map(toPublicUnit),
    };
  }

  async findOne(id: string) {
    const room = await this.prisma.room.findFirst({
      where: {
        id,
        status: "published",
        listing: {
          listingStatus: "published",
          deletedAt: null,
          rooms: roomsWithoutBlockingBookings(),
        },
      },
      include: {
        listing: {
          include: {
            address: { include: { region: true, city: true, district: true } },
            media: {
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
              include: { media: true },
            },
          },
        },
        pricing: true,
        media: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          include: {
            media: true,
          },
        },
        amenities: {
          include: {
            amenity: true,
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException("Room no encontrado.");
    }

    return toPublicUnit(room);
  }

  async findMine(user: any, listingId?: string) {
    if (!listingId) {
      throw new BadRequestException("listingId es obligatorio.");
    }

    const roles = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];
    const listing = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        ...(roles.includes("admin") ? {} : { hostUserId: user.id }),
      },
      select: { id: true },
    });
    if (!listing) throw new NotFoundException("Listing no encontrado.");

    return this.prisma.room.findMany({
      where: { listingId },
      orderBy: { createdAt: "asc" },
      include: {
        pricing: true,
        media: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          include: { media: true },
        },
        amenities: { include: { amenity: true } },
      },
    });
  }

  async findMineById(user: any, id: string) {
    const roles = Array.isArray(user?.roles)
      ? user.roles.map((role: unknown) => String(role).toLowerCase())
      : [];
    const room = await this.prisma.room.findFirst({
      where: {
        id,
        listing: roles.includes("admin") ? {} : { hostUserId: user.id },
      },
      include: {
        listing: { include: { address: true } },
        pricing: true,
        media: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          include: { media: true },
        },
        amenities: { include: { amenity: true } },
        availabilityRules: true,
        calendarBlocks: true,
      },
    });
    if (!room) throw new NotFoundException("Room no encontrado.");
    return room;
  }

  async create(input: CreateRoomDto) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: input.listingId },
      select: {
        id: true,
        listingStatus: true,
      },
    });

    if (!listing) {
      throw new BadRequestException("El listingId no existe.");
    }

    const pricingCreate = input.pricing
      ? this.toPricingData(input.pricing)
      : null;
    const amenityIds = await this.withoutFurnishedAmenity(input.amenityIds);

    const room = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.listingId}))`;
      const existingOfferCount = await tx.room.count({
        where: { listingId: input.listingId },
      });
      if (existingOfferCount > 0) {
        throw new ConflictException(
          "Cada anuncio nuevo admite una sola oferta. Edita la oferta desde el anuncio.",
        );
      }

      return tx.room.create({
        data: {
          listing: {
            connect: { id: input.listingId },
          },
          name: input.name.trim(),
          description: input.description?.trim() || null,
          roomType: input.roomType,
          unitType: input.unitType ?? "private_room",
          bathroomType: input.bathroomType,
          bedroomCount: input.bedroomCount ?? null,
          floorAreaM2: input.floorAreaM2 ?? null,
          maxOccupancy: input.maxOccupancy,
          bedCount: input.bedCount,
          bedType: input.bedType ?? null,
          isFurnished: input.isFurnished ?? false,
          availableFrom: input.availableFrom
            ? new Date(input.availableFrom)
            : null,
          status: "draft",
          ...(pricingCreate
            ? {
                pricing: {
                  create: pricingCreate,
                },
              }
            : {}),
          ...(amenityIds.length
            ? {
                amenities: {
                  create: amenityIds.map((amenityId) => ({
                    amenity: {
                      connect: { id: amenityId },
                    },
                  })),
                },
              }
            : {}),
        },
        include: {
          pricing: true,
          amenities: {
            include: {
              amenity: true,
            },
          },
        },
      });
    });

    return {
      message: "Room creado correctamente.",
      room,
    };
  }

  async createUnit(input: CreateUnitDto) {
    const unitType = input.unitType;
    const room = await this.create({
      listingId: input.listingId,
      name: input.title,
      description: input.description,
      roomType:
        unitType === "shared_bed" ? RoomTypeDto.SHARED : RoomTypeDto.PRIVATE,
      unitType,
      isFurnished: input.isFurnished,
      bathroomType:
        input.bathrooms && input.bathrooms > 0
          ? BathroomTypeDto.PRIVATE
          : BathroomTypeDto.SHARED,
      bedroomCount: input.bedrooms,
      maxOccupancy: input.maxGuests,
      bedCount: input.beds,
      pricing: {
        ...input.pricing,
        minStayNights: input.minStayNights,
        maxStayNights: input.maxStayNights,
        minTermMonths: input.minTermMonths,
        maxTermMonths: input.maxTermMonths,
      },
      amenityIds: input.amenityIds,
    });

    if (
      input.houseRules ||
      input.petsAllowed !== undefined ||
      input.smokingAllowed !== undefined ||
      input.partiesAllowed !== undefined
    ) {
      const listing = await this.prisma.listing.findUnique({
        where: { id: input.listingId },
        select: { rules: true },
      });
      await this.prisma.listing.update({
        where: { id: input.listingId },
        data: {
          rules: this.toInputJsonValue({
            ...(typeof listing?.rules === "object" && listing.rules
              ? (listing.rules as Record<string, any>)
              : {}),
            ...(input.houseRules ? { notes: input.houseRules.trim() } : {}),
            ...(input.petsAllowed !== undefined
              ? { petsAllowed: input.petsAllowed }
              : {}),
            ...(input.smokingAllowed !== undefined
              ? { smokingAllowed: input.smokingAllowed }
              : {}),
            ...(input.partiesAllowed !== undefined
              ? { partiesAllowed: input.partiesAllowed }
              : {}),
          }),
        },
      });
    }

    return { message: "Unidad creada correctamente.", unit: room.room };
  }

  async update(id: string, input: UpdateRoomDto) {
    const existing = await this.prisma.room.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("Room no encontrado.");
    }

    const pricingUpsert = input.pricing
      ? this.toPricingData(input.pricing)
      : null;
    const amenityIds = input.amenityIds
      ? await this.withoutFurnishedAmenity(input.amenityIds)
      : undefined;

    const room = await this.prisma.room.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.roomType !== undefined ? { roomType: input.roomType } : {}),
        ...(input.unitType !== undefined ? { unitType: input.unitType } : {}),
        ...(input.bathroomType !== undefined
          ? { bathroomType: input.bathroomType }
          : {}),
        ...(input.floorAreaM2 !== undefined
          ? { floorAreaM2: input.floorAreaM2 }
          : {}),
        ...(input.bedroomCount !== undefined
          ? { bedroomCount: input.bedroomCount }
          : {}),
        ...(input.maxOccupancy !== undefined
          ? { maxOccupancy: input.maxOccupancy }
          : {}),
        ...(input.bedCount !== undefined ? { bedCount: input.bedCount } : {}),
        ...(input.bedType !== undefined ? { bedType: input.bedType } : {}),
        ...(input.isFurnished !== undefined
          ? { isFurnished: input.isFurnished }
          : {}),
        ...(input.availableFrom !== undefined
          ? {
              availableFrom: input.availableFrom
                ? new Date(input.availableFrom)
                : null,
            }
          : {}),
        ...(pricingUpsert
          ? {
              pricing: {
                upsert: {
                  create: pricingUpsert,
                  update: pricingUpsert,
                },
              },
            }
          : {}),
      },
      include: {
        pricing: true,
        amenities: {
          include: {
            amenity: true,
          },
        },
      },
    });

    if (amenityIds) {
      await this.prisma.roomAmenity.deleteMany({
        where: { roomId: id },
      });

      if (amenityIds.length) {
        await Promise.all(
          amenityIds.map((amenityId) =>
            this.prisma.roomAmenity.create({
              data: {
                roomId: id,
                amenityId,
              },
            }),
          ),
        );
      }
    }

    const finalRoom = await this.prisma.room.findUnique({
      where: { id },
      include: {
        pricing: true,
        amenities: {
          include: {
            amenity: true,
          },
        },
      },
    });

    return {
      message: "Room actualizado correctamente.",
      room: finalRoom,
    };
  }

  async publish(id: string) {
    const exists = await this.prisma.room.findUnique({
      where: { id },
      select: {
        id: true,
        listing: { select: { listingStatus: true } },
        pricing: { select: { roomId: true } },
        media: { select: { mediaId: true }, take: 1 },
      },
    });

    if (!exists) {
      throw new NotFoundException("Room no encontrado.");
    }

    if (!exists.pricing) {
      throw new BadRequestException("No puedes publicar un room sin pricing.");
    }

    if (["suspended", "archived"].includes(exists.listing.listingStatus)) {
      throw new BadRequestException(
        "La unidad pertenece a un anuncio que no puede publicarse.",
      );
    }

    if (exists.media.length === 0) {
      throw new BadRequestException("No puedes publicar una unidad sin fotos.");
    }

    const room = await this.prisma.room.update({
      where: { id },
      data: {
        status: "published",
      },
    });

    return {
      message: "Room publicado correctamente.",
      room,
    };
  }

  private toPricingData(input: NonNullable<CreateRoomDto["pricing"]>): any {
    if (input.billingPeriod === "weekly") {
      throw new BadRequestException(
        "La modalidad semanal no está disponible. Usa alquiler por día o por mes.",
      );
    }
    const legacyRentalMode =
      input.billingPeriod === "daily"
        ? RentalMode.nightly
        : input.billingPeriod === "monthly"
          ? RentalMode.monthly
          : null;
    if (
      input.rentalMode &&
      legacyRentalMode &&
      input.rentalMode !== legacyRentalMode
    ) {
      throw new BadRequestException(
        "rentalMode y billingPeriod describen modalidades distintas.",
      );
    }
    const rentalMode = input.rentalMode ?? legacyRentalMode;
    if (!rentalMode) {
      throw new BadRequestException("Selecciona alquiler por día o por mes.");
    }
    if (rentalMode === RentalMode.monthly && input.depositAmount == null) {
      throw new BadRequestException("Indica el depósito de la unidad mensual.");
    }
    if (
      rentalMode === RentalMode.nightly &&
      input.depositAmount != null &&
      Number(input.depositAmount) > 0
    ) {
      throw new BadRequestException(
        "El depósito corresponde a unidades mensuales, no nocturnas.",
      );
    }
    const billingPeriod: BillingPeriod =
      rentalMode === RentalMode.nightly
        ? BillingPeriod.daily
        : BillingPeriod.monthly;
    const min =
      rentalMode === RentalMode.nightly
        ? input.minStayNights
        : input.minTermMonths;
    const max =
      rentalMode === RentalMode.nightly
        ? input.maxStayNights
        : input.maxTermMonths;
    if (min != null && max != null && min > max) {
      throw new BadRequestException("El mínimo no puede superar el máximo.");
    }

    return {
      currencyCode: input.currencyCode.toUpperCase(),
      rentAmount: input.rentAmount,
      billingPeriod,
      rentalMode,
      minStayNights:
        rentalMode === RentalMode.nightly ? (input.minStayNights ?? 1) : null,
      maxStayNights:
        rentalMode === RentalMode.nightly
          ? (input.maxStayNights ?? null)
          : null,
      minTermMonths:
        rentalMode === RentalMode.monthly ? (input.minTermMonths ?? 1) : null,
      maxTermMonths:
        rentalMode === RentalMode.monthly
          ? (input.maxTermMonths ?? null)
          : null,
      depositAmount:
        rentalMode === RentalMode.monthly ? input.depositAmount : null,
      utilitiesIncluded: input.utilitiesIncluded ?? false,
      utilitiesDetail: this.toInputJsonValue(input.utilitiesDetail),
      cleaningFee:
        rentalMode === RentalMode.nightly ? (input.cleaningFee ?? null) : null,
    };
  }

  private async withoutFurnishedAmenity(amenityIds?: string[]) {
    if (!amenityIds?.length) return [];
    const furnished = await this.prisma.amenity.findUnique({
      where: { code: "furnished" },
      select: { id: true },
    });
    return furnished
      ? amenityIds.filter((amenityId) => amenityId !== furnished.id)
      : amenityIds;
  }

  async pause(id: string) {
    const exists = await this.prisma.room.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException("Room no encontrado.");
    }

    const room = await this.prisma.room.update({
      where: { id },
      data: {
        status: "paused",
      },
    });

    return {
      message: "Room pausado correctamente.",
      room,
    };
  }

  async remove(id: string) {
    const exists = await this.prisma.room.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException("Room no encontrado.");
    }

    await this.prisma.room.delete({
      where: { id },
    });

    return {
      message: "Room eliminado correctamente.",
    };
  }
}
