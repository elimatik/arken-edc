// ════════════════════════════════════════════════════════════════════════════
// Schedule of Events (SoE) — the protocol schedule grid: which procedures are
// required at which study days. The GRID (days, procedures, markers, footnotes)
// is protocol metadata defined per study below; the LIVE overlay (done / due /
// overdue) is derived from real session data via buildVisits(). A visit-day
// column gets a live status by aggregating the visit completion of active
// subjects for that day — so a past-and-done visit shows ✓ across its procedures,
// a missed one shows ⚠, and the current one shows !.
// ════════════════════════════════════════════════════════════════════════════

import type { Dataset } from "./session-store/types";
import { buildVisits, addDays, type VisitRow } from "./visits-data";

export type Phase = "screening" | "treatment" | "followup";
export type MarkerType = "x" | "dose" | "blood" | "check" | "fast";
export type LiveStatus = "done" | "overdue" | "due";

export interface DayCol {
  day: number; // study day used to join live visit data (sentinel < 0 = protocol-only column)
  label: string; // top line of the header ("D 0", "V2", "Wk 3")
  window: string; // second line ("±2d", "Baseline", "Placement")
  phase: Phase;
  pivot?: boolean; // dosing pivot — bold left border (Day 0)
}
export interface ProcRow { name: string; fn?: number; cells: (MarkerType | null)[] }
export interface ProcGroup { group: string; rows: ProcRow[] }
export interface Footnote { num: number; text: string }
export interface StudyScheduleConfig {
  subjectNoun: string; // "Subject" | "Pen"
  days: DayCol[];
  groups: ProcGroup[];
  footnotes: Footnote[];
}

// Marker shorthands for the procedure templates.
const X: MarkerType = "x"; // procedure scheduled
const D: MarkerType = "dose"; // dosing
const B: MarkerType = "blood"; // blood / sample
const A: MarkerType = "check"; // assessment
const F: MarkerType = "fast"; // fasting required
const _ = null;

const PHASE_LABEL: Record<Phase, string> = { screening: "Screening", treatment: "Active Treatment", followup: "Follow-up" };

