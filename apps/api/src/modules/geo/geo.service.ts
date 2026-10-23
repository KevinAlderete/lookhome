import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma/prisma.service";

function displayName(name: string) {
  return name
    .toLocaleLowerCase("es-PE")
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_match, prefix, letter) =>
        `${prefix}${letter.toLocaleUpperCase("es-PE")}`,
    );
}

function normalizedAdministrativeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-PE")
    .replace(
      /^(?:departamento|region|provincia constitucional|provincia|distrito)\s+(?:(?:de|del)\s+)?/u,
      "",
    )
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function uniqueNormalizedMatch<T extends { name: string }>(
  records: T[],
  name: string,
): T | null {
  const normalizedName = normalizedAdministrativeName(name);
  const matches = records.filter(
    (record) => normalizedAdministrativeName(record.name) === normalizedName,
  );
  return matches.length === 1 ? matches[0] : null;
}

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  async getCountries() {
    return this.prisma.country.findMany({
      orderBy: [{ name: "asc" }],
      select: {
        code: true,
        name: true,
      },
    });
  }

  async getRegions(countryCode: string) {
    const country = await this.prisma.country.findUnique({
      where: { code: countryCode },
      select: { code: true },
    });

    if (!country) {
      throw new BadRequestException("countryCode no existe.");
    }

    const regions = await this.prisma.region.findMany({
      where: {
        countryCode,
        ubigeoCode: { not: null },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        countryCode: true,
        name: true,
      },
    });

    return regions.map((region) => ({
      ...region,
      name: displayName(region.name),
    }));
  }

  async getCities(regionId: string) {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });

    if (!region) {
      throw new BadRequestException("regionId no existe.");
    }

    const cities = await this.prisma.city.findMany({
      where: {
        regionId,
        ubigeoCode: { not: null },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        regionId: true,
        name: true,
        centerLat: true,
        centerLng: true,
      },
    });

    return cities.map((city) => ({ ...city, name: displayName(city.name) }));
  }

  async getDistricts(cityId: string) {
    const city = await this.prisma.city.findUnique({
      where: { id: cityId },
      select: { id: true },
    });

    if (!city) {
      throw new BadRequestException("cityId no existe.");
    }

    const districts = await this.prisma.district.findMany({
      where: {
        cityId,
        ubigeoCode: { not: null },
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        cityId: true,
        name: true,
      },
    });

    return districts.map((district) => ({
      ...district,
      name: displayName(district.name),
    }));
  }

  async getCascade(params: {
    countryCode?: string;
    regionId?: string;
    cityId?: string;
  }) {
    const { countryCode, regionId, cityId } = params;

    const [countries, regions, cities, districts] = await Promise.all([
      this.prisma.country.findMany({
        orderBy: [{ name: "asc" }],
        select: {
          code: true,
          name: true,
        },
      }),

      countryCode
        ? this.prisma.region.findMany({
            where: { countryCode, ubigeoCode: { not: null } },
            orderBy: [{ name: "asc" }],
            select: {
              id: true,
              countryCode: true,
              name: true,
            },
          })
        : Promise.resolve([]),

      regionId
        ? this.prisma.city.findMany({
            where: { regionId, ubigeoCode: { not: null } },
            orderBy: [{ name: "asc" }],
            select: {
              id: true,
              regionId: true,
              name: true,
              centerLat: true,
              centerLng: true,
            },
          })
        : Promise.resolve([]),

      cityId
        ? this.prisma.district.findMany({
            where: { cityId, ubigeoCode: { not: null } },
            orderBy: [{ name: "asc" }],
            select: {
              id: true,
              cityId: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      selected: {
        countryCode: countryCode ?? null,
        regionId: regionId ?? null,
        cityId: cityId ?? null,
      },
      countries,
      regions: regions.map((region) => ({
        ...region,
        name: displayName(region.name),
      })),
      cities: cities.map((city) => ({ ...city, name: displayName(city.name) })),
      districts: districts.map((district) => ({
        ...district,
        name: displayName(district.name),
      })),
    };
  }

  async getTree(countryCode: string) {
    const country = await this.prisma.country.findUnique({
      where: { code: countryCode },
      select: {
        code: true,
        name: true,
      },
    });

    if (!country) {
      throw new BadRequestException("countryCode no existe.");
    }

    const regions = await this.prisma.region.findMany({
      where: { countryCode, ubigeoCode: { not: null } },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        countryCode: true,
        name: true,
        cities: {
          where: { ubigeoCode: { not: null } },
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            regionId: true,
            name: true,
            centerLat: true,
            centerLng: true,
            districts: {
              where: { ubigeoCode: { not: null } },
              orderBy: [{ name: "asc" }],
              select: {
                id: true,
                cityId: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      country,
      regions,
    };
  }

  async getSelectedGeocodingContext(params: {
    regionId?: string;
    cityId?: string;
    districtId?: string;
  }) {
    if (!params.regionId && !params.cityId && !params.districtId) return null;

    let selection: {
      region: { id: string; name: string; countryCode: string } | null;
      city: {
        id: string;
        name: string;
        centerLat: unknown;
        centerLng: unknown;
      } | null;
      district: { id: string; name: string } | null;
    } = { region: null, city: null, district: null };

    if (params.districtId) {
      const district = await this.prisma.district.findUnique({
        where: { id: params.districtId },
        select: {
          id: true,
          name: true,
          city: {
            select: {
              id: true,
              name: true,
              centerLat: true,
              centerLng: true,
              region: { select: { id: true, name: true, countryCode: true } },
            },
          },
        },
      });
      if (!district) throw new BadRequestException("El distrito seleccionado no existe.");
      selection = {
        district: { id: district.id, name: district.name },
        city: {
          id: district.city.id,
          name: district.city.name,
          centerLat: district.city.centerLat,
          centerLng: district.city.centerLng,
        },
        region: district.city.region,
      };
    } else if (params.cityId) {
      const city = await this.prisma.city.findUnique({
        where: { id: params.cityId },
        select: {
          id: true,
          name: true,
          centerLat: true,
          centerLng: true,
          region: { select: { id: true, name: true, countryCode: true } },
        },
      });
      if (!city) throw new BadRequestException("La provincia seleccionada no existe.");
      selection = {
        region: city.region,
        city: {
          id: city.id,
          name: city.name,
          centerLat: city.centerLat,
          centerLng: city.centerLng,
        },
        district: null,
      };
    } else if (params.regionId) {
      const region = await this.prisma.region.findUnique({
        where: { id: params.regionId },
        select: { id: true, name: true, countryCode: true },
      });
      if (!region) throw new BadRequestException("El departamento seleccionado no existe.");
      selection = { region, city: null, district: null };
    }

    if (
      (params.regionId && selection.region?.id !== params.regionId) ||
      (params.cityId && selection.city?.id !== params.cityId) ||
      (params.districtId && selection.district?.id !== params.districtId) ||
      selection.region?.countryCode !== "PE"
    ) {
      throw new BadRequestException("La jerarquía administrativa seleccionada no coincide.");
    }

    const centerLat = Number(selection.city?.centerLat);
    const centerLng = Number(selection.city?.centerLng);
    const hasReliableProximity =
      Number.isFinite(centerLat) &&
      Number.isFinite(centerLng) &&
      centerLat >= -18.5 &&
      centerLat <= 0.1 &&
      centerLng >= -81.5 &&
      centerLng <= -68.5;

    return {
      region: selection.region?.name ?? null,
      city: selection.city?.name ?? null,
      district: selection.district?.name ?? null,
      proximity: hasReliableProximity
        ? { lat: centerLat, lng: centerLng }
        : null,
      source: "host-selected" as const,
    };
  }

  async resolveIneiLocation(params: {
    regionName: string | null;
    cityName: string | null;
    districtName: string | null;
  }): Promise<{
    regionId: string | null;
    cityId: string | null;
    districtId: string | null;
  }> {
    if (!params.regionName) {
      return { regionId: null, cityId: null, districtId: null };
    }

    const regions = await this.prisma.region.findMany({
      where: { countryCode: "PE", ubigeoCode: { not: null } },
      select: { id: true, name: true },
    });
    const region = uniqueNormalizedMatch(regions, params.regionName);
    if (!region) {
      return { regionId: null, cityId: null, districtId: null };
    }

    if (!params.cityName) {
      return { regionId: region.id, cityId: null, districtId: null };
    }

    const cities = await this.prisma.city.findMany({
      where: { regionId: region.id, ubigeoCode: { not: null } },
      select: { id: true, name: true },
    });
    const city = uniqueNormalizedMatch(cities, params.cityName);
    if (!city) {
      return { regionId: region.id, cityId: null, districtId: null };
    }

    if (!params.districtName) {
      return { regionId: region.id, cityId: city.id, districtId: null };
    }

    const districts = await this.prisma.district.findMany({
      where: { cityId: city.id, ubigeoCode: { not: null } },
      select: { id: true, name: true },
    });
    const district = uniqueNormalizedMatch(districts, params.districtName);

    return {
      regionId: region.id,
      cityId: city.id,
      districtId: district?.id ?? null,
    };
  }
}
