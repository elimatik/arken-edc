// ════════════════════════════════════════════════════════════════════════════
// Seed generator for Arken EDC. Emits app/supabase/seed.sql deterministically.
//
// The three studies share one form TREE (7 visit/info groups + 3 standalone
// forms). Each leaf sub-form's fields are study-specific (transcribed below).
// Groups are containers with no fields (parent_form_id links children → group).
//
//   node generate-seed.mjs   →   writes seed.sql
//
// UUID scheme:
//   form id   61<GG><SS>00-0000-0000-0000-<study>   (SS=00 → group/standalone)
//   field id  62<GG><SS><FF>-0000-0000-0000-<study>
//   <study> = 000000002401 (AK) | 000000001103 (CA) | 000000003302 (EQ)
// ════════════════════════════════════════════════════════════════════════════
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Field builders ──────────────────────────────────────────────────────────
const txt = (code, label, req = false) => ({ code, label, type: "text", req });
const ta = (code, label, req = false) => ({ code, label, type: "textarea", req });
const date = (code, label, req = false) => ({ code, label, type: "date", req });
const file = (code, label, req = false) => ({ code, label, type: "file", req });
const calc = (code, label, unit = null) => ({ code, label, type: "calculated", unit });
const num = (code, label, unit = null, req = false) => ({ code, label, type: "number", unit, req });
const rng = (code, label, min, max, unit = null, req = false) =>
  ({ code, label, type: "number", unit, req, validation: { min, max, onViolation: "query" } });
const vital = (code, label, key, unit, req = true) =>
  ({ code, label, type: "number", unit, req, validation: { vital: key, onViolation: "query" } });
const sel = (code, label, options, req = false) => ({ code, label, type: "select", options, req });
const msel = (code, label, options, req = false) => ({ code, label, type: "multiselect", options, req });
const yn = (code, label, req = false) => ({ code, label, type: "radio", options: ["Yes", "No"], req });

const SEVERITY = ["Mild", "Moderate", "Severe", "Life-threatening"];
const RELATIONSHIP = ["Unrelated", "Possible", "Probable", "Definite"];
const PRESENT_ABSENT = ["Present", "Absent"];
const GRADE_0_3 = ["0", "1", "2", "3"];
const ONE_TO_FIVE = ["1", "2", "3", "4", "5"];

// ─── The shared form tree (group → sub-forms; or standalone) ─────────────────
// resolver names map to per-study field functions below.
const TREE = [
  { gg: "01", name: "Animal Information", children: [
    { ss: "01", name: "Demographics", resolver: "demographics" },
    { ss: "02", name: "Medical History", resolver: "medicalHistory" },
  ] },
  { gg: "02", name: "Screening", children: [
    { ss: "01", name: "Physical Examination", resolver: "physicalExam", visit: 0 },
    { ss: "02", name: "Inclusion / Exclusion", resolver: "inclusionExclusion" },
  ] },
  { gg: "03", name: "Visit 1 — Dosing", children: [
    { ss: "01", name: "Physical Examination", resolver: "physicalExam", visit: 1 },
    { ss: "02", name: "Dosing Administration", resolver: "dosing", visit: 1 },
  ] },
  { gg: "04", name: "Visit 2 — Dosing", children: [
    { ss: "01", name: "Physical Examination", resolver: "physicalExam", visit: 2 },
    { ss: "02", name: "Dosing Administration", resolver: "dosing", visit: 2 },
  ] },
  { gg: "05", name: "Visit 3 — Follow-up", children: [
    { ss: "01", name: "Physical Examination", resolver: "physicalExam", visit: 3 },
    { ss: "02", name: "Follow-up Assessment", resolver: "followupAssessment", visit: 3 },
  ] },
  { gg: "06", name: "Visit 4 — Follow-up", children: [
    { ss: "01", name: "Physical Examination", resolver: "physicalExam", visit: 4 },
    { ss: "02", name: "Follow-up Assessment", resolver: "followupAssessment", visit: 4 },
  ] },
  { gg: "07", name: "Visit 5 — Follow-up", children: [
    { ss: "01", name: "Physical Examination", resolver: "physicalExam", visit: 5 },
    { ss: "02", name: "Follow-up Assessment", resolver: "followupAssessment", visit: 5 },
  ] },
  { gg: "08", name: "Adverse Event", resolver: "adverseEvent" },
  { gg: "09", name: "Unscheduled Visit", resolver: "unscheduledVisit" },
  { gg: "0A", name: "ConMed", resolver: "conmed" },
];

