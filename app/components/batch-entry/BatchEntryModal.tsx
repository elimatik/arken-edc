"use client";

// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — Step 1: smart form-suggestion modal. Looks at each animal's
// enrollment date + which visit days are due today and groups them by form
// ("Vital Signs — Day 3 · 8 animals due"); below, any batch_eligible form can be
// picked manually. Choosing one routes to the full-screen batch grid.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { batchForms, dueSuggestions, visitDayOf } from "@/lib/batch-entry";
import "./batch-entry.css";

export function BatchEntryModal({
  studyId,
  subjectIds,
  loc,
  from,
  onClose,
}: {
  studyId: string;
  subjectIds: string[]; // candidate animals (all study animals, or one location's)
  loc?: string; // optional location id, threaded to the grid as a pre-filter
  from: "animals" | "data-entry";
  onClose: () => void;
}) {
  const router = useRouter();
  const { dataset } = useStudySession();
  const [selected, setSelected] = useState<string>("");

  const suggestions = useMemo(() => dueSuggestions(dataset, studyId, subjectIds), [dataset, studyId, subjectIds]);
  const allForms = useMemo(() => batchForms(dataset, studyId), [dataset, studyId]);
  // Default the manual radio to the first suggested form (else the first form).
  const firstId = suggestions[0]?.form.id ?? allForms[0]?.id ?? "";
  const pick = selected || firstId;

  function start(formId: string) {
    const q = new URLSearchParams({ form: formId, from });
    if (loc) q.set("loc", loc);
    router.push(`/study/${studyId}/batch-entry?${q.toString()}`);
  }

  return (
    <div className="be-modal-overlay" onClick={onClose}>
      <div className="be-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="be-modal-head">
          <div>
            <div className="be-modal-title">Batch Entry</div>
            <div className="be-modal-sub">Select a form to fill for multiple animals at once</div>
          </div>
          <button className="be-modal-close" type="button" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>

        <div className="be-modal-body">
          <div className="be-section-label">Suggested for today</div>
          {suggestions.length === 0 ? (
            <div className="be-empty"><i className="ti ti-calendar-off"></i> No visits due today</div>
          ) : (
            <div className="be-sugg-list">
              {suggestions.map(({ form, due }) => (
                <div className="be-sugg-card" key={form.id}>
                  <div className="be-sugg-info">
                    <div className="be-sugg-name">{form.name}</div>
                    <div className="be-sugg-meta">
                      <span className="be-sugg-day">Day {visitDayOf(form)}</span>
                      <span className="be-dot">·</span>
                      <span>{due} animal{due === 1 ? "" : "s"} due</span>
                    </div>
                  </div>
                  <button className="btn-primary be-start-btn" type="button" onClick={() => start(form.id)}>Start batch</button>
                </div>
              ))}
            </div>
          )}

          <div className="be-section-label be-section-label-2">Or select a different form</div>
          <div className="be-form-list">
            {allForms.map((f) => (
              <label className={`be-form-row${pick === f.id ? " active" : ""}`} key={f.id}>
                <input type="radio" name="be-form" checked={pick === f.id} onChange={() => setSelected(f.id)} />
                <span className="be-form-name">{f.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="be-modal-foot">
          <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-secondary" type="button" disabled={!pick} onClick={() => start(pick)}>Start with selected</button>
        </div>
      </div>
    </div>
  );
}
