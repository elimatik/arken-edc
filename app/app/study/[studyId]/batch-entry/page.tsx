"use client";

import { useMemo, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useStudyLocked } from "@/lib/use-study-locked";
import { BatchPicker } from "@/components/batch-entry/BatchPicker";
import { BatchEntryGrid } from "@/components/batch-entry/BatchEntryGrid";

export default function BatchEntryPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const sp = useSearchParams();
  const loc = sp.get("loc") ?? undefined; // optional location pre-filter (site / barn / pen id)
  const from = sp.get("from") ?? "animals";
  const { dataset, ready } = useStudySession();
  const locked = useStudyLocked(studyId);

  const [formId, setFormId] = useState<string | null>(null);

  // Candidate animals — the study's subjects, optionally scoped to one location.
  // Withdrawn animals are excluded from batch entry entirely (rows + due counts).
  const subjectIds = useMemo(() => {
    if (!ready) return [];
    let list = dataset.subjects.filter((s) => s.study_id === studyId && s.status !== "withdrawn");
    if (loc) list = list.filter((s) => s.site_id === loc || s.barn_id === loc || s.pen_id === loc);
    return list.map((s) => s.id);
  }, [dataset.subjects, studyId, loc, ready]);

  function exitOrigin() {
    router.push(from === "data-entry" ? `/study/${studyId}/data-entry` : `/study/${studyId}/animals`);
  }

  if (!ready) {
    return <div className="be-screen"><div className="grid-empty"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  }
  // Database lock freezes batch entry entirely — block both the picker (opening) and
  // the grid (saving). Mirroring data entry being read-only study-wide.
  if (locked) {
    return (
      <div className="be-screen">
        <div className="grid-empty">
          <i className="ti ti-lock"></i>
          <div>Database is locked — batch entry is unavailable pending statistical analysis.</div>
          <button className="btn-secondary" type="button" onClick={exitOrigin} style={{ marginTop: "var(--space-3)" }}>Back</button>
        </div>
      </div>
    );
  }
  if (!formId) {
    return <BatchPicker studyId={studyId} subjectIds={subjectIds} onPick={setFormId} onExitOrigin={exitOrigin} />;
  }
  return (
    <BatchEntryGrid
      studyId={studyId}
      formId={formId}
      subjectIds={subjectIds}
      onExitOrigin={exitOrigin}
      onBackToPick={() => setFormId(null)}
    />
  );
}
