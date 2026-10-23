function publicAddress(address: any) {
  if (!address) return null;

  const exactCoordinate = (value: unknown) => {
    if (value == null) return null;
    const coordinate = Number(value);
    return Number.isFinite(coordinate) ? coordinate : null;
  };

  return {
    countryCode: address.countryCode,
    region: address.region?.name ?? null,
    city: address.city?.name ?? null,
    district: address.district?.name ?? null,
    line1: address.line1 ?? null,
    lat: exactCoordinate(address.lat),
    lng: exactCoordinate(address.lng),
    precision: "exact" as const,
  };
}

function publicMedia(media: any[]) {
  return (media ?? []).map((item) => ({
    id: item.media?.id ?? item.mediaId,
    url: item.media?.publicUrl ?? null,
    thumbnailUrl:
      item.media?.thumbnailPublicUrl ?? item.media?.publicUrl ?? null,
    isCover: Boolean(item.isCover),
  }));
}

export function toPublicUnit(unit: any) {
  const sourceMedia = [
    ...(unit.parentMedia ?? unit.listing?.media ?? []),
    ...(unit.media ?? []),
  ];
  const uniqueMedia = [
    ...new Map(
      sourceMedia.map((item: any) => [item.media?.id ?? item.mediaId, item]),
    ).values(),
  ];
  return {
    id: unit.id,
    name: unit.name,
    description: unit.description,
    unitType: unit.unitType,
    isFurnished: Boolean(unit.isFurnished),
    maxGuests: unit.maxOccupancy,
    bedroomCount: unit.bedroomCount,
    bedCount: unit.bedCount,
    bathroomType: unit.bathroomType,
    bathroomCount:
      unit.bathroomCount == null ? null : Number(unit.bathroomCount),
    floorAreaM2: unit.floorAreaM2 == null ? null : Number(unit.floorAreaM2),
    availableFrom: unit.availableFrom,
    pricing: unit.pricing
      ? {
          currencyCode: unit.pricing.currencyCode,
          rentAmount: Number(unit.pricing.rentAmount),
          rentalMode: unit.pricing.rentalMode,
          depositAmount:
            unit.pricing.rentalMode === "monthly" &&
            unit.pricing.depositAmount != null
              ? Number(unit.pricing.depositAmount)
              : null,
          cleaningFee:
            unit.pricing.rentalMode === "nightly" &&
            unit.pricing.cleaningFee != null
              ? Number(unit.pricing.cleaningFee)
              : null,
          minStayNights: unit.pricing.minStayNights,
          maxStayNights: unit.pricing.maxStayNights,
          minTermMonths: unit.pricing.minTermMonths,
          maxTermMonths: unit.pricing.maxTermMonths,
        }
      : null,
    media: publicMedia(uniqueMedia).map((item) => ({
      ...item,
      media: {
        id: item.id,
        publicUrl: item.url,
        thumbnailPublicUrl: item.thumbnailUrl,
      },
    })),
    amenities: (unit.amenities ?? []).map((item: any) => item.amenity),
    ...(unit.listing
      ? {
          listing: {
            id: unit.listing.id,
            title: unit.listing.title,
            address: publicAddress(unit.listing.address),
          },
        }
      : {}),
  };
}

export function toPublicListing(listing: any) {
  const legacyMultipleOffers =
    (listing._count?.rooms ?? listing.rooms?.length ?? 0) > 1;
  const listingMedia = listing.media?.length
    ? listing.media
    : !legacyMultipleOffers && listing.rooms?.length === 1
      ? (listing.rooms[0].media ?? [])
      : [];
  return {
    id: listing.id,
    legacyMultipleOffers,
    title: listing.title,
    description: listing.description,
    propertyType: listing.propertyType,
    address: publicAddress(listing.address),
    media: publicMedia(listingMedia).map((item) => ({
      ...item,
      media: {
        id: item.id,
        publicUrl: item.url,
        thumbnailPublicUrl: item.thumbnailUrl,
      },
    })),
    rooms: (listing.rooms ?? []).map((room: any) =>
      toPublicUnit({ ...room, parentMedia: listingMedia }),
    ),
    amenities: (listing.amenities ?? []).map((item: any) => item.amenity),
    rules: listing.rules ?? {},
    ...(listing.host
      ? {
          host: {
            id: listing.host.id,
            name: listing.host.profile?.displayName ?? "Anfitrión",
            image: listing.host.profile?.photoUrl ?? null,
          },
        }
      : {}),
  };
}

export function accommodationTypeForOffer(
  propertyType: string,
  unitType: string,
): "house" | "apartment" | "room" | null {
  if (unitType === "private_room" || unitType === "shared_bed") return "room";
  if (
    unitType === "entire_place" &&
    (propertyType === "house" || propertyType === "apartment")
  ) {
    return propertyType;
  }
  return null;
}

export function toPublicListingCard(
  listing: any,
  options: { includeFavorites?: boolean } = {},
) {
  const includeFavorites = options.includeFavorites !== false;
  const allRoomCount = listing._count?.rooms ?? listing.rooms?.length ?? 0;
  const legacyMultipleOffers = allRoomCount > 1;
  const projected = toPublicListing(listing);
  const uniquePublicRoom =
    !legacyMultipleOffers && listing.rooms?.length === 1
      ? listing.rooms[0]
      : null;
  const uniquePublicUnit =
    !legacyMultipleOffers && projected.rooms.length === 1
      ? projected.rooms[0]
      : null;
  const publicTypes = new Set(
    (listing.rooms ?? [])
      .map((room: any) =>
        accommodationTypeForOffer(listing.propertyType, room.unitType),
      )
      .filter(Boolean),
  );

  if (legacyMultipleOffers && !listing.media?.length) {
    projected.media = [];
  }

  const result: Record<string, any> = {
    id: projected.id,
    title: projected.title,
    description: projected.description,
    propertyType: projected.propertyType,
    address: projected.address,
    media: projected.media,
    thumbnail:
      projected.media[0]?.thumbnailUrl ?? projected.media[0]?.url ?? null,
    amenities: projected.amenities,
    rules: projected.rules,
    accommodationType: publicTypes.size === 1 ? [...publicTypes][0] : null,
    statusLabel: "PUBLICADO",
    legacyMultipleOffers,
    unitType: uniquePublicRoom?.unitType ?? null,
    pricing: uniquePublicUnit?.pricing ?? null,
    rentalMode: uniquePublicUnit?.pricing?.rentalMode ?? null,
    maxGuests: uniquePublicUnit?.maxGuests ?? null,
    bedroomCount: uniquePublicUnit?.bedroomCount ?? null,
    bedCount: uniquePublicUnit?.bedCount ?? null,
    bathroomCount: uniquePublicUnit?.bathroomCount ?? null,
    floorAreaM2: uniquePublicUnit?.floorAreaM2 ?? null,
    isFavorite:
      includeFavorites && Boolean(uniquePublicRoom?.favorites?.length),
    favoriteRoomId: includeFavorites ? (uniquePublicRoom?.id ?? null) : null,
  };

  if (legacyMultipleOffers && includeFavorites) {
    result.favoriteOffers = (listing.rooms ?? []).map((room: any) => ({
      roomId: room.id,
      isFavorite: Boolean(room.favorites?.length),
    }));
  }

  return result;
}