// ─── BR-2502 · cattle BRD, Day −14 → Day 42 ─────────────────────────────────
// Live visit days (VISIT_WINDOWS): 0, 3, 7, 14, 28.
const BR: StudyScheduleConfig = {
  subjectNoun: "Subject",
  days: [
    { day: -14, label: "D -14", window: "±2d", phase: "screening" },
    { day: -7, label: "D -7", window: "±2d", phase: "screening" },
    { day: 0, label: "D 0", window: "Dosing", phase: "treatment", pivot: true },
    { day: 1, label: "D 1", window: "±1d", phase: "treatment" },
    { day: 3, label: "D 3", window: "±1d", phase: "treatment" },
    { day: 7, label: "D 7", window: "±2d", phase: "treatment" },
    { day: 14, label: "D 14", window: "±2d", phase: "treatment" },
    { day: 21, label: "D 21", window: "±2d", phase: "treatment" },
    { day: 28, label: "D 28", window: "±3d", phase: "treatment" },
    { day: 42, label: "D 42", window: "±3d", phase: "followup" },
  ],
  groups: [
    { group: "Consent & Eligibility", rows: [
      { name: "Informed consent / owner sign-off", fn: 1, cells: [X, X, _, _, _, _, _, _, _, _] },
      { name: "Inclusion / exclusion review", cells: [X, X, _, _, _, _, _, _, _, _] },
      { name: "Subject ID & enrollment", cells: [_, X, _, _, _, _, _, _, _, _] },
    ] },
    { group: "Randomization & Treatment", rows: [
      { name: "Randomization / arm assignment", cells: [_, X, X, _, _, _, _, _, _, _] },
      { name: "Study drug administration", fn: 2, cells: [_, _, D, _, _, _, _, _, _, _] },
      { name: "Fasting requirement (pre-dose)", cells: [_, F, _, _, _, _, _, _, _, _] },
      { name: "Dose confirmation log", cells: [_, _, X, _, _, _, _, _, _, _] },
    ] },
    { group: "Assessments", rows: [
      { name: "Physical examination", cells: [X, X, X, X, X, X, X, X, X, X] },
      { name: "Rectal temperature", cells: [X, X, X, X, X, X, X, X, X, X] },
      { name: "Heart & respiratory rate", cells: [X, X, X, X, X, X, X, X, X, X] },
      { name: "Nasal / ocular discharge score", cells: [X, X, X, _, X, X, X, X, X, _] },
      { name: "Body condition score (BCS)", cells: [X, X, X, _, _, X, X, X, X, X] },
      { name: "Welfare assessment", fn: 3, cells: [X, _, X, _, _, X, _, X, _, X] },
    ] },
    { group: "Laboratory", rows: [
      { name: "Whole blood — haematology", fn: 4, cells: [B, _, B, _, B, B, B, _, B, B] },
      { name: "Serum — biochemistry", cells: [B, _, B, _, _, B, _, _, B, B] },
      { name: "Nasal swab — PCR", cells: [B, _, _, _, _, _, B, _, _, B] },
      { name: "Sample handling & storage", fn: 5, cells: [X, _, X, _, X, X, X, _, X, X] },
    ] },
    { group: "Endpoints", rows: [
      { name: "BRD clinical score (primary)", fn: 6, cells: [A, A, A, A, A, A, A, A, A, A] },
      { name: "Treatment success / failure", fn: 6, cells: [_, _, _, _, _, A, A, A, A, _] },
      { name: "Adverse event monitoring", cells: [A, A, A, A, A, A, A, A, A, A] },
      { name: "SAE reporting window", fn: 7, cells: [X, _, _, _, _, _, _, _, X, X] },
      { name: "Protocol deviation log", cells: [X, _, X, _, _, X, _, _, X, X] },
    ] },
  ],
  footnotes: [
    { num: 1, text: "Owner consent must be obtained before any screening procedure. Re-confirmation is required if more than 7 days elapse between consent and enrollment." },
    { num: 2, text: "Tulathromycin 2.5 mg/kg IM as a single dose in the neck; maximum 7.5 mL per injection site. Meat withholding period: 49 days post-treatment." },
    { num: 3, text: "Welfare assessment performed by a licensed veterinarian. A welfare score ≥3 triggers immediate PI notification and consideration of a humane endpoint." },
    { num: 4, text: "Blood processed within 2 h of collection. Haematology: EDTA tube, room temperature. Serum: SST tube, centrifuge 1500×g / 15 min, store at −80 °C." },
    { num: 5, text: "All samples labelled with Subject ID, Study Day, and collection time; stored in the designated site freezer with a maintained chain-of-custody log." },
    { num: 6, text: "BRD clinical score is the primary efficacy endpoint. Treatment success = ≥50% reduction from baseline AND score ≤3 at Day 7; failure = no reduction or rescue medication required." },
    { num: 7, text: "SAEs must be reported to the Sponsor within 24 h of discovery via the ARKEN SAE form plus direct contact with the Medical Monitor (Protocol §8.4)." },
  ],
};

