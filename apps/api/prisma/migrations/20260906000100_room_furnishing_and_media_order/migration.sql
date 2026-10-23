-- Make furnishing a first-class room attribute and migrate historical links.
ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "is_furnished" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "rooms"
  ALTER COLUMN "is_furnished" SET DEFAULT false;

UPDATE "rooms"
SET "is_furnished" = false
WHERE "is_furnished" IS NULL;

ALTER TABLE "rooms"
  ALTER COLUMN "is_furnished" SET NOT NULL;

UPDATE "rooms" room
SET "is_furnished" = true
WHERE EXISTS (
  SELECT 1
  FROM "room_amenities" room_amenity
  JOIN "amenities" amenity ON amenity."id" = room_amenity."amenity_id"
  WHERE room_amenity."room_id" = room."id"
    AND amenity."code" = 'furnished'
);

DELETE FROM "listing_amenities" listing_amenity
USING "amenities" amenity
WHERE listing_amenity."amenity_id" = amenity."id"
  AND amenity."code" = 'furnished';

DELETE FROM "room_amenities" room_amenity
USING "amenities" amenity
WHERE room_amenity."amenity_id" = amenity."id"
  AND amenity."code" = 'furnished';

-- Preserve an explicit cover when one exists, then use the prior order and
-- deterministic creation/id tie-breakers. The first item is always the cover.
WITH ranked AS (
  SELECT "listing_id", "media_id",
         (ROW_NUMBER() OVER (
           PARTITION BY "listing_id"
           ORDER BY "is_cover" DESC, "sort_order", "created_at", "media_id"
         ) - 1)::integer AS position
  FROM "listing_media"
)
UPDATE "listing_media" target
SET "sort_order" = ranked.position,
    "is_cover" = (ranked.position = 0)
FROM ranked
WHERE target."listing_id" = ranked."listing_id"
  AND target."media_id" = ranked."media_id";

WITH ranked AS (
  SELECT "room_id", "media_id",
         (ROW_NUMBER() OVER (
           PARTITION BY "room_id"
           ORDER BY "is_cover" DESC, "sort_order", "created_at", "media_id"
         ) - 1)::integer AS position
  FROM "room_media"
)
UPDATE "room_media" target
SET "sort_order" = ranked.position,
    "is_cover" = (ranked.position = 0)
FROM ranked
WHERE target."room_id" = ranked."room_id"
  AND target."media_id" = ranked."media_id";

ALTER TABLE "listing_media"
  DROP CONSTRAINT IF EXISTS "listing_media_nonnegative_sort_order",
  DROP CONSTRAINT IF EXISTS "listing_media_cover_matches_first";

ALTER TABLE "listing_media"
  ADD CONSTRAINT "listing_media_nonnegative_sort_order" CHECK ("sort_order" >= 0),
  ADD CONSTRAINT "listing_media_cover_matches_first" CHECK ("is_cover" = ("sort_order" = 0));

ALTER TABLE "room_media"
  DROP CONSTRAINT IF EXISTS "room_media_nonnegative_sort_order",
  DROP CONSTRAINT IF EXISTS "room_media_cover_matches_first";

ALTER TABLE "room_media"
  ADD CONSTRAINT "room_media_nonnegative_sort_order" CHECK ("sort_order" >= 0),
  ADD CONSTRAINT "room_media_cover_matches_first" CHECK ("is_cover" = ("sort_order" = 0));

DROP INDEX IF EXISTS "idx_listing_media_listing_sort";
DROP INDEX IF EXISTS "idx_room_media_room_sort";

CREATE UNIQUE INDEX IF NOT EXISTS "listing_media_listing_sort_key"
  ON "listing_media"("listing_id", "sort_order");

CREATE UNIQUE INDEX IF NOT EXISTS "room_media_room_sort_key"
  ON "room_media"("room_id", "sort_order");
