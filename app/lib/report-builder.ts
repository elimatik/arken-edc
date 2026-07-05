// ════════════════════════════════════════════════════════════════════════════
// Custom Report builder — shared config model + client-side resolver. The Arken
// Insights AI generates a ReportConfig (columns + filters) but never sees field
// VALUES; this resolver runs the config against the session store, blinding-aware,
// and produces the table both the chat inline card and the builder render.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { shouldHideArmForSubject } from "@/lib/study-config";
import { buildVisits } from "@/lib/visits-data";

export type DataSource = "subjects" | "form_entries" | "field_values" | "visits" | "queries" | "inventory";

export interface ReportColumn {
  label: string;
  source: "builtin" | "form_field";
  key?: string; // builtin key (subjectId / site / arm / status / …)
  form?: string; // form_field — form name
  field?: string; // form_field — field code
  visit?: string; // form_field — optional visit label (Baseline / Day 7 / FU4 …)
}
export interface ReportFilter { column: string; operator: string; value: string }
export interface ReportConfig { dataSource: DataSource; columns: ReportColumn[]; filters: ReportFilter[]; title?: string }

export interface SavedReport { id: string; name: string; description: string; config: ReportConfig; createdAt: string }

export const DATA_SOURCES: { key: DataSource; label: string; icon: string; desc: string }[] = [
  { key: "subjects", label: "Subjects", icon: "users", desc: "One row per subject / pen" },
  { key: "form_entries", label: "Form entries", icon: "forms", desc: "One row per form instance" },
  { key: "field_values", label: "Field values", icon: "list-details", desc: "One row per recorded field" },
  { key: "visits", label: "Visits", icon: "calendar-check", desc: "One row per scheduled visit" },
  { key: "queries", label: "Queries", icon: "message-report", desc: "One row per query" },
  { key: "inventory", label: "Inventory units", icon: "package", desc: "One row per drug unit" },
];

// Built-in (non-form-field) columns available per data source.
export const BUILTIN_COLUMNS: Record<DataSource, { key: string; label: string; type: FieldType }[]> = {
  subjects: [
    { key: "subjectId", label: "Subject ID", type: "text" }, { key: "site", label: "Site", type: "text" },
    { key: "arm", label: "Arm", type: "select" }, { key: "status", label: "Status", type: "select" },
    { key: "enrollmentDate", label: "Enrollment date", type: "date" },
  ],
  form_entries: [
    { key: "subjectId", label: "Subject ID", type: "text" }, { key: "site", label: "Site", type: "text" },
    { key: "form", label: "Form", type: "text" }, { key: "status", label: "Status", type: "select" },
  ],
  field_values: [
    { key: "subjectId", label: "Subject ID", type: "text" }, { key: "site", label: "Site", type: "text" },
    { key: "form", label: "Form", type: "text" }, { key: "field", label: "Field", type: "text" }, { key: "value", label: "Value", type: "text" },
  ],
  visits: [
    { key: "subjectId", label: "Subject ID", type: "text" }, { key: "site", label: "Site", type: "text" },
    { key: "visitName", label: "Visit", type: "text" }, { key: "targetDate", label: "Target date", type: "date" },
    { key: "actualDate", label: "Actual date", type: "date" }, { key: "visitStatus", label: "Status", type: "select" },
  ],
  queries: [
    { key: "queryId", label: "Query ID", type: "text" }, { key: "subjectId", label: "Subject ID", type: "text" },
    { key: "site", label: "Site", type: "text" }, { key: "form", label: "Form", type: "text" },
    { key: "field", label: "Field", type: "text" }, { key: "queryStatus", label: "Status", type: "select" }, { key: "age", label: "Age (days)", type: "number" },
  ],
  inventory: [
    { key: "unitId", label: "Unit ID", type: "text" }, { key: "treatmentGroup", label: "Treatment group", type: "text" },
    { key: "site", label: "Site", type: "text" }, { key: "unitStatus", label: "Status", type: "select" },
  ],
};

