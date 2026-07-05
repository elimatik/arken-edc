// ════════════════════════════════════════════════════════════════════════════
// Reports module derivations + catalog. Every figure here is derived live from
// the session dataset — no new fields, no hardcoded numbers. Clinical dates live
// as field VALUES (e.g. a value "2025-08-15" on a field whose code is
// "visit_date"), never as columns on subjects/instances, so most helpers walk a
// per-subject value index keyed by field code.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, SubjectRow } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { buildVisits, addDays } from "@/lib/visits-data";
import { codingIndex, codedDisplay, normalizeTerm } from "@/lib/coding-data";
import { usersForStudy } from "@/lib/users-data";

// ─── Report catalog ──────────────────────────────────────────────────────────
export type ReportId =
  | "study-status"
  | "enrollment-disposition"
  | "site-performance"
  | "visit-compliance"
  | "data-completeness"
  | "query-edit-check"
  | "safety-ae"
  | "conmed-log"
  | "sdv-completion"
  | "query-listing"
  | "protocol-deviations"
  | "randomization"
  | "drug-accountability"
  | "subject-data-listing"
  | "ph-production-pen"
  | "ph-feed-conversion";

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
  studies?: string[]; // study codes this report applies to (undefined = all studies)
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
  { id: "safety-ae", title: "AE / SAE Roster", slug: "ae_sae_roster", category: "Safety & Regulatory", icon: "heartbeat",
    description: "Adverse-event roster: SAEs surfaced first, then the full AE table with ICH relatedness and SAE criteria.",
    roles: ["CRA", "DM", "PI", "Admin", "Sponsor"], hasCsv: false },
  { id: "conmed-log", title: "Concomitant Medications (ConMed) Log", slug: "conmed_log", category: "Safety & Regulatory", icon: "pill",
    description: "All concurrent medications taken alongside the investigational product, with drug-interaction flags.",
    roles: ["CRA", "DM", "PI", "Admin"], hasCsv: true },
  { id: "sdv-completion", title: "SDV Completion Report", slug: "sdv_completion", category: "Safety & Regulatory", icon: "shield-check",
    description: "Monitoring evidence — fields verified, per-site progress, and the unverified-fields action list.",
    roles: ["CRA", "DM", "Admin"], hasCsv: true },
  { id: "query-listing", title: "Query Listing (export)", slug: "query_listing", category: "Data Quality & Integrity", icon: "list-details",
    description: "A static query snapshot for monitoring-visit documentation and regulatory submissions — subject, field, status, age, assignment.",
    roles: ["CRA", "DM", "PI", "Admin"], hasCsv: true },
  { id: "protocol-deviations", title: "Protocol Deviations", slug: "protocol_deviations", category: "Safety & Regulatory", icon: "alert-triangle",
    description: "All protocol deviations — major/minor category, description, discovery date, impact, and status.",
    roles: ["CRA", "DM", "PI", "Admin", "Sponsor"], hasCsv: true },
  { id: "randomization", title: "Randomization", slug: "randomization", category: "Study Overview & Enrollment", icon: "arrows-shuffle",
    description: "The randomization list — subject, arm, date, method, and block — with an arm-balance check.",
    roles: ["CRA", "DM", "PI", "Admin"], hasCsv: true },
  { id: "drug-accountability", title: "Drug Accountability", slug: "drug_accountability", category: "Site Performance", icon: "clipboard-check",
    description: "Investigational-product reconciliation per treatment group and site — received, dispensed, returned, destroyed, remaining.",
    roles: ["CRA", "DM", "Admin"], hasCsv: true },
  { id: "subject-data-listing", title: "Subject Data Listing", slug: "subject_data_listing", category: "Data Quality & Integrity", icon: "table-options",
    description: "One row per subject — the key primary-endpoint values across visits, with study-specific columns.",
    roles: ["CRA", "DM", "PI", "Admin"], hasCsv: true },
  { id: "ph-production-pen", title: "Production Performance by Pen", slug: "ph_production_pen", category: "Site Performance", icon: "chart-histogram",
    description: "Per-pen production performance — phase FCR, final weight, feed consumed, and mortality.",
    roles: ["CRA", "DM", "PI", "Admin", "Sponsor"], hasCsv: true, studies: ["PH-2401"] },
  { id: "ph-feed-conversion", title: "Feed Conversion Summary", slug: "ph_feed_conversion", category: "Site Performance", icon: "scale",
    description: "Feed conversion per production phase — Control vs Phytogenic, the primary efficacy comparison.",
    roles: ["CRA", "DM", "PI", "Admin", "Sponsor"], hasCsv: true, studies: ["PH-2401"] },
];

