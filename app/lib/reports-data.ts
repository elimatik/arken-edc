// ════════════════════════════════════════════════════════════════════════════
// Reports module derivations + catalog. Every figure here is derived live from
// the session dataset — no new fields, no hardcoded numbers. Clinical dates live
// as field VALUES (e.g. a value "2025-08-15" on a field whose code is
// "visit_date"), never as columns on subjects/instances, so most helpers walk a
// per-subject value index keyed by field code.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, SubjectRow } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { buildVisits } from "@/lib/visits-data";

// ─── Report catalog ──────────────────────────────────────────────────────────
export type ReportId =
  | "study-status"
  | "enrollment-disposition"
  | "site-performance"
  | "visit-compliance"
  | "data-completeness"
  | "query-edit-check"
  | "safety-ae"
  | "sdv-completion";

export const REPORT_CATEGORIES = [
  "Study Overview & Enrollment",
  "Site Performance",
  "Data Quality & Integrity",
  "Safety & Regulatory",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface ReportMeta {
  id: ReportId;
  title: string;
  slug: string; // CSV filename segment
  description: string;
  category: ReportCategory;
  icon: string; // Tabler icon (no `ti ti-` prefix)
  roles: Role[]; // roles that may open the report
  hasCsv: boolean; // a primary table is CSV-exportable
}

// Role access mirrors the spec matrix. Sponsor is "aggregate only" (no subject
// IDs) — that's enforced per-report via isAggregateRole(), not by hiding columns
// here. CRC is excluded module-wide (handled at the route gate).
export const REPORT_CATALOG: ReportMeta[] = [
  { id: "study-status", title: "Study Status Summary", slug: "study_status", category: "Study Overview & Enrollment", icon: "clipboard-data",
    description: "One-page snapshot of where the study stands — enrolment, data, queries, and SDV.",
    roles: ["CRA", "DM", "PI", "Admin", "Sponsor"], hasCsv: false },
  { id: "enrollment-disposition", title: "Enrollment & Disposition", slug: "enrollment_disposition", category: "Study Overview & Enrollment", icon: "users-group",
    description: "Subject accounting from screen to exit, with arm balance and screen-failure reasons.",
    roles: ["CRA", "DM", "PI", "Admin", "Sponsor"], hasCsv: true },
  { id: "site-performance", title: "Site Performance Report", slug: "site_performance", category: "Site Performance", icon: "building-hospital",
    description: "How each site is performing across enrolment, completion, SDV, queries, and overdue visits.",
    roles: ["CRA", "DM", "Admin", "Sponsor"], hasCsv: true },
  { id: "visit-compliance", title: "Visit Compliance Report", slug: "visit_compliance", category: "Site Performance", icon: "calendar-check",
    description: "Which scheduled visits are on time, outside window, or overdue — and by how many days.",
    roles: ["CRA", "DM", "PI", "Admin"], hasCsv: true },
  { id: "data-completeness", title: "Data Completeness Report", slug: "data_completeness", category: "Data Quality & Integrity", icon: "checklist",
    description: "Field-level completeness across forms and sites, with the missing-required action list.",
    roles: ["CRA", "DM", "Admin"], hasCsv: true },
  { id: "query-edit-check", title: "Query & Edit Check Report", slug: "query_edit_check", category: "Data Quality & Integrity", icon: "message-report",
    description: "Query volume, age, and resolution rate — including the oldest unresolved queries.",
    roles: ["CRA", "DM", "Admin"], hasCsv: true },
  { id: "safety-ae", title: "Safety & AE Summary", slug: "safety_ae", category: "Safety & Regulatory", icon: "heartbeat",
    description: "Adverse-event accounting: AE/SAE counts, severity, relatedness, and outcomes.",
    roles: ["DM", "PI", "Admin", "Sponsor"], hasCsv: false },
  { id: "sdv-completion", title: "SDV Completion Report", slug: "sdv_completion", category: "Safety & Regulatory", icon: "shield-check",
    description: "Monitoring evidence — fields verified, per-site progress, and the unverified-fields action list.",
    roles: ["CRA", "DM", "Admin"], hasCsv: true },
];

export function reportsForRole(role: Role): ReportMeta[] {
  return REPORT_CATALOG.filter((r) => r.roles.includes(role));
}
export function reportById(id: string): ReportMeta | undefined {
  return REPORT_CATALOG.find((r) => r.id === id);
}
// Sponsor sees aggregate only — never individual subject IDs or per-arm masks.
export function isAggregateRole(role: Role): boolean {
  return role === "Sponsor";
}

// ─── Shared value index ──────────────────────────────────────────────────────
// subjectId → (field code → all non-empty values that subject carries for it).
export interface SubjectIndex {
  byCode: Map<string, Map<string, string[]>>;
  subjects: SubjectRow[];
}
export function buildSubjectIndex(dataset: Dataset, studyId: string): SubjectIndex {
  const subjects = dataset.subjects.filter((s) => s.study_id === studyId);
  const subjIds = new Set(subjects.map((s) => s.id));
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const byCode = new Map<string, Map<string, string[]>>();
  for (const fv of dataset.fieldValues) {
    if (fv.value == null || fv.value === "") continue;
    const sid = instById.get(fv.form_instance_id)?.subject_id;
    if (!sid || !subjIds.has(sid)) continue;
    const code = fieldById.get(fv.form_field_id)?.code;
    if (!code) continue;
    let m = byCode.get(sid);
    if (!m) { m = new Map(); byCode.set(sid, m); }
    const arr = m.get(code) ?? [];
    arr.push(fv.value);
    m.set(code, arr);
  }
  return { byCode, subjects };
}
const first = (m: Map<string, string[]> | undefined, ...codes: string[]): string | null => {
  for (const c of codes) { const a = m?.get(c); if (a && a.length) return a[0]; }
  return null;
};
const earliestDate = (m: Map<string, string[]> | undefined, ...codes: string[]): string | null => {
  let out: string | null = null;
  for (const c of codes) for (const v of m?.get(c) ?? []) if (/^\d{4}-\d{2}-\d{2}/.test(v) && (!out || v < out)) out = v;
  return out;
};

const ENROLLED = new Set(["randomized", "enrolled", "active", "completed", "withdrawn"]);
const DONE_STATUSES = new Set(["in_review", "reviewed", "finalized", "locked"]);
const SDV_INELIGIBLE = new Set(["file", "calculated", "textarea"]);
const todayISO = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Blinded arm labels for Sponsor (stable A/B/C order by arm name).
export function armLabeler(dataset: Dataset, studyId: string, blinded: boolean): (arm: string | null) => string {
  const arms = Array.from(new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.randomization_arm).filter(Boolean) as string[])).sort();
  const idx = new Map(arms.map((a, i) => [a, `Arm ${String.fromCharCode(65 + i)}`]));
  return (arm) => (arm == null || arm === "" ? "—" : blinded ? idx.get(arm) ?? "Arm —" : arm);
}

