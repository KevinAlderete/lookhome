import "dotenv/config";
import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no configurada.");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM room_pricing WHERE currency_code <> 'PEN')::int AS non_pen,
        (SELECT COUNT(*) FROM (
          SELECT listing_id FROM listing_media WHERE is_cover
          GROUP BY listing_id HAVING COUNT(*) > 1
        ) duplicates)::int AS duplicate_listing_covers,
        (SELECT COUNT(*) FROM (
          SELECT room_id FROM room_media WHERE is_cover
          GROUP BY room_id HAVING COUNT(*) > 1
        ) duplicates)::int AS duplicate_room_covers,
        (SELECT COUNT(*) FROM rooms WHERE max_occupancy <= 0 OR bed_count <= 0)::int AS invalid_rooms,
        (SELECT COUNT(*) FROM availability_rules
          WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND start_date >= end_date
        )::int AS invalid_ranges,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_room_active_dates_excl') AS booking_overlap_constraint,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_pricing_positive_amounts') AS positive_amounts_constraint,
        EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'room_pricing_valid_limits') AS valid_limits_constraint,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'districts' AND column_name = 'ubigeo_code'
        ) AS ubigeo_columns,
        (SELECT COUNT(*) FROM users WHERE email LIKE 'e2e+%@lookhome.test')::int AS e2e_users,
        (SELECT COUNT(*) FROM listings WHERE title LIKE '[E2E:%')::int AS e2e_listings
    `);
    console.log(JSON.stringify(result.rows[0]));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
