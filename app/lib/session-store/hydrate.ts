// ════════════════════════════════════════════════════════════════════════════
// One-time hydration of the session store from Supabase. Supabase is the
// read-only seed source; after this, all reads/writes use the session store.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { DEMO_USER_ID } from "@/lib/constants";
import { searchDict } from "@/lib/veddra-dictionary";
import { buildInventorySeed } from "./inventory-seed";
import type { Dataset } from "./types";

// Supabase / PostgREST caps a single select at ~1000 rows (the project's Max Rows
// setting). Tables like field_values (≈1500 across all studies) overflow that and
// would be SILENTLY truncated — dropping field values and orphaning the queries /
// edit checks / SDV records that reference them. Page through in 1000-row chunks so
// every row is hydrated.
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + SIZE - 1);
    if (error) { console.error(`hydrate: ${table} page ${from} failed`, error.message); break; }
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < SIZE) break;
  }
  return out;
}

export async function hydrateFromSupabase(): Promise<Dataset> {
  const [
    studies,
    sites,
    barns,
    pens,
    subjects,
    owners,
    forms,
    memberships,
    speciesRanges,
  ] = await Promise.all([
    supabase.from("studies").select("id, code, name, sponsor, phase, type, species, status, enrollment_target, description"),
    supabase.from("sites").select("id, study_id, code, name, status, location, principal_investigator"),
    supabase.from("barns").select("id, site_id, code, name"),
    supabase.from("pens").select("id, barn_id, code, name"),
    supabase.from("subjects").select("id, study_id, site_id, barn_id, pen_id, owner_id, subject_code, species, status, randomization_arm"),
    supabase.from("companion_owners").select("id, study_id, full_name"),
    supabase.from("forms").select("id, study_id, visit_id, parent_form_id, code, name, sequence, scope, batch_eligible"),
    supabase.from("study_memberships").select("study_id, role").eq("user_id", DEMO_USER_ID),
    supabase.from("species_ranges").select("species, vital, min, max, unit"),
  ]);
  // Potentially-large tables — paged so none is truncated at 1000 rows.
  const [formFields, formInstances, fieldValues, queries, queryMessages, sdvRecords] = await Promise.all([
    fetchAll<Dataset["formFields"][number]>("form_fields", "id, form_id, code, label, field_type, options, unit, is_required, sequence, validation"),
    fetchAll<Dataset["formInstances"][number]>("form_instances", "id, form_id, subject_id, barn_id, site_id, status"),
    fetchAll<Dataset["fieldValues"][number]>("field_values", "id, form_instance_id, form_field_id, value"),
    fetchAll<Dataset["queries"][number]>("queries", "id, form_instance_id, field_value_id, status, title"),
    fetchAll<Dataset["queryMessages"][number]>("query_messages", "id, query_id, author_id, body, created_at"),
    fetchAll<Dataset["sdvRecords"][number]>("sdv_records", "id, form_instance_id, field_value_id, status"),
  ]);

  const rawQueries = queries;
  const rawMsgs = queryMessages;

  // Split: a seeded "auto edit-check" query is really an edit check, not a query.
  // Detect it by its first message (Auto edit-check: …) and move it to editChecks.
  const editChecks: Dataset["editChecks"] = [];
  const splitQueries = rawQueries.filter((q) => {
    const first = rawMsgs.find((m) => m.query_id === q.id);
    const isAuto = first?.body?.startsWith("Auto edit-check:") ?? false;
    if (isAuto && q.status !== "resolved" && q.field_value_id) {
      editChecks.push({
        id: q.id,
        form_instance_id: q.form_instance_id,
        field_value_id: q.field_value_id,
        message: q.title,
        status: "open",
        created_at: first?.created_at ?? new Date().toISOString(),
      });
      return false; // remove from queries
    }
    return true;
  });

  // Study-level enrolment targets, pinned here so they match the actual demo
  // cohort sizes regardless of what the (possibly stale) Supabase seed carries —
  // CA-0801 60 dogs (3 sites × 20), BR-2502 12 animals (4 feedlots), PH-2401 2 pens.
  const STUDY_TARGETS: Record<string, number> = { "CA-0801": 60, "BR-2502": 12, "PH-2401": 2 };
  // Ethics & regulatory config (session-only — not DB columns).
  const STUDY_ETHICS: Record<string, { iacuc_number: string; iacuc_approval_date: string; iacuc_expiry: string; vich_guideline: string }> = {
    "CA-0801": { iacuc_number: "IACUC-2024-CA-0801", iacuc_approval_date: "2024-09-01", iacuc_expiry: "2026-09-01", vich_guideline: "VICH GL9 (Efficacy) · VICH GL6 (Safety)" },
    "BR-2502": { iacuc_number: "IACUC-2025-BR-2502", iacuc_approval_date: "2025-01-15", iacuc_expiry: "2027-01-15", vich_guideline: "VICH GL9 (Efficacy) · VICH GL6 (Safety)" },
    "PH-2401": { iacuc_number: "IACUC-2024-PH-2401", iacuc_approval_date: "2024-08-01", iacuc_expiry: "2026-08-01", vich_guideline: "VICH GL9 (Efficacy)" },
  };
  const studiesWithTargets = ((studies.data ?? []) as Dataset["studies"]).map((s) => ({
    ...s,
    ...(STUDY_TARGETS[s.code] != null ? { enrollment_target: STUDY_TARGETS[s.code] } : {}),
    ...(STUDY_ETHICS[s.code] ?? {}),
  }));

  // Session-only per-feedlot enrolment targets for BR-2502 (not a DB column —
  // seeded here, same as the other Overview-config fields). Over the cap is a
  // protocol deviation. Counts: TX/KS under cap, NE at cap, CO over cap (demo).
  const BR_SITE_TARGETS: Record<string, number> = { TX: 5, KS: 4, NE: 3, CO: 2 };
  const brStudyId = (studies.data ?? []).find((s) => s.code === "BR-2502")?.id;
  const sitesWithTargets = ((sites.data ?? []) as Dataset["sites"]).map((s) =>
    s.study_id === brStudyId && BR_SITE_TARGETS[s.code] != null
      ? { ...s, enrollment_target: BR_SITE_TARGETS[s.code] }
      : s,
  );

  // Read-only auto-derived rollup forms — flag them on the form row (so renderers
  // check `form.is_summary`, not the form name).
  const SUMMARY_FORM_NAMES = new Set(["Production Summary", "Pen BRD Summary"]);
  const F025_ID = "61000019-0000-0000-0000-000000002502";
  // CA-0801 EOS drug-return form (F046) is the same accountability form type as the
  // Follow-Up "Study Drug Accountability" forms — rename it to match.
  const CA_F046_ID = "6100002e-0000-0000-0000-000000000801";
  // ─── CA-0801 new forms — synthetic ids for the standalone Informed Consent form
  // and a "Safety & Events" group the existing standalone "ConMed" form is renamed
  // into ("Concomitant Medications"). The ICF is a top-level, study-level form (no
  // group wrapper) so it sits first in the sidebar, above every visit group.
  const caStudyId = (studies.data ?? []).find((s) => s.code === "CA-0801")?.id;
  const CA_ICF_FORM = "6100f002-0000-0000-0000-000000000801";
  const CA_SAFETY_GROUP = "6100f003-0000-0000-0000-000000000801";
  const formsWithFlags = ((forms.data ?? []) as Dataset["forms"]).map((f) =>
    f.id === F025_ID ? { ...f, name: "Re-treatment Log" } // repeating table in Safety & Events
      : (f.id ?? "").toLowerCase() === CA_F046_ID ? { ...f, name: "Study Drug Accountability" }
        // CA-0801 ConMed → "Concomitant Medications", reparented under the new
        // Safety & Events group (it's already a repeating log with the right fields).
        : f.study_id === caStudyId && f.name === "ConMed" ? { ...f, name: "Concomitant Medications", parent_form_id: CA_SAFETY_GROUP }
          : SUMMARY_FORM_NAMES.has(f.name) ? { ...f, is_summary: true } : f,
  );

  // ─── BR-2502 Treatment Administration (F005) + Re-treatment (F025) reshape ──
  // Session-only schema cleanup: F005 → 7 fields (date · test article · lot · body
  // weight · calculated dose mL · route · administered by); F025 → 10 on-demand
  // re-treatment fields. Read-only "auto" fields are `calculated` (calcValue) or
  // autoFromArm. Withdrawal fields are dropped here (the hard-block reads the
  // Withdrawal Period Confirmation form, not F005).
  const F005 = "61000005-0000-0000-0000-000000002502";
  const F025 = "61000019-0000-0000-0000-000000002502";
  type FF = Dataset["formFields"][number];
  const ff = (form_id: string, id: string, code: string, label: string, field_type: string, options: string[] | null, unit: string | null, is_required: boolean, sequence: number, validation: FF["validation"]): FF =>
    ({ id, form_id, code, label, field_type, options, unit, is_required, sequence, validation });
  const f005Existing = new Map((formFields as FF[]).filter((f) => f.form_id === F005).map((f) => [f.code, f.id]));
  const id005 = (code: string, fallback: string) => f005Existing.get(code) ?? fallback;
  const F005_FIELDS: FF[] = [
    ff(F005, "f005-date_administered", "date_administered", "Date administered", "date", null, null, true, 1, { section: "Administration" }),
    ff(F005, id005("test_article", "f005-test_article"), "test_article", "Test article", "select", ["T01", "T02", "T03"], null, false, 2, { autoFromArm: true, hint: "Auto-populated from the randomization assignment — cannot be modified.", section: "Drug Information" }),
    ff(F005, id005("lot_expiry", "f005-lot_number"), "lot_number", "Lot number", "calculated", null, null, false, 3, { readonlyAuto: true, hint: "Auto-assigned from randomization.", section: "Drug Information" }),
    ff(F005, "f005-unit_id", "unit_id", "Unit / Vial ID", "select", null, null, true, 4, { hint: "Select the physical unit administered (chain of custody).", section: "Drug Information" }),
    ff(F005, id005("body_weight_dosing", "f005-body_weight"), "body_weight_dosing", "Body weight at administration", "number", null, "kg", true, 5, { section: "Drug Information", hint: "Weigh the animal immediately before administration. Used to verify the calculated dose." }),
    ff(F005, "f005-calculated_dose", "calculated_dose", "Calculated dose", "calculated", null, "mL", false, 6, { readonlyAuto: true, section: "Drug Information" }),
    ff(F005, id005("route", "f005-route"), "route", "Route", "calculated", null, null, false, 7, { readonlyAuto: true, section: "Administration" }),
    ff(F005, id005("administered_by", "f005-administered_by"), "administered_by", "Administered by", "text", null, null, true, 8, { section: "Administration" }),
  ];
  const F025_FIELDS: FF[] = [
    ff(F025, "f025-retreatment_date", "retreatment_date", "Re-treatment date", "date", null, null, true, 1, null),
    ff(F025, "f025-test_article", "test_article", "Test article", "select", ["T01", "T02", "T03"], null, false, 2, { autoFromArm: true, hint: "Auto-populated from the randomization assignment.", section: "Re-treatment" }),
    ff(F025, "f025-lot", "lot_number", "Lot number", "select", null, null, false, 3, { hint: "Select from the lots available for this animal's arm.", section: "Re-treatment" }),
    ff(F025, "f025-unit_id", "unit_id", "Unit / Vial ID", "select", null, null, true, 4, { hint: "Select the physical unit from the chosen lot.", section: "Re-treatment" }),
    ff(F025, "f025-weight", "body_weight_retreatment", "Body weight at re-treatment", "number", null, "kg", true, 5, null),
    ff(F025, "f025-calculated_dose", "calculated_dose", "Calculated dose", "calculated", null, "mL", false, 6, { readonlyAuto: true, section: "Re-treatment" }),
    ff(F025, "f025-route", "route", "Route", "calculated", null, null, false, 7, { readonlyAuto: true, section: "Re-treatment" }),
    ff(F025, "f025-administered_by", "administered_by", "Administered by", "text", null, null, true, 8, { section: "Re-treatment" }),
    ff(F025, "f025-reason", "retreatment_reason", "Reason for re-treatment", "select", ["DART ≥ 2 at Day 3", "DART ≥ 2 at Day 7", "Other"], null, true, 9, null),
    ff(F025, "f025-notes", "notes", "Notes", "textarea", null, null, false, 10, null),
  ];
  // Fields dropped outright (arm assignment belongs only on the Randomization form):
  // BR Screening "Randomized arm" + PH Pen Demographics "Treatment arm". Matched by
  // form + code (robust to any field-ID change) rather than a hardcoded ID.
  const DROP_FIELD_MATCHERS: { form: string; code: string }[] = [
    { form: "61000002-0000-0000-0000-000000002502", code: "randomized_arm" }, // BR Screening / BRD Case Definition
    { form: "61000002-0000-0000-0000-000000002502", code: "dart_recommended_action" }, // BR Screening — DART action banner (redundant with the randomization prompt)
    { form: "61000002-0000-0000-0000-000000002401", code: "treatment_arm" }, // PH Pen Demographics & Setup
  ];
  const shouldDropField = (f: FF): boolean => {
    const hit = DROP_FIELD_MATCHERS.some((m) => f.form_id === m.form && f.code === m.code);
    if (hit && typeof console !== "undefined") console.warn(`[hydrate] dropped field "${f.code}" (${f.id}) from form ${f.form_id}`);
    return hit;
  };

  // ─── BR-2502 Vital Signs (5 forms) + Clinical Response (5 forms) reshape ────
  // Vital Signs → 7 fields (drop the duplicated clinical sub-components, add body
  // weight). Clinical Response → DART read-only from Vital Signs; Response vs
  // baseline / Temperature normalized / Requires re-treatment become calculated.
  // Match the Vital Signs / Clinical Response forms BY NAME (not hardcoded IDs) so
  // EVERY visit (Day 0/3/7/14/28) gets the identical reshape — robust to whatever
  // form IDs the live DB actually carries. (Day 3/7 differing from Day 28 was an
  // ID-match miss when the live DB's IDs drifted from the hardcoded list.)
  const brVsForms = (forms.data ?? []).filter((f) => f.study_id === brStudyId && /Vital Signs/i.test(f.name));
  const brCrForms = (forms.data ?? []).filter((f) => f.study_id === brStudyId && /Clinical Response/i.test(f.name));
  if (typeof console !== "undefined") console.warn(`[hydrate] BR reshape — Vital Signs: [${brVsForms.map((f) => f.name).join(", ")}] · Clinical Response: [${brCrForms.map((f) => f.name).join(", ")}]`);
  const byForm = (fid: string) => new Map((formFields as FF[]).filter((f) => f.form_id === fid).map((f) => [f.code, f]));
  const vsFields: FF[] = [];
  for (const vf of brVsForms) {
    const fid = vf.id;
    const ex = byForm(fid);
    let seq = 1;
    for (const code of ["visit_date", "rectal_temp", "heart_rate", "resp_rate"]) { const f = ex.get(code); if (f) vsFields.push({ ...f, sequence: seq++ }); }
    vsFields.push(ff(fid, `${fid}-body_weight`, "body_weight", "Body weight", "number", null, "kg", true, seq++, { vital: "weight", section: "Vital Signs" }));
    const dart = ex.get("clinical_illness_score"); if (dart) vsFields.push({ ...dart, sequence: seq++ });
    // DART recommended-action banner belongs on Vital Signs (post-enrolment monitoring).
    const dartAction = ex.get("dart_recommended_action");
    vsFields.push(dartAction ? { ...dartAction, sequence: seq++ } : ff(fid, `${fid}-dart_action`, "dart_recommended_action", "Recommended action", "calculated", null, null, false, seq++, { readonlyAuto: true, dartSource: "clinical_illness_score" }));
  }
  const crFields: FF[] = [];
  for (const cf of brCrForms) {
    const fid = cf.id;
    const ex = byForm(fid);
    const isDay0 = /day\s*0\b/i.test(cf.name);
    const keep = (code: string, seq: number) => { const f = ex.get(code); return f ? { ...f, sequence: seq } : null; };
    let seq = 1;
    const out: (FF | null)[] = [
      keep("visit_date", seq++) ?? ff(fid, `${fid}-visit_date`, "visit_date", "Visit date", "date", null, null, true, seq - 1, null),
      ff(fid, `${fid}-dart_at_visit`, "dart_at_visit", "DART at this visit", "calculated", null, null, false, seq++, { readonlyAuto: true }),
      isDay0 ? null : ff(fid, ex.get("response_vs_baseline")?.id ?? `${fid}-response`, "response_vs_baseline", "Response vs baseline", "calculated", null, null, false, seq++, { readonlyAuto: true }),
      ff(fid, ex.get("temperature_normalized")?.id ?? `${fid}-tempnorm`, "temperature_normalized", "Temperature normalized (< 40.0 °C)", "calculated", null, null, false, seq++, { readonlyAuto: true }),
      keep("treatment_success_interim", seq++) ?? ff(fid, `${fid}-success`, "treatment_success_interim", "Treatment success (interim)", "radio", ["Yes", "No"], null, false, seq - 1, null),
      isDay0 ? null : ff(fid, ex.get("requires_retreatment")?.id ?? `${fid}-req`, "requires_retreatment", "Requires re-treatment", "calculated", null, null, false, seq++, { readonlyAuto: true }),
      keep("assessor", seq++) ?? ff(fid, `${fid}-assessor`, "assessor", "Assessor", "text", null, null, true, seq - 1, null),
    ];
    crFields.push(...out.filter((x): x is FF => x !== null));
  }
  // ─── CA-0801 Study Drug Dispensation / Accountability reshape ───────────────
  // Baseline (F014) dispenses a kit; Follow-Up 1/2/3 (F020/F028/F036) return the
  // prior kit + dispense the next + record condition; EOS (F046) is a final return.
  // Field codes drive the Dispensing log + Settings → Inventory triggers.
  const CA_F014 = "6100000e-0000-0000-0000-000000000801"; // Study Drug Dispensation (Baseline)
  const CA_F020 = "61000014-0000-0000-0000-000000000801"; // Study Drug Accountability (Follow-Up 1)
  const CA_F028 = "6100001c-0000-0000-0000-000000000801"; // Study Drug Accountability (Follow-Up 2)
  const CA_F036 = "61000024-0000-0000-0000-000000000801"; // Study Drug Accountability (Follow-Up 3)
  const CA_F046 = CA_F046_ID;                              // Study Drug Accountability (End of Study)
  const CA_COND = ["Intact / sealed", "Partially used — good condition", "Partially used — compromised", "Damaged", "Expired", "Unknown"];
  const RET = "Return (from previous visit)", DISP = "Dispensing (this visit)", VIS = "Visit";
  const caDispense = (fid: string, p: string): FF[] => [
    ff(fid, `${p}-dispensed_kit_number`, "dispensed_kit_number", "Dispensed kit number", "text", null, null, true, 1, { section: DISP }),
    ff(fid, `${p}-vol_dispensed`, "vol_dispensed", "Vol dispensed", "number", null, "ml", true, 2, { section: DISP }),
    ff(fid, `${p}-visit_date`, "visit_date", "Visit date", "date", null, null, false, 3, { section: VIS, hint: "Pulled from the visit / Physical Examination." }),
  ];
  // Order groups fields by section (Visit → Return → Dispensing) so the renderer's
  // section dividers come out contiguous, with Visit on top.
  const caAccountability = (fid: string, p: string): FF[] => [
    ff(fid, `${p}-visit_date`, "visit_date", "Visit date", "date", null, null, false, 1, { section: VIS }),
    ff(fid, `${p}-returned_kit_number`, "returned_kit_number", "Returned kit number", "text", null, null, true, 2, { section: RET }),
    ff(fid, `${p}-vol_returned`, "vol_returned", "Vol returned", "number", null, "ml", true, 3, { section: RET }),
    ff(fid, `${p}-vol_used_calc`, "vol_used_calc", "Vol used (calc)", "calculated", null, "ml", false, 4, { readonlyAuto: true, section: RET, hint: "Initial volume − volume returned." }),
    ff(fid, `${p}-unit_condition_on_return`, "unit_condition_on_return", "Unit condition on return", "select", CA_COND, null, false, 5, { section: RET }),
    ff(fid, `${p}-dispensed_kit_number`, "dispensed_kit_number", "Dispensed kit number", "text", null, null, true, 6, { section: DISP }),
    ff(fid, `${p}-vol_dispensed`, "vol_dispensed", "Vol dispensed", "number", null, "ml", true, 7, { section: DISP }),
  ];
  const caReturn = (fid: string, p: string): FF[] => [
    ff(fid, `${p}-returned_kit_number`, "returned_kit_number", "Returned kit number", "text", null, null, true, 1, { section: RET }),
    ff(fid, `${p}-vol_returned`, "vol_returned", "Vol returned", "number", null, "ml", true, 2, { section: RET }),
    ff(fid, `${p}-vol_used_calc`, "vol_used_calc", "Vol used (calc)", "calculated", null, "ml", false, 3, { readonlyAuto: true, section: RET, hint: "Initial volume − volume returned." }),
  ];
  const CA_FIELDS: FF[] = [
    ...caDispense(CA_F014, "f014"),
    ...caAccountability(CA_F020, "f020"),
    ...caAccountability(CA_F028, "f028"),
    ...caAccountability(CA_F036, "f036"),
    ...caReturn(CA_F046, "f046"),
  ];

  // ─── PH-2401 Randomization & Arm Assignment (F003) — rebuild field set ───────
  // The live DB's F003 drifted to an empty shell (no fields render). Rebuild it here
  // (robust to DB drift, like the BR/CA reshapes above). PH randomization is open-label
  // and pen-level: the assigned arm is auto-populated from the pen's randomization_arm.
  const PH_F003 = "61000003-0000-0000-0000-000000002401";
  const PH_F003_FIELDS: FF[] = [
    ff(PH_F003, "f003-randomization_date", "randomization_date", "Randomization date", "date", null, null, true, 1, { section: "Randomization" }),
    ff(PH_F003, "f003-randomization_method", "randomization_method", "Randomization method", "select", ["Computer-generated list", "Envelope", "Other"], null, false, 2, { section: "Randomization" }),
    ff(PH_F003, "f003-block_number", "block_number", "Block number", "number", null, null, false, 3, { section: "Randomization" }),
    ff(PH_F003, "f003-assigned_arm", "assigned_arm", "Assigned arm", "select", ["T01 Control", "T02 Phytogenic"], null, true, 4, { section: "Randomization", hint: "Auto-populated from the pen's randomization assignment." }),
    ff(PH_F003, "f003-test_article_lot", "test_article_lot", "Test article lot number", "text", null, null, false, 5, { section: "Randomization" }),
    ff(PH_F003, "f003-additive_inclusion_rate", "additive_inclusion_rate", "Additive inclusion rate", "number", null, "%", false, 6, { section: "Randomization" }),
    ff(PH_F003, "f003-randomized_by", "randomized_by", "Confirmed by", "text", null, null, false, 7, { section: "Randomization" }),
  ];

  // ─── CA-0801 Informed Consent (ICF) form + a Safety & Events group ──────────
  // GCP: no subject should be enrolled without documented consent. The ICF is a
  // standalone study-level form (not visit-bound, no group), sequenced before every
  // existing CA form so it sits first in the sidebar. "Safety & Events" is the group
  // the renamed ConMed form now lives in (sequenced last).
  const caFormRows = (forms.data ?? []).filter((f) => f.study_id === caStudyId);
  const caMinSeq = caFormRows.length ? Math.min(...caFormRows.map((f) => f.sequence)) : 0;
  const caMaxSeq = caFormRows.length ? Math.max(...caFormRows.map((f) => f.sequence)) : 0;
  const caNewForms: Dataset["forms"] = caStudyId ? [
    { id: CA_ICF_FORM, study_id: caStudyId, visit_id: null, parent_form_id: null, code: "informed_consent", name: "Informed Consent", sequence: caMinSeq - 1 },
    { id: CA_SAFETY_GROUP, study_id: caStudyId, visit_id: null, parent_form_id: null, code: "safety_events", name: "Safety & Events", sequence: caMaxSeq + 1 },
  ] : [];
  const CA_ICF_FIELDS: FF[] = caStudyId ? [
    ff(CA_ICF_FORM, "icf-owner_name", "owner_guardian_name", "Owner / guardian name", "text", null, null, true, 1, { section: "Consent" }),
    ff(CA_ICF_FORM, "icf-relationship", "relationship_to_animal", "Relationship to animal", "select", ["Owner", "Authorized representative"], null, true, 2, { section: "Consent" }),
    ff(CA_ICF_FORM, "icf-consent_date", "consent_date", "Consent date", "date", null, null, true, 3, { section: "Consent", hint: "Must be on or before the screening date." }),
    ff(CA_ICF_FORM, "icf-protocol_version", "protocol_version_consented", "Protocol version consented to", "select", ["v1.0", "v2.0", "v2.1"], null, true, 4, { section: "Consent", hint: "From Settings → Protocol & Amendments." }),
    ff(CA_ICF_FORM, "icf-witness_name", "witness_name", "Witness name", "text", null, null, false, 5, { section: "Consent" }),
    ff(CA_ICF_FORM, "icf-esign_ack", "esign_acknowledgment", "Electronic signature acknowledgment", "checkbox", ["I confirm that informed consent was obtained prior to any study procedures"], null, true, 6, { section: "Signature" }),
    ff(CA_ICF_FORM, "icf-version_notes", "consent_version_notes", "Consent version notes", "textarea", null, null, false, 7, { section: "Signature" }),
  ] : [];

  const RESHAPED_FORM_IDS = new Set([F005, F025, CA_F014, CA_F020, CA_F028, CA_F036, CA_F046, PH_F003, ...brVsForms.map((f) => f.id), ...brCrForms.map((f) => f.id)]);
  const reshapedFormFields: FF[] = [
    ...(formFields as FF[]).filter((f) => !RESHAPED_FORM_IDS.has((f.form_id ?? "").toLowerCase()) && !RESHAPED_FORM_IDS.has(f.form_id) && !shouldDropField(f)),
    ...F005_FIELDS, ...F025_FIELDS, ...vsFields, ...crFields, ...CA_FIELDS, ...PH_F003_FIELDS, ...CA_ICF_FIELDS,
  ];

  // Seed the BR-2502 CO-001 Re-treatment Log entry. The live DB already has an F025
  // instance for CO-001 (retreat:true), but its values are keyed to the ORIGINAL F025
  // fields, which the reshape above replaced — so they're orphaned and the repeating
  // table + Dispensing log render blanks. Re-seed values onto that SAME instance using
  // the NEW reshaped field ids (the codes the table/log read: retreatment_date,
  // lot_number, unit_id, body_weight_retreatment, administered_by, retreatment_reason).
  // Supabase lowercases UUIDs, so match the subject id case-insensitively; fall back to
  // a synthetic instance only if the real one is absent.
  const CO001 = "340a0000-0000-0000-0000-000000002502";
  const fInst = formInstances as Dataset["formInstances"];
  const rtFv = fieldValues as Dataset["fieldValues"];
  let coRetreat = fInst.find((i) => i.form_id === F025 && (i.subject_id ?? "").toLowerCase() === CO001);
  if (!coRetreat && (subjects.data ?? []).some((s) => (s.id ?? "").toLowerCase() === CO001)) {
    coRetreat = { id: "fi-retreat-co001", form_id: F025, subject_id: CO001, status: "in_work" };
    fInst.push(coRetreat);
  }
  if (coRetreat) {
    const iid = coRetreat.id;
    const seedRt = (fieldId: string, value: string) => {
      if (!rtFv.some((v) => v.form_instance_id === iid && v.form_field_id === fieldId))
        rtFv.push({ id: `fv-rt-${iid}-${fieldId}`, form_instance_id: iid, form_field_id: fieldId, value });
    };
    seedRt("f025-retreatment_date", "2026-05-20");
    seedRt("f025-lot", "LOT-BR-T01");
    seedRt("f025-unit_id", "T01-4410"); // fresh T01 unit for the re-treatment
    seedRt("f025-weight", "192");
    seedRt("f025-administered_by", "M. Okafor");
    seedRt("f025-reason", "DART ≥ 2 at Day 7");
  }
  // Seed Treatment Admin date + administrator + physical unit/vial ID on each
  // BR-2502 F005 instance so the Dispensing log (derived from forms) + the forms
  // show real data (lot/drug/dose are derived from the arm at read time). Each
  // animal gets its OWN vial from its arm's pool (no reuse) — ids are arm-prefixed
  // (e.g. T01-4400) so they tie back to the inventory lot for that arm. Withdrawal
  // then measures from the administration date.
  {
    const fvArr = fieldValues as Dataset["fieldValues"];
    const STAFF = ["M. Okafor", "L. Brandt", "P. Castellano", "R. Singh"];
    const brSubjById = new Map((subjects.data ?? []).map((s) => [s.id, s]));
    const armOf = (id: string | null | undefined) =>
      ((id ? brSubjById.get(id)?.randomization_arm : "") ?? "").match(/T0\d/)?.[0] ?? "T01";
    const armSeq: Record<string, number> = {}; // per-arm running count → unique vial id
    fInst.filter((i) => i.form_id === F005 && i.subject_id).forEach((inst, idx) => {
      if (fvArr.some((v) => v.form_instance_id === inst.id && v.form_field_id === "f005-date_administered")) return;
      const arm = armOf(inst.subject_id);
      const n = (armSeq[arm] = (armSeq[arm] ?? 0) + 1);
      const unitId = `${arm}-${4400 + (n - 1)}`; // T01-4400, T01-4401, T02-4400, …
      fvArr.push(
        { id: `fv-ta-date-${inst.id}`, form_instance_id: inst.id, form_field_id: "f005-date_administered", value: "2026-05-15" },
        { id: `fv-ta-by-${inst.id}`, form_instance_id: inst.id, form_field_id: "f005-administered_by", value: STAFF[idx % STAFF.length] },
        { id: `fv-ta-unit-${inst.id}`, form_instance_id: inst.id, form_field_id: "f005-unit_id", value: unitId },
      );
    });
  }

  // ─── BR-2502 treatment-phase completion — realistic in-progress SoE ──────────
  // The Schedule of Events overlays live completion onto the protocol grid. Dosing
  // was 2026-05-15, so every treatment visit is now past-window → the grid read as
  // all-overdue. Finalize the EARLY treatment visits (Day 0 → Day 14) for the
  // majority of active subjects so those columns clear to their base protocol
  // markers, while Day 21/28/42 stay incomplete (overdue / due). The per-day visit
  // form buildVisits() reads is the Vital Signs form; ~2 active subjects are left
  // behind for realistic texture.
  {
    const EARLY_DAYS = new Set([0, 3, 7, 14]);
    const dayOfName = (name?: string): number | null => { const m = /Day\s+(\d+)/i.exec(name ?? ""); return m ? Number(m[1]) : null; };
    const earlyVsFormIds = brVsForms.filter((f) => { const d = dayOfName(f.name); return d != null && EARLY_DAYS.has(d); }).map((f) => f.id);
    const brActive = (subjects.data ?? []).filter((s) => s.study_id === brStudyId && s.status === "active");
    const toComplete = brActive.slice(0, Math.max(1, brActive.length - 2)); // leave ~2 stragglers
    for (const subj of toComplete) {
      for (const formId of earlyVsFormIds) {
        const inst = fInst.find((i) => i.form_id === formId && i.subject_id === subj.id);
        if (inst) inst.status = "finalized";
        else fInst.push({ id: `fi-br-early-${subj.id}-${formId}`, form_id: formId, subject_id: subj.id, status: "finalized" });
      }
    }
  }

  // ─── CA-0801 / PH-2401 treatment-phase completion — realistic in-progress SoE
  // Same dominant-state fix as BR-2502, generalised: finalize the EARLY visit
  // forms for the majority of active subjects/pens so those SoE columns clear to
  // base markers, leaving the later visits overdue. The picked visit form per day
  // mirrors buildVisits() exactly — the lowest-sequence subject-scoped form that
  // carries a visit-date field — so we flip precisely the instance it reads.
  // CA early = Day 14/28 (Baseline has no scheduled visit form); PH early = Wk 1-3
  // (Day 7/14/21). ~2 subjects are left behind, guaranteeing a strict majority.
  {
    const VISIT_DATE_CODES = new Set(["visit_date", "weighing_date", "observation_date"]);
    const allForms = forms.data ?? [];
    const formById = new Map(allForms.map((f) => [f.id, f]));
    const dayOfName = (name?: string | null): number | null => {
      const d = /Day\s+(\d+)/i.exec(name ?? ""); if (d) return Number(d[1]);
      const w = /Week\s+(\d+)/i.exec(name ?? ""); return w ? Number(w[1]) * 7 : null;
    };
    const dateFormIds = new Set<string>();
    for (const ff of (formFields as FF[])) if (VISIT_DATE_CODES.has(ff.code)) dateFormIds.add(ff.form_id);

    const finalizeEarly = (code: string, targetDays: Set<number>) => {
      const sid = (studies.data ?? []).find((s) => s.code === code)?.id;
      if (!sid) return;
      // Picked visit form per day: lowest-sequence subject-scoped date form (buildVisits parity).
      const pickByDay = new Map<number, { id: string; seq: number }>();
      for (const fid of Array.from(dateFormIds)) {
        const f = formById.get(fid);
        if (!f || f.study_id !== sid || (f.scope ?? "subject") !== "subject") continue;
        const parent = f.parent_form_id ? formById.get(f.parent_form_id) : null;
        const day = dayOfName(f.name) ?? dayOfName(parent?.name);
        if (day == null || !targetDays.has(day)) continue;
        const prev = pickByDay.get(day);
        if (!prev || f.sequence < prev.seq) pickByDay.set(day, { id: fid, seq: f.sequence });
      }
      const pickedFormIds = Array.from(pickByDay.values()).map((v) => v.id);
      const active = (subjects.data ?? []).filter((s) => s.study_id === sid && s.status === "active");
      const nDone = Math.max(active.length - 2, Math.floor(active.length / 2) + 1); // strict majority, ~2 stragglers
      for (const subj of active.slice(0, nDone)) {
        for (const formId of pickedFormIds) {
          const inst = fInst.find((i) => i.form_id === formId && i.subject_id === subj.id);
          if (inst) inst.status = "finalized";
          else fInst.push({ id: `fi-early-${subj.id}-${formId}`, form_id: formId, subject_id: subj.id, status: "finalized" });
        }
      }
    };
    finalizeEarly("CA-0801", new Set([0, 14, 28]));
    finalizeEarly("PH-2401", new Set([7, 14, 21]));
  }

  // ─── CA-0801 Study Drug Dispensation / Accountability values ────────────────
  // The reshape above replaced the CA drug-form fields, orphaning the live DB values.
  // Re-seed the new field codes on each existing instance for active/completed dogs:
  // kit numbers carry the per-visit unit suffix (A-001-V1 …), vol_dispensed = 60,
  // vol_returned is a realistic partial (8–15 ml), vol_used_calc = 60 − returned,
  // unit_condition mostly "good" with one "Intact / sealed" per study. Base kit per
  // subject mirrors the inventory seed + Dispensing-log positional assignment.
  {
    const caId = (studies.data ?? []).find((s) => s.code === "CA-0801")?.id;
    if (caId) {
      const caSubs = (subjects.data ?? []).filter((s) => s.study_id === caId).slice().sort((a, b) => (a.subject_code < b.subject_code ? -1 : 1));
      const CA_KITS = ["A-001", "A-002", "A-003", "A-004", "A-005", "B-001", "B-002", "B-003", "B-004", "B-005", "B-006", "B-007", "B-008"];
      const baseKitBy = new Map<string, string>();
      const idxBy = new Map<string, number>();
      caSubs.forEach((s, i) => { if (CA_KITS[i]) baseKitBy.set(s.id, CA_KITS[i]); idxBy.set(s.id, i); });
      const cfv = fieldValues as Dataset["fieldValues"];
      const seed = (instId: string, fieldId: string, value: string) => {
        if (!cfv.some((v) => v.form_instance_id === instId && v.form_field_id === fieldId))
          cfv.push({ id: `fv-ca-${instId}-${fieldId}`, form_instance_id: instId, form_field_id: fieldId, value });
      };
      const VISITS = [
        { form: CA_F014, p: "f014", n: 1, date: "2026-03-09", kind: "dispense" },
        { form: CA_F020, p: "f020", n: 2, date: "2026-03-23", kind: "acct" },
        { form: CA_F028, p: "f028", n: 3, date: "2026-04-06", kind: "acct" },
        { form: CA_F036, p: "f036", n: 4, date: "2026-05-04", kind: "acct" },
        { form: CA_F046, p: "f046", n: 5, date: "2026-06-01", kind: "return" },
      ];
      for (const vm of VISITS) {
        for (const inst of formInstances as Dataset["formInstances"]) {
          if ((inst.form_id ?? "").toLowerCase() !== vm.form || !inst.subject_id) continue;
          const base = baseKitBy.get(inst.subject_id); if (!base) continue;
          const idx = idxBy.get(inst.subject_id) ?? 0;
          const ret = 8 + (idx % 8); // 8–15 ml remaining
          const cond = idx % 6 === 0 ? "Intact / sealed" : "Partially used — good condition";
          if (vm.kind === "dispense") {
            seed(inst.id, `${vm.p}-dispensed_kit_number`, `${base}-V${vm.n}`);
            seed(inst.id, `${vm.p}-vol_dispensed`, "60");
            seed(inst.id, `${vm.p}-visit_date`, vm.date);
          } else if (vm.kind === "acct") {
            seed(inst.id, `${vm.p}-returned_kit_number`, `${base}-V${vm.n - 1}`);
            seed(inst.id, `${vm.p}-vol_returned`, String(ret));
            seed(inst.id, `${vm.p}-vol_used_calc`, String(60 - ret));
            seed(inst.id, `${vm.p}-dispensed_kit_number`, `${base}-V${vm.n}`);
            seed(inst.id, `${vm.p}-vol_dispensed`, "60");
            seed(inst.id, `${vm.p}-unit_condition_on_return`, cond);
            seed(inst.id, `${vm.p}-visit_date`, vm.date);
          } else { // EOS return
            seed(inst.id, `${vm.p}-returned_kit_number`, `${base}-V4`);
            seed(inst.id, `${vm.p}-vol_returned`, String(ret));
            seed(inst.id, `${vm.p}-vol_used_calc`, String(60 - ret));
          }
        }
      }
    }
  }

  // ─── PH-2401 Randomization & Arm Assignment values ──────────────────────────
  // Ensure each randomized pen has an F003 instance and seed its assignment from the
  // pen's randomization_arm (open-label, pen-level). Un-randomized pens are left blank.
  {
    const phId = (studies.data ?? []).find((s) => s.code === "PH-2401")?.id;
    if (phId) {
      const phPens = (subjects.data ?? []).filter((s) => s.study_id === phId);
      const fvArr = fieldValues as Dataset["fieldValues"];
      phPens.forEach((pen, idx) => {
        const arm = pen.randomization_arm;
        if (!arm) return; // un-randomized pen → form stays blank for manual entry
        let inst = fInst.find((i) => (i.form_id ?? "").toLowerCase() === PH_F003 && i.subject_id === pen.id);
        if (!inst) { inst = { id: `fi-ph-rand-${pen.id}`, form_id: PH_F003, subject_id: pen.id, status: "in_work" }; fInst.push(inst); }
        const iid = inst.id;
        const seed = (suffix: string, fieldId: string, value: string) => {
          if (!fvArr.some((v) => v.form_instance_id === iid && v.form_field_id === fieldId))
            fvArr.push({ id: `fv-ph-rand-${iid}-${suffix}`, form_instance_id: iid, form_field_id: fieldId, value });
        };
        const isPhyto = arm.startsWith("T02");
        seed("date", "f003-randomization_date", "2026-02-10");
        seed("method", "f003-randomization_method", "Computer-generated list");
        seed("block", "f003-block_number", String((idx % 5) + 1));
        seed("arm", "f003-assigned_arm", arm);
        seed("lot", "f003-test_article_lot", isPhyto ? "LOT-PHY-0.05" : "LOT-CTRL-00");
        seed("rate", "f003-additive_inclusion_rate", isPhyto ? "0.05" : "0");
        seed("by", "f003-randomized_by", "S. Mwangi");
      });
    }
  }

  // ─── CA-0801 Informed Consent (ICF) — one completed record per enrolled dog ──
  // GCP requirement: consent documented before enrolment. Seeded finalized, with the
  // owner name pulled from companion_owners, consent on/before screening, protocol
  // v2.1, and the e-signature acknowledgment checked.
  if (caStudyId) {
    const ENROLLED = new Set(["randomized", "enrolled", "active", "completed", "withdrawn"]);
    const caDogs = (subjects.data ?? []).filter((s) => s.study_id === caStudyId && ENROLLED.has(s.status));
    const ownerName = new Map((owners.data ?? []).map((o) => [o.id, o.full_name]));
    const fInstA = formInstances as Dataset["formInstances"];
    const fvA = fieldValues as Dataset["fieldValues"];
    caDogs.forEach((dog, i) => {
      const iid = `fi-icf-${dog.id}`;
      if (!fInstA.some((x) => x.id === iid)) fInstA.push({ id: iid, form_id: CA_ICF_FORM, subject_id: dog.id, status: "finalized" });
      const seed = (fieldId: string, value: string) => {
        if (value === "") return;
        if (!fvA.some((v) => v.form_instance_id === iid && v.form_field_id === fieldId))
          fvA.push({ id: `fv-icf-${dog.id}-${fieldId}`, form_instance_id: iid, form_field_id: fieldId, value });
      };
      seed("icf-owner_name", (dog.owner_id ? ownerName.get(dog.owner_id) : "") || "Owner of record");
      seed("icf-relationship", "Owner");
      seed("icf-consent_date", "2026-03-05");
      seed("icf-protocol_version", "v2.1");
      seed("icf-witness_name", i % 2 === 0 ? "Dr. A. Reyes" : "Dr. M. Chen");
      seed("icf-esign_ack", JSON.stringify(["I confirm that informed consent was obtained prior to any study procedures"]));
    });
  }

  // ─── CA-0801 Concomitant Medications — 2–3 entries per completed dog ─────────
  // The renamed ConMed form (now "Concomitant Medications", in Safety & Events) is a
  // repeating log. Seed prior atopic-dermatitis meds (Apoquel, Cytopoint) discontinued
  // at study start, plus one ongoing otitis medication on the first completed dog.
  if (caStudyId) {
    const caConmedForm = (forms.data ?? []).find((f) => f.study_id === caStudyId && f.name === "ConMed");
    if (caConmedForm) {
      const cid = caConmedForm.id;
      const cmField = (code: string) => (formFields as FF[]).find((f) => f.form_id === cid && f.code === code)?.id;
      const completedDogs = (subjects.data ?? []).filter((s) => s.study_id === caStudyId && s.status === "completed");
      const fInstC = formInstances as Dataset["formInstances"];
      const fvC = fieldValues as Dataset["fieldValues"];
      const seedEntry = (dogId: string, n: number, vals: Record<string, string>) => {
        const iid = `fi-conmed-${dogId}-${n}`;
        if (!fInstC.some((x) => x.id === iid)) fInstC.push({ id: iid, form_id: cid, subject_id: dogId, status: "finalized" });
        for (const [code, value] of Object.entries(vals)) {
          if (value === "") continue;
          const fid = cmField(code); if (!fid) continue;
          if (!fvC.some((v) => v.form_instance_id === iid && v.form_field_id === fid))
            fvC.push({ id: `fv-conmed-${dogId}-${n}-${code}`, form_instance_id: iid, form_field_id: fid, value });
        }
      };
      completedDogs.forEach((dog, di) => {
        seedEntry(dog.id, 1, { medication_name: "Apoquel (oclacitinib)", indication: "Atopic dermatitis — pruritus", dose: "0.5 mg/kg", frequency: "q12h", route: "Oral", start_date: "2025-12-01", end_date: "2026-03-04", ongoing: "No", investigator_comments: "Prior medication, discontinued at study start." });
        seedEntry(dog.id, 2, { medication_name: "Cytopoint (lokivetmab)", indication: "Atopic dermatitis — pruritus", dose: "2 mg/kg", frequency: "q28d", route: "Injectable", start_date: "2025-11-15", end_date: "2026-03-04", ongoing: "No", investigator_comments: "Prior medication, discontinued at study start." });
        if (di === 0) seedEntry(dog.id, 3, { medication_name: "Osurnia (florfenicol / terbinafine / betamethasone)", indication: "Otitis externa (recurrent)", dose: "1 tube per affected ear", frequency: "Day 1 and Day 7", route: "Topical", start_date: "2026-04-10", ongoing: "Yes", investigator_comments: "Ongoing — recurrent otitis, managed concurrently with study diet." });
      });
    }
  }

  // ─── PH-2401 weekly FCR values (Fix 5) ──────────────────────────────────────
  // Seed fcr_this_period + cumulative_fcr on each pen's existing weekly "Body Weight
  // & Feed — Day D" instance, phase-realistic (Starter ~1.4, Grower ~1.7, Finisher
  // ~1.9–2.0). Some finisher weeks land just above the 2.0 target → amber flag.
  {
    const phId = (studies.data ?? []).find((s) => s.code === "PH-2401")?.id;
    if (phId) {
      const phPens = (subjects.data ?? []).filter((s) => s.study_id === phId);
      const bwForms = (forms.data ?? []).filter((f) => f.study_id === phId && /Body Weight & Feed/i.test(f.name));
      const fInstP = formInstances as Dataset["formInstances"];
      const fvP = fieldValues as Dataset["fieldValues"];
      const fieldId = (formId: string, code: string) => (formFields as FF[]).find((f) => f.form_id === formId && f.code === code)?.id;
      phPens.forEach((pen, penIdx) => {
        for (const form of bwForms) {
          const inst = fInstP.find((i) => i.form_id === form.id && i.subject_id === pen.id);
          if (!inst) continue; // only weeks that actually exist
          const day = Number((form.name.match(/Day\s+(\d+)/i) ?? [])[1]);
          if (!day) continue;
          const wk = Math.round(day / 7); // 1..6
          const bump = ((penIdx % 3) - 1) * 0.05; // -0.05 / 0 / +0.05 per pen
          const base = wk <= 2 ? 1.35 + wk * 0.03 : wk <= 4 ? 1.55 + wk * 0.05 : 1.85 + wk * 0.03;
          const fcr = (base + bump).toFixed(2); // finisher wk6 (bump ≥ 0) → > 2.0
          const cum = (1.30 + wk * 0.06).toFixed(2);
          const fThis = fieldId(form.id, "fcr_this_period");
          const fCum = fieldId(form.id, "cumulative_fcr");
          if (fThis && !fvP.some((v) => v.form_instance_id === inst.id && v.form_field_id === fThis))
            fvP.push({ id: `fv-fcr-${inst.id}`, form_instance_id: inst.id, form_field_id: fThis, value: fcr });
          if (fCum && !fvP.some((v) => v.form_instance_id === inst.id && v.form_field_id === fCum))
            fvP.push({ id: `fv-cumfcr-${inst.id}`, form_instance_id: inst.id, form_field_id: fCum, value: cum });
        }
      });
    }
  }

  // ─── BR-2502 Feedlot CO — Protocol Amendments site CRF (one addendum) ───────
  // The Protocol Amendments form is site-scoped + repeating (one instance per entry).
  // Seed a single addendum on the Feedlot CO site instance — this is the single source
  // of truth for the Settings → Protocol & Amendments site-level rollup.
  {
    const brId = (studies.data ?? []).find((s) => s.code === "BR-2502")?.id;
    const coSite = (sites.data ?? []).find((s) => s.study_id === brId && s.code === "CO");
    const paForm = (forms.data ?? []).find((f) => f.study_id === brId && f.name === "Protocol Amendments");
    if (brId && coSite && paForm) {
      const fvArr = fieldValues as Dataset["fieldValues"];
      // The live DB carries a blank placeholder Protocol Amendments instance for this
      // site; keep exactly ONE CO-scoped instance (seed onto the first, drop the rest +
      // their values) so the table shows one real entry, not a stray empty row.
      const existing = fInst.filter((i) => i.form_id === paForm.id && i.site_id === coSite.id);
      let inst = existing[0];
      if (!inst) { inst = { id: "fi-pa-co-br2502", form_id: paForm.id, subject_id: null, barn_id: null, site_id: coSite.id, status: "in_work" }; fInst.push(inst); }
      const iid = inst.id;
      const strayIds = new Set(existing.filter((i) => i.id !== iid).map((i) => i.id));
      if (strayIds.size) {
        for (let k = fInst.length - 1; k >= 0; k--) if (strayIds.has(fInst[k].id)) fInst.splice(k, 1);
        for (let k = fvArr.length - 1; k >= 0; k--) if (strayIds.has(fvArr[k].form_instance_id)) fvArr.splice(k, 1);
      }
      const fieldIdByCode = new Map((formFields as FF[]).filter((f) => f.form_id === paForm.id).map((f) => [f.code, f.id]));
      const seed = (code: string, value: string) => {
        const fid = fieldIdByCode.get(code); if (!fid) return;
        if (!fvArr.some((v) => v.form_instance_id === iid && v.form_field_id === fid))
          fvArr.push({ id: `fv-pa-${iid}-${code}`, form_instance_id: iid, form_field_id: fid, value });
      };
      seed("protocol_version", "v1.0a");
      seed("amendment_date", "2026-04-20");
      seed("amendment_summary", "Site-specific addendum: additional welfare checks for heifer subjects");
      seed("iec_approval_date", "2026-04-18");
      seed("subjects_affected", "None");
      seed("status", "Approved");
    }
  }

  // ─── Seeded SDV state (session-only) ────────────────────────────────────────
  // No interactive SDV has run on a fresh tab, so seed verified records to a target
  // % per site — the CRA/DM dashboard SDV bars + lock-readiness then show real
  // progress, and the SDV worklist opens with partially-verified forms. Deterministic
  // (verify the first N% of SDV-eligible field values by id) so it's stable.
  const SDV_TARGETS: Record<string, Record<string, number>> = {
    "CA-0801": { "101": 74, "102": 58, "103": 42 },
    "BR-2502": { TX: 65, KS: 50, NE: 35, CO: 20 },
    "PH-2401": { RUA: 62 },
  };
  const SDV_INELIGIBLE = new Set(["file", "calculated", "textarea"]);
  const studyCodeById = new Map((studies.data ?? []).map((s) => [s.id, s.code]));
  const siteCodeById = new Map((sites.data ?? []).map((s) => [s.id, s.code]));
  const subjById2 = new Map((subjects.data ?? []).map((s) => [s.id, s]));
  const instById2 = new Map((formInstances as Dataset["formInstances"]).map((i) => [i.id, i]));
  const fieldTypeById = new Map((formFields as Dataset["formFields"]).map((f) => [f.id, f.field_type]));
  const fvByBucket = new Map<string, Dataset["fieldValues"]>();
  for (const fv of fieldValues as Dataset["fieldValues"]) {
    if (fv.value == null || fv.value === "") continue;
    const ft = fieldTypeById.get(fv.form_field_id);
    if (!ft || SDV_INELIGIBLE.has(ft)) continue;
    const inst = instById2.get(fv.form_instance_id);
    const subj = inst?.subject_id ? subjById2.get(inst.subject_id) : undefined;
    if (!subj || !subj.site_id) continue;
    const code = studyCodeById.get(subj.study_id), siteCode = siteCodeById.get(subj.site_id);
    if (!code || !siteCode || SDV_TARGETS[code]?.[siteCode] == null) continue;
    const key = `${code}|${siteCode}`;
    (fvByBucket.get(key) ?? fvByBucket.set(key, []).get(key)!).push(fv);
  }
  const seededSdv: Dataset["sdvRecords"] = [];
  for (const [key, fvs] of Array.from(fvByBucket.entries())) {
    const [code, siteCode] = key.split("|");
    const pct = SDV_TARGETS[code][siteCode];
    const sorted = fvs.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const n = Math.round((pct / 100) * sorted.length);
    for (let i = 0; i < n; i++) seededSdv.push({ id: `sdvseed-${sorted[i].id}`, form_instance_id: sorted[i].form_instance_id, field_value_id: sorted[i].id, status: "verified", verified_by_name: "Jordan Reyes", verified_at: "2026-06-12" });
  }
  const sdvWithSeed = [...(sdvRecords as Dataset["sdvRecords"]), ...seededSdv];

  // ─── Seeded concomitant medications (session-only) ──────────────────────────
  // No conmeds table in Supabase — this realistic demo set is injected here (same
  // precedent as the seeded SDV records / BR site targets). Attached to real
  // subjects per study by stable subject_code order so it's deterministic.
  const subjectsOf = (code: string) => {
    const sid = (studies.data ?? []).find((s) => s.code === code)?.id;
    return (subjects.data ?? []).filter((s) => s.study_id === sid).slice().sort((a, b) => (a.subject_code < b.subject_code ? -1 : 1));
  };
  type ConMedSpec = Omit<Dataset["conMeds"][number], "id" | "study_id" | "subject_id">;
  const conMeds: Dataset["conMeds"] = [];
  const pushConMeds = (code: string, specs: ConMedSpec[], pickArmPrefix?: string) => {
    let subs = subjectsOf(code);
    if (pickArmPrefix) {
      const armed = subs.filter((s) => (s.randomization_arm ?? "").startsWith(pickArmPrefix));
      if (armed.length) subs = armed;
    }
    const studyId = (studies.data ?? []).find((s) => s.code === code)?.id ?? "";
    specs.forEach((spec, i) => {
      const subj = subs[i % Math.max(1, subs.length)];
      if (!subj) return;
      conMeds.push({ id: `conmed-${code}-${i}`, study_id: studyId, subject_id: subj.id, ...spec });
    });
  };
  // CA-0801 — prior atopic-dermatitis therapies + washout compliance. Cyclosporine
  // is still ongoing at enrollment (washout incomplete → overlap flag); the JAK
  // inhibitor and steroid stopped well before enrollment (washout clear).
  pushConMeds("CA-0801", [
    { medication: "Cyclosporine", drug_class: "Immunosuppressant", dose: "5 mg/kg", route: "Oral", start_date: "2026-03-20", end_date: null, ongoing: true, indication: "Atopic dermatitis — immunosuppressant (washout incomplete)", concurrent_with: "Baseline", interaction: false, veddra_code: "ciclosporin", coding_status: "coded", washout_days: 28, conmed_type: null },
    { medication: "Oclacitinib (Apoquel)", drug_class: "JAK inhibitor", dose: "0.5 mg/kg", route: "Oral", start_date: "2025-12-01", end_date: "2026-01-15", ongoing: false, indication: "Pruritus — prior therapy", concurrent_with: "Pre-study washout", interaction: false, veddra_code: "oclacitinib maleate", coding_status: "pending", washout_days: 14, conmed_type: null },
    { medication: "Prednisolone", drug_class: "Corticosteroid", dose: "0.5 mg/kg", route: "Oral", start_date: "2026-01-20", end_date: "2026-02-03", ongoing: false, indication: "Flare control — prior therapy", concurrent_with: "Pre-study washout", interaction: false, veddra_code: "prednisolone", coding_status: "coded", washout_days: 14, conmed_type: null },
    { medication: "Saline flush", drug_class: "Other", dose: "10 mL", route: "Injectable, IV", start_date: "2026-04-22", end_date: "2026-04-22", ongoing: false, indication: "Catheter flush", concurrent_with: "Baseline", interaction: false, veddra_code: "N/A — not a regulated drug", coding_status: "excluded", washout_days: 0, conmed_type: null },
  ]);
  // BR-2502 — antibiotics. Tulathromycin given to the whole pen on arrival
  // (metaphylaxis, confounds the antimicrobial endpoint); florfenicol to an
  // individual sick animal (therapeutic).
  pushConMeds("BR-2502", [
    { medication: "Tulathromycin (Draxxin)", drug_class: "Antibiotic — macrolide", dose: "2.5 mg/kg", route: "Injectable, SC", start_date: "2026-01-05", end_date: null, ongoing: true, indication: "BRD metaphylaxis (whole pen, on arrival)", concurrent_with: "Pre-enrollment", interaction: true, veddra_code: "tulathromycin", coding_status: "coded", washout_days: 0, conmed_type: "metaphylaxis" },
    { medication: "Tulathromycin (Draxxin)", drug_class: "Antibiotic — macrolide", dose: "2.5 mg/kg", route: "Injectable, SC", start_date: "2026-01-10", end_date: null, ongoing: true, indication: "BRD metaphylaxis (whole pen, on arrival)", concurrent_with: "Pre-enrollment", interaction: true, veddra_code: "tulathromycin", coding_status: "coded", washout_days: 0, conmed_type: "metaphylaxis" },
    { medication: "Florfenicol (Nuflor)", drug_class: "Antibiotic — phenicol", dose: "40 mg/kg", route: "Injectable, SC", start_date: "2026-01-08", end_date: "2026-01-18", ongoing: false, indication: "Respiratory infection (individual animal)", concurrent_with: "Day 0", interaction: true, veddra_code: "florfenicol", coding_status: "coded", washout_days: 0, conmed_type: "therapeutic" },
    { medication: "Florfenicol (Nuflor)", drug_class: "Antibiotic — phenicol", dose: "40 mg/kg", route: "Injectable, SC", start_date: "2026-01-12", end_date: "2026-01-22", ongoing: false, indication: "Respiratory infection (individual animal)", concurrent_with: "Day 0", interaction: true, veddra_code: "florfenicol", coding_status: "coded", washout_days: 0, conmed_type: "therapeutic" },
  ]);
  // PH-2401 — basal-feed additives / coccidiostat in the T01 control pens (pen-level).
  pushConMeds("PH-2401", [
    { medication: "Salinomycin", drug_class: "Coccidiostat", dose: "60 g/tonne", route: "In-feed", start_date: "2026-03-01", end_date: null, ongoing: true, indication: "Coccidiosis prevention — basal feed", concurrent_with: "Day 0–42", interaction: false, veddra_code: "salinomycin", coding_status: "coded", washout_days: 0, conmed_type: null },
    { medication: "Bacitracin methylene disalicylate", drug_class: "Feed additive", dose: "50 g/tonne", route: "In-feed", start_date: "2026-03-01", end_date: null, ongoing: true, indication: "Enteric health — basal feed", concurrent_with: "Day 0–42", interaction: false, veddra_code: "bacitracin", coding_status: "coded", washout_days: 0, conmed_type: null },
  ], "T01");

  // ─── Seeded SAE reporting timelines (session-only) ──────────────────────────
  // AE forms carry no notification dates, so one realistic SAE per study is seeded
  // here with its GCP/VICH reporting timeline. Attached to a real subject per study.
  type SaeSpec = Omit<Dataset["saeReports"][number], "id" | "study_id" | "subject_id">;
  const saeReports: Dataset["saeReports"] = [];
  const pushSae = (code: string, spec: SaeSpec, suffix = "", subjIdx = 0) => {
    const subj = subjectsOf(code)[subjIdx] ?? subjectsOf(code)[0];
    const studyId = (studies.data ?? []).find((s) => s.code === code)?.id ?? "";
    if (subj) saeReports.push({ id: `sae-${code}${suffix}`, study_id: studyId, subject_id: subj.id, ...spec });
  };
  // CA-0801 — drug-related hypersensitivity; notified same day (filed on time).
  pushSae("CA-0801", { description: "Serious hypersensitivity reaction", onset_date: "2025-09-15", severity: "Severe", relatedness: "Probable", sae_criterion: "Life-threatening", outcome: "Recovered", pi_aware_date: "2025-09-15", sponsor_notified_date: "2025-09-15", veddra_code: "hypersensitivity", veddra_coding: "coded", serious: true, causality: "Related", action_taken: "Drug withdrawn", expectedness: "Unexpected", serious_criteria: ["Life-threatening", "Hospitalization"], regulatory_report_date: "2025-09-21" });
  // BR-2502 — fatal BRD despite treatment; notified +1 day (on time, borderline).
  pushSae("BR-2502", { description: "Fatal bovine respiratory disease despite treatment", onset_date: "2026-01-12", severity: "Severe", relatedness: "Unlikely", sae_criterion: "Death", outcome: "Fatal", pi_aware_date: "2026-01-12", sponsor_notified_date: "2026-01-13", veddra_code: "bovine respiratory disease", veddra_coding: "coded", serious: true, causality: "Not related", action_taken: "No action", expectedness: "Expected", serious_criteria: ["Fatal"], regulatory_report_date: "2026-01-18" });
  // PH-2401 — sudden pen-level mortality spike; report still pending.
  pushSae("PH-2401", { description: "Sudden mortality spike >10% in 24h (pen-level)", onset_date: "2026-03-22", severity: "Severe", relatedness: "Unlikely", sae_criterion: "Other important medical event", outcome: "Ongoing", pi_aware_date: "2026-03-22", sponsor_notified_date: null, veddra_code: "increased mortality", veddra_coding: "coded", serious: true, causality: "Not related", action_taken: "Other", expectedness: "Unexpected", serious_criteria: ["Other medically important"], regulatory_report_date: null });
  // BR-2502 — non-serious minor injection-site reaction the DM excluded from VeDDRA
  // coding (below threshold). Demonstrates the Excluded state in the AE roster.
  pushSae("BR-2502", { description: "Mild injection-site reaction (transient swelling)", onset_date: "2026-01-09", severity: "Mild", relatedness: "Possible", sae_criterion: "", outcome: "Recovered", pi_aware_date: "2026-01-09", sponsor_notified_date: null, veddra_code: "N/A — excluded from coding", veddra_coding: "excluded", serious: false, causality: "Possibly related", action_taken: "No action", expectedness: "Expected", serious_criteria: [], regulatory_report_date: null }, "-excl", 1);

  // ─── Seeded protocol deviations (session-only) ──────────────────────────────
  const siteIdOf = (studyCode: string, siteCode: string): string | null => {
    const sid = (studies.data ?? []).find((s) => s.code === studyCode)?.id;
    return (sites.data ?? []).find((s) => s.study_id === sid && s.code === siteCode)?.id ?? null;
  };
  const devStudyId = (code: string) => (studies.data ?? []).find((s) => s.code === code)?.id ?? "";
  const protocolDeviations: Dataset["protocolDeviations"] = [
    { id: "dev-CA", study_id: devStudyId("CA-0801"), site_id: siteIdOf("CA-0801", "101"), subject_code: "CA-0801-101-03", deviation_type: "Visit window", date: "2026-05-18", severity: "Minor", reported_to_sponsor: true, status: "Closed" },
    { id: "dev-BR", study_id: devStudyId("BR-2502"), site_id: siteIdOf("BR-2502", "TX"), subject_code: "BR-2502-TX-001", deviation_type: "Dosing", date: "2026-01-05", severity: "Major", reported_to_sponsor: true, status: "Open" },
    { id: "dev-PH", study_id: devStudyId("PH-2401"), site_id: siteIdOf("PH-2401", "RUA"), subject_code: "PH-2401-P03", deviation_type: "Eligibility", date: "2026-03-02", severity: "Major", reported_to_sponsor: true, status: "Closed" },
  ].filter((d) => d.study_id);

  // ─── Seeded VeDDRA coding tasks (session-only) ──────────────────────────────
  // The Coding-module worklist: verbatim AE + drug terms scoped to real subjects.
  // Coded entries pull their VeDDRA hierarchy from the dictionary (searchDict).
  type CodingSpec = { verbatim: string; termType: "ae" | "drug"; status: "pending" | "coded" | "verified"; by?: string; conf?: number };
  const codingTasks: Dataset["codingTasks"] = [];
  const pushCoding = (code: string, specs: CodingSpec[]) => {
    const subs = subjectsOf(code);
    const sid = (studies.data ?? []).find((s) => s.code === code)?.id ?? "";
    specs.forEach((spec, i) => {
      const subj = subs[i % Math.max(1, subs.length)];
      if (!subj) return;
      const task: Dataset["codingTasks"][number] = {
        id: `code-${code}-${i}`, studyId: sid, subjectId: subj.id, formInstanceId: "",
        fieldCode: spec.termType === "drug" ? "medication" : "ae_term", verbatimTerm: spec.verbatim, termType: spec.termType, status: spec.status,
      };
      if (spec.status === "coded" || spec.status === "verified") {
        const r = searchDict(spec.verbatim)[0];
        task.llt = r.llt; task.pt = r.pt; task.hlt = r.hlt; task.soc = r.soc; task.code = r.code;
        task.codedBy = spec.by ?? "A. Reyes"; task.codedAt = "2026-06-12T10:00:00Z";
        if (spec.by === "Auto") { task.autoConf = spec.conf; task.conflict = (spec.conf ?? 1) < 0.8; }
      }
      if (spec.status === "verified") {
        task.verifiedBy = "M. Okafor"; task.verifiedAt = "2026-06-13T09:00:00Z";
      }
      codingTasks.push(task);
    });
  };
  // Each study carries the full lifecycle for the demo: at least one Uncoded
  // (pending), one Coded (awaiting verification), and one Verified term.
  pushCoding("BR-2502", [
    { verbatim: "Injection site swelling", termType: "ae", status: "coded", by: "Auto", conf: 0.94 },
    { verbatim: "Laboured breathing", termType: "ae", status: "verified", by: "A. Reyes" },
    { verbatim: "Nasal discharge increased", termType: "ae", status: "pending" },
    { verbatim: "Eye discharge", termType: "ae", status: "pending" },
    { verbatim: "Rapid heart rate", termType: "ae", status: "pending" },
    { verbatim: "Tulathromycin (Draxxin)", termType: "drug", status: "verified", by: "Auto", conf: 0.98 },
    { verbatim: "Florfenicol (Nuflor)", termType: "drug", status: "coded", by: "Auto", conf: 0.97 },
  ]);
  pushCoding("CA-0801", [
    { verbatim: "Serious hypersensitivity reaction", termType: "ae", status: "verified", by: "A. Reyes" },
    { verbatim: "Pruritus flare", termType: "ae", status: "pending" },
    { verbatim: "Alopecia localized", termType: "ae", status: "pending" },
    { verbatim: "Oclacitinib (Apoquel)", termType: "drug", status: "pending" }, // the pending-drug demo case
    { verbatim: "Prednisolone", termType: "drug", status: "coded", by: "A. Reyes" },
    { verbatim: "Cyclosporine", termType: "drug", status: "verified", by: "A. Reyes" },
  ]);
  pushCoding("PH-2401", [
    { verbatim: "Increased flock mortality", termType: "ae", status: "verified", by: "A. Reyes" },
    { verbatim: "Feed intake reduced", termType: "ae", status: "pending" },
    { verbatim: "Salinomycin", termType: "drug", status: "coded", by: "Auto", conf: 0.98 },
  ]);

  // ─── v60: BR-2502 barn/pen rename (session-only) ────────────────────────────
  // The live DB seeds every feedlot barn as "Barn 1" and every pen as "Pen 1".
  // Rename to unique, site-prefixed names ("Barn CO-A" / "Pen CO-A1" …). Everything
  // references barns/pens by id, so renaming .name propagates to the Data Entry
  // tree, breadcrumbs, batch filters, and logs — no other reference to update.
  {
    const brId = (studies.data ?? []).find((s) => s.code === "BR-2502")?.id;
    if (brId) {
      const brSiteCode = new Map((sites.data ?? []).filter((s) => s.study_id === brId).map((s) => [s.id, s.code] as [string, string]));
      const allBarns = (barns.data ?? []) as Dataset["barns"];
      const allPens = (pens.data ?? []) as Dataset["pens"];
      for (const siteId of Array.from(brSiteCode.keys())) {
        const sc = brSiteCode.get(siteId) ?? "";
        const siteBarns = allBarns.filter((b) => b.site_id === siteId).slice().sort((a, b) => a.code.localeCompare(b.code));
        siteBarns.forEach((barn, bi) => {
          const letter = String.fromCharCode(65 + bi); // A, B, …
          barn.name = `Barn ${sc}-${letter}`;
          allPens.filter((p) => p.barn_id === barn.id).slice().sort((a, b) => a.code.localeCompare(b.code))
            .forEach((pen, pi) => { pen.name = `Pen ${sc}-${letter}${pi + 1}`; });
        });
      }
    }
  }

  // ─── Seeded change-reason (Δ) records + electronic signatures ───────────────
  // deltaRecords are otherwise runtime-only; seed a few APPROVED ones PER STUDY so
  // the Audit Trail's "Approved by" column has data whichever study is open (the
  // audit trail is study-scoped). eSignatures seed a PI sign-off per finalized BR
  // form (21 CFR Part 11 §11.50).
  const seededDeltas: Dataset["deltaRecords"] = [];
  const seededSignatures: Dataset["eSignatures"] = [];
  {
    const fInstArr = formInstances as Dataset["formInstances"];
    const fvArr = fieldValues as Dataset["fieldValues"];
    const ffById = new Map((reshapedFormFields as Dataset["formFields"]).map((f) => [f.id, f]));
    const addHours = (iso: string, h: number) => new Date(new Date(iso).getTime() + h * 3600000).toISOString();
    const CRC_NAMES = ["D. Okonkwo", "A. Reyes", "S. Kim"];

    // Two approved change-reason records per study, on real field values.
    for (const code of ["BR-2502", "CA-0801", "PH-2401"]) {
      const sid = (studies.data ?? []).find((s) => s.code === code)?.id;
      if (!sid) continue;
      const subjIds = new Set((subjects.data ?? []).filter((s) => s.study_id === sid).map((s) => s.id));
      const instIds = new Set(fInstArr.filter((i) => i.subject_id && subjIds.has(i.subject_id)).map((i) => i.id));
      const candidates = fvArr.filter((v) => instIds.has(v.form_instance_id) && v.value != null && String(v.value).trim() !== "" && ffById.get(v.form_field_id)?.label);
      const picks = [candidates[0], candidates[Math.floor(candidates.length / 2)]].filter((v, i, a) => v && a.indexOf(v) === i);
      picks.forEach((fv, i) => {
        const val = String(fv.value);
        const old = /^-?\d+(\.\d+)?$/.test(val) ? (parseFloat(val) + (i === 0 ? 0.5 : -3)).toFixed(val.includes(".") ? 1 : 0) : "(prior value)";
        const created = `2026-05-2${2 + i}T1${i}:00:00Z`;
        seededDeltas.push({
          id: `delta-${code}-${i}`, field_value_id: fv.id, old_value: old, new_value: val,
          reason: "Value corrected against source per monitoring review.", author_name: CRC_NAMES[i % CRC_NAMES.length], author_role: "CRC",
          created_at: created, status: "approved", approved_by: "M. Chen", approved_role: "DM", approved_at: addHours(created, 3),
        });
      });
    }

    const brSubjIds = new Set((subjects.data ?? []).filter((s) => s.study_id === brStudyId).map((s) => s.id));
    const brFinalized = fInstArr.filter((i) => i.subject_id && brSubjIds.has(i.subject_id) && (i.status === "finalized" || i.status === "locked")).slice(0, 4);
    brFinalized.forEach((inst, i) => {
      seededSignatures.push({
        id: `esig-br-${i}`, form_instance_id: inst.id, signed_by: "Dr. S. Patel", signed_by_role: "PI",
        signed_at: `2026-06-0${2 + i}T16:30:00Z`, meaning: "I confirm this data is accurate and complete.",
      });
    });
  }

  // ─── Seeded drug inventory (session-only) ───────────────────────────────────
  const inventory = buildInventorySeed(studiesWithTargets, sitesWithTargets, (subjects.data ?? []) as Dataset["subjects"]);

  return {
    studies: studiesWithTargets,
    sites: sitesWithTargets,
    barns: (barns.data ?? []) as Dataset["barns"],
    pens: (pens.data ?? []) as Dataset["pens"],
    subjects: (subjects.data ?? []) as Dataset["subjects"],
    owners: (owners.data ?? []) as Dataset["owners"],
    forms: [...formsWithFlags, ...caNewForms],
    formFields: reshapedFormFields,
    formInstances: formInstances as Dataset["formInstances"],
    fieldValues: fieldValues as Dataset["fieldValues"],
    queries: splitQueries,
    queryMessages: rawMsgs,
    editChecks,
    sdvRecords: sdvWithSeed,
    deltaRecords: seededDeltas, // session-only — seeded approved change-reason chain (per study)
    eSignatures: seededSignatures, // session-only — seeded PI electronic signatures (BR-2502)
    formAudits: [], // session-only — form revert / withdraw log
    unblindings: [], // session-only — emergency-unblinding log
    studyLocks: [], // session-only — database-lock log
    conMeds, // session-only — seeded concomitant medications
    saeReports, // session-only — seeded SAE reporting timelines
    protocolDeviations, // session-only — seeded protocol deviations
    codingTasks, // session-only — seeded VeDDRA coding worklist
    vials: inventory.vials, // session-only — seeded drug inventory
    shipments: inventory.shipments, // session-only — seeded drug shipments
    memberships: (memberships.data ?? []) as Dataset["memberships"],
    speciesRanges: (speciesRanges.data ?? []) as Dataset["speciesRanges"],
  };
}
