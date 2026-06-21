// ════════════════════════════════════════════════════════════════════════════
// Dashboard derivations — live aggregates read from the session dataset (no new
// fields, no hardcoded numbers). Shared across role/study dashboards.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";
import { buildVisits, addDays } from "@/lib/visits-data";
import { siteEnrolledCount, capLevel, type CapLevel } from "@/lib/enrollment";

const ENROLLED = new Set(["randomized", "enrolled", "active", "completed", "withdrawn"]);
const DEAD = new Set(["died", "euthanized", "dead"]);
const DONE_STATUSES = new Set(["in_review", "reviewed", "finalized", "locked"]);
const SDV_INELIGIBLE = new Set(["file", "calculated", "textarea"]);

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Subject-scoped form instances for a study (the unit most dashboard rollups use).
function subjectInstances(dataset: Dataset, studyId: string) {
  const subjIds = new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.id));
  return dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));
}

// ─── Generic (study-agnostic) ───────────────────────────────────────────────
export interface SubjectCounts { total: number; active: number; completed: number; withdrawn: number; screening: number }
export function subjectCounts(dataset: Dataset, studyId: string): SubjectCounts {
  const subs = dataset.subjects.filter((s) => s.study_id === studyId);
  const c = (st: string) => subs.filter((s) => s.status === st).length;
  return { total: subs.length, active: c("active"), completed: c("completed"), withdrawn: c("withdrawn"), screening: c("screening") };
}

// Open (open + responded) queries, study-scoped, skipping orphans whose field value
// no longer resolves — same rule the Queries screen uses.
export function openQueryCount(dataset: Dataset, studyId: string): number {
  const instIds = new Set(subjectInstances(dataset, studyId).map((i) => i.id));
  const fvIds = new Set(dataset.fieldValues.map((v) => v.id));
  return dataset.queries.filter(
    (q) => instIds.has(q.form_instance_id) && q.status !== "resolved" && (!q.field_value_id || fvIds.has(q.field_value_id)),
  ).length;
}
export function respondedQueryCount(dataset: Dataset, studyId: string): number {
  const instIds = new Set(subjectInstances(dataset, studyId).map((i) => i.id));
  return dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status === "responded").length;
}

export interface FormProgress { completed: number; total: number }
export function formProgress(dataset: Dataset, studyId: string): FormProgress {
  const insts = subjectInstances(dataset, studyId);
  return { completed: insts.filter((i) => DONE_STATUSES.has(i.status)).length, total: insts.length };
}

export interface SdvProgress { verified: number; total: number }
export function sdvProgress(dataset: Dataset, studyId: string): SdvProgress {
  const insts = subjectInstances(dataset, studyId);
  const instIds = new Set(insts.map((i) => i.id));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  // Verifiable = non-empty values on SDV-eligible fields of these instances.
  const total = dataset.fieldValues.filter((v) => {
    if (!instIds.has(v.form_instance_id) || v.value == null || v.value === "") return false;
    const f = fieldById.get(v.form_field_id);
    return !!f && !SDV_INELIGIBLE.has(f.field_type);
  }).length;
  const verified = dataset.sdvRecords.filter((r) => r.status === "verified" && instIds.has(r.form_instance_id)).length;
  return { verified, total };
}

export function openEditCheckCount(dataset: Dataset, studyId: string): number {
  const instIds = new Set(subjectInstances(dataset, studyId).map((i) => i.id));
  return dataset.editChecks.filter((e) => instIds.has(e.form_instance_id) && e.status === "open").length;
}

export function pendingDeltaCount(dataset: Dataset, studyId: string): number {
  const instIds = new Set(subjectInstances(dataset, studyId).map((i) => i.id));
  const fvIds = new Set(dataset.fieldValues.filter((v) => instIds.has(v.form_instance_id)).map((v) => v.id));
  return dataset.deltaRecords.filter((r) => fvIds.has(r.field_value_id) && r.status === "pending").length;
}

