// ════════════════════════════════════════════════════════════════════════════
// Custom Report builder — shared config model + client-side resolver. Rows are
// always subject-grain (one row per subject); form-field columns join that
// subject's value + metadata. The Arken Insights AI emits a column/filter config
// (never values); this resolver runs it against the session store, blinding-aware.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { shouldHideArmForSubject } from "@/lib/study-config";
import { buildVisits } from "@/lib/visits-data";

// ─── Column model ────────────────────────────────────────────────────────────
export type FieldAspect =
  | "value" | "unit"
  | "entered_by" | "entered_at" | "last_edited_at"
  | "sdv_status" | "query_status" | "change_reason" | "na_reason"
  | "form_status" | "visit_name" | "submitted_by" | "submitted_at";

export interface ReportColumn {
  id: string; // stable key for drag/react
  label: string;
  kind: "builtin" | "field";
  builtinKey?: string; // subjectId / site / arm / status / …
  form?: string; // field column — form name
  field?: string; // field column — field code
  fieldLabel?: string; // field column — field label (display)
  aspect?: FieldAspect; // field column — what to show
  visit?: string;
}
export interface ReportFilter { column: string; operator: string; value: string; value2?: string }
export interface ReportConfig { columns: ReportColumn[]; filters: ReportFilter[]; title?: string }
export interface SavedReport { id: string; name: string; description: string; config: ReportConfig; createdAt: string }

let _cid = 0;
export const colId = () => `c${++_cid}-${Math.random().toString(36).slice(2, 6)}`;

// Aspect groups shown in picker Step C.
export const ASPECT_GROUPS: { group: string; items: { key: FieldAspect; label: string }[] }[] = [
  { group: "Field data", items: [{ key: "value", label: "Value" }, { key: "unit", label: "Unit" }] },
  { group: "Entry metadata", items: [{ key: "entered_by", label: "Entered by" }, { key: "entered_at", label: "Entered at" }, { key: "last_edited_at", label: "Last edited at" }] },
  { group: "Data quality", items: [{ key: "sdv_status", label: "SDV status" }, { key: "query_status", label: "Query status" }, { key: "change_reason", label: "Change reason" }, { key: "na_reason", label: "N/A reason" }] },
  { group: "Form context", items: [{ key: "form_status", label: "Form status" }, { key: "visit_name", label: "Visit name" }, { key: "submitted_by", label: "Submitted by" }, { key: "submitted_at", label: "Submitted at" }] },
];
export const ASPECT_LABEL = Object.fromEntries(ASPECT_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label]))) as Record<FieldAspect, string>;

// Built-in "forms" shown at the top of picker Step A (each field adds a column directly).
export const BUILTIN_GROUPS: { form: string; name: string; icon: string; fields: { key: string; label: string; type: FieldType }[] }[] = [
  { form: "__subject", name: "Subject info", icon: "user", fields: [
    { key: "status", label: "Status", type: "select" }, { key: "arm", label: "Arm", type: "select" },
    { key: "enrollmentDate", label: "Enrollment date", type: "date" }, { key: "daysOnStudy", label: "Days on study", type: "number" },
    { key: "withdrawalReason", label: "Withdrawal reason", type: "text" },
  ] },
  { form: "__visit", name: "Visit info", icon: "calendar", fields: [
    { key: "visitName", label: "Visit name", type: "text" }, { key: "targetDate", label: "Target date", type: "date" },
    { key: "actualDate", label: "Actual date", type: "date" }, { key: "complianceStatus", label: "Compliance status", type: "select" },
  ] },
  { form: "__query", name: "Query info", icon: "message-report", fields: [
    { key: "openQueryCount", label: "Open query count", type: "number" }, { key: "queryStatus", label: "Query status", type: "select" },
  ] },
];
const BUILTIN_TYPE: Record<string, FieldType> = { subjectId: "text", site: "text", ...Object.fromEntries(BUILTIN_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.type]))) };

export const LOCKED_COLUMNS: ReportColumn[] = [
  { id: "builtin-subjectId", label: "Subject ID", kind: "builtin", builtinKey: "subjectId" },
  { id: "builtin-site", label: "Site", kind: "builtin", builtinKey: "site" },
];
export const isLockedColumn = (c: ReportColumn) => c.kind === "builtin" && (c.builtinKey === "subjectId" || c.builtinKey === "site");

