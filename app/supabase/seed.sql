-- ════════════════════════════════════════════════════════════════════════════
-- Arken EDC — Seed data
--   2 rich studies (livestock + companion) · 2 sandbox studies · 5 access codes
--
-- ⚠️ NOT YET APPLIED. Run after the schema migration:
--    cd app && supabase db reset            (re-applies migrations + this seed)
--    or: psql "$DATABASE_URL" -f supabase/seed.sql
--
-- UUIDs are hardcoded (deterministic) so foreign keys are traceable by eye.
-- Volume is illustrative — the rich studies seed a representative slice, not the
-- full 89/240-subject datasets. Expand freely.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Demo user ──────────────────────────────────────────────────────────────
insert into users (id, full_name, email, initials, is_demo) values
  ('10000000-0000-0000-0000-000000000001', 'Elisa Tron', 'elisa@arken.io', 'ET', true);

-- ─── Studies: 2 rich + 2 sandbox ────────────────────────────────────────────
insert into studies (id, code, name, sponsor, phase, type, species, status, is_sandbox, enrollment_target, description) values
  -- RICH · livestock
  ('20000000-0000-0000-0000-000000002401', 'AK-2401',
   'BRD Cattle Phase II Efficacy Trial', 'AgriVet Sciences', 'Phase II',
   'livestock', 'cattle', 'active', false, 120,
   'Bovine respiratory disease — efficacy and safety of AV-2201'),
  -- RICH · companion
  ('20000000-0000-0000-0000-000000002312', 'AK-2312',
   'Canine Analgesia Study — Velafen', 'PharmaVet Inc.', 'Phase II',
   'companion', 'canine', 'active', false, 80,
   'Pain management efficacy — post-operative canine analgesia'),
  -- SANDBOX · livestock
  ('20000000-0000-0000-0000-000000005b01', 'SB-LIVE',
   'Sandbox — Livestock Playground', 'Arken Demo', 'Sandbox',
   'livestock', 'swine', 'setup', true, null,
   'Open sandbox for entering livestock data freely'),
  -- SANDBOX · companion
  ('20000000-0000-0000-0000-000000005b02', 'SB-COMP',
   'Sandbox — Companion Playground', 'Arken Demo', 'Sandbox',
   'companion', 'feline', 'setup', true, null,
   'Open sandbox for entering companion-animal data freely');

-- ─── Access codes (5) — entry role; any role reachable via session switch ────
insert into access_codes (id, code, label, role, study_id, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'ARKEN-CRC', 'CRC — site coordinator', 'CRC', null, true),
  ('50000000-0000-0000-0000-000000000002', 'ARKEN-CRA', 'CRA — monitor / SDV', 'CRA', null, true),
  ('50000000-0000-0000-0000-000000000003', 'ARKEN-PI',  'PI — investigator',    'PI',  null, true),
  ('50000000-0000-0000-0000-000000000004', 'ARKEN-SPON','Sponsor — oversight',  'Sponsor', null, true),
  ('50000000-0000-0000-0000-000000000005', 'ARKEN-ADMIN','Admin — all access',  'Admin', null, true);

-- ─── Memberships: Elisa's role per study ────────────────────────────────────
insert into study_memberships (id, user_id, study_id, role) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000002401', 'CRC'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000002312', 'PI'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000005b01', 'Admin'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000005b02', 'Admin');

-- ════════════════════════════════════════════════════════════════════════════
-- RICH STUDY 1 — AK-2401 (cattle, livestock): site → barn → pen → subjects
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, principal_investigator, status) values
  ('30000000-0000-0000-0000-000000002401', '20000000-0000-0000-0000-000000002401', 'S01', 'Prairie Veterinary Research', 'Amarillo, TX', 'Dr. J. Mercer', 'active');

insert into barns (id, site_id, code, name, capacity) values
  ('31000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', 'B1', 'Barn 1 — North', 60);

insert into pens (id, barn_id, code, name, capacity) values
  ('32000000-0000-0000-0000-000000002401', '31000000-0000-0000-0000-000000002401', 'P1', 'Pen 1', 12);