// ─── Disposition (subject accounting) ────────────────────────────────────────
export interface Disposition {
  subjectId: string;
  subjectCode: string;
  arm: string | null;
  siteId: string | null;
  siteCode: string;
  siteName: string;
  status: string;
  enrolled: boolean;
  isScreenFailure: boolean;
  enrollDate: string | null;
  exitDate: string | null;
  exitReason: string | null;
}
function isScreenFailure(s: SubjectRow, m: Map<string, string[]> | undefined): boolean {
  if (s.ineligible) return true;
  const e = (first(m, "eligible", "eligibility_status", "overall_eligibility") ?? "").toLowerCase();
  return s.status === "screening" && /fail|ineligible|not eligible|excluded/.test(e);
}
export function dispositions(dataset: Dataset, studyId: string, ix?: SubjectIndex): Disposition[] {
  const index = ix ?? buildSubjectIndex(dataset, studyId);
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  return index.subjects.map((s) => {
    const m = index.byCode.get(s.id);
    const site = s.site_id ? siteById.get(s.site_id) : undefined;
    const exitReason =
      s.status === "withdrawn" ? first(m, "withdrawal_reason", "reason_for_withdrawal", "discontinuation_reason") ?? "Withdrawn"
      : s.status === "completed" ? first(m, "completion_status", "clinical_outcome", "disposition") ?? "Completed"
      : null;
    const exitDate =
      s.status === "withdrawn" ? earliestDate(m, "withdrawal_date", "early_termination_date", "death_date")
      : s.status === "completed" ? earliestDate(m, "completion_date", "eos_date") ?? null
      : null;
    return {
      subjectId: s.id, subjectCode: s.subject_code, arm: s.randomization_arm,
      siteId: s.site_id, siteCode: site?.code ?? "—", siteName: site?.name ?? "—",
      status: s.status, enrolled: ENROLLED.has(s.status), isScreenFailure: isScreenFailure(s, m),
      enrollDate: earliestDate(m, "enrollment_date", "randomization_date", "consent_date", "placement_date", "screening_date", "visit_date"),
      exitDate, exitReason,
    };
  });
}

export interface Funnel { screened: number; eligible: number; enrolled: number; active: number; completed: number; withdrawn: number; screenFailures: number }
export function dispositionFunnel(disp: Disposition[]): Funnel {
  const screenFailures = disp.filter((d) => d.isScreenFailure).length;
  return {
    screened: disp.length,
    eligible: disp.length - screenFailures,
    enrolled: disp.filter((d) => d.enrolled).length,
    active: disp.filter((d) => d.status === "active").length,
    completed: disp.filter((d) => d.status === "completed").length,
    withdrawn: disp.filter((d) => d.status === "withdrawn").length,
    screenFailures,
  };
}

