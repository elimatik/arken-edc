"use client";

// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — Step 1: the form picker (translated from 20-batch-entry.html's
// #view-pick). Radio "form cards"; the ones due today (from each animal's
// enrollment date + visit windows) surface first with a due count, then the
// remaining batch-eligible forms (no form appears twice). Clicking a card opens
// the entry grid directly — click = go, no separate button.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { batchFormsOpen, dueSuggestions, visitDayOf } from "@/lib/batch-entry";
import type { FormRow } from "@/lib/session-store/types";
import "./batch-entry.css";

export function BatchPicker({
  studyId,
  subjectIds,
  onPick,
  onExitOrigin,
}: {
  studyId: string;
  subjectIds: string[];
  onPick: (formId: string) => void;
  onExitOrigin: () => void;
}) {
  const { dataset } = useStudySession();
  const suggestions = useMemo(() => dueSuggestions(dataset, studyId, subjectIds), [dataset, studyId, subjectIds]);
  // Forms still needing entry somewhere — drops any form every non-withdrawn animal
  // has already completed (so a fully-done visit form disappears from the picker).
  const allForms = useMemo(() => batchFormsOpen(dataset, studyId), [dataset, studyId]);
  const fieldCount = (formId: string) => dataset.formFields.filter((f) => f.form_id === formId && f.field_type !== "calculated").length;

  // Remaining batch-eligible forms NOT already shown as a suggestion (no dupes).
  const suggestedIds = new Set(suggestions.map((s) => s.form.id));
  const otherForms = allForms.filter((f) => !suggestedIds.has(f.id));

  const card = (form: FormRow, meta: string, suggested: boolean) => (
    <button key={form.id} type="button" className="form-card" onClick={() => onPick(form.id)}>
      <div className="fc-icon"><i className={suggested ? "ti ti-calendar-check" : "ti ti-clipboard-list"}></i></div>
      <div className="fc-body">
        <div className="fc-name">{form.name}</div>
        <div className="fc-meta">{meta}</div>
      </div>
      <span className="fc-badge">Group entry</span>
      <i className="ti ti-chevron-right fc-go" aria-hidden="true"></i>
    </button>
  );

  return (
    <div className="be-screen">
      <div className="pick-header">
        <button className="pick-bc" type="button" onClick={onExitOrigin}>Animals</button>
        <div className="pick-title">Batch entry</div>
        <div className="pick-sub">Select a group-entry form to open its grid. Filters (site, barn, pen) are available on the entry grid.</div>
      </div>
      <div className="pick-body">
        {suggestions.length > 0 && (
          <div>
            <div className="pick-section-label">Suggested for today</div>
            <div className="form-cards">
              {suggestions.map(({ form, due }) => card(form, `Day ${visitDayOf(form)} · ${due} animal${due === 1 ? "" : "s"} due today`, true))}
            </div>
          </div>
        )}
        <div>
          <div className="pick-section-label">{suggestions.length > 0 ? "Other group-entry forms" : "Group-entry forms"}</div>
          {otherForms.length === 0 ? (
            <div className="pick-empty"><i className="ti ti-info-circle"></i> {suggestions.length > 0 ? "Every batch form is due today." : "No batch-eligible forms for this study."}</div>
          ) : (
            <div className="form-cards">
              {otherForms.map((form) => card(form, `${fieldCount(form.id)} fields · group entry`, false))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
