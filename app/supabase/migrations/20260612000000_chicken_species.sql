-- ════════════════════════════════════════════════════════════════════════════
-- Add 'chicken' (broiler poultry) to the species enum.
--
-- Why the species_ranges rows are NOT here: species_ranges is authoritatively
-- (re)seeded by seed.sql, which `truncate ... species_ranges`s and re-inserts
-- the full set on every `db reset` — so anything inserted here would be wiped.
-- The chicken ranges (temperature 40.6–42.2 °C, heart_rate 250–400 bpm,
-- ammonia_level 0–25 ppm) live in generate-seed.mjs / seed.sql. Keeping the
-- enum value in its own migration also avoids the Postgres "can't use a new
-- enum value in the same transaction it was added" restriction.
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════

alter type species add value if not exists 'chicken';