export interface VisitCompliance { onTime: number; outside: number; overdue: number; dueThisWeek: number; dueToday: number }
export function visitCompliance(dataset: Dataset, studyId: string): VisitCompliance {
  const visits = buildVisits(dataset, studyId);
  const today = todayISO();
  const weekOut = addDays(today, 7);
  let onTime = 0, outside = 0, overdue = 0, dueThisWeek = 0, dueToday = 0;
  for (const v of visits) {
    if (v.completed) {
      const diff = Math.abs(dayDiff(v.recordedDate ?? v.targetDate, v.targetDate));
      if (diff <= v.window) onTime++; else outside++;
    } else if (v.subjectStatus === "active") {
      if (v.targetDate < today) overdue++;
      else if (v.targetDate === today) dueToday++;
      else if (v.targetDate <= weekOut) dueThisWeek++;
    }
  }
  return { onTime, outside, overdue, dueThisWeek, dueToday };
}

// The most urgent pending visits (Overdue → Due today → Due this week), for the
// dashboard preview cards. urgency: 0 overdue, 1 due-today, 2 due-this-week.
export interface UpcomingVisit { id: string; subjectCode: string; siteName: string; visitName: string; targetDate: string; urgency: 0 | 1 | 2; statusLabel: string }
export function upcomingVisits(dataset: Dataset, studyId: string, limit = 5): UpcomingVisit[] {
  const today = todayISO();
  const weekOut = addDays(today, 7);
  const out: UpcomingVisit[] = [];
  for (const v of buildVisits(dataset, studyId)) {
    if (v.completed || v.subjectStatus !== "active") continue;
    let urgency: 0 | 1 | 2 | null = null;
    if (v.targetDate < today) urgency = 0;
    else if (v.targetDate === today) urgency = 1;
    else if (v.targetDate <= weekOut) urgency = 2;
    if (urgency == null) continue;
    out.push({
      id: v.id, subjectCode: v.subjectCode, siteName: v.siteName, visitName: v.visitName, targetDate: v.targetDate, urgency,
      statusLabel: urgency === 0 ? `Overdue ${Math.abs(dayDiff(v.targetDate, today))}d` : urgency === 1 ? "Due today" : "Due this week",
    });
  }
  return out.sort((a, b) => a.urgency - b.urgency || a.targetDate.localeCompare(b.targetDate)).slice(0, limit);
}

// Oldest open queries (worklist preview) — ID · subject · days open.
export interface QueryWorkItem { id: string; code: string; subjectCode: string; daysOpen: number }
export function queryWorklist(dataset: Dataset, studyId: string, limit = 5): QueryWorkItem[] {
  const instById = new Map(subjectInstances(dataset, studyId).map((i) => [i.id, i]));
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const firstMsg = new Map<string, string>();
  for (const m of dataset.queryMessages) if (!firstMsg.has(m.query_id) && m.created_at) firstMsg.set(m.query_id, m.created_at);
  const now = Date.now();
  return dataset.queries
    .filter((q) => instById.has(q.form_instance_id) && q.status === "open")
    .map((q) => {
      const subj = subById.get(instById.get(q.form_instance_id)?.subject_id ?? "");
      const created = firstMsg.get(q.id);
      const daysOpen = created ? Math.max(0, Math.floor((now - Date.parse(created)) / 86400000)) : 0;
      return { id: q.id, code: `Q-${q.id.slice(0, 4).toUpperCase()}`, subjectCode: subj?.subject_code ?? "—", daysOpen };
    })
    .sort((a, b) => b.daysOpen - a.daysOpen)
    .slice(0, limit);
}

// Per-site form completion (for the per-feedlot / per-site progress bars).
export interface SiteFormProgress { siteId: string; code: string; name: string; completed: number; total: number; pct: number }
export function formProgressBySite(dataset: Dataset, studyId: string): SiteFormProgress[] {
  const sites = dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  return sites.map((site) => {
    const insts = subjectInstances(dataset, studyId).filter((i) => subById.get(i.subject_id!)?.site_id === site.id);
    const completed = insts.filter((i) => DONE_STATUSES.has(i.status)).length;
    const total = insts.length;
    return { siteId: site.id, code: site.code, name: site.name, completed, total, pct: total ? Math.round((completed / total) * 100) : 0 };
  });
}
export function sdvProgressBySite(dataset: Dataset, studyId: string): SiteFormProgress[] {
  const sites = dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  return sites.map((site) => {
    const insts = subjectInstances(dataset, studyId).filter((i) => subById.get(i.subject_id!)?.site_id === site.id);
    const instIds = new Set(insts.map((i) => i.id));
    const total = dataset.fieldValues.filter((v) => {
      if (!instIds.has(v.form_instance_id) || v.value == null || v.value === "") return false;
      const f = fieldById.get(v.form_field_id);
      return !!f && !SDV_INELIGIBLE.has(f.field_type);
    }).length;
    const verified = dataset.sdvRecords.filter((r) => r.status === "verified" && instIds.has(r.form_instance_id)).length;
    return { siteId: site.id, code: site.code, name: site.name, completed: verified, total, pct: total ? Math.round((verified / total) * 100) : 0 };
  }).sort((a, b) => a.pct - b.pct);
}