// ─── CA-0801 · canine atopic dermatitis, V1 → V7 (visit labels) ─────────────
// Live visit days (VISIT_WINDOWS): 0, 14, 28, 42, 56, 84. V1 screening is
// protocol-only (day −7 sentinel — no scheduled visit form).
const CA: StudyScheduleConfig = {
  subjectNoun: "Subject",
  days: [
    { day: -7, label: "V1", window: "Screening", phase: "screening" },
    { day: 0, label: "V2", window: "Baseline · dose", phase: "treatment", pivot: true },
    { day: 14, label: "V3", window: "±3d", phase: "treatment" },
    { day: 28, label: "V4", window: "±3d", phase: "treatment" },
    { day: 42, label: "V5", window: "±3d", phase: "treatment" },
    { day: 56, label: "V6", window: "±3d", phase: "treatment" },
    { day: 84, label: "V7", window: "EOS ±5d", phase: "followup" },
  ],
  groups: [
    { group: "Consent & Eligibility", rows: [
      { name: "Owner informed consent", fn: 1, cells: [X, _, _, _, _, _, _] },
      { name: "Inclusion / exclusion (CADESI-04 ≥10)", cells: [X, X, _, _, _, _, _] },
      { name: "Enrollment & randomization", cells: [_, X, _, _, _, _, _] },
    ] },
    { group: "Randomization & Treatment", rows: [
      { name: "Study drug dispensation (blinded)", fn: 2, cells: [_, D, D, D, D, D, _] },
      { name: "Owner dosing diary review", cells: [_, X, X, X, X, X, _] },
      { name: "Drug accountability / return", cells: [_, _, X, X, X, X, X] },
    ] },
    { group: "Assessments", rows: [
      { name: "Physical examination", cells: [X, X, X, X, X, X, X] },
      { name: "CADESI-04 lesion score", fn: 3, cells: [X, X, X, X, X, X, X] },
      { name: "Pruritus VAS (owner)", cells: [_, X, X, X, X, X, X] },
      { name: "Body weight", cells: [X, X, _, X, _, X, X] },
    ] },
    { group: "Laboratory", rows: [
      { name: "Haematology & biochemistry", fn: 4, cells: [B, B, _, B, _, _, B] },
      { name: "Urinalysis", cells: [B, B, _, _, _, _, B] },
    ] },
    { group: "Endpoints", rows: [
      { name: "Treatment success (CADESI ≥50% ↓)", fn: 5, cells: [_, _, _, A, _, A, A] },
      { name: "Pruritus response", cells: [_, _, A, A, A, A, A] },
      { name: "Adverse event monitoring", cells: [A, A, A, A, A, A, A] },
      { name: "SAE reporting window", fn: 6, cells: [X, X, _, _, _, _, X] },
    ] },
  ],
  footnotes: [
    { num: 1, text: "Owner informed consent obtained at Screening (V1) before any study procedure; the signed form is retained in the subject's source file." },
    { num: 2, text: "This is a double-blind study: kits are dispensed by number only. Neither the owner nor site staff are aware of the treatment allocation." },
    { num: 3, text: "CADESI-04 is scored across 4 body regions by the same assessor at every visit where possible. Eligibility requires a baseline CADESI-04 ≥10." },
    { num: 4, text: "Ciclosporin-class comedications require a 28-day washout; corticosteroids a 14-day washout, recorded on the Concomitant Medications form." },
    { num: 5, text: "Primary endpoint: ≥50% reduction in CADESI-04 from baseline at V4 (Day 28), sustained through V7 (Day 84 / End of Study)." },
    { num: 6, text: "SAEs must be reported to the Sponsor within 24 h. The reporting window opens at V1 and remains open through the End-of-Study visit." },
  ],
};

// ─── PH-2401 · broiler production, Week 0 → Week 6 (pen-level) ───────────────
// Live visit days (VISIT_WINDOWS): 7, 14, 21, 28, 35, 42. Week 0 (placement) is
// protocol-only (day 0 has no scheduled weighing form).
const PH: StudyScheduleConfig = {
  subjectNoun: "Pen",
  days: [
    { day: 0, label: "Wk 0", window: "Placement", phase: "screening", pivot: true },
    { day: 7, label: "Wk 1", window: "±2d", phase: "treatment" },
    { day: 14, label: "Wk 2", window: "±2d", phase: "treatment" },
    { day: 21, label: "Wk 3", window: "±2d", phase: "treatment" },
    { day: 28, label: "Wk 4", window: "±2d", phase: "treatment" },
    { day: 35, label: "Wk 5", window: "±2d", phase: "followup" },
    { day: 42, label: "Wk 6", window: "±2d", phase: "followup" },
  ],
  groups: [
    { group: "Placement & Eligibility", rows: [
      { name: "Pen placement & bird count", fn: 1, cells: [X, _, _, _, _, _, _] },
      { name: "Flock health screening", cells: [X, _, _, _, _, _, _] },
      { name: "Pen randomization / arm assignment", cells: [X, _, _, _, _, _, _] },
    ] },
    { group: "Feed & Treatment", rows: [
      { name: "Medicated feed (salinomycin)", fn: 2, cells: [_, D, D, D, D, _, _] },
      { name: "Feed withdrawal period", fn: 3, cells: [_, _, _, _, _, F, F] },
      { name: "Feed delivery log", cells: [_, X, X, X, X, X, X] },
    ] },
    { group: "Assessments", rows: [
      { name: "Daily mortality check", cells: [A, A, A, A, A, A, A] },
      { name: "Clinical observation (flock health)", cells: [A, A, A, A, A, A, A] },
      { name: "Pen body weight (sampled)", fn: 4, cells: [X, X, X, X, X, X, X] },
      { name: "Feed intake / FCR", fn: 5, cells: [_, X, X, X, X, X, X] },
    ] },
    { group: "Laboratory", rows: [
      { name: "Litter / environmental sampling", cells: [B, _, B, _, B, _, B] },
      { name: "Necropsy (mortalities)", fn: 6, cells: [_, A, A, A, A, A, A] },
    ] },
    { group: "Endpoints", rows: [
      { name: "Feed conversion ratio (primary)", fn: 5, cells: [_, _, _, _, A, _, A] },
      { name: "Body-weight gain", cells: [_, _, _, A, _, _, A] },
      { name: "Adverse event monitoring", cells: [A, A, A, A, A, A, A] },
      { name: "Unexpected-mortality / SAE report", fn: 7, cells: [X, X, X, X, X, X, X] },
    ] },
  ],
  footnotes: [
    { num: 1, text: "Birds placed by pen with an initial headcount recorded. Pen is the unit of randomization and analysis for this production study." },
    { num: 2, text: "Salinomycin included in the finisher ration at the label inclusion rate. Feed batches are analysed to confirm the active concentration." },
    { num: 3, text: "Anticoccidial feed withdrawal period observed before the terminal weeks to satisfy the meat withholding requirement." },
    { num: 4, text: "Pen body weight sampled from a fixed proportion of birds using a calibrated platform scale; the same birds are avoided across weeks." },
    { num: 5, text: "Feed conversion ratio (FCR = feed intake ÷ weight gain) is the primary production endpoint, reported per period and cumulatively." },
    { num: 6, text: "All mortalities undergo necropsy within 24 h; findings are logged and coded. Cause-of-death categories follow the study necropsy SOP." },
    { num: 7, text: "Unexpected or excess pen mortality is reported to the Sponsor within 24 h as a potential SAE for the flock." },
  ],
};

