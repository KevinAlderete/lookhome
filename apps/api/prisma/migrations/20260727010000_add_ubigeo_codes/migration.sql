ALTER TABLE regions ADD COLUMN IF NOT EXISTS ubigeo_code varchar(2);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS ubigeo_code varchar(4);
ALTER TABLE districts ADD COLUMN IF NOT EXISTS ubigeo_code varchar(6);

CREATE UNIQUE INDEX IF NOT EXISTS uq_regions_country_ubigeo_code
  ON regions (country_code, ubigeo_code)
  WHERE ubigeo_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cities_ubigeo_code
  ON cities (ubigeo_code)
  WHERE ubigeo_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_districts_ubigeo_code
  ON districts (ubigeo_code)
  WHERE ubigeo_code IS NOT NULL;
