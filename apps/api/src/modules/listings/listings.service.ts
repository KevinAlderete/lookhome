import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../../generated/prisma/client";
import { PrismaService } from "../../database/prisma/prisma.service";
import { UpdateListingDto } from "./dto/update-listing.dto";
import { toPublicListing, toPublicListingCard } from "../../lib/public-catalog";
import {
  PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES,
  roomsWithoutBlockingBookings,
} from "../../lib/public-listing-visibility";

type FindListingsQuery = {
  page?: number;
  pageSize?: number;
  q?: string;
  cityId?: string;
  districtId?: string;
  minPrice?: number;
  maxPrice?: number;
  propertyType?: string;
};

type CreateListingInput = {
  title: string;
  description?: string;
  propertyType: "house" | "apartment" | "building" | "shared_house" | "other";
  address: {
    countryCode: string;
    regionId?: string;
    cityId?: string;
    districtId?: string;
    line1?: string;
    line2?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    geohash?: string;
    precision?: "exact" | "approx" | "district" | "city";
  };
};

const PERU_COORDINATE_BOUNDS = {
  minLat: -18.5,
  maxLat: 0.1,
  minLng: -81.5,
  maxLng: -68.5,
};

function hasValidExactPeruCoordinates(lat?: number, lng?: number) {
  if (lat == null || lng == null) return false;

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= PERU_COORDINATE_BOUNDS.minLat &&
    lat <= PERU_COORDINATE_BOUNDS.maxLat &&
    lng >= PERU_COORDINATE_BOUNDS.minLng &&
    lng <= PERU_COORDINATE_BOUNDS.maxLng
  );
}

function normalizedRoles(user: any): string[] {
  if (!Array.isArray(user?.roles)) return [];
  return user.roles
    .map((role: any) =>
      typeof role === "string"
        ? role
        : (role?.name ?? role?.code ?? role?.slug ?? role?.role ?? role?.id),
    )
    .filter(Boolean)
    .map((role: unknown) => String(role).toLowerCase());
}

