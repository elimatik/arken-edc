-- ════════════════════════════════════════════════════════════════════════════
-- species_ranges — species-specific vital ranges (Case Study 3).
-- A form field declares the vital it measures (validation.vital); this table
-- holds the normal/plausibility range, resolved at runtime by the subject's
-- species. Same field, different range for a horse vs. a cat.
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════
create table species_ranges (
  id         uuid primary key default gen_random_uuid(),
  species    species not null,
  vital      text not null,        -- heart_rate | temperature | respiratory_rate | weight
  min        numeric not null,
  max        numeric not null,
  unit       text not null,
  created_at timestamptz not null default now(),
  unique (species, vital)
);
comment on table species_ranges is 'Vital ranges resolved by subject species. Field declares the vital; this holds the parameters.';
