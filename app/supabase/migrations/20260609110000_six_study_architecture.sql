-- ════════════════════════════════════════════════════════════════════════════
-- Six-study architecture — study_type enum + equine species.
--   study_type: companion | livestock_group | livestock_individual
--   (was: livestock | companion). Existing 'livestock' rows → 'livestock_group'.
--
-- NOTE: is_sandbox ALREADY EXISTS on the studies table (initial schema), so no
-- column is added here — only the enum changes.
--
-- ⚠️ NOT YET APPLIED. Apply with:  cd app && npx supabase db push
--    To also load the new 6-study seed:  npx supabase db reset
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add 'equine' to the species enum (for the equine individual study).
--    ADD VALUE is not used within this migration, so it is transaction-safe.
alter type species add value if not exists 'equine';

-- 2. Recreate study_type with the three new values (Postgres can't add+remove
--    enum values in place). studies.type has no default, so nothing to drop.
alter type study_type rename to study_type_old;
create type study_type as enum ('companion', 'livestock_group', 'livestock_individual');

alter table studies
  alter column type type study_type
  using (
    case type::text
      when 'companion' then 'companion'
      when 'livestock' then 'livestock_group'
      else 'livestock_group'
    end::study_type
  );

drop type study_type_old;