export interface ArmBalanceRow { arm: string; enrolled: number; active: number; completed: number; withdrawn: number; screenFailures: number }
export function armBalance(disp: Disposition[], label: (a: string | null) => string): ArmBalanceRow[] {
  const map = new Map<string, ArmBalanceRow>();
  for (const d of disp) {
    const arm = label(d.arm);
    let r = map.get(arm);
    if (!r) { r = { arm, enrolled: 0, active: 0, completed: 0, withdrawn: 0, screenFailures: 0 }; map.set(arm, r); }
    if (d.enrolled) r.enrolled++;
    if (d.status === "active") r.active++;
    if (d.status === "completed") r.completed++;
    if (d.status === "withdrawn") r.withdrawn++;
    if (d.isScreenFailure) r.screenFailures++;
  }
  return Array.from(map.values()).filter((r) => r.arm !== "—").sort((a, b) => a.arm.localeCompare(b.arm));
}

export function screenFailureReasons(dataset: Dataset, studyId: string, ix: SubjectIndex): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of ix.subjects) {
    const m = ix.byCode.get(s.id);
    if (!isScreenFailure(s, m)) continue;
    const reason = first(m, "screen_fail_reason", "ineligibility_reason", "exclusion_reason", "withdrawal_reason") ?? "Did not meet eligibility criteria";
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
}

// Arm split for the enrolment bar (count enrolled per arm, in stable order).
export function enrollmentByArm(disp: Disposition[], label: (a: string | null) => string): { arm: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of disp) if (d.enrolled) { const a = label(d.arm); map.set(a, (map.get(a) ?? 0) + 1); }
  return Array.from(map.entries()).map(([arm, count]) => ({ arm, count })).filter((r) => r.arm !== "—").sort((a, b) => a.arm.localeCompare(b.arm));
}

// ─── Site performance ────────────────────────────────────────────────────────
export interface SitePerfRow {
  siteId: string; code: string; name: string;
  enrolled: number; target: number | null;
  formPct: number; formCompleted: number; formTotal: number;
  sdvPct: number; sdvVerified: number; sdvTotal: number;
  openQueries: number; overdueVisits: number;
  lastDataEntry: string | null; lastMonitoring: string | null;
}
export function sitePerformance(dataset: Dataset, studyId: string): SitePerfRow[] {
  const sites = dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const subjects = dataset.subjects.filter((s) => s.study_id === studyId);
  const subById = new Map(subjects.map((s) => [s.id, s]));
  const insts = dataset.formInstances.filter((i) => i.subject_id != null && subById.has(i.subject_id));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));
  const visits = buildVisits(dataset, studyId);
  const today = todayISO();
  // last monitoring date per site: site-scoped monitoring_visits / siv instances' visit_date.
  const monForms = new Set(dataset.forms.filter((f) => (f.code === "monitoring_visits" || f.code === "siv") && f.study_id === studyId).map((f) => f.id));
  const monDateFields = new Set(dataset.formFields.filter((f) => monForms.has(f.form_id) && (f.code === "visit_date" || f.code === "siv_date")).map((f) => f.id));
  const lastMonBySite = new Map<string, string>();
  for (const inst of dataset.formInstances) {
    if (!monForms.has(inst.form_id) || !inst.site_id) continue;
    for (const v of dataset.fieldValues) {
      if (v.form_instance_id !== inst.id || !monDateFields.has(v.form_field_id) || !v.value) continue;
      const cur = lastMonBySite.get(inst.site_id);
      if (!cur || v.value > cur) lastMonBySite.set(inst.site_id, v.value);
    }
  }
  return sites.map((site) => {
    const siteInsts = insts.filter((i) => subById.get(i.subject_id!)?.site_id === site.id);
    const instIds = new Set(siteInsts.map((i) => i.id));
    const formCompleted = siteInsts.filter((i) => DONE_STATUSES.has(i.status)).length;
    const formTotal = siteInsts.length;
    const sdvTotal = dataset.fieldValues.filter((v) => {
      if (!instIds.has(v.form_instance_id) || !v.value) return false;
      const f = fieldById.get(v.form_field_id);
      return !!f && !SDV_INELIGIBLE.has(f.field_type);
    }).length;
    const sdvVerified = dataset.sdvRecords.filter((r) => r.status === "verified" && instIds.has(r.form_instance_id)).length;
    const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved" && (!q.field_value_id || fvById.has(q.field_value_id))).length;
    const overdueVisits = visits.filter((v) => v.siteId === site.id && !v.completed && v.subjectStatus === "active" && v.targetDate < today).length;
    // last data entry ≈ latest date value carried on any of this site's instances.
    let lastDataEntry: string | null = null;
    for (const v of dataset.fieldValues) {
      if (!instIds.has(v.form_instance_id) || !v.value || !/^\d{4}-\d{2}-\d{2}/.test(v.value)) continue;
      if (!lastDataEntry || v.value > lastDataEntry) lastDataEntry = v.value;
    }
    return {
      siteId: site.id, code: site.code, name: site.name,
      enrolled: subjects.filter((s) => s.site_id === site.id && ENROLLED.has(s.status)).length,
      target: site.enrollment_target ?? null,
      formPct: formTotal ? Math.round((formCompleted / formTotal) * 100) : 0, formCompleted, formTotal,
      sdvPct: sdvTotal ? Math.round((sdvVerified / sdvTotal) * 100) : 0, sdvVerified, sdvTotal,
      openQueries, overdueVisits, lastDataEntry, lastMonitoring: lastMonBySite.get(site.id) ?? null,
    };
  });
}

