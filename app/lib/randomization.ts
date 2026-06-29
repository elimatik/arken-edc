// ════════════════════════════════════════════════════════════════════════════
// Randomization — eligibility gate, study-specific assignment, and the read-only
// result block shown on the Randomization form (CA/BR) or Pen Demographics (PH).
// Reads real values off the Randomization form instance where seeded; derives
// kit / dose / lot deterministically otherwise so forms and inventory stay aligned.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";

export type Verdict = "eligible" | "incomplete" | "ineligible" | "none";

// Live eligibility verdict from the I/E criteria fields (across the study's forms),
// honouring a PI override. "none" = no I/E criteria to assess.
export function eligibilityVerdict(dataset: Dataset, studyId: string, subjectId: string): Verdict {
  const subj = dataset.subjects.find((s) => s.id === subjectId);
  if (subj?.override_reason) return "eligible"; // PI override clears ineligibility
  const studyFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  const crit = dataset.formFields.filter((f) => studyFormIds.has(f.form_id) && f.validation?.exclusion_criterion);
  if (!crit.length) return "none";
  const critFormIds = new Set(crit.map((f) => f.form_id));
  const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId && critFormIds.has(i.form_id)).map((i) => i.id));
  const valByField = new Map<string, string>();
  for (const v of dataset.fieldValues) if (instIds.has(v.form_instance_id)) valByField.set(v.form_field_id, v.value ?? "");
  const answered = crit.filter((f) => (valByField.get(f.id) ?? "") !== "").length;
  const failing = crit.filter((f) => (valByField.get(f.id) ?? "") === (f.validation?.exclusion_if ?? "No")).length;
  if (answered < crit.length) return "incomplete";
  return failing ? "ineligible" : "eligible";
}

export function findRandForm(dataset: Dataset, studyId: string) {
  const forms = dataset.forms.filter((f) => f.study_id === studyId);
  // The real randomization CRF carries the assigned_arm field (e.g. BR F004
  // "Randomization & Allocation") — prefer it over the "Enrollment & Randomization"
  // visit-group container, which also matches the name.
  const withArm = forms.find((f) => /randomi[sz]ation|allocation/i.test(f.name) && dataset.formFields.some((ff) => ff.form_id === f.id && ff.code === "assigned_arm"));
  return withArm ?? forms.find((f) => /randomi[sz]ation/i.test(f.name));
}

// {fieldCode → {fieldId, value}} for the subject's Randomization form instance.
function randInstanceValues(dataset: Dataset, studyId: string, subjectId: string) {
  const form = findRandForm(dataset, studyId);
  const inst = form ? dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === form.id) : undefined;
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f.code]));
  const values = new Map<string, string>();
  const fieldIdByCode = new Map<string, string>();
  if (form) for (const f of dataset.formFields) if (f.form_id === form.id) fieldIdByCode.set(f.code, f.id);
  if (inst) for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id) { const c = fieldById.get(v.form_field_id); if (c) values.set(c, v.value ?? ""); }
  return { instanceId: inst?.id ?? null, values, fieldIdByCode };
}

// Distinct treatment arms in the study (seeded subjects), stable order.
export function studyArms(dataset: Dataset, studyId: string): string[] {
  return Array.from(new Set(dataset.subjects.filter((s) => s.study_id === studyId && s.randomization_arm).map((s) => s.randomization_arm as string))).sort();
}

// Balanced assignment: the arm with the fewest current subjects.
export function assignArm(dataset: Dataset, studyId: string): string {
  const arms = studyArms(dataset, studyId);
  const pool = arms.length ? arms : ["Arm A", "Arm B"];
  const counts = pool.map((a) => dataset.subjects.filter((s) => s.study_id === studyId && s.randomization_arm === a).length);
  let min = 0;
  for (let i = 1; i < pool.length; i++) if (counts[i] < counts[min]) min = i;
  return pool[min];
}

// BR dose basis — subject's body weight (kg), in priority order: Animal Demographics
// (arrival weight) first, then Vital Signs / Treatment Admin weights.
export function subjectWeightKg(dataset: Dataset, subjectId: string): number | null {
  const CODES = ["arrival_weight", "initial_weight", "weight_kg", "body_weight", "body_weight_dosing", "weight"];
  const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
  const idsByCode = new Map<string, Set<string>>();
  for (const f of dataset.formFields) if (CODES.includes(f.code)) { let s = idsByCode.get(f.code); if (!s) { s = new Set(); idsByCode.set(f.code, s); } s.add(f.id); }
  for (const code of CODES) {
    const ids = idsByCode.get(code); if (!ids) continue;
    for (const v of dataset.fieldValues) {
      if (!instIds.has(v.form_instance_id) || !ids.has(v.form_field_id)) continue;
      const n = parseFloat(v.value ?? "");
      if (!Number.isNaN(n) && n > 0) return n;
    }
  }
  return null;
}

