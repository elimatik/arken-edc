-- ════════════════════════════════════════════════════════════════════════════
-- Arken EDC — Initial schema (v1)
-- Veterinary clinical-trial EDC. Demo-first auth (access codes + demo_sessions).
--
-- ⚠️ NOT YET APPLIED. Review before running:
--    cd app && supabase db push        (or: psql "$DATABASE_URL" -f this file)
--
-- RLS: intentionally NOT enabled in this migration — see the RLS section at the
-- bottom. The app currently reads via the anon key during early build; policies
-- keyed off the demo_session land in a follow-up migration before any real data.
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ─── updated_at helper ──────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ════════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ════════════════════════════════════════════════════════════════════════════
create type study_type      as enum ('livestock', 'companion');
create type study_status    as enum ('setup', 'active', 'paused', 'closed');
create type species         as enum ('cattle', 'swine', 'canine', 'aquatic', 'feline');
create type app_role        as enum ('CRC', 'CRA', 'DM', 'PI', 'Sponsor', 'Admin');
create type subject_status  as enum ('screening', 'enrolled', 'active', 'withdrawn', 'completed');
create type field_type      as enum ('text', 'textarea', 'number', 'integer', 'date', 'datetime',
                                     'select', 'multiselect', 'radio', 'checkbox', 'calculated');
create type instance_status as enum ('empty', 'in_work', 'reviewed', 'finalized', 'locked');
create type query_status    as enum ('open', 'responded', 'resolved', 'closed');
create type query_severity  as enum ('minor', 'major', 'critical');   -- amber / orange / red
create type sdv_status      as enum ('pending', 'verified', 'flagged');
create type audit_action    as enum ('create', 'update', 'delete', 'sign', 'lock', 'unlock',
                                     'query_raise', 'query_respond', 'query_resolve',
                                     'query_close', 'sdv_verify');

