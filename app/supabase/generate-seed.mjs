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
// Reusable CA-0801 field sets (Follow-Up visits are identical; EOS reuses PE+QOL).
const caFollowupPE = () => [
  date("visit_date", "Visit date", true),
  num("body_weight", "Weight", "kg"),
  vital("temperature", "Temperature", "temperature", "°C"),
  vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
  vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
  sel("general_health", "General health assessment", ["Normal", "Abnormal"]),
  ta("findings", "Findings"),
];
const caQol = () => [
  sel("sleep_quality", "Sleep quality", ["Normal", "Mildly Disrupted", "Moderately Disrupted", "Severely Disrupted"]),
  sel("activity_level", "Activity level", ["Normal", "Mildly Reduced", "Moderately Reduced", "Severely Reduced"]),
  sel("comfort", "Comfort", ["Comfortable", "Mildly Uncomfortable", "Moderately Uncomfortable", "Severely Uncomfortable"]),
  sel("owner_burden", "Owner burden", ["None", "Mild", "Moderate", "Severe"]),
  rng("overall_qol_score", "Overall QOL score", 0, 100),
];
const caFollowup = (n, day) =>
  grp(`Follow-Up ${n} — Day ${day}`, [
    leaf(`fu${n}_pe`, "Physical Examination", caFollowupPE()),
    leaf(`fu${n}_derm`, "Dermatology Assessment", [
      rng("cadesi04_score", "CADESI-04 score", 0, 180),
      rng("pvas_score", "PVAS score (owner-reported)", 0.0, 10.0),
      sel("disease_severity", "Overall disease severity", ["Mild", "Moderate", "Severe", "Resolved"]),
      sel("ear_assessment", "Ear assessment", ["Normal", "Otitis Externa", "Otitis Media"]),
    ]),
    leaf(`fu${n}_drug`, "Study Drug Accountability", [
      txt("drug_kit_number", "Drug kit number"),
      rng("units_returned", "Units returned", 0, 200),
      calc("units_used", "Units used"),
      calc("compliance_pct", "Compliance", "%"),
      txt("next_kit_number", "Next kit number"),
      rng("quantity_dispensed", "Quantity dispensed", 0, 200),
    ]),
    leaf(`fu${n}_conmed`, "Concomitant Medications Review", [
      yn("new_conmed", "New ConMed since last visit"),
      ta("conmed_changes", "ConMed changes"),
    ]),
    leaf(`fu${n}_ae`, "Adverse Events Review", [
      yn("any_ae", "Any AE since last visit"),
      ta("ae_description", "AE description"),
    ]),
    leaf(`fu${n}_compliance`, "Compliance Review", [
      rng("epro_completion_pct", "ePRO diary completion", 0, 100, "%"),
      rng("missed_doses", "Missed doses", 0, 100),
      ta("missed_doses_reason", "Reason for missed doses"),
    ]),
    leaf(`fu${n}_questionnaire`, "Owner Questionnaire", [
      sel("sleep_disturbance", "Sleep disturbance", ["None", "Mild", "Moderate", "Severe"]),
      sel("activity_level", "Activity level", ["Normal", "Mildly Reduced", "Moderately Reduced", "Severely Reduced"]),
      sel("perceived_improvement", "Perceived improvement", ["Much Worse", "Worse", "No Change", "Improved", "Much Improved"]),
      sel("overall_satisfaction", "Overall satisfaction", ["Very Dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very Satisfied"]),
    ]),
  ]);

