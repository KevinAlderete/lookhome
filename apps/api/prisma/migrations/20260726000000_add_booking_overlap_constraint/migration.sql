-- Neon/PostgreSQL: prevent active reservations for the same room from overlapping.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_room_active_dates_excl"
EXCLUDE USING gist (
  "room_id" WITH =,
  daterange("start_date", "end_date", '[)') WITH &&
)
WHERE ("status" IN ('requested', 'accepted', 'paid', 'active', 'completed'));