export type FieldType = "text" | "number" | "date" | "select" | "boolean";
const EMPTY_OPS = [{ op: "is_empty", label: "is empty" }, { op: "is_not_empty", label: "is not empty" }];
export const OPERATORS: Record<FieldType, { op: string; label: string }[]> = {
  text: [
    { op: "=", label: "equals" }, { op: "!=", label: "does not equal" },
    { op: "contains", label: "contains" }, { op: "not_contains", label: "does not contain" },
    { op: "starts_with", label: "starts with" }, { op: "ends_with", label: "ends with" }, ...EMPTY_OPS,
  ],
  number: [
    { op: "=", label: "equals" }, { op: "!=", label: "does not equal" },
    { op: ">", label: "is greater than" }, { op: ">=", label: "is greater than or equal to" },
    { op: "<", label: "is less than" }, { op: "<=", label: "is less than or equal to" },
    { op: "between", label: "is between" }, ...EMPTY_OPS,
  ],
  date: [
    { op: "=", label: "equals" }, { op: "before", label: "is before" }, { op: "after", label: "is after" },
    { op: "between", label: "is between" }, { op: "in_last_days", label: "is in the last X days" },
    { op: "in_next_days", label: "is in the next X days" }, ...EMPTY_OPS,
  ],
  select: [
    { op: "=", label: "equals" }, { op: "!=", label: "does not equal" },
    { op: "one_of", label: "is one of" }, { op: "not_one_of", label: "is not one of" }, ...EMPTY_OPS,
  ],
  boolean: [{ op: "is_true", label: "is true" }, { op: "is_false", label: "is false" }],
};
// Operators that need no value / two values / a "days" number — the builder renders inputs accordingly.
export const NO_VALUE_OPS = new Set(["is_empty", "is_not_empty", "is_true", "is_false"]);
export const TWO_VALUE_OPS = new Set(["between"]);
export const DAYS_OPS = new Set(["in_last_days", "in_next_days"]);

// ─── Persistence (sessionStorage) ────────────────────────────────────────────
const PENDING_KEY = "arken_pending_report_config";
const savedKey = (studyId: string) => `arken_custom_reports_${studyId}`;
export function takePendingConfig(): ReportConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(PENDING_KEY);
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

// ─── Field schema (AI system prompt — form/field/type, NO values) ────────────
export interface FieldSchema { forms: { name: string; fields: { code: string; label: string; type: string }[] }[] }
export function buildFieldSchema(dataset: Dataset, studyId: string): FieldSchema {
  return { forms: pickableForms(dataset, studyId).map((f) => ({ name: f.name, fields: f.fields.map((x) => ({ code: x.code, label: x.label, type: x.type })) })) };
}
// Forms (deduped by name) with their fields — used by the picker + the schema.
export function pickableForms(dataset: Dataset, studyId: string): { name: string; fields: { code: string; label: string; type: FieldType }[] }[] {
  const forms = dataset.forms.filter((f) => f.study_id === studyId && !f.is_summary);
  const byName = new Map<string, { code: string; label: string; type: FieldType }[]>();
  const order: string[] = [];
  for (const form of forms) {
    for (const ff of dataset.formFields.filter((x) => x.form_id === form.id)) {
      const arr = byName.get(form.name) ?? (order.push(form.name), byName.get(form.name) ?? []);
      if (!byName.has(form.name)) byName.set(form.name, arr);
      if (!arr.some((x) => x.code === ff.code)) arr.push({ code: ff.code, label: ff.label, type: normType(ff.field_type) });
      byName.set(form.name, arr);
    }
  }
  return order.filter((n, i) => order.indexOf(n) === i).map((n) => ({ name: n, fields: byName.get(n) ?? [] })).filter((f) => f.fields.length > 0);
}
function normType(t: string): FieldType { return t === "number" || t === "integer" ? "number" : t === "date" ? "date" : t === "select" || t === "radio" ? "select" : t === "boolean" || t === "checkbox" || t === "bool" ? "boolean" : "text"; }

export function visitDayOf(label: string | undefined): number | null {
  if (!label) return null;
  const d = label.match(/Day\s+(\d+)/i); if (d) return Number(d[1]);
  const w = label.match(/Week\s+(\d+)/i); if (w) return Number(w[1]) * 7;
  const fu = label.match(/follow-?up\s*(\d+)|FU\s*(\d+)/i); if (fu) return Number(fu[1] ?? fu[2]) * 14;
  if (/baseline|screening|enrol/i.test(label)) return 0;
  if (/end of study|final|eos/i.test(label)) return 84;
  return null;
}

