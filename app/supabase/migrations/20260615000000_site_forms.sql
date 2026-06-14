-- ════════════════════════════════════════════════════════════════════════════
-- Site-level forms — some forms belong to the SITE record (Site Initiation Visit,
-- Staff & Delegation Log, Monitoring Visits, Protocol Amendments, Site Close-out)
-- rather than a subject or a barn. Mirrors the barn-scope change:
--   • forms.scope = 'site'            (alongside 'subject' / 'barn')
--   • form_instances.site_id          the site a site-scoped instance belongs to
-- forms.scope is plain text (no enum), so 'site' needs no type change.
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════

alter table form_instances
  add column if not exists site_id uuid references sites(id) on delete cascade;

create index if not exists idx_instances_site on form_instances(site_id);