export function reportsForRole(role: Role, studyCode?: string): ReportMeta[] {
  return REPORT_CATALOG.filter((r) => r.roles.includes(role) && (!r.studies || (studyCode != null && r.studies.includes(studyCode))));
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

// Form codes are sequential (F029, …) not semantic. Detect by FIELD code, or by
// the (semantic) form NAME where a single field code isn't universal — e.g. all
// three studies' AE forms are named "Adverse Event" but use different term fields.
const CONMED_MED_FIELD_CODES = new Set(["medication", "medication_name"]);
const VEDDRA_FIELD_CODES = ["veddra_term", "event_term", "veddra_code", "veddra_coded_term"]; // coded-term storage (priority order)
function formsWithAnyFieldCode(dataset: Dataset, studyId: string, codes: Set<string>): Set<string> {
  const studyFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  const out = new Set<string>();
  for (const f of dataset.formFields) if (studyFormIds.has(f.form_id) && codes.has(f.code)) out.add(f.form_id);
  return out;
}
function aeFormIds(dataset: Dataset, studyId: string): Set<string> {
  return new Set(dataset.forms.filter((f) => f.study_id === studyId && f.name === "Adverse Event").map((f) => f.id));
}
// Minimal drug classification for instance-derived ConMeds (seeded entries carry
// their own class). Antibiotics flag a potential interaction.
function classifyDrug(med: string): { drugClass: string; interaction: boolean } {
  const m = med.toLowerCase();
  if (/cillin|mycin|floxacin|florfenicol|tulathromycin|ceftiofur|sulfa|tetracyclin|oxytet|antibiotic/.test(m)) return { drugClass: "Antibiotic", interaction: true };
  if (/prednis|cortico|dexameth|steroid/.test(m)) return { drugClass: "Corticosteroid", interaction: false };
  if (/cyclospor|ciclospor|oclacitinib|immunosup/.test(m)) return { drugClass: "Immunosuppressant", interaction: false };
  if (/coccidiostat|salinomycin|monensin|narasin/.test(m)) return { drugClass: "Coccidiostat", interaction: false };
  return { drugClass: "Other", interaction: false };
}

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

// Per-subject screen-failure detail (Fix 5 tab 3) — reason, date, and the failed
// eligibility criterion where documented.
export interface ScreenFailDetailRow { subjectCode: string; siteCode: string; siteName: string; reason: string; date: string | null; criterion: string }
export function screenFailureDetail(dataset: Dataset, studyId: string, ix: SubjectIndex): ScreenFailDetailRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const out: ScreenFailDetailRow[] = [];
  for (const s of ix.subjects) {
    const m = ix.byCode.get(s.id);
    if (!isScreenFailure(s, m)) continue;
    const site = s.site_id ? siteById.get(s.site_id) : undefined;
    out.push({
      subjectCode: s.subject_code, siteCode: site?.code ?? "—", siteName: site?.name ?? "—",
      reason: first(m, "screen_fail_reason", "ineligibility_reason", "exclusion_reason", "withdrawal_reason") ?? "Did not meet eligibility criteria",
      date: first(m, "screening_date", "screen_fail_date", "consent_date", "enrollment_date") ?? null,
      criterion: first(m, "failed_criterion", "criterion_failed", "exclusion_criterion", "eligibility_criterion") ?? "—",
    });
  }
  return out.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
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
  openQueries: number; overdueVisits: number; deviations: number;
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
  const devBySite = new Map<string, number>();
  for (const d of dataset.protocolDeviations ?? []) if (d.study_id === studyId && d.site_id) devBySite.set(d.site_id, (devBySite.get(d.site_id) ?? 0) + 1);
  // last monitoring date per site — SIV / monitoring forms detected by field code.
  const monForms = new Set<string>();
  const studyFormIds2 = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  for (const f of dataset.formFields) if (studyFormIds2.has(f.form_id) && (f.code === "siv_date" || f.code === "findings_summary" || f.code === "cra_name")) monForms.add(f.form_id);
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
    const overdueVisits = visits.filter((v) => v.siteId === site.id && !v.completed && v.subjectStatus === "active" && addDays(v.targetDate, v.window) < today).length;
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
      openQueries, overdueVisits, deviations: devBySite.get(site.id) ?? 0,
      lastDataEntry, lastMonitoring: lastMonBySite.get(site.id) ?? null,
    };
  });
}

// Protocol deviations (ICH E6 §8.3.16) — session-seeded, joined to sites.
export interface DeviationRow { siteCode: string; siteName: string; subjectCode: string; type: string; date: string; severity: string; reportedToSponsor: boolean; status: string }
export function protocolDeviations(dataset: Dataset, studyId: string): DeviationRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  return (dataset.protocolDeviations ?? [])
    .filter((d) => d.study_id === studyId)
    .map((d) => {
      const site = d.site_id ? siteById.get(d.site_id) : undefined;
      return {
        siteCode: site?.code ?? "—", siteName: site?.name ?? "—", subjectCode: d.subject_code,
        type: d.deviation_type, date: d.date, severity: d.severity, reportedToSponsor: d.reported_to_sponsor, status: d.status,
      };
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// Monitoring visit log (site-scoped monitoring_visits / siv instances).
export interface MonitoringLogRow { siteCode: string; siteName: string; visitType: string; date: string | null; conductedBy: string; findings: string }
export function monitoringLog(dataset: Dataset, studyId: string): MonitoringLogRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  // Detect SIV / monitoring forms by their field codes (form code is sequential).
  const monForms = new Map<string, "siv" | "monitoring_visits">();
  const studyFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  for (const f of dataset.formFields) {
    if (!studyFormIds.has(f.form_id)) continue;
    if (f.code === "siv_date") monForms.set(f.form_id, "siv");
    else if ((f.code === "findings_summary" || f.code === "cra_name") && !monForms.has(f.form_id)) monForms.set(f.form_id, "monitoring_visits");
  }
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
    } else if (v.subjectStatus === "active" && addDays(v.targetDate, v.window) < today) {
      // Overdue only once today is past the window END — a visit still inside its
      // window is not overdue even if the target date has passed.
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

// ─── Query density (open queries per 100 CRF fields) ─────────────────────────
export type DensityRating = "excellent" | "acceptable" | "review" | "action";
export function densityRating(d: number): DensityRating {
  return d < 2 ? "excellent" : d <= 5 ? "acceptable" : d <= 10 ? "review" : "action";
}
export interface QueryDensityRow { code: string; name: string; totalFields: number; openQueries: number; density: number; rating: DensityRating }
export function queryDensityBySite(dataset: Dataset, studyId: string): QueryDensityRow[] {
  const sites = dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const subById = new Map(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => [s.id, s]));
  const insts = dataset.formInstances.filter((i) => i.subject_id != null && subById.has(i.subject_id));
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));
  return sites.map((site) => {
    const instIds = new Set(insts.filter((i) => subById.get(i.subject_id!)?.site_id === site.id).map((i) => i.id));
    const totalFields = dataset.fieldValues.filter((v) => instIds.has(v.form_instance_id) && v.value != null && v.value !== "").length;
    const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved" && (!q.field_value_id || fvById.has(q.field_value_id))).length;
    const density = totalFields ? Math.round((openQueries / totalFields) * 1000) / 10 : 0;
    return { code: site.code, name: site.name, totalFields, openQueries, density, rating: densityRating(density) };
  }).filter((r) => r.totalFields > 0);
}
export interface QueryDensitySummary { overall: number; highest: number; lowest: number; overallRating: DensityRating }
export function queryDensitySummary(rows: QueryDensityRow[]): QueryDensitySummary {
  const totalFields = rows.reduce((n, r) => n + r.totalFields, 0);
  const openQueries = rows.reduce((n, r) => n + r.openQueries, 0);
  const overall = totalFields ? Math.round((openQueries / totalFields) * 1000) / 10 : 0;
  const densities = rows.map((r) => r.density);
  return { overall, highest: densities.length ? Math.max(...densities) : 0, lowest: densities.length ? Math.min(...densities) : 0, overallRating: densityRating(overall) };
}

