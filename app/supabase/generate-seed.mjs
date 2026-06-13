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
// Age-class vital — the range depends on the animal's age class (calf ≤6mo vs
// adult >6mo), resolved from species_ranges keyed `<vital>_calf` / `<vital>_adult`.
const vitalAge = (code, label, key, unit, req = false) =>
  ({ code, label, type: "number", unit, req, validation: { vital: key, ageClass: true, onViolation: "query" } });
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
// STUDY 1 — CX-2501  Anticoccidial Efficacy in Broiler Chickens (chicken, group)
// 8 group-level (pen) forms; the pen is the experimental unit.
// ═══════════════════════════════════════════════════════════════════════════
const CX_TREE = [
  alone("pen_setup", "Pen Setup & Demographics", [
    txt("pen_id", "Pen ID"),
    sel("site", "Site", ["Research Unit A", "Research Unit B"]),
    sel("room", "Barn / Room", ["Room 1", "Room 2"]),
    sel("treatment_arm", "Treatment arm", ["T01", "T02", "T03", "T04"]),
    num("randomization_block", "Randomization block"),
    num("birds_placed", "Birds placed"),
    sel("breed_strain", "Breed / strain", ["Ross 308", "Cobb 500"]),
    sel("sex", "Sex", ["As-hatched", "Male", "Female"]),
    date("hatch_date", "Hatch date"),
    txt("source_hatchery", "Source hatchery"),
    date("placement_date", "Placement date"),
    num("initial_pen_weight", "Initial pen weight", "kg"),
    calc("avg_placement_weight", "Avg placement weight", "g/bird"),
    sel("ration_code", "Ration code", ["Starter", "Grower", "Finisher"]),
    ta("notes", "Notes"),
  ]),
  alone("placement_eligibility", "Randomization & Placement Eligibility", [
    yn("randomization_confirmed", "Randomization confirmed"),
    calc("stocking_density", "Stocking density", "birds/m²"),
    sel("litter_type", "Litter type", ["Wood shavings", "Rice hulls", "Straw"]),
    num("target_temp", "Target temperature", "°C"),
    yn("ventilation_check", "Ventilation check"),
    yn("feed_water_available", "Feed & water available"),
    sel("health_status", "Health status at placement", ["Normal", "Abnormal"]),
    crit("eligible", "Eligible"),
    ta("reason_excluded", "Reason if excluded"),
  ]),
  alone("challenge", "Coccidiosis Challenge / Inoculation", [
    date("challenge_date", "Challenge date"),
    calc("day_of_age", "Day of age", "days"),
    msel("eimeria_species", "Eimeria species", ["E. acervulina", "E. maxima", "E. tenella"]),
    num("oocyst_dose", "Oocyst dose per bird"),
    sel("route", "Route", ["Oral gavage", "Feed", "Water"]),
    txt("inoculum_lot", "Inoculum lot"),
    num("birds_inoculated", "Birds inoculated"),
    txt("administered_by", "Administered by"),
    ta("notes", "Notes"),
  ]),
  alone("body_weight", "Body Weight & Feed Intake", [
    sel("assessment_day", "Assessment day", ["D0", "D14", "D21", "D28", "D35", "D42"]),
    date("date", "Date", true),
    num("birds_alive", "Birds alive at weighing"),
    num("pen_body_weight", "Pen body weight", "kg"),
    calc("avg_body_weight", "Avg body weight", "g/bird"),
    num("feed_added", "Feed added since last", "kg"),
    num("feed_weighback", "Feed weigh-back", "kg"),
    calc("feed_consumed", "Feed consumed", "kg"),
    num("mortality_since_last", "Mortality since last"),
    num("culls_since_last", "Culls since last"),
    calc("fcr_period", "FCR (period)"),
    calc("adjusted_fcr", "Adjusted FCR"),
  ]),
  alone("daily_health", "Daily Health & Mortality Observation", [
    date("obs_date", "Observation date", true),
    sel("flock_condition", "Flock condition", ["Normal", "Abnormal"]),
    num("mortality_count", "Mortality count"),
    num("cull_count", "Cull count"),
    sel("fecal_score", "Litter / fecal score", ["0", "1", "2", "3"]),
    yn("diarrhea_present", "Diarrhea present"),
    yn("bloody_droppings", "Bloody droppings"),
    msel("clinical_signs", "Clinical signs", ["Huddling", "Ruffled feathers", "Lethargy", "Pale comb", "Other"]),
    ta("action_taken", "Action taken"),
    txt("observer", "Observer"),
  ]),
  alone("lesion_scoring", "Coccidiosis Lesion Scoring at Necropsy", [
    date("necropsy_date", "Necropsy date"),
    calc("day_post_challenge", "Day post-challenge", "days"),
    num("bird_sequence", "Bird sequence within pen"),
    num("body_weight_necropsy", "Body weight at necropsy", "g"),
    sel("score_acervulina", "Upper intestine score — E. acervulina", ["0", "1", "2", "3", "4"]),
    sel("score_maxima", "Mid intestine score — E. maxima", ["0", "1", "2", "3", "4"]),
    sel("score_tenella", "Cecal score — E. tenella", ["0", "1", "2", "3", "4"]),
    calc("total_lesion_score", "Total lesion score"),
    num("opg", "Oocyst count per gram (OPG)"),
    ta("gross_pathology", "Gross pathology notes"),
    txt("examiner", "Examiner"),
  ]),
  alone("adverse_event", "Adverse Event", [
    date("ae_onset_date", "AE onset date"),
    sel("pen_id", "Pen ID", ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"]),
    sel("event_type", "Event type", ["Unexpected mortality", "Morbidity event", "Environmental / equipment"]),
    num("birds_affected", "Birds affected"),
    sel("severity", "Severity", ["Mild", "Moderate", "Severe"]),
    sel("relationship", "Relationship to test article", ["Related", "Possibly", "Unlikely", "Not related"]),
    yn("serious_sae", "Serious (SAE)"),
    ta("action_taken", "Action taken"),
    sel("outcome", "Outcome", ["Resolved", "Ongoing", "Fatal"]),
    date("resolution_date", "Resolution date"),
    txt("reported_to", "Reported to"),
  ]),
  alone("eos", "End of Study / Pen Disposition", [
    date("completion_date", "Completion date"),
    num("birds_remaining", "Birds remaining"),
    calc("total_mortality", "Total mortality"),
    calc("total_culls", "Total culls"),
    calc("mortality_pct", "Mortality", "%"),
    num("final_avg_weight", "Final avg body weight", "g"),
    calc("cumulative_feed", "Cumulative feed consumed", "kg"),
    calc("overall_fcr", "Overall FCR"),
    sel("disposition", "Disposition", ["Processed", "Euthanized", "Transferred"]),
    ta("final_comments", "Final comments"),
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 2 — BR-2502  Bovine Respiratory Disease Treatment Trial (cattle, individual)
// 8 individual-level forms. Heart rate uses AGE-CLASS validation (calf vs adult).
// ═══════════════════════════════════════════════════════════════════════════
const BR_TREE = [
  alone("demographics", "Animal Demographics / Enrollment", [
    txt("animal_id", "Animal ID / ear tag", true),
    sel("site", "Site", ["Feedlot TX", "Feedlot KS", "Feedlot NE", "Feedlot CO"]),
    txt("eid_rfid", "EID / RFID"),
    sel("home_pen", "Home pen", ["Pen 1", "Pen 2", "Pen 3"]),
    sel("sex", "Sex", ["Steer", "Heifer", "Bull"]),
    sel("breed_type", "Breed / type", ["Angus", "Hereford", "Simmental", "Cross", "Other"]),
    txt("source_lot", "Source / origin lot"),
    date("arrival_date", "Arrival date"),
    num("age_months", "Estimated age", "months"),
    num("arrival_weight", "Arrival body weight", "kg"),
    txt("color_markings", "Color / markings"),
    file("animal_photo", "Animal photo"),
    date("enrollment_date", "Enrollment date", true),
  ]),
  alone("screening", "Screening / BRD Case Definition", [
    date("screening_date", "Screening date", true),
    sel("dart_score", "Clinical illness score (DART)", ["0", "1", "2", "3"]),
    rng("screening_temp", "Rectal temperature", 35, 43, "°C"),
    calc("meets_temp_criterion", "Meets temperature criterion (≥ 40.0)"),
    msel("visual_brd_signs", "Visual BRD signs", ["Nasal discharge", "Cough", "Lethargy", "Drooped ears", "Other"]),
    num("days_on_feed", "Days on feed"),
    yn("prior_brd_treatment", "Prior BRD treatment"),
    yn("inclusion_met", "Inclusion criteria met"),
    msel("exclusion_criteria", "Exclusion criteria", ["Pregnant", "Chronic illness", "Concurrent illness", "Prior treatment", "Other"]),
    crit("eligible", "Eligible"),
    sel("randomized_arm", "Randomized arm", ["T01", "T02", "T03"]),
  ]),
  alone("vital_signs", "Vital Signs / Clinical Assessment", [
    sel("assessment_day", "Assessment day", ["D0", "D3", "D7", "D14", "D28"]),
    date("datetime", "Date / time", true),
    vital("rectal_temp", "Rectal temperature", "temperature", "°C"),
    vitalAge("heart_rate", "Heart rate", "heart_rate", "bpm"),
    vital("resp_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
    sel("clinical_illness_score", "Clinical illness score", ["0", "1", "2", "3"]),
    sel("attitude", "Attitude / demeanor", ["Bright", "Quiet", "Depressed", "Recumbent"]),
    sel("hydration", "Hydration status", ["Normal", "Mild", "Moderate", "Severe dehydration"]),
    sel("bcs", "Body condition score", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
    sel("appetite", "Appetite", ["Normal", "Reduced", "None"]),
    ta("notes", "Notes"),
  ]),
  alone("treatment", "Treatment Administration", [
    date("treatment_datetime", "Treatment date / time", true),
    num("body_weight_dosing", "Body weight at dosing", "kg", true),
    sel("test_article", "Test article", ["T01 Test Article", "T02 Reference", "T03 Saline"]),
    num("dose_mg_kg", "Dose", "mg/kg"),
    calc("total_dose", "Total dose", "mg"),
    num("volume_ml", "Volume", "mL"),
    sel("route", "Route", ["SC", "IM", "IV"]),
    msel("injection_site", "Injection site", ["Left neck", "Right neck"]),
    num("volume_per_site", "Volume per site", "mL"),
    txt("lot_expiry", "Lot / expiry"),
    calc("withdrawal_days", "Withdrawal period", "days"),
    calc("withdrawal_end", "Withdrawal end date"),
    txt("administered_by", "Administered by"),
    yn("retreatment_flag", "Re-treatment flag"),
  ]),
  alone("retreatment", "Re-treatment / Rescue Therapy", [
    date("date", "Date"),
    sel("reason", "Reason", ["Relapse", "Treatment failure", "Worsening"]),
    vital("rectal_temp", "Rectal temperature", "temperature", "°C"),
    sel("clinical_illness_score", "Clinical illness score", ["0", "1", "2", "3"]),
    sel("rescue_product", "Rescue product", ["Florfenicol", "Tulathromycin", "Other"]),
    txt("dose_route", "Dose / route"),
    yn("treatment_failure", "Classified as treatment failure"),
    yn("removed_from_study", "Removed from study"),
  ]),
  alone("adverse_event", "Adverse Event", [
    date("ae_onset_date", "AE onset date"),
    txt("animal_id", "Animal ID"),
    ta("event_description", "Event description"),
    sel("body_system", "Body system affected", ["Respiratory", "GI", "Cardiac", "Injection site", "Other"]),
    yn("injection_site_reaction", "Injection site reaction"),
    sel("injection_site_grade", "Injection site grade", ["0", "1", "2", "3"]),
    sel("severity", "Severity", ["Mild", "Moderate", "Severe"]),
    yn("serious_sae", "Serious (SAE)"),
    sel("relationship", "Relationship to test article", ["Related", "Possibly", "Unlikely", "Not related"]),
    sel("action_taken", "Action taken", ["Continued", "Withdrawn", "Treated"]),
    txt("concomitant_treatment", "Concomitant treatment"),
    sel("outcome", "Outcome", ["Recovered", "Recovering", "Not recovered", "Fatal"]),
    date("resolution_date", "Resolution date"),
  ]),
  alone("necropsy", "Necropsy / Post-mortem", [
    date("death_date", "Death date"),
    sel("manner", "Manner", ["Found dead", "Euthanized"]),
    date("necropsy_date", "Necropsy date"),
    txt("performed_by", "Performed by"),
    sel("body_condition", "Body condition", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
    ta("respiratory_findings", "Respiratory findings"),
    num("lung_consolidation", "Lung consolidation (cranioventral)", "%"),
    sel("lung_lesion_score", "Lung lesion score", ["0", "1", "2", "3", "4"]),
    yn("pleural_adhesions", "Pleural adhesions"),
    ta("other_organ_findings", "Other organ findings"),
    msel("samples_collected", "Samples collected", ["Histopath", "Culture", "Lung", "Other"]),
    txt("presumptive_cause", "Presumptive cause of death"),
    yn("brd_attributable", "BRD-attributable"),
  ]),
  alone("eos", "End of Study / Final Disposition", [
    date("completion_date", "Completion date"),
    calc("days_on_study", "Days on study", "days"),
    num("final_body_weight", "Final body weight", "kg"),
    calc("adg", "Average daily gain", "kg/day"),
    calc("treatments_received", "Treatments received"),
    sel("clinical_outcome", "Clinical outcome", ["Cure", "Treatment success", "Treatment failure", "Relapse", "Death", "Removed"]),
    num("final_temp", "Final temperature", "°C"),
    sel("disposition", "Disposition", ["Returned to pen", "Shipped", "Died", "Euthanized"]),
    calc("withdrawal_end", "Withdrawal period end date"),
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
    txt("ae_term", "AE term"),
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

// Scheduled-visit leaf forms (Screening · Baseline/Randomization · Follow-Ups ·
// End of Study) — completed subjects have ALL of these finalized.
const CA_VISIT_GROUP_RX = /Screening|Randomization|Follow-Up|End of Study/;
const caVisitLeafKeys = CA_TREE.filter((n) => n.children && CA_VISIT_GROUP_RX.test(n.name)).flatMap((n) => n.children.map((c) => c.key));

const caDemo = CA_DOGS.map((d, i) => {
  const reviewed = !(d.screenFail || d.status === "screening");
  const dStatus = reviewed ? "reviewed" : "in_work";
  let forms = [
    { key: "demographics", status: dStatus, values: { subject_id: d.code, animal_name: d.name, species: "Canine", breed: d.breed, sex: d.sex, dob: d.dob, body_weight: [d.weight, parseFloat(d.weight)], coat_color: d.coat, microchip_number: d.micro } },
    { key: "owner_info", status: dStatus, values: { owner_id: `O${i + 1}`, owner_first_name: d.owner.first, owner_last_name: d.owner.last, owner_phone: d.owner.phone, owner_email: d.owner.email, owner_address: d.owner.address, preferred_contact: "Email" } },
    ...(CA_EXTRA[d.code] ?? []),
  ];
  // Completed subjects: every scheduled-visit form is finalized — upgrade the
  // ones that already carry data, and add the rest as finalized instances.
  if (d.status === "completed") {
    const present = new Set(forms.map((f) => f.key));
    forms = forms.map((f) => (caVisitLeafKeys.includes(f.key) ? { ...f, status: "finalized" } : f));
    for (const key of caVisitLeafKeys) {
      if (!present.has(key)) forms.push({ key, status: "finalized", values: {} });
    }
  }
  return { subject: d.code, forms };
});

// ─── Study configs (meta + hierarchy + subjects + demo) ──────────────────────
const STUDIES = [
  {
    key: "CX", suffix: "000000002501", code: "CX-2501",
    name: "Anticoccidial Efficacy in Broiler Chickens",
    sponsor: "AviCox Animal Health", phase: "Phase III",
    type: "livestock_group", species: "chicken", enrollmentTarget: 32,
    description: "Randomized complete block — 32 broiler pens (30 birds/pen) across 2 research units; 4 arms (T01 unchallenged/untreated, T02 challenged/untreated, T03 challenged/test, T04 challenged/reference); pen-level capture · Protocol CX-2501",
    tree: CX_TREE,
    sites: [
      { code: "RUA", name: "Research Unit A", location: "Gainesville, GA", pi: "Dr. R. Halverson, DVM" },
      { code: "RUB", name: "Research Unit B", location: "Fayetteville, AR", pi: "Dr. P. Osei, DVM" },
    ],
    barns: [
      { code: "RA1", name: "Room 1", site: "RUA", capacity: 480 },
      { code: "RB1", name: "Room 1", site: "RUB", capacity: 480 },
    ],
    pens: [
      { code: "P01", name: "Pen 01", barn: "RA1", capacity: 30 },
      { code: "P02", name: "Pen 02", barn: "RA1", capacity: 30 },
      { code: "P03", name: "Pen 03", barn: "RA1", capacity: 30 },
      { code: "P04", name: "Pen 04", barn: "RA1", capacity: 30 },
      { code: "P05", name: "Pen 05", barn: "RB1", capacity: 30 },
      { code: "P06", name: "Pen 06", barn: "RB1", capacity: 30 },
      { code: "P07", name: "Pen 07", barn: "RB1", capacity: 30 },
      { code: "P08", name: "Pen 08", barn: "RB1", capacity: 30 },
    ],
    subjects: [
      { code: "CX-2501-P01", status: "active",    arm: "T01", pen: "P01", site: "RUA" },
      { code: "CX-2501-P02", status: "active",    arm: "T02", pen: "P02", site: "RUA" },
      { code: "CX-2501-P03", status: "active",    arm: "T03", pen: "P03", site: "RUA" },
      { code: "CX-2501-P04", status: "enrolled",  arm: "T04", pen: "P04", site: "RUA" },
      { code: "CX-2501-P05", status: "active",    arm: "T01", pen: "P05", site: "RUB" },
      { code: "CX-2501-P06", status: "active",    arm: "T02", pen: "P06", site: "RUB" },
      { code: "CX-2501-P07", status: "active",    arm: "T03", pen: "P07", site: "RUB" },
      { code: "CX-2501-P08", status: "screening", arm: "T04", pen: "P08", site: "RUB" },
    ],
    demo: [
      { subject: "CX-2501-P01", forms: [
        { key: "pen_setup", status: "reviewed", values: {
          pen_id: "P01", site: "Research Unit A", room: "Room 1", treatment_arm: "T01",
          randomization_block: ["1", 1], birds_placed: ["30", 30], breed_strain: "Ross 308",
          sex: "As-hatched", hatch_date: "2026-05-01", source_hatchery: "Northgate Hatchery",
          placement_date: "2026-05-01", initial_pen_weight: ["1.26", 1.26], ration_code: "Starter" } },
        { key: "placement_eligibility", status: "reviewed", values: {
          randomization_confirmed: "Yes", litter_type: "Wood shavings", target_temp: ["32", 32],
          ventilation_check: "Yes", feed_water_available: "Yes", health_status: "Normal", eligible: "Yes" } },
        { key: "body_weight", status: "in_work", values: {
          assessment_day: "D14", date: "2026-05-15", birds_alive: ["30", 30], pen_body_weight: ["13.8", 13.8],
          feed_added: ["20", 20], feed_weighback: ["2.5", 2.5], mortality_since_last: ["0", 0], culls_since_last: ["0", 0] } },
      ] },
      { subject: "CX-2501-P02", forms: [
        { key: "pen_setup", status: "reviewed", values: {
          pen_id: "P02", site: "Research Unit A", room: "Room 1", treatment_arm: "T02",
          randomization_block: ["1", 1], birds_placed: ["30", 30], breed_strain: "Ross 308",
          sex: "As-hatched", hatch_date: "2026-05-01", placement_date: "2026-05-01",
          initial_pen_weight: ["1.24", 1.24], ration_code: "Starter" } },
        { key: "challenge", status: "in_work", values: {
          challenge_date: "2026-05-15", eimeria_species: ["E. acervulina", "E. maxima", "E. tenella"],
          oocyst_dose: ["75000", 75000], route: "Oral gavage", inoculum_lot: "INO-3391",
          birds_inoculated: ["30", 30], administered_by: "Elisa Tron" },
          query: { field: "inoculum_lot", title: "Inoculum lot vs challenge preparation log",
            raise: "Inoculum lot INO-3391 is not recorded on the challenge preparation log for this date. Confirm the lot and that the oocyst suspension was within its potency window.",
            response: "Reconciled — INO-3391 was prepared the same morning; the prep log entry was filed under the prior page. Lot and titre confirmed." } },
      ] },
      { subject: "CX-2501-P03", forms: [
        { key: "pen_setup", status: "reviewed", values: {
          pen_id: "P03", site: "Research Unit A", room: "Room 1", treatment_arm: "T03",
          randomization_block: ["2", 2], birds_placed: ["30", 30], breed_strain: "Ross 308",
          sex: "As-hatched", hatch_date: "2026-05-01", placement_date: "2026-05-01",
          initial_pen_weight: ["1.27", 1.27], ration_code: "Starter" } },
        { key: "daily_health", status: "in_work", values: {
          obs_date: "2026-05-21", flock_condition: "Abnormal", mortality_count: ["4", 4], cull_count: ["1", 1],
          fecal_score: "3", diarrhea_present: "Yes", bloody_droppings: "Yes",
          clinical_signs: ["Huddling", "Ruffled feathers", "Lethargy"], observer: "Elisa Tron" },
          editCheck: { field: "mortality_count", message: "Mortality of 4 birds with bloody droppings (fecal score 3) at D6 post-challenge exceeds the daily threshold — investigate for severe cecal coccidiosis and notify the study veterinarian." } },
      ] },
    ],
  },
  {
    key: "BR", suffix: "000000002502", code: "BR-2502",
    name: "Bovine Respiratory Disease Treatment Trial",
    sponsor: "BoviPharm Therapeutics", phase: "Phase III",
    type: "livestock_individual", species: "cattle", enrollmentTarget: 270,
    description: "Randomized, masked, 3-arm — 270 feedlot cattle across 4 sites; rolling enrollment; individual-animal capture. Heart-rate validation is age-class–specific (calf ≤6 mo 100–140 bpm vs adult 48–84 bpm) · Protocol BR-2502",
    tree: BR_TREE,
    sites: [
      { code: "TX", name: "Feedlot TX", location: "Hereford, TX", pi: "Dr. C. Ramirez, DVM" },
      { code: "KS", name: "Feedlot KS", location: "Garden City, KS", pi: "Dr. L. Schmidt, DVM" },
      { code: "NE", name: "Feedlot NE", location: "Lexington, NE", pi: "Dr. T. Olson, DVM" },
      { code: "CO", name: "Feedlot CO", location: "Yuma, CO", pi: "Dr. M. Hayes, DVM" },
    ],
    barns: [
      { code: "TXB", name: "Barn 1", site: "TX", capacity: 100 },
      { code: "KSB", name: "Barn 1", site: "KS", capacity: 100 },
      { code: "NEB", name: "Barn 1", site: "NE", capacity: 100 },
      { code: "COB", name: "Barn 1", site: "CO", capacity: 100 },
    ],
    pens: [
      { code: "TXP", name: "Pen 1", barn: "TXB", capacity: 60 },
      { code: "KSP", name: "Pen 1", barn: "KSB", capacity: 60 },
      { code: "NEP", name: "Pen 1", barn: "NEB", capacity: 60 },
      { code: "COP", name: "Pen 1", barn: "COB", capacity: 60 },
    ],
    subjects: [
      { code: "BR-2502-TX-001", status: "active",    arm: "T01", pen: "TXP", site: "TX" },
      { code: "BR-2502-TX-002", status: "active",    arm: "T02", pen: "TXP", site: "TX" },
      { code: "BR-2502-TX-003", status: "completed", arm: "T03", pen: "TXP", site: "TX" },
      { code: "BR-2502-KS-001", status: "active",    arm: "T01", pen: "KSP", site: "KS" },
      { code: "BR-2502-KS-002", status: "active",    arm: "T02", pen: "KSP", site: "KS" },
      { code: "BR-2502-KS-003", status: "withdrawn", arm: "T03", pen: "KSP", site: "KS" },
      { code: "BR-2502-NE-001", status: "active",    arm: "T01", pen: "NEP", site: "NE" },
      { code: "BR-2502-NE-002", status: "completed", arm: "T02", pen: "NEP", site: "NE" },
      { code: "BR-2502-NE-003", status: "active",    arm: "T03", pen: "NEP", site: "NE" },
      { code: "BR-2502-CO-001", status: "active",    arm: "T01", pen: "COP", site: "CO" },
      { code: "BR-2502-CO-002", status: "completed", arm: "T02", pen: "COP", site: "CO" },
      { code: "BR-2502-CO-003", status: "active",    arm: "T03", pen: "COP", site: "CO" },
    ],
    demo: [
      { subject: "BR-2502-TX-001", forms: [
        { key: "demographics", status: "reviewed", values: {
          animal_id: "TX-1001", site: "Feedlot TX", eid_rfid: "840003202511001", home_pen: "Pen 1",
          sex: "Steer", breed_type: "Angus", source_lot: "Lot 22-A", arrival_date: "2026-05-20",
          age_months: ["14", 14], arrival_weight: ["265", 265], color_markings: "Black", enrollment_date: "2026-05-22" } },
        { key: "screening", status: "reviewed", values: {
          screening_date: "2026-05-22", dart_score: "2", screening_temp: ["40.4", 40.4],
          visual_brd_signs: ["Nasal discharge", "Cough", "Drooped ears"], days_on_feed: ["2", 2],
          prior_brd_treatment: "No", inclusion_met: "Yes", eligible: "Yes", randomized_arm: "T01" } },
        { key: "vital_signs", status: "in_work", values: {
          assessment_day: "D0", datetime: "2026-05-22", rectal_temp: ["40.6", 40.6], heart_rate: ["120", 120],
          resp_rate: ["44", 44], clinical_illness_score: "2", attitude: "Depressed", hydration: "Mild",
          bcs: "4", appetite: "Reduced" },
          editCheck: { field: "rectal_temp", message: "Rectal temperature 40.6 °C exceeds the bovine range (38.0–39.3 °C) — consistent with a febrile BRD episode; confirm against source and the screening reading. (Heart rate 120 bpm is also above the adult range 48–84 bpm for this 14-month animal.)" } },
      ] },
      { subject: "BR-2502-KS-002", forms: [
        { key: "demographics", status: "reviewed", values: {
          animal_id: "KS-2042", site: "Feedlot KS", eid_rfid: "840003202520042", home_pen: "Pen 1",
          sex: "Heifer", breed_type: "Hereford", source_lot: "Lot 14", arrival_date: "2026-05-25",
          age_months: ["5", 5], arrival_weight: ["180", 180], enrollment_date: "2026-05-26" } },
        { key: "screening", status: "reviewed", values: {
          screening_date: "2026-05-26", dart_score: "1", screening_temp: ["40.1", 40.1],
          visual_brd_signs: ["Nasal discharge", "Cough"], days_on_feed: ["1", 1],
          prior_brd_treatment: "No", inclusion_met: "Yes", eligible: "Yes", randomized_arm: "T02" } },
        { key: "vital_signs", status: "in_work", values: {
          assessment_day: "D0", datetime: "2026-05-26", rectal_temp: ["39.1", 39.1], heart_rate: ["120", 120],
          resp_rate: ["40", 40], clinical_illness_score: "1", attitude: "Quiet", hydration: "Normal",
          bcs: "4", appetite: "Normal" } },
      ] },
      { subject: "BR-2502-TX-003", forms: [
        { key: "demographics", status: "reviewed", values: {
          animal_id: "TX-1015", site: "Feedlot TX", eid_rfid: "840003202511015", home_pen: "Pen 1",
          sex: "Steer", breed_type: "Simmental", source_lot: "Lot 22-B", arrival_date: "2026-05-10",
          age_months: ["12", 12], arrival_weight: ["278", 278], enrollment_date: "2026-05-12" } },
        { key: "screening", status: "reviewed", values: {
          screening_date: "2026-05-12", dart_score: "2", screening_temp: ["40.2", 40.2],
          visual_brd_signs: ["Nasal discharge", "Lethargy"], days_on_feed: ["2", 2],
          prior_brd_treatment: "No", inclusion_met: "Yes", eligible: "Yes", randomized_arm: "T03" } },
        { key: "treatment", status: "reviewed", values: {
          treatment_datetime: "2026-05-12", body_weight_dosing: ["278", 278], test_article: "T03 Saline",
          dose_mg_kg: ["0", 0], volume_ml: ["14", 14], route: "SC", injection_site: ["Left neck"],
          volume_per_site: ["14", 14], lot_expiry: "SAL-7781 / 2027-01", administered_by: "Elisa Tron", retreatment_flag: "No" },
          query: { field: "body_weight_dosing", title: "Dosing weight vs arrival weight",
            raise: "Body weight at dosing (278 kg) differs from the arrival weight (272 kg) on the manifest by more than 5 kg. Confirm the chute scale reading used for the dose calculation.",
            response: "Re-verified at the chute — 278 kg is correct; the manifest carried an estimated arrival weight. Dose volume recalculated and unchanged." } },
        { key: "eos", status: "reviewed", values: {
          completion_date: "2026-06-09", final_body_weight: ["318", 318], clinical_outcome: "Treatment success",
          final_temp: ["38.8", 38.8], disposition: "Returned to pen" } },
      ] },
      { subject: "BR-2502-NE-002", forms: [
        { key: "demographics", status: "reviewed", values: {
          animal_id: "NE-3007", site: "Feedlot NE", eid_rfid: "840003202530007", home_pen: "Pen 1",
          sex: "Steer", breed_type: "Cross", source_lot: "Lot 09", arrival_date: "2026-05-08",
          age_months: ["10", 10], arrival_weight: ["255", 255], enrollment_date: "2026-05-09" } },
        { key: "screening", status: "reviewed", values: {
          screening_date: "2026-05-09", dart_score: "2", screening_temp: ["40.3", 40.3],
          visual_brd_signs: ["Cough", "Drooped ears"], days_on_feed: ["1", 1],
          prior_brd_treatment: "No", inclusion_met: "Yes", eligible: "Yes", randomized_arm: "T02" } },
        { key: "treatment", status: "reviewed", values: {
          treatment_datetime: "2026-05-09", body_weight_dosing: ["255", 255], test_article: "T02 Reference",
          dose_mg_kg: ["2.5", 2.5], volume_ml: ["19", 19], route: "SC", injection_site: ["Right neck"],
          volume_per_site: ["19", 19], lot_expiry: "REF-4410 / 2026-12", administered_by: "Elisa Tron", retreatment_flag: "No" } },
        { key: "eos", status: "reviewed", values: {
          completion_date: "2026-06-06", final_body_weight: ["300", 300], clinical_outcome: "Cure",
          final_temp: ["38.6", 38.6], disposition: "Returned to pen" } },
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
--   CX-2501  livestock_group       chicken   Site → Room → Pen   (broiler pens, 4 arms)
--   BR-2502  livestock_individual  cattle    Site → Barn → Pen → Animal (age-class HR validation)
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
  ('cattle','heart_rate',48,84,'bpm'),  ('cattle','heart_rate_adult',48,84,'bpm'), ('cattle','heart_rate_calf',100,140,'bpm'), ('cattle','temperature',38.0,39.3,'°C'),  ('cattle','respiratory_rate',26,50,'breaths/min'),  ('cattle','weight',200,900,'kg'),
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
