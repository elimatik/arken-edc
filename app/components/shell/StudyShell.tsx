"use client";

import Link from "next/link";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { AppShell } from "./AppShell";

// Resolves the current study from the session store (hydrated from the seed once
// per tab) and renders the app shell. No Supabase calls — everything comes from
// session state, so visitor edits persist in session.
export function StudyShell({ studyId, children }: { studyId: string; children: React.ReactNode }) {
  const { dataset, ready } = useStudySession();

  if (!ready) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
        Loading study…
      </div>
    );
  }

  const study = dataset.studies.find((s) => s.id === studyId);
  if (!study) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", gap: "var(--space-3)", alignItems: "center", justifyContent: "center", color: "var(--color-text-tertiary)" }}>
        <div>Study not found in this session.</div>
        <Link href="/studies" style={{ color: "var(--color-link)", textDecoration: "underline" }}>
          Back to studies
        </Link>
      </div>
    );
  }

  const sites = dataset.sites
    .filter((s) => s.study_id === studyId)
    .map((s) => ({ id: s.id, code: s.code, name: s.name }));

  return (
    <AppShell study={{ id: study.id, code: study.code, name: study.name }} sites={sites}>
      {children}
    </AppShell>
  );
}
