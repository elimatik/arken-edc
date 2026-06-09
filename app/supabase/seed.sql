-- ════════════════════════════════════════════════════════════════════════════
-- Arken EDC — Seed data (six-study architecture)
--
--   Showcase studies (rich):
--     AK-2401  livestock_group       Site → Barn → Pen → Animals (group)
--     CA-1103  companion             Site → Subject (+ owner)        [ex AK-2312]
--     EQ-3302  livestock_individual  Site → Barn → Pen → Animal (individual)
--   Sandbox studies (empty — visitors experiment freely):
--     FE-0891  companion             sandbox
--     SB-LIVE  livestock_group       sandbox
--     EQ-SAND  livestock_individual  sandbox
--
--   Default landing role is CRC for every study (all memberships = CRC). An
--   access code's role overrides this when one is used to enter.
--
-- ⚠️ NOT YET APPLIED. Run after migrations:
--    cd app && supabase db reset      (re-applies migrations + this seed)
-- UUIDs are hardcoded (deterministic) so foreign keys are traceable by eye.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Demo user ──────────────────────────────────────────────────────────────
insert into users (id, full_name, email, initials, is_demo) values
  ('10000000-0000-0000-0000-000000000001', 'Elisa Tron', 'elisa@arken.io', 'ET', true);

-- ─── Studies: 3 showcase + 3 sandbox ────────────────────────────────────────
insert into studies (id, code, name, sponsor, phase, type, species, status, is_sandbox, enrollment_target, description) values
  ('20000000-0000-0000-0000-000000002401', 'AK-2401',
   'BRD Cattle Phase II Efficacy Trial', 'AgriVet Sciences', 'Phase II',
   'livestock_group', 'cattle', 'active', false, 120,
   'Bovine respiratory disease — group-housed cattle, pen-level data capture'),
  ('20000000-0000-0000-0000-000000001103', 'CA-1103',
   'Canine Osteoarthritis Pain Study', 'PharmaVet Inc.', 'Phase II',
   'companion', 'canine', 'active', false, 80,
   'Companion individual records — owner-linked, post-op analgesia'),
  ('20000000-0000-0000-0000-000000003302', 'EQ-3302',
   'Equine Lameness Therapeutic Trial', 'VetPharm Europe', 'Phase III',
   'livestock_individual', 'equine', 'active', false, 60,
   'Stabled equine — individual animal records, lameness scoring'),
  ('20000000-0000-0000-0000-000000000891', 'FE-0891',
   'Sandbox — Companion Playground', 'Arken Demo', 'Sandbox',
   'companion', 'feline', 'setup', true, null,
   'Open sandbox for companion-animal data entry'),
  ('20000000-0000-0000-0000-000000005b01', 'SB-LIVE',
   'Sandbox — Livestock Group Playground', 'Arken Demo', 'Sandbox',
   'livestock_group', 'swine', 'setup', true, null,
   'Open sandbox for group-housed livestock data entry'),
  ('20000000-0000-0000-0000-000000005b03', 'EQ-SAND',
   'Sandbox — Livestock Individual Playground', 'Arken Demo', 'Sandbox',
   'livestock_individual', 'equine', 'setup', true, null,
   'Open sandbox for individual livestock data entry');

-- ─── Access codes (5) — entry role OVERRIDES the default CRC landing role ────
insert into access_codes (id, code, label, role, study_id, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'ARKEN-CRC', 'CRC — site coordinator', 'CRC', null, true),
  ('50000000-0000-0000-0000-000000000002', 'ARKEN-CRA', 'CRA — monitor / SDV', 'CRA', null, true),
  ('50000000-0000-0000-0000-000000000003', 'ARKEN-PI',  'PI — investigator',    'PI',  null, true),
  ('50000000-0000-0000-0000-000000000004', 'ARKEN-SPON','Sponsor — oversight',  'Sponsor', null, true),
  ('50000000-0000-0000-0000-000000000005', 'ARKEN-ADMIN','Admin — all access',  'Admin', null, true);

-- ─── Memberships: default landing role is CRC for ALL six studies ───────────
insert into study_memberships (id, user_id, study_id, role) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000002401', 'CRC'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000001103', 'CRC'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000003302', 'CRC'),
  ('40000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000891', 'CRC'),
  ('40000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000005b01', 'CRC'),
  ('40000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000005b03', 'CRC');

