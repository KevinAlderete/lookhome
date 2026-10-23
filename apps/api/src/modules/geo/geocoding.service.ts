import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GeoService } from "./geo.service";

const PERU_BOUNDS = {
  minLat: -18.5,
  maxLat: 0.1,
  minLng: -81.5,
  maxLng: -68.5,
} as const;

const EMPTY_INEI_IDS = {
  regionId: null,
  cityId: null,
  districtId: null,
} as const;

const SUGGESTION_TYPES = new Set([
  "address",
  "road",
  "poi",
  "place",
  "locality",
  "neighbourhood",
  "municipality",
  "municipal_district",
  "joint_municipality",
  "joint_submunicipality",
  "subregion",
  "county",
  "region",
]);
const IGNORED_PRIMARY_QUERY_WORDS = new Set([
  "av",
  "avenida",
  "calle",
  "carretera",
  "de",
  "del",
  "el",
  "jirón",
  "jiron",
  "jr",
  "la",
  "las",
  "los",
  "pasaje",
  "psje",
  "urb",
  "urbanización",
  "urbanizacion",
]);

type JsonObject = Record<string, unknown>;

export interface AdministrativeContext {
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
}

export interface GeocodingItem {
  id: string;
  label: string;
  line1: string;
  postalCode: string | null;
  lat: number;
  lng: number;
  type: string | null;
  precision: "address-candidate" | "street-reference" | "place-reference" | "poi";
  relevance: number | null;
  administrativeMatch: "matched" | "different" | "unknown";
  administrativeResolution: "unique" | "partial" | "unresolved";
  context: AdministrativeContext;
  regionId: string | null;
  cityId: string | null;
  districtId: string | null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizedWords(value: string): string[] {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\b(?:jr\.?|jiron)\b/g, "jiron")
      .replace(/\b(?:av\.?|avenida)\b/g, "avenida")
      .match(/[a-z0-9]+/g) ?? []
  );
}

function primaryQueryWords(query: string): string[] {
  const primaryWords = normalizedWords(query.split(",", 1)[0]).filter(
    (word) =>
      word.length >= 3 &&
      !/^\d+$/.test(word) &&
      !IGNORED_PRIMARY_QUERY_WORDS.has(word),
  );
  return primaryWords;
}

function queryWordCoverage(feature: JsonObject, query: string): number {
  const primaryWords = primaryQueryWords(query);
  if (primaryWords.length === 0) return 1;

  const properties = isObject(feature.properties) ? feature.properties : {};
  const searchableWords = new Set(
    normalizedWords(
      [
        asString(feature.text_es),
        asString(feature.text),
        asString(feature.place_name_es),
        asString(feature.place_name),
        asString(feature.address),
        asString(properties.address),
      ]
        .filter((value): value is string => value !== null)
        .join(" "),
    ),
  );

  const matched = primaryWords.filter((word) => searchableWords.has(word));
  return matched.length / primaryWords.length;
}

function textContainsName(text: string, name: string | null) {
  if (!name) return false;
  const normalizedText = normalizedWords(text).join(" ");
  const normalizedName = normalizedWords(name).join(" ");
  return Boolean(normalizedName) && normalizedText.includes(normalizedName);
}

function addMissingContext(query: string, context: {
  region: string | null;
  city: string | null;
  district: string | null;
}) {
  const included = normalizedWords(query).join(" ");
  const parts = [context.district, context.city, context.region, "Perú"].filter(
    (part): part is string => Boolean(part),
  );
  const missing = parts.filter((part) => !textContainsName(included, part));
  return [query.trim(), ...missing].filter(Boolean).join(", ");
}

export function stripHouseNumber(query: string): string | null {
  const parts = query.split(",");
  const street = parts[0] ?? "";
  const withoutNumber = street.replace(
    /\s+\d{1,4}[a-z]?(?:[-/]\d{1,4}[a-z]?)?\b/iu,
    "",
  ).trim();
  if (!withoutNumber || withoutNumber === street.trim()) return null;
  return [withoutNumber, ...parts.slice(1).map((part) => part.trim())]
    .filter(Boolean)
    .join(", ");
}