// ─── Safety / AE ─────────────────────────────────────────────────────────────
export type FiledStatus = "yes" | "no" | "pending";
export interface AeRow {
  subjectCode: string; siteName: string; arm: string | null; description: string; onsetDate: string | null;
  severity: string; relatedness: string; status: string; outcome: string; serious: boolean; saeCriterion: string | null;
  veddraCode: string; veddraCoding: "coded" | "pending" | "excluded"; // coded AE term (VeDDRA)
  // CIOMS clinical-depth columns (Fix 4).
  causality: string; actionTaken: string; expectedness: string; seriousCriteria: string[]; resolved: boolean;
  // SAE reporting timeline — populated only for seeded SAE records (null otherwise).
  piAwareDate: string | null; sponsorNotifiedDate: string | null; reportDueDate: string | null;
  daysToNotify: number | null; filedOnTime: FiledStatus | null; regulatoryReportDate: string | null;
}
// Normalise causality to the CIOMS 4-way scale used in the roster.
function normalizeCausality(raw: string | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (!v) return "Unknown";
  if (/possibl/.test(v)) return "Possibly related";
  if (/not related|unrelated|unlikely|no relation/.test(v)) return "Not related";
  if (/related|probabl|definit|certain/.test(v)) return "Related";
  return "Unknown";
}
// Normalise outcome to the CIOMS scale.
function normalizeOutcome(raw: string | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (!v || v === "—") return "Unknown";
  if (/fatal|death|died/.test(v)) return "Fatal";
  if (/recovering|resolving|improving/.test(v)) return "Recovering";
  if (/not recovered|ongoing|unresolved|persist/.test(v)) return "Not recovered";
  if (/recovered|resolved|recover/.test(v)) return "Recovered";
  return raw ?? "Unknown";
}
const SAE_YES = new Set(["yes", "true", "y", "1", "serious"]);

// Normalise free-form causality to the standard ICH E6 categories.
function normalizeRelatedness(raw: string | undefined): string {
  const v = (raw ?? "").toLowerCase().trim();
  if (!v) return "—";
  if (/not related|unrelated|no relation/.test(v)) return "Not related";
  if (/unlikely/.test(v)) return "Unlikely";
  if (/possibl/.test(v)) return "Possibly";
  if (/probabl/.test(v)) return "Probably";
  if (/definit|^related$|certain/.test(v)) return "Definitely";
  return raw ?? "—";
}
// Which seriousness criterion an SAE met (ICH SAE criteria).
function saeCriterionOf(vals: Map<string, string>, serious: boolean): string | null {
  if (!serious) return null;
  const cat = (vals.get("sae_category") ?? "").toLowerCase();
  if (/death|fatal/.test(cat)) return "Death";
  if (/life/.test(cat)) return "Life-threatening";
  if (/hospital/.test(cat)) return "Hospitalization";
  if (/disab/.test(cat)) return "Disability";
  if (/congenital|anomal/.test(cat)) return "Congenital anomaly";
  if ((vals.get("sae_life_threatening") ?? "").toLowerCase() === "yes") return "Life-threatening";
  if ((vals.get("hospitalization") ?? "").toLowerCase() === "yes") return "Hospitalization";
  return "Other important medical event";
}

export function buildAeRoster(dataset: Dataset, studyId: string): AeRow[] {
  // Real AE form instances (detected by form name — all three studies name it
  // "Adverse Event") so a panel-entered AE flows straight into the roster.
  const aeForms = aeFormIds(dataset, studyId);
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
    const serious = SAE_YES.has(saeRaw) || /life|death|hospital/.test((vals.get("sae_category") ?? "").toLowerCase());
    // VeDDRA: a coded term field (veddra_term) → Coded; veddra_status 'excluded' →
    // Excluded; otherwise the verbatim term carries over as Pending coding.
    const coded = VEDDRA_FIELD_CODES.map((c) => vals.get(c)).find(Boolean);
    const excluded = (vals.get("veddra_status") ?? "").toLowerCase() === "excluded";
    rows.push({
      subjectCode: subj.subject_code, siteName: subj.site_id ? siteById.get(subj.site_id)?.name ?? "—" : "—",
      arm: subj.randomization_arm,
      description: desc, onsetDate: vals.get("ae_onset_date") ?? vals.get("ae_start_date") ?? null,
      severity: vals.get("severity") ?? "—", relatedness: normalizeRelatedness(vals.get("relatedness") ?? vals.get("relationship")),
      status: vals.get("ongoing") === "Yes" ? "Ongoing" : (vals.get("outcome") ? "Closed" : "Open"),
      outcome: normalizeOutcome(vals.get("outcome")), serious, saeCriterion: saeCriterionOf(vals, serious),
      veddraCode: excluded ? "N/A — excluded from coding" : coded ?? desc, veddraCoding: excluded ? "excluded" : coded ? "coded" : "pending",
      causality: normalizeCausality(vals.get("causality") ?? vals.get("relatedness") ?? vals.get("relationship")),
      actionTaken: vals.get("action_taken") ?? "No action", expectedness: vals.get("expectedness") ?? "Expected",
      seriousCriteria: serious ? [saeCriterionOf(vals, serious) ?? "Other medically important"] : [],
      resolved: /recovered|resolved|closed/i.test(vals.get("outcome") ?? "") || vals.get("ongoing") === "No",
      piAwareDate: null, sponsorNotifiedDate: null, reportDueDate: null, daysToNotify: null, filedOnTime: null, regulatoryReportDate: null,
    });
  }

  // Merge seeded SAEs (with reporting timeline). Fatal / life-threatening → 7-day
  // regulatory report window; all other serious events → 15 days.
  for (const sae of (dataset.saeReports ?? []).filter((s) => s.study_id === studyId)) {
    const subj = subById.get(sae.subject_id);
    if (!subj) continue;
    const fatal = /death|fatal|life/i.test(sae.sae_criterion);
    const reportDueDate = addDays(sae.pi_aware_date, fatal ? 7 : 15);
    const daysToNotify = sae.sponsor_notified_date ? dayDiff(sae.pi_aware_date, sae.sponsor_notified_date) : null;
    // Not yet notified: "pending" only while still within the report window —
    // once the due date passes without filing it becomes "no" (overdue).
    const filedOnTime: FiledStatus = sae.sponsor_notified_date == null
      ? (reportDueDate < todayISO() ? "no" : "pending")
      : sae.sponsor_notified_date <= reportDueDate ? "yes" : "no";
    rows.push({
      subjectCode: subj.subject_code, siteName: subj.site_id ? siteById.get(subj.site_id)?.name ?? "—" : "—",
      arm: subj.randomization_arm, description: sae.description, onsetDate: sae.onset_date,
      severity: sae.severity, relatedness: normalizeRelatedness(sae.relatedness),
      status: sae.outcome && sae.outcome !== "Ongoing" ? "Closed" : "Ongoing", outcome: normalizeOutcome(sae.outcome),
      serious: sae.serious ?? true, saeCriterion: (sae.serious ?? true) ? sae.sae_criterion : null,
      veddraCode: sae.veddra_code ?? sae.description, veddraCoding: sae.veddra_coding ?? "pending",
      causality: normalizeCausality(sae.causality ?? sae.relatedness),
      actionTaken: sae.action_taken ?? "No action", expectedness: sae.expectedness ?? "Unexpected",
      seriousCriteria: sae.serious_criteria ?? ((sae.serious ?? true) && sae.sae_criterion ? [sae.sae_criterion] : []),
      resolved: /recovered|resolved/i.test(sae.outcome ?? ""),
      piAwareDate: sae.pi_aware_date, sponsorNotifiedDate: sae.sponsor_notified_date, reportDueDate, daysToNotify, filedOnTime,
      regulatoryReportDate: sae.regulatory_report_date ?? null,
    });
  }
  // The Coding module is the source of truth for VeDDRA — override each row's
  // coded term/status from the DM's coding where it exists.
  const ci = codingIndex(dataset, studyId);
  for (const r of rows) {
    const disp = codedDisplay(ci.get(normalizeTerm(r.description)));
    if (disp) { r.veddraCode = disp.term; r.veddraCoding = disp.status; }
  }
  return rows.sort((a, b) => (b.onsetDate ?? "").localeCompare(a.onsetDate ?? ""));
}