const CONFIGS: Record<string, StudyScheduleConfig> = { "BR-2502": BR, "CA-0801": CA, "PH-2401": PH };

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

export interface PhaseSpan { phase: Phase; label: string; count: number }

export interface ScheduleModel {
  config: StudyScheduleConfig;
  phaseSpans: PhaseSpan[];
  liveByDay: Map<number, LiveStatus>; // per study-day live status (only days with real visit data)
  overdueCount: number; // active-subject visits past window and not done
  dueCount: number; // active-subject visits within window of today and not done
}

// Contiguous same-phase runs → phase banner spans.
function phaseSpansOf(days: DayCol[]): PhaseSpan[] {
  const spans: PhaseSpan[] = [];
  for (const d of days) {
    const last = spans[spans.length - 1];
    if (last && last.phase === d.phase) last.count++;
    else spans.push({ phase: d.phase, label: PHASE_LABEL[d.phase], count: 1 });
  }
  return spans;
}

export function buildSchedule(dataset: Dataset, studyId: string, todayISO: string): ScheduleModel | null {
  const study = dataset.studies.find((s) => s.id === studyId);
  const config = study ? CONFIGS[study.code] : undefined;
  if (!study || !config) return null;

  const visits = buildVisits(dataset, studyId).filter((v) => v.subjectStatus === "active");

  // Per visit-day live status, aggregated across active subjects. Precedence:
  // overdue (a missed, past-window visit) → due (within window of today) → done
  // (at least one completed) → none (future / no data → shows the protocol marker).
  const isOverdue = (r: VisitRow) => !r.completed && addDays(r.targetDate, r.window) < todayISO;
  const isDue = (r: VisitRow) => !r.completed && addDays(r.targetDate, r.window) >= todayISO && Math.abs(daysBetween(todayISO, r.targetDate)) <= r.window;

  const byDay = new Map<number, VisitRow[]>();
  for (const v of visits) { const arr = byDay.get(v.day); if (arr) arr.push(v); else byDay.set(v.day, [v]); }
  const liveByDay = new Map<number, LiveStatus>();
  for (const [day, rows] of Array.from(byDay.entries())) {
    const overdue = rows.some(isOverdue);
    const due = rows.some(isDue);
    const anyDone = rows.some((r) => r.completed);
    const status: LiveStatus | null = overdue ? "overdue" : due ? "due" : anyDone ? "done" : null;
    if (status) liveByDay.set(day, status);
  }

  // Study-wide status summary — counts of active-subject visits currently overdue
  // or due (there is no single "today" column: subjects start on different dates).
  const overdueCount = visits.filter(isOverdue).length;
  const dueCount = visits.filter(isDue).length;

  return { config, phaseSpans: phaseSpansOf(config.days), liveByDay, overdueCount, dueCount };
}