// Monitoring visit log (site-scoped monitoring_visits / siv instances).
export interface MonitoringLogRow { siteCode: string; siteName: string; visitType: string; date: string | null; conductedBy: string; findings: string }
export function monitoringLog(dataset: Dataset, studyId: string): MonitoringLogRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const monForms = new Map(dataset.forms.filter((f) => (f.code === "monitoring_visits" || f.code === "siv") && f.study_id === studyId).map((f) => [f.id, f.code]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const rows: MonitoringLogRow[] = [];
  for (const inst of dataset.formInstances) {
    const formCode = monForms.get(inst.form_id);
    if (!formCode || !inst.site_id) continue;
    const site = siteById.get(inst.site_id);
    const vals = new Map<string, string>();
    for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id && v.value) { const c = fieldById.get(v.form_field_id)?.code; if (c) vals.set(c, v.value); }
    rows.push({
      siteCode: site?.code ?? "—", siteName: site?.name ?? "—",
      visitType: vals.get("visit_type") ?? (formCode === "siv" ? "Site Initiation" : "Routine Monitoring"),
      date: vals.get("visit_date") ?? vals.get("siv_date") ?? null,
      conductedBy: vals.get("cra_name") ?? vals.get("siv_conducted_by") ?? vals.get("conducted_by") ?? "—",
      findings: vals.get("findings_summary") ?? vals.get("findings") ?? "—",
    });
  }
  return rows.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// ─── Visit compliance ────────────────────────────────────────────────────────
export type VisitStatus = "on-time" | "outside" | "overdue" | "pending";
export interface VisitComplianceRow {
  id: string; subjectCode: string; siteName: string; visitName: string;
  targetDate: string; window: number; actualDate: string | null; daysFromTarget: number | null; status: VisitStatus;
}
export function visitComplianceRows(dataset: Dataset, studyId: string): VisitComplianceRow[] {
  const today = todayISO();
  const rows: VisitComplianceRow[] = [];
  for (const v of buildVisits(dataset, studyId)) {
    let status: VisitStatus; let daysFromTarget: number | null = null;
    if (v.completed && v.recordedDate) {
      daysFromTarget = dayDiff(v.targetDate, v.recordedDate);
      status = Math.abs(daysFromTarget) <= v.window ? "on-time" : "outside";
    } else if (v.completed) {
      status = "on-time";
    } else if (v.subjectStatus === "active" && v.targetDate < today) {
      status = "overdue"; daysFromTarget = dayDiff(v.targetDate, today);
    } else {
      status = "pending";
    }
    rows.push({
      id: v.id, subjectCode: v.subjectCode, siteName: v.siteName, visitName: v.visitName,
      targetDate: v.targetDate, window: v.window, actualDate: v.recordedDate, daysFromTarget, status,
    });
  }
  return rows;
}
export interface VisitComplianceSummary { onTime: number; outside: number; overdue: number; total: number }
export function visitComplianceSummary(rows: VisitComplianceRow[]): VisitComplianceSummary {
  return {
    onTime: rows.filter((r) => r.status === "on-time").length,
    outside: rows.filter((r) => r.status === "outside").length,
    overdue: rows.filter((r) => r.status === "overdue").length,
    total: rows.length,
  };
}

// ─── Data completeness ───────────────────────────────────────────────────────
export interface FormCompletenessRow { formCode: string; formName: string; submitted: number; missingRequired: number; pending: number; locked: number }
export function completenessByForm(dataset: Dataset, studyId: string): FormCompletenessRow[] {
  const forms = dataset.forms.filter((f) => f.study_id === studyId && !f.is_summary);
  const subById = new Map(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => [s.id, s]));
  const requiredByForm = new Map<string, string[]>(); // formId → required field ids
  for (const f of dataset.formFields) if (f.is_required) { const a = requiredByForm.get(f.form_id) ?? []; a.push(f.id); requiredByForm.set(f.form_id, a); }
  const fvByInst = new Map<string, Set<string>>(); // instId → field ids with a non-empty value
  for (const v of dataset.fieldValues) if (v.value) { const s = fvByInst.get(v.form_instance_id) ?? new Set(); s.add(v.form_field_id); fvByInst.set(v.form_instance_id, s); }
  return forms.map((form) => {
    const insts = dataset.formInstances.filter((i) => i.form_id === form.id && (i.subject_id == null || subById.has(i.subject_id)));
    const submitted = insts.filter((i) => DONE_STATUSES.has(i.status) || i.status === "in_work").length;
    const locked = insts.filter((i) => i.status === "locked").length;
    const pending = insts.filter((i) => i.status === "" || i.status === "empty").length;
    const reqIds = requiredByForm.get(form.id) ?? [];
    let missingRequired = 0;
    for (const inst of insts) {
      if (!(DONE_STATUSES.has(inst.status) || inst.status === "in_work")) continue;
      const have = fvByInst.get(inst.id) ?? new Set();
      missingRequired += reqIds.filter((id) => !have.has(id)).length;
    }
    return { formCode: form.code, formName: form.name, submitted, missingRequired, pending, locked };
  }).filter((r) => r.submitted + r.pending + r.locked > 0).sort((a, b) => b.missingRequired - a.missingRequired || a.formName.localeCompare(b.formName));
}