// Subject-level AE list (Subject Record AE/SAE tab) — same form-instance source as
// the study roster, scoped to one subject, with per-subject sequential AE numbers.
export interface SubjectAeRow {
  aeNo: string; onsetDate: string | null; description: string; severity: string;
  relatedness: string; serious: boolean; status: string; outcome: string;
  veddraCode: string; veddraCoding: "coded" | "pending" | "excluded";
}
export function subjectAeList(dataset: Dataset, subjectId: string): SubjectAeRow[] {
  const studyId = dataset.subjects.find((s) => s.id === subjectId)?.study_id;
  if (!studyId) return [];
  const aeForms = aeFormIds(dataset, studyId);
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const raw: (Omit<SubjectAeRow, "aeNo"> & { sortKey: string })[] = [];
  for (const inst of dataset.formInstances) {
    if (!aeForms.has(inst.form_id) || inst.subject_id !== subjectId) continue;
    const vals = new Map<string, string>();
    for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id && v.value) { const c = fieldById.get(v.form_field_id)?.code; if (c) vals.set(c, v.value); }
    const description = vals.get("ae_term") ?? vals.get("ae_description") ?? vals.get("event_description") ?? vals.get("description");
    if (!description) continue;
    const onsetDate = vals.get("ae_onset_date") ?? vals.get("ae_start_date") ?? null;
    const coded = VEDDRA_FIELD_CODES.map((c) => vals.get(c)).find(Boolean);
    const excluded = (vals.get("veddra_status") ?? "").toLowerCase() === "excluded";
    const saeRaw = (vals.get("sae_flag") ?? vals.get("serious_sae") ?? vals.get("seriousness") ?? "").toLowerCase();
    raw.push({
      onsetDate, description, severity: vals.get("severity") ?? "—",
      relatedness: normalizeRelatedness(vals.get("relatedness") ?? vals.get("relationship")),
      serious: SAE_YES.has(saeRaw) || /serious|life|death/.test(saeRaw),
      status: vals.get("ongoing") === "Yes" ? "Ongoing" : vals.get("outcome") ? "Closed" : "Open",
      outcome: vals.get("outcome") ?? "—",
      veddraCode: excluded ? "N/A — excluded" : coded ?? description, veddraCoding: excluded ? "excluded" : coded ? "coded" : "pending",
      sortKey: onsetDate ?? inst.id,
    });
  }
  // Number AE-0001… by chronological onset; display most-recent first.
  raw.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const numbered = raw.map((r, i) => ({ ...r, aeNo: `AE-${String(i + 1).padStart(4, "0")}` }));
  return numbered.sort((a, b) => (b.onsetDate ?? "").localeCompare(a.onsetDate ?? ""));
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
  // Arm-specific withdrawal period: T01 49 d (label), T02 84 d (FARAD extra-label),
  // T03 saline → none. Measured from the LAST administration (primary or re-treatment).
  const WD: Record<string, number> = { T01: 49, T02: 84 };
  const armById = new Map(dataset.subjects.map((s) => [s.id, (s.randomization_arm ?? "").match(/T0\d/)?.[0] ?? ""]));
  const addDays = (iso: string, d: number) => { const dt = new Date(iso); if (Number.isNaN(dt.getTime())) return null; dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
  const rows: WithdrawalBlockRow[] = [];
  for (const s of ix.subjects) {
    const days = WD[armById.get(s.id) ?? ""];
    if (!days) continue; // T03 / unknown → no withdrawal, never blocked
    const m = ix.byCode.get(s.id);
    const lastAdmin = [first(m, "date_administered"), first(m, "retreatment_date"), first(m, "last_treatment_date")].filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}/.test(x)).sort().pop();
    const stored = first(m, "withdrawal_end_date", "withdrawal_period_end");
    const end = lastAdmin ? addDays(lastAdmin, days) : (stored && /^\d{4}-\d{2}-\d{2}/.test(stored) ? stored : null);
    if (end && end >= today) rows.push({ subjectCode: s.subject_code, endDate: end, daysLeft: dayDiff(today, end) });
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

