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
  const formsWithFlags = ((forms.data ?? []) as Dataset["forms"]).map((f) =>
    f.id === F025_ID ? { ...f, name: "Re-treatment Log" } // repeating table in Safety & Events
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
    ff(F005, id005("body_weight_dosing", "f005-body_weight"), "body_weight_dosing", "Body weight at administration", "number", null, "kg", true, 4, { section: "Drug Information", hint: "Weigh the animal immediately before administration. Used to verify the calculated dose." }),
    ff(F005, "f005-calculated_dose", "calculated_dose", "Calculated dose", "calculated", null, "mL", false, 5, { readonlyAuto: true, section: "Drug Information" }),
    ff(F005, id005("route", "f005-route"), "route", "Route", "calculated", null, null, false, 6, { readonlyAuto: true, section: "Administration" }),
    ff(F005, id005("administered_by", "f005-administered_by"), "administered_by", "Administered by", "text", null, null, true, 7, { section: "Administration" }),
  ];
  const F025_FIELDS: FF[] = [
    ff(F025, "f025-retreatment_date", "retreatment_date", "Re-treatment date", "date", null, null, true, 1, null),
    ff(F025, "f025-dart", "dart_score_retreatment", "DART score at re-treatment decision", "number", null, null, true, 2, { min: 0, max: 3, hint: "Re-treatment indicated if DART ≥ 2 at Day 3 or Day 7." }),
    ff(F025, "f025-weight", "body_weight_retreatment", "Body weight at re-treatment", "number", null, "kg", true, 3, null),
    ff(F025, "f025-test_article", "test_article", "Test article", "select", ["T01", "T02", "T03"], null, false, 4, { autoFromArm: true, hint: "Auto-populated from the randomization assignment.", section: "Re-treatment" }),
    ff(F025, "f025-calculated_dose", "calculated_dose", "Calculated dose", "calculated", null, "mL", false, 5, { readonlyAuto: true, section: "Re-treatment" }),
    ff(F025, "f025-lot", "lot_number", "Lot number", "calculated", null, null, false, 6, { readonlyAuto: true, hint: "Auto-assigned — may differ from Day 0 if the original lot is depleted.", section: "Re-treatment" }),
    ff(F025, "f025-route", "route", "Route", "calculated", null, null, false, 7, { readonlyAuto: true, section: "Re-treatment" }),
    ff(F025, "f025-administered_by", "administered_by", "Administered by", "text", null, null, true, 8, { section: "Re-treatment" }),
    ff(F025, "f025-reason", "retreatment_reason", "Reason for re-treatment", "select", ["DART ≥ 2 at Day 3", "DART ≥ 2 at Day 7", "Other"], null, true, 9, null),
    ff(F025, "f025-notes", "notes", "Notes", "textarea", null, null, false, 10, null),
  ];
  // Fields dropped outright (arm assignment belongs only on the Randomization form):
  // BR Screening "Randomized arm" + PH Pen Demographics "Treatment arm".
  const DROP_FIELD_IDS = new Set(["6200000C-0000-0000-0000-000000002502", "6200000E-0000-0000-0000-000000002401"]);

  // ─── BR-2502 Vital Signs (5 forms) + Clinical Response (5 forms) reshape ────
  // Vital Signs → 7 fields (drop the duplicated clinical sub-components, add body
  // weight). Clinical Response → DART read-only from Vital Signs; Response vs
  // baseline / Temperature normalized / Requires re-treatment become calculated.
  const suf = "-0000-0000-0000-000000002502";
  const VS_FORM_IDS = ["61000007", "6100000A", "6100000D", "61000010", "61000013"].map((p) => p + suf);
  const CR_FORM_IDS = ["61000008", "6100000B", "6100000E", "61000011", "61000014"].map((p) => p + suf);
  const CR_DAY0 = "61000008" + suf;
  const byForm = (fid: string) => new Map((formFields as FF[]).filter((f) => f.form_id === fid).map((f) => [f.code, f]));
  const vsFields: FF[] = [];
  for (const fid of VS_FORM_IDS) {
    const ex = byForm(fid);
    let seq = 1;
    for (const code of ["visit_date", "rectal_temp", "heart_rate", "resp_rate"]) { const f = ex.get(code); if (f) vsFields.push({ ...f, sequence: seq++ }); }
    vsFields.push(ff(fid, `${fid}-body_weight`, "body_weight", "Body weight", "number", null, "kg", true, seq++, { vital: "weight", section: "Vital Signs" }));
    const dart = ex.get("clinical_illness_score"); if (dart) vsFields.push({ ...dart, sequence: seq++ });
  }
  const crFields: FF[] = [];
  for (const fid of CR_FORM_IDS) {
    const ex = byForm(fid);
    const isDay0 = fid === CR_DAY0;
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
  const RESHAPED_FORM_IDS = new Set([F005, F025, ...VS_FORM_IDS, ...CR_FORM_IDS]);
  const reshapedFormFields: FF[] = [
    ...(formFields as FF[]).filter((f) => !RESHAPED_FORM_IDS.has(f.form_id) && !DROP_FIELD_IDS.has(f.id)),
    ...F005_FIELDS, ...F025_FIELDS, ...vsFields, ...crFields,
  ];

  // Seed one Re-treatment Log entry on BR-2502-CO-001 so the demo table isn't empty.
  const CO001 = "340A0000-0000-0000-0000-000000002502";
  const fInst = formInstances as Dataset["formInstances"];
  if ((subjects.data ?? []).some((s) => s.id === CO001) && !fInst.some((i) => i.id === "fi-retreat-co001")) {
    fInst.push({ id: "fi-retreat-co001", form_id: F025, subject_id: CO001, status: "in_work" });
    (fieldValues as Dataset["fieldValues"]).push(
      { id: "fv-rt-date", form_instance_id: "fi-retreat-co001", form_field_id: "f025-retreatment_date", value: "2026-05-20" },
      { id: "fv-rt-dart", form_instance_id: "fi-retreat-co001", form_field_id: "f025-dart", value: "2" },
      { id: "fv-rt-weight", form_instance_id: "fi-retreat-co001", form_field_id: "f025-weight", value: "192" },
      { id: "fv-rt-by", form_instance_id: "fi-retreat-co001", form_field_id: "f025-administered_by", value: "M. Okafor" },
      { id: "fv-rt-reason", form_instance_id: "fi-retreat-co001", form_field_id: "f025-reason", value: "DART ≥ 2 at Day 7" },
    );
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
  pushSae("CA-0801", { description: "Serious hypersensitivity reaction", onset_date: "2025-09-15", severity: "Severe", relatedness: "Probable", sae_criterion: "Life-threatening", outcome: "Recovered", pi_aware_date: "2025-09-15", sponsor_notified_date: "2025-09-15", veddra_code: "hypersensitivity", veddra_coding: "coded", serious: true });
  // BR-2502 — fatal BRD despite treatment; notified +1 day (on time, borderline).
  pushSae("BR-2502", { description: "Fatal bovine respiratory disease despite treatment", onset_date: "2026-01-12", severity: "Severe", relatedness: "Unlikely", sae_criterion: "Death", outcome: "Fatal", pi_aware_date: "2026-01-12", sponsor_notified_date: "2026-01-13", veddra_code: "bovine respiratory disease", veddra_coding: "coded", serious: true });
  // PH-2401 — sudden pen-level mortality spike; report still pending.
  pushSae("PH-2401", { description: "Sudden mortality spike >10% in 24h (pen-level)", onset_date: "2026-03-22", severity: "Severe", relatedness: "Unlikely", sae_criterion: "Other important medical event", outcome: "Ongoing", pi_aware_date: "2026-03-22", sponsor_notified_date: null, veddra_code: "increased mortality", veddra_coding: "coded", serious: true });
  // BR-2502 — non-serious minor injection-site reaction the DM excluded from VeDDRA
  // coding (below threshold). Demonstrates the Excluded state in the AE roster.
  pushSae("BR-2502", { description: "Mild injection-site reaction (transient swelling)", onset_date: "2026-01-09", severity: "Mild", relatedness: "Possible", sae_criterion: "", outcome: "Recovered", pi_aware_date: "2026-01-09", sponsor_notified_date: null, veddra_code: "N/A — excluded from coding", veddra_coding: "excluded", serious: false }, "-excl", 1);

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
  type CodingSpec = { verbatim: string; termType: "ae" | "drug"; status: "pending" | "coded"; by?: string; conf?: number };
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
      if (spec.status === "coded") {
        const r = searchDict(spec.verbatim)[0];
        task.llt = r.llt; task.pt = r.pt; task.hlt = r.hlt; task.soc = r.soc; task.code = r.code;
        task.codedBy = spec.by ?? "A. Reyes"; task.codedAt = "2026-06-12T10:00:00Z";
        if (spec.by === "Auto") { task.autoConf = spec.conf; task.conflict = (spec.conf ?? 1) < 0.8; }
      }
      codingTasks.push(task);
    });
  };
  pushCoding("BR-2502", [
    { verbatim: "Injection site swelling", termType: "ae", status: "coded", by: "Auto", conf: 0.94 },
    { verbatim: "Laboured breathing", termType: "ae", status: "coded", by: "A. Reyes" },
    { verbatim: "Nasal discharge increased", termType: "ae", status: "pending" },
    { verbatim: "Eye discharge", termType: "ae", status: "pending" },
    { verbatim: "Rapid heart rate", termType: "ae", status: "pending" },
    { verbatim: "Tulathromycin (Draxxin)", termType: "drug", status: "coded", by: "Auto", conf: 0.98 },
    { verbatim: "Florfenicol (Nuflor)", termType: "drug", status: "coded", by: "Auto", conf: 0.97 },
  ]);
  pushCoding("CA-0801", [
    { verbatim: "Serious hypersensitivity reaction", termType: "ae", status: "coded", by: "A. Reyes" },
    { verbatim: "Pruritus flare", termType: "ae", status: "pending" },
    { verbatim: "Alopecia localized", termType: "ae", status: "pending" },
    { verbatim: "Oclacitinib (Apoquel)", termType: "drug", status: "pending" }, // the pending-drug demo case
    { verbatim: "Prednisolone", termType: "drug", status: "coded", by: "A. Reyes" },
    { verbatim: "Cyclosporine", termType: "drug", status: "coded", by: "A. Reyes" },
  ]);
  pushCoding("PH-2401", [
    { verbatim: "Increased flock mortality", termType: "ae", status: "coded", by: "A. Reyes" },
    { verbatim: "Feed intake reduced", termType: "ae", status: "pending" },
    { verbatim: "Salinomycin", termType: "drug", status: "coded", by: "Auto", conf: 0.98 },
  ]);

  // ─── Seeded drug inventory (session-only) ───────────────────────────────────
  const inventory = buildInventorySeed(studiesWithTargets, sitesWithTargets, (subjects.data ?? []) as Dataset["subjects"]);

  return {
    studies: studiesWithTargets,
    sites: sitesWithTargets,
    barns: (barns.data ?? []) as Dataset["barns"],
    pens: (pens.data ?? []) as Dataset["pens"],
    subjects: (subjects.data ?? []) as Dataset["subjects"],
    owners: (owners.data ?? []) as Dataset["owners"],
    forms: formsWithFlags,
    formFields: reshapedFormFields,
    formInstances: formInstances as Dataset["formInstances"],
    fieldValues: fieldValues as Dataset["fieldValues"],
    queries: splitQueries,
    queryMessages: rawMsgs,
    editChecks,
    sdvRecords: sdvWithSeed,
    deltaRecords: [], // session-only — not sourced from Supabase
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
