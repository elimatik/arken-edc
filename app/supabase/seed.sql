-- ════════════════════════════════════════════════════════════════════════════
-- Arken EDC — Seed data (three session-based studies + form layer)
--
--   AK-2401  livestock_group       cattle   Site → Barn → Pen → Animals
--   CA-1103  companion             canine   Site → Subject (+ owner)
--   EQ-3302  livestock_individual  equine   Site → Barn → Pen → Animal
--
-- Form layer: each study gets 6 form templates (Demographics, Screening, Baseline
-- Vitals, Visit 1/2/3). Vital fields declare a `validation.vital`; the range is
-- resolved per species from `species_ranges` at runtime (Case Study 3).
--
-- Supabase is the read-only seed source; the app hydrates this once per tab and
-- edits live in session only.
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- UUID scheme: forms 61<FF>0000, fields 62<FF><ff>00, where FF=form#, ff=field#;
-- the last segment encodes the study (2401 / 1103 / 3302).
-- ════════════════════════════════════════════════════════════════════════════

truncate table users, studies, access_codes, species_ranges cascade;

-- ─── Demo user ──────────────────────────────────────────────────────────────
insert into users (id, full_name, email, initials, is_demo) values
  ('10000000-0000-0000-0000-000000000001', 'Elisa Tron', 'elisa@arken.io', 'ET', true);

-- ─── Studies ────────────────────────────────────────────────────────────────
insert into studies (id, code, name, sponsor, phase, type, species, status, enrollment_target, description) values
  ('20000000-0000-0000-0000-000000002401', 'AK-2401', 'BRD Cattle Phase II Efficacy Trial', 'AgriVet Sciences', 'Phase II', 'livestock_group', 'cattle', 'active', 120, 'Bovine respiratory disease — group-housed cattle, pen-level data capture'),
  ('20000000-0000-0000-0000-000000001103', 'CA-1103', 'Canine Osteoarthritis Pain Study', 'PharmaVet Inc.', 'Phase II', 'companion', 'canine', 'active', 80, 'Companion individual records — owner-linked, post-op analgesia'),
  ('20000000-0000-0000-0000-000000003302', 'EQ-3302', 'Equine Lameness Therapeutic Trial', 'VetPharm Europe', 'Phase III', 'livestock_individual', 'equine', 'active', 60, 'Stabled equine — individual animal records, lameness scoring');

-- ─── Access codes ───────────────────────────────────────────────────────────
insert into access_codes (id, code, label, role, study_id, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'ARKEN-CRC', 'CRC — site coordinator', 'CRC', null, true),
  ('50000000-0000-0000-0000-000000000002', 'ARKEN-CRA', 'CRA — monitor / SDV', 'CRA', null, true),
  ('50000000-0000-0000-0000-000000000003', 'ARKEN-PI',  'PI — investigator',    'PI',  null, true),
  ('50000000-0000-0000-0000-000000000004', 'ARKEN-SPON','Sponsor — oversight',  'Sponsor', null, true),
  ('50000000-0000-0000-0000-000000000005', 'ARKEN-ADMIN','Admin — all access',  'Admin', null, true);

-- ─── Memberships (default landing role CRC) ─────────────────────────────────
insert into study_memberships (id, user_id, study_id, role) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000002401', 'CRC'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000001103', 'CRC'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000003302', 'CRC');

-- ─── Species vital ranges (illustrative clinical reference values) ──────────
-- Heart rate (bpm) · Temperature (°C) · Respiratory rate (breaths/min) ·
-- Weight (kg, a plausibility bound — catches transcription errors, not health).
insert into species_ranges (species, vital, min, max, unit) values
  ('cattle','heart_rate',48,84,'bpm'),  ('cattle','temperature',38.0,39.3,'°C'),  ('cattle','respiratory_rate',26,50,'breaths/min'),  ('cattle','weight',200,900,'kg'),
  ('canine','heart_rate',70,120,'bpm'), ('canine','temperature',38.3,39.2,'°C'),  ('canine','respiratory_rate',10,30,'breaths/min'),  ('canine','weight',2,90,'kg'),
  ('equine','heart_rate',28,44,'bpm'),  ('equine','temperature',37.2,38.3,'°C'),  ('equine','respiratory_rate',8,16,'breaths/min'),   ('equine','weight',350,700,'kg'),
  ('feline','heart_rate',140,220,'bpm'),('feline','temperature',38.1,39.2,'°C'),  ('feline','respiratory_rate',20,30,'breaths/min'),  ('feline','weight',2.5,9,'kg'),
  ('swine','heart_rate',70,120,'bpm'),  ('swine','temperature',38.7,39.8,'°C'),   ('swine','respiratory_rate',10,30,'breaths/min'),   ('swine','weight',20,350,'kg');