insert into subjects (id, study_id, site_id, barn_id, pen_id, subject_code, species, status, randomization_arm, enrolled_at) values
  ('34000000-0000-0000-0000-000000002401', '20000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', '31000000-0000-0000-0000-000000002401', '32000000-0000-0000-0000-000000002401', 'AK-2401-001', 'cattle', 'active', 'AV-2201', now()),
  ('34000000-0000-0000-0000-000000002402', '20000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', '31000000-0000-0000-0000-000000002401', '32000000-0000-0000-0000-000000002401', 'AK-2401-002', 'cattle', 'active', 'Placebo', now()),
  ('34000000-0000-0000-0000-000000002403', '20000000-0000-0000-0000-000000002401', '30000000-0000-0000-0000-000000002401', '31000000-0000-0000-0000-000000002401', '32000000-0000-0000-0000-000000002401', 'AK-2401-003', 'cattle', 'enrolled', 'AV-2201', now());

-- Visit + form + fields
insert into visits (id, study_id, code, name, sequence, window_days) values
  ('60000000-0000-0000-0000-000000002401', '20000000-0000-0000-0000-000000002401', 'V1', 'Day 0 — Baseline', 1, 0);

insert into forms (id, study_id, visit_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000002401', '20000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002401', 'VITALS', 'Vital Signs', 1, 'Baseline vital signs');

insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence) values
  ('62000000-0000-0000-0000-000000002401', '61000000-0000-0000-0000-000000002401', 'temp',   'Rectal temperature', 'number', null, '°C', true, 1),
  ('62000000-0000-0000-0000-000000002402', '61000000-0000-0000-0000-000000002401', 'weight', 'Body weight',        'number', null, 'kg', true, 2),
  ('62000000-0000-0000-0000-000000002403', '61000000-0000-0000-0000-000000002401', 'cond',   'Clinical condition', 'select',
     '["Normal","Mild","Moderate","Severe"]'::jsonb, null, true, 3);

-- Subject 001: fully entered + reviewed; subject 002: in work; subject 003: empty
insert into form_instances (id, form_id, subject_id, visit_id, status) values
  ('63000000-0000-0000-0000-000000002401', '61000000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002401', 'reviewed'),
  ('63000000-0000-0000-0000-000000002402', '61000000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002402', '60000000-0000-0000-0000-000000002401', 'in_work'),
  ('63000000-0000-0000-0000-000000002403', '61000000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002403', '60000000-0000-0000-0000-000000002401', 'empty');

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
  ('64000000-0000-0000-0000-000000002401', '63000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002401', '39.8', 39.8, '10000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000002402', '63000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002402', '342',  342,  '10000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000002403', '63000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002403', 'Mild', null, '10000000-0000-0000-0000-000000000001', now());

-- A query on the temperature value (open, major) + one thread message
insert into queries (id, form_instance_id, field_value_id, status, severity, title, raised_by, raised_at) values
  ('70000000-0000-0000-0000-000000002401', '63000000-0000-0000-0000-000000002401', '64000000-0000-0000-0000-000000002401', 'open', 'major', 'Temperature above expected range — confirm reading', '10000000-0000-0000-0000-000000000001', now());

insert into query_messages (id, query_id, author_id, body) values
  ('71000000-0000-0000-0000-000000002401', '70000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000000001', 'Please verify the rectal temperature of 39.8°C against the source document.');

-- SDV: weight value verified by CRA
insert into sdv_records (id, form_instance_id, field_value_id, status, verified_by, verified_at, note) values
  ('72000000-0000-0000-0000-000000002401', '63000000-0000-0000-0000-000000002401', '64000000-0000-0000-0000-000000002402', 'verified', '10000000-0000-0000-0000-000000000001', now(), 'Matches source.');

-- Audit trail entries
insert into audit_trail (id, entity_table, entity_id, action, new_value, reason, user_id, role, study_id) values
  ('80000000-0000-0000-0000-000000002401', 'field_values', '64000000-0000-0000-0000-000000002401', 'create', '{"value":"39.8"}'::jsonb, null, '10000000-0000-0000-0000-000000000001', 'CRC', '20000000-0000-0000-0000-000000002401'),
  ('80000000-0000-0000-0000-000000002402', 'queries', '70000000-0000-0000-0000-000000002401', 'query_raise', '{"severity":"major"}'::jsonb, 'Out-of-range value', '10000000-0000-0000-0000-000000000001', 'CRC', '20000000-0000-0000-0000-000000002401');

