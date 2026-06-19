"use client";

// Shared lock guard. Any client surface with a study id can call useStudyLocked()
// to find out whether the study's database is locked, and disable EVERY mutating
// control (create / enroll / delete / withdraw / randomize / batch entry) on it —
// a single source of truth so no mutating surface gets missed.
import { useStudySession } from "@/lib/session-store/SessionStore";
import { isStudyLocked } from "@/lib/study-lock";

export const LOCK_TOOLTIP =
  "Database is locked — read-only pending statistical analysis. An administrator must unlock the study.";

export function useStudyLocked(studyId: string | undefined | null): boolean {
  const { dataset } = useStudySession();
  return !!studyId && isStudyLocked(dataset, studyId);
}