function typePriority(type: string | null) {
  return ({
    address: 0,
    road: 1,
    poi: 2,
    neighbourhood: 3,
    locality: 4,
    place: 5,
    municipality: 6,
    municipal_district: 6,
    joint_municipality: 6,
    joint_submunicipality: 6,
    subregion: 7,
    county: 7,
    region: 8,
  } as Record<string, number>)[type ?? ""] ?? 9;
}

function isWithinPeruBounds(lat: number, lng: number) {
  return (
    lat >= PERU_BOUNDS.minLat &&
    lat <= PERU_BOUNDS.maxLat &&
    lng >= PERU_BOUNDS.minLng &&
    lng <= PERU_BOUNDS.maxLng
  );
}

function featureType(feature: JsonObject): string | null {
  const placeTypes = feature.place_type;
  if (Array.isArray(placeTypes)) {
    const type = placeTypes.find((value) => typeof value === "string");
    if (typeof type === "string") return type;
  }

  const directType = asString(placeTypes);
  if (directType) return directType;

  const id = asString(feature.id);
  return id?.includes(".") ? id.split(".", 1)[0] : null;
}

function featureName(feature: JsonObject): string | null {
  return (
    asString(feature.text_es) ??
    asString(feature.text) ??
    asString(feature.place_name_es) ??
    asString(feature.place_name)
  );
}

