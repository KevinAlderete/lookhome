import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL debe estar configurado para ejecutar el seed.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

type UbigeoRecord = {
  inei: string;
  departamento: string;
  provincia: string;
  distrito: string;
  latitude?: number | null;
  longitude?: number | null;
};

function loadUbigeoRecords(): UbigeoRecord[] {
  const filePath = join(__dirname, "data", "peru-ubigeo-inei.json");
  const records = JSON.parse(readFileSync(filePath, "utf8")) as UbigeoRecord[];
  return records.filter(
    (record) =>
      /^\d{6}$/.test(record.inei) &&
      Boolean(record.departamento && record.provincia && record.distrito),
  );
}

function averageCoordinate(
  records: UbigeoRecord[],
  key: "latitude" | "longitude",
) {
  const values = records
    .map((record) => Number(record[key]))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  return Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(6),
  );
}

function displayName(name: string) {
  return name
    .toLocaleLowerCase("es-PE")
    .replace(
      /(^|[\s-])(\p{L})/gu,
      (_match, prefix, letter) =>
        `${prefix}${letter.toLocaleUpperCase("es-PE")}`,
    );
}

async function main() {
  const peru = await prisma.country.upsert({
    where: { code: "PE" },
    update: { name: "Perú" },
    create: { code: "PE", name: "Perú" },
  });

  await prisma.currency.upsert({
    where: { code: "PEN" },
    update: { symbol: "S/" },
    create: { code: "PEN", symbol: "S/" },
  });

  const ubigeoRecords = loadUbigeoRecords();
  const regions = new Map<string, string>();
  const recordsByProvince = new Map<string, UbigeoRecord[]>();
  const citiesByProvince = new Map<string, string>();

  for (const record of ubigeoRecords) {
    const departmentCode = record.inei.slice(0, 2);
    if (!regions.has(departmentCode)) {
      const existingRegion = await prisma.region.findFirst({
        where: { countryCode: peru.code, ubigeoCode: departmentCode },
      });
      const region = existingRegion
        ? await prisma.region.update({
            where: { id: existingRegion.id },
            data: { ubigeoCode: departmentCode },
          })
        : await prisma.region.upsert({
            where: {
              countryCode_name: {
                countryCode: peru.code,
                name: displayName(record.departamento),
              },
            },
            update: { ubigeoCode: departmentCode },
            create: {
              countryCode: peru.code,
              name: displayName(record.departamento),
              ubigeoCode: departmentCode,
            },
          });
      regions.set(departmentCode, region.id);
    }

    const provinceCode = record.inei.slice(0, 4);
    const provinceRecords = recordsByProvince.get(provinceCode) ?? [];
    provinceRecords.push(record);
    recordsByProvince.set(provinceCode, provinceRecords);
  }

  for (const [provinceCode, provinceRecords] of recordsByProvince) {
    const first = provinceRecords[0];
    const regionId = regions.get(provinceCode.slice(0, 2))!;
    const existingCity = await prisma.city.findFirst({
      where: { ubigeoCode: provinceCode },
    });
    const city = existingCity
      ? await prisma.city.update({
          where: { id: existingCity.id },
          data: {
            ubigeoCode: provinceCode,
            centerLat: averageCoordinate(provinceRecords, "latitude"),
            centerLng: averageCoordinate(provinceRecords, "longitude"),
          },
        })
      : await prisma.city.upsert({
          where: {
            regionId_name: {
              regionId,
              name: displayName(first.provincia),
            },
          },
          update: {
            ubigeoCode: provinceCode,
            centerLat: averageCoordinate(provinceRecords, "latitude"),
            centerLng: averageCoordinate(provinceRecords, "longitude"),
          },
          create: {
            regionId,
            name: displayName(first.provincia),
            ubigeoCode: provinceCode,
            centerLat: averageCoordinate(provinceRecords, "latitude"),
            centerLng: averageCoordinate(provinceRecords, "longitude"),
          },
        });
    citiesByProvince.set(provinceCode, city.id);
  }

  await prisma.district.createMany({
    data: ubigeoRecords.map((record) => ({
      cityId: citiesByProvince.get(record.inei.slice(0, 4))!,
      name: displayName(record.distrito),
      ubigeoCode: record.inei,
    })),
    skipDuplicates: true,
  });

  await prisma.$executeRaw`
    UPDATE districts
    SET name = initcap(lower(name))
    WHERE ubigeo_code IS NOT NULL
  `;

  const amenities = [
    { code: "wifi", name: "Wi-Fi", category: "internet" },
    { code: "ethernet", name: "Internet por cable", category: "internet" },
    { code: "bed", name: "Cama", category: "room" },
    { code: "desk", name: "Escritorio", category: "room" },
    { code: "closet", name: "Clóset", category: "room" },
    { code: "furnished", name: "Amoblado", category: "room" },
    { code: "private_bathroom", name: "Baño privado", category: "room" },
    { code: "kitchen", name: "Cocina", category: "kitchen" },
    { code: "refrigerator", name: "Refrigeradora", category: "kitchen" },
    { code: "microwave", name: "Microondas", category: "kitchen" },
    { code: "laundry", name: "Lavandería", category: "property" },
    { code: "parking", name: "Estacionamiento", category: "property" },
    { code: "elevator", name: "Ascensor", category: "building" },
    { code: "gym", name: "Gimnasio", category: "building" },
    { code: "pool", name: "Piscina", category: "building" },
    { code: "doorman", name: "Portería", category: "safety" },
    {
      code: "security_cameras",
      name: "Cámaras de seguridad",
      category: "safety",
    },
    { code: "smoke_detector", name: "Detector de humo", category: "safety" },
  ] as const;

  await Promise.all(
    amenities.map((amenity) =>
      prisma.amenity.upsert({
        where: { code: amenity.code },
        update: { name: amenity.name, category: amenity.category },
        create: amenity,
      }),
    ),
  );

  const houseRules = [
    { code: "no_smoking", name: "No fumar" },
    { code: "no_parties", name: "No se permiten fiestas" },
    { code: "pets_on_request", name: "Mascotas previa consulta" },
    { code: "visitors_on_request", name: "Visitas previa consulta" },
    { code: "quiet_hours", name: "Respetar horario de silencio" },
  ];

  await Promise.all(
    houseRules.map((rule) =>
      prisma.houseRule.upsert({
        where: { code: rule.code },
        update: { name: rule.name },
        create: rule,
      }),
    ),
  );
}

main().finally(() => prisma.$disconnect());
