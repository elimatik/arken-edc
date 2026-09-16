-- ════════════════════════════════════════════════════════════════════════════
-- Enable Row Level Security on all public tables
-- ════════════════════════════════════════════════════════════════════════════
-- Fixes the two Supabase advisor findings on arken-edc:
--   • rls_disabled_in_public     — RLS off on public tables
--   • sensitive_columns_exposed  — sensitive columns readable by anon
--
-- This is a portfolio demo. The app is READ-ONLY against Supabase (no
-- insert/update/delete anywhere) and hydrates the session store once from a
-- fixed set of seed tables; everything after that lives in the session store.
--
-- Strategy:
--   • RLS ON for every table (closes rls_disabled_in_public everywhere).
--   • A permissive SELECT policy (USING true) ONLY on the 15 tables the app
--     actually hydrates from, so the anon-key hydration queries keep working.
--   • The 6 tables the app never queries — several holding sensitive data
--     (access_codes, demo_sessions, users, nda_agreements, audit_trail) — get
--     RLS with NO policy, so anon is fully blocked. That closes
--     sensitive_columns_exposed without affecting the app.
--
-- No INSERT/UPDATE/DELETE policies — read-only is sufficient for the demo.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Hydrated tables: RLS on + permissive read ─────────────────────────────
do $$
declare
  t text;
  hydrated text[] := array[
    'studies', 'sites', 'barns', 'pens', 'subjects', 'companion_owners',
    'forms', 'study_memberships', 'species_ranges', 'form_fields',
    'form_instances', 'field_values', 'queries', 'query_messages', 'sdv_records'
  ];
begin
  foreach t in array hydrated loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists allow_read on public.%I', t);
    execute format('create policy allow_read on public.%I for select using (true)', t);
  end loop;
end $$;

-- ─── Unused / sensitive tables: RLS on, NO policy (anon blocked) ────────────
do $$
declare
  t text;
  locked text[] := array[
    'access_codes', 'demo_sessions', 'users',
    'nda_agreements', 'audit_trail', 'visits'
  ];
begin
  foreach t in array locked loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