// ═══ Per-study field definitions ═════════════════════════════════════════════
const FIELDS = {
  // ── AK-2401 — Bovine livestock group ──────────────────────────────────────
  AK: {
    demographics: () => [
      date("visit_date", "Visit date", true),
      txt("pen_lot_id", "Pen / lot ID"),
      num("head_count", "Head count"),
      num("avg_age_months", "Average age", "months"),
      txt("sex_distribution", "Sex distribution"),
      sel("species", "Species", ["Bovine"], true),
      sel("breed", "Breed", ["Angus", "Holstein", "Hereford", "Charolais", "Other"]),
      sel("production_purpose", "Production purpose", ["Beef", "Dairy", "Breeding"]),
      yn("informed_consent", "Informed consent", true),
      file("consent_upload", "Consent upload"),
    ],
    medicalHistory: () => [
      txt("previous_illnesses", "Previous illnesses (coded)"),
      txt("previous_treatments", "Previous treatments"),
      txt("vaccination_history", "Vaccination history"),
    ],
    physicalExam: (v) => {
      const base = [
        date("visit_date", "Visit date", true),
        num("avg_group_weight_kg", "Average group weight", "kg"),
        vital("temperature", "Temperature", "temperature", "°C"),
        vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
        vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
        rng("bcs_score", "BCS score", 1, 9),
      ];
      if (v === 0) base.push(yn("nasal_discharge", "Nasal discharge"));
      base.push(sel("nasal_discharge_grade", "Nasal discharge grade", GRADE_0_3));
      base.push(sel("cough_score", "Cough score", GRADE_0_3));
      return base;
    },
    inclusionExclusion: () => [
      date("visit_date", "Visit date", true),
      yn("age_2_8_months", "Age 2–8 months"),
      yn("brd_signs_present", "BRD signs present"),
      yn("no_prior_treatment_7days", "No prior treatment (7 days)"),
      yn("not_pregnant", "Not pregnant"),
      yn("consent_obtained", "Consent obtained"),
    ],
    dosing: (v) => {
      const f = [
        yn("drug_administered", "Drug administered"),
        num("dose_mg_kg", "Dose", "mg/kg"),
        sel("route", "Route", ["IM", "IV", "SQ"]),
        txt("lot_number", "Lot number"),
      ];
      if (v === 2) f.push(txt("adverse_observations", "Adverse observations"));
      return f;
    },
    followupAssessment: (v) => {
      const f = [
        sel("clinical_improvement", "Clinical improvement", ONE_TO_FIVE),
        num("mortality_count", "Mortality count"),
      ];
      if (v >= 4) f.push(num("avg_daily_gain_kg", "Average daily gain", "kg"));
      if (v >= 4) f.push(txt("fec_reappearance_pattern", "FEC reappearance pattern"));
      if (v === 5) f.push(sel("final_outcome", "Final outcome", ["Recovered", "Improved", "No change", "Worsened", "Death"]));
      return f;
    },
    adverseEvent: () => [
      date("visit_date", "Visit date", true),
      txt("pen_affected", "Pen affected"),
      txt("event_description", "Event description"),
      date("onset_date", "Onset date"),
      txt("veddra_coded_term", "VeDDRA coded term"),
      sel("severity", "Severity", SEVERITY),
      sel("relationship_to_drug", "Relationship to drug", RELATIONSHIP),
      txt("action_taken", "Action taken"),
      txt("outcome", "Outcome"),
      yn("sae_flag", "SAE flag"),
    ],
    unscheduledVisit: () => [
      date("visit_date", "Visit date", true),
      txt("reason", "Reason"),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
      vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
      rng("bcs_score", "BCS score", 1, 9),
      txt("action_taken", "Action taken"),
      yn("follow_up_required", "Follow-up required"),
    ],
    conmed: () => [
      date("start_date", "Start date"),
      date("end_date", "End date"),
      txt("drug_name", "Drug name (coded)"),
      txt("dose", "Dose"),
      txt("route", "Route"),
      txt("frequency", "Frequency"),
      txt("indication", "Indication"),
      sel("relationship_to_drug", "Relationship to drug", RELATIONSHIP),
    ],
  },

  // ── CA-1103 — Canine companion individual ─────────────────────────────────
  CA: {
    demographics: () => [
      date("visit_date", "Visit date", true),
      txt("animal_id", "Animal ID"),
      txt("name", "Name"),
      sel("sex", "Sex", ["Male", "Female", "Male neutered", "Female spayed"]),
      date("dob", "Date of birth"),
      calc("age_auto_calc", "Age (auto)", "years"),
      sel("species", "Species", ["Canine"], true),
      txt("breed", "Breed"),
      num("weight_kg", "Weight", "kg"),
      txt("microchip_id", "Microchip ID"),
      txt("owner_name", "Owner name"),
      txt("owner_contact", "Owner contact"),
      yn("informed_consent", "Informed consent", true),
      file("consent_upload", "Consent upload"),
    ],
    medicalHistory: () => [
      txt("previous_diagnoses", "Previous diagnoses (coded)"),
      txt("current_medications", "Current medications"),
      txt("surgical_history", "Surgical history"),
      txt("vaccination_status", "Vaccination status"),
    ],
    physicalExam: (v) => {
      if (v === 0) {
        return [
          date("visit_date", "Visit date", true),
          num("weight_kg", "Weight", "kg"),
          vital("temperature", "Temperature", "temperature", "°C"),
          vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
          vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
          sel("gait_score", "Gait score", ["0", "1", "2", "3", "4"]),
          msel("affected_joints", "Affected joints", ["Hip", "Stifle", "Elbow", "Shoulder", "Other"]),
          rng("pain_score_palpation", "Pain score on palpation (VAS)", 0, 10),
          sel("muscle_atrophy", "Muscle atrophy", ["None", "Mild", "Moderate", "Severe"]),
        ];
      }
      return [
        date("visit_date", "Visit date", true),
        num("weight_kg", "Weight", "kg"),
        vital("temperature", "Temperature", "temperature", "°C"),
        vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
        sel("gait_score", "Gait score", ["0", "1", "2", "3", "4"]),
        rng("pain_score_vas", "Pain score (VAS)", 0, 10),
      ];
    },
    inclusionExclusion: () => [
      date("visit_date", "Visit date", true),
      yn("age_1yr_plus", "Age ≥ 1 year"),
      yn("oa_diagnosis_confirmed", "OA diagnosis confirmed"),
      yn("radiographic_evidence", "Radiographic evidence"),
      file("radiograph_upload", "Radiograph upload"),
      yn("no_corticosteroids_30days", "No corticosteroids (30 days)"),
      yn("no_nsaids_14days", "No NSAIDs (14 days)"),
      yn("owner_compliant", "Owner compliant"),
    ],
    dosing: (v) => {
      const f = [
        sel("owner_lameness_cbpi", "Owner lameness (CBPI)", ["0", "1", "2", "3", "4"]),
        yn("drug_administered", "Drug administered"),
        num("dose_mg_kg", "Dose", "mg/kg"),
        txt("route", "Route"),
        txt("lot_number", "Lot number"),
      ];
      if (v === 2) f.push(txt("owner_observation_notes", "Owner observation notes"));
      return f;
    },
    followupAssessment: (v) => {
      const f = [
        num("cbpi_score", "CBPI score"),
        sel("clinical_global_assessment", "Clinical global assessment", ONE_TO_FIVE),
        sel("owner_satisfaction", "Owner satisfaction", ONE_TO_FIVE),
      ];
      if (v >= 4) f.push(num("quality_of_life_score", "Quality of life score"));
      if (v === 5) f.push(txt("final_outcome", "Final outcome"));
      if (v === 5) f.push(txt("investigator_assessment", "Investigator assessment"));
      return f;
    },
    adverseEvent: () => [
      date("visit_date", "Visit date", true),
      txt("animal_id", "Animal ID"),
      txt("event_description", "Event description"),
      date("onset_date", "Onset date"),
      txt("veddra_coded_term", "VeDDRA coded term"),
      sel("severity", "Severity", SEVERITY),
      sel("relationship_to_drug", "Relationship to drug", RELATIONSHIP),
      txt("action_taken", "Action taken"),
      txt("outcome", "Outcome"),
      yn("sae_flag", "SAE flag"),
    ],
    unscheduledVisit: () => [
      date("visit_date", "Visit date", true),
      txt("reason", "Reason"),
      num("weight_kg", "Weight", "kg"),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
      txt("findings", "Findings"),
      txt("action_taken", "Action taken"),
    ],
    conmed: () => [
      date("start_date", "Start date"),
      date("end_date", "End date"),
      txt("drug_name", "Drug name (coded)"),
      txt("dose", "Dose"),
      txt("route", "Route"),
      txt("frequency", "Frequency"),
      txt("indication", "Indication"),
    ],
  },

  // ── EQ-3302 — Equine livestock individual ─────────────────────────────────
  EQ: {
    demographics: () => [
      date("visit_date", "Visit date", true),
      txt("animal_id", "Animal ID"),
      txt("name", "Name"),
      sel("sex", "Sex", ["Stallion", "Mare", "Gelding", "Filly", "Colt"]),
      date("dob", "Date of birth"),
      num("age", "Age", "years"),
      sel("species", "Species", ["Equine"], true),
      sel("breed", "Breed", ["Thoroughbred", "Quarter Horse", "Warmblood", "Arabian", "Draft", "Other"]),
      sel("use", "Use", ["Sport", "Pleasure", "Racing", "Breeding", "Work"]),
      num("weight_kg", "Weight", "kg"),
      txt("stable_id", "Stable ID"),
      txt("stall_number", "Stall number"),
      txt("owner_name", "Owner name"),
      yn("informed_consent", "Informed consent", true),
      file("consent_upload", "Consent upload"),
    ],
    medicalHistory: () => [
      txt("fec_history", "FEC history"),
      txt("deworming_history_12mo", "Deworming history (12 mo)"),
      txt("previous_diagnoses", "Previous diagnoses (coded)"),
      txt("current_medications", "Current medications"),
    ],
    physicalExam: (v) => {
      if (v === 0) {
        return [
          date("visit_date", "Visit date", true),
          num("weight_kg", "Weight", "kg"),
          vital("temperature", "Temperature", "temperature", "°C"),
          vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
          vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
          sel("gut_sounds_lf", "Gut sounds — LF", PRESENT_ABSENT),
          sel("gut_sounds_rf", "Gut sounds — RF", PRESENT_ABSENT),
          sel("gut_sounds_lh", "Gut sounds — LH", PRESENT_ABSENT),
          sel("gut_sounds_rh", "Gut sounds — RH", PRESENT_ABSENT),
          num("fec_epg", "FEC", "EPG"),
          rng("bcs_henneke", "BCS (Henneke)", 1, 9),
          sel("mucous_membrane_color", "Mucous membrane color", ["Pink", "Pale", "Cyanotic", "Injected"]),
          num("crt_seconds", "CRT", "seconds"),
        ];
      }
      if (v <= 2) {
        return [
          date("visit_date", "Visit date", true),
          num("weight_kg", "Weight", "kg"),
          vital("temperature", "Temperature", "temperature", "°C"),
          vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
          vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
          sel("gut_sounds_lf", "Gut sounds — LF", PRESENT_ABSENT),
          sel("gut_sounds_rf", "Gut sounds — RF", PRESENT_ABSENT),
          sel("gut_sounds_lh", "Gut sounds — LH", PRESENT_ABSENT),
          sel("gut_sounds_rh", "Gut sounds — RH", PRESENT_ABSENT),
          num("fec_epg", "FEC", "EPG"),
          rng("bcs_henneke", "BCS (Henneke)", 1, 9),
        ];
      }
      return [
        date("visit_date", "Visit date", true),
        num("weight_kg", "Weight", "kg"),
        vital("temperature", "Temperature", "temperature", "°C"),
        vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
        num("fec_epg", "FEC", "EPG"),
        rng("bcs_henneke", "BCS (Henneke)", 1, 9),
        sel("gut_sounds_lf", "Gut sounds — LF", PRESENT_ABSENT),
        sel("gut_sounds_rf", "Gut sounds — RF", PRESENT_ABSENT),
        sel("gut_sounds_lh", "Gut sounds — LH", PRESENT_ABSENT),
        sel("gut_sounds_rh", "Gut sounds — RH", PRESENT_ABSENT),
        yn("colic_since_last_visit", "Colic since last visit"),
      ];
    },
    inclusionExclusion: () => [
      date("visit_date", "Visit date", true),
      yn("fec_200epg_plus", "FEC ≥ 200 EPG"),
      yn("age_6mo_plus", "Age ≥ 6 months"),
      yn("no_anthelmintic_8wks", "No anthelmintic (8 weeks)"),
      yn("not_pregnant", "Not pregnant"),
      yn("no_gi_disease", "No GI disease"),
      yn("consent_obtained", "Consent obtained"),
    ],
    dosing: (v) => {
      const f = [
        yn("drug_administered", "Drug administered"),
        num("dose_mg_kg", "Dose", "mg/kg"),
        sel("route", "Route", ["Oral paste", "Nasogastric"]),
        txt("lot_number", "Lot number"),
      ];
      if (v === 2) f.push(yn("colic_signs", "Colic signs"));
      if (v === 2) f.push(txt("colic_description", "Colic description"));
      return f;
    },
    followupAssessment: (v) => {
      const f = [calc("fec_reduction_pct", "FEC reduction", "%")];
      if (v >= 4) f.push(txt("fec_reappearance_pattern", "FEC reappearance pattern"));
      if (v === 5) f.push(num("final_efficacy_pct_reduction", "Final efficacy (% reduction)", "%"));
      if (v === 5) f.push(yn("re_treatment_required", "Re-treatment required"));
      return f;
    },
    adverseEvent: () => [
      date("visit_date", "Visit date", true),
      txt("animal_id", "Animal ID"),
      txt("event_description", "Event description"),
      date("onset_date", "Onset date"),
      txt("veddra_coded_term", "VeDDRA coded term"),
      sel("severity", "Severity", SEVERITY),
      sel("relationship_to_drug", "Relationship to drug", RELATIONSHIP),
      txt("action_taken", "Action taken"),
      txt("outcome", "Outcome"),
      yn("sae_flag", "SAE flag"),
    ],
    unscheduledVisit: () => [
      date("visit_date", "Visit date", true),
      txt("reason", "Reason"),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
      sel("gut_sounds_lf", "Gut sounds — LF", PRESENT_ABSENT),
      sel("gut_sounds_rf", "Gut sounds — RF", PRESENT_ABSENT),
      sel("gut_sounds_lh", "Gut sounds — LH", PRESENT_ABSENT),
      sel("gut_sounds_rh", "Gut sounds — RH", PRESENT_ABSENT),
      sel("colic_grade", "Colic grade", ["0", "1", "2", "3", "4"]),
      txt("action_taken", "Action taken"),
    ],
    conmed: () => [
      date("start_date", "Start date"),
      date("end_date", "End date"),
      txt("drug_name", "Drug name (coded)"),
      txt("dose", "Dose"),
      txt("route", "Route"),
      txt("frequency", "Frequency"),
      txt("indication", "Indication"),
    ],
  },
};

