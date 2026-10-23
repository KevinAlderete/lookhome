CREATE TABLE "host_listing_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "host_user_id" UUID NOT NULL,
  "creation_key" UUID NOT NULL,
  "draft_data" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "title" TEXT,
  "search_text" TEXT,
  "property_type" "property_type",
  "offer_type" "rental_unit_type",
  "rental_mode" "rental_mode",
  "current_step" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "published_listing_id" UUID,
  "legacy_listing_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "host_listing_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "host_listing_drafts_positive_version" CHECK ("version" > 0),
  CONSTRAINT "host_listing_drafts_valid_step" CHECK ("current_step" BETWEEN 0 AND 7)
);

CREATE UNIQUE INDEX "host_listing_drafts_host_user_id_creation_key_key"
  ON "host_listing_drafts"("host_user_id", "creation_key");
CREATE UNIQUE INDEX "host_listing_drafts_published_listing_id_key"
  ON "host_listing_drafts"("published_listing_id");
CREATE UNIQUE INDEX "host_listing_drafts_legacy_listing_id_key"
  ON "host_listing_drafts"("legacy_listing_id");
CREATE INDEX "idx_host_listing_drafts_host_updated"
  ON "host_listing_drafts"("host_user_id", "updated_at");

ALTER TABLE "host_listing_drafts"
  ADD CONSTRAINT "host_listing_drafts_host_user_id_fkey"
  FOREIGN KEY ("host_user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "host_listing_drafts"
  ADD CONSTRAINT "host_listing_drafts_published_listing_id_fkey"
  FOREIGN KEY ("published_listing_id") REFERENCES "listings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "host_listing_drafts"
  ADD CONSTRAINT "host_listing_drafts_legacy_listing_id_fkey"
  FOREIGN KEY ("legacy_listing_id") REFERENCES "listings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "host_listing_draft_photos" (
  "host_listing_draft_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_cover" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "host_listing_draft_photos_pkey"
    PRIMARY KEY ("host_listing_draft_id", "media_id"),
  CONSTRAINT "host_listing_draft_photos_nonnegative_order"
    CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX "host_listing_draft_photos_draft_sort_order_key"
  ON "host_listing_draft_photos"("host_listing_draft_id", "sort_order");
ALTER TABLE "host_listing_draft_photos"
  ADD CONSTRAINT "host_listing_draft_photos_draft_id_fkey"
  FOREIGN KEY ("host_listing_draft_id") REFERENCES "host_listing_drafts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "host_listing_draft_photos"
  ADD CONSTRAINT "host_listing_draft_photos_media_id_fkey"
  FOREIGN KEY ("media_id") REFERENCES "media"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