type HostListingsQuery = {
  hostUserId?: string;
  status?:
    | "draft"
    | "pending_review"
    | "published"
    | "paused"
    | "suspended"
    | "archived";
  propertyType?: "house" | "apartment" | "building" | "shared_house" | "other";
  offerType?: "entire_place" | "private_room" | "shared_bed";
  rentalMode?: "nightly" | "monthly";
  search?: string;
  page?: number;
  pageSize?: number;
};

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: FindListingsQuery) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 12)));
    const skip = (page - 1) * pageSize;

    const where: any = {
      listingStatus: "published",
      deletedAt: null,
      rooms: {
        some: { status: "published" },
        ...roomsWithoutBlockingBookings(),
      },
    };

    if (query.q?.trim()) {
      where.OR = [
        { title: { contains: query.q.trim(), mode: "insensitive" } },
        { description: { contains: query.q.trim(), mode: "insensitive" } },
      ];
    }

    if (query.propertyType) {
      where.propertyType = query.propertyType;
    }

    if (query.cityId || query.districtId) {
      where.address = {
        ...(query.cityId ? { cityId: query.cityId } : {}),
        ...(query.districtId ? { districtId: query.districtId } : {}),
      };
    }

    if (query.minPrice != null || query.maxPrice != null) {
      where.rooms = {
        some: {
          status: "published",
          pricing: {
            ...(query.minPrice != null
              ? { rentAmount: { gte: Number(query.minPrice) } }
              : {}),
            ...(query.maxPrice != null
              ? {
                  ...(query.minPrice != null
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
                      }),
                }
              : {}),
          },
        },
        ...roomsWithoutBlockingBookings(),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.listing.count({ where }),
      this.prisma.listing.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        include: {
          _count: { select: { rooms: true } },
          address: { include: { region: true, city: true, district: true } },
          media: {
            orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
            include: {
              media: true,
            },
          },
          rooms: {
            where: { status: "published" },
            include: {
              pricing: true,
              media: {
                orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
                include: {
                  media: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items: items.map(toPublicListing),
    };
  }

  async findMine(user: any, query: HostListingsQuery) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize || 12)));
    const skip = (page - 1) * pageSize;

    const roles = normalizedRoles(user);

    const isAdmin = roles.includes("admin");

    const where: any = {};

    if (isAdmin) {
      if (query.hostUserId) {
        where.hostUserId = query.hostUserId;
      }
    } else {
      where.hostUserId = user.id;
    }

    if (query.status === "draft") {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { listingStatus: "draft" },
            {
              listingStatus: "published",
              rooms: { none: {} },
              legacyDraft: { is: { publishedListingId: null } },
            },
          ],
        },
      ];
    } else if (query.status === "published") {
      where.AND = [
        ...(where.AND ?? []),
        {
          listingStatus: "published",
          OR: [
            { legacyDraft: { is: null } },
            { legacyDraft: { is: { publishedListingId: { not: null } } } },
          ],
        },
      ];
    } else if (query.status) {
      where.listingStatus = query.status;
    }

    if (query.propertyType) {
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { propertyType: query.propertyType },
            { legacyDraft: { is: { propertyType: query.propertyType } } },
          ],
        },
      ];
    }

    if (query.offerType || query.rentalMode) {
      const roomFilter = {
        ...(query.offerType ? { unitType: query.offerType } : {}),
        ...(query.rentalMode
          ? { pricing: { rentalMode: query.rentalMode } }
          : {}),
      };
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { rooms: { some: roomFilter } },
            {
              legacyDraft: {
                is: {
                  ...(query.offerType ? { offerType: query.offerType } : {}),
                  ...(query.rentalMode ? { rentalMode: query.rentalMode } : {}),
                },
              },
            },
          ],
        },
      ];
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.AND = [
        ...(where.AND ?? []),
        {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            {
              legacyDraft: {
                is: { searchText: { contains: search, mode: "insensitive" } },
              },
            },
            {
              address: {
                OR: [
                  {
                    region: { name: { contains: search, mode: "insensitive" } },
                  },
                  { city: { name: { contains: search, mode: "insensitive" } } },
                  {
                    district: {
                      name: { contains: search, mode: "insensitive" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ];
    }

    const draftWhere: any =
      query.status && query.status !== "draft"
        ? null
        : {
            ...(isAdmin && query.hostUserId
              ? { hostUserId: query.hostUserId }
              : !isAdmin
                ? { hostUserId: user.id }
                : {}),
            publishedListingId: null,
            legacyListingId: null,
            ...(query.propertyType ? { propertyType: query.propertyType } : {}),
            ...(query.offerType ? { offerType: query.offerType } : {}),
            ...(query.rentalMode ? { rentalMode: query.rentalMode } : {}),
            ...(query.search?.trim()
              ? {
                  searchText: {
                    contains: query.search.trim(),
                    mode: "insensitive",
                  },
                }
              : {}),
          };

    const listingSql: Prisma.Sql[] = [Prisma.sql`TRUE`];
    const draftSql: Prisma.Sql[] = [
      draftWhere ? Prisma.sql`TRUE` : Prisma.sql`FALSE`,
    ];
    const ownerId = isAdmin ? query.hostUserId : user.id;
    if (ownerId) {
      listingSql.push(Prisma.sql`l.host_user_id = ${ownerId}::uuid`);
      draftSql.push(Prisma.sql`d.host_user_id = ${ownerId}::uuid`);
    }
    if (query.status === "draft") {
      listingSql.push(Prisma.sql`(
        l.listing_status = 'draft'::listing_status OR (
          l.listing_status = 'published'::listing_status
          AND NOT EXISTS (SELECT 1 FROM rooms r0 WHERE r0.listing_id = l.id)
          AND EXISTS (SELECT 1 FROM host_listing_drafts legacy WHERE legacy.legacy_listing_id = l.id AND legacy.published_listing_id IS NULL)
        )
      )`);
    } else if (query.status === "published") {
      listingSql.push(Prisma.sql`(
        l.listing_status = 'published'::listing_status
        AND NOT (
          NOT EXISTS (SELECT 1 FROM rooms r0 WHERE r0.listing_id = l.id)
          AND EXISTS (SELECT 1 FROM host_listing_drafts legacy WHERE legacy.legacy_listing_id = l.id AND legacy.published_listing_id IS NULL)
        )
      )`);
    } else if (query.status) {
      listingSql.push(
        Prisma.sql`l.listing_status = ${query.status}::listing_status`,
      );
    }
    if (query.propertyType) {
      listingSql.push(Prisma.sql`(
        l.property_type = ${query.propertyType}::property_type
        OR EXISTS (SELECT 1 FROM host_listing_drafts legacy WHERE legacy.legacy_listing_id = l.id AND legacy.property_type = ${query.propertyType}::property_type)
      )`);
      draftSql.push(
        Prisma.sql`d.property_type = ${query.propertyType}::property_type`,
      );
    }
    if (query.offerType || query.rentalMode) {
      const roomConditions: Prisma.Sql[] = [Prisma.sql`r.listing_id = l.id`];
      const draftConditions: Prisma.Sql[] = [
        Prisma.sql`legacy.legacy_listing_id = l.id`,
        Prisma.sql`legacy.published_listing_id IS NULL`,
      ];
      if (query.offerType) {
        roomConditions.push(
          Prisma.sql`r.unit_type = ${query.offerType}::rental_unit_type`,
        );
        draftConditions.push(
          Prisma.sql`legacy.offer_type = ${query.offerType}::rental_unit_type`,
        );
        draftSql.push(
          Prisma.sql`d.offer_type = ${query.offerType}::rental_unit_type`,
        );
      }
      if (query.rentalMode) {
        roomConditions.push(
          Prisma.sql`p.rental_mode = ${query.rentalMode}::rental_mode`,
        );
        draftConditions.push(
          Prisma.sql`legacy.rental_mode = ${query.rentalMode}::rental_mode`,
        );
        draftSql.push(
          Prisma.sql`d.rental_mode = ${query.rentalMode}::rental_mode`,
        );
      }
      listingSql.push(Prisma.sql`(
        EXISTS (SELECT 1 FROM rooms r LEFT JOIN room_pricing p ON p.room_id = r.id WHERE ${Prisma.join(roomConditions, " AND ")})
        OR EXISTS (SELECT 1 FROM host_listing_drafts legacy WHERE ${Prisma.join(draftConditions, " AND ")})
      )`);
    }
    if (query.search?.trim()) {
      const pattern = `%${query.search.trim()}%`;
      listingSql.push(Prisma.sql`(
        l.title ILIKE ${pattern}
        OR l.description ILIKE ${pattern}
        OR region.name ILIKE ${pattern}
        OR city.name ILIKE ${pattern}
        OR district.name ILIKE ${pattern}
        OR EXISTS (SELECT 1 FROM host_listing_drafts legacy WHERE legacy.legacy_listing_id = l.id AND legacy.search_text ILIKE ${pattern})
      )`);
      draftSql.push(Prisma.sql`d.search_text ILIKE ${pattern}`);
    }

    const listingIdsPage = await Promise.all([
      this.prisma.listing.count({ where }),
      draftWhere
        ? this.prisma.hostListingDraft.count({ where: draftWhere })
        : Promise.resolve(0),
      this.prisma.$queryRaw<
        Array<{ kind: "listing" | "draft"; id: string }>
      >(Prisma.sql`
        SELECT rows.kind, rows.id
        FROM (
          SELECT 'listing'::text AS kind, l.id, l.updated_at
          FROM listings l
          LEFT JOIN addresses a ON a.id = l.address_id
          LEFT JOIN regions region ON region.id = a.region_id
          LEFT JOIN cities city ON city.id = a.city_id
          LEFT JOIN districts district ON district.id = a.district_id
          WHERE ${Prisma.join(listingSql, " AND ")}
          UNION ALL
          SELECT 'draft'::text AS kind, d.id, d.updated_at
          FROM host_listing_drafts d
          WHERE d.published_listing_id IS NULL
            AND d.legacy_listing_id IS NULL
            AND ${Prisma.join(draftSql, " AND ")}
        ) rows
        ORDER BY rows.updated_at DESC, rows.id DESC
        LIMIT ${pageSize} OFFSET ${skip}
      `),
    ]);
    const [listingTotal, draftTotal, pageRows] = listingIdsPage;
    const listingIds = pageRows
      .filter((row) => row.kind === "listing")
      .map((row) => row.id);
    const draftIds = pageRows
      .filter((row) => row.kind === "draft")
      .map((row) => row.id);
    const [loadedListings, loadedDrafts] = await Promise.all([
      listingIds.length
        ? this.prisma.listing.findMany({
            where: { AND: [where, { id: { in: listingIds } }] },
            include: {
              address: {
                include: { region: true, city: true, district: true },
              },
              media: {
                where: { isCover: true },
                take: 1,
                 select: { media: { select: { publicUrl: true, thumbnailPublicUrl: true } } },
              },
              _count: { select: { rooms: true } },
              legacyDraft: {
                select: {
                  id: true,
                  creationKey: true,
                  draftData: true,
                  currentStep: true,
                  version: true,
                  publishedListingId: true,
                  updatedAt: true,
                  photos: {
                    where: { isCover: true },
                    take: 1,
                     include: { media: { select: { publicUrl: true, thumbnailPublicUrl: true } } },
                  },
                },
              },
              rooms: {
                take: 2,
                select: {
                  id: true,
                  unitType: true,
                  status: true,
                  maxOccupancy: true,
                  pricing: {
                    select: {
                      currencyCode: true,
                      rentAmount: true,
                      rentalMode: true,
                    },
                  },
                  media: {
                    where: { isCover: true },
                    take: 1,
                     select: { media: { select: { publicUrl: true, thumbnailPublicUrl: true } } },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
      draftIds.length && draftWhere
        ? this.prisma.hostListingDraft.findMany({
            where: { AND: [draftWhere, { id: { in: draftIds } }] },
            include: {
              photos: {
                where: { isCover: true },
                take: 1,
                 include: { media: { select: { publicUrl: true, thumbnailPublicUrl: true } } },
              },
            },
          })
        : Promise.resolve([]),
    ]);
    const listingRows = loadedListings as any[];
    const draftRows = loadedDrafts as any[];

    const publishedOfferCounts = listingRows.length
      ? await this.prisma.room.groupBy({
          by: ["listingId"],
          where: {
            listingId: { in: listingRows.map((item: any) => item.id) },
            status: "published",
          },
          _count: { _all: true },
        })
      : [];
    const publishedOffersByListing = new Map(
      publishedOfferCounts.map((row: any) => [row.listingId, row._count._all]),
    );
    const blockingBookings = listingRows.length
      ? await this.prisma.booking.findMany({
          where: {
            status: { in: [...PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES] },
            room: { listingId: { in: listingRows.map((item: any) => item.id) } },
          },
          select: {
            status: true,
            room: { select: { listingId: true } },
          },
        })
      : [];
    const blockerPriority: Record<string, number> = {
      accepted: 1,
      active: 2,
      disputed: 3,
    };
    const bookingVisibilityByListing = new Map<string, string>();
    for (const booking of blockingBookings) {
      const listingId = booking.room.listingId;
      const current = bookingVisibilityByListing.get(listingId);
      if (
        !current ||
        blockerPriority[booking.status] > blockerPriority[current]
      ) {
        bookingVisibilityByListing.set(listingId, booking.status);
      }
    }

    const listingItems = listingRows.map((item: any) => {
      const linkedDraft = item.legacyDraft;
      const linkedDraftIsInProgress =
        linkedDraft &&
        !linkedDraft.publishedListingId &&
        (item.listingStatus === "draft" ||
          (item.listingStatus === "published" && item._count.rooms === 0));
      if (linkedDraftIsInProgress) {
        const data = linkedDraft.draftData ?? {};
        return {
          id: linkedDraft.id,
          draftKey: linkedDraft.creationKey,
          title: data.listing?.title || item.title || "Borrador sin título",
          description: data.listing?.description ?? item.description,
          propertyType: data.listing?.propertyType ?? item.propertyType,
          listingStatus: "draft",
          status: "draft",
          createdAt: item.createdAt,
          updatedAt: linkedDraft.updatedAt,
          publishedAt: null,
          address: {
            region: data.listing?.address?.regionName
              ? { name: data.listing.address.regionName }
              : item.address?.region,
            city: data.listing?.address?.cityName
              ? { name: data.listing.address.cityName }
              : item.address?.city,
            district: data.listing?.address?.districtName
              ? { name: data.listing.address.districtName }
              : item.address?.district,
          },
          isDraftRecord: true,
          currentStep: linkedDraft.currentStep,
          offerCount: data.offer?.offerType ? 1 : 0,
          publicOfferCount: 0,
          visibilityIssue: false,
          bookingVisibilityIssue: false,
          bookingVisibilityReason: null,
          offer: {
            id: null,
            offerType: data.offer?.offerType ?? null,
            status: "draft",
            maxGuests: data.offer?.maxGuests ?? null,
            pricing: data.offer?.pricing ?? null,
           coverUrl:
             linkedDraft.photos[0]?.media?.thumbnailPublicUrl ??
             linkedDraft.photos[0]?.media?.publicUrl ??
             null,
          },
          _sortDate: new Date(linkedDraft.updatedAt).getTime(),
        };
      }
      const offerCount = item._count.rooms;
      const candidate = offerCount === 1 ? item.rooms[0] : null;
      const bookingVisibilityReason =
        bookingVisibilityByListing.get(item.id) ?? null;
      const { rooms: _rooms, _count: _count, ...listing } = item;
      return {
        ...listing,
        isDraftRecord: false,
        offerCount,
        requiresOfferReview: offerCount > 1,
        missingOffer: offerCount === 0,
        publicOfferCount: publishedOffersByListing.get(item.id) ?? 0,
        visibilityIssue:
          item.listingStatus === "published" &&
          (publishedOffersByListing.get(item.id) ?? 0) === 0,
        bookingVisibilityIssue:
          item.listingStatus === "published" &&
          bookingVisibilityReason !== null,
        bookingVisibilityReason,
        offerNeedsActivation:
          item.listingStatus === "published" &&
          offerCount === 1 &&
          candidate?.status === "draft",
        offer: candidate
          ? {
              id: candidate.id,
              offerType: candidate.unitType,
              status: candidate.status,
              maxGuests: candidate.maxOccupancy,
              pricing: candidate.pricing,
              coverUrl:
               item.media[0]?.media?.thumbnailPublicUrl ??
                 item.media[0]?.media?.publicUrl ??
                 candidate.media[0]?.media?.thumbnailPublicUrl ??
                 candidate.media[0]?.media?.publicUrl ??
                null,
            }
          : null,
        _sortDate: new Date(item.updatedAt).getTime(),
      };
    });
    const savedDraftItems = draftRows.map((draft: any) => {
      const data = (draft.draftData ?? {}) as any;
      const { address: _privateAddress, ...publicListing } = data.listing ?? {};
      return {
        id: draft.id,
        draftKey: draft.creationKey,
        title: draft.title || "Borrador sin título",
        description: publicListing.description ?? null,
        propertyType: draft.propertyType ?? null,
        listingStatus: "draft",
        status: "draft",
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
        publishedAt: null,
        address: {
          region: data.listing?.address?.regionName
            ? { name: data.listing.address.regionName }
            : null,
          city: data.listing?.address?.cityName
            ? { name: data.listing.address.cityName }
            : null,
          district: data.listing?.address?.districtName
            ? { name: data.listing.address.districtName }
            : null,
        },
        isDraftRecord: true,
        currentStep: draft.currentStep,
        offerCount: draft.offerType ? 1 : 0,
        offer: {
          id: null,
          offerType: draft.offerType,
          status: "draft",
          maxGuests: data.offer?.maxGuests ?? null,
          pricing: data.offer?.pricing ?? null,
           coverUrl: draft.photos[0]?.mediaId
             ? `/api/host/listing-drafts/${encodeURIComponent(draft.creationKey)}/photo-content/${encodeURIComponent(draft.photos[0].mediaId)}?variant=thumbnail`
             : null,
        },
        _sortDate: new Date(draft.updatedAt).getTime(),
      };
    });
    const listingItemsById = new Map(
      listingItems.map((item: any) => [item.id, item]),
    );
    const draftItemsById = new Map(
      savedDraftItems.map((item: any) => [item.id, item]),
    );
    const combined = pageRows.flatMap((row) => {
      const item =
        row.kind === "listing"
          ? listingItemsById.get(row.id)
          : draftItemsById.get(row.id);
      if (!item) return [];
      const { _sortDate: _ignored, ...publicItem } = item;
      return [publicItem];
    });
    const total = listingTotal + draftTotal;

    return {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      items: combined,
    };
  }

  async findOne(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: {
        id,
        listingStatus: "published",
        deletedAt: null,
        rooms: {
          some: { status: "published" },
          ...roomsWithoutBlockingBookings(),
        },
      },
      include: {
        _count: { select: { rooms: true } },
        address: { include: { region: true, city: true, district: true } },
        media: {
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
          include: {
            media: true,
          },
        },
        rooms: {
          where: { status: "published" },
          include: {
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
          orderBy: { createdAt: "asc" },
        },
        amenities: {
          include: {
            amenity: true,
          },
        },
        host: {
          select: {
            id: true,
            profile: { select: { displayName: true, photoUrl: true } },
          },
        },
      },
    });

    if (!listing) {
      throw new NotFoundException("Listing no encontrado.");
    }

    return toPublicListing(listing);
  }

  async findPublicHostProfile(
    hostUserId: string,
    options: { page?: number; pageSize?: number } = {},
  ) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(24, Math.max(1, options.pageSize ?? 12));
    const listingWhere: Prisma.ListingWhereInput = {
      hostUserId,
      listingStatus: "published",
      deletedAt: null,
      rooms: {
        some: { status: "published" },
        ...roomsWithoutBlockingBookings(),
      },
    };
    const hostWhere = {
      id: hostUserId,
      status: "active" as const,
      roles: { some: { role: "host" as const } },
    };

    const [host, listings, total] = await Promise.all([
      this.prisma.user.findFirst({
        where: hostWhere,
        select: {
          profile: { select: { displayName: true, photoUrl: true } },
        },
      }),
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
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.listing.count({ where: listingWhere }),
    ]);

    if (!host) throw new NotFoundException("Perfil de anfitrión no encontrado.");

    return {
      profile: {
        displayName: host.profile?.displayName?.trim() || "Anfitrión",
        photoUrl: host.profile?.photoUrl ?? null,
      },
      items: listings.map((listing: any) => ({
        entityType: "listing",
        entityId: listing.id,
        score: 1,
        data: toPublicListingCard(listing, { includeFavorites: false }),
      })),
      total,
      page,
      pageSize,
    };
  }

  async create(currentUserId: string, input: CreateListingInput) {
    void currentUserId;
    void input;
    throw new GoneException(
      "Este endpoint anterior ya no crea anuncios incompletos. Usa el flujo de borradores /host/listing-drafts.",
    );
  }

  async validateAddressHierarchy(address: CreateListingInput["address"]) {
    if (
      address.countryCode !== "PE" ||
      !address.regionId ||
      !address.cityId ||
      !address.districtId
    ) {
      throw new BadRequestException(
        "Selecciona departamento, provincia y distrito de Perú.",
      );
    }

    const district = await this.prisma.district.findFirst({
      where: {
        id: address.districtId,
        cityId: address.cityId,
        city: {
          regionId: address.regionId,
          region: { countryCode: "PE" },
        },
      },
      select: { id: true },
    });

    if (!district) {
      throw new BadRequestException(
        "El distrito no corresponde a la provincia y departamento seleccionados.",
      );
    }
  }

  async assertPublishableListing(listing: any) {
    if (!listing.title?.trim()) {
      throw new BadRequestException("El título es obligatorio para publicar.");
    }
    if (!listing.description?.trim()) {
      throw new BadRequestException(
        "La descripción es obligatoria para publicar.",
      );
    }

    const address = listing.address;
    if (
      !address ||
      address.precision !== "exact" ||
      !address.line1?.trim() ||
      !hasValidExactPeruCoordinates(
        address.lat == null ? undefined : Number(address.lat),
        address.lng == null ? undefined : Number(address.lng),
      )
    ) {
      throw new BadRequestException("La dirección exacta está incompleta.");
    }
    await this.validateAddressHierarchy(address);

    const publishableRooms = (listing.rooms ?? []).filter((room: any) => {
      const amount = Number(room.pricing?.rentAmount);
      return (
        Number.isFinite(amount) &&
        amount > 0 &&
        ["nightly", "monthly"].includes(room.pricing?.rentalMode)
      );
    });
    if (publishableRooms.length === 0) {
      throw new BadRequestException(
        "Agrega un precio válido por día o por mes.",
      );
    }

    const isImage = (item: any) => item?.media?.type === "image";
    const imageCount =
      (listing.media ?? []).filter(isImage).length +
      (listing.rooms ?? []).reduce(
        (total: number, room: any) =>
          total + (room.media ?? []).filter(isImage).length,
        0,
      );
    if (imageCount === 0) {
      throw new BadRequestException("Agrega al menos una foto.");
    }

    return publishableRooms;
  }

  async findMineById(user: any, id: string) {
    const roles = normalizedRoles(user);
    const listing = await this.prisma.listing.findFirst({
      where: {
        id,
        ...(roles.includes("admin") ? {} : { hostUserId: user.id }),
      },
      include: {
        address: { include: { region: true, city: true, district: true } },
        media: {
          include: { media: true },
          orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
        },
        _count: { select: { rooms: true } },
        rooms: {
          take: 2,
          include: {
            pricing: true,
            media: {
              include: { media: true },
              orderBy: [{ isCover: "desc" }, { sortOrder: "asc" }],
            },
            amenities: { include: { amenity: true } },
            availabilityRules: true,
          },
          orderBy: { createdAt: "asc" },
        },
        amenities: { include: { amenity: true } },
      },
    });

    if (!listing) throw new NotFoundException("Listing no encontrado.");
    const offerCount = listing._count.rooms;
    const room = offerCount === 1 ? listing.rooms[0] : null;
    const offer = room
      ? (({ unitType, ...roomData }) => ({ ...roomData, offerType: unitType }))(
          room,
        )
      : null;
    const { rooms: _rooms, _count: _count, ...listingData } = listing;
    const publicOfferCount = await this.prisma.room.count({
      where: { listingId: id, status: "published" },
    });
    const blockingBooking = await this.prisma.booking.findFirst({
      where: {
        status: { in: [...PUBLIC_VISIBILITY_BLOCKING_BOOKING_STATUSES] },
        room: { listingId: id },
      },
      select: { status: true },
    });
    return {
      ...listingData,
      offer,
      offerCount,
      requiresOfferReview: offerCount > 1,
      missingOffer: offerCount === 0,
      publicOfferCount,
      visibilityIssue:
        listing.listingStatus === "published" && publicOfferCount === 0,
      bookingVisibilityIssue:
        listing.listingStatus === "published" && blockingBooking != null,
      bookingVisibilityReason: blockingBooking?.status ?? null,
      offerNeedsActivation:
        listing.listingStatus === "published" &&
        offerCount === 1 &&
        offer?.status === "draft",
    };
  }

  async update(id: string, input: UpdateListingDto) {
    if (
      input.minStayNights != null &&
      input.maxStayNights != null &&
      input.minStayNights > input.maxStayNights
    ) {
      throw new BadRequestException(
        "La estadía mínima no puede superar la estadía máxima.",
      );
    }

    const existing = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, minStayNights: true, maxStayNights: true },
    });
    if (!existing) throw new NotFoundException("Listing no encontrado.");

    const minStayNights = input.minStayNights ?? existing.minStayNights;
    const maxStayNights = input.maxStayNights ?? existing.maxStayNights;
    if (
      minStayNights != null &&
      maxStayNights != null &&
      minStayNights > maxStayNights
    ) {
      throw new BadRequestException(
        "La estadía mínima no puede superar la estadía máxima.",
      );
    }

    const listing = await this.prisma.listing.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined
          ? { description: input.description.trim() || null }
          : {}),
        ...(input.propertyType !== undefined
          ? { propertyType: input.propertyType }
          : {}),
        ...(input.visibilityPrecision !== undefined
          ? { visibilityPrecision: input.visibilityPrecision }
          : {}),
        ...(input.minStayNights !== undefined
          ? { minStayNights: input.minStayNights }
          : {}),
        ...(input.maxStayNights !== undefined
          ? { maxStayNights: input.maxStayNights }
          : {}),
      },
      include: { address: true },
    });

    return { message: "Listing actualizado correctamente.", listing };
  }

  async publish(id: string) {
    const exists = await this.prisma.listing.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        listingStatus: true,
        address: true,
        media: {
          select: { mediaId: true, media: { select: { type: true } } },
        },
        _count: { select: { rooms: true } },
        rooms: {
          take: 2,
          select: {
            id: true,
            status: true,
            pricing: { select: { rentAmount: true, rentalMode: true } },
            media: {
              select: { mediaId: true, media: { select: { type: true } } },
            },
          },
        },
      },
    });

    if (!exists) {
      throw new NotFoundException("Listing no encontrado.");
    }

    if (exists.listingStatus === "published") {
      if (exists._count.rooms === 0) {
        throw new ConflictException(
          "El anuncio figura publicado, pero no tiene una oferta visible. Completa una oferta desde el anuncio antes de volver a publicarlo.",
        );
      }
      if (exists._count.rooms === 1 && exists.rooms[0]?.status === "draft") {
        const publishableRooms = await this.assertPublishableListing(exists);
        const listing = await this.prisma.$transaction(async (tx) => {
          await tx.room.update({
            where: { id: publishableRooms[0].id },
            data: { status: "published" },
          });
          return tx.listing.findUnique({ where: { id } });
        });
        return {
          message:
            "El anuncio ya estaba publicado; su oferta ahora es visible.",
          listing,
        };
      }
      if (exists._count.rooms === 1 && exists.rooms[0]?.status === "paused") {
        throw new ConflictException(
          "La oferta está pausada. Pausa el anuncio y reactívalo para volver a mostrarla.",
        );
      }
      const listing = await this.prisma.listing.findUnique({ where: { id } });
      return { message: "El anuncio ya estaba publicado.", listing };
    }

    if (exists.listingStatus === "pending_review") {
      throw new ConflictException(
        "El anuncio está en revisión y no puede publicarse desde aquí.",
      );
    }
    if (["suspended", "archived"].includes(exists.listingStatus)) {
      throw new BadRequestException(
        "Este anuncio no puede publicarse desde su estado actual.",
      );
    }
    if (!["draft", "paused"].includes(exists.listingStatus)) {
      throw new BadRequestException("El estado actual no permite publicar.");
    }
    if (exists._count.rooms !== 1) {
      throw new ConflictException(
        "Este anuncio antiguo tiene varias ofertas o ninguna. Sus datos se conservaron y requiere revisión antes de publicarse como oferta única.",
      );
    }

    const publishableRooms = await this.assertPublishableListing(exists);

    const listing = await this.prisma.$transaction(async (tx) => {
      if (exists.listingStatus === "paused") {
        await tx.room.update({
          where: {
            id: publishableRooms[0].id,
          },
          data: { status: "published" },
        });
      } else {
        await tx.room.update({
          where: { id: publishableRooms[0].id },
          data: { status: "published" },
        });
      }
      return tx.listing.update({
        where: { id },
        data: { listingStatus: "published", publishedAt: new Date() },
      });
    });

    return {
      message: "Listing publicado correctamente.",
      listing,
    };
  }

  async pause(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, listingStatus: true },
    });
    if (!listing) throw new NotFoundException("Listing no encontrado.");
    if (listing.listingStatus !== "published") {
      throw new BadRequestException(
        "Solo se puede pausar un anuncio publicado.",
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.room.updateMany({
        where: { listingId: id, status: "published" },
        data: { status: "paused" },
      });
      return tx.listing.update({
        where: { id },
        data: { listingStatus: "paused" },
      });
    });
    return { message: "Listing pausado correctamente.", listing: updated };
  }

  async archive(id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      select: { id: true, listingStatus: true },
    });
    if (!listing) throw new NotFoundException("Listing no encontrado.");
    if (listing.listingStatus === "suspended") {
      throw new BadRequestException(
        "Un anuncio suspendido solo puede ser gestionado por moderación.",
      );
    }
    if (listing.listingStatus === "published") {
      throw new BadRequestException("Pausa el anuncio antes de archivarlo.");
    }
    if (!["draft", "paused"].includes(listing.listingStatus)) {
      throw new BadRequestException("El estado actual no permite archivar.");
    }
    const updated = await this.prisma.listing.update({
      where: { id },
      data: { listingStatus: "archived" },
    });
    return { message: "Listing archivado correctamente.", listing: updated };
  }
}