// ─── Persistence (sessionStorage) ────────────────────────────────────────────
const PENDING_KEY = "arken_pending_report_config";
const savedKey = (studyId: string) => `arken_custom_reports_${studyId}`;

export function takePendingConfig(): ReportConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY); // one-time use
  try { return JSON.parse(raw) as ReportConfig; } catch { return null; }
}
export function setPendingConfig(config: ReportConfig): void {
  if (typeof window !== "undefined") sessionStorage.setItem(PENDING_KEY, JSON.stringify(config));
}
export function loadSavedReports(studyId: string): SavedReport[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(sessionStorage.getItem(savedKey(studyId)) ?? "[]") as SavedReport[]; } catch { return []; }
}
export function persistSavedReports(studyId: string, reports: SavedReport[]): void {
  if (typeof window !== "undefined") sessionStorage.setItem(savedKey(studyId), JSON.stringify(reports));
}

export type FieldType = "text" | "number" | "date" | "select";
export const OPERATORS: Record<FieldType, { op: string; label: string }[]> = {
  text: [{ op: "contains", label: "contains" }, { op: "=", label: "is" }, { op: "!=", label: "is not" }],
  select: [{ op: "=", label: "is" }, { op: "!=", label: "is not" }],
  number: [{ op: "=", label: "=" }, { op: "!=", label: "≠" }, { op: ">", label: ">" }, { op: ">=", label: "≥" }, { op: "<", label: "<" }, { op: "<=", label: "≤" }],
  date: [{ op: "=", label: "on" }, { op: ">", label: "after" }, { op: "<", label: "before" }],
};

// ─── Field schema (for the AI system prompt — form/field/type, NO values) ────
export interface FieldSchema { forms: { name: string; fields: { code: string; label: string; type: string }[] }[] }
export function buildFieldSchema(dataset: Dataset, studyId: string): FieldSchema {
  const forms = dataset.forms.filter((f) => f.study_id === studyId && !f.is_summary);
  const fieldsByForm = new Map<string, { code: string; label: string; type: string }[]>();
  for (const ff of dataset.formFields) {
    const form = forms.find((f) => f.id === ff.form_id);
    if (!form) continue;
    const arr = fieldsByForm.get(form.id) ?? [];
    if (!arr.some((x) => x.code === ff.code)) arr.push({ code: ff.code, label: ff.label, type: ff.field_type });
    fieldsByForm.set(form.id, arr);
  }
  const out: FieldSchema["forms"] = [];
  const seen = new Set<string>();
  for (const f of forms) {
    const fields = fieldsByForm.get(f.id);
    if (!fields || fields.length === 0 || seen.has(f.name)) continue;
    seen.add(f.name);
    out.push({ name: f.name, fields });
  }
  return { forms: out };
}

// ─── Visit-day parser (maps a visit label to its study Day offset) ───────────
export function visitDayOf(label: string | undefined): number | null {
  if (!label) return null;
  const d = label.match(/Day\s+(\d+)/i); if (d) return Number(d[1]);
  const w = label.match(/Week\s+(\d+)/i); if (w) return Number(w[1]) * 7;
  const fu = label.match(/follow-?up\s*(\d+)|FU\s*(\d+)/i); if (fu) return (Number(fu[1] ?? fu[2])) * 14;
  if (/baseline|screening|enrol/i.test(label)) return 0;
  if (/end of study|final|eos/i.test(label)) return 84;
  return null;
}

