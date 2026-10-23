import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";
import { roomsWithoutBlockingBookings } from "../../lib/public-listing-visibility";
import { SearchDto, SearchEntityDto } from "./dto/search.dto";
import { SearchClickDto } from "./dto/search-click.dto";
import {
  toPublicListingCard,
  toPublicUnit,
} from "../../lib/public-catalog";
import { Prisma } from "../../generated/prisma/client";
import { SuggestLocationType } from "./dto/suggest-locations.dto";
import type { LocationSelectionType } from "./dto/resolve-location.dto";
import {
  locationMatchTier,
  locationTypeRank,
  type LocationSuggestion,
} from "./location-search";

const MAP_MARKER_LIMIT = 200;
const LOCATION_CATALOG_TTL_MS = 60_000;
const ROOM_ACCOMMODATION_UNIT_TYPES = ["private_room", "shared_bed"] as const;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  private locationCatalog: LocationSuggestion[] | null = null;
  private locationCatalogExpiresAt = 0;
  private locationCatalogRequest: Promise<LocationSuggestion[]> | null = null;

  async search(
    dto: SearchDto,
    userId?: string,
    options: {
      recordQuery?: boolean;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, dto.page ?? 1);
    const requestedPageSize = options.pageSize ?? dto.pageSize ?? 12;
    const pageSize = Math.min(
      options.recordQuery === false ? MAP_MARKER_LIMIT : 50,
      Math.max(1, requestedPageSize),
    );
    const skip = (page - 1) * pageSize;
    const entityType = dto.entityType ?? "listing";

    if (
      dto.minPrice != null &&
      dto.maxPrice != null &&
      dto.minPrice > dto.maxPrice
    ) {
      throw new BadRequestException(
        "minPrice no puede ser mayor que maxPrice.",
      );
    }
    if (
      (dto.minPrice != null || dto.maxPrice != null) &&
      !dto.rentalMode
    ) {
      throw new BadRequestException(
        "Selecciona una modalidad para filtrar precios sin mezclar Por día y Por mes.",
      );
    }

    await this.validateLocationSelection(dto);
    await this.validateLocationFilters(dto);
    const bounds = this.getBounds(dto, false);

    const filters = {
      countryCode: dto.countryCode ?? null,
      regionId: dto.regionId ?? null,
      cityId: dto.cityId ?? null,
      districtId: dto.districtId ?? null,
      locationType: dto.locationType ?? null,
      locationId: dto.locationId ?? null,
      south: bounds?.south ?? null,
      west: bounds?.west ?? null,
      north: bounds?.north ?? null,
      east: bounds?.east ?? null,
      minPrice: dto.minPrice ?? null,
      maxPrice: dto.maxPrice ?? null,
      guests: dto.guests ?? null,
      accommodationType: dto.accommodationType ?? null,
      propertyType: dto.propertyType ?? null,
      rentalMode: dto.rentalMode ?? null,
      entityType,
    };

    const q = dto.q?.trim() ?? "";
    const addressWhere: Prisma.AddressWhereInput = {
      ...(dto.countryCode ? { countryCode: dto.countryCode } : {}),
      ...(dto.regionId ? { regionId: dto.regionId } : {}),
      ...(dto.cityId ? { cityId: dto.cityId } : {}),
      ...(dto.districtId ? { districtId: dto.districtId } : {}),
      ...(bounds
        ? {
            lat: { gte: bounds.south, lte: bounds.north },
            lng: { gte: bounds.west, lte: bounds.east },
          }
        : {}),
    };
    const roomListingWhere: Prisma.ListingWhereInput = {
      listingStatus: "published" as const,
      deletedAt: null,
      rooms: roomsWithoutBlockingBookings(),
      ...(dto.propertyType ? { propertyType: dto.propertyType } : {}),
      ...(dto.accommodationType === "house" ||
      dto.accommodationType === "apartment"
        ? { AND: [{ propertyType: dto.accommodationType }] }
        : {}),
      ...(Object.keys(addressWhere).length > 0 ? { address: addressWhere } : {}),
    };

    const rentAmountWhere =
      dto.minPrice != null || dto.maxPrice != null
        ? {
            currencyCode: "PEN",
            rentAmount: {
              ...(dto.minPrice != null ? { gte: dto.minPrice } : {}),
              ...(dto.maxPrice != null ? { lte: dto.maxPrice } : {}),
            },
          }
        : {};

    let items: any[] = [];
    let total = 0;

    if (entityType === "listing") {
      const eligibleOfferWhere: Prisma.RoomWhereInput = {
        status: "published",
        ...(dto.guests != null
          ? { maxOccupancy: { gte: dto.guests } }
          : {}),
        ...(dto.accommodationType === "room"
          ? { unitType: { in: [...ROOM_ACCOMMODATION_UNIT_TYPES] } }
          : dto.accommodationType === "house" ||
              dto.accommodationType === "apartment"
            ? { unitType: "entire_place" }
            : {}),
        ...(dto.rentalMode || dto.minPrice != null || dto.maxPrice != null
          ? {
              pricing: {
                ...rentAmountWhere,
                ...(dto.rentalMode ? { rentalMode: dto.rentalMode } : {}),
              },
            }
          : {}),
      };
      const listingTypeConditions: Prisma.ListingWhereInput[] = [
        ...(dto.propertyType ? [{ propertyType: dto.propertyType }] : []),
        ...(dto.accommodationType === "house" ||
        dto.accommodationType === "apartment"
          ? [{ propertyType: dto.accommodationType }]
          : []),
      ];
      const listingWhere: Prisma.ListingWhereInput = {
        listingStatus: "published",
        deletedAt: null,
        rooms: {
          some: eligibleOfferWhere,
          ...roomsWithoutBlockingBookings(),
        },
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                {
                  address: {
                    line1: { contains: q, mode: "insensitive" },
                  },
                },
                {
                  address: {
                    country: {
                      name: { contains: q, mode: "insensitive" },
                    },
                  },
                },
                {
                  address: {
                    region: {
                      name: { contains: q, mode: "insensitive" },
                    },
                  },
                },
                {
                  address: {
                    city: {
                      name: { contains: q, mode: "insensitive" },
                    },
                  },
                },
                {
                  address: {
                    district: {
                      name: { contains: q, mode: "insensitive" },
                    },
                  },
                },
                {
                  rooms: {
                    some: {
                      ...eligibleOfferWhere,
                      OR: [
                        { name: { contains: q, mode: "insensitive" } },
                        { description: { contains: q, mode: "insensitive" } },
                      ],
                    },
                  },
                },
              ],
            }
          : {}),
        ...(Object.keys(addressWhere).length > 0 ? { address: addressWhere } : {}),
        ...(listingTypeConditions.length > 0
          ? { AND: listingTypeConditions }
          : {}),
      };
      const [listings, listingTotal] = await Promise.all([
        this.prisma.listing.findMany({
          where: listingWhere,
          include: {
            address: { include: { region: true, city: true, district: true } },
            media: {
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
              include: { media: true },
            },
            _count: { select: { rooms: true } },
            rooms: {
              where: { status: "published" },
              include: {
                pricing: true,
                media: {
                  orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
                  include: { media: true },
                },
                ...(userId
                  ? {
                      favorites: {
                        where: { userId },
                        select: { userId: true },
                      },
                    }
                  : {}),
              },
            },
          },
          skip,
          take: pageSize,
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        }),
        this.prisma.listing.count({ where: listingWhere }),
      ]);
      total += listingTotal;

      items.push(
        ...listings.map((listing: any) => ({
            entityType: "listing",
            entityId: listing.id,
            score: 1,
            data: toPublicListingCard(listing),
          })),
      );
    }

    if (entityType === "room") {
      const roomWhere: Prisma.RoomWhereInput = {
        status: "published",
        listing: roomListingWhere,
        ...(dto.guests != null ? { maxOccupancy: { gte: dto.guests } } : {}),
        ...(dto.accommodationType === "room"
          ? { unitType: { in: [...ROOM_ACCOMMODATION_UNIT_TYPES] } }
          : dto.accommodationType === "house" ||
              dto.accommodationType === "apartment"
            ? { unitType: "entire_place" }
            : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                {
                  listing: {
                    title: { contains: q, mode: "insensitive" },
                  },
                },
                {
                  listing: {
                    description: { contains: q, mode: "insensitive" },
                  },
                },
                {
                  listing: {
                    address: {
                      line1: { contains: q, mode: "insensitive" },
                    },
                  },
                },
                {
                  listing: {
                    address: {
                      country: {
                        name: { contains: q, mode: "insensitive" },
                      },
                    },
                  },
                },
                {
                  listing: {
                    address: {
                      region: {
                        name: { contains: q, mode: "insensitive" },
                      },
                    },
                  },
                },
                {
                  listing: {
                    address: {
                      city: {
                        name: { contains: q, mode: "insensitive" },
                      },
                    },
                  },
                },
                {
                  listing: {
                    address: {
                      district: {
                        name: { contains: q, mode: "insensitive" },
                      },
                    },
                  },
                },
              ],
            }
          : {}),
        ...(dto.minPrice != null || dto.maxPrice != null || dto.rentalMode
          ? {
              pricing: {
                ...rentAmountWhere,
                ...(dto.rentalMode ? { rentalMode: dto.rentalMode } : {}),
              },
            }
          : {}),
      };
      const [rooms, roomTotal] = await Promise.all([
        this.prisma.room.findMany({
          where: roomWhere,
          include: {
            pricing: true,
            media: {
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
              include: { media: true },
            },
            listing: {
              include: {
                address: {
                  include: { region: true, city: true, district: true },
                },
                media: {
                  take: 1,
                  orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
                  include: { media: true },
                },
              },
            },
            ...(userId
              ? {
                  favorites: {
                    where: { userId },
                    select: { userId: true },
                  },
                }
              : {}),
          },
          skip,
          take: pageSize,
          orderBy: [{ createdAt: "desc" }],
        }),
        this.prisma.room.count({ where: roomWhere }),
      ]);
      total += roomTotal;

      items.push(
        ...rooms.map((x: any) => {
          const publicUnit = toPublicUnit(x);
          const listingCover =
            x.listing?.media?.[0]?.media?.thumbnailPublicUrl ??
            x.listing?.media?.[0]?.media?.publicUrl;
          return {
            entityType: "room",
            entityId: x.id,
            score: 1,
            data: {
              ...publicUnit,
              ...(listingCover && publicUnit.listing
                ? {
                    listing: {
                      ...publicUnit.listing,
                      coverImage: listingCover,
                    },
                  }
                : {}),
              isFavorite: userId ? x.favorites.length > 0 : false,
            },
          };
        }),
      );
    }

    const searchQuery = options.recordQuery === false
      ? null
      : await this.prisma.searchQuery.create({
          data: {
            userId: userId ?? null,
            queryText: q || null,
            filters,
            resultCount: total,
          },
        });

    return {
      page,
      pageSize,
      ...(searchQuery ? { queryId: searchQuery.id } : {}),
      total,
      items,
    };
  }

  async searchMarkers(dto: SearchDto, userId?: string) {
    const bounds = this.getBounds(dto, true);
    const result = await this.search(
      { ...dto, ...bounds, page: 1 },
      userId,
      { recordQuery: false, pageSize: MAP_MARKER_LIMIT },
    );

    return {
      items: result.items,
      total: result.total,
      limit: MAP_MARKER_LIMIT,
      truncated: result.total > result.items.length,
    };
  }

  async searchFeatured(userId?: string) {
    return this.search(
      { entityType: SearchEntityDto.ROOM, page: 1, pageSize: 6 },
      userId,
      { recordQuery: false, pageSize: 6 },
    );
  }

  async suggestLocations(query: string, type?: SuggestLocationType) {
    const q = query.trim();
    if (q.length < 2) return { items: [] };
    const typeLimits: Record<LocationSelectionType, number> = {
      country: 5,
      region: 8,
      city: 8,
      district: 12,
    };
    const candidates = (await this.getLocationCatalog())
      .filter((item) => !type || item.type === type)
      .map((item) => ({ item, tier: locationMatchTier(q, item) }))
      .filter(({ tier }) => tier > 0)
      .sort(
        (left, right) =>
          right.tier - left.tier ||
          locationTypeRank(left.item.type) - locationTypeRank(right.item.type) ||
          left.item.label.localeCompare(right.item.label, "es-PE"),
      );

    const perTypeCounts = new Map<LocationSelectionType, number>();
    const seen = new Set<string>();
    const items: LocationSuggestion[] = [];
    for (const { item } of candidates) {
      const key = `${item.type}:${item.id}`;
      if (seen.has(key)) continue;
      const count = perTypeCounts.get(item.type) ?? 0;
      if (count >= typeLimits[item.type]) continue;
      seen.add(key);
      perTypeCounts.set(item.type, count + 1);
      items.push(item);
    }

    return { items };
  }

  async resolveLocation(type: LocationSelectionType, id: string) {
    const catalog = await this.getLocationCatalog();
    const item = catalog.find((candidate) => candidate.type === type && candidate.id === id);
    if (!item) throw new BadRequestException("La ubicación seleccionada ya no existe.");
    return { item };
  }

  private async getLocationCatalog(): Promise<LocationSuggestion[]> {
    if (this.locationCatalog && Date.now() < this.locationCatalogExpiresAt) {
      return this.locationCatalog;
    }
    if (this.locationCatalogRequest) return this.locationCatalogRequest;

    this.locationCatalogRequest = (async () => {
      const [countries, regions, cities, districts] = await Promise.all([
        this.prisma.country.findMany({
          where: { code: "PE" },
          select: { code: true, name: true },
        }),
        this.prisma.region.findMany({
          where: { countryCode: "PE", ubigeoCode: { not: null } },
          select: { id: true, countryCode: true, name: true, country: { select: { name: true } } },
        }),
        this.prisma.city.findMany({
          where: { region: { countryCode: "PE" }, ubigeoCode: { not: null } },
          select: {
            id: true,
            name: true,
            regionId: true,
            region: { select: { name: true, countryCode: true, country: { select: { name: true } } } },
          },
        }),
        this.prisma.district.findMany({
          where: { city: { region: { countryCode: "PE" } }, ubigeoCode: { not: null } },
          select: {
            id: true,
            name: true,
            cityId: true,
            city: {
              select: {
                name: true,
                regionId: true,
                region: { select: { name: true, countryCode: true, country: { select: { name: true } } } },
              },
            },
          },
        }),
      ]);
      const result: LocationSuggestion[] = [];

      for (const country of countries) {
        result.push({
          type: "country",
          id: country.code,
          name: country.name,
          label: country.name,
          context: { country: country.name, region: null, city: null, district: null },
          filters: { countryCode: country.code },
        });
      }
      for (const region of regions) {
        result.push({
          type: "region",
          id: region.id,
          name: region.name,
          label: `${region.name}, ${region.country.name}`,
          context: { country: region.country.name, region: region.name, city: null, district: null },
          filters: { countryCode: region.countryCode, regionId: region.id },
        });
      }
      for (const city of cities) {
        const countryName = city.region.country.name;
        result.push({
          type: "city",
          id: city.id,
          name: city.name,
          label: `${city.name}, ${city.region.name}, ${countryName}`,
          context: { country: countryName, region: city.region.name, city: city.name, district: null },
          filters: { countryCode: city.region.countryCode, regionId: city.regionId, cityId: city.id },
        });
      }
      for (const district of districts) {
        const countryName = district.city.region.country.name;
        result.push({
          type: "district",
          id: district.id,
          name: district.name,
          label: `${district.name}, ${district.city.name}, ${district.city.region.name}, ${countryName}`,
          context: {
            country: countryName,
            region: district.city.region.name,
            city: district.city.name,
            district: district.name,
          },
          filters: {
            countryCode: district.city.region.countryCode,
            regionId: district.city.regionId,
            cityId: district.cityId,
            districtId: district.id,
          },
        });
      }

      this.locationCatalog = result;
      this.locationCatalogExpiresAt = Date.now() + LOCATION_CATALOG_TTL_MS;
      return result;
    })();

    try {
      return await this.locationCatalogRequest;
    } finally {
      this.locationCatalogRequest = null;
    }
  }

  private getBounds(dto: SearchDto, required: boolean) {
    const values = [dto.south, dto.west, dto.north, dto.east];
    const supplied = values.filter((value) => value != null).length;
    if (supplied === 0 && !required) return null;
    if (supplied !== values.length) {
      throw new BadRequestException("Envía los cuatro límites del área visible.");
    }
    const [south, west, north, east] = values as [number, number, number, number];
    if (south >= north || west >= east) {
      throw new BadRequestException("Los límites del área visible no están ordenados.");
    }
    return { south, west, north, east };
  }

  private async validateLocationSelection(dto: SearchDto) {
    if (!dto.locationType && !dto.locationId) return;
    if (!dto.locationType || !dto.locationId) {
      throw new BadRequestException("Envía el tipo y el identificador de ubicación juntos.");
    }

    const { item } = await this.resolveLocation(dto.locationType, dto.locationId);
    const suppliedFilters = {
      countryCode: dto.countryCode ?? null,
      regionId: dto.regionId ?? null,
      cityId: dto.cityId ?? null,
      districtId: dto.districtId ?? null,
    };
    const selectedFilters = {
      countryCode: item.filters.countryCode,
      regionId: item.filters.regionId ?? null,
      cityId: item.filters.cityId ?? null,
      districtId: item.filters.districtId ?? null,
    };
    if (
      suppliedFilters.countryCode !== selectedFilters.countryCode ||
      suppliedFilters.regionId !== selectedFilters.regionId ||
      suppliedFilters.cityId !== selectedFilters.cityId ||
      suppliedFilters.districtId !== selectedFilters.districtId
    ) {
      throw new BadRequestException("La ubicación y sus filtros administrativos no coinciden.");
    }
  }

  private async validateLocationFilters(dto: SearchDto) {
    if (dto.countryCode && dto.countryCode !== "PE") {
      throw new BadRequestException("La búsqueda de alojamientos está limitada a Perú.");
    }

    let countryCode: string | null = null;
    let regionId: string | null = null;
    let cityId: string | null = null;
    let districtId: string | null = null;

    if (dto.districtId) {
      const district = await this.prisma.district.findUnique({
        where: { id: dto.districtId },
        select: {
          id: true,
          cityId: true,
          city: { select: { regionId: true, region: { select: { countryCode: true } } } },
        },
      });
      if (!district) throw new BadRequestException("El distrito seleccionado no existe.");
      districtId = district.id;
      cityId = district.cityId;
      regionId = district.city.regionId;
      countryCode = district.city.region.countryCode;
    } else if (dto.cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: dto.cityId },
        select: { id: true, regionId: true, region: { select: { countryCode: true } } },
      });
      if (!city) throw new BadRequestException("La provincia seleccionada no existe.");
      cityId = city.id;
      regionId = city.regionId;
      countryCode = city.region.countryCode;
    } else if (dto.regionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: dto.regionId },
        select: { id: true, countryCode: true },
      });
      if (!region) throw new BadRequestException("El departamento seleccionado no existe.");
      regionId = region.id;
      countryCode = region.countryCode;
    } else if (dto.countryCode) {
      countryCode = (await this.prisma.country.findUnique({
        where: { code: dto.countryCode },
        select: { code: true },
      }))?.code ?? null;
      if (!countryCode) throw new BadRequestException("El país seleccionado no existe.");
    }

    if (
      (dto.countryCode && countryCode !== dto.countryCode) ||
      (dto.regionId && regionId !== dto.regionId) ||
      (dto.cityId && cityId !== dto.cityId) ||
      (dto.districtId && districtId !== dto.districtId)
    ) {
      throw new BadRequestException("La jerarquía de ubicación seleccionada no coincide.");
    }
  }

  async trackClick(dto: SearchClickDto) {
    const click = await this.prisma.searchClickEvent.create({
      data: {
        searchQuery: {
          connect: { id: dto.searchQueryId },
        },
        entityType: dto.entityType,
        entityId: dto.entityId,
        position: dto.position,
      },
    });

    return {
      message: "Click registrado correctamente.",
      click,
    };
  }
}