export interface MissingFieldRow { subjectCode: string; siteName: string; formName: string; fieldLabel: string }
export function missingDataDetail(dataset: Dataset, studyId: string, limit = 200): MissingFieldRow[] {
  const subById = new Map(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => [s.id, s]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldsByForm = new Map<string, { id: string; label: string }[]>();
  for (const f of dataset.formFields) if (f.is_required) { const a = fieldsByForm.get(f.form_id) ?? []; a.push({ id: f.id, label: f.label }); fieldsByForm.set(f.form_id, a); }
  const fvByInst = new Map<string, Set<string>>();
  for (const v of dataset.fieldValues) if (v.value) { const s = fvByInst.get(v.form_instance_id) ?? new Set(); s.add(v.form_field_id); fvByInst.set(v.form_instance_id, s); }
  const out: MissingFieldRow[] = [];
  for (const inst of dataset.formInstances) {
    if (!(DONE_STATUSES.has(inst.status) || inst.status === "in_work")) continue;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId || form.is_summary) continue;
    const subj = inst.subject_id ? subById.get(inst.subject_id) : undefined;
    if (inst.subject_id && !subj) continue;
    const have = fvByInst.get(inst.id) ?? new Set();
    for (const field of fieldsByForm.get(form.id) ?? []) {
      if (have.has(field.id)) continue;
      out.push({
        subjectCode: subj?.subject_code ?? "—",
        siteName: (subj?.site_id ? siteById.get(subj.site_id)?.name : siteById.get(inst.site_id ?? "")?.name) ?? "—",
        formName: form.name, fieldLabel: field.label,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// ─── Queries & edit checks ───────────────────────────────────────────────────
export interface QuerySummary { total: number; open: number; responded: number; resolved: number; resolutionRate: number }
export function querySummary(dataset: Dataset, studyId: string): QuerySummary {
  const instIds = subjectInstanceIds(dataset, studyId);
  const qs = dataset.queries.filter((q) => instIds.has(q.form_instance_id));
  const resolved = qs.filter((q) => q.status === "resolved").length;
  return {
    total: qs.length, open: qs.filter((q) => q.status === "open").length,
    responded: qs.filter((q) => q.status === "responded").length, resolved,
    resolutionRate: qs.length ? Math.round((resolved / qs.length) * 100) : 0,
  };
}

// Query categories — classify by edit-check origin / title keywords (same buckets
// the dashboard "Queries by type" card uses).
export interface QueryCategory { key: string; label: string; count: number }
export function queriesByType(dataset: Dataset, studyId: string): QueryCategory[] {
  const instIds = subjectInstanceIds(dataset, studyId);
  const ecFvIds = new Set(dataset.editChecks.map((e) => e.field_value_id));
  const buckets = { ec: 0, md: 0, or: 0, sd: 0 };
  for (const q of dataset.queries) {
    if (!instIds.has(q.form_instance_id)) continue;
    const t = (q.title ?? "").toLowerCase();
    if (q.from_edit_check || (q.field_value_id && ecFvIds.has(q.field_value_id)) || /range|out of/.test(t)) buckets.or++;
    else if (/missing|required|empty|blank/.test(t)) buckets.md++;
    else if (/source|sdv|discrepan/.test(t)) buckets.sd++;
    else buckets.ec++;
  }
  return [
    { key: "ec", label: "Edit check", count: buckets.ec },
    { key: "md", label: "Missing data", count: buckets.md },
    { key: "or", label: "Out of range", count: buckets.or },
    { key: "sd", label: "Source discrepancy", count: buckets.sd },
  ];
}

export interface QueryAgingRow { code: string; subjectCode: string; formName: string; fieldLabel: string; raisedBy: string; raisedDate: string | null; daysOpen: number; status: string; assignedTo: string }
export function queryAging(dataset: Dataset, studyId: string): QueryAgingRow[] {
  const instById = new Map(subjectInstances(dataset, studyId).map((i) => [i.id, i]));
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldByFv = new Map(dataset.fieldValues.map((v) => [v.id, v.form_field_id]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const firstMsg = new Map<string, { at: string; name: string }>();
  for (const m of dataset.queryMessages) if (!firstMsg.has(m.query_id) && m.created_at) firstMsg.set(m.query_id, { at: m.created_at, name: m.author_name ?? (m.author_role ? `${m.author_role}` : "System") });
  const now = Date.now();
  return dataset.queries
    .filter((q) => instById.has(q.form_instance_id))
    .map((q) => {
      const inst = instById.get(q.form_instance_id);
      const subj = inst?.subject_id ? subById.get(inst.subject_id) : undefined;
      const fieldId = q.field_value_id ? fieldByFv.get(q.field_value_id) : undefined;
      const raised = q.created_at ?? firstMsg.get(q.id)?.at ?? null;
      return {
        code: `Q-${q.id.slice(0, 4).toUpperCase()}`,
        subjectCode: subj?.subject_code ?? "—",
        formName: inst ? formById.get(inst.form_id)?.name ?? "—" : "—",
        fieldLabel: fieldId ? fieldById.get(fieldId)?.label ?? "—" : "—",
        raisedBy: firstMsg.get(q.id)?.name ?? "—",
        raisedDate: raised ? raised.slice(0, 10) : null,
        daysOpen: raised ? Math.max(0, Math.floor((now - Date.parse(raised)) / 86400000)) : 0,
        status: q.status, assignedTo: q.status === "open" ? "Site" : q.status === "responded" ? "Data Manager" : "—",
      };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen);
}

export interface SiteResolutionRow { code: string; name: string; raised: number; resolved: number; open: number; avgDays: number | null }
export function resolutionBySite(dataset: Dataset, studyId: string): SiteResolutionRow[] {
  const sites = dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const firstMsg = new Map<string, string>();
  for (const m of dataset.queryMessages) if (!firstMsg.has(m.query_id) && m.created_at) firstMsg.set(m.query_id, m.created_at);
  const lastMsg = new Map<string, string>();
  for (const m of dataset.queryMessages) if (m.created_at) lastMsg.set(m.query_id, m.created_at);
  const siteOf = (instId: string): string | null => {
    const inst = instById.get(instId);
    return inst?.subject_id ? subById.get(inst.subject_id)?.site_id ?? null : inst?.site_id ?? null;
  };
  return sites.map((site) => {
    const qs = dataset.queries.filter((q) => siteOf(q.form_instance_id) === site.id);
    const resolvedQs = qs.filter((q) => q.status === "resolved");
    const spans: number[] = [];
    for (const q of resolvedQs) {
      const a = firstMsg.get(q.id), b = lastMsg.get(q.id);
      if (a && b) spans.push(Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000)));
    }
    return {
      code: site.code, name: site.name, raised: qs.length, resolved: resolvedQs.length,
      open: qs.filter((q) => q.status !== "resolved").length,
      avgDays: spans.length ? Math.round(spans.reduce((s, n) => s + n, 0) / spans.length) : null,
    };
  }).filter((r) => r.raised > 0);
}

// ─── Safety / AE ─────────────────────────────────────────────────────────────
export interface AeRow { subjectCode: string; siteName: string; arm: string | null; description: string; onsetDate: string | null; severity: string; relatedness: string; status: string; outcome: string; serious: boolean }
const SAE_YES = new Set(["yes", "true", "y", "1", "serious"]);
export function adverseEvents(dataset: Dataset, studyId: string): AeRow[] {
  const aeForms = new Set(dataset.forms.filter((f) => f.study_id === studyId && (f.code === "adverse_event" || /_ae$/.test(f.code) || f.code === "injection_site")).map((f) => f.id));
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const rows: AeRow[] = [];
  for (const inst of dataset.formInstances) {
    if (!aeForms.has(inst.form_id) || !inst.subject_id) continue;
    const subj = subById.get(inst.subject_id);
    if (!subj || subj.study_id !== studyId) continue;
    const vals = new Map<string, string>();
    for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id && v.value) { const c = fieldById.get(v.form_field_id)?.code; if (c) vals.set(c, v.value); }
    const desc = vals.get("ae_term") ?? vals.get("ae_description") ?? vals.get("event_description") ?? vals.get("event_term") ?? vals.get("description");
    if (!desc) continue; // an AE form with no event recorded isn't an AE
    const saeRaw = (vals.get("sae_flag") ?? vals.get("serious_sae") ?? vals.get("seriousness") ?? "").toLowerCase();
    rows.push({
      subjectCode: subj.subject_code, siteName: subj.site_id ? siteById.get(subj.site_id)?.name ?? "—" : "—",
      arm: subj.randomization_arm,
      description: desc, onsetDate: vals.get("ae_onset_date") ?? vals.get("ae_start_date") ?? null,
      severity: vals.get("severity") ?? "—", relatedness: vals.get("relatedness") ?? vals.get("relationship") ?? "—",
      status: vals.get("ongoing") === "Yes" ? "Ongoing" : (vals.get("outcome") ? "Closed" : "Open"),
      outcome: vals.get("outcome") ?? "—", serious: SAE_YES.has(saeRaw) || /life|death|hospital/.test((vals.get("sae_category") ?? "").toLowerCase()),
    });
  }
  return rows.sort((a, b) => (b.onsetDate ?? "").localeCompare(a.onsetDate ?? ""));
}

export interface SafetySummary { aeCount: number; saeCount: number; subjectsWithAe: number; enrolled: number; aeRate: number | null; withdrawalBlocks: number }
export function safetySummary(dataset: Dataset, studyId: string, aes: AeRow[]): SafetySummary {
  const enrolled = dataset.subjects.filter((s) => s.study_id === studyId && ENROLLED.has(s.status)).length;
  const subjectsWithAe = new Set(aes.map((a) => a.subjectCode)).size;
  return {
    aeCount: aes.length, saeCount: aes.filter((a) => a.serious).length, subjectsWithAe, enrolled,
    aeRate: enrolled ? aes.length / enrolled : null,
    withdrawalBlocks: brWithdrawalBlocks(dataset, studyId).length,
  };
}

// BR-2502 DART severity distribution (worst per animal). Derived from the same
// DART/clinical-illness field codes the PI dashboard reads.
export interface DartDistRow { score: number; count: number; pct: number }
export function dartDistribution(dataset: Dataset, studyId: string): DartDistRow[] {
  const ix = buildSubjectIndex(dataset, studyId);
  const counts = [0, 0, 0, 0];
  let n = 0;
  for (const s of ix.subjects) {
    if (!ENROLLED.has(s.status)) continue;
    const m = ix.byCode.get(s.id);
    const peaks = [...(m?.get("clinical_illness_score") ?? []), ...(m?.get("dart_score") ?? [])].map(Number).filter((x) => x >= 0 && x <= 3);
    if (!peaks.length) continue;
    counts[Math.max(...peaks)]++; n++;
  }
  return counts.map((count, score) => ({ score, count, pct: n ? Math.round((count / n) * 100) : 0 }));
}

// BR-2502 active withdrawal-period blocks (animals with a future withdrawal end date).
export interface WithdrawalBlockRow { subjectCode: string; endDate: string; daysLeft: number }
export function brWithdrawalBlocks(dataset: Dataset, studyId: string): WithdrawalBlockRow[] {
  const study = dataset.studies.find((s) => s.id === studyId);
  if (study?.code !== "BR-2502") return [];
  const ix = buildSubjectIndex(dataset, studyId);
  const today = todayISO();
  const rows: WithdrawalBlockRow[] = [];
  for (const s of ix.subjects) {
    const m = ix.byCode.get(s.id);
    const end = first(m, "withdrawal_end_date", "withdrawal_period_end");
    if (end && /^\d{4}-\d{2}-\d{2}/.test(end) && end >= today) rows.push({ subjectCode: s.subject_code, endDate: end, daysLeft: dayDiff(today, end) });
  }
  return rows.sort((a, b) => b.daysLeft - a.daysLeft);
}

// Per-arm AE breakdown (only rendered when arms are visible). Enrolled-per-arm
// gives an AE rate denominator.
export interface AeArmRow { arm: string; aeCount: number; saeCount: number; subjects: number; enrolled: number; rate: number | null }
export function aeByArm(dataset: Dataset, studyId: string, aes: AeRow[]): AeArmRow[] {
  const enrolledByArm = new Map<string, number>();
  for (const s of dataset.subjects) {
    if (s.study_id !== studyId || !ENROLLED.has(s.status) || !s.randomization_arm) continue;
    enrolledByArm.set(s.randomization_arm, (enrolledByArm.get(s.randomization_arm) ?? 0) + 1);
  }
  const map = new Map<string, AeArmRow>();
  const ensure = (arm: string): AeArmRow => {
    let r = map.get(arm);
    if (!r) { r = { arm, aeCount: 0, saeCount: 0, subjects: 0, enrolled: enrolledByArm.get(arm) ?? 0, rate: null }; map.set(arm, r); }
    return r;
  };
  for (const arm of Array.from(enrolledByArm.keys())) ensure(arm);
  const seen = new Map<string, Set<string>>();
  for (const a of aes) {
    if (!a.arm) continue;
    const r = ensure(a.arm);
    r.aeCount++; if (a.serious) r.saeCount++;
    const set = seen.get(a.arm) ?? new Set<string>(); set.add(a.subjectCode); seen.set(a.arm, set);
  }
  for (const r of Array.from(map.values())) { r.subjects = seen.get(r.arm)?.size ?? 0; r.rate = r.enrolled ? r.aeCount / r.enrolled : null; }
  return Array.from(map.values()).sort((a, b) => a.arm.localeCompare(b.arm));
}

// Aggregate AE counts by site (Sponsor view — no subject IDs).
export function aeBySite(aes: AeRow[]): { siteName: string; aeCount: number; saeCount: number }[] {
  const map = new Map<string, { siteName: string; aeCount: number; saeCount: number }>();
  for (const a of aes) {
    let r = map.get(a.siteName);
    if (!r) { r = { siteName: a.siteName, aeCount: 0, saeCount: 0 }; map.set(a.siteName, r); }
    r.aeCount++; if (a.serious) r.saeCount++;
  }
  return Array.from(map.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
}

// ─── Study header / timeline ─────────────────────────────────────────────────
export interface StudyHeader {
  code: string; name: string; sponsor: string; phase: string; protocolVersion: string;
  status: string; lockDate: string | null; startDate: string | null; endDate: string | null;
  weekOfStudy: number | null; dayOfStudy: number | null;
}
export function studyHeader(dataset: Dataset, studyId: string): StudyHeader {
  const study = dataset.studies.find((s) => s.id === studyId);
  const ix = buildSubjectIndex(dataset, studyId);
  // study start = earliest enrolment/baseline date across all subjects.
  let start: string | null = null;
  for (const s of ix.subjects) {
    const d = earliestDate(ix.byCode.get(s.id), "enrollment_date", "randomization_date", "consent_date", "placement_date", "screening_date", "visit_date");
    if (d && (!start || d < start)) start = d;
  }
  // projected end = latest scheduled visit target date.
  let end: string | null = null;
  for (const v of buildVisits(dataset, studyId)) if (!end || v.targetDate > end) end = v.targetDate;
  // protocol version = a readonlyAuto protocol_version value, if seeded.
  let protocolVersion = "—";
  for (const m of Array.from(ix.byCode.values())) { const p = m.get("protocol_version"); if (p && p.length) { protocolVersion = p[0]; break; } }
  // lock date = newest study-lock record that took a lock.
  const lock = dataset.studyLocks.filter((l) => l.study_id === studyId && l.locked).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const today = todayISO();
  return {
    code: study?.code ?? "—", name: study?.name ?? "—", sponsor: study?.sponsor ?? "—",
    phase: study?.phase ?? "—", protocolVersion, status: study?.status ?? "—",
    lockDate: lock ? lock.created_at.slice(0, 10) : null, startDate: start, endDate: end,
    weekOfStudy: start ? Math.max(0, Math.floor(dayDiff(start, today) / 7)) : null,
    dayOfStudy: start ? Math.max(0, dayDiff(start, today)) : null,
  };
}

// Study team — derived from staff_delegation site-scoped instances; falls back to
// site principal investigators when no staff log is seeded.
export interface TeamRow { name: string; role: string; siteName: string; status: string }
export function studyTeam(dataset: Dataset, studyId: string): TeamRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const staffForms = new Set(dataset.forms.filter((f) => f.code === "staff_delegation" && f.study_id === studyId).map((f) => f.id));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const rows: TeamRow[] = [];
  for (const inst of dataset.formInstances) {
    if (!staffForms.has(inst.form_id) || !inst.site_id) continue;
    const site = siteById.get(inst.site_id);
    const vals = new Map<string, string>();
    for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id && v.value) { const c = fieldById.get(v.form_field_id)?.code; if (c) vals.set(c, v.value); }
    const name = vals.get("staff_name");
    if (!name) continue;
    rows.push({ name, role: vals.get("role") ?? "—", siteName: site?.name ?? "—", status: vals.get("active_at_site") === "No" ? "Inactive" : "Active" });
  }
  if (rows.length === 0) {
    for (const site of dataset.sites.filter((s) => s.study_id === studyId)) {
      if (site.principal_investigator) rows.push({ name: site.principal_investigator, role: "Principal Investigator", siteName: site.name, status: "Active" });
    }
  }
  return rows.sort((a, b) => a.siteName.localeCompare(b.siteName) || a.name.localeCompare(b.name));
}

// Key milestones — mirrors the dashboard "Key milestones" card (same four
// milestones), anchored to derived study dates where available.
export interface MilestoneRow { milestone: string; date: string; status: "done" | "active" | "future" }
export function milestones(header: StudyHeader): MilestoneRow[] {
  const fmt = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
  return [
    { milestone: "Site initiation — all sites", date: fmt(header.startDate), status: "done" },
    { milestone: "50% enrollment milestone", date: "Reached", status: "done" },
    { milestone: "Interim safety review", date: "Scheduled", status: "active" },
    { milestone: "Database lock", date: header.lockDate ? fmt(header.lockDate) : fmt(header.endDate), status: header.lockDate ? "done" : "future" },
  ];
}

// ─── Local helpers ───────────────────────────────────────────────────────────
function subjectInstances(dataset: Dataset, studyId: string) {
  const subjIds = new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.id));
  return dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));
}
function subjectInstanceIds(dataset: Dataset, studyId: string): Set<string> {
  return new Set(subjectInstances(dataset, studyId).map((i) => i.id));
}

// ─── CSV export ──────────────────────────────────────────────────────────────
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null)[][]): void {
  const esc = (c: string | number | null) => `"${String(c ?? "").replace(/"/g, '""')}"`;
  const csv = [headers, ...rows].map((line) => line.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
export function csvFilename(studyCode: string, reportSlug: string): string {
  return `arken_${studyCode}_${reportSlug}_${todayISO()}.csv`;
}
