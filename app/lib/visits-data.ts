// ════════════════════════════════════════════════════════════════════════════
// Visit-schedule derivation — the single source of truth for the Visits screen.
// A visit is (subject × scheduled visit form). The schedule, target dates, and
// completion are all derived from the session store; nothing is stored separately.
// ════════════════════════════════════════════════════════════════════════════

import type { Dataset, FormInstanceRow } from "./session-store/types";

// Per-study visit windows (day → ± allowed days). Drives both the schedule and
// the on-time / outside-window classification.
export const VISIT_WINDOWS: Record<string, Record<number, number>> = {
  "CA-0801": { 14: 2, 28: 3, 56: 5, 84: 5 },
  "BR-2502": { 0: 0, 3: 1, 7: 2, 14: 3, 28: 4 },
  "PH-2401": { 7: 2, 14: 2, 21: 2, 28: 2, 35: 2, 42: 2 },
};

// A form carrying one of these date fields is a "visit" form.
const VISIT_DATE_CODES = ["visit_date", "weighing_date", "observation_date"];
// Baseline (study Day 0) date for the offset calculation, in priority order.
const BASELINE_CODES = ["enrollment_date", "placement_date", "randomization_date", "consent_date", "screening_date"];
// A visit is "done" once its form reaches review or beyond.
export const VISIT_DONE_STATUSES = ["in_review", "reviewed", "finalized", "locked"];

export interface VisitRow {
  id: string;
  subjectId: string;
  subjectCode: string;
  subjectStatus: string;
  siteId: string | null;
  siteName: string;
  formId: string;
  visitName: string;
  day: number;
  window: number;
  targetDate: string; // YYYY-MM-DD
  completed: boolean;
  recordedDate: string | null; // the visit_date value on the instance, when present
}

export const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayFromName = (name: string | undefined): number | null => {
  if (!name) return null;
  const d = name.match(/Day\s+(\d+)/i);
  if (d) return Number(d[1]);
  const w = name.match(/Week\s+(\d+)/i);
  if (w) return Number(w[1]) * 7;
  return null;
};

export function buildVisits(dataset: Dataset, studyId: string): VisitRow[] {
  const study = dataset.studies.find((s) => s.id === studyId);
  const windows = study ? VISIT_WINDOWS[study.code] : undefined;
  if (!windows) return [];

  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));

  // The first visit-date field per study visit form.
  const dateFieldByForm = new Map<string, string>();
  for (const ff of dataset.formFields) {
    if (!VISIT_DATE_CODES.includes(ff.code) || dateFieldByForm.has(ff.form_id)) continue;
    const form = formById.get(ff.form_id);
    if (form && form.study_id === studyId && (form.scope ?? "subject") === "subject") dateFieldByForm.set(ff.form_id, ff.id);
  }

  // Scheduled visit forms, deduped to one per day (lowest sequence wins — e.g.
  // BR's Vital Signs over Clinical Response, PH's Body Weight over Flock Health).
  const byDay = new Map<number, { formId: string; day: number; window: number; visitName: string; seq: number; dateFieldId: string }>();
  for (const [formId, dateFieldId] of Array.from(dateFieldByForm.entries())) {
    const form = formById.get(formId)!;
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : null;
    const day = dayFromName(form.name) ?? dayFromName(parent?.name);
    if (day == null || windows[day] == null) continue;
    const visitName = /Day\s+\d+/i.test(form.name) ? form.name : (parent?.name ?? form.name);
    const prev = byDay.get(day);
    if (!prev || form.sequence < prev.seq) byDay.set(day, { formId, day, window: windows[day], visitName, seq: form.sequence, dateFieldId });
  }
  const schedule = Array.from(byDay.values()).sort((a, b) => a.day - b.day);
  if (schedule.length === 0) return [];

  // Per-subject instances + a field-code → field-ids index (for baseline lookup).
  const instBySubjForm = new Map<string, FormInstanceRow>();
  const subjInsts = new Map<string, FormInstanceRow[]>();
  for (const i of dataset.formInstances) {
    if (!i.subject_id) continue;
    instBySubjForm.set(`${i.subject_id}|${i.form_id}`, i);
    const arr = subjInsts.get(i.subject_id);
    if (arr) arr.push(i); else subjInsts.set(i.subject_id, [i]);
  }
  const fieldsByCode = new Map<string, Set<string>>();
  for (const ff of dataset.formFields) {
    if (formById.get(ff.form_id)?.study_id !== studyId) continue;
    const set = fieldsByCode.get(ff.code);
    if (set) set.add(ff.id); else fieldsByCode.set(ff.code, new Set([ff.id]));
  }
  const valOnInsts = (insts: FormInstanceRow[], fieldIds: Set<string>): string | null => {
    for (const i of insts) {
      const v = dataset.fieldValues.find((x) => x.form_instance_id === i.id && fieldIds.has(x.form_field_id) && x.value);
      if (v?.value) return v.value;
    }
    return null;
  };
  const baselineFor = (subjectId: string): string | null => {
    const insts = subjInsts.get(subjectId) ?? [];
    for (const code of BASELINE_CODES) {
      const ids = fieldsByCode.get(code);
      if (ids) { const v = valOnInsts(insts, ids); if (v) return v; }
    }
    // Fallback: the earliest recorded visit-date value.
    let earliest: string | null = null;
    for (const code of VISIT_DATE_CODES) {
      const ids = fieldsByCode.get(code);
      if (!ids) continue;
      for (const i of insts) {
        const v = dataset.fieldValues.find((x) => x.form_instance_id === i.id && ids.has(x.form_field_id) && x.value)?.value;
        if (v && (!earliest || v < earliest)) earliest = v;
      }
    }
    return earliest;
  };
  const recordedDateOf = (instId: string, fieldId: string): string | null =>
    dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.value ?? null;

  const rows: VisitRow[] = [];
  for (const subj of dataset.subjects) {
    if (subj.study_id !== studyId) continue;
    const baseline = baselineFor(subj.id);
    if (!baseline) continue; // can't schedule without a Day-0 anchor
    const siteId = subj.site_id ?? null;
    const siteName = siteId ? siteById.get(siteId)?.name ?? "—" : "—";
    for (const v of schedule) {
      const inst = instBySubjForm.get(`${subj.id}|${v.formId}`);
      const completed = inst ? VISIT_DONE_STATUSES.includes(inst.status) : false;
      rows.push({
        id: `${subj.id}|${v.formId}`, subjectId: subj.id, subjectCode: subj.subject_code, subjectStatus: subj.status,
        siteId, siteName, formId: v.formId, visitName: v.visitName, day: v.day, window: v.window,
        targetDate: addDays(baseline, v.day), completed,
        recordedDate: inst && completed ? recordedDateOf(inst.id, v.dateFieldId) : null,
      });
    }
  }
  return rows;
}
