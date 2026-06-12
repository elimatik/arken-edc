// ════════════════════════════════════════════════════════════════════════════
// Seed generator for Arken EDC. Emits app/supabase/seed.sql deterministically.
//
//   node generate-seed.mjs   →   writes seed.sql
//
// Three clinically-realistic, session-based studies. Unlike the previous build,
// each study now defines its OWN form tree (different visit counts, sub-forms,
// and a Randomization form), so the tree is per-study rather than shared.
//
//   PH-2401  livestock_group       chicken   Site → House → Pen   (broiler pens)
//   HF-3001  livestock_individual  bovine    Site → Barn → Pen → Animal (RFID heifers)
//   CA-0801  companion             canine    Site → Subject (+ owner, at-home dogs)
//
// UUID scheme:
//   study   20000000-0000-0000-0000-<suffix>
//   form    61<GG><SS>00-0000-0000-0000-<suffix>   (SS=00 → group container / standalone)
//   field   62<GG><SS><FF>-0000-0000-0000-<suffix>
//   site/barn/pen/owner/subject  3X<NN>0000-0000-0000-0000-<suffix>
//   demo instance/value/query/msg  6X/70/71<NNNNNN>-0000-0000-0000-<suffix>
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
// Static (species-independent) numeric range — raises a query when out of bounds.
const rng = (code, label, min, max, unit = null, req = false) =>
  ({ code, label, type: "number", unit, req, validation: { min, max, onViolation: "query" } });
// Species-resolved vital — the range comes from species_ranges at runtime (CS3).
const vital = (code, label, key, unit, req = false) =>
  ({ code, label, type: "number", unit, req, validation: { vital: key, onViolation: "query" } });
const sel = (code, label, options, req = false) => ({ code, label, type: "select", options, req });
const msel = (code, label, options, req = false) => ({ code, label, type: "multiselect", options, req });
const yn = (code, label, req = false) => ({ code, label, type: "radio", options: ["Yes", "No"], req });
// Coded text — a plain text field that opens a (stub) VeDDRA / dictionary lookup.
const coded = (code, label, req = false) => ({ code, label, type: "text", req, validation: { coded: true } });
// Inclusion/exclusion criterion. By default "No" fails (positive inclusion
// criterion); for "exclusion if Yes" criteria pass failOn = "Yes".
const crit = (code, label, req = false, failOn = "No") =>
  ({ code, label, type: "radio", options: ["Yes", "No"], req, validation: { exclusion_criterion: true, exclusion_if: failOn } });
const excl = (code, label, req = false) => crit(code, label, req, "Yes");

// ─── Tree node builders ──────────────────────────────────────────────────────
const grp = (name, children) => ({ name, children });
const leaf = (key, name, fields) => ({ key, name, fields });
const alone = (key, name, fields) => ({ key, name, fields, standalone: true });

const RAND_METHOD = ["Computer-generated", "Envelope", "IVRS"];

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 1 — PH-2401  Phytogenic Feed Additive Broiler Trial (chicken, group)
// ═══════════════════════════════════════════════════════════════════════════
const phPE = () => [
  date("visit_date", "Visit date", true),
  rng("total_pen_weight", "Total pen weight", 0.8, 70.0, "kg"),
  rng("dead_bird_count", "Dead bird count", 0, 5),
  rng("litter_moisture_score", "Litter moisture score", 1, 5),
  vital("ammonia_level", "Ammonia level", "ammonia_level", "ppm"),
];
const phMeas = (finalWeight = false) => {
  const f = [
    rng("total_feed_offered", "Total feed offered", 10.0, 150.0, "kg", true),
    rng("feed_refusal_weight", "Feed refusal weight", 0.0, 50.0, "kg", true),
    calc("feed_consumed", "Feed consumed", "kg"),
    calc("weight_gain", "Weight gain since last visit", "kg"),
    calc("fcr", "FCR"),
    calc("cumulative_mortality_pct", "Cumulative mortality", "%"),
  ];
  if (finalWeight) f.push(num("final_processing_weight", "Final processing weight", "kg"));
  return f;
};
const phAdditive = () => [
  yn("additive_added", "Feed additive added to ration"),
  yn("inclusion_rate_confirmed", "Additive inclusion rate confirmed (0.05%)"),
  txt("lot_number_verified", "Lot number verified"),
];
const phVisit = (n, day, finalWeight = false) =>
  grp(`Visit ${n} — Day ${day}`, [
    leaf(`v${n}_pe`, "Physical Examination", phPE()),
    leaf(`v${n}_meas`, "Measurement", phMeas(finalWeight)),
    leaf(`v${n}_additive`, "Feed Additive Administration", phAdditive()),
  ]);

