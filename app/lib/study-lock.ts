// ════════════════════════════════════════════════════════════════════════════
// Database Lock — session-only full-study read-only lock taken prior to
// statistical analysis. Each lock/unlock action pushes a StudyLockRow; the
// latest record for a study determines its current state. Pure helpers shared by
// the Admin dashboard, study selector, app shell banner, audit trail, and the
// subject record (which derives form read-only state from it).
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, StudyLockRow } from "@/lib/session-store/types";

// Most recent lock record for a study (lock OR unlock), or undefined if never locked.
export function latestStudyLock(dataset: Dataset, studyId: string): StudyLockRow | undefined {
  return dataset.studyLocks
    .filter((l) => l.study_id === studyId)
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .at(-1);
}

// Is the study's database currently locked?
export function isStudyLocked(dataset: Dataset, studyId: string): boolean {
  return !!latestStudyLock(dataset, studyId)?.locked;
}

export const LOCK_REASONS = [
  "Pre-statistical analysis",
  "Regulatory submission",
  "Audit preparation",
  "Other",
] as const;
