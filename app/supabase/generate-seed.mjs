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

// ── Clinical field hints + soft edit-checks (BR DART · CA CADESI / PVAS / ePRO) ──
const withHint = (f, hint) => ({ ...f, validation: { ...(f.validation || {}), hint } });
const DART_HINT = "DART score: 0 = Normal · 1 = Mild (1 clinical sign) · 2 = Moderate (2 signs, reduced feed/water intake) · 3 = Severe (≥3 signs or recumbent)";
const CADESI_HINT = "Enter the calculated total score from the CADESI-04 scoring worksheet (0–180). Score >120 is unusual — verify with investigator.";
const CADESI_MSG = "CADESI-04 score >120 is unusual. Please verify with the investigator before proceeding.";
const PVAS_HINT = "0 = No itching (normal dog) · 10 = Extremely severe itching. Owner-reported — transcribed by investigator from diary card.";
const EPRO_HINT = "Enter % from owner portal or paper diary card. ePRO = Electronic Patient-Reported Outcome, collected by owner between visits.";
const dartSel = (code, label) => withHint(sel(code, label, ["0", "1", "2", "3"]), DART_HINT);
// CADESI-04 is valid 0–180, but a score >120 is unusual → a SOFT edit-check (query,
// non-blocking) at max 120 with a custom "verify with investigator" message.
const cadesi = (code, label, req = false) =>
  ({ code, label, type: "number", req, validation: { min: 0, max: 120, onViolation: "query", hint: CADESI_HINT, message: CADESI_MSG } });
const cadesiWorksheet = () => withHint(file("cadesi04_worksheet", "CADESI-04 worksheet"), "Upload completed scoring worksheet");
// CADESI-04 total + collapsible lesion-type breakdown. Canonical CADESI-04 (Olivry
// et al., ICADA 2014) scores THREE lesion types — erythema, lichenification, and
// alopecia/excoriation (combined) — at 0–3 across 20 body sites, so each lesion type
// maxes at 0–60 (20 × 3) and the three sum to 180. The total is the primary field
// (enter directly OR expand to score by lesion type); each subtotal renders its 0–60
// range inline and carries a soft (query) edit check at 60. The >120 total guard stays.
const CADESI_TOTAL_HINT = "Enter total directly (0–180) OR expand to score by lesion type (each 0–60).";
const CADESI_SUB_MSG = "Subtotal exceeds the maximum for this lesion type (0–60) — verify.";
const cadesiSub = (code, label) =>
  ({ code, label: `${label} (0–60)`, type: "integer", req: false, validation: { min: 0, max: 60, onViolation: "query", cadesiSub: true, message: CADESI_SUB_MSG, hint: `Score 0–3 across 20 body sites (0–60)` } });
const cadesiBlock = (req = false) => [
  { code: "cadesi04_score", label: "CADESI-04 score", type: "number", req, validation: { min: 0, max: 120, onViolation: "query", hint: CADESI_TOTAL_HINT, message: CADESI_MSG, cadesiTotal: true } },
  cadesiSub("cadesi_erythema", "Erythema"),
  cadesiSub("cadesi_lichenification", "Lichenification"),
  cadesiSub("cadesi_alopecia_excoriation", "Alopecia / Excoriation"),
  cadesiWorksheet(),
];
// "Recommended action" derived from a DART clinical-illness score on the same form
// (item 3). A calculated read-only field; SubjectRecord renders it as a coloured
// info banner (blue 0–1, amber 2, red 3). dartSource = the DART field's code.
const dartAction = (dartCode) =>
  ({ code: "dart_recommended_action", label: "Recommended action", type: "calculated", validation: { readonlyAuto: true, dartSource: dartCode } });
// "Overall eligibility status" — a calculated verdict over a form's I/E criteria
// (item 4). Last field on an Eligibility / Screening form; rendered as a green/red
// banner. Logic lives in SubjectRecord (any exclusion=Yes / inclusion=No → fail).
const eligibilityStatus = () =>
  ({ code: "overall_eligibility", label: "Overall eligibility status", type: "calculated", validation: { readonlyAuto: true, overallEligibility: true } });
// PVAS is owner-reported, so each PVAS field is coupled with an "Owner diary date"
// (the date the owner recorded the score in their diary — it may predate the visit).
// Required wherever the PVAS itself is required (baseline + EOS).
const PVAS_DIARY_HINT = "Date the owner recorded this score in their diary; PVAS is owner-reported and may predate the visit (transcribed by the investigator from the diary card).";
const pvas = (code, label, req = false) => [
  withHint(rng(code, label, 0.0, 10.0, null, req), PVAS_HINT),
  withHint(date("pvas_diary_date", "Owner diary date", req), PVAS_DIARY_HINT),
];

// ── Field-level conditional display + read-only auto fields ──
// Show a field only when another field's value equals `equals` (same form first,
// else any value the subject carries for that code).
const showIf = (f, code, equals) => ({ ...f, validation: { ...(f.validation || {}), showIf: { code, equals } } });
// Read-only "Protocol version" — auto-populated per study (resolved in calcValue),
// rendered as a calculated / AUTO field. First field on visit / monitoring forms.
const protocolVersion = () => ({ code: "protocol_version", label: "Protocol version", type: "calculated", validation: { readonlyAuto: true } });
// PH-2401 GCP counter-signature for investigational-product (feed additive)
// administration. The verify boolean is required for T02 (phytogenic) pens only;
// the verifier name + timestamp auto-populate once verified (T02 arm = "T02 Phytogenic").
const FEED_VERIFY_HINT = "GCP requires independent verification of investigational product administration. A second person must confirm the additive was added to the ration.";
const feedAdditiveVerification = () => [
  showIf(withHint({ code: "additive_verified", label: "Feed additive verified by second observer", type: "radio", options: ["Yes", "No"], req: true }, FEED_VERIFY_HINT), "treatment_arm", "T02 Phytogenic"),
  showIf({ code: "verifier_name", label: "Verifier name", type: "calculated", validation: { readonlyAuto: true } }, "additive_verified", "Yes"),
  showIf({ code: "verification_timestamp", label: "Verification timestamp", type: "calculated", validation: { readonlyAuto: true } }, "additive_verified", "Yes"),
];

// Tag a list of fields with a named in-form section (rendered as a divider in
// the Subject Record). Merges into any existing validation so vitals/criteria
// keep their rules. Concatenate several sec() calls to lay out a form's sections.
const sec = (name, fields) =>
  fields.map((f) => ({ ...f, validation: { ...(f.validation || {}), section: name } }));

// ─── Tree node builders ──────────────────────────────────────────────────────
const grp = (name, children) => ({ name, children });
const leaf = (key, name, fields) => ({ key, name, fields });
const alone = (key, name, fields) => ({ key, name, fields, standalone: true });
// A leaf marked batch_eligible — surfaced in the Batch Entry feature (fill one
// form for many animals at once; veterinary pen/herd monitoring). The flag rides
// on the form row (forms.batch_eligible).
const batchLeaf = (key, name, fields) => ({ key, name, fields, batch_eligible: true });
// Recurring visit forms — instead of one form with an "Assessment day" selector,
// emit one individual form PER visit day (its own sidebar item, status icon,
// query badge and SDV shield). The visit day is embedded in the form name; the
// Subject Record shows it as a read-only "Assessment day" display (no Δ).
const recurring = (baseKey, baseName, days, fields) =>
  days.map((d) => leaf(`${baseKey}_d${d}`, `${baseName} — Day ${d}`, fields));
// Visit-day schedules for the recurring forms.
const PH_VISIT_DAYS = [7, 14, 21, 28, 35, 42];
const BR_VITAL_DAYS = [0, 3, 7, 14, 28];
const BR_RESPONSE_DAYS = [3, 7, 14, 28];

const RAND_METHOD = ["Computer-generated", "Envelope", "IVRS"];

