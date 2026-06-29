"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dataset, SubjectRow } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { eligibilityVerdict, assignArm, buildRandomizationResult, findRandForm } from "@/lib/randomization";

// Randomization action + read-only result block, injected at the top of the
// Randomization form (CA/BR) or the Pen Demographics form (PH, penMode).
export function RandomizationPanel({ dataset, update, subject, studyId, studyCode, role, ndaName, penMode = false }: {
  dataset: Dataset;
  update: (m: (d: Dataset) => void) => void;
  subject: SubjectRow;
  studyId: string;
  studyCode: string;
  role: Role;
  ndaName: string;
  penMode?: boolean;
}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealReason, setRevealReason] = useState("");

  const randomized = !!subject.randomization_arm;
  const verdict = eligibilityVerdict(dataset, studyId, subject.id);
  const eligible = verdict === "eligible" || verdict === "none";
  const canRandomize = role === "CRC" || role === "Admin";
  // The actual Randomization & Allocation CRF (the ?form= deep-link target).
  const randForm = findRandForm(dataset, studyId);
  const result = randomized ? buildRandomizationResult(dataset, studyCode, studyId, subject.id) : null;

  // CA reveal reuses the session unblindings log (drives the audit trail).
  const isPrivileged = role === "DM" || role === "Admin";
  const unblindRec = (dataset.unblindings ?? []).find((u) => u.subject_id === subject.id);
  const armRevealed = !!unblindRec && isPrivileged;

  function doRandomize() {
    const arm = subject.randomization_arm ?? assignArm(dataset, studyId);
    const nowIso = new Date().toISOString();
    update((d) => {
      const s = d.subjects.find((x) => x.id === subject.id);
      if (!s) return;
      s.randomization_arm = arm;
      s.randomized_at = nowIso;
      s.randomized_by = ndaName;
      // Mirror onto the Randomization form instance so form ↔ result stay aligned.
      const form = findRandForm(d, studyId);
      const inst = form ? d.formInstances.find((i) => i.subject_id === subject.id && i.form_id === form.id) : undefined;
      if (form && inst) {
        const fieldIdByCode = new Map(d.formFields.filter((f) => f.form_id === form.id).map((f) => [f.code, f.id]));
        const writeVal = (code: string, value: string) => {
          const fid = fieldIdByCode.get(code); if (!fid) return;
          const existing = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === fid);
          if (existing) existing.value = value;
          else d.fieldValues.push({ id: `fv-rand-${inst.id}-${code}`, form_instance_id: inst.id, form_field_id: fid, value });
        };
        writeVal("assigned_arm", arm); // F004 Randomization form uses code "assigned_arm"
        writeVal("randomization_date", nowIso.slice(0, 10));
        writeVal("randomized_by", ndaName);
      }
    });
    setConfirmOpen(false);
  }

  function doReveal() {
    if (!revealReason.trim()) return;
    update((d) => {
      (d.unblindings ??= []).push({
        id: `unblind-rand-${subject.id}-${(d.unblindings?.length ?? 0)}`,
        subject_id: subject.id, arm: subject.randomization_arm ?? "—",
        reason: revealReason.trim(), author_name: ndaName, author_role: role, created_at: new Date().toISOString(),
      });
    });
    setRevealOpen(false); setRevealReason("");
  }

  return (
    <div className="rand-block">
      {/* ── Action button (CA/BR; not in penMode) ── */}
      {!penMode && !randomized && (() => {
        const note = (text: string) => <div style={{ marginTop: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--amber-700)", display: "flex", alignItems: "center", gap: 4 }}><i className="ti ti-alert-triangle" style={{ fontSize: 12 }}></i>{text}</div>;
        if (!eligible) {
          const reason = verdict === "incomplete"
            ? "Complete all screening forms before randomization."
            : "Subject is ineligible — a PI override is required before randomization.";
          return <div><button className="rand-btn disabled" type="button" disabled title={reason}><i className="ti ti-lock"></i> Randomize subject — eligibility required</button>{note(reason)}</div>;
        }
        if (!canRandomize) {
          const reason = "Randomization is performed by the site coordinator (CRC).";
          return <div><button className="rand-btn disabled" type="button" disabled title={reason}><i className="ti ti-lock"></i> Randomize subject</button>{note(reason)}</div>;
        }
        // Eligible: deep-link to the Randomization & Allocation form (highlights it in
        // the sidebar + renders it) and open the confirm dialog.
        return <button className="rand-btn active" type="button" onClick={() => { if (randForm) router.push(`/study/${studyId}/data-entry/${subject.id}?form=${randForm.id}`); setConfirmOpen(true); }}>Randomize subject <i className="ti ti-arrow-right"></i></button>;
      })()}

      {/* ── Result block ── */}
      {result && (
        <div className="rand-result">
          <div className="rand-result-head"><i className="ti ti-circle-check"></i> Randomized</div>
          <dl className="rand-result-grid">
            <dt>Randomization number</dt><dd className="mono">{result.number}</dd>
            {studyCode === "CA-0801" && <><dt>Kit assigned</dt><dd className="mono">{result.kit}</dd></>}
            {studyCode === "BR-2502" && <>
              <dt>Treatment group</dt><dd>{result.group}</dd>
              <dt>Drug</dt><dd>{result.drug}</dd>
              <dt>Calculated dose</dt><dd>{result.dose ?? <span className="rand-warn">Weight required — complete Animal Demographics first</span>}</dd>
              <dt>Lot assigned</dt><dd className="mono">{result.lot}</dd>
              <dt>Block</dt><dd>{result.block}</dd>
            </>}
            {studyCode === "PH-2401" && <>
              <dt>Arm</dt><dd>{result.group}</dd>
              <dt>Additive</dt><dd>{result.additive}</dd>
              <dt>Feed batch</dt><dd className="mono">{result.feedBatch}</dd>
            </>}
            <dt>Date</dt><dd>{result.date}</dd>
            <dt>Assigned by</dt><dd>{result.by}</dd>
          </dl>

          {/* CA blinded arm + controlled reveal */}
          {studyCode === "CA-0801" && (
            <div className="rand-arm">
              <span className="rand-arm-label">Treatment arm:</span>
              {armRevealed
                ? <span className="rand-arm-revealed"><i className="ti ti-eye-exclamation"></i> {subject.randomization_arm} <span className="rand-sub">(unblinded by {unblindRec?.author_name})</span></span>
                : <>
                    <span className="rand-arm-blinded">●●●●●● BLINDED</span>
                    {isPrivileged
                      ? <button className="rand-reveal-btn" type="button" onClick={() => setRevealOpen(true)}>Reveal <i className="ti ti-arrow-right"></i></button>
                      : <span className="rand-sub">(Reveal requires DM authorization)</span>}
                  </>}
            </div>
          )}
        </div>
      )}

      {/* ── Confirm randomization modal ── */}
      {confirmOpen && (
        <div className="rand-modal-overlay" onClick={() => setConfirmOpen(false)}>
          <div className="rand-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rand-modal-title">Randomize {subject.subject_code}?</div>
            <div className="rand-modal-body">This cannot be undone. The subject will be assigned a treatment arm and a randomization number.</div>
            <div className="rand-modal-footer">
              <button className="rand-mbtn" type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="rand-mbtn primary" type="button" onClick={doRandomize}>Confirm randomization</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reveal (controlled unblinding) modal ── */}
      {revealOpen && (
        <div className="rand-modal-overlay" onClick={() => setRevealOpen(false)}>
          <div className="rand-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rand-modal-title">Reveal treatment arm — {subject.subject_code}</div>
            <div className="rand-modal-body">This is a deliberate, audited unblinding action. Provide a reason.</div>
            <input className="rand-modal-input" placeholder="Reason for unblinding…" value={revealReason} onChange={(e) => setRevealReason(e.target.value)} />
            <div className="rand-modal-footer">
              <button className="rand-mbtn" type="button" onClick={() => setRevealOpen(false)}>Cancel</button>
              <button className="rand-mbtn danger" type="button" onClick={doReveal} disabled={!revealReason.trim()}>Reveal arm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