@Injectable()
export class GeocodingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly geoService: GeoService,
  ) {}

  async suggest(
    query: string,
    selectedLocation: {
      regionId?: string;
      cityId?: string;
      districtId?: string;
    } = {},
    mode: "autocomplete" | "complete" = "autocomplete",
  ): Promise<{ items: GeocodingItem[]; retriedWithoutHouseNumber: boolean }> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 3 || normalizedQuery.length > 200) {
      throw new BadRequestException("q debe tener entre 3 y 200 caracteres.");
    }

    const context = await this.geoService.getSelectedGeocodingContext(
      selectedLocation,
    );
    const search = async (input: string) => {
      const contextualQuery = context
        ? addMissingContext(input, context)
        : addMissingContext(input, { region: null, city: null, district: null });
      const features = await this.request(
        encodeURIComponent(contextualQuery),
        "forward",
        {
          autocomplete: mode === "autocomplete",
          proximity: context?.proximity
            ? [context.proximity.lng, context.proximity.lat]
            : undefined,
        },
      );
      return this.normalizeCandidates(features, input, context);
    };

    let items = await search(normalizedQuery);
    let retriedWithoutHouseNumber = false;
    if (
      mode === "complete" &&
      !items.some((item) => this.isUsefulCandidate(item, normalizedQuery))
    ) {
      const fallbackQuery = stripHouseNumber(normalizedQuery);
      if (fallbackQuery) {
        retriedWithoutHouseNumber = true;
        items = await search(fallbackQuery);
      }
    }

    return { items: items.slice(0, 5), retriedWithoutHouseNumber };
  }

  async reverse(
    lat: number,
    lng: number,
  ): Promise<{ item: GeocodingItem | null }> {
    if (!isWithinPeruBounds(lat, lng)) {
      throw new BadRequestException(
        "Las coordenadas deben estar dentro de Perú.",
      );
    }

    const features = await this.request(`${lng},${lat}`, "reverse");
    const candidates = await this.normalizeCandidates(features, "", null);
    const item = candidates[0] ?? null;

    return { item };
  }

  private async request(
    path: string,
    mode: "forward" | "reverse",
    options: {
      autocomplete?: boolean;
      proximity?: [number, number];
    } = {},
  ): Promise<JsonObject[]> {
    const key = this.configService.get<string>("MAPTILER_GEOCODING_KEY");
    if (!key) {
      throw new ServiceUnavailableException(
        "La búsqueda de direcciones no está configurada.",
      );
    }

    const url = new URL(`https://api.maptiler.com/geocoding/${path}.json`);
    url.searchParams.set("key", key);
    url.searchParams.set("language", "es");
    if (mode === "forward") {
      url.searchParams.set("country", "pe");
      url.searchParams.set("limit", "10");
      url.searchParams.set(
        "types",
        "address,road,poi,place,locality,neighbourhood,municipality,municipal_district,joint_municipality,joint_submunicipality,subregion,county,region",
      );
      url.searchParams.set("autocomplete", String(options.autocomplete ?? true));
      if (options.proximity) {
        url.searchParams.set("proximity", options.proximity.join(","));
      }
    }

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new BadGatewayException(
        "No se pudo conectar con la búsqueda de direcciones.",
      );
    }

    if (!response.ok) {
      throw new BadGatewayException(
        "La búsqueda de direcciones no está disponible.",
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new BadGatewayException(
        "La búsqueda de direcciones devolvió una respuesta inválida.",
      );
    }

    if (!isObject(payload) || !Array.isArray(payload.features)) return [];
    return payload.features.filter(isObject).slice(0, 10);
  }

  private async normalizeCandidates(
    features: JsonObject[],
    query: string,
    selectedContext: {
      region: string | null;
      city: string | null;
      district: string | null;
    } | null,
  ) {
    const ranked = await Promise.all(
      features
        .filter((feature) => SUGGESTION_TYPES.has(featureType(feature) ?? ""))
        .map(async (feature) => {
          const item = await this.toSuggestion(feature, selectedContext);
          if (!item) return null;
          const coverage = query ? queryWordCoverage(feature, query) : 1;
          return {
            item,
            coverage,
            relevance: item.relevance ?? 0,
            context: item.administrativeMatch === "matched" ? 2 : item.administrativeMatch === "unknown" ? 1 : 0,
            type: typePriority(item.type),
          };
        }),
    );

    const unique = new Map<string, (typeof ranked)[number] & {}>();
    for (const candidate of ranked) {
      if (!candidate) continue;
      const key = candidate.item.id || `${candidate.item.type}:${candidate.item.lat}:${candidate.item.lng}`;
      const existing = unique.get(key);
      if (
        !existing ||
        candidate.context > existing.context ||
        (candidate.context === existing.context && candidate.coverage > existing.coverage)
      ) {
        unique.set(key, candidate);
      }
    }

    return [...unique.values()]
      .sort(
        (left, right) =>
          right.context - left.context ||
          right.coverage - left.coverage ||
          right.relevance - left.relevance ||
          left.type - right.type,
      )
      .map((candidate) => candidate.item);
  }

  private isUsefulCandidate(item: GeocodingItem, query: string) {
    const normalizedQuery = primaryQueryWords(query);
    const candidateWords = new Set(normalizedWords(item.label));
    const matchedWords = normalizedQuery.filter((word) => candidateWords.has(word));
    return (
      normalizedQuery.length === 0 ||
      (item.relevance != null && item.relevance >= 0.75) ||
      matchedWords.length > 0 ||
      item.administrativeMatch === "matched"
    );
  }

  private async toSuggestion(
    feature: JsonObject,
    selectedContext: {
      region: string | null;
      city: string | null;
      district: string | null;
    } | null,
  ): Promise<GeocodingItem | null> {
    const center = feature.center;
    if (!Array.isArray(center)) return null;

    const [lng, lat] = center;
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !isWithinPeruBounds(lat, lng)
    ) {
      return null;
    }

    if (!this.isPeruvianFeature(feature)) return null;

    const label =
      asString(feature.place_name_es) ??
      asString(feature.place_name) ??
      featureName(feature);
    if (!label) return null;

    const properties = isObject(feature.properties) ? feature.properties : {};
    const address =
      asString(properties.address) ??
      asString(feature.address) ??
      asString(properties.housenumber);
    const text = featureName(feature) ?? label;
    const context = this.extractAdministrativeContext(feature);

    let ineiIds: {
      regionId: string | null;
      cityId: string | null;
      districtId: string | null;
    } = EMPTY_INEI_IDS;
    try {
      ineiIds = await this.geoService.resolveIneiLocation({
        regionName: context.region,
        cityName: context.city,
        districtName: context.district,
      });
    } catch {
      // MapTiler remains useful even if the local geographic catalog is down.
    }

    const administrativeLevel = selectedContext?.district
      ? "district"
      : selectedContext?.city
        ? "city"
        : selectedContext?.region
          ? "region"
          : null;
    const selectedName = administrativeLevel
      ? selectedContext?.[administrativeLevel] ?? null
      : null;
    const candidateName = administrativeLevel
      ? context[administrativeLevel]
      : null;
    const administrativeMatch: GeocodingItem["administrativeMatch"] =
      !selectedName || !candidateName
        ? "unknown"
        : normalizedWords(selectedName).join(" ") ===
            normalizedWords(candidateName).join(" ")
          ? "matched"
          : "different";
    const type = featureType(feature);
    const precision: GeocodingItem["precision"] =
      type === "address"
        ? "address-candidate"
        : type === "road"
          ? "street-reference"
          : type === "poi"
            ? "poi"
            : "place-reference";
    const administrativeResolution: GeocodingItem["administrativeResolution"] =
      ineiIds.districtId
        ? "unique"
        : ineiIds.regionId || ineiIds.cityId
          ? "partial"
          : "unresolved";
    const relevance =
      typeof feature.relevance === "number" && Number.isFinite(feature.relevance)
        ? feature.relevance
        : null;

    return {
      id: asString(feature.id) ?? `${lng},${lat}`,
      label,
      line1: address ? `${text} ${address}` : label,
      postalCode: this.extractPostalCode(feature, properties),
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      type,
      precision,
      relevance,
      administrativeMatch,
      administrativeResolution,
      context,
      ...ineiIds,
    };
  }

  private extractAdministrativeContext(
    feature: JsonObject,
  ): AdministrativeContext {
    const rawContext = Array.isArray(feature.context)
      ? feature.context.filter(isObject)
      : [];
    const entries = [...rawContext, feature];

    const findName = (types: string[]) => {
      const entry = entries.find((candidate) => {
        const type = featureType(candidate);
        return type !== null && types.includes(type);
      });
      return entry ? featureName(entry) : null;
    };

    return {
      country: findName(["country"]),
      region: findName(["region"]),
      city:
        findName(["subregion", "county", "joint_municipality", "city"]) ??
        findName(["place"]),
      district:
        findName([
          "municipality",
          "municipal_district",
          "joint_submunicipality",
          "district",
        ]) ?? findName(["locality"]),
    };
  }

  private isPeruvianFeature(feature: JsonObject) {
    const properties = isObject(feature.properties) ? feature.properties : {};
    const rawContext = Array.isArray(feature.context)
      ? feature.context.filter(isObject)
      : [];
    const entries = [properties, ...rawContext, feature];
    const countryCode = entries
      .map((entry) => asString(entry.country_code))
      .find((code) => code !== null);

    return !countryCode || countryCode.toLowerCase() === "pe";
  }

  private extractPostalCode(
    feature: JsonObject,
    properties: JsonObject,
  ): string | null {
    const direct =
      asString(properties.postal_code) ??
      asString(properties.postalCode) ??
      asString(feature.postal_code);
    if (direct) return direct;

    const context = Array.isArray(feature.context)
      ? feature.context.filter(isObject)
      : [];
    const postal = context.find((entry) =>
      ["postal_code", "postcode"].includes(featureType(entry) ?? ""),
    );
    return postal ? featureName(postal) : null;
  }
}