// ─── Concomitant medications (ConMed Log) ────────────────────────────────────
export type ConMedType = "metaphylaxis" | "therapeutic" | "preventive";
export interface ConMedEntry {
  id: string;
  subjectCode: string;
  siteCode: string;
  siteName: string;
  medication: string;
  drugClass: string;
  dose: string;
  route: string;
  startDate: string;
  endDate: string | null;
  ongoing: boolean;
  indication: string;
  concurrentWith: string;
  interaction: boolean;
  veddraCode: string;
  codingStatus: "coded" | "pending" | "excluded";
  conmedType: ConMedType | null;
  washoutDays: number;
  enrollDate: string | null;
  washoutEnd: string | null;
  washoutOverlap: boolean | null; // null = no washout requirement / can't assess
}
function washoutOverlapOf(washoutDays: number, ongoing: boolean, endDate: string | null, enrollDate: string | null): { washoutEnd: string | null; overlap: boolean | null } {
  const washoutEnd = washoutDays > 0 && endDate ? addDays(endDate, washoutDays) : null;
  let overlap: boolean | null = null;
  if (washoutDays > 0) {
    if (ongoing) overlap = true;
    else if (washoutEnd && enrollDate) overlap = washoutEnd >= enrollDate;
  }
  return { washoutEnd, overlap };
}
export function buildConMedLog(dataset: Dataset, studyId: string): ConMedEntry[] {
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const enrollBySubject = new Map(dispositions(dataset, studyId).map((d) => [d.subjectId, d.enrollDate]));
  const out: ConMedEntry[] = [];

  // 1. Real ConMed form instances (detected by their medication field) — so a
  //    panel-entered ConMed flows straight into the report. One source of truth.
  const conmedForms = formsWithAnyFieldCode(dataset, studyId, CONMED_MED_FIELD_CODES);
  for (const inst of dataset.formInstances) {
    if (!conmedForms.has(inst.form_id) || !inst.subject_id) continue;
    const subj = subById.get(inst.subject_id);
    if (!subj || subj.study_id !== studyId) continue;
    const vals = new Map<string, string>();
    for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id && v.value) { const c = fieldById.get(v.form_field_id)?.code; if (c) vals.set(c, v.value); }
    const medication = vals.get("medication") ?? vals.get("medication_name");
    if (!medication) continue; // an empty ConMed instance carries nothing to report
    const site = subj.site_id ? siteById.get(subj.site_id) : undefined;
    const endDate = vals.get("end_date") ?? vals.get("stop_date") ?? null;
    const ongoing = (vals.get("ongoing") ?? "") === "Yes" || (!endDate && !!vals.get("start_date"));
    const enrollDate = enrollBySubject.get(subj.id) ?? null;
    const cls = classifyDrug(medication);
    const washoutDays = cls.drugClass === "Immunosuppressant" || cls.drugClass === "Corticosteroid" ? (dataset.studies.find((s) => s.id === studyId)?.code === "CA-0801" ? (/cyclospor|ciclospor/.test(medication.toLowerCase()) ? 28 : 14) : 0) : 0;
    const { washoutEnd, overlap } = washoutOverlapOf(washoutDays, ongoing, endDate, enrollDate);
    const codedTerm = vals.get("veddra_term") ?? vals.get("veddra_code");
    const excluded = (vals.get("veddra_status") ?? "").toLowerCase() === "excluded";
    out.push({
      id: inst.id, subjectCode: subj.subject_code, siteCode: site?.code ?? "—", siteName: site?.name ?? "—",
      medication, drugClass: cls.drugClass, dose: vals.get("dose") ?? vals.get("dose_route") ?? "—",
      route: vals.get("route") ?? "—", startDate: vals.get("start_date") ?? "—", endDate, ongoing,
      indication: vals.get("indication") ?? "—", concurrentWith: vals.get("concurrent_with") ?? "—", interaction: cls.interaction,
      veddraCode: excluded ? "N/A — excluded from coding" : codedTerm ?? medication, codingStatus: excluded ? "excluded" : codedTerm ? "coded" : "pending",
      conmedType: null, washoutDays, enrollDate, washoutEnd, washoutOverlap: overlap,
    });
  }

  // 2. Seeded ConMed demo data (rich fields the form schema doesn't capture) — merged.
  for (const c of (dataset.conMeds ?? []).filter((c) => c.study_id === studyId)) {
      const subj = subById.get(c.subject_id);
      const site = subj?.site_id ? siteById.get(subj.site_id) : undefined;
      const enrollDate = subj ? enrollBySubject.get(subj.id) ?? null : null;
      // Washout overlap: ongoing immunosuppressant never clears; a stopped one
      // overlaps when stop_date + washout_days reaches/passes enrollment.
      const washoutEnd = c.washout_days > 0 && c.end_date ? addDays(c.end_date, c.washout_days) : null;
      let washoutOverlap: boolean | null = null;
      if (c.washout_days > 0) {
        if (c.ongoing) washoutOverlap = true;
        else if (washoutEnd && enrollDate) washoutOverlap = washoutEnd >= enrollDate;
      }
      out.push({
        id: c.id, subjectCode: subj?.subject_code ?? "—",
        siteCode: site?.code ?? "—", siteName: site?.name ?? "—",
        medication: c.medication, drugClass: c.drug_class, dose: c.dose, route: c.route,
        startDate: c.start_date, endDate: c.end_date, ongoing: c.ongoing,
        indication: c.indication, concurrentWith: c.concurrent_with, interaction: c.interaction,
        veddraCode: c.veddra_code, codingStatus: c.coding_status, conmedType: c.conmed_type,
        washoutDays: c.washout_days, enrollDate, washoutEnd, washoutOverlap,
      });
  }
  // Override VeDDRA from the Coding module (source of truth) by verbatim term.
  const ci = codingIndex(dataset, studyId);
  for (const e of out) {
    const disp = codedDisplay(ci.get(normalizeTerm(e.medication)));
    if (disp) { e.veddraCode = disp.status === "coded" ? disp.term : e.veddraCode; e.codingStatus = disp.status; }
  }
  return out.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode) || a.startDate.localeCompare(b.startDate));
}