const pad3 = (n: number) => String(n).padStart(3, "0");
const fmtDate = (iso: string): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—");

// First non-empty value among the given field codes across the subject's instances.
function subjectValueOf(dataset: Dataset, subjectId: string, codes: string[]): string {
  const ids = new Set(dataset.formFields.filter((f) => codes.includes(f.code)).map((f) => f.id));
  const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
  for (const v of dataset.fieldValues) if (instIds.has(v.form_instance_id) && ids.has(v.form_field_id) && v.value) return v.value;
  return "";
}

export interface RandResult {
  arm: string | null;
  number: string;
  date: string;
  block: string;
  by: string;
  blinded: boolean; // CA-0801
  kit?: string; // CA-0801
  group?: string; // BR / PH
  drug?: string; // BR / PH
  dose?: string | null; // BR (mL)
  weightKg?: number | null; // BR
  lot?: string; // BR
  additive?: string; // PH
  feedBatch?: string; // PH
}

// Read-only result data. Prefers seeded Randomization-form values, derives the rest.
export function buildRandomizationResult(dataset: Dataset, studyCode: string, studyId: string, subjectId: string): RandResult {
  const subj = dataset.subjects.find((s) => s.id === subjectId);
  const { values } = randInstanceValues(dataset, studyId, subjectId);
  const get = (c: string) => values.get(c) ?? "";
  const arm = subj?.randomization_arm ?? get("assigned_arm") ?? null;
  const site = subj?.site_id ? dataset.sites.find((s) => s.id === subj.site_id) : undefined;
  const studySubs = dataset.subjects.filter((s) => s.study_id === studyId).slice().sort((a, b) => (a.subject_code < b.subject_code ? -1 : 1));
  const seqAll = Math.max(1, studySubs.findIndex((s) => s.id === subjectId) + 1);

  const number = get("randomization_number") || `RN-${site?.code ?? "000"}-${pad3(seqAll)}`;
  // Read randomization_date from the form instance; fall back to the subject's
  // screening/enrolment date (never "—" for a randomized subject) then to the action stamp.
  const dateRaw = get("randomization_date") || subjectValueOf(dataset, subjectId, ["screening_date", "enrollment_date", "arrival_date", "placement_date", "consent_date"]) || subj?.randomized_at || "";
  const date = fmtDate(dateRaw);
  const block = get("randomization_block") || get("block_number") || String(((seqAll - 1) % 6) + 1);
  const by = get("randomized_by") || subj?.randomized_by || "System";

  if (studyCode === "CA-0801") {
    const arms = studyArms(dataset, studyId);
    const letter = String.fromCharCode(65 + Math.max(0, arms.indexOf(arm ?? "")));
    const sameArm = studySubs.filter((s) => s.randomization_arm === arm);
    const seqArm = Math.max(1, sameArm.findIndex((s) => s.id === subjectId) + 1);
    return { arm, number, date, block, by, blinded: true, kit: get("drug_kit_number") || `Kit ${letter}-${pad3(seqArm)}` };
  }
  if (studyCode === "BR-2502") {
    const armCode = (arm ?? "").match(/T0\d/)?.[0] ?? "T01";
    const mgkg = armCode === "T02" ? 5.0 : 2.5;
    const drug = ({ T01: "Tulathromycin 2.5 mg/kg SC", T02: "Tulathromycin 5.0 mg/kg SC", T03: "Saline placebo SC (volume-matched)" } as Record<string, string>)[armCode] ?? "Tulathromycin 2.5 mg/kg SC";
    const w = subjectWeightKg(dataset, subjectId);
    const ml = w != null ? Math.round((w * mgkg / 100) * 10) / 10 : null;
    const dose = ml == null ? null : armCode === "T03"
      ? `${ml} mL (volume-matched to T01 — saline placebo)`
      : `${ml} mL (${mgkg} mg/kg × ${w} kg ÷ 100 mg/mL)`;
    return { arm, number, date, block, by, blinded: false, group: arm ?? "—", drug, dose, weightKg: w, lot: get("lot_number") || `LOT-BR-${armCode}` };
  }
  // PH-2401 — pen-level treatment assignment
  return { arm, number, date, block, by, blinded: false, group: arm ?? "—", additive: "Phytogenic blend 150 mg/kg", feedBatch: "BATCH-PH-001" };
}