// ─── BR-2502 specific ───────────────────────────────────────────────────────
// All non-empty values an animal carries for a field code, across every instance.
function valuesBySubject(dataset: Dataset, studyId: string): Map<string, Map<string, string[]>> {
  const subjIds = new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.id));
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const out = new Map<string, Map<string, string[]>>();
  for (const fv of dataset.fieldValues) {
    if (fv.value == null || fv.value === "") continue;
    const sid = instById.get(fv.form_instance_id)?.subject_id;
    if (!sid || !subjIds.has(sid)) continue;
    const field = fieldById.get(fv.form_field_id);
    if (!field) continue;
    let m = out.get(sid); if (!m) { m = new Map(); out.set(sid, m); }
    const arr = m.get(field.code) ?? []; arr.push(fv.value); m.set(field.code, arr);
  }
  return out;
}

const BR_STUDY_CODE = "BR-2502";
const brStudyId = (dataset: Dataset) => dataset.studies.find((s) => s.code === BR_STUDY_CODE)?.id;

export interface RatePct { num: number; denom: number; pct: number | null }
const rate = (num: number, denom: number): RatePct => ({ num, denom, pct: denom > 0 ? (num / denom) * 100 : null });

interface BrAnimal { enrolled: boolean; treated: boolean; retreated: boolean; dead: boolean; peakDart: number | null }
function brAnimals(dataset: Dataset): BrAnimal[] {
  const sid = brStudyId(dataset);
  if (!sid) return [];
  const vals = valuesBySubject(dataset, sid);
  return dataset.subjects.filter((s) => s.study_id === sid).map((s) => {
    const v = vals.get(s.id) ?? new Map<string, string[]>();
    const dartVals = [...(v.get("clinical_illness_score") ?? []), ...(v.get("dart_score") ?? [])].map(Number).filter((n) => !Number.isNaN(n));
    return {
      enrolled: ENROLLED.has(s.status),
      treated: (v.get("test_article")?.length ?? 0) > 0,
      retreated: (v.get("retreatment_flag") ?? []).includes("Yes") || (v.get("requires_retreatment") ?? []).includes("Yes"),
      dead: DEAD.has(s.status),
      peakDart: dartVals.length ? Math.max(...dartVals) : null,
    };
  });
}

export function brMorbidity(dataset: Dataset): RatePct {
  const a = brAnimals(dataset).filter((x) => x.enrolled);
  return rate(a.filter((x) => x.treated).length, a.length);
}
export function brMortality(dataset: Dataset): RatePct {
  const a = brAnimals(dataset).filter((x) => x.enrolled);
  return rate(a.filter((x) => x.dead).length, a.length);
}
export function brRetreatment(dataset: Dataset): RatePct {
  const a = brAnimals(dataset).filter((x) => x.enrolled);
  const treated = a.filter((x) => x.treated);
  return rate(treated.filter((x) => x.retreated).length, treated.length);
}
export function brMeanDart(dataset: Dataset): number | null {
  const peaks = brAnimals(dataset).filter((x) => x.enrolled).map((x) => x.peakDart).filter((x): x is number => x != null);
  return peaks.length ? peaks.reduce((s, n) => s + n, 0) / peaks.length : null;
}

export interface SiteEnrollment { siteId: string; code: string; label: string; enrolled: number; target: number | null; capLevel: CapLevel }
export function brEnrollmentBySite(dataset: Dataset): SiteEnrollment[] {
  const sid = brStudyId(dataset);
  if (!sid) return [];
  return dataset.sites.filter((s) => s.study_id === sid).slice().sort((a, b) => a.code.localeCompare(b.code)).map((site) => {
    const enrolled = siteEnrolledCount(dataset, site.id);
    return { siteId: site.id, code: site.code, label: `${site.code} · ${site.name}`, enrolled, target: site.enrollment_target ?? null, capLevel: capLevel(enrolled, site.enrollment_target) };
  });
}

