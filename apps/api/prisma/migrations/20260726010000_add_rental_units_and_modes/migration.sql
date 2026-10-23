-- Evolve the existing rooms table into the first version of rental units.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE "rental_unit_type" AS ENUM ('entire_place', 'private_room', 'shared_bed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "rental_mode" AS ENUM ('nightly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "rooms"
  ADD COLUMN IF NOT EXISTS "unit_type" "rental_unit_type" NOT NULL DEFAULT 'private_room',
  ADD COLUMN IF NOT EXISTS "bedroom_count" INTEGER;

ALTER TABLE "room_pricing"
  ADD COLUMN IF NOT EXISTS "rental_mode" "rental_mode" NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "min_stay_nights" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_stay_nights" INTEGER,
  ADD COLUMN IF NOT EXISTS "min_term_months" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_term_months" INTEGER;

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "rental_mode" "rental_mode" NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "term_months" INTEGER;

ALTER TABLE "booking_pricing_snapshot"
  ADD COLUMN IF NOT EXISTS "rental_mode" "rental_mode" NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS "billing_quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "cleaning_fee" DECIMAL(12, 2);

ALTER TABLE "bookings"
  DROP CONSTRAINT IF EXISTS "bookings_room_active_dates_excl";

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_room_active_dates_excl"
  EXCLUDE USING gist (
    "room_id" WITH =,
    daterange("start_date", "end_date", '[)') WITH &&
  )
  WHERE ("status" IN ('accepted', 'paid', 'active', 'completed'));

CREATE INDEX IF NOT EXISTS "idx_rooms_unit_type_status" ON "rooms"("unit_type", "status");
CREATE INDEX IF NOT EXISTS "idx_room_pricing_rental_mode" ON "room_pricing"("rental_mode");

DO $$ BEGIN
  ALTER TABLE "room_pricing" ADD CONSTRAINT "room_pricing_positive_amounts"
  CHECK ("rent_amount" > 0 AND ("deposit_amount" IS NULL OR "deposit_amount" >= 0) AND ("cleaning_fee" IS NULL OR "cleaning_fee" >= 0));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "room_pricing" ADD CONSTRAINT "room_pricing_valid_limits"
  CHECK (("min_stay_nights" IS NULL OR "min_stay_nights" > 0) AND ("max_stay_nights" IS NULL OR "max_stay_nights" > 0) AND ("min_stay_nights" IS NULL OR "max_stay_nights" IS NULL OR "min_stay_nights" <= "max_stay_nights") AND ("min_term_months" IS NULL OR "min_term_months" > 0) AND ("max_term_months" IS NULL OR "max_term_months" > 0) AND ("min_term_months" IS NULL OR "max_term_months" IS NULL OR "min_term_months" <= "max_term_months"));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