-- ════════════════════════════════════════════════════════════════════════════
-- HIERARCHY
-- ════════════════════════════════════════════════════════════════════════════
-- AK-2401 (cattle): site → barn → pen → subjects
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

-- CA-1103 (canine): site → subjects (+ owners)
insert into sites (id, study_id, code, name, location, principal_investigator, status) values
  ('30000000-0000-0000-0000-000000001103', '20000000-0000-0000-0000-000000001103', 'S01', 'Bayside Animal Hospital', 'Portland, OR', 'Dr. L. Okafor', 'active');
insert into companion_owners (id, study_id, full_name, email, phone, epro_enabled) values
  ('33000000-0000-0000-0000-000000001101', '20000000-0000-0000-0000-000000001103', 'Marta Ruiz', 'marta@example.com', '555-0101', false),
  ('33000000-0000-0000-0000-000000001102', '20000000-0000-0000-0000-000000001103', 'Daniel Cho', 'daniel@example.com', '555-0102', false);
insert into subjects (id, study_id, site_id, owner_id, subject_code, species, status, randomization_arm, enrolled_at) values
  ('34000000-0000-0000-0000-000000001101', '20000000-0000-0000-0000-000000001103', '30000000-0000-0000-0000-000000001103', '33000000-0000-0000-0000-000000001101', 'CA-1103-001', 'canine', 'active', 'Velafen', now()),
  ('34000000-0000-0000-0000-000000001102', '20000000-0000-0000-0000-000000001103', '30000000-0000-0000-0000-000000001103', '33000000-0000-0000-0000-000000001102', 'CA-1103-002', 'canine', 'active', 'Placebo', now());

-- EQ-3302 (equine): site → barn → pen → subjects
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

-- ════════════════════════════════════════════════════════════════════════════
-- FORM TEMPLATES (6 per study) + FIELDS — identical definitions across studies
-- ════════════════════════════════════════════════════════════════════════════
insert into forms (id, study_id, code, name, sequence, description) values
  -- AK-2401
  ('61010000-0000-0000-0000-000000002401','20000000-0000-0000-0000-000000002401','DEMOG','Demographics',1,'Animal demographics'),
  ('61020000-0000-0000-0000-000000002401','20000000-0000-0000-0000-000000002401','SCRN','Screening',2,'Eligibility screening'),
  ('61030000-0000-0000-0000-000000002401','20000000-0000-0000-0000-000000002401','BVITAL','Baseline Vitals',3,'Baseline vital signs'),
  ('61040000-0000-0000-0000-000000002401','20000000-0000-0000-0000-000000002401','V1','Visit 1',4,'Follow-up visit 1'),
  ('61050000-0000-0000-0000-000000002401','20000000-0000-0000-0000-000000002401','V2','Visit 2',5,'Follow-up visit 2'),
  ('61060000-0000-0000-0000-000000002401','20000000-0000-0000-0000-000000002401','V3','Visit 3',6,'Follow-up visit 3'),
  -- CA-1103
  ('61010000-0000-0000-0000-000000001103','20000000-0000-0000-0000-000000001103','DEMOG','Demographics',1,'Animal demographics'),
  ('61020000-0000-0000-0000-000000001103','20000000-0000-0000-0000-000000001103','SCRN','Screening',2,'Eligibility screening'),
  ('61030000-0000-0000-0000-000000001103','20000000-0000-0000-0000-000000001103','BVITAL','Baseline Vitals',3,'Baseline vital signs'),
  ('61040000-0000-0000-0000-000000001103','20000000-0000-0000-0000-000000001103','V1','Visit 1',4,'Follow-up visit 1'),
  ('61050000-0000-0000-0000-000000001103','20000000-0000-0000-0000-000000001103','V2','Visit 2',5,'Follow-up visit 2'),
  ('61060000-0000-0000-0000-000000001103','20000000-0000-0000-0000-000000001103','V3','Visit 3',6,'Follow-up visit 3'),
  -- EQ-3302
  ('61010000-0000-0000-0000-000000003302','20000000-0000-0000-0000-000000003302','DEMOG','Demographics',1,'Animal demographics'),
  ('61020000-0000-0000-0000-000000003302','20000000-0000-0000-0000-000000003302','SCRN','Screening',2,'Eligibility screening'),
  ('61030000-0000-0000-0000-000000003302','20000000-0000-0000-0000-000000003302','BVITAL','Baseline Vitals',3,'Baseline vital signs'),
  ('61040000-0000-0000-0000-000000003302','20000000-0000-0000-0000-000000003302','V1','Visit 1',4,'Follow-up visit 1'),
  ('61050000-0000-0000-0000-000000003302','20000000-0000-0000-0000-000000003302','V2','Visit 2',5,'Follow-up visit 2'),
  ('61060000-0000-0000-0000-000000003302','20000000-0000-0000-0000-000000003302','V3','Visit 3',6,'Follow-up visit 3');