export interface ConMedClassRow { drugClass: string; count: number; subjects: number; interaction: boolean }
export function conMedByClass(entries: ConMedEntry[]): ConMedClassRow[] {
  const map = new Map<string, { count: number; subjects: Set<string>; interaction: boolean }>();
  for (const e of entries) {
    const r = map.get(e.drugClass) ?? { count: 0, subjects: new Set<string>(), interaction: false };
    r.count++; r.subjects.add(e.subjectCode); r.interaction = r.interaction || e.interaction;
    map.set(e.drugClass, r);
  }
  return Array.from(map.entries())
    .map(([drugClass, r]) => ({ drugClass, count: r.count, subjects: r.subjects.size, interaction: r.interaction }))
    .sort((a, b) => b.count - a.count || a.drugClass.localeCompare(b.drugClass));
}

export interface ConMedSummary { total: number; subjectsWithConMed: number; topClass: string; interactionCount: number }
export function conMedSummary(entries: ConMedEntry[]): ConMedSummary {
  const byClass = conMedByClass(entries);
  return {
    total: entries.length,
    subjectsWithConMed: new Set(entries.map((e) => e.subjectCode)).size,
    topClass: byClass[0]?.drugClass ?? "—",
    interactionCount: entries.filter((e) => e.interaction).length,
  };
}

// ─── Study header / timeline ─────────────────────────────────────────────────
export interface StudyHeader {
  code: string; name: string; sponsor: string; phase: string; protocolVersion: string;
  status: string; lockDate: string | null; startDate: string | null; endDate: string | null;
  weekOfStudy: number | null; dayOfStudy: number | null;
  iacucNumber: string | null; iacucApprovalDate: string | null; iacucExpiry: string | null; vichGuideline: string | null;
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
    iacucNumber: study?.iacuc_number ?? null, iacucApprovalDate: study?.iacuc_approval_date ?? null,
    iacucExpiry: study?.iacuc_expiry ?? null, vichGuideline: study?.vich_guideline ?? null,
  };
}

// Study team — derived from staff_delegation site-scoped instances; falls back to
// site principal investigators when no staff log is seeded.
export interface TeamRow { name: string; role: string; siteName: string; status: string }
export function studyTeam(dataset: Dataset, studyId: string): TeamRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const staffForms = formsWithAnyFieldCode(dataset, studyId, new Set(["staff_name"]));
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

// ─── Report export header block (prepended to every CSV) ─────────────────────
// Study: … · Protocol: … · Generated: … UTC · Generated by: … · Site filter: …
export function reportCsvHeaderRows(dataset: Dataset, studyId: string, role: string, userName: string, siteLabel: string): string[][] {
  const h = studyHeader(dataset, studyId);
  const now = new Date().toISOString().replace("T", " ").slice(0, 16);
  return [
    [`Study: ${h.name} (${h.code})`],
    [`Protocol: ${h.protocolVersion}`],
    [`Generated: ${now} UTC`],
    [`Generated by: ${userName} (${role})`],
    [`Site filter: ${siteLabel || "All sites"}`],
    [],
  ];
}

// ─── Query Listing (Fix 2) — the full query worklist as report rows ──────────
export interface QueryListingRow {
  code: string; queryId: string; subjectCode: string; subjectId: string | null; siteName: string; siteId: string | null;
  formName: string; fieldLabel: string; status: string; ageDays: number;
  raisedBy: string; raisedDate: string | null; lastResponseDate: string | null; assignedCrc: string;
}
export function queryListingRows(dataset: Dataset, studyId: string): QueryListingRow[] {
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));
  const subjById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const today = todayISO();
  const rows: QueryListingRow[] = [];
  for (const q of dataset.queries) {
    const inst = instById.get(q.form_instance_id);
    if (!inst) continue;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId) continue;
    const fv = q.field_value_id ? fvById.get(q.field_value_id) : undefined;
    const field = fv ? fieldById.get(fv.form_field_id) : undefined;
    const subj = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
    const site = subj?.site_id ? siteById.get(subj.site_id) : inst.site_id ? siteById.get(inst.site_id) : undefined;
    const msgs = dataset.queryMessages.filter((m) => m.query_id === q.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const raised = q.created_at ?? msgs[0]?.created_at ?? null;
    const assignee = site ? findAssignedCrc(dataset, studyId, site.code) : "—";
    rows.push({
      code: `Q-${q.id.slice(0, 4).toUpperCase()}`, queryId: q.id,
      subjectCode: subj?.subject_code ?? "—", subjectId: subj?.id ?? null,
      siteName: site ? `${site.code} · ${site.name}` : "—", siteId: site?.id ?? null,
      formName: form.name, fieldLabel: field?.label ?? "—", status: q.status,
      ageDays: raised ? Math.max(0, dayDiff(raised.slice(0, 10), today)) : 0,
      raisedBy: msgs[0]?.author_name ?? "Monitor", raisedDate: raised ? raised.slice(0, 10) : null,
      lastResponseDate: msgs.length ? msgs[msgs.length - 1].created_at.slice(0, 10) : null,
      assignedCrc: assignee,
    });
  }
  return rows.sort((a, b) => b.ageDays - a.ageDays);
}
// The active CRC responsible for a site (by site code) — reused from the Queries module rules.
function findAssignedCrc(dataset: Dataset, studyId: string, siteCode: string): string {
  const study = dataset.studies.find((s) => s.id === studyId);
  const users = usersForStudy(study?.code);
  const crc = users.find((u) => u.role === "CRC" && u.status === "active" && (u.siteCodes.length === 0 || u.siteCodes.includes(siteCode)));
  return crc?.name ?? "—";
}