const STATUS_LABEL: Record<string, string> = { empty: "Empty", in_work: "In-work", in_review: "In-Review", reviewed: "Reviewed", finalized: "Finalized", locked: "Locked" };

// ─── Value + metadata index: subjectId → `${formName}|${code}` → cell ────────
interface Cell { byDay: Map<number, CellVal>; latest: CellVal }
interface CellVal { value: string; fvId: string; instId: string; instStatus: string; formName: string }
function buildIndex(dataset: Dataset, studyId: string): Map<string, Map<string, Cell>> {
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const idx = new Map<string, Map<string, Cell>>();
  const fvByInst = new Map<string, { fvId: string; code: string; value: string }[]>();
  for (const v of dataset.fieldValues) {
    if (v.value == null) continue;
    const c = fieldById.get(v.form_field_id)?.code;
    if (!c) continue;
    (fvByInst.get(v.form_instance_id) ?? fvByInst.set(v.form_instance_id, []).get(v.form_instance_id)!).push({ fvId: v.id, code: c, value: v.value });
  }
  for (const inst of dataset.formInstances) {
    if (!inst.subject_id) continue;
    const list = fvByInst.get(inst.id);
    if (!list) continue;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId) continue;
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : undefined;
    const day = visitDayOf(form.name) ?? visitDayOf(parent?.name);
    let byKey = idx.get(inst.subject_id);
    if (!byKey) { byKey = new Map(); idx.set(inst.subject_id, byKey); }
    for (const { fvId, code, value } of list) {
      const key = `${form.name}|${code}`;
      const cv: CellVal = { value, fvId, instId: inst.id, instStatus: inst.status, formName: form.name };
      let cell = byKey.get(key);
      if (!cell) { cell = { byDay: new Map(), latest: cv }; byKey.set(key, cell); }
      cell.latest = cv;
      if (day != null) cell.byDay.set(day, cv);
    }
  }
  return idx;
}

const isEmptyVal = (a: string) => a === "" || a === "—";
const TRUEY = new Set(["yes", "true", "1", "y", "verified", "complete", "on time"]);
function shiftDays(iso: string, n: number): string { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function matchFilter(cellValue: string, f: ReportFilter, today: string): boolean {
  const a = cellValue ?? "";
  const t = f.value ?? "", t2 = f.value2 ?? "";
  const lc = a.toLowerCase();
  const nA = Number(a), nB = Number(t);
  const numeric = a !== "" && t !== "" && Number.isFinite(nA) && Number.isFinite(nB);
  const cmp = (op: ">" | ">=" | "<" | "<=", x: string) => {
    const nx = Number(x); const num = a !== "" && x !== "" && Number.isFinite(nA) && Number.isFinite(nx);
    if (op === ">") return num ? nA > nx : a > x;
    if (op === ">=") return num ? nA >= nx : a >= x;
    if (op === "<") return num ? nA < nx : a < x;
    return num ? nA <= nx : a <= x;
  };
  switch (f.operator) {
    case "is_empty": return isEmptyVal(a);
    case "is_not_empty": return !isEmptyVal(a);
    case "is_true": return TRUEY.has(lc);
    case "is_false": return !isEmptyVal(a) && !TRUEY.has(lc);
    case "=": return numeric ? nA === nB : lc === t.toLowerCase();
    case "!=": return numeric ? nA !== nB : lc !== t.toLowerCase();
    case "contains": return lc.includes(t.toLowerCase());
    case "not_contains": return !lc.includes(t.toLowerCase());
    case "starts_with": return lc.startsWith(t.toLowerCase());
    case "ends_with": return lc.endsWith(t.toLowerCase());
    case ">": return cmp(">", t);
    case ">=": return cmp(">=", t);
    case "<": case "before": return cmp("<", t);
    case "<=": return cmp("<=", t);
    case "after": return cmp(">", t);
    case "between": return cmp(">=", t) && cmp("<=", t2);
    case "in_last_days": { const x = Number(t); if (!Number.isFinite(x) || isEmptyVal(a)) return false; return a >= shiftDays(today, -x) && a <= today; }
    case "in_next_days": { const x = Number(t); if (!Number.isFinite(x) || isEmptyVal(a)) return false; return a >= today && a <= shiftDays(today, x); }
    case "one_of": return t.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(lc);
    case "not_one_of": return !t.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean).includes(lc);
    default: return true;
  }
}
// True when a filter is "ready" (has the value(s) its operator needs).
function filterActive(f: ReportFilter): boolean {
  if (!f.column) return false;
  if (NO_VALUE_OPS.has(f.operator)) return true;
  if (TWO_VALUE_OPS.has(f.operator)) return f.value !== "" && (f.value2 ?? "") !== "";
  return f.value !== "";
}

