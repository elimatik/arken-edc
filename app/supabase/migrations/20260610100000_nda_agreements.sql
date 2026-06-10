-- ════════════════════════════════════════════════════════════════════════════
-- nda_agreements — portfolio access agreement (NDA) records. When a visitor
-- enters a non-owner access code at login, they must accept the agreement; the
-- acceptance is written here directly via the Supabase client (audit data, NOT
-- session-store state). Owner codes (OWNER_CODES, e.g. ARKEN-ADMIN) bypass the
-- modal entirely and write nothing.
--
-- View accepted agreements: Supabase dashboard → Table Editor → nda_agreements.
--
-- ⚠️ NOT YET APPLIED. Apply with:  cd app && npx supabase db reset --linked --yes
--    (or `npx supabase db push` to apply without reseeding).
--
-- RLS: left OFF, consistent with the rest of the demo schema, so the anon key may
-- insert. Revisit before anything real (insert-only policy).
-- ════════════════════════════════════════════════════════════════════════════
create table nda_agreements (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  company     text,
  access_code text,
  agreed_at   timestamptz,
  created_at  timestamptz not null default now()
);
comment on table nda_agreements is
  'Portfolio access-agreement acceptances. Written from the login NDA modal for non-owner codes; owner codes (ARKEN-ADMIN) bypass and write nothing.';
