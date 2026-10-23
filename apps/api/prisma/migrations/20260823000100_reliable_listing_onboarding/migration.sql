-- Reliable, idempotent listing onboarding.
ALTER TABLE "listings"
  ADD COLUMN IF NOT EXISTS "creation_key" UUID,
  ADD COLUMN IF NOT EXISTS "creation_payload_hash" CHAR(64),
  ADD COLUMN IF NOT EXISTS "draft_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "media"
  ADD COLUMN IF NOT EXISTS "upload_key" UUID;

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "bathroom_count" DECIMAL(4,1) NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS "listings_host_user_id_creation_key_key"
  ON "listings"("host_user_id", "creation_key");

CREATE UNIQUE INDEX IF NOT EXISTS "media_owner_user_id_upload_key_key"
  ON "media"("owner_user_id", "upload_key");

WITH ranked AS (
  SELECT "listing_id", "media_id",
         ROW_NUMBER() OVER (
           PARTITION BY "listing_id"
           ORDER BY "sort_order", "created_at", "media_id"
         ) AS position
  FROM "listing_media"
  WHERE "is_cover" = true
)
UPDATE "listing_media" target
SET "is_cover" = false
FROM ranked
WHERE target."listing_id" = ranked."listing_id"
  AND target."media_id" = ranked."media_id"
  AND ranked.position > 1;

WITH ranked AS (
  SELECT "room_id", "media_id",
         ROW_NUMBER() OVER (
           PARTITION BY "room_id"
           ORDER BY "sort_order", "created_at", "media_id"
         ) AS position
  FROM "room_media"
  WHERE "is_cover" = true
)
UPDATE "room_media" target
SET "is_cover" = false
FROM ranked
WHERE target."room_id" = ranked."room_id"
  AND target."media_id" = ranked."media_id"
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "listing_media_one_cover"
  ON "listing_media"("listing_id") WHERE "is_cover" = true;

CREATE UNIQUE INDEX IF NOT EXISTS "room_media_one_cover"
  ON "room_media"("room_id") WHERE "is_cover" = true;

ALTER TABLE "room_pricing"
  DROP CONSTRAINT IF EXISTS "room_pricing_pen_only";

ALTER TABLE "room_pricing"
  ADD CONSTRAINT "room_pricing_pen_only" CHECK ("currency_code" = 'PEN') NOT VALID;

ALTER TABLE "rooms"
  DROP CONSTRAINT IF EXISTS "rooms_positive_counts";

ALTER TABLE "rooms"
  ADD CONSTRAINT "rooms_positive_counts"
  CHECK ("max_occupancy" > 0 AND "bed_count" > 0 AND "bathroom_count" > 0) NOT VALID;

ALTER TABLE "availability_rules"
  DROP CONSTRAINT IF EXISTS "availability_rules_valid_range";

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_valid_range"
  CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "start_date" < "end_date") NOT VALID;

ALTER TABLE "room_pricing" VALIDATE CONSTRAINT "room_pricing_pen_only";
ALTER TABLE "rooms" VALIDATE CONSTRAINT "rooms_positive_counts";
ALTER TABLE "availability_rules" VALIDATE CONSTRAINT "availability_rules_valid_range";