// ─── Per-subject value index: subjectId → code → { byDay, latest } ───────────
interface ValueCell { byDay: Map<number, string>; latest: string }
function buildValueIndex(dataset: Dataset, studyId: string): Map<string, Map<string, ValueCell>> {
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const valsByInst = new Map<string, { code: string; value: string }[]>();
  for (const v of dataset.fieldValues) {
    if (!v.value) continue;
    const c = fieldById.get(v.form_field_id)?.code;
    if (!c) continue;
    (valsByInst.get(v.form_instance_id) ?? valsByInst.set(v.form_instance_id, []).get(v.form_instance_id)!).push({ code: c, value: v.value });
  }
  const idx = new Map<string, Map<string, ValueCell>>();
  for (const inst of dataset.formInstances) {
    if (!inst.subject_id) continue;
    const list = valsByInst.get(inst.id);
    if (!list) continue;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId) continue;
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : undefined;
    const day = visitDayOf(form.name) ?? visitDayOf(parent?.name);
    let byCode = idx.get(inst.subject_id);
    if (!byCode) { byCode = new Map(); idx.set(inst.subject_id, byCode); }
    for (const { code, value } of list) {
      let cell = byCode.get(code);
      if (!cell) { cell = { byDay: new Map(), latest: value }; byCode.set(code, cell); }
      cell.latest = value;
      if (day != null) cell.byDay.set(day, value);
    }
  }
  return idx;
}

// ─── Filter matching ─────────────────────────────────────────────────────────
function matches(cellValue: string, op: string, target: string): boolean {
  const a = cellValue ?? "";
  const nA = Number(a), nB = Number(target);
  const numeric = a !== "" && target !== "" && Number.isFinite(nA) && Number.isFinite(nB);
  switch (op) {
    case "contains": return a.toLowerCase().includes(target.toLowerCase());
    case "=": return numeric ? nA === nB : a.toLowerCase() === target.toLowerCase();
    case "!=": return numeric ? nA !== nB : a.toLowerCase() !== target.toLowerCase();
    case ">": return numeric ? nA > nB : a > target;
    case ">=": return numeric ? nA >= nB : a >= target;
    case "<": return numeric ? nA < nB : a < target;
    case "<=": return numeric ? nA <= nB : a <= target;
    default: return true;
  }
}

export interface ResolvedReport { columns: string[]; rows: Record<string, string>[]; total: number }

