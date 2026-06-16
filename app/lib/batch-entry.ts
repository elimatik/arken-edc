// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — shared logic for filling one form across many animals at once.
// Veterinary pen/herd monitoring records the same visit form for a whole pen on
// the same day; human-subject EDCs have no equivalent. All derived from the
// session store (forms.batch_eligible + each animal's enrollment date).
// ════════════════════════════════════════════════════════════════════════════

import type { Dataset, FormRow } from "./session-store/types";

// Visit windows around the scheduled day (D0 ±0 · D3 ±1 · D7 ±2 · D14 ±3 · D28 ±4).
export const VISIT_TOL: Record<number, number> = { 0: 0, 3: 1, 7: 2, 14: 3, 28: 4 };

export const todayISO = (): string => new Date().toISOString().slice(0, 10);
const daysBetween = (aISO: string, bISO: string): number =>
  Math.round((Date.parse(`${bISO}T00:00:00Z`) - Date.parse(`${aISO}T00:00:00Z`)) / 86400000);

export function batchForms(dataset: Dataset, studyId: string): FormRow[] {
  return dataset.forms
    .filter((f) => f.study_id === studyId && f.batch_eligible)
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
}
export function studyHasBatch(dataset: Dataset, studyId: string): boolean {
  return dataset.forms.some((f) => f.study_id === studyId && f.batch_eligible);
}
// The scheduled visit day parsed from a recurring form name ("… — Day 3" → 3).
export function visitDayOf(form: FormRow): number | null {
  const m = /—\s*Day\s+(\d+)/.exec(form.name);
  return m ? Number(m[1]) : null;
}

// A subject's enrollment date, read from any demographics enrollment_date value.
export function enrollmentDate(dataset: Dataset, subjectId: string): string | null {
  const fieldIds = new Set(dataset.formFields.filter((f) => f.code === "enrollment_date").map((f) => f.id));
  if (fieldIds.size === 0) return null;
  const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
  const v = dataset.fieldValues.find((fv) => instIds.has(fv.form_instance_id) && fieldIds.has(fv.form_field_id) && fv.value);
  return v?.value || null;
}
// A subject's estimated age in months (for age-class HR validation in the grid).
export function ageMonthsOf(dataset: Dataset, subjectId: string): number | null {
  const fieldIds = new Set(dataset.formFields.filter((f) => f.code === "age_months").map((f) => f.id));
  if (fieldIds.size === 0) return null;
  const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
  const v = dataset.fieldValues.find((fv) => instIds.has(fv.form_instance_id) && fieldIds.has(fv.form_field_id) && fv.value);
  const n = v ? Number(v.value) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Whether a subject already has data on this form (its instance carries a value).
export function formStarted(dataset: Dataset, formId: string, subjectId: string): boolean {
  const inst = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId);
  if (!inst) return false;
  return dataset.fieldValues.some((fv) => fv.form_instance_id === inst.id && (fv.value ?? "") !== "");
}

export type DueStatus = "due" | "overdue" | "upcoming" | "done" | "n/a";

// Due status of a batch form for one subject, relative to a reference date.
export function dueStatusFor(dataset: Dataset, form: FormRow, subjectId: string, ref = todayISO()): DueStatus {
  if (formStarted(dataset, form.id, subjectId)) return "done";
  const day = visitDayOf(form);
  if (day == null) return "n/a"; // not a scheduled-visit form → always available
  const enroll = enrollmentDate(dataset, subjectId);
  if (!enroll) return "n/a";
  const tol = VISIT_TOL[day] ?? 2;
  const offset = daysBetween(enroll, ref) - day; // days past the scheduled visit day
  if (offset < -tol) return "upcoming";
  if (offset > tol) return "overdue";
  return "due";
}

// For the suggestion modal: every batch form with ≥1 subject due today, with its
// due count. Sorted by visit day then sequence.
export function dueSuggestions(
  dataset: Dataset,
  studyId: string,
  subjectIds: string[],
  ref = todayISO(),
): { form: FormRow; due: number }[] {
  return batchForms(dataset, studyId)
    .map((form) => ({
      form,
      due: subjectIds.filter((sid) => dueStatusFor(dataset, form, sid, ref) === "due").length,
    }))
    .filter((s) => s.due > 0);
}