// ─── Studies ─────────────────────────────────────────────────────────────────
const STUDIES = [
  { key: "AK", suffix: "000000002401" },
  { key: "CA", suffix: "000000001103" },
  { key: "EQ", suffix: "000000003302" },
];

// ─── SQL helpers ─────────────────────────────────────────────────────────────
const sqlStr = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const sqlJson = (o) => (o == null ? "null" : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);
const formId = (gg, ss, suffix) => `61${gg}${ss}00-0000-0000-0000-${suffix}`;
const fieldId = (gg, ss, ff, suffix) => `62${gg}${ss}${ff}-0000-0000-0000-${suffix}`;

const formRows = [];
const fieldRows = [];

for (const study of STUDIES) {
  const studyUuid = `20000000-0000-0000-0000-${study.suffix}`;
  let seq = 0;
  const fns = FIELDS[study.key];

  const emitLeaf = (gg, ss, name, resolver, visit, parentId) => {
    seq += 1;
    const id = formId(gg, ss, study.suffix);
    const code = `F${gg}${ss}`;
    formRows.push(
      `  ('${id}','${studyUuid}',${parentId ? `'${parentId}'` : "null"},${sqlStr(code)},${sqlStr(name)},${seq})`,
    );
    const fields = fns[resolver](visit);
    fields.forEach((f, i) => {
      const ff = (i + 1).toString(16).padStart(2, "0");
      const fid = fieldId(gg, ss, ff, study.suffix);
      fieldRows.push(
        `  ('${fid}','${id}',${sqlStr(f.code)},${sqlStr(f.label)},'${f.type}',${
          f.options ? sqlJson(f.options) : "null"
        },${sqlStr(f.unit ?? null)},${f.req ? "true" : "false"},${i + 1},${sqlJson(f.validation ?? null)})`,
      );
    });
  };

  for (const node of TREE) {
    if (node.children) {
      // group container — no fields
      seq += 1;
      const gid = formId(node.gg, "00", study.suffix);
      formRows.push(
        `  ('${gid}','${studyUuid}',null,${sqlStr(`F${node.gg}00`)},${sqlStr(node.name)},${seq})`,
      );
      for (const child of node.children) {
        emitLeaf(node.gg, child.ss, child.name, child.resolver, child.visit, gid);
      }
    } else {
      // standalone form
      emitLeaf(node.gg, "00", node.name, node.resolver, undefined, null);
    }
  }
}

