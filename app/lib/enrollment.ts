// ════════════════════════════════════════════════════════════════════════════
// Per-site enrolment cap. Enrolled = randomized animals (a slot was consumed):
// screen failures don't count; an animal withdrawn AFTER enrolment still counts.
// Over the target is a protocol deviation — surfaced as a chip + an enrol-time
// acknowledgment-gated warning.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";

// Statuses that mean the animal was enrolled (took a slot). "screening" (incl.
// screen failures + not-yet-randomized) does NOT count.
const ENROLLED_STATUSES = new Set(["randomized", "enrolled", "active", "completed", "withdrawn"]);

export const ENROLL_TOOLTIP =
  "Enrolled = randomized animals. Screen failures are excluded; an animal withdrawn after enrolment still counts (the slot is consumed).";

export function siteEnrolledCount(dataset: Dataset, siteId: string): number {
  return dataset.subjects.filter((s) => s.site_id === siteId && ENROLLED_STATUSES.has(s.status)).length;
}

export type CapLevel = "none" | "under" | "near" | "at" | "over";

// none → no target set; under → < 90%; near → ≥ 90% but under cap; at → == cap;
// over → > cap. Chip: green (under), amber (near/at), red (over).
export function capLevel(enrolled: number, target: number | null | undefined): CapLevel {
  if (!target || target <= 0) return "none";
  if (enrolled > target) return "over";
  if (enrolled === target) return "at";
  if (enrolled / target >= 0.9) return "near";
  return "under";
}

// Chip colour class (shared `cap-*` styles).
export function capChipClass(level: CapLevel): string {
  return level === "over" ? "cap-over" : level === "at" || level === "near" ? "cap-near" : "cap-under";
}

// The enrol-time warning fires once the site is AT or OVER its target.
export function capWarns(level: CapLevel): boolean {
  return level === "at" || level === "over";
}