const CA_TREE = [
  grp("Animal Information", [
    leaf("demographics", "Demographics", [
      txt("subject_id", "Subject ID"),
      txt("animal_name", "Animal name"),
      sel("species", "Species", ["Canine"], true),
      sel("breed", "Breed", ["French Bulldog", "Labrador Retriever", "Golden Retriever", "West Highland White Terrier", "Boxer", "German Shepherd", "English Bulldog", "Cocker Spaniel", "Shih Tzu", "Pug", "Other"]),
      sel("sex", "Sex", ["Male Intact", "Male Neutered", "Female Intact", "Female Spayed"]),
      date("dob", "Date of birth"),
      calc("age_auto_calc", "Age (auto)", "years"),
      num("body_weight", "Weight", "kg", true),
      txt("coat_color", "Coat color"),
      txt("microchip_number", "Microchip number"),
    ]),
    leaf("owner_info", "Owner Information", [
      txt("owner_id", "Owner ID"),
      txt("owner_first_name", "First name"),
      txt("owner_last_name", "Last name"),
      txt("owner_phone", "Phone"),
      txt("owner_email", "Email"),
      txt("owner_address", "Address"),
      sel("preferred_contact", "Preferred contact method", ["Phone", "Email", "Text"]),
    ]),
  ]),
  grp("Screening", [
    leaf("screen_pe", "Physical Examination", [
      date("visit_date", "Visit date", true),
      vital("temperature", "Temperature", "temperature", "°C"),
      vital("heart_rate", "Heart rate", "heart_rate", "bpm"),
      vital("respiratory_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
      num("body_weight", "Weight", "kg"),
      rng("body_condition_score", "Body condition score", 1, 9),
      sel("general_health", "General health assessment", ["Normal", "Abnormal"]),
      ta("significant_findings", "Clinically significant findings"),
    ]),
    leaf("screen_derm", "Baseline Dermatology Assessment", [
      sel("pruritus_severity", "Pruritus severity", ["Mild", "Moderate", "Severe"]),
      sel("lesion_severity", "Skin lesion severity", ["Mild", "Moderate", "Severe"]),
      sel("infection_assessment", "Infection assessment", ["None", "Mild", "Moderate", "Severe"]),
      sel("ear_assessment", "Ear assessment", ["Normal", "Otitis Externa", "Otitis Media"]),
      rng("cadesi04_score", "CADESI-04 score", 0, 180),
    ]),
    leaf("screen_consent", "Owner Consent", [
      yn("consent_signed", "Consent signed", true),
      txt("consent_version", "Consent version"),
      date("consent_date", "Consent date", true),
      txt("witness_name", "Witness name"),
    ]),
    leaf("screen_eligibility", "Eligibility Assessment", [
      crit("age_1yr_plus", "Age ≥ 1 year"),
      crit("cad_diagnosis", "Clinical CAD diagnosis confirmed"),
      crit("chronic_itching_6mo", "Chronic itching ≥ 6 months"),
      crit("pruritus_5plus", "Baseline pruritus score ≥ 5"),
      crit("owner_daily_assessments", "Owner willing to complete daily assessments"),
      excl("severe_systemic_illness", "Severe systemic illness"),
      excl("recent_immunotherapy", "Recent immunotherapy initiation"),
      excl("active_mange", "Active mange infestation"),
      excl("pregnant_breeding", "Pregnant or breeding"),
      excl("another_study_30d", "In another study within 30 days"),
      sel("eligibility_status", "Eligibility status", ["Eligible", "Screen Failure"]),
      yn("investigator_approval", "Investigator approval"),
    ]),
    leaf("screen_medhistory", "Medical History", [
      ta("dermatology_history", "Dermatology history"),
      ta("previous_treatments", "Previous treatments"),
      ta("concurrent_diseases", "Concurrent diseases"),
      ta("surgical_history", "Surgical history"),
    ]),
    leaf("screen_labs", "Laboratory Results", [
      sel("cbc", "CBC", ["Normal", "Abnormal"]),
      sel("chemistry_panel", "Chemistry panel", ["Normal", "Abnormal"]),
      sel("urinalysis", "Urinalysis", ["Normal", "Abnormal"]),
      ta("lab_notes", "Lab notes"),
      yn("investigator_review", "Investigator review"),
    ]),
  ]),
  grp("Baseline / Randomization", [
    leaf("randomization", "Randomization", [
      txt("randomization_number", "Randomization number", true),
      sel("treatment_arm", "Treatment arm", ["DermAlliv™ Active", "Placebo"], true),
      date("randomization_date", "Randomization date", true),
      txt("drug_kit_assigned", "Drug kit assigned"),
    ]),
    leaf("baseline_clinical", "Baseline Clinical Assessment", [
      rng("cadesi04_score", "CADESI-04 score", 0, 180, null, true),
      rng("pvas_score", "PVAS score (owner-reported)", 0.0, 10.0, null, true),
      sel("disease_severity", "Overall disease severity", ["Mild", "Moderate", "Severe"]),
      sel("iga", "Investigator global assessment", ["1", "2", "3", "4", "5"]),
    ]),
    leaf("drug_dispensation", "Study Drug Dispensation", [
      txt("drug_kit_number", "Drug kit number", true),
      rng("quantity_dispensed", "Quantity dispensed", 0, 200, "units"),
      date("dispensation_date", "Dispensation date", true),
    ]),
    leaf("owner_training", "Owner Training", [
      yn("diary_training", "Diary training complete"),
      yn("med_admin_training", "Medication administration training"),
      yn("compliance_instructions", "Compliance instructions given"),
    ]),
    leaf("baseline_qol", "Baseline Quality of Life", caQol()),
  ]),
  caFollowup(1, 14),
  caFollowup(2, 28),
  caFollowup(3, 56),
  grp("End of Study — Day 84", [
    leaf("eos_pe", "Final Physical Examination", caFollowupPE()),
    leaf("eos_cadesi", "Final CADESI Assessment", [rng("cadesi04_score", "CADESI-04 score", 0, 180, null, true)]),
    leaf("eos_pvas", "Final PVAS Assessment", [rng("pvas_score", "PVAS score", 0.0, 10.0, null, true)]),
    leaf("eos_qol", "Final Quality of Life Survey", caQol()),
    leaf("eos_drug_return", "Study Drug Return", [
      yn("drug_kit_returned", "Drug kit returned"),
      rng("units_returned", "Units returned", 0, 200),
      ta("reason_not_returned", "Reason if not returned"),
    ]),
    leaf("eos_ae", "Final Adverse Event Assessment", [
      yn("outstanding_aes", "Any outstanding AEs"),
      ta("ae_status", "AE status"),
    ]),
    leaf("eos_completion", "Study Completion Status", [
      sel("completion_status", "Completion status", ["Completed", "Withdrawn", "Lost to Follow-Up", "Protocol Violation"], true),
      date("withdrawal_date", "Withdrawal date"),
      ta("withdrawal_reason", "Withdrawal reason"),
      ta("investigator_final", "Investigator final assessment", true),
    ]),
  ]),
  alone("adverse_event", "Adverse Event", [
    txt("ae_number", "AE number"),
    date("ae_start_date", "Start date"),
    date("ae_end_date", "End date"),
    yn("ongoing", "Ongoing"),
    coded("event_term", "Event term (VeDDRA)"),
    sel("severity", "Severity", ["Mild", "Moderate", "Severe", "Life-threatening"]),
    sel("seriousness", "Seriousness", ["Not Serious", "Serious"]),
    sel("relatedness", "Relatedness", ["Unrelated", "Unlikely", "Possible", "Probable", "Definite"]),
    sel("action_taken", "Action taken", ["None", "Drug Interrupted", "Drug Withdrawn", "Concomitant Treatment", "Other"]),
    sel("outcome", "Outcome", ["Recovered", "Recovering", "Not Recovered", "Fatal", "Unknown"]),
    yn("sae_flag", "SAE flag"),
    sel("sae_category", "SAE category", ["Death", "Life-threatening", "Hospitalization", "Disability", "Other"]),
    yn("hospitalization", "Hospitalization"),
    yn("sae_life_threatening", "Life-threatening"),
    date("sponsor_notification_date", "Sponsor notification date"),
    yn("regulatory_reporting", "Regulatory reporting required"),
  ]),
  alone("protocol_deviation", "Protocol Deviation", [
    sel("deviation_type", "Deviation type", ["Eligibility", "Visit Timing", "Procedure", "Medication", "Other"]),
    date("deviation_date", "Date"),
    ta("description", "Description"),
    sel("major_minor", "Major or minor", ["Major", "Minor"]),
    ta("corrective_action", "Corrective action"),
  ]),
  alone("subject_status", "Subject Status", [
    sel("current_status", "Current status", ["Screened", "Eligible", "Randomized", "Active", "Completed", "Withdrawn"]),
    date("withdrawal_date", "Withdrawal date"),
    sel("withdrawal_reason", "Withdrawal reason", ["Owner Request", "Adverse Event", "Protocol Violation", "Lost to Follow-Up", "Other"]),
    ta("comments", "Comments"),
  ]),
  alone("conmed", "ConMed", [
    txt("medication_name", "Medication name"),
    txt("indication", "Indication"),
    txt("dose", "Dose"),
    sel("route", "Route", ["Oral", "Topical", "Injectable", "Other"]),
    txt("frequency", "Frequency"),
    date("start_date", "Start date"),
    date("end_date", "End date"),
    yn("ongoing", "Ongoing"),
    ta("investigator_comments", "Investigator comments"),
  ]),
  // ePRO — owner daily diary. Read-only in the Subject Record (data flows from the
  // owner portal); the Subject Record shows an info note + disabled fields.
  alone("epro_diary", "ePRO — Owner Daily Diary", [
    rng("itch_score", "Itch score", 0, 10),
    sel("sleep_quality", "Sleep quality", ["Normal", "Mildly Disrupted", "Moderately Disrupted", "Severely Disrupted"]),
    sel("medication_compliance", "Medication compliance", ["Yes", "No", "Partial"]),
    sel("appetite", "Appetite", ["Normal", "Reduced", "Increased"]),
    sel("energy_level", "Energy level", ["Normal", "Low", "High"]),
    sel("mood", "Mood", ["Normal", "Anxious", "Lethargic"]),
  ]),
];

// ── CA-0801 hierarchy + subjects + demo (generated from a dog table) ──────────
const CA_SITES = [
  { code: "101", name: "Lakeside Veterinary Specialists", location: "Austin, TX", pi: "Dr. Sarah Bennett, DVM, DACVD" },
  { code: "102", name: "Green Valley Animal Hospital", location: "Denver, CO", pi: "Dr. Michael Torres, DVM" },
  { code: "103", name: "Coastal Veterinary Dermatology Center", location: "Raleigh, NC", pi: "Dr. Emily Chen, DVM, DACVD" },
];

// 12 randomized dogs (4 per site, 2:1 Active:Placebo) + 1 screen failure (Milo).
const CA_DOGS = [
  { code: "CA-0801-101-01", name: "Cooper", breed: "French Bulldog", sex: "Male Neutered", dob: "2021-04-12", weight: "12.4", coat: "Brindle", micro: "985141000100101", arm: "DermAlliv™ Active", status: "active", site: "101", owner: { first: "James", last: "Whitaker", phone: "512-555-0142", email: "jwhitaker@example.com", address: "1820 Barton Springs Rd, Austin, TX" } },
  { code: "CA-0801-101-02", name: "Luna", breed: "Labrador Retriever", sex: "Female Spayed", dob: "2019-08-03", weight: "28.7", coat: "Black", micro: "985141000100102", arm: "Placebo", status: "active", site: "101", owner: { first: "Maria", last: "Gonzalez", phone: "512-555-0177", email: "mgonzalez@example.com", address: "904 W 6th St, Austin, TX" } },
  { code: "CA-0801-101-03", name: "Bella", breed: "Golden Retriever", sex: "Female Spayed", dob: "2018-11-21", weight: "31.2", coat: "Golden", micro: "985141000100103", arm: "DermAlliv™ Active", status: "completed", site: "101", owner: { first: "David", last: "Nguyen", phone: "512-555-0193", email: "dnguyen@example.com", address: "2300 Lakeshore Blvd, Austin, TX" } },
  { code: "CA-0801-101-04", name: "Max", breed: "Boxer", sex: "Male Neutered", dob: "2020-02-17", weight: "30.1", coat: "Fawn", micro: "985141000100104", arm: "DermAlliv™ Active", status: "active", site: "101", owner: { first: "Sarah", last: "Mitchell", phone: "512-555-0210", email: "smitchell@example.com", address: "611 Riverside Dr, Austin, TX" } },
  { code: "CA-0801-101-05", name: "Milo", breed: "Pug", sex: "Male Intact", dob: "2022-06-30", weight: "8.3", coat: "Fawn", micro: "985141000100105", arm: null, status: "screening", site: "101", screenFail: true, owner: { first: "Olivia", last: "Brooks", phone: "512-555-0228", email: "obrooks@example.com", address: "1500 Manor Rd, Austin, TX" } },
  { code: "CA-0801-102-01", name: "Daisy", breed: "West Highland White Terrier", sex: "Female Spayed", dob: "2019-05-09", weight: "8.9", coat: "White", micro: "985141000100201", arm: "DermAlliv™ Active", status: "active", site: "102", owner: { first: "Robert", last: "Carter", phone: "303-555-0144", email: "rcarter@example.com", address: "720 Larimer St, Denver, CO" } },
  { code: "CA-0801-102-02", name: "Charlie", breed: "German Shepherd", sex: "Male Neutered", dob: "2018-09-14", weight: "34.5", coat: "Black & Tan", micro: "985141000100202", arm: "Placebo", status: "active", site: "102", owner: { first: "Jennifer", last: "Lopez", phone: "303-555-0166", email: "jlopez@example.com", address: "1450 Wynkoop St, Denver, CO" } },
  { code: "CA-0801-102-03", name: "Molly", breed: "Cocker Spaniel", sex: "Female Spayed", dob: "2020-12-02", weight: "13.1", coat: "Buff", micro: "985141000100203", arm: "DermAlliv™ Active", status: "withdrawn", site: "102", owner: { first: "Michael", last: "Anderson", phone: "303-555-0188", email: "manderson@example.com", address: "303 16th St, Denver, CO" } },
  { code: "CA-0801-102-04", name: "Bear", breed: "English Bulldog", sex: "Male Neutered", dob: "2019-03-25", weight: "24.6", coat: "White & Brindle", micro: "985141000100204", arm: "DermAlliv™ Active", status: "active", site: "102", owner: { first: "Emily", last: "Davis", phone: "303-555-0202", email: "edavis@example.com", address: "880 Pearl St, Denver, CO" } },
  { code: "CA-0801-103-01", name: "Rosie", breed: "Shih Tzu", sex: "Female Spayed", dob: "2021-01-18", weight: "6.8", coat: "Gold & White", micro: "985141000100301", arm: "Placebo", status: "active", site: "103", owner: { first: "William", last: "Harris", phone: "919-555-0133", email: "wharris@example.com", address: "210 Fayetteville St, Raleigh, NC" } },
  { code: "CA-0801-103-02", name: "Duke", breed: "Labrador Retriever", sex: "Male Neutered", dob: "2017-07-11", weight: "33.0", coat: "Chocolate", micro: "985141000100302", arm: "DermAlliv™ Active", status: "completed", site: "103", owner: { first: "Ashley", last: "Robinson", phone: "919-555-0155", email: "arobinson@example.com", address: "1025 Glenwood Ave, Raleigh, NC" } },
  { code: "CA-0801-103-03", name: "Zoe", breed: "French Bulldog", sex: "Female Spayed", dob: "2020-10-05", weight: "11.0", coat: "Cream", micro: "985141000100303", arm: "DermAlliv™ Active", status: "active", site: "103", owner: { first: "Christopher", last: "Clark", phone: "919-555-0179", email: "cclark@example.com", address: "600 Hillsborough St, Raleigh, NC" } },
  { code: "CA-0801-103-04", name: "Scout", breed: "Golden Retriever", sex: "Male Neutered", dob: "2018-04-28", weight: "32.4", coat: "Golden", micro: "985141000100304", arm: "Placebo", status: "completed", site: "103", owner: { first: "Jessica", last: "Lewis", phone: "919-555-0191", email: "jlewis@example.com", address: "3200 Wade Ave, Raleigh, NC" } },
];

const caOwners = CA_DOGS.map((d, i) => ({ code: `O${i + 1}`, name: `${d.owner.first} ${d.owner.last}` }));
const caSubjects = CA_DOGS.map((d, i) => ({ code: d.code, status: d.status, arm: d.arm, owner: `O${i + 1}`, site: d.site }));

// Rich demo forms for the highlighted subjects (2 completed screening+rand,
// 1 open edit check, 1 open query, 1 screen failure). Keyed by subject code.
const CA_EXTRA = {
  // Cooper — completed Screening + Randomization (#1)
  "CA-0801-101-01": [
    { key: "screen_pe", status: "reviewed", values: { visit_date: "2026-03-02", temperature: ["38.6", 38.6], heart_rate: ["96", 96], respiratory_rate: ["20", 20], body_weight: ["12.4", 12.4], body_condition_score: ["5", 5], general_health: "Normal", significant_findings: "Erythema and excoriation on ventral abdomen and pedal regions; no systemic abnormalities." } },
    { key: "screen_derm", status: "reviewed", values: { pruritus_severity: "Severe", lesion_severity: "Moderate", infection_assessment: "Mild", ear_assessment: "Otitis Externa", cadesi04_score: ["58", 58] } },
    { key: "screen_consent", status: "reviewed", values: { consent_signed: "Yes", consent_version: "v2.1", consent_date: "2026-03-02", witness_name: "L. Park, RVT" } },
    { key: "screen_eligibility", status: "reviewed", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "Yes", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Eligible", investigator_approval: "Yes" } },
    { key: "screen_labs", status: "reviewed", values: { cbc: "Normal", chemistry_panel: "Normal", urinalysis: "Normal", investigator_review: "Yes" } },
    { key: "randomization", status: "reviewed", values: { randomization_number: "101-001", treatment_arm: "DermAlliv™ Active", randomization_date: "2026-03-09", drug_kit_assigned: "KIT-1042" } },
    { key: "baseline_clinical", status: "in_work", values: { cadesi04_score: ["58", 58], pvas_score: ["7.2", 7.2], disease_severity: "Severe", iga: "4" },
      query: { field: "pvas_score", title: "Baseline PVAS vs owner diary",
        raise: "Baseline owner PVAS of 7.2 is higher than the average of the pre-baseline diary entries (≈5.8). Please confirm the score was transcribed from the correct diary week." } },
    { key: "drug_dispensation", status: "reviewed", values: { drug_kit_number: "KIT-1042", quantity_dispensed: ["84", 84], dispensation_date: "2026-03-09" } },
  ],
  // Bella — completed Screening + Randomization (#2) + End of Study = Completed
  "CA-0801-101-03": [
    { key: "screen_pe", status: "reviewed", values: { visit_date: "2026-02-18", temperature: ["38.5", 38.5], heart_rate: ["88", 88], respiratory_rate: ["18", 18], body_weight: ["31.2", 31.2], body_condition_score: ["6", 6], general_health: "Normal", significant_findings: "Chronic otitis and pedal pruritus; otherwise unremarkable." },
      query: { field: "body_weight", title: "Screening weight vs referral record",
        raise: "Screening weight 31.2 kg differs from the referral record (29.4 kg). Confirm the scale reading and recent weight history.",
        response: "Re-weighed on a calibrated scale at 31.2 kg; owner reports recent weight gain on the current diet. Value confirmed." } },
    { key: "screen_eligibility", status: "reviewed", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "Yes", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Eligible", investigator_approval: "Yes" } },
    { key: "randomization", status: "reviewed", values: { randomization_number: "101-003", treatment_arm: "DermAlliv™ Active", randomization_date: "2026-02-25", drug_kit_assigned: "KIT-1051" } },
    { key: "eos_completion", status: "reviewed", values: { completion_status: "Completed", investigator_final: "Subject completed all six visits. CADESI-04 improved 58 → 14 and owner PVAS 7.0 → 2.1 by Day 84. No drug-related adverse events." } },
  ],
  // Charlie — open edit check (out-of-range temperature on Screening PE)
  "CA-0801-102-02": [
    { key: "screen_pe", status: "in_work", values: { visit_date: "2026-03-04", temperature: ["40.1", 40.1], heart_rate: ["112", 112], respiratory_rate: ["24", 24], body_weight: ["34.5", 34.5], body_condition_score: ["5", 5], general_health: "Abnormal" },
      editCheck: { field: "temperature", message: "Temperature 40.1 °C is above the expected range for dogs (38.3–39.2 °C) — verify the thermometer and re-check the patient for pyrexia." } },
  ],
  // Daisy — open manual query (no response yet)
  "CA-0801-102-01": [
    { key: "screen_derm", status: "in_work", values: { pruritus_severity: "Moderate", lesion_severity: "Moderate", ear_assessment: "Normal", cadesi04_score: ["22", 22] },
      query: { field: "cadesi04_score", title: "CADESI-04 score vs lesion photos", raise: "CADESI-04 recorded as 22 but the uploaded lesion photographs suggest more extensive truncal involvement. Please re-score against the photo set and confirm." } },
  ],
  // Milo — screen failure (fails the baseline pruritus inclusion criterion)
  "CA-0801-101-05": [
    { key: "screen_eligibility", status: "in_work", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "No", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Screen Failure", investigator_approval: "No" } },
  ],
  // Molly — withdrawn: Subject Status carries the withdrawal date + reason (drives the banner).
  "CA-0801-102-03": [
    { key: "subject_status", status: "reviewed", values: { current_status: "Withdrawn", withdrawal_date: "2026-04-18", withdrawal_reason: "Owner Request", comments: "Owner relocated out of the catchment area and is unable to attend the remaining visits." } },
  ],
};

const caDemo = CA_DOGS.map((d, i) => {
  const reviewed = !(d.screenFail || d.status === "screening");
  const dStatus = reviewed ? "reviewed" : "in_work";
  return {
    subject: d.code,
    forms: [
      { key: "demographics", status: dStatus, values: { subject_id: d.code, animal_name: d.name, species: "Canine", breed: d.breed, sex: d.sex, dob: d.dob, body_weight: [d.weight, parseFloat(d.weight)], coat_color: d.coat, microchip_number: d.micro } },
      { key: "owner_info", status: dStatus, values: { owner_id: `O${i + 1}`, owner_first_name: d.owner.first, owner_last_name: d.owner.last, owner_phone: d.owner.phone, owner_email: d.owner.email, owner_address: d.owner.address, preferred_contact: "Email" } },
      ...(CA_EXTRA[d.code] ?? []),
    ],
  };
});

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
          performed_by: "Elisa Tron", blinding_status: "Double-blind" },
          query: { field: "feed_additive_lot", title: "Feed additive lot vs inventory",
            raise: "Feed additive lot FA-7781 is not yet logged in the inventory module. Please confirm the lot was received and reconcile against the shipment manifest." } },
      ] },
      { subject: "PH-2401-P02", forms: [
        { key: "demographics", status: "in_work", values: {
          pen_number: ["2", 2], initial_bird_count: ["20", 20], breed_strain: "Cobb 500",
          block_id: "Block 1", treatment_group: "Control" } },
        { key: "v1_pe", status: "in_work", values: {
          visit_date: "2026-03-01", total_pen_weight: ["1.05", 1.05], dead_bird_count: ["1", 1],
          litter_moisture_score: ["3", 3], ammonia_level: ["32", 32] },
          editCheck: { field: "ammonia_level", message: "Ammonia 32 ppm exceeds the broiler range (0–25 ppm) — check house ventilation and re-measure." },
          query: { field: "dead_bird_count", title: "Dead bird count vs daily mortality log",
            raise: "Dead bird count of 1 does not match the daily mortality log (2 on this date). Please reconcile.",
            response: "Reconciled — one mortality was a cull recorded separately on the AE form; pen count of 1 is correct." } },
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
          semen_straw_lot: "SS-8841", randomization_method: "IVRS", performed_by: "Elisa Tron" },
          query: { field: "injection_batch_number", title: "Injection batch vs inventory log",
            raise: "Injection batch MIN-2204 is not on the current inventory receipt log. Confirm the batch number and that it is within its expiry window." } },
      ] },
      { subject: "840003202500102", forms: [
        { key: "demographics", status: "in_work", values: {
          rfid_tag: "840003202500102", visual_tag_id: ["112", 112], dob: "2024-08-30",
          breed_type: "Angus Cross", treatment_group: "Control" } },
        { key: "screen_pe", status: "in_work", values: {
          visit_date: "2026-04-02", screening_weight: ["344", 344], body_condition_score: ["5.0", 5.0],
          temperature: ["40.1", 40.1], heart_rate: ["72", 72] },
          editCheck: { field: "temperature", message: "Temperature 40.1 °C is above the expected range for cattle (38.0–39.3 °C) — verify against source and rule out febrile illness." },
          query: { field: "screening_weight", title: "Screening weight near lower eligibility bound",
            raise: "Screening weight 344 kg is close to the 250–450 kg eligibility window lower margin after the BCS adjustment. Confirm the scale calibration and the recorded value.",
            response: "Scale re-zeroed and the heifer re-weighed at 344 kg — value confirmed and within the eligibility window." } },
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
    name: "DermAlliv™ Canine Atopic Dermatitis Study",
    sponsor: "DermAlliv Therapeutics", phase: "Phase III",
    type: "companion", species: "canine", enrollmentTarget: 60,
    description: "Randomized, double-blind, placebo-controlled, multi-site (3 sites) — canine atopic dermatitis · Protocol DERM-2026-104",
    tree: CA_TREE,
    sites: CA_SITES,
    barns: [],
    pens: [],
    owners: caOwners,
    subjects: caSubjects,
    demo: caDemo,
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

  // One or more sites. `study.sites` is an array; legacy single-site studies may
  // still use `study.site`. Each site has a `code`; subjects reference it via
  // `s.site` (defaulting to the first site).
  const sites = study.sites ?? (study.site ? [{ code: "S01", ...study.site }] : []);
  const siteUuidByCode = {};
  sites.forEach((st, i) => {
    const id = hierId("30", i + 1, suffix);
    siteUuidByCode[st.code] = id;
    siteRows.push(
      `  ('${id}','${sUuid}',${sqlStr(st.code)},${sqlStr(st.name)},${sqlStr(st.location)},${sqlStr(st.pi)},'active')`,
    );
  });
  const defaultSiteCode = sites[0]?.code;

  const barnUuidByCode = {};
  (study.barns ?? []).forEach((b, i) => {
    const id = hierId("31", i + 1, suffix);
    barnUuidByCode[b.code] = id;
    const siteForBarn = siteUuidByCode[b.site ?? defaultSiteCode];
    barnRows.push(`  ('${id}','${siteForBarn}','${b.code}',${sqlStr(b.name)},${b.capacity ?? "null"})`);
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
    const siteUuid = siteUuidByCode[s.site ?? defaultSiteCode];
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
        // A manual query. With a `response` it's seeded as responded (raise +
        // reply); without one it stays open (raise only).
        const open = !f.query.response;
        const qid = demoId("70", (qc += 1), suffix);
        queryRows.push(
          `  ('${qid}','${instId}','${vidByCode[f.query.field]}','${open ? "open" : "responded"}','minor',${sqlStr(f.query.title)},'${DEMO_USER}',now())`,
        );
        messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(f.query.raise)})`);
        if (!open) messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(f.query.response)})`);
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