// ── PH-2401 weekly visit field sets (shared by all 6 week sub-groups) ──────────
const PH_BW_FIELDS = [
  protocolVersion(),
  ...sec("Visit Information", [
    date("weighing_date", "Weighing date", true),
    calc("visit_within_window", "Visit within window"),
  ]),
  ...sec("Weight Assessment", [
    num("birds_alive", "Birds alive at weighing"),
    num("cumulative_mortality", "Cumulative mortality to date"),
    num("total_pen_weight", "Total pen weight", "kg", true),
    calc("avg_body_weight", "Average body weight", "g/bird"),
    num("bw_sd", "Body weight SD", "g"),
    calc("bw_cv", "Body weight CV", "%"),
    calc("previous_pen_weight", "Previous pen weight", "kg"),
    calc("weight_gain", "Weight gain since last visit", "kg"),
  ]),
  ...sec("Feed Tracking", [
    num("beginning_feed_inventory", "Beginning feed inventory", "kg"),
    num("feed_added", "Feed added this period", "kg"),
    calc("total_feed_available", "Total feed available", "kg"),
    num("feed_weighback", "Feed weigh-back", "kg"),
    calc("feed_consumed", "Feed consumed this period", "kg"),
    calc("ending_feed_inventory", "Ending feed inventory", "kg"),
  ]),
  ...sec("Feed Additive Administration", feedAdditiveVerification()),
  ...sec("Water Consumption", [
    num("water_meter_reading", "Water meter reading", "L"),
    calc("water_consumed", "Water consumed this period", "L"),
  ]),
  ...sec("Performance Metrics", [
    calc("fcr_this_period", "FCR this period"),
    calc("cumulative_fcr", "Cumulative FCR"),
    txt("weighed_by", "Weighed by"),
  ]),
];
const PH_FH_FIELDS = [
  protocolVersion(),
  ...sec("Flock Health", [
    date("observation_date", "Observation date", true),
    sel("flock_uniformity", "Flock uniformity", ["Good", "Fair", "Poor"]),
    sel("flock_activity", "Flock activity level", ["Very active", "Normal", "Reduced", "Depressed"]),
    sel("feed_intake_appearance", "Feed intake appearance", ["Normal", "Reduced", "Excessive"]),
    sel("water_intake_appearance", "Water intake appearance", ["Normal", "Reduced", "Excessive"]),
    yn("respiratory_signs", "Respiratory signs present"),
    ta("respiratory_description", "Respiratory signs description"),
  ]),
  ...sec("Litter & Environment", [
    num("litter_condition_score", "Litter condition score"),
    sel("litter_moisture", "Litter moisture", ["Dry", "Slightly moist", "Moist", "Wet"]),
    yn("caking_present", "Caking present"),
    yn("footpad_dermatitis", "Footpad dermatitis present"),
    num("footpad_prevalence", "Footpad dermatitis prevalence", "%"),
  ]),
  ...sec("Mortality Summary", [
    num("mortality_since_last", "Mortality since last observation"),
    num("culls_since_last", "Culls since last observation"),
    msel("clinical_signs", "Clinical signs", ["Huddling", "Ruffled feathers", "Lethargy", "Pale comb", "Diarrhea", "Gasping", "Other"]),
    ta("action_taken", "Action taken"),
    txt("observer", "Observer"),
  ]),
];
// One nested sub-group per week: Week N — Day D → { Body Weight, Flock Health }.
const PH_WEEK_GROUPS = PH_VISIT_DAYS.map((d, i) =>
  grp(`Week ${i + 1} — Day ${d}`, [
    leaf(`body_weight_d${d}`, `Body Weight & Feed — Day ${d}`, PH_BW_FIELDS),
    leaf(`flock_health_d${d}`, `Flock Health & Litter — Day ${d}`, PH_FH_FIELDS),
  ]),
);
// Read-only auto-generated rollup across all completed weekly visits. The fields
// below are the overall-summary footer; the per-week table is rendered above it
// (computed, not stored). A standalone top-level form (no group wrapper).
const PH_PRODUCTION_SUMMARY = leaf("production_summary", "Production Summary", [
  calc("birds_placed", "Birds Placed"),
  calc("current_birds_alive", "Current Birds Alive"),
  calc("total_mortality", "Total Mortality"),
  calc("cumulative_mortality_pct", "Cumulative Mortality", "%"),
  calc("total_feed_consumed", "Total Feed Consumed", "kg"),
  calc("overall_fcr", "Overall FCR"),
  calc("overall_adg", "Overall ADG", "g/bird/day"),
  calc("livability_pct", "Livability", "%"),
  calc("epef", "EPEF"),
]);

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 1 — PH-2401  Phytogenic Feed Additive Broiler Growth Performance Trial
// chicken / livestock_group. Pen = subject. Weekly Production Monitoring nests
// 6 week sub-groups (each Body Weight + Flock Health) + a Production Summary.
// one BARN-scoped form (Daily Environmental Log, rendered on the House record).
// ═══════════════════════════════════════════════════════════════════════════
const PH_TREE = [
  grp("Pen Setup", [
    leaf("pen_setup", "Pen Demographics & Setup", [
      ...sec("Pen Identification", [
        txt("pen_id", "Pen ID", true),
        num("pen_number", "Pen number"),
        sel("house_barn", "House / barn", ["House A"]),
        num("floor_area_m2", "Floor area", "m²", true),
      ]),
      ...sec("Bird Information", [
        num("birds_placed", "Birds placed", null, true),
        calc("stocking_density", "Stocking density", "birds/m²"),
        calc("stocking_density_flag", "Stocking density welfare flag"),
        sel("breed_strain", "Breed / strain", ["Ross 308", "Cobb 500", "Ross 708"]),
        sel("sex", "Sex", ["As-hatched", "Male", "Female"]),
        date("hatch_date", "Hatch date", true),
        txt("source_hatchery", "Source hatchery"),
        date("placement_date", "Placement date", true),
        calc("age_at_placement", "Age at placement", "days"),
      ]),
      ...sec("Treatment & Block", [
        sel("treatment_arm", "Treatment arm", ["T01 Control", "T02 Phytogenic"], true),
        num("randomization_block", "Randomization block"),
      ]),
      ...sec("Housing", [
        sel("litter_type", "Litter type", ["Wood shavings", "Rice hulls", "Straw"]),
        num("litter_depth", "Litter depth", "cm"),
        sel("litter_scoring_system", "Litter scoring system", ["Ekstrand 1-5", "Payne 0-4", "EU Directive 0-2"]),
        sel("feeder_type", "Feeder type", ["Tube", "Pan", "Chain"]),
        sel("drinker_type", "Drinker type", ["Nipple", "Bell", "Cup"]),
        ta("notes", "Notes"),
      ]),
    ]),
    leaf("randomization", "Randomization & Arm Assignment", [
      ...sec("Randomization", [
        date("randomization_date", "Randomization date", true),
        sel("randomization_method", "Randomization method", ["Computer-generated list", "Envelope", "Other"]),
        num("block_number", "Block number"),
        sel("assigned_arm", "Assigned arm", ["T01 Control", "T02 Phytogenic"], true),
        txt("test_article_lot", "Test article lot number"),
        num("additive_inclusion_rate", "Additive inclusion rate", "%"),
        txt("randomized_by", "Randomized by"),
      ]),
      ...sec("Assignment Confirmation", [
        yn("assignment_confirmed", "Assignment confirmed", true),
        ta("notes", "Notes"),
      ]),
      ...sec("Treatment Verification", feedAdditiveVerification()),
    ]),
    leaf("feed_setup", "Feed & Ration Setup", [
      ...sec("Feed Identification", [
        txt("feed_supplier", "Feed supplier"),
        txt("feed_lot_number", "Feed lot number", true),
        sel("feed_form", "Feed form", ["Mash", "Crumble", "Pellet"]),
        sel("feed_phase", "Feed phase", ["Starter D0-10", "Grower D11-24", "Finisher D25-42"]),
        date("feed_delivery_date", "Feed delivery date"),
        num("initial_feed_inventory", "Initial feed inventory per pen", "kg", true),
        yn("feed_quality_check", "Feed quality check performed"),
        sel("mycotoxin_result", "Mycotoxin screen result", ["Pass", "Fail", "Not performed"]),
      ]),
      ...sec("Nutritional Specification", [
        num("crude_protein", "Crude protein", "%"),
        num("metabolizable_energy", "Metabolizable energy", "kcal/kg"),
        ta("notes", "Notes"),
      ]),
      ...sec("Feed Additive Administration", feedAdditiveVerification()),
    ]),
  ]),
  grp("Placement / Day 0", [
    leaf("baseline_d0", "Day 0 Baseline Weights & Feed", [
      ...sec("Placement Weights", [
        date("weighing_date", "Weighing date", true),
        num("birds_alive", "Birds alive at weighing"),
        num("total_pen_weight", "Total pen weight", "kg", true),
        calc("avg_body_weight", "Average body weight", "g/bird"),
        num("bw_sd", "Body weight SD", "g"),
        calc("bw_cv", "Body weight CV", "%"),
      ]),
      ...sec("Feed Inventory", [
        num("beginning_feed_inventory", "Beginning feed inventory", "kg"),
        num("water_meter_reading", "Water meter reading", "L"),
      ]),
      ...sec("Initial Observations", [
        sel("flock_behavior", "Flock behavior", ["Normal", "Abnormal"]),
        ta("observations", "Observations"),
        txt("weighed_by", "Weighed by"),
      ]),
    ]),
  ]),
  // The 6 week groups sit at the top level (each Body Weight + Flock Health),
  // followed by the standalone read-only Production Summary.
  ...PH_WEEK_GROUPS,
  PH_PRODUCTION_SUMMARY,
  grp("Event Records", [
    leaf("mortality_cull", "Mortality & Cull Record", [
      ...sec("Event Details", [
        date("event_date", "Event date", true),
        sel("assessment_day", "Assessment day", ["D0", "D7", "D14", "D21", "D28", "D35", "D42", "Daily"]),
        num("death_count", "Death count", null, true),
        num("cull_count", "Cull count"),
      ]),
      ...sec("Cause Assessment", [
        sel("cause_deaths", "Cause — deaths", ["Unknown", "Ascites", "Sudden death syndrome", "Leg disorder", "Respiratory", "Other"]),
        sel("cause_culls", "Cause — culls", ["Leg disorder", "Poor growth", "Injury", "Respiratory", "Other"]),
        yn("gross_lesions", "Gross lesions observed"),
        ta("lesion_description", "Lesion description"),
        txt("recorded_by", "Recorded by"),
      ]),
    ]),
    leaf("adverse_event", "Adverse Event", [
      ...sec("Event Details", [
        date("ae_onset_date", "AE onset date", true),
        sel("event_type", "Event type", ["Unexpected mortality", "Morbidity outbreak", "Equipment failure", "Environmental", "Other"]),
        num("birds_affected", "Birds affected"),
        ta("description", "Description", true),
      ]),
      ...sec("Assessment", [
        coded("veddra_term", "VeDDRA coded term"),
        sel("severity", "Severity", ["Mild", "Moderate", "Severe"]),
        sel("relationship", "Relationship to test article", ["Related", "Possibly related", "Unlikely", "Unrelated"]),
        yn("sae_flag", "SAE flag"),
      ]),
      ...sec("Resolution", [
        ta("action_taken", "Action taken"),
        sel("outcome", "Outcome", ["Resolved", "Ongoing", "Fatal"]),
        date("resolution_date", "Resolution date"),
        txt("reported_to", "Reported to"),
      ]),
    ]),
  ]),
  grp("Study Closeout", [
    leaf("final_processing", "Final Processing & Summary", [
      ...sec("Processing Information", [
        date("processing_date", "Processing date", true),
        txt("processing_facility", "Processing facility", true),
        txt("data_collected_by", "Data collected by"),
      ]),
      ...sec("Live Performance", [
        num("birds_sent", "Birds sent to processing"),
        num("total_live_weight", "Total live weight at processing", "kg"),
        calc("avg_live_weight", "Average live weight", "g/bird"),
      ]),
      ...sec("Carcass Yield", [
        num("total_carcass_weight", "Total carcass weight", "kg"),
        calc("carcass_yield_pct", "Carcass yield", "%"),
        num("breast_meat_weight", "Breast meat weight", "kg"),
        calc("breast_yield_pct", "Breast yield", "%"),
        num("wing_yield_pct", "Wing yield", "%"),
        num("leg_quarter_yield_pct", "Leg quarter yield", "%"),
        num("condemnations_whole", "Condemnations whole bird"),
        calc("condemnation_rate", "Condemnation rate", "%"),
        msel("condemnation_reason", "Condemnation reason", ["Airsacculitis", "Septicemia", "Contamination", "Cadaver", "Other"]),
      ]),
      ...sec("Summary Metrics", [
        calc("total_mortality", "Total mortality study period"),
        calc("livability_pct", "Overall livability", "%"),
        calc("total_feed_consumed", "Total feed consumed study", "kg"),
        calc("overall_fcr", "Overall FCR"),
        calc("adg", "Average daily gain", "g/bird/day"),
        calc("epef", "EPEF"),
        txt("investigator_signoff", "Investigator sign-off"),
      ]),
    ]),
    leaf("reconciliation", "Study Reconciliation", [
      ...sec("Bird Reconciliation", [
        date("reconciliation_date", "Reconciliation date", true),
        calc("birds_placed", "Birds placed"),
        calc("total_deaths", "Total deaths"),
        calc("total_culls", "Total culls"),
        num("birds_processed", "Birds processed"),
        calc("bird_reconciliation_check", "Bird reconciliation check"),
      ]),
      ...sec("Feed Reconciliation", [
        num("total_feed_delivered", "Total feed delivered", "kg"),
        calc("total_feed_consumed", "Total feed consumed", "kg"),
        num("feed_remaining", "Feed remaining", "kg"),
        calc("feed_reconciliation_check", "Feed reconciliation check"),
      ]),
      ...sec("Data Completeness", [
        calc("forms_completed", "Forms completed"),
        calc("forms_open_queries", "Forms with open queries"),
        calc("forms_open_edit_checks", "Forms with open edit checks"),
        yn("reconciliation_complete", "Reconciliation complete"),
        ta("discrepancy_notes", "Discrepancy notes"),
        txt("reconciled_by", "Reconciled by"),
      ]),
    ]),
  ]),
];

// Barn/house-scoped forms — rendered on the House Record (Forms + Overview tabs),
// NOT the pen sidebar. Static ranges auto-raise edit checks (temp 18-24 °C,
// humidity 40-70 %, CO2 ≤3000 ppm, ammonia ≤25 ppm welfare threshold).
const PH_BARN_FORMS = [
  leaf("daily_env_log", "Daily Environmental Log", [
    ...sec("Temperature & Humidity", [
      date("log_date", "Log date", true),
      rng("temp_morning", "Morning temperature", 18, 24, "°C"),
      rng("temp_evening", "Evening temperature", 18, 24, "°C"),
      rng("rh_morning", "Morning relative humidity", 40, 70, "%"),
      rng("rh_evening", "Evening relative humidity", 40, 70, "%"),
    ]),
    ...sec("Air Quality", [
      rng("co2_ppm", "CO₂", 0, 3000, "ppm"),
      rng("ammonia_ppm", "Ammonia", 0, 25, "ppm"),
      num("ventilation_rate", "Ventilation rate", "m³/h"),
    ]),
    ...sec("Equipment Status", [
      yn("hvac_normal", "Heating/cooling system normal"),
      ta("equipment_issues", "Equipment issues"),
      txt("recorded_by", "Recorded by"),
    ]),
  ]),
  // Feed Delivery Log — repeating
  leaf("feed_delivery", "Feed Delivery Log", [
    date("delivery_date", "Delivery date", true),
    txt("feed_lot_number", "Feed lot number", true),
    txt("supplier", "Supplier"),
    sel("feed_phase", "Feed phase", ["Starter", "Grower", "Finisher"]),
    num("quantity_kg", "Quantity delivered", "kg", true),
    num("bags_units", "Bags / units"),
    yn("quality_check", "Quality check performed"),
    sel("mycotoxin_screen", "Mycotoxin screen", ["Pass", "Fail", "Not performed"]),
    yn("coa_received", "Certificate of analysis received"),
    txt("received_by", "Received by"),
  ]),
  // Equipment Calibration Log — repeating (rendered in the Overview tab)
  leaf("equipment_calibration", "Equipment Calibration Log", [
    sel("equipment_name", "Equipment", ["Platform scale", "Hanging scale", "Thermometer", "Hygrometer", "Ammonia monitor", "CO2 monitor", "Water meter"]),
    txt("serial_number", "Serial number"),
    date("last_calibration", "Last calibration date", true),
    date("next_due", "Next calibration due", true),
    txt("certificate_ref", "Calibration certificate reference"),
    txt("calibrated_by", "Calibrated by"),
  ]),
  // House/Barn Close-out — one-time, sectioned
  leaf("house_closeout", "House/Barn Close-out", [
    ...sec("Bird Reconciliation", [
      date("closeout_date", "Close-out date", true),
      yn("bird_count_reconciled", "Final bird count reconciled", true),
      yn("mortality_complete", "All mortality records complete", true),
    ]),
    ...sec("Feed & Equipment", [
      yn("feed_accounted", "All feed accounted for", true),
      yn("equipment_returned", "Equipment cleaned and returned", true),
      yn("equipment_recalibrated", "Equipment recalibrated after use", true),
    ]),
    ...sec("Facility", [
      date("cleanout_completed", "House cleanout completed", true),
      yn("disinfection_completed", "Disinfection completed", true),
      num("downtime_days", "Downtime before next flock", "days"),
    ]),
    ...sec("Sign-off", [
      ta("outstanding_issues", "Outstanding issues"),
      txt("investigator_signoff", "Investigator sign-off"),
      txt("completed_by", "Completed by"),
    ]),
  ]),
];