export function resolveReport(dataset: Dataset, studyId: string, config: ReportConfig, role: Role): ResolvedReport {
  const study = dataset.studies.find((s) => s.id === studyId);
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const subjById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const valueIndex = buildValueIndex(dataset, studyId);

  // Stable masked arm labels for blinded subjects ("Treatment A/B/…").
  const arms = Array.from(new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.randomization_arm).filter(Boolean) as string[])).sort();
  const maskMap = new Map(arms.map((a, i) => [a, `Treatment ${String.fromCharCode(65 + i)}`]));
  const armDisplay = (subjectId: string | null, raw: string | null): string => {
    if (!raw) return "—";
    if (subjectId && shouldHideArmForSubject(dataset, studyId, role, subjectId)) return maskMap.get(raw) ?? "Treatment —";
    return raw;
  };
  const siteLabel = (siteId: string | null | undefined) => { const s = siteId ? siteById.get(siteId) : undefined; return s ? `${s.code} · ${s.name}` : "—"; };

  // ── Base rows per data source: a subjectId (for form_field resolution) + builtin values.
  interface BaseRow { subjectId: string | null; builtin: Record<string, string> }
  const base: BaseRow[] = [];

  if (config.dataSource === "subjects") {
    for (const s of dataset.subjects) {
      if (s.study_id !== studyId) continue;
      const enroll = valueIndex.get(s.id)?.get("enrollment_date")?.latest ?? valueIndex.get(s.id)?.get("randomization_date")?.latest ?? "—";
      base.push({ subjectId: s.id, builtin: { subjectId: s.subject_code, site: siteLabel(s.site_id), arm: armDisplay(s.id, s.randomization_arm), status: s.ineligible ? "ineligible" : s.status, enrollmentDate: enroll } });
    }
  } else if (config.dataSource === "form_entries") {
    for (const i of dataset.formInstances) {
      const form = formById.get(i.form_id);
      if (!form || form.study_id !== studyId || form.is_summary) continue;
      const s = i.subject_id ? subjById.get(i.subject_id) : undefined;
      base.push({ subjectId: i.subject_id ?? null, builtin: { subjectId: s?.subject_code ?? "—", site: siteLabel(s?.site_id), form: form.name, status: i.status } });
    }
  } else if (config.dataSource === "field_values") {
    for (const v of dataset.fieldValues) {
      if (!v.value) continue;
      const inst = dataset.formInstances.find((i) => i.id === v.form_instance_id);
      const form = inst ? formById.get(inst.form_id) : undefined;
      if (!form || form.study_id !== studyId) continue;
      const s = inst?.subject_id ? subjById.get(inst.subject_id) : undefined;
      const field = fieldById.get(v.form_field_id);
      base.push({ subjectId: inst?.subject_id ?? null, builtin: { subjectId: s?.subject_code ?? "—", site: siteLabel(s?.site_id), form: form.name, field: field?.label ?? "—", value: v.value } });
    }
  } else if (config.dataSource === "visits") {
    for (const v of buildVisits(dataset, studyId)) {
      base.push({ subjectId: v.subjectId, builtin: { subjectId: v.subjectCode, site: v.siteName, visitName: v.visitName, targetDate: v.targetDate, actualDate: v.recordedDate ?? "—", visitStatus: v.completed ? "Completed" : "Pending" } });
    }
  } else if (config.dataSource === "queries") {
    const today = new Date().toISOString().slice(0, 10);
    for (const q of dataset.queries) {
      const inst = dataset.formInstances.find((i) => i.id === q.form_instance_id);
      const form = inst ? formById.get(inst.form_id) : undefined;
      if (!form || form.study_id !== studyId) continue;
      const s = inst?.subject_id ? subjById.get(inst.subject_id) : undefined;
      const fv = q.field_value_id ? dataset.fieldValues.find((x) => x.id === q.field_value_id) : undefined;
      const field = fv ? fieldById.get(fv.form_field_id) : undefined;
      const age = q.created_at ? Math.max(0, Math.round((Date.parse(today) - Date.parse(q.created_at.slice(0, 10))) / 86400000)) : 0;
      base.push({ subjectId: inst?.subject_id ?? null, builtin: { queryId: `Q-${q.id.slice(0, 4).toUpperCase()}`, subjectId: s?.subject_code ?? "—", site: siteLabel(s?.site_id), form: form.name, field: field?.label ?? "—", queryStatus: q.status, age: String(age) } });
    }
  } else if (config.dataSource === "inventory") {
    for (const v of dataset.vials) {
      if (v.studyId !== studyId) continue;
      base.push({ subjectId: null, builtin: { unitId: v.kitNumber ?? v.id, treatmentGroup: v.treatmentGroup, site: siteLabel(v.siteId), unitStatus: v.status } });
    }
  }

  const resolveCol = (r: BaseRow, col: ReportColumn): string => {
    if (col.source === "builtin") return r.builtin[col.key ?? ""] ?? "—";
    if (!r.subjectId || !col.field) return "—";
    const cell = valueIndex.get(r.subjectId)?.get(col.field);
    if (!cell) return "—";
    const day = visitDayOf(col.visit);
    return (day != null ? cell.byDay.get(day) : undefined) ?? cell.latest;
  };

  const rows: Record<string, string>[] = [];
  for (const r of base) {
    const rec: Record<string, string> = {};
    for (const col of config.columns) rec[col.label] = resolveCol(r, col);
    let keep = true;
    for (const f of config.filters) {
      if (!f.column || f.value === "") continue;
      if (!matches(rec[f.column] ?? "", f.operator, f.value)) { keep = false; break; }
    }
    if (keep) rows.push(rec);
  }
  void study;
  return { columns: config.columns.map((c) => c.label), rows, total: rows.length };
}