-- ════════════════════════════════════════════════════════════════════════════
-- SHOWCASE 1 — AK-2401 (cattle, livestock_group): site → barn → pen → subjects
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

insert into visits (id, study_id, code, name, sequence, window_days) values
  ('60000000-0000-0000-0000-000000002401', '20000000-0000-0000-0000-000000002401', 'V1', 'Day 0 — Baseline', 1, 0);

insert into forms (id, study_id, visit_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000002401', '20000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002401', 'VITALS', 'Vital Signs', 1, 'Baseline vital signs');

insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence) values
  ('62000000-0000-0000-0000-000000002401', '61000000-0000-0000-0000-000000002401', 'temp',   'Rectal temperature', 'number', null, '°C', true, 1),
  ('62000000-0000-0000-0000-000000002402', '61000000-0000-0000-0000-000000002401', 'weight', 'Body weight',        'number', null, 'kg', true, 2),
  ('62000000-0000-0000-0000-000000002403', '61000000-0000-0000-0000-000000002401', 'cond',   'Clinical condition', 'select',
     '["Normal","Mild","Moderate","Severe"]'::jsonb, null, true, 3);

insert into form_instances (id, form_id, subject_id, visit_id, status) values
  ('63000000-0000-0000-0000-000000002401', '61000000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002401', '60000000-0000-0000-0000-000000002401', 'reviewed'),
  ('63000000-0000-0000-0000-000000002402', '61000000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002402', '60000000-0000-0000-0000-000000002401', 'in_work'),
  ('63000000-0000-0000-0000-000000002403', '61000000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002403', '60000000-0000-0000-0000-000000002401', 'empty');

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
  ('64000000-0000-0000-0000-000000002401', '63000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002401', '39.8', 39.8, '10000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000002402', '63000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002402', '342',  342,  '10000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000002403', '63000000-0000-0000-0000-000000002401', '62000000-0000-0000-0000-000000002403', 'Mild', null, '10000000-0000-0000-0000-000000000001', now());

insert into queries (id, form_instance_id, field_value_id, status, severity, title, raised_by, raised_at) values
  ('70000000-0000-0000-0000-000000002401', '63000000-0000-0000-0000-000000002401', '64000000-0000-0000-0000-000000002401', 'open', 'major', 'Temperature above expected range — confirm reading', '10000000-0000-0000-0000-000000000001', now());

insert into query_messages (id, query_id, author_id, body) values
  ('71000000-0000-0000-0000-000000002401', '70000000-0000-0000-0000-000000002401', '10000000-0000-0000-0000-000000000001', 'Please verify the rectal temperature of 39.8°C against the source document.');

insert into sdv_records (id, form_instance_id, field_value_id, status, verified_by, verified_at, note) values
  ('72000000-0000-0000-0000-000000002401', '63000000-0000-0000-0000-000000002401', '64000000-0000-0000-0000-000000002402', 'verified', '10000000-0000-0000-0000-000000000001', now(), 'Matches source.');

insert into audit_trail (id, entity_table, entity_id, action, new_value, reason, user_id, role, study_id) values
  ('80000000-0000-0000-0000-000000002401', 'field_values', '64000000-0000-0000-0000-000000002401', 'create', '{"value":"39.8"}'::jsonb, null, '10000000-0000-0000-0000-000000000001', 'CRC', '20000000-0000-0000-0000-000000002401'),
  ('80000000-0000-0000-0000-000000002402', 'queries', '70000000-0000-0000-0000-000000002401', 'query_raise', '{"severity":"major"}'::jsonb, 'Out-of-range value', '10000000-0000-0000-0000-000000000001', 'CRC', '20000000-0000-0000-0000-000000002401');

-- ════════════════════════════════════════════════════════════════════════════
-- SHOWCASE 2 — CA-1103 (canine, companion): site → subjects (+ owners)
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, principal_investigator, status) values
  ('30000000-0000-0000-0000-000000001103', '20000000-0000-0000-0000-000000001103', 'S01', 'Bayside Animal Hospital', 'Portland, OR', 'Dr. L. Okafor', 'active');

