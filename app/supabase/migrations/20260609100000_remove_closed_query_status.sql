-- ════════════════════════════════════════════════════════════════════════════
-- Remove 'closed' from query_status — Resolved is the terminal query state.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the enum is recreated. Only
-- queries.status uses this type. Any existing 'closed' rows are remapped to
-- 'resolved' (the seed has none, but the cast is defensive).
--
-- ⚠️ NOT YET APPLIED. Apply with:  cd app && npx supabase db push
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Drop the column default that references the type.
alter table queries alter column status drop default;

-- 2. Rename the old type out of the way.
alter type query_status rename to query_status_old;

-- 3. Create the new type without 'closed'.
create type query_status as enum ('open', 'responded', 'resolved');

-- 4. Convert the column, folding any legacy 'closed' into 'resolved'.
alter table queries
  alter column status type query_status
  using (
    case status::text
      when 'closed' then 'resolved'
      else status::text
    end::query_status
  );

-- 5. Restore the default.
alter table queries alter column status set default 'open';

-- 6. Drop the old type.
drop type query_status_old;