-- ════════════════════════════════════════════════════════════════════════════
-- A. IDENTITY & ACCESS
-- ════════════════════════════════════════════════════════════════════════════
create table users (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  email       text unique,
  initials    text,
  is_demo     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table studies (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  sponsor            text,
  phase              text,
  type               study_type not null,
  species            species,
  status             study_status not null default 'setup',
  is_sandbox         boolean not null default false,
  enrollment_target  integer,
  description        text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_studies_updated before update on studies
  for each row execute function set_updated_at();

create table sites (
  id                     uuid primary key default gen_random_uuid(),
  study_id               uuid not null references studies(id) on delete cascade,
  code                   text not null,
  name                   text not null,
  location               text,
  principal_investigator text,
  status                 study_status not null default 'active',
  created_at             timestamptz not null default now(),
  unique (study_id, code)
);
create index idx_sites_study on sites(study_id);

create table barns (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid not null references sites(id) on delete cascade,
  code       text not null,
  name       text not null,
  capacity   integer,
  created_at timestamptz not null default now(),
  unique (site_id, code)
);
create index idx_barns_site on barns(site_id);

create table pens (
  id         uuid primary key default gen_random_uuid(),
  barn_id    uuid not null references barns(id) on delete cascade,
  code       text not null,
  name       text not null,
  capacity   integer,
  created_at timestamptz not null default now(),
  unique (barn_id, code)
);
create index idx_pens_barn on pens(barn_id);

-- Stub for future ePRO (owner-reported outcomes for companion animals)
create table companion_owners (
  id           uuid primary key default gen_random_uuid(),
  study_id     uuid not null references studies(id) on delete cascade,
  full_name    text not null,
  email        text,
  phone        text,
  epro_enabled boolean not null default false,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_owners_updated before update on companion_owners
  for each row execute function set_updated_at();
comment on table companion_owners is
  'Stub for future ePRO. Minimal now; expands with consent, portal access, owner submissions.';

create table subjects (
  id                 uuid primary key default gen_random_uuid(),
  study_id           uuid not null references studies(id) on delete cascade,
  site_id            uuid references sites(id) on delete set null,
  barn_id            uuid references barns(id) on delete set null,   -- livestock only
  pen_id             uuid references pens(id) on delete set null,    -- livestock only
  owner_id           uuid references companion_owners(id) on delete set null, -- companion only
  subject_code       text not null,
  species            species,
  status             subject_status not null default 'screening',
  randomization_arm  text,
  enrolled_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (study_id, subject_code)
);
create index idx_subjects_study on subjects(study_id);
create index idx_subjects_site  on subjects(site_id);
create index idx_subjects_pen   on subjects(pen_id);
create trigger trg_subjects_updated before update on subjects
  for each row execute function set_updated_at();

create table study_memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  study_id   uuid not null references studies(id) on delete cascade,
  role       app_role not null,
  site_id    uuid references sites(id) on delete set null,  -- optional scoping
  created_at timestamptz not null default now(),
  unique (user_id, study_id)
);
create index idx_memberships_study on study_memberships(study_id);

create table access_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  label      text,
  role       app_role not null,
  study_id   uuid references studies(id) on delete set null,  -- null = all studies
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table demo_sessions (
  id              uuid primary key default gen_random_uuid(),
  session_token   text not null unique,
  user_id         uuid references users(id) on delete set null,
  access_code_id  uuid references access_codes(id) on delete set null,
  active_role     app_role not null,           -- role switching updates this
  active_study_id uuid references studies(id) on delete set null,
  active_site_id  uuid references sites(id) on delete set null,
  created_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  expires_at      timestamptz
);
create index idx_sessions_token on demo_sessions(session_token);

-- ════════════════════════════════════════════════════════════════════════════
-- C. DATA CAPTURE
-- ════════════════════════════════════════════════════════════════════════════
create table visits (
  id         uuid primary key default gen_random_uuid(),
  study_id   uuid not null references studies(id) on delete cascade,
  code       text not null,
  name       text not null,
  sequence   integer not null default 0,
  window_days integer,
  created_at timestamptz not null default now(),
  unique (study_id, code)
);
create index idx_visits_study on visits(study_id);

create table forms (
  id          uuid primary key default gen_random_uuid(),
  study_id    uuid not null references studies(id) on delete cascade,
  visit_id    uuid references visits(id) on delete set null,
  code        text not null,
  name        text not null,
  sequence    integer not null default 0,
  description text,
  created_at  timestamptz not null default now(),
  unique (study_id, code)
);
create index idx_forms_study on forms(study_id);

create table form_fields (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references forms(id) on delete cascade,
  code        text not null,
  label       text not null,
  field_type  field_type not null,
  options     jsonb,            -- select/radio/checkbox choices
  unit        text,
  is_required boolean not null default false,
  sequence    integer not null default 0,
  validation  jsonb,            -- { min, max, regex, ... }
  created_at  timestamptz not null default now(),
  unique (form_id, code)
);
create index idx_fields_form on form_fields(form_id);

-- One form filled for one subject (+visit). Carries the status-icon state.
create table form_instances (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references forms(id) on delete cascade,
  subject_id  uuid not null references subjects(id) on delete cascade,
  visit_id    uuid references visits(id) on delete set null,
  status      instance_status not null default 'empty',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (form_id, subject_id, visit_id)
);
create index idx_instances_subject on form_instances(subject_id);
create index idx_instances_form    on form_instances(form_id);
create trigger trg_instances_updated before update on form_instances
  for each row execute function set_updated_at();

create table field_values (
  id               uuid primary key default gen_random_uuid(),
  form_instance_id uuid not null references form_instances(id) on delete cascade,
  form_field_id    uuid not null references form_fields(id) on delete cascade,
  value            text,           -- canonical string store
  value_num        numeric,        -- numeric fields (ranges / querying)
  entered_by       uuid references users(id) on delete set null,
  entered_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (form_instance_id, form_field_id)
);
create index idx_values_instance on field_values(form_instance_id);
create trigger trg_values_updated before update on field_values
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- D. CLINICAL WORKFLOW
-- ════════════════════════════════════════════════════════════════════════════
create table queries (
  id               uuid primary key default gen_random_uuid(),
  form_instance_id uuid not null references form_instances(id) on delete cascade,
  field_value_id   uuid references field_values(id) on delete set null,
  status           query_status not null default 'open',
  severity         query_severity not null default 'minor',
  title            text not null,
  raised_by        uuid references users(id) on delete set null,
  raised_at        timestamptz not null default now(),
  closed_at        timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_queries_instance on queries(form_instance_id);
create trigger trg_queries_updated before update on queries
  for each row execute function set_updated_at();

create table query_messages (
  id         uuid primary key default gen_random_uuid(),
  query_id   uuid not null references queries(id) on delete cascade,
  author_id  uuid references users(id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index idx_qmessages_query on query_messages(query_id);

create table sdv_records (
  id               uuid primary key default gen_random_uuid(),
  form_instance_id uuid not null references form_instances(id) on delete cascade,
  field_value_id   uuid references field_values(id) on delete set null,
  status           sdv_status not null default 'pending',
  verified_by      uuid references users(id) on delete set null,  -- CRA
  verified_at      timestamptz,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_sdv_instance on sdv_records(form_instance_id);
create trigger trg_sdv_updated before update on sdv_records
  for each row execute function set_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- E. COMPLIANCE — append-only audit trail (21 CFR Part 11)
-- ════════════════════════════════════════════════════════════════════════════
create table audit_trail (
  id           uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id    uuid,
  action       audit_action not null,
  old_value    jsonb,
  new_value    jsonb,
  reason       text,                    -- Δ change reason
  user_id      uuid references users(id) on delete set null,
  role         app_role,                -- acting role
  study_id     uuid references studies(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index idx_audit_entity on audit_trail(entity_table, entity_id);
create index idx_audit_study  on audit_trail(study_id);
comment on table audit_trail is 'Append-only. No update/delete in application code; enforce via RLS in follow-up.';

-- ════════════════════════════════════════════════════════════════════════════
-- RLS — PLAN (deliberately deferred to a follow-up migration)
-- ────────────────────────────────────────────────────────────────────────────
-- Strategy once the demo_session plumbing exists:
--   • enable RLS on every table
--   • pass active_role + active_study/site from the demo_session as request
--     claims; policies read them via current_setting()/auth.jwt()
--   • rich studies: broad read for any valid session; writes scoped by role
--     (e.g. only CRA may sdv_verify; only CRC/PI enter data)
--   • sandbox studies: open read/write for any session
--   • audit_trail: INSERT-only (no UPDATE/DELETE policy)
-- Until then these tables are reachable via the anon key — acceptable for
-- non-sensitive demo data only. Revisit BEFORE loading anything real.
-- ════════════════════════════════════════════════════════════════════════════