insert into companion_owners (id, study_id, full_name, email, phone, epro_enabled) values
  ('33000000-0000-0000-0000-000000001101', '20000000-0000-0000-0000-000000001103', 'Marta Ruiz',  'marta@example.com',  '555-0101', false),
  ('33000000-0000-0000-0000-000000001102', '20000000-0000-0000-0000-000000001103', 'Daniel Cho',  'daniel@example.com', '555-0102', false);

insert into subjects (id, study_id, site_id, owner_id, subject_code, species, status, randomization_arm, enrolled_at) values
  ('34000000-0000-0000-0000-000000001101', '20000000-0000-0000-0000-000000001103', '30000000-0000-0000-0000-000000001103', '33000000-0000-0000-0000-000000001101', 'CA-1103-001', 'canine', 'active', 'Velafen', now()),
  ('34000000-0000-0000-0000-000000001102', '20000000-0000-0000-0000-000000001103', '30000000-0000-0000-0000-000000001103', '33000000-0000-0000-0000-000000001102', 'CA-1103-002', 'canine', 'active', 'Placebo', now());

insert into visits (id, study_id, code, name, sequence, window_days) values
  ('60000000-0000-0000-0000-000000001103', '20000000-0000-0000-0000-000000001103', 'V1', 'Baseline', 1, 0);

insert into forms (id, study_id, visit_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000001103', '20000000-0000-0000-0000-000000001103', '60000000-0000-0000-0000-000000001103', 'PAIN', 'Pain Assessment', 1, 'Owner + clinician pain scoring');

insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence) values
  ('62000000-0000-0000-0000-000000001101', '61000000-0000-0000-0000-000000001103', 'score', 'Pain score (0–10)', 'integer', null, null, true, 1),
  ('62000000-0000-0000-0000-000000001102', '61000000-0000-0000-0000-000000001103', 'resc',  'Rescue analgesia given', 'radio',
     '["Yes","No"]'::jsonb, null, true, 2);

insert into form_instances (id, form_id, subject_id, visit_id, status) values
  ('63000000-0000-0000-0000-000000001101', '61000000-0000-0000-0000-000000001103', '34000000-0000-0000-0000-000000001101', '60000000-0000-0000-0000-000000001103', 'finalized'),
  ('63000000-0000-0000-0000-000000001102', '61000000-0000-0000-0000-000000001103', '34000000-0000-0000-0000-000000001102', '60000000-0000-0000-0000-000000001103', 'in_work');

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
  ('64000000-0000-0000-0000-000000001101', '63000000-0000-0000-0000-000000001101', '62000000-0000-0000-0000-000000001101', '3', 3, '10000000-0000-0000-0000-000000000001', now()),
  ('64000000-0000-0000-0000-000000001102', '63000000-0000-0000-0000-000000001101', '62000000-0000-0000-0000-000000001102', 'No', null, '10000000-0000-0000-0000-000000000001', now());

-- ════════════════════════════════════════════════════════════════════════════
-- SHOWCASE 3 — EQ-3302 (equine, livestock_individual): site → barn → pen → animals
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, principal_investigator, status) values
  ('30000000-0000-0000-0000-000000003302', '20000000-0000-0000-0000-000000003302', 'S01', 'Hill Country Equine Center', 'Lexington, KY', 'Dr. R. Devlin', 'active');

insert into barns (id, site_id, code, name, capacity) values
  ('31000000-0000-0000-0000-000000003302', '30000000-0000-0000-0000-000000003302', 'B1', 'Stable Block A', 24);

insert into pens (id, barn_id, code, name, capacity) values
  ('32000000-0000-0000-0000-000000003302', '31000000-0000-0000-0000-000000003302', 'P1', 'Stall Row 1', 8);