// Open edit checks by feedlot (site) — for the DM edit-check table.
export function editChecksBySite(dataset: Dataset): { siteId: string; code: string; name: string; count: number }[] {
  const sid = brStudyId(dataset);
  if (!sid) return [];
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  return dataset.sites.filter((s) => s.study_id === sid).slice().sort((a, b) => a.code.localeCompare(b.code)).map((site) => {
    const count = dataset.editChecks.filter((e) => {
      if (e.status !== "open") return false;
      const inst = instById.get(e.form_instance_id);
      const subj = inst?.subject_id ? subById.get(inst.subject_id) : undefined;
      return subj?.site_id === site.id;
    }).length;
    return { siteId: site.id, code: site.code, name: site.name, count };
  });
}

// ─── PH-2401 specific ───────────────────────────────────────────────────────
const PH_STUDY_CODE = "PH-2401";
const phStudyId = (dataset: Dataset) => dataset.studies.find((s) => s.code === PH_STUDY_CODE)?.id;

// Latest non-empty numeric value an instance-set carries for a field code.
function lastNum(vals: Map<string, string[]> | undefined, code: string): number | null {
  const arr = vals?.get(code);
  if (!arr || !arr.length) return null;
  const n = Number(arr[arr.length - 1]);
  return Number.isNaN(n) ? null : n;
}
function sumNum(vals: Map<string, string[]> | undefined, code: string): number {
  return (vals?.get(code) ?? []).map(Number).filter((n) => !Number.isNaN(n)).reduce((s, n) => s + n, 0);
}

export interface PhFlockHealth { totalBirdsPlaced: number; currentAlive: number; cumulativeMortality: number; mortalityPct: number | null }
export function phFlockHealth(dataset: Dataset): PhFlockHealth {
  const sid = phStudyId(dataset);
  if (!sid) return { totalBirdsPlaced: 0, currentAlive: 0, cumulativeMortality: 0, mortalityPct: null };
  const vals = valuesBySubject(dataset, sid);
  let placed = 0, alive = 0, mortality = 0;
  for (const v of Array.from(vals.values())) {
    const p = lastNum(v, "birds_placed");
    if (p != null) placed += p;
    const a = lastNum(v, "birds_alive");
    if (a != null) alive += a;
    mortality += sumNum(v, "mortality_since_last") + sumNum(v, "death_count");
  }
  return { totalBirdsPlaced: placed, currentAlive: alive, cumulativeMortality: mortality, mortalityPct: placed > 0 ? (mortality / placed) * 100 : null };
}

export function phMeanFcr(dataset: Dataset): number | null {
  const sid = phStudyId(dataset);
  if (!sid) return null;
  const vals = valuesBySubject(dataset, sid);
  const fcrs: number[] = [];
  for (const v of Array.from(vals.values())) {
    const gain = lastNum(v, "total_pen_weight");
    const feed = sumNum(v, "feed_added");
    if (gain && gain > 0 && feed > 0) fcrs.push(feed / gain);
  }
  return fcrs.length ? fcrs.reduce((s, n) => s + n, 0) / fcrs.length : null;
}

export function phMeanAdg(dataset: Dataset): number | null {
  const sid = phStudyId(dataset);
  if (!sid) return null;
  const vals = valuesBySubject(dataset, sid);
  const adgs: number[] = [];
  for (const v of Array.from(vals.values())) {
    const w = lastNum(v, "total_pen_weight"); // kg per pen
    const birds = lastNum(v, "birds_alive");
    if (w && birds && birds > 0) adgs.push((w / birds) * 1000 / 42); // g/bird/day over a 42-day cycle
  }
  return adgs.length ? adgs.reduce((s, n) => s + n, 0) / adgs.length : null;
}

export interface PhFeedAnalysis { confirmed: number; pending: number; total: number }
export function phFeedAnalysisStatus(dataset: Dataset): PhFeedAnalysis {
  const sid = phStudyId(dataset);
  if (!sid) return { confirmed: 0, pending: 0, total: 0 };
  const vals = valuesBySubject(dataset, sid);
  // T02 pens = those carrying a T02 treatment_arm value.
  let confirmed = 0, total = 0;
  for (const v of Array.from(vals.values())) {
    const isT02 = (v.get("treatment_arm") ?? []).some((x) => x.startsWith("T02"));
    if (!isT02) continue;
    total++;
    if ((v.get("feed_analysis_performed") ?? []).includes("Yes")) confirmed++;
  }
  return { confirmed, pending: total - confirmed, total };
}
