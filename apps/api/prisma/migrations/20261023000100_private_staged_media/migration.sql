CREATE TYPE "media_visibility" AS ENUM ('staged', 'public', 'deleting');

ALTER TABLE "media"
  ADD COLUMN "visibility" "media_visibility" NOT NULL DEFAULT 'public',
  ADD COLUMN "thumbnail_storage_key" TEXT,
  ADD COLUMN "thumbnail_public_url" TEXT,
  ADD COLUMN "thumbnail_size_bytes" BIGINT,
  ADD COLUMN "thumbnail_width" INTEGER,
  ADD COLUMN "thumbnail_height" INTEGER,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "idx_media_visibility_created_at"
  ON "media"("visibility", "created_at");

ALTER TABLE "user_profiles"
  ADD COLUMN "avatar_media_id" UUID;

UPDATE "user_profiles" AS profile
SET "avatar_media_id" = (
  SELECT media."id"
  FROM "media" AS media
  WHERE media."public_url" = profile."photo_url"
    AND media."type" = 'image'
  ORDER BY media."created_at" DESC, media."id"
  LIMIT 1
)
WHERE profile."photo_url" IS NOT NULL;

CREATE UNIQUE INDEX "user_profiles_avatar_media_id_key"
  ON "user_profiles"("avatar_media_id");

ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_avatar_media_id_fkey"
  FOREIGN KEY ("avatar_media_id") REFERENCES "media"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
