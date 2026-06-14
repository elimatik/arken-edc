-- ════════════════════════════════════════════════════════════════════════════
-- Barn/house-level forms — some forms belong to the HOUSE (barn) record rather
-- than the pen/subject record (e.g. PH-2401's Daily Environmental Log, recorded
-- once per house per day, not per pen). Two changes support this:
--   • forms.scope        — 'subject' (default, pen/animal record) | 'barn'
--   • form_instances.barn_id — the barn a barn-scoped instance belongs to, with
--     subject_id made nullable so a barn instance carries no subject.
--
-- Barn-scoped forms are rendered on the Barn Record page and are excluded from
-- the pen/subject form sidebar.
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════

alter table forms
  add column if not exists scope text not null default 'subject';

alter table form_instances
  alter column subject_id drop not null;

alter table form_instances
  add column if not exists barn_id uuid references barns(id) on delete cascade;

create index if not exists idx_instances_barn on form_instances(barn_id);