const PH_TREE = [
  grp("Animal Information", [
    leaf("demographics", "Demographics", [
      rng("pen_number", "Pen ID", 1, 20),
      rng("initial_bird_count", "Initial bird count", 20, 22),
      date("hatch_date", "Hatch date"),
      sel("breed_strain", "Breed strain", ["Ross 308", "Cobb 500"]),
      txt("hatchery_id", "Hatchery ID"),
      sel("litter_type", "Litter type", ["Wood shavings", "Rice hulls"]),
      txt("block_id", "Block ID", true),
      sel("treatment_group", "Treatment group", ["Control", "Treatment"]),
    ]),
    leaf("med_history", "Medical History", [
      txt("prior_flock_health", "Prior flock health issues"),
      txt("vaccination_history", "Vaccination history"),
    ]),
  ]),
  grp("Screening", [
    leaf("screen_pe", "Physical Examination", [
      yn("feeder_functional", "Feeder functional"),
      yn("drinker_functional", "Drinker functional"),
      yn("target_count_verified", "Target count verified"),
    ]),
    leaf("screen_ie", "Inclusion / Exclusion", [
      excl("prior_antibiotics", "Prior antibiotics exposure"),
      excl("visible_runts", "Visible runts present"),
    ]),
  ]),
  alone("randomization", "Randomization", [
    date("randomization_date", "Randomization date", true),
    txt("randomization_number", "Randomization number", true),
    sel("treatment_group_assignment", "Treatment group assignment", ["Control", "Treatment"], true),
    txt("block_id_assignment", "Block ID assignment", true),
    txt("feed_additive_lot", "Feed additive lot number"),
    sel("randomization_method", "Randomization method", RAND_METHOD),
    txt("performed_by", "Performed by"),
    sel("blinding_status", "Blinding status", ["Open-label", "Single-blind", "Double-blind"]),
    ta("notes", "Notes"),
  ]),
  phVisit(1, 0),
  phVisit(2, 14),
  phVisit(3, 28),
  phVisit(4, 42, true),
  alone("adverse_event", "Adverse Event", [
    rng("daily_mortality_count", "Daily mortality count", 0, 20),
    rng("daily_cull_count", "Daily cull count", 0, 20),
    sel("culling_reason", "Culling reason", ["Lameness", "Ascites", "Injury"]),
    ta("necropsy_findings", "Necropsy findings"),
  ]),
  alone("unscheduled", "Unscheduled Visit", [
    sel("reason_code", "Reason code", ["Equipment", "Climate", "Disease"]),
    yn("drinker_line_failure", "Drinker line failure"),
    yn("feed_system_malfunction", "Feed system malfunction"),
    rng("room_temp_spike", "Room temperature spike", 15.0, 45.0, "°C"),
  ]),
  alone("conmed", "ConMed", [
    yn("flock_vaccine_administered", "Flock vaccine administered"),
    sel("vaccine_target_disease", "Vaccine target disease", ["Newcastle", "Gumboro"]),
    yn("therapeutic_medication_added", "Therapeutic medication added"),
    txt("drug_active_ingredient", "Drug active ingredient"),
    rng("inclusion_rate_mgl", "Inclusion rate", 0.0, 1000.0, "mg/L"),
    rng("treatment_duration_days", "Treatment duration", 1, 14, "days"),
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 2 — HF-3001  Beef Heifer Trace Mineral Trial (bovine, individual)
// ═══════════════════════════════════════════════════════════════════════════
const hfPE = (n) => {
  const f = [
    date("visit_date", "Visit date", true),
    sel("study_day", "Study day", ["-30", "0", "35", "60", "90"]),
    rng("individual_scale_weight", "Individual scale weight", 250.0, 600.0, "kg"),
    rng("body_condition_score", "Body condition score", 1.0, 9.0),
    vital("temperature", "Temperature", "temperature", "°C"),
    vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
  ];
  if (n >= 2) {
    f.push(sel("estrus_detection_status", "Estrus detection status", ["Detected", "Not detected"]));
    f.push(txt("ai_sire_code", "AI sire code"));
  }
  if (n >= 3) f.push(sel("pregnancy_ultrasound_status", "Pregnancy ultrasound status", ["Open", "Pregnant", "Pending"]));
  if (n === 5) f.push(rng("calving_ease_score", "Calving ease score", 1, 5));
  return f;
};
const hfLab = () => [
  txt("blood_tube_barcode", "Blood tube barcode"),
  date("sample_collection_date", "Sample collection date"),
  sel("sample_type", "Sample type", ["Serum", "Whole Blood"]),
  date("lab_submission_date", "Lab submission date"),
];
const hfTreat = () => [
  txt("mineral_injection_batch", "Mineral injection batch"),
  sel("injection_site", "Injection site", ["Subcutaneous neck", "Subcutaneous rump"]),
  txt("injection_administered_by", "Injection administered by"),
];
const hfVisit = (n, day) =>
  grp(`Visit ${n} — Day ${day}`, [
    leaf(`v${n}_pe`, "Physical Examination", hfPE(n)),
    leaf(`v${n}_lab`, "Lab Samples", hfLab()),
    leaf(`v${n}_treat`, "Treatment Administration", hfTreat()),
  ]);

const HF_TREE = [
  grp("Animal Information", [
    leaf("demographics", "Demographics", [
      txt("rfid_tag", "RFID tag number", true),
      rng("visual_tag_id", "Visual tag ID", 1, 999),
      date("dob", "Date of birth"),
      calc("age_auto_calc", "Age (auto)", "years"),
      sel("breed_type", "Breed type", ["Purebred Angus", "Angus Cross"]),
      txt("sire_id", "Sire ID"),
      sel("treatment_group", "Treatment group", ["Control", "Treatment"]),
    ]),
    leaf("med_history", "Medical History", [
      coded("prior_health_issues", "Prior health issues (coded)"),
      txt("current_medications", "Current medications at enrollment"),
      txt("vaccination_status", "Vaccination status"),
    ]),
  ]),
  grp("Screening", [
    leaf("screen_pe", "Physical Examination", [
      date("visit_date", "Visit date", true),
      rng("screening_weight", "Screening weight", 250.0, 450.0, "kg"),
      rng("body_condition_score", "Body condition score", 1.0, 9.0),
      rng("reproductive_tract_score", "Reproductive tract score", 1, 5),
      rng("pelvic_area", "Pelvic area", 100, 300, "cm²"),
      yn("active_lameness_signs", "Active lameness signs"),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
    ]),
    leaf("screen_ie", "Inclusion / Exclusion", [
      crit("screening_weight_in_range", "Screening weight 250–450 kg"),
      crit("repro_tract_score_2plus", "Reproductive tract score ≥ 2"),
      excl("active_lameness", "Active lameness signs"),
      excl("prior_hormone_therapy", "Prior hormone therapy"),
      crit("owner_consent", "Owner consent", true),
    ]),
  ]),
  alone("randomization", "Randomization", [
    date("randomization_date", "Randomization date", true),
    txt("randomization_number", "Randomization number", true),
    sel("treatment_group_assignment", "Treatment group assignment", ["Mineral Injection", "Saline Placebo"], true),
    txt("injection_batch_number", "Injection batch number"),
    txt("semen_straw_lot", "Semen straw lot"),
    sel("randomization_method", "Randomization method", RAND_METHOD),
    txt("performed_by", "Performed by"),
    ta("notes", "Notes"),
  ]),
  hfVisit(1, -30),
  hfVisit(2, 0),
  hfVisit(3, 35),
  hfVisit(4, 60),
  hfVisit(5, 90),
  alone("adverse_event", "Adverse Event", [
    rng("injection_site_swelling", "Injection site swelling", 0.0, 20.0, "cm"),
    sel("severity_grade", "Severity grade", ["Mild", "Moderate", "Severe"]),
    yn("systemic_anaphylaxis", "Systemic anaphylaxis signs"),
    sel("event_outcome", "Event outcome", ["Resolved", "Ongoing", "Fatal"]),
    coded("veddra_coded_term", "VeDDRA coded term"),
    sel("relationship_to_drug", "Relationship to drug", ["Unrelated", "Possible", "Probable", "Definite"]),
  ]),
  alone("unscheduled", "Unscheduled Visit", [
    sel("chute_restraint_reason", "Chute restraint reason", ["Injury", "Illness", "Tag Loss"]),
    ta("injury_location", "Injury location"),
    rng("pinkeye_severity_score", "Pinkeye severity score", 0, 4),
  ]),
  alone("conmed", "ConMed", [
    sel("routine_herd_parasiticide", "Routine herd parasiticide", ["Ivermectin", "Albendazole", "None"]),
    txt("fly_tag_brand", "Fly tag brand"),
    txt("therapeutic_antibiotic", "Therapeutic antibiotic"),
    date("slaughter_withdrawal_end", "Slaughter withdrawal end date"),
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 3 — CA-0801  Canine Atopic Dermatitis Diet Trial (canine, companion)
// ═══════════════════════════════════════════════════════════════════════════
const caVisit = (n, week) =>
  grp(`Visit ${n} — Week ${week}`, [
    leaf(`v${n}_pe`, "Physical Examination", [
      date("visit_date", "Visit date", true),
      sel("study_week", "Study week", ["0", "2", "4", "8", "12"]),
      vital("body_weight", "Body weight", "weight", "kg"),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
      rng("cadesi4_score", "CADESI-4 score", 0, 180),
      sel("skin_cytology_cocci", "Skin cytology cocci", ["0", "1+", "2+", "3+", "4+"]),
      sel("skin_cytology_malassezia", "Skin cytology malassezia", ["0", "1+", "2+", "3+", "4+"]),
      file("lesion_photos", "Lesion photos"),
    ]),
    leaf(`v${n}_owner`, "Owner Reported", [
      rng("owner_pvas_score", "Owner PVAS score (diary card)", 0.0, 10.0),
      yn("accidental_dietary_exposure", "Accidental dietary exposure this week"),
      ta("exposure_description", "Exposure description"),
      rng("dispensed_kibble_weight", "Dispensed kibble weight", 0.0, 15.0, "kg"),
      rng("returned_kibble_weight", "Returned kibble weight", 0.0, 15.0, "kg"),
      calc("diet_compliance_pct", "Diet compliance", "%"),
    ]),
    leaf(`v${n}_diet`, "Diet Dispensing", [
      txt("diet_lot_number", "Diet lot number"),
      num("quantity_dispensed", "Quantity dispensed", "kg"),
      date("next_dispensing_date", "Next dispensing date"),
    ]),
  ]);

const CA_TREE = [
  grp("Animal Information", [
    leaf("demographics", "Demographics", [
      txt("dog_name", "Dog name"),
      txt("microchip_number", "Microchip number"),
      txt("owner_last_name", "Owner last name"),
      txt("owner_contact", "Owner contact"),
      txt("breed", "Breed"),
      rng("age", "Age", 0.5, 20.0, "years"),
      sel("sex_neuter_status", "Sex / neuter status", ["MN", "FS", "MI", "FI"]),
      num("body_weight", "Body weight", "kg", true),
      yn("informed_consent", "Informed consent", true),
      file("consent_upload", "Consent upload"),
    ]),
    leaf("med_history", "Medical History", [
      coded("previous_diagnoses", "Previous diagnoses (coded)"),
      txt("current_medications", "Current medications"),
      txt("prior_atopy_treatments", "Prior atopy treatments"),
      txt("vaccination_status", "Vaccination status"),
    ]),
  ]),
  grp("Screening", [
    leaf("screen_pe", "Physical Examination", [
      date("visit_date", "Visit date", true),
      num("body_weight", "Body weight", "kg"),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
      vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
      rng("baseline_cadesi4", "Baseline CADESI-4 score", 0, 180),
      txt("current_diet_brand", "Current diet brand"),
      msel("affected_body_regions", "Affected body regions", ["Head", "Trunk", "Limbs", "Paws", "Ears"]),
    ]),
    leaf("screen_ie", "Inclusion / Exclusion", [
      crit("cadesi4_20plus", "Baseline CADESI-4 ≥ 20"),
      excl("active_ectoparasite", "Active ectoparasite infection"),
      excl("systemic_corticosteroid_30d", "Systemic corticosteroid within 30 days"),
      crit("owner_able_comply", "Owner able to comply", true),
      crit("owner_consent_obtained", "Owner consent obtained", true),
    ]),
  ]),
  alone("randomization", "Randomization", [
    date("randomization_date", "Randomization date", true),
    txt("randomization_number", "Randomization number", true),
    sel("diet_assignment", "Diet assignment", ["Test Hydrolyzed Diet", "Control Maintenance Diet"], true),
    txt("diet_kit_number", "Diet kit number"),
    txt("blinding_envelope_number", "Blinding envelope number"),
    sel("randomization_method", "Randomization method", RAND_METHOD),
    txt("performed_by", "Performed by"),
    yn("owner_informed_blinding", "Owner informed of blinding"),
    ta("notes", "Notes"),
  ]),
  caVisit(1, 0),
  caVisit(2, 2),
  caVisit(3, 4),
  caVisit(4, 8),
  caVisit(5, 12),
  alone("adverse_event", "Adverse Event", [
    sel("gi_distress_type", "GI distress type", ["Vomiting", "Diarrhea", "Lethargy", "None"]),
    rng("episode_frequency_daily", "Episode frequency (daily)", 0, 10),
    sel("diet_relationship", "Diet relationship", ["Unrelated", "Possible", "Definite"]),
    sel("action_taken", "Action taken", ["None", "Interrupted", "Withdrawn"]),
    sel("study_withdrawal_reason", "Study withdrawal reason", ["Owner Request", "Adverse Event", "Protocol Violation", "Lost to Follow-up", "None"]),
  ]),
  alone("unscheduled", "Unscheduled Visit", [
    sel("clinical_visit_reason", "Clinical visit reason", ["Severe Pruritus", "GI Flare", "Otitis"]),
    rng("acute_cadesi4", "Acute CADESI-4", 0, 180),
    yn("secondary_pyoderma", "Secondary pyoderma"),
    sel("dropout_reason", "Dropout reason", ["Owner Request", "Adverse Event", "Protocol Violation", "Lost to Follow-up"]),
  ]),
  alone("conmed", "ConMed", [
    sel("flea_tick_preventive", "Flea / tick preventive", ["Bravecto", "Nexgard", "Simparica", "Other"]),
    txt("heartworm_preventive", "Heartworm preventive"),
    yn("rescue_antipruritic", "Rescue anti-pruritic administered"),
    rng("rescue_drug_dose", "Rescue drug dose", 0.1, 100.0, "mg"),
    yn("topical_shampoo", "Topical medicated shampoo"),
  ]),
];

// ─── Study configs (meta + hierarchy + subjects + demo) ──────────────────────
const STUDIES = [
  {
    key: "PH", suffix: "000000002401", code: "PH-2401",
    name: "Phytogenic Feed Additive Broiler Trial",
    sponsor: "NutriPhyto Animal Health", phase: "Phase III",
    type: "livestock_group", species: "chicken", enrollmentTarget: 20,
    description: "Randomized complete block — 20 broiler pens (20 birds/pen), pen-level capture",
    tree: PH_TREE,
    site: { name: "Sunrise Poultry Research Farm", location: "Siloam Springs, AR", pi: "Dr. A. Whitfield" },
    barns: [{ code: "H1", name: "House 1 — Grow-out", capacity: 400 }],
    pens: [
      { code: "P1", name: "Pen 1", barn: "H1", capacity: 20 },
      { code: "P2", name: "Pen 2", barn: "H1", capacity: 20 },
      { code: "P3", name: "Pen 3", barn: "H1", capacity: 20 },
      { code: "P4", name: "Pen 4", barn: "H1", capacity: 20 },
      { code: "P5", name: "Pen 5", barn: "H1", capacity: 20 },
    ],
    subjects: [
      { code: "PH-2401-P01", status: "active", arm: "Treatment", pen: "P1" },
      { code: "PH-2401-P02", status: "active", arm: "Control", pen: "P2" },
      { code: "PH-2401-P03", status: "active", arm: "Treatment", pen: "P3" },
      { code: "PH-2401-P04", status: "enrolled", arm: "Control", pen: "P4" },
      { code: "PH-2401-P05", status: "screening", arm: "Treatment", pen: "P5" },
    ],
    demo: [
      { subject: "PH-2401-P01", forms: [
        { key: "demographics", status: "reviewed", values: {
          pen_number: ["1", 1], initial_bird_count: ["21", 21], hatch_date: "2026-02-15",
          breed_strain: "Ross 308", hatchery_id: "HX-204", litter_type: "Wood shavings",
          block_id: "Block 1", treatment_group: "Treatment" } },
        { key: "screen_pe", status: "reviewed", values: {
          feeder_functional: "Yes", drinker_functional: "Yes", target_count_verified: "Yes" } },
        { key: "screen_ie", status: "reviewed", values: { prior_antibiotics: "No", visible_runts: "No" } },
        { key: "randomization", status: "in_work", values: {
          randomization_date: "2026-03-01", randomization_number: "PH-R-001",
          treatment_group_assignment: "Treatment", block_id_assignment: "Block 1",
          feed_additive_lot: "FA-7781", randomization_method: "Computer-generated",
          performed_by: "Elisa Tron", blinding_status: "Double-blind" } },
      ] },
      { subject: "PH-2401-P02", forms: [
        { key: "demographics", status: "in_work", values: {
          pen_number: ["2", 2], initial_bird_count: ["20", 20], breed_strain: "Cobb 500",
          block_id: "Block 1", treatment_group: "Control" } },
        { key: "v1_pe", status: "in_work", values: {
          visit_date: "2026-03-01", total_pen_weight: ["1.05", 1.05], dead_bird_count: ["1", 1],
          litter_moisture_score: ["3", 3], ammonia_level: ["32", 32] },
          editCheck: { field: "ammonia_level", message: "Ammonia 32 ppm exceeds the broiler range (0–25 ppm) — check house ventilation and re-measure." } },
      ] },
      { subject: "PH-2401-P03", forms: [
        { key: "demographics", status: "in_work", values: {
          pen_number: ["3", 3], initial_bird_count: ["20", 20], breed_strain: "Ross 308",
          block_id: "Block 2", treatment_group: "Treatment" },
          query: { field: "initial_bird_count", title: "Initial bird count vs delivery manifest",
            raise: "Initial bird count recorded as 20 but the hatchery delivery note lists 21. Please verify against the placement manifest.",
            response: "Confirmed 20 birds placed — one DOA removed before placement. Manifest annotated and re-filed." } },
      ] },
    ],
  },
  {
    key: "HF", suffix: "000000003001", code: "HF-3001",
    name: "Beef Heifer Trace Mineral Trial",
    sponsor: "Cattlemen's Nutrition Co.", phase: "Phase II",
    type: "livestock_individual", species: "cattle", enrollmentTarget: 60,
    description: "Completely randomized — 60 Angus heifers, individually RFID-identified",
    tree: HF_TREE,
    site: { name: "Cross Timbers Cattle Research", location: "Stillwater, OK", pi: "Dr. M. Castillo" },
    barns: [{ code: "B1", name: "Barn A — Handling", capacity: 60 }],
    pens: [
      { code: "P1", name: "Pen 1 — Group A", barn: "B1", capacity: 30 },
      { code: "P2", name: "Pen 2 — Group B", barn: "B1", capacity: 30 },
    ],
    subjects: [
      { code: "840003202500101", status: "active", arm: "Mineral Injection", pen: "P1" },
      { code: "840003202500102", status: "active", arm: "Saline Placebo", pen: "P1" },
      { code: "840003202500103", status: "active", arm: "Mineral Injection", pen: "P2" },
      { code: "840003202500104", status: "enrolled", arm: "Saline Placebo", pen: "P2" },
      { code: "840003202500105", status: "screening", arm: "Mineral Injection", pen: "P1" },
    ],
    demo: [
      { subject: "840003202500101", forms: [
        { key: "demographics", status: "reviewed", values: {
          rfid_tag: "840003202500101", visual_tag_id: ["104", 104], dob: "2024-09-12",
          breed_type: "Purebred Angus", sire_id: "AAA-19942011", treatment_group: "Treatment" } },
        { key: "screen_pe", status: "reviewed", values: {
          visit_date: "2026-04-02", screening_weight: ["372", 372], body_condition_score: ["5.5", 5.5],
          reproductive_tract_score: ["4", 4], pelvic_area: ["180", 180], active_lameness_signs: "No",
          temperature: ["38.6", 38.6], heart_rate: ["66", 66] } },
        { key: "screen_ie", status: "reviewed", values: {
          screening_weight_in_range: "Yes", repro_tract_score_2plus: "Yes", active_lameness: "No",
          prior_hormone_therapy: "No", owner_consent: "Yes" } },
        { key: "randomization", status: "in_work", values: {
          randomization_date: "2026-04-05", randomization_number: "HF-R-014",
          treatment_group_assignment: "Mineral Injection", injection_batch_number: "MIN-2204",
          semen_straw_lot: "SS-8841", randomization_method: "IVRS", performed_by: "Elisa Tron" } },
      ] },
      { subject: "840003202500102", forms: [
        { key: "demographics", status: "in_work", values: {
          rfid_tag: "840003202500102", visual_tag_id: ["112", 112], dob: "2024-08-30",
          breed_type: "Angus Cross", treatment_group: "Control" } },
        { key: "screen_pe", status: "in_work", values: {
          visit_date: "2026-04-02", screening_weight: ["344", 344], body_condition_score: ["5.0", 5.0],
          temperature: ["40.1", 40.1], heart_rate: ["72", 72] },
          editCheck: { field: "temperature", message: "Temperature 40.1 °C is above the expected range for cattle (38.0–39.3 °C) — verify against source and rule out febrile illness." } },
      ] },
      { subject: "840003202500103", forms: [
        { key: "demographics", status: "in_work", values: {
          rfid_tag: "840003202500103", visual_tag_id: ["120", 120], dob: "2024-10-01",
          breed_type: "Purebred Angus", treatment_group: "Treatment" },
          query: { field: "visual_tag_id", title: "Visual tag vs RFID cross-check",
            raise: "Visual tag 120 does not match the RFID ending in 103 on the chute reader log. Please confirm the visual tag is correctly assigned to this animal.",
            response: "Re-scanned at the chute — visual tag 120 and RFID …103 belong to the same heifer. Reader log corrected." } },
      ] },
    ],
  },
  {
    key: "CA", suffix: "000000000801", code: "CA-0801",
    name: "Canine Atopic Dermatitis Diet Trial",
    sponsor: "DermaPet Nutrition", phase: "Phase III",
    type: "companion", species: "canine", enrollmentTarget: 40,
    description: "Randomized double-blind — 40 client-owned dogs, hydrolyzed vs maintenance diet",
    tree: CA_TREE,
    site: { name: "Lakeshore Veterinary Dermatology", location: "Madison, WI", pi: "Dr. S. Bergman" },
    barns: [],
    pens: [],
    owners: [
      { code: "O1", name: "Priya Raman" },
      { code: "O2", name: "Thomas Reed" },
      { code: "O3", name: "Yuki Tanaka" },
      { code: "O4", name: "Hassan Ali" },
    ],
    subjects: [
      { code: "CA-0801-001", status: "active", arm: "Test Hydrolyzed Diet", owner: "O1" },
      { code: "CA-0801-002", status: "active", arm: "Control Maintenance Diet", owner: "O2" },
      { code: "CA-0801-003", status: "enrolled", arm: "Test Hydrolyzed Diet", owner: "O3" },
      { code: "CA-0801-004", status: "screening", arm: "Control Maintenance Diet", owner: "O4" },
    ],
    demo: [
      { subject: "CA-0801-001", forms: [
        { key: "demographics", status: "reviewed", values: {
          dog_name: "Biscuit", microchip_number: "985112004567321", owner_last_name: "Raman",
          owner_contact: "555-0144", breed: "West Highland White Terrier", age: ["4.5", 4.5],
          sex_neuter_status: "MN", body_weight: ["9.2", 9.2], informed_consent: "Yes" } },
        { key: "screen_pe", status: "reviewed", values: {
          visit_date: "2026-05-04", body_weight: ["9.2", 9.2], temperature: ["38.7", 38.7],
          heart_rate: ["104", 104], respiratory_rate: ["22", 22], baseline_cadesi4: ["46", 46],
          current_diet_brand: "Maintenance Adult", affected_body_regions: ["Paws", "Ears"] } },
        { key: "screen_ie", status: "reviewed", values: {
          cadesi4_20plus: "Yes", active_ectoparasite: "No", systemic_corticosteroid_30d: "No",
          owner_able_comply: "Yes", owner_consent_obtained: "Yes" } },
        { key: "randomization", status: "in_work", values: {
          randomization_date: "2026-05-06", randomization_number: "CA-R-021",
          diet_assignment: "Test Hydrolyzed Diet", diet_kit_number: "DK-3310",
          blinding_envelope_number: "ENV-021", randomization_method: "Envelope",
          performed_by: "Elisa Tron", owner_informed_blinding: "Yes" } },
      ] },
      { subject: "CA-0801-002", forms: [
        { key: "demographics", status: "in_work", values: {
          dog_name: "Pepper", microchip_number: "985112004599012", owner_last_name: "Reed",
          breed: "French Bulldog", age: ["3.0", 3.0], sex_neuter_status: "FS", body_weight: ["11.4", 11.4],
          informed_consent: "Yes" } },
        { key: "v1_pe", status: "in_work", values: {
          visit_date: "2026-05-06", study_week: "0", body_weight: ["11.4", 11.4],
          temperature: ["40.0", 40.0], heart_rate: ["120", 120], cadesi4_score: ["52", 52] },
          editCheck: { field: "temperature", message: "Temperature 40.0 °C is above the expected range for dogs (38.3–39.2 °C) — verify thermometer and re-check the patient." } },
      ] },
      { subject: "CA-0801-003", forms: [
        { key: "demographics", status: "in_work", values: {
          dog_name: "Mochi", microchip_number: "985112004571188", owner_last_name: "Tanaka",
          breed: "Shiba Inu", age: ["6.0", 6.0], sex_neuter_status: "MN", body_weight: ["10.1", 10.1],
          informed_consent: "Yes" },
          query: { field: "body_weight", title: "Body weight vs prior record",
            raise: "Body weight 10.1 kg is 1.8 kg below the weight on the referral record (11.9 kg). Please confirm the scale reading and recent weight history.",
            response: "Re-weighed on a calibrated scale — 10.1 kg confirmed. Owner reports recent weight loss; flagged for the investigator to review at Week 0." } },
      ] },
    ],
  },
];

// ─── SQL helpers ─────────────────────────────────────────────────────────────
const sqlStr = (s) => (s == null ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const sqlJson = (o) => (o == null ? "null" : `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`);
const h2 = (n) => n.toString(16).padStart(2, "0").toUpperCase();
const h6 = (n) => n.toString(16).padStart(6, "0").toUpperCase();
const studyUuid = (s) => `20000000-0000-0000-0000-${s}`;
const hierId = (prefix, n, suffix) => `${prefix}${h2(n)}0000-0000-0000-0000-${suffix}`;
const demoId = (prefix, n, suffix) => `${prefix}${h6(n)}-0000-0000-0000-${suffix}`;
const DEMO_USER = "10000000-0000-0000-0000-000000000001";

// ─── Emit forms + fields (per-study tree) ────────────────────────────────────
const formRows = [];
const fieldRows = [];
const formIdByKey = {}; // [studyKey][leafKey] = formId
const fieldIdByKey = {}; // [studyKey][leafKey][fieldCode] = fieldId

for (const study of STUDIES) {
  const suffix = study.suffix;
  const sUuid = studyUuid(suffix);
  formIdByKey[study.key] = {};
  fieldIdByKey[study.key] = {};
  let seq = 0;
  let gg = 0;

  const emitLeaf = (ggh, ss, node, parentId) => {
    seq += 1;
    const ssh = h2(ss);
    const id = `61${ggh}${ssh}00-0000-0000-0000-${suffix}`;
    const code = `F${ggh}${ssh}`;
    formRows.push(
      `  ('${id}','${sUuid}',${parentId ? `'${parentId}'` : "null"},'${code}',${sqlStr(node.name)},${seq})`,
    );
    formIdByKey[study.key][node.key] = id;
    fieldIdByKey[study.key][node.key] = {};
    node.fields.forEach((f, i) => {
      const ff = h2(i + 1);
      const fid = `62${ggh}${ssh}${ff}-0000-0000-0000-${suffix}`;
      fieldIdByKey[study.key][node.key][f.code] = fid;
      fieldRows.push(
        `  ('${fid}','${id}',${sqlStr(f.code)},${sqlStr(f.label)},'${f.type}',${
          f.options ? sqlJson(f.options) : "null"
        },${sqlStr(f.unit ?? null)},${f.req ? "true" : "false"},${i + 1},${sqlJson(f.validation ?? null)})`,
      );
    });
  };

  for (const node of study.tree) {
    gg += 1;
    const ggh = h2(gg);
    if (node.children) {
      seq += 1;
      const gid = `61${ggh}0000-0000-0000-0000-${suffix}`;
      formRows.push(`  ('${gid}','${sUuid}',null,'F${ggh}00',${sqlStr(node.name)},${seq})`);
      let ss = 0;
      for (const child of node.children) {
        ss += 1;
        emitLeaf(ggh, ss, child, gid);
      }
    } else {
      emitLeaf(ggh, 0, node, null);
    }
  }
}

// ─── Emit hierarchy + subjects ───────────────────────────────────────────────
const siteRows = [];
const barnRows = [];
const penRows = [];
const ownerRows = [];
const subjectRows = [];
const subjectIdByCode = {}; // [studyKey][subject_code] = uuid

for (const study of STUDIES) {
  const suffix = study.suffix;
  const sUuid = studyUuid(suffix);
  subjectIdByCode[study.key] = {};

  const siteUuid = hierId("30", 1, suffix);
  siteRows.push(
    `  ('${siteUuid}','${sUuid}','S01',${sqlStr(study.site.name)},${sqlStr(study.site.location)},${sqlStr(study.site.pi)},'active')`,
  );

  const barnUuidByCode = {};
  (study.barns ?? []).forEach((b, i) => {
    const id = hierId("31", i + 1, suffix);
    barnUuidByCode[b.code] = id;
    barnRows.push(`  ('${id}','${siteUuid}','${b.code}',${sqlStr(b.name)},${b.capacity ?? "null"})`);
  });

  const penUuidByCode = {};
  (study.pens ?? []).forEach((p, i) => {
    const id = hierId("32", i + 1, suffix);
    penUuidByCode[p.code] = id;
    penRows.push(`  ('${id}','${barnUuidByCode[p.barn]}','${p.code}',${sqlStr(p.name)},${p.capacity ?? "null"})`);
  });

  const ownerUuidByCode = {};
  (study.owners ?? []).forEach((o, i) => {
    const id = hierId("33", i + 1, suffix);
    ownerUuidByCode[o.code] = id;
    ownerRows.push(`  ('${id}','${sUuid}',${sqlStr(o.name)})`);
  });

  study.subjects.forEach((s, i) => {
    const id = hierId("34", i + 1, suffix);
    subjectIdByCode[study.key][s.code] = id;
    const pen = s.pen ? penUuidByCode[s.pen] : null;
    const barnForPen = s.pen ? study.pens.find((p) => p.code === s.pen)?.barn : null;
    const barn = barnForPen ? barnUuidByCode[barnForPen] : null;
    const owner = s.owner ? ownerUuidByCode[s.owner] : null;
    const enrolledAt = s.status === "screening" ? "null" : "now()";
    subjectRows.push(
      `  ('${id}','${sUuid}','${siteUuid}',${barn ? `'${barn}'` : "null"},${pen ? `'${pen}'` : "null"},${
        owner ? `'${owner}'` : "null"
      },${sqlStr(s.code)},${sqlStr(study.species)},'${s.status}',${sqlStr(s.arm)},${enrolledAt})`,
    );
  });
}

// ─── Emit demo instances / values / queries ──────────────────────────────────
const instanceRows = [];
const valueRows = [];
const queryRows = [];
const messageRows = [];

for (const study of STUDIES) {
  const suffix = study.suffix;
  let ic = 0;
  let vc = 0;
  let qc = 0;
  let mc = 0;
  for (const d of study.demo) {
    const subjectId = subjectIdByCode[study.key][d.subject];
    for (const f of d.forms) {
      const formId = formIdByKey[study.key][f.key];
      const instId = demoId("63", (ic += 1), suffix);
      instanceRows.push(`  ('${instId}','${formId}','${subjectId}','${f.status}')`);
      const vidByCode = {};
      for (const [code, raw] of Object.entries(f.values)) {
        // raw forms: "str" (text/select) · ["str", num] (numeric value+value_num)
        // · ["a","b",…] of strings (multiselect → stored as a JSON-array string).
        let val;
        let n = null;
        if (Array.isArray(raw) && typeof raw[1] === "number") {
          [val, n] = raw;
        } else if (Array.isArray(raw)) {
          val = JSON.stringify(raw);
        } else {
          val = raw;
        }
        const fieldId = fieldIdByKey[study.key][f.key][code];
        const vid = demoId("64", (vc += 1), suffix);
        vidByCode[code] = vid;
        valueRows.push(
          `  ('${vid}','${instId}','${fieldId}',${sqlStr(val)},${n == null ? "null" : n},'${DEMO_USER}',now())`,
        );
      }
      if (f.editCheck) {
        const qid = demoId("70", (qc += 1), suffix);
        const mid = demoId("71", (mc += 1), suffix);
        queryRows.push(
          `  ('${qid}','${instId}','${vidByCode[f.editCheck.field]}','open','major',${sqlStr(f.editCheck.message)},'${DEMO_USER}',now())`,
        );
        messageRows.push(`  ('${mid}','${qid}','${DEMO_USER}',${sqlStr("Auto edit-check: " + f.editCheck.message)})`);
      }
      if (f.query) {
        const qid = demoId("70", (qc += 1), suffix);
        queryRows.push(
          `  ('${qid}','${instId}','${vidByCode[f.query.field]}','responded','minor',${sqlStr(f.query.title)},'${DEMO_USER}',now())`,
        );
        messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(f.query.raise)})`);
        messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(f.query.response)})`);
      }
    }
  }
}

// ─── Static preamble (identity, access, species ranges) ──────────────────────
const studyValueRows = STUDIES.map(
  (s) =>
    `  ('${studyUuid(s.suffix)}','${s.code}',${sqlStr(s.name)},${sqlStr(s.sponsor)},${sqlStr(s.phase)},'${s.type}',${sqlStr(
      s.species,
    )},'active',${s.enrollmentTarget},${sqlStr(s.description)})`,
);
const membershipRows = STUDIES.map(
  (s, i) =>
    `  ('40000000-0000-0000-0000-${h6(i + 1).slice(-12).padStart(12, "0")}','${DEMO_USER}','${studyUuid(s.suffix)}','CRC')`,
);

const PREAMBLE = `-- ════════════════════════════════════════════════════════════════════════════
-- Arken EDC — Seed data (three clinically-realistic, session-based studies)
--   PH-2401  livestock_group       chicken   Site → House → Pen   (broiler pens)
--   HF-3001  livestock_individual  bovine    Site → Barn → Pen → Animal (RFID heifers)
--   CA-0801  companion             canine    Site → Subject (+ owner, at-home dogs)
--
-- ⚠️ GENERATED FILE — edit app/supabase/generate-seed.mjs and re-run:
--      node app/supabase/generate-seed.mjs
--
-- Each study defines its own form tree (info/visit GROUPS with sub-forms + a
-- Randomization form + 3 standalone forms). Vital fields declare validation.vital;
-- the range resolves per species from species_ranges at runtime (Case Study 3).
-- Inclusion/exclusion criteria declare validation.exclusion_if (the answer that
-- fails — "No" for inclusion criteria, "Yes" for exclusion criteria).
--
-- ⚠️ Apply with:  cd app && npx supabase db reset --linked --yes
-- ════════════════════════════════════════════════════════════════════════════

truncate table users, studies, access_codes, species_ranges cascade;

insert into users (id, full_name, email, initials, is_demo) values
  ('${DEMO_USER}', 'Elisa Tron', 'edc@arken.com', 'ET', true);

insert into studies (id, code, name, sponsor, phase, type, species, status, enrollment_target, description) values
${studyValueRows.join(",\n")};

insert into access_codes (id, code, label, role, study_id, is_active) values
  ('50000000-0000-0000-0000-000000000001', 'ARKEN-CRC', 'CRC — site coordinator', 'CRC', null, true),
  ('50000000-0000-0000-0000-000000000002', 'ARKEN-CRA', 'CRA — monitor / SDV', 'CRA', null, true),
  ('50000000-0000-0000-0000-000000000003', 'ARKEN-PI',  'PI — investigator',    'PI',  null, true),
  ('50000000-0000-0000-0000-000000000004', 'ARKEN-SPON','Sponsor — oversight',  'Sponsor', null, true),
  ('50000000-0000-0000-0000-000000000005', 'ARKEN-ADMIN','Admin — all access',  'Admin', null, true);

insert into study_memberships (id, user_id, study_id, role) values
${membershipRows.join(",\n")};

-- Species vital ranges — resolved by subject species at runtime. heart rate (bpm)
-- · temperature (°C) · respiratory rate (breaths/min) · weight (kg plausibility) ·
-- ammonia_level (ppm, broiler house air quality). Aligned with the study protocols.
insert into species_ranges (species, vital, min, max, unit) values
  ('cattle','heart_rate',40,80,'bpm'),  ('cattle','temperature',38.0,39.3,'°C'),  ('cattle','respiratory_rate',10,30,'breaths/min'),  ('cattle','weight',200,900,'kg'),
  ('canine','heart_rate',60,140,'bpm'), ('canine','temperature',38.3,39.2,'°C'),  ('canine','respiratory_rate',10,30,'breaths/min'),  ('canine','weight',2,90,'kg'),
  ('equine','heart_rate',28,44,'bpm'),  ('equine','temperature',37.5,38.5,'°C'),  ('equine','respiratory_rate',8,16,'breaths/min'),   ('equine','weight',350,700,'kg'),
  ('feline','heart_rate',140,220,'bpm'),('feline','temperature',38.1,39.2,'°C'),  ('feline','respiratory_rate',20,30,'breaths/min'),  ('feline','weight',2.5,9,'kg'),
  ('swine','heart_rate',70,120,'bpm'),  ('swine','temperature',38.7,39.8,'°C'),   ('swine','respiratory_rate',10,30,'breaths/min'),   ('swine','weight',20,350,'kg'),
  ('chicken','heart_rate',250,400,'bpm'),('chicken','temperature',40.6,42.2,'°C'),('chicken','ammonia_level',0,25,'ppm');

-- ════════════════════════════════════════════════════════════════════════════
-- HIERARCHY (sites → houses/barns → pens · companion owners · subjects)
-- ════════════════════════════════════════════════════════════════════════════
insert into sites (id, study_id, code, name, location, principal_investigator, status) values
${siteRows.join(",\n")};

insert into barns (id, site_id, code, name, capacity) values
${barnRows.join(",\n")};

insert into pens (id, barn_id, code, name, capacity) values
${penRows.join(",\n")};

insert into companion_owners (id, study_id, full_name) values
${ownerRows.join(",\n")};

insert into subjects (id, study_id, site_id, barn_id, pen_id, owner_id, subject_code, species, status, randomization_arm, enrolled_at) values
${subjectRows.join(",\n")};
`;

const DEMO = `
-- ════════════════════════════════════════════════════════════════════════════
-- DEMO DATA — per study: a completed Screening + filled Randomization, an open
-- edit check (out-of-range vital → auto edit-check), and a responded query.
-- ════════════════════════════════════════════════════════════════════════════
insert into form_instances (id, form_id, subject_id, status) values
${instanceRows.join(",\n")};

insert into field_values (id, form_instance_id, form_field_id, value, value_num, entered_by, entered_at) values
${valueRows.join(",\n")};

insert into queries (id, form_instance_id, field_value_id, status, severity, title, raised_by, raised_at) values
${queryRows.join(",\n")};

insert into query_messages (id, query_id, author_id, body) values
${messageRows.join(",\n")};
`;

// ─── Assemble ────────────────────────────────────────────────────────────────
const out = [
  PREAMBLE,
  "\n-- ════════════════════════════════════════════════════════════════════════════",
  "-- FORMS — per-study tree (parent_form_id links sub-forms → their group container)",
  "-- ════════════════════════════════════════════════════════════════════════════",
  "insert into forms (id, study_id, parent_form_id, code, name, sequence) values",
  formRows.join(",\n") + ";",
  "\n-- ─── Fields (groups have none; sub-forms + standalone forms carry them) ──────",
  "insert into form_fields (id, form_id, code, label, field_type, options, unit, is_required, sequence, validation) values",
  fieldRows.join(",\n") + ";",
  DEMO,
].join("\n");

writeFileSync(join(__dirname, "seed.sql"), out);
console.log(
  `seed.sql written — ${formRows.length} forms, ${fieldRows.length} fields, ` +
    `${subjectRows.length} subjects, ${instanceRows.length} instances, ${valueRows.length} values, ${queryRows.length} queries`,
);
