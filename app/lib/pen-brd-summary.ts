// ════════════════════════════════════════════════════════════════════════════
// Pen BRD Summary — barn-scoped, read-only, auto-derived BRD-outcome rollup for
// BR-2502. BRD is pen-contagious, so the pen is the epidemiological unit even
// though the study enrols individual animals. One row per pen + a barn-level
// footer rolling the same metrics across all pens.
//
// Denominators: empty pen → counts 0, rates "—" (null). A pen with animals but no
// treatments → 0 % (not N/A). BRD-attributed deaths feed the mortality numerator;
// non-death withdrawals still count as enrolled animals (the slot was used).
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";

export interface PenBrdRow {
  penId: string;
  penCode: string;
  penName: string;
  n: number;                       // enrolled animals in the pen
  byArm: Record<string, number>;   // arm → count
  treated: number;                 // ≥1 BRD treatment
  retreated: number;               // has a re-treatment / relapse
  brdDeaths: number;               // BRD-attributed deaths
  chronic: number;                 // chronic / railer animals
  morbidityPct: number | null;     // treated ÷ N
  relapsePct: number | null;       // retreated ÷ treated
  mortalityPct: number | null;     // BRD deaths ÷ N
  fatalityPct: number | null;      // BRD deaths ÷ treated
  meanPeakDart: number | null;     // mean of each animal's peak DART
  meanAdg: number | null;          // mean average daily gain (kg/day)
  daysToFirstPull: number | null;  // mean (enrolment − placement) days
}

export interface PenBrdSummary {
  rows: PenBrdRow[];
  footer: PenBrdRow; // barn-level rollup (penCode "ALL")
}

const ENROLLED = new Set(["randomized", "enrolled", "active", "completed", "withdrawn"]);
const DEAD = new Set(["died", "euthanized", "dead"]);

const dayDiff = (a: string, b: string): number | null => {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return null;
  return Math.round((t2 - t1) / 86400000);
};
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (num: number, denom: number): number | null => (denom > 0 ? (num / denom) * 100 : null);

// Severity band for a rate metric (morbidity / mortality / case-fatality).
export type BrdSeverity = "none" | "good" | "warn" | "bad";
export function brdSeverity(p: number | null): BrdSeverity {
  if (p == null) return "none";
  if (p < 10) return "good";
  if (p < 25) return "warn";
  return "bad";
}

// All non-empty values an animal carries for a given field code, across every
// instance — lets the summary read animal-level data without per-form plumbing.
function valuesBySubject(dataset: Dataset): Map<string, Map<string, string[]>> {
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const out = new Map<string, Map<string, string[]>>();
  for (const fv of dataset.fieldValues) {
    if (fv.value == null || fv.value === "") continue;
    const inst = instById.get(fv.form_instance_id);
    const sid = inst?.subject_id;
    if (!sid) continue;
    const field = fieldById.get(fv.form_field_id);
    if (!field) continue;
    let m = out.get(sid);
    if (!m) { m = new Map(); out.set(sid, m); }
    const arr = m.get(field.code) ?? [];
    arr.push(fv.value);
    m.set(field.code, arr);
  }
  return out;
}

interface AnimalBrd { arm: string; treated: boolean; retreated: boolean; dead: boolean; chronic: boolean; peakDart: number | null; adg: number | null; daysToPull: number | null }

function deriveAnimal(status: string, arm: string | null | undefined, v: Map<string, string[]> | undefined): AnimalBrd {
  const vals = v ?? new Map<string, string[]>();
  const first = (code: string) => vals.get(code)?.[0];
  const treated = (vals.get("test_article")?.length ?? 0) > 0;
  const retreatFlag = (vals.get("retreatment_flag") ?? []).includes("Yes");
  const needsRetreat = (vals.get("requires_retreatment") ?? []).includes("Yes");
  const retreated = retreatFlag || needsRetreat;
  const dartVals = [...(vals.get("clinical_illness_score") ?? []), ...(vals.get("dart_score") ?? [])]
    .map(Number).filter((n) => !Number.isNaN(n));
  const peakDart = dartVals.length ? Math.max(...dartVals) : null;
  // ADG = (final − arrival weight) ÷ days; BR vitals don't record serial weights,
  // so this stays null unless a later weight is present.
  const arrivalW = Number(first("arrival_weight"));
  const dosingW = Number(first("body_weight_dosing"));
  const arrivalDate = first("arrival_date");
  const enrollDate = first("enrollment_date");
  let adg: number | null = null;
  if (!Number.isNaN(arrivalW) && !Number.isNaN(dosingW) && arrivalDate && enrollDate) {
    const d = dayDiff(arrivalDate, enrollDate);
    if (d && d > 0 && dosingW !== arrivalW) adg = (dosingW - arrivalW) / d;
  }
  const daysToPull = arrivalDate && enrollDate ? dayDiff(arrivalDate, enrollDate) : null;
  const dead = DEAD.has(status);
  return { arm: arm || "—", treated, retreated, dead, chronic: retreated, peakDart, adg, daysToPull };
}

function aggregate(penId: string, penCode: string, penName: string, animals: AnimalBrd[]): PenBrdRow {
  const n = animals.length;
  const byArm: Record<string, number> = {};
  for (const a of animals) byArm[a.arm] = (byArm[a.arm] ?? 0) + 1;
  const treated = animals.filter((a) => a.treated).length;
  const retreated = animals.filter((a) => a.retreated).length;
  const brdDeaths = animals.filter((a) => a.dead).length;
  const chronic = animals.filter((a) => a.chronic).length;
  // A pen with animals but no treatments reports 0 % (not N/A) for treated-denominated rates.
  const relapsePct = treated > 0 ? pct(retreated, treated) : n > 0 ? 0 : null;
  const fatalityPct = treated > 0 ? pct(brdDeaths, treated) : n > 0 ? 0 : null;
  return {
    penId, penCode, penName, n, byArm, treated, retreated, brdDeaths, chronic,
    morbidityPct: pct(treated, n),
    relapsePct,
    mortalityPct: pct(brdDeaths, n),
    fatalityPct,
    meanPeakDart: mean(animals.map((a) => a.peakDart).filter((x): x is number => x != null)),
    meanAdg: mean(animals.map((a) => a.adg).filter((x): x is number => x != null)),
    daysToFirstPull: mean(animals.map((a) => a.daysToPull).filter((x): x is number => x != null)),
  };
}

export function buildPenBrdSummary(dataset: Dataset, barnId: string): PenBrdSummary {
  const vals = valuesBySubject(dataset);
  const pens = dataset.pens.filter((p) => p.barn_id === barnId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const allAnimals: AnimalBrd[] = [];
  const rows = pens.map((pen) => {
    const animals = dataset.subjects
      .filter((s) => s.pen_id === pen.id && ENROLLED.has(s.status))
      .map((s) => deriveAnimal(s.status, s.randomization_arm, vals.get(s.id)));
    allAnimals.push(...animals);
    return aggregate(pen.id, pen.code.toUpperCase(), pen.name, animals);
  });
  const footer = aggregate("ALL", "ALL", "All pens", allAnimals);
  return { rows, footer };
}