export function columnFieldType(dataset: Dataset, studyId: string, col: ReportColumn): FieldType {
  if (col.kind === "builtin") return BUILTIN_TYPE[col.builtinKey ?? ""] ?? "text";
  if (col.aspect && col.aspect !== "value") return col.aspect.endsWith("_at") ? "date" : "text";
  const f = pickableForms(dataset, studyId).find((x) => x.name === col.form)?.fields.find((x) => x.code === col.field);
  return f?.type ?? "text";
}

export interface ResolvedReport { columns: string[]; rows: Record<string, string>[]; total: number }

export function resolveReport(dataset: Dataset, studyId: string, config: ReportConfig, role: Role): ResolvedReport {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const fieldByFormCode = new Map<string, { unit?: string | null; label: string }>();
  for (const f of dataset.forms) { if (f.study_id !== studyId) continue; for (const ff of dataset.formFields.filter((x) => x.form_id === f.id)) fieldByFormCode.set(`${f.name}|${ff.code}`, { unit: ff.unit, label: ff.label }); }
  const idx = buildIndex(dataset, studyId);
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));
  const queryByFv = new Map<string, string>(); for (const q of dataset.queries) if (q.field_value_id) queryByFv.set(q.field_value_id, q.status);
  const sdvByFv = new Map(dataset.sdvRecords.map((r) => [r.field_value_id, r]));
  const deltaByFv = new Map<string, { reason: string; author: string; at: string }>();
  for (const d of dataset.deltaRecords) { const cur = deltaByFv.get(d.field_value_id); if (!cur || d.created_at > cur.at) deltaByFv.set(d.field_value_id, { reason: d.reason, author: d.author_name, at: d.created_at }); }

  const today = new Date().toISOString().slice(0, 10);
  const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const arms = Array.from(new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.randomization_arm).filter(Boolean) as string[])).sort();
  const maskMap = new Map(arms.map((a, i) => [a, `Treatment ${String.fromCharCode(65 + i)}`]));
  const armDisplay = (id: string, raw: string | null) => (!raw ? "—" : shouldHideArmForSubject(dataset, studyId, role, id) ? maskMap.get(raw) ?? "Treatment —" : raw);
  const siteLabel = (sid: string | null | undefined) => { const s = sid ? siteById.get(sid) : undefined; return s ? `${s.code} · ${s.name}` : "—"; };

  // Per-subject representative visit (most urgent incomplete, else latest completed).
  const visitBySubject = new Map<string, { name: string; target: string; actual: string; status: string }>();
  for (const v of buildVisits(dataset, studyId)) {
    const prev = visitBySubject.get(v.subjectId);
    const overdue = !v.completed;
    const cand = { name: v.visitName, target: v.targetDate, actual: v.recordedDate ?? "—", status: v.completed ? "Completed" : (Date.parse(v.targetDate) < Date.parse(today) ? "Overdue" : "Upcoming") };
    if (!prev || (overdue && prev.status === "Completed") || (overdue && v.targetDate < prev.target)) visitBySubject.set(v.subjectId, cand);
  }
  const openQBySubject = new Map<string, number>();
  const worstQBySubject = new Map<string, string>();
  {
    const instSubj = new Map(dataset.formInstances.map((i) => [i.id, i.subject_id]));
    for (const q of dataset.queries) {
      const sid = instSubj.get(q.form_instance_id); if (!sid) continue;
      if (q.status !== "resolved" && q.status !== "closed") openQBySubject.set(sid, (openQBySubject.get(sid) ?? 0) + 1);
      const rank = q.status === "open" ? 3 : q.status === "responded" ? 2 : 1;
      const cur = worstQBySubject.get(sid); const curRank = cur === "Open" ? 3 : cur === "Responded" ? 2 : cur === "Resolved" ? 1 : 0;
      if (rank > curRank) worstQBySubject.set(sid, q.status === "open" ? "Open" : q.status === "responded" ? "Responded" : "Resolved");
    }
  }

  const resolveBuiltin = (s: Dataset["subjects"][number], key: string): string => {
    const enrollDate = firstVal(idx, s.id, ["enrollment_date", "randomization_date", "consent_date", "placement_date", "screening_date"]);
    switch (key) {
      case "subjectId": return s.subject_code;
      case "site": return siteLabel(s.site_id);
      case "arm": return armDisplay(s.id, s.randomization_arm);
      case "status": return s.ineligible ? "ineligible" : s.status;
      case "enrollmentDate": return enrollDate ?? "—";
      case "daysOnStudy": return enrollDate ? String(Math.max(0, dayDiff(enrollDate, today))) : "—";
      case "withdrawalReason": return firstVal(idx, s.id, ["withdrawal_reason", "reason_for_withdrawal"]) ?? "—";
      case "visitName": return visitBySubject.get(s.id)?.name ?? "—";
      case "targetDate": return visitBySubject.get(s.id)?.target ?? "—";
      case "actualDate": return visitBySubject.get(s.id)?.actual ?? "—";
      case "complianceStatus": return visitBySubject.get(s.id)?.status ?? "—";
      case "openQueryCount": return String(openQBySubject.get(s.id) ?? 0);
      case "queryStatus": return worstQBySubject.get(s.id) ?? "None";
      default: return "—";
    }
  };
  const resolveField = (subjectId: string, col: ReportColumn): string => {
    if (!col.form || !col.field) return "—";
    const cell = idx.get(subjectId)?.get(`${col.form}|${col.field}`);
    if (!cell) return "—";
    const day = visitDayOf(col.visit);
    const cv = (day != null ? cell.byDay.get(day) : undefined) ?? cell.latest;
    const fv = fvById.get(cv.fvId);
    const aspect = col.aspect ?? "value";
    switch (aspect) {
      case "value": return fv?.notDone ? "N/A" : cv.value;
      case "unit": return fieldByFormCode.get(`${col.form}|${col.field}`)?.unit ?? "—";
      case "na_reason": return fv?.notDoneReason ?? "—";
      case "sdv_status": { if (fv?.notDone) return "N/A"; const r = sdvByFv.get(cv.fvId); if (r?.status === "verified") return "Verified"; if (queryByFv.get(cv.fvId) && queryByFv.get(cv.fvId) !== "resolved") return "Queried"; return "Unverified"; }
      case "query_status": { const q = queryByFv.get(cv.fvId); return !q ? "None" : q === "resolved" || q === "closed" ? "Resolved" : "Open"; }
      case "change_reason": return deltaByFv.get(cv.fvId)?.reason || "—";
      case "form_status": return STATUS_LABEL[cv.instStatus] ?? cv.instStatus;
      case "visit_name": return cv.formName;
      case "entered_by": return deltaByFv.get(cv.fvId)?.author ?? "—";
      case "last_edited_at": return deltaByFv.get(cv.fvId)?.at?.slice(0, 16).replace("T", " ") ?? "—";
      case "entered_at": case "submitted_by": case "submitted_at": return "—"; // not tracked in the session seed
      default: return "—";
    }
  };

  const rows: Record<string, string>[] = [];
  for (const s of dataset.subjects) {
    if (s.study_id !== studyId) continue;
    const rec: Record<string, string> = {};
    for (const col of config.columns) rec[col.label] = col.kind === "builtin" ? resolveBuiltin(s, col.builtinKey ?? "") : resolveField(s.id, col);
    let keep = true;
    for (const f of config.filters) { if (!filterActive(f)) continue; if (!matchFilter(rec[f.column] ?? "", f, today)) { keep = false; break; } }
    if (keep) rows.push(rec);
  }
  return { columns: config.columns.map((c) => c.label), rows, total: rows.length };
}

function firstVal(idx: Map<string, Map<string, Cell>>, subjectId: string, codes: string[]): string | null {
  const byKey = idx.get(subjectId);
  if (!byKey) return null;
  for (const [key, cell] of Array.from(byKey.entries())) { const code = key.split("|")[1]; if (codes.includes(code)) return cell.latest.value; }
  return null;
}