// ─── Static preamble (identity, studies, hierarchy, species ranges) ──────────
const PREAMBLE = `-- ════════════════════════════════════════════════════════════════════════════
-- Arken EDC — Seed data (three session-based studies + grouped form layer)
--   AK-2401  livestock_group       cattle   Site → Barn → Pen → Animals
--   CA-1103  companion             canine   Site → Subject (+ owner)
--   EQ-3302  livestock_individual  equine   Site → Stable → Stall → Animal
--
-- ⚠️ GENERATED FILE — edit app/supabase/generate-seed.mjs and re-run:
--      node app/supabase/generate-seed.mjs
--
-- Form layer: each study has 7 visit/info GROUPS (containers, no fields) with
-- two sub-forms each + 3 standalone forms (Adverse Event, Unscheduled Visit,
-- ConMed). Vital fields declare validation.vital; the range resolves per species
-- from species_ranges at runtime (Case Study 3).
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════

truncate table users, studies, access_codes, species_ranges cascade;

insert into users (id, full_name, email, initials, is_demo) values
  ('10000000-0000-0000-0000-000000000001', 'Elisa Tron', 'elisa@arken.io', 'ET', true);

insert into studies (id, code, name, sponsor, phase, type, species, status, enrollment_target, description) values
  ('20000000-0000-0000-0000-000000002401', 'AK-2401', 'BRD Cattle Phase II Efficacy Trial', 'AgriVet Sciences', 'Phase II', 'livestock_group', 'cattle', 'active', 120, 'Bovine respiratory disease — group-housed cattle, pen-level data capture'),
  ('20000000-0000-0000-0000-000000001103', 'CA-1103', 'Canine Osteoarthritis Pain Study', 'PharmaVet Inc.', 'Phase II', 'companion', 'canine', 'active', 80, 'Companion individual records — owner-linked, post-op analgesia'),
  ('20000000-0000-0000-0000-000000003302', 'EQ-3302', 'Equine Lameness Therapeutic Trial', 'VetPharm Europe', 'Phase III', 'livestock_individual', 'equine', 'active', 60, 'Stabled equine — individual animal records, lameness scoring');

insert into access_codes (id, code, label, role, study_id, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'ARKEN-CRC', 'CRC — site coordinator', 'CRC', null, true),
  ('50000000-0000-0000-0000-000000000002', 'ARKEN-CRA', 'CRA — monitor / SDV', 'CRA', null, true),
  ('50000000-0000-0000-0000-000000000003', 'ARKEN-PI',  'PI — investigator',    'PI',  null, true),
  ('50000000-0000-0000-0000-000000000004', 'ARKEN-SPON','Sponsor — oversight',  'Sponsor', null, true),
  ('50000000-0000-0000-0000-000000000005', 'ARKEN-ADMIN','Admin — all access',  'Admin', null, true);

insert into study_memberships (id, user_id, study_id, role) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000002401', 'CRC'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000001103', 'CRC'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000003302', 'CRC');

-- Species vital ranges — heart rate (bpm) · temperature (°C) · respiratory rate
-- (breaths/min) · weight (kg plausibility bound). Aligned with the study protocols.
insert into species_ranges (species, vital, min, max, unit) values
  ('cattle','heart_rate',40,80,'bpm'),  ('cattle','temperature',38.0,39.3,'°C'),  ('cattle','respiratory_rate',10,30,'breaths/min'),  ('cattle','weight',200,900,'kg'),
  ('canine','heart_rate',60,140,'bpm'), ('canine','temperature',38.3,39.2,'°C'),  ('canine','respiratory_rate',10,30,'breaths/min'),  ('canine','weight',2,90,'kg'),
  ('equine','heart_rate',28,44,'bpm'),  ('equine','temperature',37.5,38.5,'°C'),  ('equine','respiratory_rate',8,16,'breaths/min'),   ('equine','weight',350,700,'kg'),
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

-- EQ-3302 (equine): site → stable → stall → subjects
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
`;

