BEGIN;

UPDATE addresses AS address
SET
  region_id = canonical_region.id,
  city_id = canonical_city.id,
  district_id = canonical_district.id
FROM regions AS legacy_region,
  cities AS legacy_city,
  districts AS legacy_district,
  regions AS canonical_region,
  cities AS canonical_city,
  districts AS canonical_district
WHERE address.region_id = legacy_region.id
  AND legacy_city.id = address.city_id
  AND legacy_district.id = address.district_id
  AND canonical_region.country_code = legacy_region.country_code
  AND canonical_region.ubigeo_code IS NOT NULL
  AND translate(lower(canonical_region.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_region.name), 'áéíóúüñ', 'aeiouun')
  AND canonical_city.region_id = canonical_region.id
  AND translate(lower(canonical_city.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_city.name), 'áéíóúüñ', 'aeiouun')
  AND canonical_district.city_id = canonical_city.id
  AND translate(lower(canonical_district.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_district.name), 'áéíóúüñ', 'aeiouun')
  AND legacy_region.ubigeo_code IS NULL;

UPDATE addresses AS address
SET
  region_id = canonical_region.id,
  city_id = canonical_city.id
FROM regions AS legacy_region,
  cities AS legacy_city,
  regions AS canonical_region,
  cities AS canonical_city
WHERE address.region_id = legacy_region.id
  AND legacy_city.id = address.city_id
  AND canonical_region.country_code = legacy_region.country_code
  AND canonical_region.ubigeo_code IS NOT NULL
  AND translate(lower(canonical_region.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_region.name), 'áéíóúüñ', 'aeiouun')
  AND canonical_city.region_id = canonical_region.id
  AND translate(lower(canonical_city.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_city.name), 'áéíóúüñ', 'aeiouun')
  AND address.district_id IS NULL
  AND legacy_region.ubigeo_code IS NULL;

UPDATE addresses AS address
SET region_id = canonical_region.id
FROM regions AS legacy_region
JOIN regions AS canonical_region
  ON canonical_region.country_code = legacy_region.country_code
  AND canonical_region.ubigeo_code IS NOT NULL
  AND translate(lower(canonical_region.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_region.name), 'áéíóúüñ', 'aeiouun')
WHERE address.region_id = legacy_region.id
  AND address.city_id IS NULL
  AND legacy_region.ubigeo_code IS NULL;

DELETE FROM districts AS legacy_district
USING cities AS legacy_city, regions AS legacy_region
WHERE legacy_district.city_id = legacy_city.id
  AND legacy_city.region_id = legacy_region.id
  AND legacy_region.ubigeo_code IS NULL
  AND EXISTS (
    SELECT 1
    FROM regions AS canonical_region
    JOIN cities AS canonical_city ON canonical_city.region_id = canonical_region.id
    JOIN districts AS canonical_district ON canonical_district.city_id = canonical_city.id
    WHERE canonical_region.country_code = legacy_region.country_code
      AND canonical_region.ubigeo_code IS NOT NULL
      AND translate(lower(canonical_region.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_region.name), 'áéíóúüñ', 'aeiouun')
      AND translate(lower(canonical_city.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_city.name), 'áéíóúüñ', 'aeiouun')
      AND translate(lower(canonical_district.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_district.name), 'áéíóúüñ', 'aeiouun')
  );

DELETE FROM cities AS legacy_city
USING regions AS legacy_region
WHERE legacy_city.region_id = legacy_region.id
  AND legacy_region.ubigeo_code IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM districts WHERE city_id = legacy_city.id
  )
  AND EXISTS (
    SELECT 1
    FROM regions AS canonical_region
    JOIN cities AS canonical_city ON canonical_city.region_id = canonical_region.id
    WHERE canonical_region.country_code = legacy_region.country_code
      AND canonical_region.ubigeo_code IS NOT NULL
      AND translate(lower(canonical_region.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_region.name), 'áéíóúüñ', 'aeiouun')
      AND translate(lower(canonical_city.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_city.name), 'áéíóúüñ', 'aeiouun')
  );

DELETE FROM regions AS legacy_region
WHERE legacy_region.ubigeo_code IS NULL
  AND NOT EXISTS (SELECT 1 FROM cities WHERE region_id = legacy_region.id)
  AND EXISTS (
    SELECT 1
    FROM regions AS canonical_region
    WHERE canonical_region.country_code = legacy_region.country_code
      AND canonical_region.ubigeo_code IS NOT NULL
      AND translate(lower(canonical_region.name), 'áéíóúüñ', 'aeiouun') = translate(lower(legacy_region.name), 'áéíóúüñ', 'aeiouun')
  );

COMMIT;