-- ════════════════════════════════════════════════════════════════════════════
-- RICH STUDY 2 — AK-2312 (canine, companion): site → subjects (+ owners)
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, principal_investigator, status) values
  ('30000000-0000-0000-0000-000000002312', '20000000-0000-0000-0000-000000002312', 'S01', 'Bayside Animal Hospital', 'Portland, OR', 'Dr. L. Okafor', 'active');

insert into companion_owners (id, study_id, full_name, email, phone, epro_enabled) values
  ('33000000-0000-0000-0000-000000002301', '20000000-0000-0000-0000-000000002312', 'Marta Ruiz',  'marta@example.com',  '555-0101', false),
  ('33000000-0000-0000-0000-000000002302', '20000000-0000-0000-0000-000000002312', 'Daniel Cho',  'daniel@example.com', '555-0102', false);

insert into subjects (id, study_id, site_id, owner_id, subject_code, species, status, randomization_arm, enrolled_at) values
  ('34000000-0000-0000-0000-000000002312', '20000000-0000-0000-0000-000000002312', '30000000-0000-0000-0000-000000002312', '33000000-0000-0000-0000-000000002301', 'AK-2312-001', 'canine', 'active', 'Velafen', now()),
  ('34000000-0000-0000-0000-000000002313', '20000000-0000-0000-0000-000000002312', '30000000-0000-0000-0000-000000002312', '33000000-0000-0000-0000-000000002302', 'AK-2312-002', 'canine', 'active', 'Placebo', now());

insert into visits (id, study_id, code, name, sequence, window_days) values
  ('60000000-0000-0000-0000-000000002312', '20000000-0000-0000-0000-000000002312', 'V1', 'Post-op Day 1', 1, 1);

insert into forms (id, study_id, visit_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000002312', '20000000-0000-0000-0000-000000002312', '60000000-0000-0000-0000-000000002312', 'PAIN', 'Pain Assessment', 1, 'Post-operative pain scoring');

insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence) values
  ('62000000-0000-0000-0000-000000002312', '61000000-0000-0000-0000-000000002312', 'score', 'Pain score (0–10)', 'integer', null, null, true, 1),
  ('62000000-0000-0000-0000-000000002313', '61000000-0000-0000-0000-000000002312', 'resc',  'Rescue analgesia given', 'radio',
     '["Yes","No"]'::jsonb, null, true, 2);

insert into form_instances (id, form_id, subject_id, visit_id, status) values
  ('63000000-0000-0000-0000-000000002312', '61000000-0000-0000-0000-000000002312', '34000000-0000-0000-0000-000000002312', '60000000-0000-0000-0000-000000002312', 'finalized');

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
  ('64000000-0000-0000-0000-000000002312', '63000000-0000-0000-0000-000000002312', '62000000-0000-0000-0000-000000002312', '3', 3, '10000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000002313', '63000000-0000-0000-0000-000000002312', '62000000-0000-0000-0000-000000002313', 'No', null, '10000000-0000-0000-0000-000000000001', now());

-- ════════════════════════════════════════════════════════════════════════════
-- SANDBOX STUDIES — site + blank form template, no subjects/values (free play)
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, status) values
  ('30000000-0000-0000-0000-000000005b01', '20000000-0000-0000-0000-000000005b01', 'S01', 'Sandbox Site', 'Demo', 'active'),
  ('30000000-0000-0000-0000-000000005b02', '20000000-0000-0000-0000-000000005b02', 'S01', 'Sandbox Site', 'Demo', 'active');

insert into forms (id, study_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000005b01', '20000000-0000-0000-0000-000000005b01', 'DEMOG', 'Demographics', 1, 'Sandbox form — enter anything'),
  ('61000000-0000-0000-0000-000000005b02', '20000000-0000-0000-0000-000000005b02', 'DEMOG', 'Demographics', 1, 'Sandbox form — enter anything');

insert into form_fields (id, form_id, code, label, field_type, is_required, sequence) values
  ('62000000-0000-0000-0000-000000005b01', '61000000-0000-0000-0000-000000005b01', 'animal_id', 'Animal ID', 'text', true, 1),
  ('62000000-0000-0000-0000-000000005b02', '61000000-0000-0000-0000-000000005b02', 'animal_id', 'Animal ID', 'text', true, 1);
