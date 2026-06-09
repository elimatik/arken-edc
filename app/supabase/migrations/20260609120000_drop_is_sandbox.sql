-- ════════════════════════════════════════════════════════════════════════════
-- Drop is_sandbox — the sandbox/showcase split is gone. All studies are the
-- same session-based demo (seed loaded into the browser session, fully editable,
-- writes stay in session, reset on tab close).
--
-- ⚠️ Apply with:  cd app && npx supabase db push --include-seed
-- ════════════════════════════════════════════════════════════════════════════
alter table studies drop column if exists is_sandbox;
