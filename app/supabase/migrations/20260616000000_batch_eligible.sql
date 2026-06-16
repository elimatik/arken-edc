-- ════════════════════════════════════════════════════════════════════════════
-- Batch Entry — forms.batch_eligible
-- ════════════════════════════════════════════════════════════════════════════
-- A form flagged batch_eligible can be filled for many animals at once in the
-- Batch Entry grid (veterinary pen/herd monitoring — one visit form recorded
-- across a whole pen on the same day). Human-subject EDCs have no equivalent.
-- Default false; BR-2502 marks its 10 visit forms (Vital Signs + Clinical
-- Response, Days 0/3/7/14/28) true via the seed.
-- ════════════════════════════════════════════════════════════════════════════

alter table forms
  add column if not exists batch_eligible boolean not null default false;