// ─── Subject Data Listing (Fix 5) + PH production (Fix 9) ────────────────────
const dayFromFormName = (name?: string): number | null => {
  if (!name) return null;
  const d = name.match(/Day\s+(\d+)/i); if (d) return Number(d[1]);
  const w = name.match(/Week\s+(\d+)/i); if (w) return Number(w[1]) * 7;
  if (/follow-?up\s*4/i.test(name)) return 56;
  if (/follow-?up\s*3/i.test(name)) return 42;
  if (/follow-?up\s*2/i.test(name)) return 28;
  if (/follow-?up\s*1/i.test(name)) return 14;
  if (/baseline|screening|enrol/i.test(name)) return 0;
  if (/end of study|final|eos/i.test(name)) return 84;
  return null;
};
// subjectId → (visit day → endpoint value) for the given field codes.
function endpointsByDay(dataset: Dataset, studyId: string, codes: Set<string>): Map<string, Map<number, string>> {
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const byInst = new Map<string, string[]>();
  for (const v of dataset.fieldValues) {
    if (!v.value) continue;
    const c = fieldById.get(v.form_field_id)?.code;
    if (!c || !codes.has(c)) continue;
    (byInst.get(v.form_instance_id) ?? byInst.set(v.form_instance_id, []).get(v.form_instance_id)!).push(v.value);
  }
  const res = new Map<string, Map<number, string>>();
  for (const inst of subjectInstances(dataset, studyId)) {
    const list = byInst.get(inst.id);
    if (!list || !inst.subject_id) continue;
    const form = formById.get(inst.form_id);
    const parent = form?.parent_form_id ? formById.get(form.parent_form_id) : undefined;
    const day = dayFromFormName(form?.name) ?? dayFromFormName(parent?.name);
    if (day == null) continue;
    let m = res.get(inst.subject_id);
    if (!m) { m = new Map(); res.set(inst.subject_id, m); }
    for (const val of list) m.set(day, val);
  }
  return res;
}

export interface BrSubjectDataRow { subjectCode: string; subjectId: string; arm: string; siteName: string; dart: Record<number, string>; cure: string; withdrawalDate: string | null }
export function brSubjectDataRows(dataset: Dataset, studyId: string): BrSubjectDataRow[] {
  const ix = buildSubjectIndex(dataset, studyId);
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const dartByDay = endpointsByDay(dataset, studyId, new Set(["dart_score"]));
  return ix.subjects.map((s) => {
    const days = dartByDay.get(s.id) ?? new Map();
    const dart: Record<number, string> = {};
    for (const day of [0, 3, 7, 14, 28]) dart[day] = days.get(day) ?? "—";
    const last = [28, 14, 7, 3, 0].map((d) => days.get(d)).find(Boolean);
    const cure = last == null ? "—" : Number(last) <= 3 ? "Yes" : "No";
    return {
      subjectCode: s.subject_code, subjectId: s.id, arm: s.randomization_arm ?? "—",
      siteName: s.site_id ? siteById.get(s.site_id)?.name ?? "—" : "—",
      dart, cure, withdrawalDate: ix.byCode.get(s.id)?.get("withdrawal_date")?.[0] ?? null,
    };
  }).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
}

export interface CaSubjectDataRow { subjectCode: string; subjectId: string; armCode: string; siteName: string; cadesi: Record<number, string>; pctChange: number | null; responder: string }
const CADESI_CODES = new Set(["cadesi04_score", "cadesi_total", "cadesi_score", "cadesi04_total", "cadesi"]);
export function caSubjectDataRows(dataset: Dataset, studyId: string): CaSubjectDataRow[] {
  const ix = buildSubjectIndex(dataset, studyId);
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const cadesiByDay = endpointsByDay(dataset, studyId, CADESI_CODES);
  return ix.subjects.map((s) => {
    const days = cadesiByDay.get(s.id) ?? new Map();
    const cadesi: Record<number, string> = {};
    for (const day of [0, 14, 28, 42, 56]) cadesi[day] = days.get(day) ?? "—";
    const base = Number(days.get(0)); const fu4 = Number(days.get(56)) || Number(days.get(42)) || Number(days.get(28));
    const pctChange = base > 0 && Number.isFinite(fu4) ? Math.round(((fu4 - base) / base) * 100) : null;
    const responder = base > 0 && Number.isFinite(fu4) ? ((base - fu4) / base >= 0.5 ? "Yes" : "No") : "—";
    return {
      subjectCode: s.subject_code, subjectId: s.id, armCode: s.randomization_arm ?? "—",
      siteName: s.site_id ? siteById.get(s.site_id)?.name ?? "—" : "—", cadesi, pctChange, responder,
    };
  }).sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
}

export interface PhPenRow {
  penCode: string; penId: string; house: string; arm: string;
  starterFcr: number | null; growerFcr: number | null; finisherFcr: number | null; overallFcr: number | null;
  finalWeight: number | null; feedConsumed: number | null; mortalityCount: number; mortalityPct: number | null;
}
export function phPenProduction(dataset: Dataset, studyId: string): PhPenRow[] {
  const ix = buildSubjectIndex(dataset, studyId);
  const fcrByDay = endpointsByDay(dataset, studyId, new Set(["fcr_this_period"]));
  const num = (sid: string, code: string, agg: "max" | "min" | "sum" | "first"): number | null => {
    const arr = (ix.byCode.get(sid)?.get(code) ?? []).map(Number).filter((n) => Number.isFinite(n));
    if (!arr.length) return null;
    if (agg === "sum") return arr.reduce((s, n) => s + n, 0);
    if (agg === "min") return Math.min(...arr);
    if (agg === "first") return arr[0];
    return Math.max(...arr);
  };
  const phaseAvg = (days: Map<number, string> | undefined, dayList: number[]): number | null => {
    if (!days) return null;
    const vals = dayList.map((d) => Number(days.get(d))).filter((n) => Number.isFinite(n) && n > 0);
    return vals.length ? Math.round((vals.reduce((s, n) => s + n, 0) / vals.length) * 100) / 100 : null;
  };
  return ix.subjects.map((s) => {
    const days = fcrByDay.get(s.id);
    const placed = num(s.id, "birds_placed", "max") ?? 0;
    const mortality = (num(s.id, "mortality_since_last", "sum") ?? 0) + (num(s.id, "death_count", "sum") ?? 0);
    const penWeight = num(s.id, "total_pen_weight", "max");
    const alive = num(s.id, "birds_alive", "min") ?? (placed - mortality);
    return {
      penCode: s.subject_code, penId: s.id, house: ix.byCode.get(s.id)?.get("house")?.[0] ?? "—", arm: s.randomization_arm ?? "—",
      starterFcr: phaseAvg(days, [7, 14]), growerFcr: phaseAvg(days, [21, 28]), finisherFcr: phaseAvg(days, [35, 42]),
      overallFcr: num(s.id, "cumulative_fcr", "max"),
      finalWeight: penWeight && alive > 0 ? Math.round((penWeight / alive) * 100) / 100 : null,
      feedConsumed: num(s.id, "feed_added", "sum"), mortalityCount: mortality,
      mortalityPct: placed > 0 ? Math.round((mortality / placed) * 1000) / 10 : null,
    };
  }).sort((a, b) => a.penCode.localeCompare(b.penCode));
}
export interface PhPhaseRow { phase: string; arm: string; avgFcr: number | null; feedConsumed: number | null; weightGain: number | null }