// Site-scoped forms — shared by EVERY study (every study has sites). Rendered on
// the Site Record (Forms tab) except Continuing Review, shown in the Overview
// Regulatory card. Repeating logs (staff, monitoring, amendments, continuing
// review) use the slide-in panel; SIV + Close-out are one-time sectioned forms.
const SITE_FORMS = [
  leaf("siv", "Site Initiation Visit (SIV) Checklist", [
    ...sec("Facility Assessment", [
      date("siv_date", "SIV date", true),
      txt("siv_conducted_by", "SIV conducted by"),
      yn("facility_adequate", "Facility adequate for study", true),
      yn("storage_adequate", "Adequate storage for investigational product", true),
      yn("temp_monitoring", "Temperature monitoring in place", true),
    ]),
    ...sec("Staff & Training", [
      yn("staff_gcp_trained", "Staff GCP trained", true),
      yn("protocol_training", "Protocol training completed", true),
    ]),
    ...sec("Regulatory Documents", [
      yn("irb_approval", "IRB/IEC approval on file", true),
      yn("icf_approved", "Informed consent forms approved", true),
    ]),
    ...sec("Investigational Product", [
      yn("ip_received", "Investigational product received", true),
      yn("ip_storage_confirmed", "IP storage conditions confirmed", true),
    ]),
    ...sec("EDC & Systems", [
      yn("edc_access", "EDC access granted to site staff", true),
      yn("edc_training", "EDC training completed", true),
    ]),
    ...sec("Sign-off", [
      calc("all_satisfactory", "All items satisfactory"),
      ta("outstanding_items", "Outstanding items"),
      yn("site_approved_to_enroll", "Site approved to enroll", true),
      txt("investigator_signoff", "Investigator sign-off"),
      txt("cra_signoff", "CRA sign-off"),
    ]),
  ]),
  leaf("staff_delegation", "Site Staff & Delegation Log", [
    txt("staff_name", "Staff name", true),
    sel("role", "Role", ["PI", "Sub-Investigator", "CRC", "CRA", "Pharmacist", "Lab Technician", "Other"]),
    date("gcp_training_date", "GCP training date", true),
    date("gcp_expiry", "GCP training expiry", true),
    date("protocol_training_date", "Protocol training date", true),
    txt("protocol_training_version", "Protocol training version"),
    msel("delegated_tasks", "Delegated tasks", ["Data Entry", "Query Response", "SDV", "Drug Dispensing", "Consent", "Sample Collection"]),
    yn("signature_authority", "Signature authority"),
    yn("active_at_site", "Active at site"),
  ]),
  leaf("monitoring_visits", "Monitoring Visit Reports", [
    date("visit_date", "Visit date", true),
    sel("visit_type", "Visit type", ["Site Initiation", "Routine Monitoring", "Close-out", "For Cause"]),
    txt("cra_name", "CRA name"),
    num("subjects_reviewed", "Subjects reviewed"),
    ta("findings_summary", "Findings summary"),
    ta("action_items", "Action items"),
    yn("followup_required", "Follow-up required"),
    date("followup_due", "Follow-up due date"),
    yn("report_submitted", "Report submitted"),
    date("report_date", "Report date"),
  ]),
  leaf("protocol_amendments", "Protocol Amendments", [
    txt("protocol_version", "Protocol version", true),
    date("amendment_date", "Amendment date", true),
    ta("amendment_summary", "Amendment summary", true),
    date("iec_approval_date", "IEC approval date for amendment", true),
    txt("iec_approval_ref", "IEC approval reference"),
    sel("subjects_affected", "Subjects affected", ["All", "Newly enrolled only", "None"]),
    date("implemented_date", "Amendment implemented date"),
    txt("implemented_by", "Implemented by"),
    sel("status", "Status", ["Pending IEC", "Approved", "Implemented"]),
  ]),
  leaf("continuing_review", "Continuing Review", [
    date("review_date", "Review date", true),
    date("renewed_until", "Renewed until"),
    sel("outcome", "Outcome", ["Approved", "Approved with modifications", "Pending", "Not approved"]),
  ]),
  leaf("site_closeout", "Site Close-out", [
    ...sec("Data Reconciliation", [
      date("closeout_date", "Close-out date", true),
      txt("closeout_by", "Close-out visit conducted by"),
      yn("queries_resolved", "All data queries resolved", true),
      yn("reconciliation_complete", "Final data reconciliation complete", true),
    ]),
    ...sec("Investigational Product", [
      num("ip_returned", "IP returned quantity"),
      num("ip_destroyed", "IP destroyed quantity"),
      yn("ip_accountability", "IP accountability complete", true),
    ]),
    ...sec("Regulatory", [
      yn("regulatory_archived", "Regulatory documents archived", true),
      yn("closeout_visit_complete", "Site close-out visit completed", true),
    ]),
    ...sec("Sign-off", [
      ta("outstanding_issues", "Outstanding issues"),
      txt("investigator_signoff", "Investigator sign-off"),
      txt("sponsor_signoff", "Sponsor sign-off"),
    ]),
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 2 — BR-2502  Bovine Respiratory Disease Treatment Trial (cattle, individual)
// 8 individual-level forms. Heart rate uses AGE-CLASS validation (calf vs adult).
// ═══════════════════════════════════════════════════════════════════════════
// Shared field sets for the recurring visit forms (Vital Signs + Clinical
// Response). Marked batch_eligible so they appear in the Batch Entry grid.
const BR_VITAL_FIELDS = [
  protocolVersion(),
  ...sec("Visit Information", [
    date("visit_date", "Visit date", true),
    calc("visit_within_window", "Visit within window"),
  ]),
  ...sec("Vital Signs", [
    vital("rectal_temp", "Rectal temperature", "temperature", "°C"),
    vitalAge("heart_rate", "Heart rate", "heart_rate", "bpm"),
    vital("resp_rate", "Respiratory rate", "respiratory_rate", "breaths/min"),
  ]),
  ...sec("Clinical Assessment", [
    dartSel("clinical_illness_score", "Clinical Illness Score (DART)"),
    dartAction("clinical_illness_score"),
    sel("attitude", "Attitude / Demeanor", ["Bright", "Quiet", "Depressed", "Recumbent"]),
    sel("hydration", "Hydration status", ["Normal", "Mild dehydration", "Moderate dehydration", "Severe dehydration"]),
    sel("bcs", "Body condition score", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
    sel("appetite", "Appetite", ["Normal", "Reduced", "None"]),
    ta("notes", "Notes"),
  ]),
];
const BR_RESPONSE_FIELDS = [
  protocolVersion(),
  date("visit_date", "Visit date", true),
  dartSel("clinical_illness_score", "Clinical Illness Score"),
  sel("response_vs_baseline", "Response vs baseline", ["Improved", "No change", "Worsened"]),
  yn("temperature_normalized", "Temperature normalized (< 40.0 °C)"),
  yn("treatment_success_interim", "Treatment success (interim)"),
  yn("requires_retreatment", "Requires re-treatment"),
  txt("assessor", "Assessor"),
];
// Day 0 has no baseline yet → no "Response vs baseline"; a simpler assessment set.
const BR_RESPONSE_FIELDS_D0 = [
  protocolVersion(),
  date("visit_date", "Visit date", true),
  dartSel("clinical_illness_score", "Clinical Illness Score"),
  sel("attitude", "Attitude / Demeanor", ["Bright", "Quiet", "Depressed", "Recumbent"]),
  sel("hydration", "Hydration status", ["Normal", "Mild dehydration", "Moderate dehydration", "Severe dehydration"]),
  sel("bcs", "Body condition score", ["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
  sel("appetite", "Appetite", ["Normal", "Reduced", "None"]),
  ta("notes", "Notes"),
];
// One visit-day group (B–F): Vital Signs + Clinical Response, both batch_eligible.
const brVisitGroup = (day) => grp(`Visit Day ${day}`, [
  batchLeaf(`vital_signs_d${day}`, `Vital Signs — Day ${day}`, BR_VITAL_FIELDS),
  batchLeaf(`clinical_response_d${day}`, `Clinical Response — Day ${day}`, day === 0 ? BR_RESPONSE_FIELDS_D0 : BR_RESPONSE_FIELDS),
]);

const BR_TREE = [
  // ── Group A — Enrollment & Randomization (one-time) ──
  grp("Enrollment & Randomization", [
    leaf("screening", "Screening / BRD Case Definition", [
      date("screening_date", "Screening date", true),
      dartSel("dart_score", "Clinical illness score (DART)"),
      dartAction("dart_score"),
      rng("screening_temp", "Rectal temperature", 35, 43, "°C"),
      calc("meets_temp_criterion", "Meets temperature criterion (≥ 40.0)"),
      msel("visual_brd_signs", "Visual BRD signs", ["Nasal discharge", "Cough", "Lethargy", "Drooped ears", "Other"]),
      num("days_on_feed", "Days on feed"),
      yn("prior_brd_treatment", "Prior BRD treatment"),
      yn("inclusion_met", "Inclusion criteria met"),
      msel("exclusion_criteria", "Exclusion criteria", ["Pregnant", "Chronic illness", "Concurrent illness", "Prior treatment", "Other"]),
      crit("eligible", "Eligible"),
      sel("randomized_arm", "Randomized arm", ["T01", "T02", "T03"]),
      eligibilityStatus(),
    ]),
    leaf("demographics", "Animal Demographics", [
      txt("animal_id", "Animal ID / ear tag", true),
      txt("eid_rfid", "EID / RFID"),
      sel("sex", "Sex", ["Steer", "Heifer", "Bull"]),
      sel("breed_type", "Breed / type", ["Angus", "Hereford", "Simmental", "Cross", "Other"]),
      num("age_months", "Estimated age", "months"),
      num("arrival_weight", "Arrival body weight", "kg"),
      date("arrival_date", "Arrival date"),
      date("enrollment_date", "Enrollment date", true),
    ]),
    leaf("randomization", "Randomization & Allocation", [
      date("randomization_date", "Randomization date", true),
      num("block_number", "Block number"),
      sel("assigned_arm", "Assigned arm", ["T01", "T02", "T03"]),
      txt("allocation_number", "Allocation kit / number"),
      txt("randomized_by", "Randomized by"),
      yn("blinding_maintained", "Blinding maintained"),
    ]),
    leaf("treatment", "Treatment Administration", [
      ...sec("Drug Information", [
        num("body_weight_dosing", "Body weight at dosing", "kg", true),
        { code: "test_article", label: "Test article", type: "select", options: ["T01", "T02", "T03"], validation: { autoFromArm: true, hint: "Auto-populated from randomization assignment — cannot be modified." } },
        num("dose_mg_kg", "Dose", "mg/kg"),
        calc("total_dose", "Total dose", "mg"),
        num("volume_ml", "Volume", "mL"),
      ]),
      ...sec("Administration", [
        sel("route", "Route", ["SC", "IM", "IV"]),
        msel("injection_site", "Injection site", ["Left neck", "Right neck"]),
        txt("lot_expiry", "Lot / expiry"),
        calc("withdrawal_days", "Withdrawal period", "days"),
        calc("withdrawal_end", "Withdrawal end date"),
        txt("administered_by", "Administered by"),
        yn("retreatment_flag", "Re-treatment flag"),
      ]),
    ]),
  ]),
  // ── Groups B–F — one group per visit day (Vital Signs + Clinical Response) ──
  brVisitGroup(0),
  brVisitGroup(3),
  brVisitGroup(7),
  brVisitGroup(14),
  brVisitGroup(28),
  // ── Group G — Safety & Events (as needed; several repeating) ──
  grp("Safety & Events", [
    leaf("adverse_event", "Adverse Event", [
      ...sec("Event Details", [
        date("ae_onset_date", "AE onset date"),
        ta("event_description", "Event description"),
        sel("body_system", "Body system affected", ["Respiratory", "GI", "Cardiac", "Injection site", "Other"]),
      ]),
      ...sec("Assessment", [
        sel("severity", "Severity", ["Mild", "Moderate", "Severe"]),
        yn("serious_sae", "Serious (SAE)"),
        sel("relationship", "Relationship to test article", ["Related", "Possibly", "Unlikely", "Not related"]),
      ]),
      ...sec("Resolution", [
        sel("action_taken", "Action taken", ["Continued", "Withdrawn", "Treated"]),
        sel("outcome", "Outcome", ["Recovered", "Recovering", "Not recovered", "Fatal"]),
        date("resolution_date", "Resolution date"),
      ]),
    ]),
    leaf("injection_site", "Injection Site Reaction", [
      date("observation_date", "Observation date"),
      sel("injection_site", "Injection site", ["Left neck", "Right neck"]),
      yn("reaction_present", "Reaction present"),
      num("swelling_diameter", "Swelling diameter", "cm"),
      sel("heat_pain", "Heat / pain", ["None", "Mild", "Moderate", "Severe"]),
      sel("grade", "Grade", ["1", "2", "3", "4"]),
      yn("linked_ae", "Linked AE"),
      txt("observer", "Observer"),
    ]),
    leaf("protocol_deviation", "Protocol Deviation", [
      date("deviation_date", "Deviation date"),
      sel("category", "Category", ["Dosing", "Procedure", "Schedule", "Eligibility", "Other"]),
      ta("description", "Description"),
      sel("impact", "Impact", ["None", "Minor", "Major"]),
      ta("corrective_action", "Corrective action"),
      txt("reported_by", "Reported by"),
    ]),
    leaf("retreatment", "Re-treatment / Rescue Therapy", [
      date("date", "Date"),
      sel("reason", "Reason", ["Relapse", "Treatment failure", "Worsening"]),
      vital("rectal_temp", "Rectal temperature", "temperature", "°C"),
      dartSel("clinical_illness_score", "Clinical illness score"),
      sel("rescue_product", "Rescue product", ["Florfenicol", "Tulathromycin", "Other"]),
      txt("dose_route", "Dose / route"),
      yn("treatment_failure", "Classified as treatment failure"),
      yn("removed_from_study", "Removed from study"),
    ]),
    leaf("necropsy", "Necropsy / Post-mortem", [
      date("death_date", "Death date"),
      sel("manner", "Manner", ["Found dead", "Euthanized"]),
      date("necropsy_date", "Necropsy date"),
      txt("performed_by", "Performed by"),
      ta("respiratory_findings", "Respiratory findings"),
      num("lung_consolidation", "Lung consolidation (cranioventral)", "%"),
      sel("lung_lesion_score", "Lung lesion score", ["0", "1", "2", "3", "4"]),
      yn("pleural_adhesions", "Pleural adhesions"),
      ta("other_organ_findings", "Other organ findings"),
      txt("presumptive_cause", "Presumptive cause of death"),
      yn("brd_attributable", "BRD-attributable"),
    ]),
    leaf("sample_collection", "Sample Collection", [
      date("collection_date", "Collection date"),
      msel("sample_type", "Sample type", ["Lung histopath", "Lung culture", "Other tissue"]),
      txt("sample_ids", "Sample IDs"),
      sel("fixative_transport", "Fixative / transport", ["Formalin", "Chilled", "Frozen"]),
      yn("sent_to_lab", "Sent to lab"),
      txt("lab_destination", "Lab destination"),
      txt("collected_by", "Collected by"),
    ]),
  ]),
  // ── Group H — Closeout (one-time) ──
  grp("Closeout", [
    leaf("conmed", "Concomitant Medication Log", [
      date("start_date", "Start date"),
      date("stop_date", "Stop date"),
      txt("medication", "Medication"),
      txt("indication", "Indication"),
      txt("dose_route", "Dose / route"),
      yn("related_to_ae", "Related to AE"),
      yn("prohibited_per_protocol", "Prohibited per protocol"),
      txt("recorded_by", "Recorded by"),
    ]),
    leaf("withdrawal_confirm", "Withdrawal Period Confirmation", [
      date("last_treatment_date", "Last treatment date"),
      num("withdrawal_period_days", "Product withdrawal period", "days"),
      calc("withdrawal_end_date", "Withdrawal end date"),
      calc("eligible_for_shipment", "Eligible for shipment / slaughter"),
      txt("confirmed_by", "Confirmed by"),
    ]),
    leaf("eos", "End of Study / Final Disposition", [
      date("completion_date", "Completion date"),
      calc("days_on_study", "Days on study", "days"),
      num("final_body_weight", "Final body weight", "kg"),
      calc("adg", "Average daily gain", "kg/day"),
      sel("clinical_outcome", "Clinical outcome", ["Cure", "Treatment success", "Treatment failure", "Relapse", "Death", "Removed"]),
      num("final_temp", "Final temperature", "°C"),
      sel("disposition", "Disposition", ["Returned to pen", "Shipped", "Died", "Euthanized"]),
      txt("withdrawal_reason", "Withdrawal reason (if withdrawn)"),
    ]),
  ]),
];

// ═══════════════════════════════════════════════════════════════════════════
// STUDY 3 — CA-0801  Canine Atopic Dermatitis Diet Trial (canine, companion)
// ═══════════════════════════════════════════════════════════════════════════
// Reusable CA-0801 field sets (Follow-Up visits are identical; EOS reuses PE+QOL).
const caFollowupPE = () => [
  protocolVersion(),
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
      ...cadesiBlock(),
      ...pvas("pvas_score", "PVAS score (owner-reported)"),
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
      withHint(rng("epro_completion_pct", "ePRO diary completion", 0, 100, "%"), EPRO_HINT),
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
      ...cadesiBlock(),
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
      eligibilityStatus(),
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
      ...cadesiBlock(true),
      ...pvas("pvas_score", "PVAS score (owner-reported)", true),
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
    leaf("eos_cadesi", "Final CADESI Assessment", cadesiBlock(true)),
    leaf("eos_pvas", "Final PVAS Assessment", [...pvas("pvas_score", "PVAS score", true)]),
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
  // Withdrawal Form — the early-termination record (date + reason). Completion is
  // handled separately on the End of Study form; this form only records a withdrawal.
  alone("withdrawal", "Withdrawal Form", [
    date("withdrawal_date", "Withdrawal date", true),
    sel("withdrawal_reason", "Withdrawal reason", ["Consent withdrawn", "Lost to follow-up", "Adverse event", "Death", "Investigator decision", "Protocol deviation", "Other"], true),
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
    { key: "screen_pe", status: "reviewed", values: { visit_date: "2026-03-02", temperature: ["38.6", 38.6], heart_rate: ["96", 96], respiratory_rate: ["20", 20], body_weight: ["12.4", 12.4], body_condition_score: ["5", 5], general_health: "Normal", significant_findings: "Erythema and excoriation on ventral abdomen and pedal regions; no systemic abnormalities." },
      queries: [
        { field: "heart_rate", title: "Resting heart rate vs prior visit", raise: "Resting heart rate of 96 bpm is higher than the typical resting range for this patient. Confirm the dog was settled at the time of measurement." },
        { field: "respiratory_rate", title: "Respiratory rate plausibility", raise: "Respiratory rate of 20/min recorded during an excited exam — confirm whether this was a true resting measurement.",
          response: "Re-measured after a 5-minute acclimation period; resting respiratory rate confirmed at 20/min. No respiratory abnormality." } ] },
    { key: "screen_derm", status: "reviewed", values: { pruritus_severity: "Severe", lesion_severity: "Moderate", infection_assessment: "Mild", ear_assessment: "Otitis Externa", cadesi04_score: ["58", 58] },
      queries: [
        { field: "cadesi04_score", title: "CADESI-04 vs pruritus severity", raise: "CADESI-04 of 58 is high relative to the recorded lesion severity (Moderate). Please confirm the lesion scoring against the regional map." },
        { field: "ear_assessment", title: "Otitis externa — secondary infection?", raise: "Otitis externa noted. Confirm whether cytology was performed and whether a secondary infection requires concomitant treatment per protocol.",
          response: "Cytology performed — mild Malassezia overgrowth, managed topically; not an exclusionary systemic infection. Documented in the source." } ] },
    { key: "screen_consent", status: "reviewed", values: { consent_signed: "Yes", consent_version: "v2.1", consent_date: "2026-03-02", witness_name: "L. Park, RVT" } },
    { key: "screen_eligibility", status: "reviewed", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "Yes", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Eligible", investigator_approval: "Yes" } },
    { key: "screen_labs", status: "reviewed", values: { cbc: "Normal", chemistry_panel: "Normal", urinalysis: "Normal", investigator_review: "Yes" } },
    { key: "randomization", status: "reviewed", values: { randomization_number: "101-001", treatment_arm: "DermAlliv™ Active", randomization_date: "2026-03-09", drug_kit_assigned: "KIT-1042" } },
    { key: "baseline_clinical", status: "in_work", values: { cadesi04_score: ["58", 58], pvas_score: ["7.2", 7.2], pvas_diary_date: "2026-03-07", disease_severity: "Severe", iga: "4" },
      query: { field: "pvas_score", title: "Baseline PVAS vs owner diary",
        raise: "Baseline owner PVAS of 7.2 is higher than the average of the pre-baseline diary entries (≈5.8). Please confirm the score was transcribed from the correct diary week." },
      queries: [
        { field: "cadesi04_score", title: "Baseline CADESI-04 vs screening", raise: "Baseline CADESI-04 of 58 is identical to the screening value recorded one week earlier. Confirm this was independently re-scored at the baseline visit rather than carried forward.",
          response: "Re-scored independently at baseline by the same assessor; score genuinely unchanged at 58. Source confirms two separate assessments." },
        { field: "iga", title: "IGA vs disease severity", raise: "Investigator Global Assessment recorded as 4 (severe) — confirm this aligns with the CADESI-04 regional findings and the lesion photographs." } ] },
    { key: "drug_dispensation", status: "reviewed", values: { drug_kit_number: "KIT-1042", quantity_dispensed: ["84", 84], dispensation_date: "2026-03-09" },
      queries: [
        { field: "quantity_dispensed", title: "Dispensed quantity vs dosing schedule", raise: "84 units dispensed for an 84-day supply assumes once-daily dosing. Confirm against the protocol dosing schedule and the dog's body weight band.",
          response: "Protocol specifies once-daily dosing; 12.4 kg falls in the single-unit band. 84 units = 84 days confirmed correct.",
          resolution: "Verified against the dosing schedule and dispensation log. Quantity correct — query resolved." } ] },
  ],
  // Bella — completed Screening + Randomization (#2) + End of Study = Completed
  "CA-0801-101-03": [
    { key: "screen_pe", status: "reviewed", values: { visit_date: "2026-02-18", temperature: ["38.5", 38.5], heart_rate: ["88", 88], respiratory_rate: ["18", 18], body_weight: ["31.2", 31.2], body_condition_score: ["6", 6], general_health: "Normal", significant_findings: "Chronic otitis and pedal pruritus; otherwise unremarkable." },
      query: { field: "body_weight", title: "Screening weight vs referral record",
        raise: "Screening weight 31.2 kg differs from the referral record (29.4 kg). Confirm the scale reading and recent weight history.",
        response: "Re-weighed on a calibrated scale at 31.2 kg; owner reports recent weight gain on the current diet. Value confirmed." } },
    { key: "screen_eligibility", status: "reviewed", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "Yes", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Eligible", investigator_approval: "Yes" },
      queries: [
        { field: "chronic_itching_6mo", title: "Duration of pruritus — source support", raise: "Chronic itching ≥6 months marked Yes. Confirm the referral history documents a pruritus onset date supporting the ≥6-month criterion.",
          response: "Referral letter dated 2025-08 documents pruritus onset ~10 months prior to screening. Criterion met; source filed." } ] },
    { key: "randomization", status: "reviewed", values: { randomization_number: "101-003", treatment_arm: "DermAlliv™ Active", randomization_date: "2026-02-25", drug_kit_assigned: "KIT-1051" } },
    { key: "eos_completion", status: "reviewed", values: { completion_status: "Completed", investigator_final: "Subject completed all six visits. CADESI-04 improved 58 → 14 and owner PVAS 7.0 → 2.1 by Day 84. No drug-related adverse events." },
      queries: [
        { field: "investigator_final", title: "End-of-study narrative vs visit data", raise: "Investigator narrative cites a final PVAS of 2.1, but please confirm this matches the Day 84 owner diary entry rather than the clinic-recorded value." } ] },
  ],
  // Charlie — open edit check (out-of-range temperature on Screening PE)
  "CA-0801-102-02": [
    { key: "screen_pe", status: "in_work", values: { visit_date: "2026-03-04", temperature: ["40.1", 40.1], heart_rate: ["112", 112], respiratory_rate: ["24", 24], body_weight: ["34.5", 34.5], body_condition_score: ["5", 5], general_health: "Abnormal" },
      editCheck: { field: "temperature", message: "Temperature 40.1 °C is above the expected range for dogs (38.3–39.2 °C) — verify the thermometer and re-check the patient for pyrexia." } },
  ],
  // Daisy — open manual query (no response yet)
  "CA-0801-102-01": [
    { key: "screen_derm", status: "in_work", values: { pruritus_severity: "Moderate", lesion_severity: "Moderate", ear_assessment: "Normal", cadesi04_score: ["22", 22] },
      query: { field: "cadesi04_score", title: "CADESI-04 score vs lesion photos", raise: "CADESI-04 recorded as 22 but the uploaded lesion photographs suggest more extensive truncal involvement. Please re-score against the photo set and confirm." },
      queries: [
        { field: "lesion_severity", title: "Lesion severity vs pruritus", raise: "Lesion severity recorded as Moderate while pruritus is Moderate — confirm the lesion grade against the regional examination notes." } ] },
  ],
  // Milo — screen failure (fails the baseline pruritus inclusion criterion)
  "CA-0801-101-05": [
    { key: "screen_eligibility", status: "in_work", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "No", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Screen Failure", investigator_approval: "No" },
      queries: [
        { field: "pruritus_5plus", title: "Pruritus score at screen failure", raise: "Subject failed on the baseline pruritus criterion (owner PVAS <5). Confirm the screening pruritus score was taken from the validated owner assessment, not a clinic estimate." } ] },
  ],
  // Molly — withdrawn (Owner Request, 2026-04-18). Forms BEFORE the withdrawal date
  // (Screening, Baseline/Randomization, Follow-Up 1 Day 14) carry real values; the
  // remaining visits are simply not started (no instance) — never empty-but-finalized.
  "CA-0801-102-03": [
    { key: "screen_pe", status: "reviewed", values: { visit_date: "2026-03-10", temperature: ["38.7", 38.7], heart_rate: ["92", 92], respiratory_rate: ["20", 20], body_weight: ["13.1", 13.1], body_condition_score: ["5", 5], general_health: "Normal", significant_findings: "Generalized pruritus with ventral and pedal erythema; otherwise unremarkable." } },
    { key: "screen_derm", status: "reviewed", values: { pruritus_severity: "Severe", lesion_severity: "Moderate", infection_assessment: "Mild", ear_assessment: "Normal", cadesi04_score: ["54", 54] } },
    { key: "screen_consent", status: "reviewed", values: { consent_signed: "Yes", consent_version: "v2.1", consent_date: "2026-03-10", witness_name: "K. Reyes, RVT" } },
    { key: "screen_eligibility", status: "reviewed", values: { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "Yes", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Eligible", investigator_approval: "Yes" } },
    { key: "randomization", status: "reviewed", values: { randomization_number: "102-003", treatment_arm: "DermAlliv™ Active", randomization_date: "2026-03-17", drug_kit_assigned: "KIT-1056" } },
    { key: "baseline_clinical", status: "reviewed", values: { cadesi04_score: ["54", 54], pvas_score: ["7.4", 7.4], pvas_diary_date: "2026-03-16", disease_severity: "Severe", iga: "4" } },
    { key: "drug_dispensation", status: "reviewed", values: { drug_kit_number: "KIT-1056", quantity_dispensed: ["84", 84], dispensation_date: "2026-03-17" } },
    { key: "fu1_pe", status: "reviewed", values: { visit_date: "2026-03-31", body_weight: ["13.0", 13.0], temperature: ["38.6", 38.6], heart_rate: ["90", 90], respiratory_rate: ["18", 18], general_health: "Normal", findings: "Mild improvement in erythema; owner reports reduced scratching." } },
    { key: "fu1_derm", status: "reviewed", values: { cadesi04_score: ["46", 46], pvas_score: ["6.1", 6.1], pvas_diary_date: "2026-03-29", disease_severity: "Moderate", ear_assessment: "Normal" } },
    { key: "withdrawal", status: "reviewed", values: { withdrawal_date: "2026-04-18", withdrawal_reason: "Lost to follow-up", comments: "Owner relocated out of the catchment area and is unable to attend the remaining visits." } },
  ],
};

// ── Completed-subject realistic data (CA-0801) ──────────────────────────────
// A completed dog must carry real, internally-consistent values on EVERY visit
// form (a finalized form can never be empty). Per-dog: enrolment/baseline dates,
// kit, and the CADESI-04 / PVAS trajectory across Baseline → Day 14/28/56/84.
const caAddDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Owner diary date = visit date − a deterministic 0–3 day offset (the owner records
// the score in their diary shortly before the visit; Math.random is unavailable).
const diaryBack = (seedStr) => { let h = 0; for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0; return h % 4; };
const diaryDate = (visitISO, seedStr) => caAddDays(visitISO, -diaryBack(seedStr));
const nv = (x) => [String(x), typeof x === "number" ? x : parseFloat(x)];
const sevForCadesi = (c) => (c >= 50 ? "Severe" : c >= 30 ? "Moderate" : c >= 15 ? "Mild" : "Resolved");
const improvementFor = (c, base) => (c <= base * 0.45 ? "Much Improved" : c < base ? "Improved" : "No Change");
// Recent randomization (baseline) dates for the ACTIVE CA-0801 dogs that lack one,
// so the Visits screen shows a realistic spread of overdue / due / upcoming visits
// (Day 14/28/56/84 relative to these). Cooper (101-01) keeps his older baseline as
// a long-overdue example.
const CA_ACTIVE_ENROLL = {
  "CA-0801-101-02": "2026-06-12", "CA-0801-101-04": "2026-06-05",
  "CA-0801-102-01": "2026-06-08", "CA-0801-102-02": "2026-05-22",
  "CA-0801-102-04": "2026-05-25", "CA-0801-103-01": "2026-06-15",
  "CA-0801-103-03": "2026-05-12",
};
const CA_COMPLETED = {
  // Active arm — strong response. Placebo — modest improvement (clinically realistic).
  "CA-0801-101-03": { screen: "2026-02-18", baseline: "2026-02-25", kit: "KIT-1051", weight: "31.2", cadesi: [58, 43, 31, 19, 14], pvas: [7.0, 5.3, 3.8, 2.6, 2.1] },
  "CA-0801-103-02": { screen: "2026-02-05", baseline: "2026-02-12", kit: "KIT-1062", weight: "33.0", cadesi: [68, 50, 36, 22, 13], pvas: [8.0, 6.1, 4.4, 2.9, 1.8] },
  "CA-0801-103-04": { screen: "2026-01-30", baseline: "2026-02-06", kit: "KIT-1064", weight: "32.4", cadesi: [62, 58, 53, 49, 45], pvas: [7.5, 7.1, 6.6, 6.1, 5.6] },
};
function caCompletedForms(code, arm) {
  const cfg = CA_COMPLETED[code];
  const m = new Map();
  if (!cfg) return m;
  const { screen, baseline, kit, weight, cadesi: c, pvas: p } = cfg;
  const parts = code.split("-");
  const randNo = `${parts[2]}-0${parts[3]}`;
  const vd = [0, 14, 28, 56, 84].map((dd) => caAddDays(baseline, dd));
  const base = c[0];
  m.set("screen_pe", { visit_date: screen, temperature: nv(38.6), heart_rate: nv(88), respiratory_rate: nv(18), body_weight: nv(weight), body_condition_score: nv(5), general_health: "Normal", significant_findings: "Erythema, excoriation, and pruritus consistent with canine atopic dermatitis; no systemic abnormalities." });
  m.set("screen_derm", { pruritus_severity: "Severe", lesion_severity: "Severe", infection_assessment: "Mild", ear_assessment: "Otitis Externa", cadesi04_score: nv(c[0]) });
  m.set("screen_consent", { consent_signed: "Yes", consent_version: "v2.1", consent_date: screen, witness_name: "L. Park, RVT" });
  m.set("screen_eligibility", { age_1yr_plus: "Yes", cad_diagnosis: "Yes", chronic_itching_6mo: "Yes", pruritus_5plus: "Yes", owner_daily_assessments: "Yes", severe_systemic_illness: "No", recent_immunotherapy: "No", active_mange: "No", pregnant_breeding: "No", another_study_30d: "No", eligibility_status: "Eligible", investigator_approval: "Yes" });
  m.set("screen_medhistory", { dermatology_history: "Chronic pruritus since ~12 months of age with seasonal flares.", previous_treatments: "Intermittent corticosteroids and medicated shampoos.", concurrent_diseases: "None significant.", surgical_history: "Spay/neuter only." });
  m.set("screen_labs", { cbc: "Normal", chemistry_panel: "Normal", urinalysis: "Normal", lab_notes: "All values within normal limits.", investigator_review: "Yes" });
  m.set("randomization", { randomization_number: randNo, treatment_arm: arm, randomization_date: baseline, drug_kit_assigned: kit });
  m.set("baseline_clinical", { cadesi04_score: nv(c[0]), pvas_score: nv(p[0]), pvas_diary_date: diaryDate(baseline, `${code}-base`), disease_severity: "Severe", iga: "4" });
  m.set("drug_dispensation", { drug_kit_number: kit, quantity_dispensed: nv(84), dispensation_date: baseline });
  m.set("owner_training", { diary_training: "Yes", med_admin_training: "Yes", compliance_instructions: "Yes" });
  m.set("baseline_qol", { sleep_quality: "Severely Disrupted", activity_level: "Moderately Reduced", comfort: "Severely Uncomfortable", owner_burden: "Severe", overall_qol_score: nv(35) });
  for (const n of [1, 2, 3]) {
    m.set(`fu${n}_pe`, { visit_date: vd[n], body_weight: nv(weight), temperature: nv(38.5), heart_rate: nv(86), respiratory_rate: nv(18), general_health: "Normal", findings: c[n] < c[0] ? "Skin condition improving; no new lesions." : "Skin condition stable; no new lesions." });
    m.set(`fu${n}_derm`, { cadesi04_score: nv(c[n]), pvas_score: nv(p[n]), pvas_diary_date: diaryDate(vd[n], `${code}-fu${n}`), disease_severity: sevForCadesi(c[n]), ear_assessment: c[n] < 30 ? "Normal" : "Otitis Externa" });
    m.set(`fu${n}_drug`, { drug_kit_number: kit, units_returned: nv(6), next_kit_number: `${kit}-${n + 1}`, quantity_dispensed: nv(84) });
    m.set(`fu${n}_conmed`, { new_conmed: "No", conmed_changes: "None." });
    m.set(`fu${n}_ae`, { any_ae: "No", ae_description: "None reported." });
    m.set(`fu${n}_compliance`, { epro_completion_pct: nv(96 - n), missed_doses: nv(n), missed_doses_reason: n > 0 ? "Occasional missed evening dose." : "" });
    m.set(`fu${n}_questionnaire`, { sleep_disturbance: c[n] < 30 ? "Mild" : "Moderate", activity_level: c[n] < 30 ? "Normal" : "Mildly Reduced", perceived_improvement: improvementFor(c[n], base), overall_satisfaction: c[n] < base * 0.6 ? "Very Satisfied" : "Satisfied" });
  }
  m.set("eos_pe", { visit_date: vd[4], body_weight: nv(weight), temperature: nv(38.6), heart_rate: nv(84), respiratory_rate: nv(18), general_health: "Normal", findings: c[4] < base * 0.5 ? "Marked improvement in skin condition." : "Modest improvement in skin condition." });
  // Final CADESI is scored by lesion type on completed dogs — populate the three
  // subtotals (summing to the total) to exercise the auto-sum breakdown on a real record.
  const eosE = Math.round(c[4] * 0.4), eosL = Math.round(c[4] * 0.35), eosAE = c[4] - eosE - eosL;
  m.set("eos_cadesi", { cadesi04_score: nv(c[4]), cadesi_erythema: nv(eosE), cadesi_lichenification: nv(eosL), cadesi_alopecia_excoriation: nv(eosAE) });
  m.set("eos_pvas", { pvas_score: nv(p[4]), pvas_diary_date: diaryDate(vd[4], `${code}-eos`) });
  m.set("eos_qol", c[4] < 20
    ? { sleep_quality: "Normal", activity_level: "Normal", comfort: "Comfortable", owner_burden: "None", overall_qol_score: nv(88) }
    : { sleep_quality: "Mildly Disrupted", activity_level: "Mildly Reduced", comfort: "Mildly Uncomfortable", owner_burden: "Mild", overall_qol_score: nv(62) });
  m.set("eos_drug_return", { drug_kit_returned: "Yes", units_returned: nv(4), reason_not_returned: "N/A" });
  m.set("eos_ae", { outstanding_aes: "No", ae_status: "No outstanding adverse events." });
  m.set("eos_completion", { completion_status: "Completed", investigator_final: `Subject completed all study visits. CADESI-04 ${c[0]} → ${c[4]} and owner PVAS ${p[0]} → ${p[4]} by Day 84. No drug-related adverse events.` });
  return m;
}
// GCP: a completed subject cannot carry open queries — resolve every query at
// study completion (give an open/raised query a response + a resolution message).
function caResolveQueries(forms) {
  const fix = (qy) => (qy.resolution ? qy : { ...qy, response: qy.response ?? "Value re-checked against source — confirmed correct.", resolution: "Resolved at study completion — value confirmed correct by investigator." });
  return forms.map((f) => {
    const out = { ...f };
    if (f.query) out.query = fix(f.query);
    if (f.queries) out.queries = f.queries.map(fix);
    return out;
  });
}

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
  // Completed subjects: every scheduled-visit form is finalized AND carries real
  // values (never empty). Upgrade the forms that already carry data, then fill each
  // missing visit form from caCompletedForms(). Finally resolve all queries — a
  // completed subject can't have open queries (GCP).
  if (d.status === "completed") {
    const gen = caCompletedForms(d.code, d.arm);
    const present = new Set(forms.map((f) => f.key));
    forms = forms.map((f) => (caVisitLeafKeys.includes(f.key) ? { ...f, status: "finalized" } : f));
    for (const key of caVisitLeafKeys) {
      if (!present.has(key)) forms.push({ key, status: "finalized", values: gen.get(key) ?? {} });
    }
    forms = caResolveQueries(forms);
  }
  // Active dogs without a baseline get a recent randomization so their follow-up
  // visits land as a realistic mix of overdue / due / upcoming on the Visits screen.
  if (d.status === "active" && CA_ACTIVE_ENROLL[d.code] && !forms.some((f) => f.key === "randomization")) {
    forms.push({ key: "randomization", status: "reviewed", values: { randomization_number: d.code.replace("CA-0801-", ""), treatment_arm: d.arm, randomization_date: CA_ACTIVE_ENROLL[d.code], drug_kit_assigned: `KIT-12${String(i).padStart(2, "0")}` } });
  }
  return { subject: d.code, forms };
});

// ═══════════════════════════════════════════════════════════════════════════
// BR-2502 — 12 animals across 4 feedlots, expanded from a compact per-animal spec.
// Enrollment dates are anchored to BR_TODAY (the app's demo "today") so the Batch
// Entry suggestion modal lands on the visit day that is actually due. Visit
// windows: D0 ±0 · D3 ±1 · D7 ±2 · D14 ±3 · D28 ±4.
// ═══════════════════════════════════════════════════════════════════════════
const BR_TODAY = "2026-06-16";
const BR_ALL_DAYS = [0, 3, 7, 14, 28];
const brAddDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// code · site · arm · status · age (months — ≤6 = calf) · enroll date · visits done
// flags: ec (TX-001 temp edit check) · query (KS-002 responded query, D3 vitals) ·
// retreat (re-treatment flag set) · withdrawReason. Enrollment dates anchored to
// BR_TODAY so the Batch Entry "due today" suggestions land on the right visit day.
const BR_ANIMALS = [
  { code: "BR-2502-TX-001", site: "TX", arm: "T01", status: "active",    age: 5,  enroll: "2026-06-13", done: ["d0"], ec: true },
  { code: "BR-2502-TX-002", site: "TX", arm: "T02", status: "active",    age: 14, enroll: "2026-06-13", done: ["d0"] },
  { code: "BR-2502-TX-003", site: "TX", arm: "T03", status: "active",    age: 12, enroll: "2026-06-13", done: ["d0"] },
  { code: "BR-2502-KS-001", site: "KS", arm: "T01", status: "completed", age: 6,  enroll: "2026-05-12", done: "all" },
  { code: "BR-2502-KS-002", site: "KS", arm: "T02", status: "active",    age: 13, enroll: "2026-06-09", done: ["d0", "d3"], query: true },
  { code: "BR-2502-KS-003", site: "KS", arm: "T03", status: "active",    age: 16, enroll: "2026-06-13", done: ["d0"] },
  { code: "BR-2502-NE-001", site: "NE", arm: "T01", status: "completed", age: 5,  enroll: "2026-05-09", done: "all" },
  { code: "BR-2502-NE-002", site: "NE", arm: "T02", status: "completed", age: 10, enroll: "2026-05-06", done: "all" },
  { code: "BR-2502-NE-003", site: "NE", arm: "T03", status: "active",    age: 15, enroll: "2026-06-09", done: ["d0", "d3"] },
  { code: "BR-2502-CO-001", site: "CO", arm: "T01", status: "active",    age: 4,  enroll: "2026-06-13", done: ["d0"], retreat: true },
  { code: "BR-2502-CO-002", site: "CO", arm: "T02", status: "active",    age: 11, enroll: "2026-06-13", done: ["d0"] },
  { code: "BR-2502-CO-003", site: "CO", arm: "T03", status: "withdrawn", age: 15, enroll: "2026-06-05", done: ["d0", "d3"], withdrawReason: "Owner request — animal removed from the study at the owner's request on Day 7; no safety concern, not attributable to BRD or the test article." },
];
const BR_BREEDS = ["Angus", "Hereford", "Simmental", "Cross"];
// Last-treatment date ~5 days before build (so a 35-day withdrawal period ends
// ~30 days in the future) — makes the EOS "Shipped" hard block demonstrable.
const BR_WD_LAST_TX = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
const brDemo = BR_ANIMALS.map((a, idx) => {
  const completed = a.status === "completed";
  const tag = `${a.site}-${1000 + idx}`;
  const calf = a.age <= 6;
  const sex = calf ? "Heifer" : "Steer";
  const breed = BR_BREEDS[idx % BR_BREEDS.length];
  const weight = 150 + a.age * 9; // rough arrival weight by age
  const oneTimeStatus = completed ? "finalized" : "reviewed";
  const doseByArm = { T01: 2.5, T02: 2.5, T03: 0 };
  const forms = [];

  forms.push({ key: "screening", status: oneTimeStatus, values: {
    screening_date: a.enroll, dart_score: "2", screening_temp: ["40.2", 40.2],
    visual_brd_signs: ["Nasal discharge", "Cough"], days_on_feed: ["2", 2],
    prior_brd_treatment: "No", inclusion_met: "Yes", eligible: "Yes", randomized_arm: a.arm } });
  forms.push({ key: "demographics", status: oneTimeStatus, values: {
    animal_id: tag, eid_rfid: `8400032025${String(10000 + idx).padStart(5, "0")}`, sex, breed_type: breed,
    age_months: [String(a.age), a.age], arrival_weight: [String(weight), weight],
    arrival_date: brAddDays(a.enroll, -2), enrollment_date: a.enroll } });
  forms.push({ key: "randomization", status: oneTimeStatus, values: {
    randomization_date: a.enroll, block_number: [String((idx % 4) + 1), (idx % 4) + 1], assigned_arm: a.arm,
    allocation_number: `KIT-${a.site}-${100 + idx}`, randomized_by: "Elisa Tron", blinding_maintained: "Yes" } });
  forms.push({ key: "treatment", status: oneTimeStatus, values: {
    body_weight_dosing: [String(weight), weight], test_article: a.arm, dose_mg_kg: [String(doseByArm[a.arm]), doseByArm[a.arm]],
    volume_ml: [String(Math.max(1, Math.round(weight / 17))), Math.max(1, Math.round(weight / 17))], route: "SC",
    injection_site: idx % 2 ? ["Right neck"] : ["Left neck"], lot_expiry: `${a.arm}-${4400 + idx} / 2027-01`,
    administered_by: "Elisa Tron", retreatment_flag: a.retreat ? "Yes" : "No" } });

  const doneDays = a.done === "all" ? BR_ALL_DAYS : a.done.map((d) => Number(d.slice(1)));
  for (const d of doneDays) {
    const vDate = brAddDays(a.enroll, d);
    const isEC = a.ec && d === 0;
    const vitalStatus = completed ? "finalized" : d === 0 && a.status === "active" ? "in_work" : "reviewed";
    const temp = isEC ? ["40.6", 40.6] : d === 0 ? ["40.1", 40.1] : ["38.7", 38.7];
    // HR within the animal's own age-class range (calf 100–140 / adult 48–84).
    const hr = calf ? ["120", 120] : ["72", 72];
    const vf = { key: `vital_signs_d${d}`, status: vitalStatus, values: {
      visit_date: vDate, rectal_temp: temp, heart_rate: hr, resp_rate: [d === 0 ? "42" : "30", d === 0 ? 42 : 30],
      clinical_illness_score: d === 0 ? "2" : "1", attitude: d === 0 ? "Depressed" : "Bright",
      hydration: d === 0 ? "Mild dehydration" : "Normal", bcs: "5", appetite: d === 0 ? "Reduced" : "Normal" } };
    if (isEC) vf.editCheck = { field: "rectal_temp", message: "Rectal temperature 40.6 °C exceeds the bovine range (38.0–39.3 °C) — consistent with a febrile BRD episode; confirm against source and the screening reading." };
    // A responded query on the Day-3 vital signs (heart rate) of the flagged animal.
    if (a.query && d === 3) vf.query = { field: "heart_rate", title: "Day-3 heart rate vs trend",
      raise: "Day-3 heart rate of 72 bpm is at the low end versus the Day-0 reading for this animal. Confirm the chute-side count against the source worksheet.",
      response: "Re-counted at the chute — 72 bpm is correct; the animal had settled and the Day-0 reading was elevated by handling stress. Value confirmed." };
    forms.push(vf);
    // Day 0 Clinical Response has no baseline → simpler assessment set.
    const rf = { key: `clinical_response_d${d}`, status: vitalStatus, values: d === 0
      ? { visit_date: vDate, clinical_illness_score: "2", attitude: "Depressed", hydration: "Mild dehydration", bcs: "5", appetite: "Reduced" }
      : { visit_date: vDate, clinical_illness_score: "1", response_vs_baseline: "Improved", temperature_normalized: "Yes",
          treatment_success_interim: d >= 7 ? "Yes" : "No", requires_retreatment: "No", assessor: "Elisa Tron" } };
    forms.push(rf);
  }

  // Withdrawal Period Confirmation — last treatment ~5 days before build, 35-day
  // withdrawal → end date ~30 days in the future. Seeded for every non-withdrawn
  // animal so the EOS "Shipped" food-safety hard block is demonstrable on an
  // editable record (today < withdrawal end). Completed animals are read-only, so
  // the live demo of the block uses an in-progress animal's (editable) EOS form.
  if (a.status !== "withdrawn") forms.push({ key: "withdrawal_confirm", status: "in_work", values: {
    last_treatment_date: BR_WD_LAST_TX, withdrawal_period_days: ["35", 35], confirmed_by: "Elisa Tron" } });
  if (completed) forms.push({ key: "eos", status: "finalized", values: {
    completion_date: brAddDays(a.enroll, 28), final_body_weight: [String(weight + 45), weight + 45],
    clinical_outcome: "Cure", final_temp: ["38.6", 38.6], disposition: "Returned to pen" } });
  if (a.status === "withdrawn") forms.push({ key: "eos", status: "reviewed", values: {
    completion_date: brAddDays(a.enroll, 7), clinical_outcome: "Removed", final_temp: ["38.9", 38.9],
    disposition: "Returned to pen", withdrawal_reason: a.withdrawReason } });
  if (a.retreat) forms.push({ key: "retreatment", status: "in_work", values: {
    date: brAddDays(a.enroll, 2), reason: "Treatment failure", rectal_temp: ["40.2", 40.2],
    clinical_illness_score: "2", rescue_product: "Florfenicol", dose_route: "40 mg/kg SC",
    treatment_failure: "Yes", removed_from_study: "No" } });

  return { subject: a.code, forms };
});

// ─── Study configs (meta + hierarchy + subjects + demo) ──────────────────────
const STUDIES = [
  {
    key: "PH", suffix: "000000002401", code: "PH-2401",
    name: "Phytogenic Feed Additive Broiler Growth Performance Trial",
    sponsor: "PhytoNutra Animal Health", phase: "Phase III",
    type: "livestock_group", species: "chicken", enrollmentTarget: 20,
    description: "Randomized complete block — 20 broiler pens (30 birds/pen) in a single controlled-environment house; 2 arms (T01 Control, T02 Phytogenic 0.05% blend); 42 days; pen-level capture, house-level Daily Environmental Log. Primary endpoints FCR / ADG / final body weight · Protocol PHY-2025-001",
    tree: PH_TREE,
    barnForms: PH_BARN_FORMS,
    siteForms: SITE_FORMS,
    sites: [
      { code: "RUA", name: "Research Unit A", location: "Athens, GA", pi: "Dr. R. Halverson, DVM" },
    ],
    barns: [
      { code: "HA", name: "House A", site: "RUA", capacity: 600 },
    ],
    pens: [
      { code: "P01", name: "Pen 01", barn: "HA", capacity: 30 },
      { code: "P02", name: "Pen 02", barn: "HA", capacity: 30 },
      { code: "P03", name: "Pen 03", barn: "HA", capacity: 30 },
      { code: "P04", name: "Pen 04", barn: "HA", capacity: 30 },
      { code: "P05", name: "Pen 05", barn: "HA", capacity: 30 },
      { code: "P06", name: "Pen 06", barn: "HA", capacity: 30 },
    ],
    subjects: [
      { code: "PH-2401-P01", status: "active",    arm: "T01 Control",    pen: "P01", site: "RUA" },
      { code: "PH-2401-P02", status: "active",    arm: "T02 Phytogenic", pen: "P02", site: "RUA" },
      { code: "PH-2401-P03", status: "active",    arm: "T01 Control",    pen: "P03", site: "RUA" },
      { code: "PH-2401-P04", status: "active",    arm: "T02 Phytogenic", pen: "P04", site: "RUA" },
      { code: "PH-2401-P05", status: "enrolled",  arm: "T01 Control",    pen: "P05", site: "RUA" },
      { code: "PH-2401-P06", status: "screening", arm: "T02 Phytogenic", pen: "P06", site: "RUA" },
    ],
    // House-level Daily Environmental Log (barn-scoped): one normal day + one with
    // ammonia above the 25 ppm welfare threshold and evening temp above 24 °C.
    barnDemo: [
      { barn: "HA", forms: [
        { key: "daily_env_log", status: "reviewed", values: {
          log_date: "2026-05-04", temp_morning: ["21", 21], temp_evening: ["22", 22],
          rh_morning: ["55", 55], rh_evening: ["60", 60], co2_ppm: ["1800", 1800], ammonia_ppm: ["12", 12],
          ventilation_rate: ["4500", 4500], hvac_normal: "Yes", recorded_by: "Elisa Tron" } },
        { key: "daily_env_log", status: "in_work", values: {
          log_date: "2026-05-19", temp_morning: ["23", 23], temp_evening: ["25", 25],
          rh_morning: ["62", 62], rh_evening: ["68", 68], co2_ppm: ["2600", 2600], ammonia_ppm: ["32", 32],
          ventilation_rate: ["3800", 3800], hvac_normal: "Yes", recorded_by: "Elisa Tron" } },
        // Equipment calibration — one current, one OVERDUE (next due in the past).
        { key: "equipment_calibration", status: "reviewed", values: {
          equipment_name: "Platform scale", serial_number: "PS-44120", last_calibration: "2026-03-15",
          next_due: "2026-09-15", certificate_ref: "CAL-2026-0312", calibrated_by: "MetroCal Services" } },
        { key: "equipment_calibration", status: "reviewed", values: {
          equipment_name: "Ammonia monitor", serial_number: "AM-7781", last_calibration: "2025-11-20",
          next_due: "2026-05-20", certificate_ref: "CAL-2025-1118", calibrated_by: "MetroCal Services" } },
        // Feed deliveries — three across the grow-out.
        { key: "feed_delivery", status: "reviewed", values: {
          delivery_date: "2026-04-20", feed_lot_number: "FL-7781", supplier: "AgriFeed Co.", feed_phase: "Starter",
          quantity_kg: ["1200", 1200], bags_units: ["48", 48], quality_check: "Yes", mycotoxin_screen: "Pass",
          coa_received: "Yes", received_by: "Elisa Tron" } },
        { key: "feed_delivery", status: "reviewed", values: {
          delivery_date: "2026-05-01", feed_lot_number: "FL-7820", supplier: "AgriFeed Co.", feed_phase: "Grower",
          quantity_kg: ["1800", 1800], bags_units: ["72", 72], quality_check: "Yes", mycotoxin_screen: "Pass",
          coa_received: "Yes", received_by: "Elisa Tron" } },
        { key: "feed_delivery", status: "in_work", values: {
          delivery_date: "2026-05-18", feed_lot_number: "FL-7901", supplier: "AgriFeed Co.", feed_phase: "Finisher",
          quantity_kg: ["2400", 2400], bags_units: ["96", 96], quality_check: "Yes", mycotoxin_screen: "Not performed",
          coa_received: "No", received_by: "Elisa Tron" } },
      ] },
    ],
    demo: [
      // P01 (T01) — completed setup + weekly visits, an open litter-moisture query, a mortality record.
      { subject: "PH-2401-P01", forms: [
        { key: "pen_setup", status: "reviewed", values: {
          pen_id: "P01", pen_number: ["1", 1], house_barn: "House A", floor_area_m2: ["1.2", 1.2],
          birds_placed: ["30", 30], breed_strain: "Ross 308", sex: "As-hatched",
          hatch_date: "2026-04-20", source_hatchery: "Northgate Hatchery", placement_date: "2026-04-21",
          treatment_arm: "T01 Control", randomization_block: ["1", 1], litter_type: "Wood shavings",
          litter_depth: ["8", 8], litter_scoring_system: "Ekstrand 1-5", feeder_type: "Tube", drinker_type: "Nipple" } },
        { key: "randomization", status: "reviewed", values: {
          randomization_date: "2026-04-21", randomization_method: "Computer-generated list", block_number: ["1", 1],
          assigned_arm: "T01 Control", randomized_by: "Elisa Tron", assignment_confirmed: "Yes" } },
        { key: "feed_setup", status: "reviewed", values: {
          feed_supplier: "AgriFeed Co.", feed_lot_number: "FL-7781", feed_form: "Crumble", feed_phase: "Starter D0-10",
          feed_delivery_date: "2026-04-20", initial_feed_inventory: ["50", 50], feed_quality_check: "Yes",
          mycotoxin_result: "Pass", crude_protein: ["22", 22], metabolizable_energy: ["3000", 3000] } },
        { key: "baseline_d0", status: "reviewed", values: {
          weighing_date: "2026-04-21", birds_alive: ["30", 30], total_pen_weight: ["1.26", 1.26], bw_sd: ["5", 5],
          beginning_feed_inventory: ["50", 50], water_meter_reading: ["0", 0], flock_behavior: "Normal", weighed_by: "Elisa Tron" } },
        { key: "body_weight_d7", status: "reviewed", values: {
          weighing_date: "2026-04-28", birds_alive: ["30", 30], cumulative_mortality: ["0", 0],
          total_pen_weight: ["5.4", 5.4], bw_sd: ["18", 18], beginning_feed_inventory: ["50", 50],
          feed_added: ["0", 0], feed_weighback: ["42", 42], water_meter_reading: ["60", 60], weighed_by: "Elisa Tron" } },
        { key: "body_weight_d14", status: "reviewed", values: {
          weighing_date: "2026-05-05", birds_alive: ["30", 30], cumulative_mortality: ["0", 0],
          total_pen_weight: ["12.6", 12.6], bw_sd: ["35", 35], beginning_feed_inventory: ["42", 42],
          feed_added: ["30", 30], feed_weighback: ["50", 50], water_meter_reading: ["180", 180], weighed_by: "Elisa Tron" } },
        { key: "flock_health_d7", status: "reviewed", values: {
          observation_date: "2026-04-28", flock_uniformity: "Good", flock_activity: "Very active",
          feed_intake_appearance: "Normal", water_intake_appearance: "Normal", respiratory_signs: "No",
          litter_condition_score: ["1", 1], litter_moisture: "Dry", caking_present: "No", footpad_dermatitis: "No",
          mortality_since_last: ["0", 0], culls_since_last: ["0", 0], observer: "Elisa Tron" } },
        { key: "flock_health_d14", status: "in_work", values: {
          observation_date: "2026-05-05", flock_uniformity: "Good", flock_activity: "Normal",
          feed_intake_appearance: "Normal", water_intake_appearance: "Normal", respiratory_signs: "No",
          litter_condition_score: ["2", 2], litter_moisture: "Wet", caking_present: "Yes", footpad_dermatitis: "No",
          mortality_since_last: ["0", 0], culls_since_last: ["0", 0], clinical_signs: ["Other"], observer: "Elisa Tron" },
          query: { field: "litter_moisture", title: "Wet litter — welfare follow-up",
            raise: "Litter moisture recorded as Wet with caking present at D14. Wet litter raises footpad-dermatitis and ammonia risk — confirm the reading, check for drinker leaks, and document the corrective action." } },
        { key: "mortality_cull", status: "reviewed", values: {
          event_date: "2026-05-12", assessment_day: "D21", death_count: ["1", 1], cull_count: ["0", 0],
          cause_deaths: "Sudden death syndrome", gross_lesions: "No", recorded_by: "Elisa Tron" } },
        { key: "production_summary", status: "reviewed", values: {} },
      ] },
      // P02 (T02) — completed setup + weekly visit with a soft FCR edit check (FCR > 1.90).
      { subject: "PH-2401-P02", forms: [
        { key: "pen_setup", status: "reviewed", values: {
          pen_id: "P02", pen_number: ["2", 2], house_barn: "House A", floor_area_m2: ["1.2", 1.2],
          birds_placed: ["30", 30], breed_strain: "Ross 308", sex: "As-hatched",
          hatch_date: "2026-04-20", source_hatchery: "Northgate Hatchery", placement_date: "2026-04-21",
          treatment_arm: "T02 Phytogenic", randomization_block: ["1", 1], litter_type: "Wood shavings",
          litter_depth: ["8", 8], litter_scoring_system: "Ekstrand 1-5", feeder_type: "Tube", drinker_type: "Nipple" } },
        { key: "randomization", status: "reviewed", values: {
          randomization_date: "2026-04-21", randomization_method: "Computer-generated list", block_number: ["1", 1],
          assigned_arm: "T02 Phytogenic", test_article_lot: "PHY-LOT-3320", additive_inclusion_rate: ["0.05", 0.05],
          randomized_by: "Elisa Tron", assignment_confirmed: "Yes" } },
        { key: "feed_setup", status: "reviewed", values: {
          feed_supplier: "AgriFeed Co.", feed_lot_number: "FL-7782", feed_form: "Crumble", feed_phase: "Starter D0-10",
          feed_delivery_date: "2026-04-20", initial_feed_inventory: ["50", 50], feed_quality_check: "Yes",
          mycotoxin_result: "Pass", crude_protein: ["22", 22], metabolizable_energy: ["3000", 3000] } },
        { key: "baseline_d0", status: "reviewed", values: {
          weighing_date: "2026-04-21", birds_alive: ["30", 30], total_pen_weight: ["1.25", 1.25], bw_sd: ["5", 5],
          beginning_feed_inventory: ["50", 50], water_meter_reading: ["0", 0], flock_behavior: "Normal", weighed_by: "Elisa Tron" } },
        { key: "body_weight_d7", status: "reviewed", values: {
          weighing_date: "2026-04-28", birds_alive: ["30", 30], cumulative_mortality: ["0", 0],
          total_pen_weight: ["5.5", 5.5], bw_sd: ["17", 17], beginning_feed_inventory: ["50", 50],
          feed_added: ["0", 0], feed_weighback: ["42", 42], water_meter_reading: ["58", 58], weighed_by: "Elisa Tron" } },
        { key: "body_weight_d14", status: "in_work", values: {
          weighing_date: "2026-05-05", birds_alive: ["30", 30], cumulative_mortality: ["0", 0],
          total_pen_weight: ["13.2", 13.2], bw_sd: ["33", 33], beginning_feed_inventory: ["42", 42],
          feed_added: ["30", 30], feed_weighback: ["48", 48], water_meter_reading: ["178", 178], weighed_by: "Elisa Tron" },
          editCheck: { field: "total_pen_weight", message: "Computed period FCR is above the broiler performance range (1.50–1.80; soft alert above 1.90) — verify the pen weight and feed weigh-back entries and investigate feed wastage or sub-optimal flock health." } },
        { key: "flock_health_d7", status: "reviewed", values: {
          observation_date: "2026-04-28", flock_uniformity: "Good", flock_activity: "Very active",
          feed_intake_appearance: "Normal", water_intake_appearance: "Normal", respiratory_signs: "No",
          litter_condition_score: ["1", 1], litter_moisture: "Dry", caking_present: "No", footpad_dermatitis: "No",
          mortality_since_last: ["0", 0], culls_since_last: ["0", 0], observer: "Elisa Tron" } },
        { key: "flock_health_d14", status: "reviewed", values: {
          observation_date: "2026-05-05", flock_uniformity: "Good", flock_activity: "Normal",
          feed_intake_appearance: "Normal", water_intake_appearance: "Normal", respiratory_signs: "No",
          litter_condition_score: ["2", 2], litter_moisture: "Slightly moist", caking_present: "No", footpad_dermatitis: "No",
          mortality_since_last: ["0", 0], culls_since_last: ["0", 0], observer: "Elisa Tron" } },
        { key: "mortality_cull", status: "reviewed", values: {
          event_date: "2026-05-10", assessment_day: "D21", death_count: ["2", 2], cull_count: ["1", 1],
          cause_deaths: "Ascites", cause_culls: "Leg disorder", gross_lesions: "Yes", recorded_by: "Elisa Tron" } },
        { key: "production_summary", status: "reviewed", values: {} },
      ] },
      // P03, P04 — setup only.
      { subject: "PH-2401-P03", forms: [
        { key: "pen_setup", status: "reviewed", values: {
          pen_id: "P03", pen_number: ["3", 3], house_barn: "House A", floor_area_m2: ["1.2", 1.2],
          birds_placed: ["30", 30], breed_strain: "Ross 308", sex: "As-hatched",
          hatch_date: "2026-04-20", source_hatchery: "Northgate Hatchery", placement_date: "2026-04-21",
          treatment_arm: "T01 Control", randomization_block: ["2", 2], litter_type: "Wood shavings",
          litter_depth: ["8", 8], litter_scoring_system: "Ekstrand 1-5", feeder_type: "Tube", drinker_type: "Nipple" } },
      ] },
      { subject: "PH-2401-P04", forms: [
        { key: "pen_setup", status: "in_work", values: {
          pen_id: "P04", pen_number: ["4", 4], house_barn: "House A", floor_area_m2: ["1.2", 1.2],
          birds_placed: ["30", 30], breed_strain: "Cobb 500", sex: "As-hatched",
          hatch_date: "2026-04-20", placement_date: "2026-04-21",
          treatment_arm: "T02 Phytogenic", randomization_block: ["2", 2], litter_type: "Wood shavings",
          litter_depth: ["7", 7], litter_scoring_system: "Ekstrand 1-5", feeder_type: "Tube", drinker_type: "Nipple" } },
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
    siteForms: SITE_FORMS,
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
    subjects: BR_ANIMALS.map((a) => ({ code: a.code, status: a.status, arm: a.arm, pen: `${a.site}P`, site: a.site })),
    demo: brDemo,
  },
  {
    key: "CA", suffix: "000000000801", code: "CA-0801",
    name: "DermAlliv™ Canine Atopic Dermatitis Study",
    sponsor: "DermAlliv Therapeutics", phase: "Phase III",
    type: "companion", species: "canine", enrollmentTarget: 60,
    description: "Randomized, double-blind, placebo-controlled, multi-site (3 sites) — canine atopic dermatitis · Protocol DERM-2026-104",
    tree: CA_TREE,
    siteForms: SITE_FORMS,
    sites: CA_SITES,
    barns: [],
    pens: [],
    owners: caOwners,
    subjects: caSubjects,
    demo: caDemo,
    // Site-scoped demo: site 101 is fully initiated (SIV approved) with staff,
    // a monitoring visit, an amendment and a continuing review. Sites 102/103 have
    // no SIV → the Data-Entry enrollment-gate banner shows for them.
    siteDemo: [
      { site: "101", forms: [
        { key: "siv", status: "reviewed", values: {
          siv_date: "2026-03-10", siv_conducted_by: "James Hollis (CRA)",
          facility_adequate: "Yes", storage_adequate: "Yes", temp_monitoring: "Yes",
          staff_gcp_trained: "Yes", protocol_training: "Yes", irb_approval: "Yes", icf_approved: "Yes",
          ip_received: "Yes", ip_storage_confirmed: "Yes", edc_access: "Yes", edc_training: "Yes",
          site_approved_to_enroll: "Yes", investigator_signoff: "Dr. Sarah Bennett", cra_signoff: "James Hollis" } },
        { key: "staff_delegation", status: "reviewed", values: {
          staff_name: "Dr. Sarah Bennett", role: "PI", gcp_training_date: "2025-09-01", gcp_expiry: "2027-09-01",
          protocol_training_date: "2026-03-08", protocol_training_version: "v2.1",
          delegated_tasks: ["Query Response", "Consent", "Drug Dispensing"], signature_authority: "Yes", active_at_site: "Yes" } },
        { key: "staff_delegation", status: "reviewed", values: {
          staff_name: "Maria Lopez", role: "CRC", gcp_training_date: "2025-08-15", gcp_expiry: "2026-07-30",
          protocol_training_date: "2026-03-08", protocol_training_version: "v2.1",
          delegated_tasks: ["Data Entry", "Query Response", "Sample Collection"], signature_authority: "No", active_at_site: "Yes" } },
        { key: "monitoring_visits", status: "reviewed", values: {
          visit_date: "2026-05-02", visit_type: "Routine Monitoring", cra_name: "James Hollis",
          subjects_reviewed: ["4", 4], findings_summary: "SDV completed for 4 subjects; 3 minor queries raised on Week-4 forms. Protocol compliance satisfactory.",
          action_items: "Resolve open queries by next visit.", followup_required: "No", report_submitted: "Yes", report_date: "2026-05-06" } },
        { key: "protocol_amendments", status: "reviewed", values: {
          protocol_version: "v2.1", amendment_date: "2026-01-10", amendment_summary: "Safety monitoring interval reduced from 4 weeks to 2 weeks for Group A.",
          iec_approval_date: "2026-01-17", iec_approval_ref: "IEC-2026-014", subjects_affected: "All",
          implemented_date: "2026-01-20", implemented_by: "Dr. Sarah Bennett", status: "Implemented" } },
        { key: "continuing_review", status: "reviewed", values: {
          review_date: "2026-02-15", renewed_until: "2027-02-15", outcome: "Approved" } },
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
  let formCounter = 0;
  let fieldCounter = 0;

  // Recursive emit — supports arbitrary group nesting (group → sub-group → leaf).
  // Global per-study counters give every form/field a stable unique id regardless
  // of depth; `parent_form_id` carries the tree shape.
  const emitNode = (node, parentId) => {
    seq += 1;
    formCounter += 1;
    const id = `61${h6(formCounter)}-0000-0000-0000-${suffix}`;
    const code = `F${String(formCounter).padStart(3, "0")}`;
    formRows.push(
      `  ('${id}','${sUuid}',${parentId ? `'${parentId}'` : "null"},'${code}',${sqlStr(node.name)},${seq},'subject',${node.batch_eligible ? "true" : "false"})`,
    );
    if (node.key) formIdByKey[study.key][node.key] = id;
    if (node.children) {
      for (const child of node.children) emitNode(child, id);
      return;
    }
    fieldIdByKey[study.key][node.key] = {};
    node.fields.forEach((f, i) => {
      fieldCounter += 1;
      const fid = `62${h6(fieldCounter)}-0000-0000-0000-${suffix}`;
      fieldIdByKey[study.key][node.key][f.code] = fid;
      fieldRows.push(
        `  ('${fid}','${id}',${sqlStr(f.code)},${sqlStr(f.label)},'${f.type}',${
          f.options ? sqlJson(f.options) : "null"
        },${sqlStr(f.unit ?? null)},${f.req ? "true" : "false"},${i + 1},${sqlJson(f.validation ?? null)})`,
      );
    });
  };

  for (const node of study.tree) emitNode(node, null);

  // Scope-level forms (rendered on the Barn Record / Site Record, excluded from
  // the pen sidebar). Flat leaf lists with distinct id prefixes per scope so they
  // never collide with the recursive subject forms (61/62).
  const emitScopedForms = (forms, scope, formPre, fieldPre, codePre) => {
    (forms ?? []).forEach((node, bi) => {
      seq += 1;
      const bb = h2(bi + 1);
      const id = `${formPre}${bb}0000-0000-0000-0000-${suffix}`;
      formRows.push(`  ('${id}','${sUuid}',null,'${codePre}${bb}',${sqlStr(node.name)},${seq},'${scope}',false)`);
      formIdByKey[study.key][node.key] = id;
      fieldIdByKey[study.key][node.key] = {};
      node.fields.forEach((f, i) => {
        const ff = h2(i + 1);
        const fid = `${fieldPre}${bb}${ff}00-0000-0000-0000-${suffix}`;
        fieldIdByKey[study.key][node.key][f.code] = fid;
        fieldRows.push(
          `  ('${fid}','${id}',${sqlStr(f.code)},${sqlStr(f.label)},'${f.type}',${
            f.options ? sqlJson(f.options) : "null"
          },${sqlStr(f.unit ?? null)},${f.req ? "true" : "false"},${i + 1},${sqlJson(f.validation ?? null)})`,
        );
      });
    });
  };
  emitScopedForms(study.barnForms, "barn", "65", "66", "B");
  emitScopedForms(study.siteForms, "site", "67", "68", "S");
}

// ─── Emit hierarchy + subjects ───────────────────────────────────────────────
const siteRows = [];
const barnRows = [];
const penRows = [];
const ownerRows = [];
const subjectRows = [];
const subjectIdByCode = {}; // [studyKey][subject_code] = uuid
const barnIdByCode = {}; // [studyKey][barn_code] = uuid
const siteIdByCode = {}; // [studyKey][site_code] = uuid

for (const study of STUDIES) {
  const suffix = study.suffix;
  const sUuid = studyUuid(suffix);
  subjectIdByCode[study.key] = {};
  barnIdByCode[study.key] = {};
  siteIdByCode[study.key] = {};

  // One or more sites. `study.sites` is an array; legacy single-site studies may
  // still use `study.site`. Each site has a `code`; subjects reference it via
  // `s.site` (defaulting to the first site).
  const sites = study.sites ?? (study.site ? [{ code: "S01", ...study.site }] : []);
  const siteUuidByCode = {};
  sites.forEach((st, i) => {
    const id = hierId("30", i + 1, suffix);
    siteUuidByCode[st.code] = id;
    siteIdByCode[study.key][st.code] = id;
    siteRows.push(
      `  ('${id}','${sUuid}',${sqlStr(st.code)},${sqlStr(st.name)},${sqlStr(st.location)},${sqlStr(st.pi)},'active')`,
    );
  });
  const defaultSiteCode = sites[0]?.code;

  const barnUuidByCode = {};
  (study.barns ?? []).forEach((b, i) => {
    const id = hierId("31", i + 1, suffix);
    barnUuidByCode[b.code] = id;
    barnIdByCode[study.key][b.code] = id;
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
  // Subject (pen/animal) demo records + barn-scoped demo records (Daily Env Log)
  // in one pass. Subject instances carry subject_id; barn instances carry barn_id.
  const records = [
    ...(study.demo ?? []).map((d) => ({ subjectId: subjectIdByCode[study.key][d.subject], barnId: null, siteId: null, forms: d.forms })),
    ...(study.barnDemo ?? []).map((d) => ({ subjectId: null, barnId: barnIdByCode[study.key][d.barn], siteId: null, forms: d.forms })),
    ...(study.siteDemo ?? []).map((d) => ({ subjectId: null, barnId: null, siteId: siteIdByCode[study.key][d.site], forms: d.forms })),
  ];
  for (const d of records) {
    for (const f of d.forms) {
      const formId = formIdByKey[study.key][f.key];
      const instId = demoId("63", (ic += 1), suffix);
      instanceRows.push(
        `  ('${instId}','${formId}',${d.subjectId ? `'${d.subjectId}'` : "null"},${d.barnId ? `'${d.barnId}'` : "null"},${d.siteId ? `'${d.siteId}'` : "null"},'${f.status}')`,
      );
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
      // A manual query: `raise` only → open; `+response` → responded; `+resolution`
      // → resolved. Supports a single `f.query` or an array `f.queries`.
      const emitQuery = (qy) => {
        const status = qy.resolution ? "resolved" : qy.response ? "responded" : "open";
        const qid = demoId("70", (qc += 1), suffix);
        queryRows.push(
          `  ('${qid}','${instId}','${vidByCode[qy.field]}','${status}','minor',${sqlStr(qy.title)},'${DEMO_USER}',now())`,
        );
        messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(qy.raise)})`);
        if (qy.response) messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(qy.response)})`);
        if (qy.resolution) messageRows.push(`  ('${demoId("71", (mc += 1), suffix)}','${qid}','${DEMO_USER}',${sqlStr(qy.resolution)})`);
      };
      if (f.query) emitQuery(f.query);
      if (f.queries) for (const qy of f.queries) emitQuery(qy);
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
--   PH-2401  livestock_group       chicken   Site → House → Pen   (broiler pens, 2 arms; house-level Daily Env Log)
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
  ('chicken','heart_rate',250,400,'bpm'),('chicken','temperature',40.6,42.2,'°C'),('chicken','ammonia_level',0,25,'ppm'),
  ('chicken','ammonia_ppm',0,25,'ppm'),('chicken','avg_body_weight_g',2800,3200,'g'),('chicken','fcr',1.50,1.80,''),('chicken','carcass_yield_pct',74,76,'%');

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
insert into form_instances (id, form_id, subject_id, barn_id, site_id, status) values
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
  "insert into forms (id, study_id, parent_form_id, code, name, sequence, scope, batch_eligible) values",
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
