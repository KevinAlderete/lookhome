ALTER TABLE "listings"
ALTER COLUMN "visibility_precision" SET DEFAULT 'exact';

UPDATE "listings"
SET "visibility_precision" = 'exact'
WHERE "visibility_precision" <> 'exact';