// ─── Randomization (Fix 6) — the randomization list + arm balance ────────────
export interface RandomizationRow {
  seq: number; subjectCode: string; subjectId: string; siteName: string; siteId: string | null;
  armCode: string; randDate: string | null; method: string; block: string; randomizedBy: string;
}
export function randomizationRows(dataset: Dataset, studyId: string): RandomizationRow[] {
  const ix = buildSubjectIndex(dataset, studyId);
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const first = (sid: string, code: string) => ix.byCode.get(sid)?.get(code)?.[0] ?? null;
  const rows = ix.subjects
    .filter((s) => s.randomization_arm)
    .map((s) => {
      const site = s.site_id ? siteById.get(s.site_id) : undefined;
      const randDate = s.randomized_at?.slice(0, 10) ?? first(s.id, "randomization_date") ?? first(s.id, "assigned_date");
      return {
        subjectCode: s.subject_code, subjectId: s.id,
        siteName: site ? `${site.code} · ${site.name}` : "—", siteId: s.site_id ?? null,
        armCode: s.randomization_arm ?? "—", randDate,
        method: first(s.id, "randomization_method") ?? first(s.id, "assigned_method") ?? "Permuted block",
        block: first(s.id, "block_number") ?? first(s.id, "block") ?? "—",
        randomizedBy: s.randomized_by ?? first(s.id, "randomized_by") ?? first(s.id, "confirmed_by") ?? "—",
      };
    })
    .sort((a, b) => (a.randDate ?? "").localeCompare(b.randDate ?? "") || a.subjectCode.localeCompare(b.subjectCode));
  return rows.map((r, i) => ({ seq: i + 1, ...r }));
}
export interface RandBalanceRow { arm: string; actual: number; expected: number }
export function randomizationBalance(rows: RandomizationRow[]): RandBalanceRow[] {
  const arms = Array.from(new Set(rows.map((r) => r.armCode))).sort();
  const expected = rows.length / Math.max(1, arms.length);
  return arms.map((arm) => ({ arm, actual: rows.filter((r) => r.armCode === arm).length, expected: Math.round(expected * 10) / 10 }));
}

// ─── Drug Accountability (Fix 7) — vial/kit reconciliation per group per site ─
export interface DrugAccountabilityRow {
  group: string; siteName: string; siteId: string | null;
  received: number; dispensed: number; returned: number; destroyed: number; remaining: number;
  accountabilityPct: number; status: "Balanced" | "Outstanding";
}
export function drugAccountability(dataset: Dataset, studyId: string): DrugAccountabilityRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const buckets = new Map<string, { group: string; siteId: string | null; received: number; dispensed: number; returned: number; destroyed: number; remaining: number }>();
  for (const v of dataset.vials) {
    if (v.studyId !== studyId) continue;
    const key = `${v.treatmentGroup}|${v.siteId ?? "—"}`;
    let b = buckets.get(key);
    if (!b) { b = { group: v.treatmentGroup, siteId: v.siteId, received: 0, dispensed: 0, returned: 0, destroyed: 0, remaining: 0 }; buckets.set(key, b); }
    b.received += 1;
    if (v.status === "removed" || v.status === "unusable") b.destroyed += 1;
    else if (v.status === "returned") b.returned += 1;
    else if (v.status === "athome" || v.status === "depleted") b.dispensed += 1;
    else b.remaining += 1; // available
  }
  return Array.from(buckets.values()).map((b) => {
    const site = b.siteId ? siteById.get(b.siteId) : undefined;
    const pct = b.received ? Math.round(((b.dispensed + b.returned + b.destroyed) / b.received) * 100) : 0;
    return {
      group: b.group, siteName: site ? `${site.code} · ${site.name}` : "—", siteId: b.siteId,
      received: b.received, dispensed: b.dispensed, returned: b.returned, destroyed: b.destroyed, remaining: b.remaining,
      accountabilityPct: pct, status: (b.remaining === 0 ? "Balanced" : "Outstanding") as "Balanced" | "Outstanding",
    };
  }).sort((a, b) => a.group.localeCompare(b.group) || a.siteName.localeCompare(b.siteName));
}

// ─── Protocol Deviations (Fix 3) — from the seeded protocolDeviations table ───
export interface ProtocolDeviationListingRow {
  pdId: string; subjectCode: string; siteName: string; siteId: string | null; visit: string;
  category: "Major" | "Minor"; description: string; dateDiscovered: string | null; impact: string; correctiveAction: string; status: string;
}
export function protocolDeviationListing(dataset: Dataset, studyId: string): ProtocolDeviationListingRow[] {
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const devs = dataset.protocolDeviations.filter((d) => d.study_id === studyId).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  return devs.map((d, i) => {
    const site = d.site_id ? siteById.get(d.site_id) : undefined;
    const category: "Major" | "Minor" = d.severity === "Major" ? "Major" : "Minor";
    return {
      pdId: `PD-${String(i + 1).padStart(3, "0")}`, subjectCode: d.subject_code ?? "—",
      siteName: site ? `${site.code} · ${site.name}` : "—", siteId: d.site_id ?? null, visit: "—",
      category, description: d.deviation_type ?? "—", dateDiscovered: d.date ?? null,
      impact: d.reported_to_sponsor ? "Reported to sponsor" : "No sponsor notification required",
      correctiveAction: d.status === "Closed" ? "Documented and resolved" : "Under review",
      status: d.status ?? "Open",
    };
  });
}