insert into subjects (id, study_id, site_id, barn_id, pen_id, subject_code, species, status, randomization_arm, enrolled_at) values
  ('34000000-0000-0000-0000-000000003301', '20000000-0000-0000-0000-000000003302', '30000000-0000-0000-0000-000000003302', '31000000-0000-0000-0000-000000003302', '32000000-0000-0000-0000-000000003302', 'EQ-3302-001', 'equine', 'active', 'Treatment', now()),
  ('34000000-0000-0000-0000-000000003302', '20000000-0000-0000-0000-000000003302', '30000000-0000-0000-0000-000000003302', '31000000-0000-0000-0000-000000003302', '32000000-0000-0000-0000-000000003302', 'EQ-3302-002', 'equine', 'active', 'Control', now()),
  ('34000000-0000-0000-0000-000000003303', '20000000-0000-0000-0000-000000003302', '30000000-0000-0000-0000-000000003302', '31000000-0000-0000-0000-000000003302', '32000000-0000-0000-0000-000000003302', 'EQ-3302-003', 'equine', 'enrolled', 'Treatment', now());

insert into visits (id, study_id, code, name, sequence, window_days) values
  ('60000000-0000-0000-0000-000000003302', '20000000-0000-0000-0000-000000003302', 'V1', 'Baseline', 1, 0);

insert into forms (id, study_id, visit_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000003302', '20000000-0000-0000-0000-000000003302', '60000000-0000-0000-0000-000000003302', 'LAME', 'Lameness Exam', 1, 'AAEP lameness grading');

insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence) values
  ('62000000-0000-0000-0000-000000003301', '61000000-0000-0000-0000-000000003302', 'grade', 'Lameness grade (0–5)', 'integer', null, null, true, 1),
  ('62000000-0000-0000-0000-000000003302', '61000000-0000-0000-0000-000000003302', 'limb',  'Affected limb', 'select',
     '["LF","RF","LH","RH"]'::jsonb, null, true, 2);

insert into form_instances (id, form_id, subject_id, visit_id, status) values
  ('63000000-0000-0000-0000-000000003301', '61000000-0000-0000-0000-000000003302', '34000000-0000-0000-0000-000000003301', '60000000-0000-0000-0000-000000003302', 'reviewed'),
  ('63000000-0000-0000-0000-000000003302', '61000000-0000-0000-0000-000000003302', '34000000-0000-0000-0000-000000003302', '60000000-0000-0000-0000-000000003302', 'in_work'),
  ('63000000-0000-0000-0000-000000003303', '61000000-0000-0000-0000-000000003302', '34000000-0000-0000-0000-000000003303', '60000000-0000-0000-0000-000000003302', 'empty');

-- ════════════════════════════════════════════════════════════════════════════
-- SANDBOX STUDIES — site + blank form template, no subjects (free play)
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, status) values
  ('30000000-0000-0000-0000-000000000891', '20000000-0000-0000-0000-000000000891', 'S01', 'Sandbox Site', 'Demo', 'active'),
  ('30000000-0000-0000-0000-000000005b01', '20000000-0000-0000-0000-000000005b01', 'S01', 'Sandbox Site', 'Demo', 'active'),
  ('30000000-0000-0000-0000-000000005b03', '20000000-0000-0000-0000-000000005b03', 'S01', 'Sandbox Site', 'Demo', 'active');

insert into forms (id, study_id, code, name, sequence, description) values
  ('61000000-0000-0000-0000-000000000891', '20000000-0000-0000-0000-000000000891', 'DEMOG', 'Demographics', 1, 'Sandbox form — enter anything'),
  ('61000000-0000-0000-0000-000000005b01', '20000000-0000-0000-0000-000000005b01', 'DEMOG', 'Demographics', 1, 'Sandbox form — enter anything'),
  ('61000000-0000-0000-0000-000000005b03', '20000000-0000-0000-0000-000000005b03', 'DEMOG', 'Demographics', 1, 'Sandbox form — enter anything');

insert into form_fields (id, form_id, code, label, field_type, is_required, sequence) values
  ('62000000-0000-0000-0000-000000000891', '61000000-0000-0000-0000-000000000891', 'animal_id', 'Animal ID', 'text', true, 1),
  ('62000000-0000-0000-0000-000000005b01', '61000000-0000-0000-0000-000000005b01', 'animal_id', 'Animal ID', 'text', true, 1),
  ('62000000-0000-0000-0000-000000005b03', '61000000-0000-0000-0000-000000005b03', 'animal_id', 'Animal ID', 'text', true, 1);