-- Fields. The four vitals (temperature, heart_rate, respiratory_rate, body_weight)
-- carry validation.vital → resolved per species from species_ranges.
insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence, validation) values
  -- ── AK-2401 ──────────────────────────────────────────────────────────────
  -- Demographics
  ('62010100-0000-0000-0000-000000002401','61010000-0000-0000-0000-000000002401','sex','Sex','select','["M","F"]'::jsonb,null,true,1,null),
  ('62010200-0000-0000-0000-000000002401','61010000-0000-0000-0000-000000002401','date_of_birth','Date of birth','date',null,null,true,2,null),
  ('62010300-0000-0000-0000-000000002401','61010000-0000-0000-0000-000000002401','breed','Breed','text',null,null,false,3,null),
  ('62010400-0000-0000-0000-000000002401','61010000-0000-0000-0000-000000002401','production_purpose','Production purpose','text',null,null,false,4,null),
  -- Screening
  ('62020100-0000-0000-0000-000000002401','61020000-0000-0000-0000-000000002401','screening_date','Screening date','date',null,null,true,1,null),
  ('62020200-0000-0000-0000-000000002401','61020000-0000-0000-0000-000000002401','inclusion_met','Inclusion criteria met','radio','["Yes","No"]'::jsonb,null,true,2,null),
  ('62020300-0000-0000-0000-000000002401','61020000-0000-0000-0000-000000002401','exclusion_present','Exclusion criteria present','radio','["Yes","No"]'::jsonb,null,true,3,null),
  ('62020400-0000-0000-0000-000000002401','61020000-0000-0000-0000-000000002401','body_condition_score','Body condition score','integer',null,null,false,4,'{"min":1,"max":9,"onViolation":"query"}'::jsonb),
  ('62020500-0000-0000-0000-000000002401','61020000-0000-0000-0000-000000002401','eligible','Eligible','radio','["Yes","No"]'::jsonb,null,false,5,null),
  -- Baseline Vitals
  ('62030100-0000-0000-0000-000000002401','61030000-0000-0000-0000-000000002401','exam_date','Examination date','date',null,null,true,1,null),
  ('62030200-0000-0000-0000-000000002401','61030000-0000-0000-0000-000000002401','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62030300-0000-0000-0000-000000002401','61030000-0000-0000-0000-000000002401','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62030400-0000-0000-0000-000000002401','61030000-0000-0000-0000-000000002401','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62030500-0000-0000-0000-000000002401','61030000-0000-0000-0000-000000002401','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62030600-0000-0000-0000-000000002401','61030000-0000-0000-0000-000000002401','clinical_remarks','Clinical remarks','textarea',null,null,false,6,null),
  -- Visit 1
  ('62040100-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','visit_date','Visit date','date',null,null,true,1,null),
  ('62040200-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62040300-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62040400-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62040500-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62040600-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62040700-0000-0000-0000-000000002401','61040000-0000-0000-0000-000000002401','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  -- Visit 2
  ('62050100-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','visit_date','Visit date','date',null,null,true,1,null),
  ('62050200-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62050300-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62050400-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62050500-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62050600-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62050700-0000-0000-0000-000000002401','61050000-0000-0000-0000-000000002401','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  -- Visit 3
  ('62060100-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','visit_date','Visit date','date',null,null,true,1,null),
  ('62060200-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62060300-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62060400-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62060500-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62060600-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62060700-0000-0000-0000-000000002401','61060000-0000-0000-0000-000000002401','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  -- ── CA-1103 ──────────────────────────────────────────────────────────────
  ('62010100-0000-0000-0000-000000001103','61010000-0000-0000-0000-000000001103','sex','Sex','select','["M","F"]'::jsonb,null,true,1,null),
  ('62010200-0000-0000-0000-000000001103','61010000-0000-0000-0000-000000001103','date_of_birth','Date of birth','date',null,null,true,2,null),
  ('62010300-0000-0000-0000-000000001103','61010000-0000-0000-0000-000000001103','breed','Breed','text',null,null,false,3,null),
  ('62010400-0000-0000-0000-000000001103','61010000-0000-0000-0000-000000001103','production_purpose','Production purpose','text',null,null,false,4,null),
  ('62020100-0000-0000-0000-000000001103','61020000-0000-0000-0000-000000001103','screening_date','Screening date','date',null,null,true,1,null),
  ('62020200-0000-0000-0000-000000001103','61020000-0000-0000-0000-000000001103','inclusion_met','Inclusion criteria met','radio','["Yes","No"]'::jsonb,null,true,2,null),
  ('62020300-0000-0000-0000-000000001103','61020000-0000-0000-0000-000000001103','exclusion_present','Exclusion criteria present','radio','["Yes","No"]'::jsonb,null,true,3,null),
  ('62020400-0000-0000-0000-000000001103','61020000-0000-0000-0000-000000001103','body_condition_score','Body condition score','integer',null,null,false,4,'{"min":1,"max":9,"onViolation":"query"}'::jsonb),
  ('62020500-0000-0000-0000-000000001103','61020000-0000-0000-0000-000000001103','eligible','Eligible','radio','["Yes","No"]'::jsonb,null,false,5,null),
  ('62030100-0000-0000-0000-000000001103','61030000-0000-0000-0000-000000001103','exam_date','Examination date','date',null,null,true,1,null),
  ('62030200-0000-0000-0000-000000001103','61030000-0000-0000-0000-000000001103','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62030300-0000-0000-0000-000000001103','61030000-0000-0000-0000-000000001103','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62030400-0000-0000-0000-000000001103','61030000-0000-0000-0000-000000001103','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62030500-0000-0000-0000-000000001103','61030000-0000-0000-0000-000000001103','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62030600-0000-0000-0000-000000001103','61030000-0000-0000-0000-000000001103','clinical_remarks','Clinical remarks','textarea',null,null,false,6,null),
  ('62040100-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','visit_date','Visit date','date',null,null,true,1,null),
  ('62040200-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62040300-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62040400-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62040500-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62040600-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62040700-0000-0000-0000-000000001103','61040000-0000-0000-0000-000000001103','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  ('62050100-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','visit_date','Visit date','date',null,null,true,1,null),
  ('62050200-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62050300-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62050400-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62050500-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62050600-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62050700-0000-0000-0000-000000001103','61050000-0000-0000-0000-000000001103','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  ('62060100-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','visit_date','Visit date','date',null,null,true,1,null),
  ('62060200-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62060300-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62060400-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62060500-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62060600-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62060700-0000-0000-0000-000000001103','61060000-0000-0000-0000-000000001103','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  -- ── EQ-3302 ──────────────────────────────────────────────────────────────
  ('62010100-0000-0000-0000-000000003302','61010000-0000-0000-0000-000000003302','sex','Sex','select','["M","F"]'::jsonb,null,true,1,null),
  ('62010200-0000-0000-0000-000000003302','61010000-0000-0000-0000-000000003302','date_of_birth','Date of birth','date',null,null,true,2,null),
  ('62010300-0000-0000-0000-000000003302','61010000-0000-0000-0000-000000003302','breed','Breed','text',null,null,false,3,null),
  ('62010400-0000-0000-0000-000000003302','61010000-0000-0000-0000-000000003302','production_purpose','Production purpose','text',null,null,false,4,null),
  ('62020100-0000-0000-0000-000000003302','61020000-0000-0000-0000-000000003302','screening_date','Screening date','date',null,null,true,1,null),
  ('62020200-0000-0000-0000-000000003302','61020000-0000-0000-0000-000000003302','inclusion_met','Inclusion criteria met','radio','["Yes","No"]'::jsonb,null,true,2,null),
  ('62020300-0000-0000-0000-000000003302','61020000-0000-0000-0000-000000003302','exclusion_present','Exclusion criteria present','radio','["Yes","No"]'::jsonb,null,true,3,null),
  ('62020400-0000-0000-0000-000000003302','61020000-0000-0000-0000-000000003302','body_condition_score','Body condition score','integer',null,null,false,4,'{"min":1,"max":9,"onViolation":"query"}'::jsonb),
  ('62020500-0000-0000-0000-000000003302','61020000-0000-0000-0000-000000003302','eligible','Eligible','radio','["Yes","No"]'::jsonb,null,false,5,null),
  ('62030100-0000-0000-0000-000000003302','61030000-0000-0000-0000-000000003302','exam_date','Examination date','date',null,null,true,1,null),
  ('62030200-0000-0000-0000-000000003302','61030000-0000-0000-0000-000000003302','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62030300-0000-0000-0000-000000003302','61030000-0000-0000-0000-000000003302','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62030400-0000-0000-0000-000000003302','61030000-0000-0000-0000-000000003302','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62030500-0000-0000-0000-000000003302','61030000-0000-0000-0000-000000003302','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62030600-0000-0000-0000-000000003302','61030000-0000-0000-0000-000000003302','clinical_remarks','Clinical remarks','textarea',null,null,false,6,null),
  ('62040100-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','visit_date','Visit date','date',null,null,true,1,null),
  ('62040200-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62040300-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62040400-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62040500-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62040600-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62040700-0000-0000-0000-000000003302','61040000-0000-0000-0000-000000003302','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  ('62050100-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','visit_date','Visit date','date',null,null,true,1,null),
  ('62050200-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62050300-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62050400-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62050500-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62050600-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62050700-0000-0000-0000-000000003302','61050000-0000-0000-0000-000000003302','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null),
  ('62060100-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','visit_date','Visit date','date',null,null,true,1,null),
  ('62060200-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','temperature','Rectal temperature','number',null,'°C',true,2,'{"vital":"temperature","onViolation":"query"}'::jsonb),
  ('62060300-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','heart_rate','Heart rate','number',null,'bpm',true,3,'{"vital":"heart_rate","onViolation":"query"}'::jsonb),
  ('62060400-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','respiratory_rate','Respiratory rate','number',null,'breaths/min',true,4,'{"vital":"respiratory_rate","onViolation":"query"}'::jsonb),
  ('62060500-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','body_weight','Body weight','number',null,'kg',true,5,'{"vital":"weight","onViolation":"query"}'::jsonb),
  ('62060600-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','clinical_assessment','Clinical assessment','select','["Normal","Mild","Moderate","Severe"]'::jsonb,null,false,6,null),
  ('62060700-0000-0000-0000-000000003302','61060000-0000-0000-0000-000000003302','adverse_event','Adverse event','radio','["Yes","No"]'::jsonb,null,false,7,null);

-- ════════════════════════════════════════════════════════════════════════════
-- DEMO INSTANCE — AK-2401-001 Baseline Vitals: an out-of-range temperature
-- (39.8 °C vs cattle 38.0–39.3) that carries a seeded edit-check query.
-- ════════════════════════════════════════════════════════════════════════════
insert into form_instances (id, form_id, subject_id, status) values
  ('63030100-0000-0000-0000-000000002401', '61030000-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002401', 'in_work');

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
  ('64030100-0000-0000-0000-000000002401','63030100-0000-0000-0000-000000002401','62030100-0000-0000-0000-000000002401','2026-05-07', null, '10000000-0000-0000-0000-000000000001', now()),
  ('64030200-0000-0000-0000-000000002401','63030100-0000-0000-0000-000000002401','62030200-0000-0000-0000-000000002401','39.8', 39.8, '10000000-0000-0000-0000-000000000001', now()),
  ('64030300-0000-0000-0000-000000002401','63030100-0000-0000-0000-000000002401','62030300-0000-0000-0000-000000002401','72', 72, '10000000-0000-0000-0000-000000000001', now()),
  ('64030400-0000-0000-0000-000000002401','63030100-0000-0000-0000-000000002401','62030400-0000-0000-0000-000000002401','30', 30, '10000000-0000-0000-0000-000000000001', now()),
  ('64030500-0000-0000-0000-000000002401','63030100-0000-0000-0000-000000002401','62030500-0000-0000-0000-000000002401','420', 420, '10000000-0000-0000-0000-000000000001', now());

insert into queries (id, form_instance_id, field_value_id, status, severity, title, raised_by, raised_at) values
  ('70030200-0000-0000-0000-000000002401','63030100-0000-0000-0000-000000002401','64030200-0000-0000-0000-000000002401','open','major','Value outside expected range (38.0–39.3 °C) — verify', '10000000-0000-0000-0000-000000000001', now());

insert into query_messages (id, query_id, author_id, body) values
  ('71030200-0000-0000-0000-000000002401','70030200-0000-0000-0000-000000002401','10000000-0000-0000-0000-000000000001','Auto edit-check: rectal temperature 39.8 °C is above the expected range for cattle (38.0–39.3 °C). Please verify against the source document.');