// AK-2401-001 Screening / Physical Examination: out-of-range temp 39.8 (cattle
// 38.0–39.3) carrying a seeded edit-check query. PE form = 61020100, fields
// visit_date(01) weight(02) temperature(03) heart_rate(04) respiratory_rate(05).
const DEMO = `
-- ════════════════════════════════════════════════════════════════════════════
-- DEMO INSTANCE — AK-2401-001 Screening / Physical Examination: a temperature of
-- 39.8 °C (vs cattle 38.0–39.3) that carries a seeded edit-check query.
-- ════════════════════════════════════════════════════════════════════════════
insert into form_instances (id, form_id, subject_id, status) values
  ('63020100-0000-0000-0000-000000002401', '61020100-0000-0000-0000-000000002401', '34000000-0000-0000-0000-000000002401', 'in_work');

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
  ('64020101-0000-0000-0000-000000002401','63020100-0000-0000-0000-000000002401','62020101-0000-0000-0000-000000002401','2026-05-07', null, '10000000-0000-0000-0000-000000000001', now()),
  ('64020102-0000-0000-0000-000000002401','63020100-0000-0000-0000-000000002401','62020102-0000-0000-0000-000000002401','430', 430, '10000000-0000-0000-0000-000000000001', now()),
  ('64020103-0000-0000-0000-000000002401','63020100-0000-0000-0000-000000002401','62020103-0000-0000-0000-000000002401','39.8', 39.8, '10000000-0000-0000-0000-000000000001', now()),
  ('64020104-0000-0000-0000-000000002401','63020100-0000-0000-0000-000000002401','62020104-0000-0000-0000-000000002401','72', 72, '10000000-0000-0000-0000-000000000001', now()),
  ('64020105-0000-0000-0000-000000002401','63020100-0000-0000-0000-000000002401','62020105-0000-0000-0000-000000002401','24', 24, '10000000-0000-0000-0000-000000000001', now());

insert into queries (id, form_instance_id, field_value_id, status, severity, title, raised_by, raised_at) values
  ('70020103-0000-0000-0000-000000002401','63020100-0000-0000-0000-000000002401','64020103-0000-0000-0000-000000002401','open','major','Value outside expected range (38.0–39.3 °C) — verify', '10000000-0000-0000-0000-000000000001', now());

insert into query_messages (id, query_id, author_id, body) values
  ('71020103-0000-0000-0000-000000002401','70020103-0000-0000-0000-000000002401','10000000-0000-0000-0000-000000000001','Auto edit-check: temperature 39.8 °C is above the expected range for cattle (38.0–39.3 °C). Please verify against the source document.');
`;

// ─── Assemble ────────────────────────────────────────────────────────────────
const out = [
  PREAMBLE,
  "\n-- ════════════════════════════════════════════════════════════════════════════",
  "-- FORM GROUPS + SUB-FORMS (parent_form_id links sub-forms → their group)",
  "-- ════════════════════════════════════════════════════════════════════════════",
  "insert into forms (id, study_id, parent_form_id, code, name, sequence) values",
  formRows.join(",\n") + ";",
  "\n-- ─── Fields (groups have none; sub-forms + standalone forms carry them) ──────",
  "insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence, validation) values",
  fieldRows.join(",\n") + ";",
  DEMO,
].join("\n");

writeFileSync(join(__dirname, "seed.sql"), out);
console.log(`seed.sql written — ${formRows.length} forms, ${fieldRows.length} fields`);
