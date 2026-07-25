"use client";

// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — Step 2: the entry grid (translated from 20-batch-entry.html's
// #view-grid). One row per animal, one column per field, inline editing. NO
// checkboxes — every visible animal is included. Each cell LIVE-PERSISTS to that
// animal's own form instance (so the Subject Record shows the same data).
//   • Edit checks fire per cell (amber cell + orange EC- indicator, non-blocking)
//     — a validation indicator only; queries are raised on the Subject Record.
//   • Change reasons (Δ): editing a saved value shows the dashed-red Δ button →
//     the 380px Δ slide-in (old→new, reason, history). DM approval is on the
//     Subject Record only.
//   • A shared "batch header field" (Visit date) sits above the rows and auto-
//     fills every animal that doesn't already have a saved visit date.
// No Remarks / Queries / SDV in batch — those live on the individual record.
// ════════════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { evaluateField } from "@/lib/forms/validation";
import { visitDayOf } from "@/lib/batch-entry";
import type { Dataset, FormFieldRow, SubjectRow } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./batch-entry.css";

const newId = () => crypto.randomUUID();
const RFC_REASONS = ["Data correction", "Transcription error", "Updated source document", "Other"];
// Fields rendered as a shared "batch header" above the rows (applied to every
// animal) rather than as a per-row column. Required header fields gate row entry;
// notes/comments are never header fields, so they never gate. "Site" is per-animal
// (a row filter), not a shared header field, so it isn't gated here.
const BATCH_HEADER_CODES = ["visit_date", "administered_by"];
const parseMulti = (v: string): string[] => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return v ? [v] : []; } };

type Target = { sid: string; field: FormFieldRow };

export function BatchEntryGrid({
  studyId,
  formId,
  subjectIds,
  onExitOrigin,
  onBackToPick,
}: {
  studyId: string;
  formId: string;
  subjectIds: string[];
  onExitOrigin: () => void;
  onBackToPick: () => void;
}) {
  const { dataset, update } = useStudySession();
  const { activeRole } = useShell();
  const ndaName = useNdaName();
  const species = dataset.studies.find((s) => s.id === studyId)?.species ?? "cattle";
  const form = dataset.forms.find((f) => f.id === formId);

  const fields = dataset.formFields.filter((f) => f.form_id === formId).slice().sort((a, b) => a.sequence - b.sequence);
  const headerFields = fields.filter((f) => f.field_type !== "calculated" && BATCH_HEADER_CODES.includes(f.code));
  const cols = fields.filter((f) => f.field_type !== "calculated" && !BATCH_HEADER_CODES.includes(f.code));

  const subjects = (() => {
    const set = new Set(subjectIds);
    return dataset.subjects.filter((s) => set.has(s.id)).slice().sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  })();

  // ── State ───────────────────────────────────────────────────────────────────
  const [delta, setDelta] = useState<Target | null>(null);
  const [recordReasons, setRecordReasons] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ sid: string; fieldId: string } | null>(null);
  const editStartRef = useRef<{ sid: string; fieldId: string; value: string } | null>(null);
  const [headerVals, setHeaderVals] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [siteF, setSiteF] = useState("");
  const [barnF, setBarnF] = useState("");
  const [penF, setPenF] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkOther, setBulkOther] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  // Nothing to save on load; any field change flips this true, Submit-all resets it.
  const [isDirty, setIsDirty] = useState(false);

  // Header gate — every required batch-header field must be filled before rows are
  // interactive. headerReady drives the gate; isDirty tells apart a fresh load
  // (disable + hint) from a header cleared after the user has been working
  // (keep interactive + amber "re-validate" warning).
  const headerReady = headerFields.every((f) => (headerVals[f.id] ?? "").trim() !== "");
  const rowsDisabled = !headerReady && !isDirty;
  const headerCleared = !headerReady && isDirty;

  // ── Store helpers (keyed by subject → that animal's own form instance) ───────
  const instForSubject = (sid: string) => dataset.formInstances.find((i) => i.subject_id === sid && i.form_id === formId);
  const ensureInst = (d: Dataset, sid: string) => {
    let inst = d.formInstances.find((i) => i.subject_id === sid && i.form_id === formId);
    if (!inst) { inst = { id: newId(), form_id: formId, subject_id: sid, barn_id: null, site_id: null, status: "in_work" }; d.formInstances.push(inst); }
    else if (inst.status === "empty") inst.status = "in_work";
    return inst;
  };
  const fvFor = (sid: string, fieldId: string) => { const inst = instForSubject(sid); return inst ? dataset.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === fieldId) : undefined; };
  const ageOf = (sid: string): number | null => {
    const fid = new Set(dataset.formFields.filter((f) => f.code === "age_months").map((f) => f.id));
    const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === sid).map((i) => i.id));
    const v = dataset.fieldValues.find((x) => instIds.has(x.form_instance_id) && fid.has(x.form_field_id) && x.value);
    const n = v ? Number(v.value) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const editCheckFor = (fvId?: string) => (fvId ? dataset.editChecks.find((e) => e.field_value_id === fvId && e.status === "open") : undefined);
  const deltaStateFor = (sid: string, fieldId: string, fvId?: string): "pending" | "responded" | "approved" | null => {
    if (editing?.sid === sid && editing?.fieldId === fieldId) return null;
    const recs = fvId ? dataset.deltaRecords.filter((r) => r.field_value_id === fvId) : [];
    if (recs.length === 0) return null;
    if (recs.some((r) => r.status === "pending")) return "pending";
    return recs.every((r) => r.status === "approved") ? "approved" : "responded";
  };

  // ── Writes ───────────────────────────────────────────────────────────────────
  function recordTransition(d: Dataset, fvId: string, prev: string, next: string) {
    if (prev === "" || prev === next) return;
    d.deltaRecords.push({ id: newId(), field_value_id: fvId, old_value: prev, new_value: next, reason: "", author_name: ndaName, author_role: activeRole, created_at: new Date().toISOString(), status: "pending" });
  }
  function evalEC(d: Dataset, inst: { id: string }, fv: { id: string }, field: FormFieldRow, value: string, sid: string) {
    const check = evaluateField(field, value, species, d.speciesRanges, ageOf(sid));
    const ec = d.editChecks.find((e) => e.field_value_id === fv.id && e.status === "open");
    if (check) { if (!ec) d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() }); else ec.message = check.message; }
    else if (ec) ec.status = "resolved";
  }
  function writeValue(d: Dataset, sid: string, field: FormFieldRow, value: string, recordChange: boolean, skipCheck = false) {
    const inst = ensureInst(d, sid);
    let fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id);
    const prev = fv?.value ?? "";
    if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value }; d.fieldValues.push(fv); }
    else fv.value = value;
    if (recordChange) recordTransition(d, fv.id, prev, value);
    if (!skipCheck) evalEC(d, inst, fv, field, value, sid);
  }
  function setFieldValue(sid: string, field: FormFieldRow, value: string, recordChange = false, skipCheck = false) {
    setIsDirty(true);
    update((d: Dataset) => writeValue(d, sid, field, value, recordChange, skipCheck));
  }
  function snapshotTextFocus(sid: string, field: FormFieldRow) { editStartRef.current = { sid, fieldId: field.id, value: fvFor(sid, field.id)?.value ?? "" }; }
  function recordTextEdit(sid: string, field: FormFieldRow) {
    const snap = editStartRef.current; editStartRef.current = null;
    if (!snap || snap.sid !== sid || snap.fieldId !== field.id) return;
    const fv = fvFor(sid, field.id); if (!fv) return;
    const cur = fv.value ?? ""; if (cur === snap.value) return;
    update((d: Dataset) => { const f = d.fieldValues.find((v) => v.id === fv.id); if (f) recordTransition(d, f.id, snap.value, cur); });
  }
  // Blur-time edit-check evaluation for free-text / numeric cells (fires on blur only).
  function evalEditCheck(sid: string, field: FormFieldRow) {
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.subject_id === sid && i.form_id === formId); if (!inst) return;
      const fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id); if (!fv) return;
      evalEC(d, inst, fv, field, fv.value ?? "", sid);
    });
  }
  // Shared batch-header field (Visit date) — auto-fills every animal that does NOT
  // already have a saved value for it (never overwrites a saved date).
  function setHeaderField(field: FormFieldRow, value: string) {
    setHeaderVals((p) => ({ ...p, [field.id]: value }));
    setIsDirty(true);
    if (value === "") return;
    update((d: Dataset) => {
      for (const s of subjects) {
        const inst = d.formInstances.find((i) => i.subject_id === s.id && i.form_id === formId);
        const existing = inst ? d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id) : undefined;
        if (existing && (existing.value ?? "") !== "") continue; // already has a saved date
        writeValue(d, s.id, field, value, false);
      }
    });
  }

  function submitReasonForRecord(recordId: string) {
    const text = (recordReasons[recordId] ?? "").trim(); if (!text) return;
    update((d: Dataset) => { const r = d.deltaRecords.find((x) => x.id === recordId); if (r && r.status === "pending") { r.reason = text; r.author_name = ndaName; r.author_role = activeRole; r.status = "responded"; } });
    setRecordReasons((p) => { const n = { ...p }; delete n[recordId]; return n; });
  }
  function approveDelta(recordId: string) { if (activeRole !== "DM") return; update((d: Dataset) => { const r = d.deltaRecords.find((x) => x.id === recordId); if (r) { r.status = "approved"; r.approved_by = ndaName; r.approved_role = activeRole; r.approved_at = new Date().toISOString(); } }); }

  // ── Derived (Δ panel) ────────────────────────────────────────────────────────
  const deltaFv = delta ? fvFor(delta.sid, delta.field.id) : undefined;
  const deltaHistory = deltaFv ? dataset.deltaRecords.filter((r) => r.field_value_id === deltaFv.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : [];
  const deltaOld = deltaHistory[deltaHistory.length - 1]?.old_value ?? "";
  const deltaNew = deltaHistory[deltaHistory.length - 1]?.new_value ?? (deltaFv?.value ?? "");

  // ── Filters / summary ────────────────────────────────────────────────────────
  const sites = dataset.sites.filter((s) => s.study_id === studyId);
  const barns = dataset.barns.filter((b) => sites.some((s) => s.id === b.site_id) && (!siteF || b.site_id === siteF));
  const pens = dataset.pens.filter((p) => barns.some((b) => b.id === p.barn_id) && (!barnF || p.barn_id === barnF));
  const penName = (s: SubjectRow) => dataset.pens.find((p) => p.id === s.pen_id)?.name ?? dataset.barns.find((b) => b.id === s.barn_id)?.name ?? "—";
  const rowMeta = (s: SubjectRow) => { const age = ageOf(s.id); return [s.randomization_arm, age != null ? `${age <= 6 ? "calf" : "adult"} ${age}mo` : null, penName(s)].filter(Boolean).join(" · "); };
  const visible = subjects.filter((s) => {
    if (search && !s.subject_code.toLowerCase().includes(search.toLowerCase())) return false;
    if (siteF && s.site_id !== siteF) return false;
    if (barnF && s.barn_id !== barnF) return false;
    if (penF && s.pen_id !== penF) return false;
    return true;
  });

  const rowHasData = (sid: string) => cols.some((f) => (fvFor(sid, f.id)?.value ?? "") !== "");
  const rowAlerts = (sid: string) => cols.filter((f) => !!editCheckFor(fvFor(sid, f.id)?.id)).length;
  const pendingDeltas = subjects.flatMap((s) => cols.map((f) => deltaStateFor(s.id, f.id, fvFor(s.id, f.id)?.id) === "pending")).filter(Boolean).length;
  let dataN = 0, alertN = 0;
  for (const s of visible) { if (rowHasData(s.id)) dataN += 1; if (rowAlerts(s.id) > 0) alertN += 1; }

  const bulkText = bulkReason === "Other" ? bulkOther.trim() : bulkReason;
  function applyBulkReason() {
    if (!bulkText) return;
    const ids = new Set(subjects.map((s) => instForSubject(s.id)?.id).filter(Boolean) as string[]);
    update((d: Dataset) => {
      for (const r of d.deltaRecords) {
        if (r.status !== "pending") continue;
        const fv = d.fieldValues.find((v) => v.id === r.field_value_id);
        if (fv && ids.has(fv.form_instance_id)) { r.reason = bulkText; r.author_name = ndaName; r.author_role = activeRole; r.status = "responded"; }
      }
    });
    setBulkReason(""); setBulkOther("");
  }
  function submitAll() {
    setToast(`${dataN} animal${dataN === 1 ? "" : "s"} with data · ${alertN} with alerts · ${pendingDeltas} pending change reason${pendingDeltas === 1 ? "" : "s"}`);
    setIsDirty(false); // nothing new to save until the next change
  }

  if (!form) return <div className="be-screen"><div className="grid-empty">Form not found.</div></div>;
  const day = visitDayOf(form);

  // ── Cell control (amber = edit check; Δ shown via the button, not the border) ──
  function renderControl(sid: string, field: FormFieldRow, value: string, warn: boolean) {
    const commit = (v: string) => setFieldValue(sid, field, v, true);
    // Text/number: write per keystroke (skip the check), evaluate the edit check on BLUR.
    const typeChange = (v: string) => setFieldValue(sid, field, v, false, true);
    const onFocus = () => { setEditing({ sid, fieldId: field.id }); snapshotTextFocus(sid, field); };
    const onBlur = () => { setEditing(null); recordTextEdit(sid, field); evalEditCheck(sid, field); };
    const t = field.field_type;
    const cls = warn ? " warn" : "";
    if (t === "radio") {
      const opts = field.options?.length ? field.options : ["Yes", "No"];
      return <div className={`batch-yn${cls}`}>{opts.map((o) => <button key={o} type="button" className={`batch-yn-btn${value === o ? " active" : ""}`} onClick={() => commit(value === o ? "" : o)}>{o}</button>)}</div>;
    }
    if (t === "select" || t === "multiselect") {
      const cur = t === "multiselect" ? (parseMulti(value)[0] ?? "") : value;
      return <select className={`batch-select${cls}`} value={cur} onChange={(e) => commit(t === "multiselect" ? (e.target.value ? JSON.stringify([e.target.value]) : "") : e.target.value)}><option value="">—</option>{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    }
    if (t === "date" || t === "datetime") return <input type="date" className={`batch-input sans${cls}`} value={value} onChange={(e) => commit(e.target.value)} />;
    const numeric = t === "number" || t === "integer";
    return <input type="text" inputMode={numeric ? "decimal" : undefined} autoComplete="off" className={`batch-input${numeric ? "" : " sans"}${cls}`} value={value} onFocus={onFocus} onBlur={onBlur} onChange={(e) => typeChange(e.target.value)} />;
  }

  return (
    <div className="be-screen">
      {/* Header */}
      <div className="grid-header">
        <div>
          <div className="grid-bc">
            <button className="bc-link" type="button" onClick={onExitOrigin}>Animals</button>
            <span className="bc-sep">›</span>
            <button className="bc-link" type="button" onClick={onBackToPick}>Batch Entry</button>
          </div>
          <div className="grid-title">{form.name}</div>
        </div>
        <div className="grid-header-right">
          <button className="btn-secondary" type="button" onClick={onExitOrigin}><i className="ti ti-arrow-left"></i> Exit batch</button>
          <button className="btn-primary" type="button" disabled={!isDirty || !headerReady} onClick={submitAll} title={!headerReady ? "Complete the batch header fields first" : isDirty ? "" : "No changes to save"}><i className="ti ti-check"></i> Submit all</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="grid-toolbar">
        <div className="search-box"><i className="ti ti-search"></i><input type="search" placeholder="Search animal ID…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="filter-select" value={siteF} onChange={(e) => { setSiteF(e.target.value); setBarnF(""); setPenF(""); }}><option value="">All sites</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select className="filter-select" value={barnF} onChange={(e) => { setBarnF(e.target.value); setPenF(""); }}><option value="">All barns</option>{barns.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select className="filter-select" value={penF} onChange={(e) => setPenF(e.target.value)}><option value="">All pens</option>{pens.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <span className="tb-count">{visible.length} animal{visible.length === 1 ? "" : "s"}{day != null ? ` · Day ${day}` : ""}</span>
      </div>

      {/* Shared batch-header fields — a section header above a row of compact fields,
          each with its own label above its input. Applied to every animal in the batch. */}
      {headerFields.length > 0 && (
        <div className={`batch-header-bar${!headerReady ? " batch-header-bar--locked" : ""}`}>
          <div className="bhb-label"><i className="ti ti-link"></i> {headerFields.map((f) => f.label).join(" · ")} — applied to all rows</div>
          <div className="bhb-fields">
            {headerFields.map((f) => (
              <div className="bhb-field" key={f.id}>
                <label className="bhb-field-label">{f.label}{f.is_required ? <span className="req"> *</span> : ""}</label>
                <input type={f.field_type === "date" || f.field_type === "datetime" ? "date" : "text"} className="bhb-input" value={headerVals[f.id] ?? ""} onChange={(e) => setHeaderField(f, e.target.value)} />
                {(headerVals[f.id] ?? "") !== "" && <span className="bhb-note"><i className="ti ti-circles-relation"></i> Auto-filled where empty</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header-completion gate — hint (fresh) or amber re-validate warning (cleared). */}
      {rowsDisabled && (
        <div className="batch-gate-hint"><i className="ti ti-info-circle"></i> Complete the batch header fields above before entering subject data.</div>
      )}
      {headerCleared && (
        <div className="batch-gate-warn"><i className="ti ti-alert-triangle"></i> Changing batch header fields will re-validate all rows. Existing data is preserved but should be reviewed.</div>
      )}

      {/* Grid */}
      <div className="grid-wrap">
        <table className={`batch-table${rowsDisabled ? " batch-rows-disabled" : ""}`}>
          <thead>
            <tr>
              <th className="th-subject"><div className="th-subject-inner"><span className="th-hdr-label">Animal</span></div></th>
              {cols.map((f) => (
                <th className="th-field" key={f.id}><div className="field-col-header"><div className="field-col-name">{f.label}{f.is_required ? <span className="req"> *</span> : ""}</div><div className="field-col-unit">{f.unit || ""}</div></div></th>
              ))}
              <th className="th-status"><div className="th-status-inner">Status</div></th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={cols.length + 2}><div className="grid-empty">No animals match the current filters.</div></td></tr>
            ) : visible.map((s) => {
              const alerts = rowAlerts(s.id);
              const hasData = rowHasData(s.id);
              return (
                <tr key={s.id}>
                  <td className="td-subject"><div className="td-subject-inner"><div className="subj-id">{s.subject_code}</div><div className="subj-meta">{rowMeta(s)}</div></div></td>
                  {cols.map((f) => {
                    const fv = fvFor(s.id, f.id);
                    const value = fv?.value ?? "";
                    const ec = editCheckFor(fv?.id);
                    const dState = deltaStateFor(s.id, f.id, fv?.id);
                    return (
                      <td className="batch-cell" key={f.id}>
                        <div className="be-cell-row">
                          {renderControl(s.id, f, value, !!ec)}
                          {dState && <button className={`delta-btn ${dState}`} title={dState === "approved" ? "Change approved by DM (on the subject record)" : dState === "responded" ? "Change reason submitted — awaiting DM review" : "Change reason required"} onClick={() => setDelta({ sid: s.id, field: f })} type="button">Δ</button>}
                          {ec && <span className="ec-ind" title="Review this value on the individual subject record" aria-label="Edit check — review this value on the individual subject record"><i className="ti ti-alert-circle"></i></span>}
                        </div>
                        <span className={`val-hint${ec ? " warn" : ""}`}>{ec ? ec.message.replace(/—.*/, "").trim() : ""}</span>
                      </td>
                    );
                  })}
                  {/* Error (any open edit check) takes priority over Saved; empty rows show nothing. */}
                  <td className="td-status">
                    {alerts > 0 ? <span className="row-badge rb-error"><i className="ti ti-alert-circle"></i> Error</span>
                      : hasData ? <span className="row-badge rb-saved"><i className="ti ti-check"></i> Saved</span>
                      : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reason-for-change summary bar (shortcut — the per-cell Δ is the primary path) */}
      <div className={`rfc-bar${pendingDeltas > 0 ? " visible" : ""}`}>
        <div className="rfc-bar-label"><i className="ti ti-pencil"></i> {pendingDeltas} field{pendingDeltas === 1 ? "" : "s"} {pendingDeltas === 1 ? "has" : "have"} pending change{pendingDeltas === 1 ? "" : "s"}</div>
        <select className="rfc-bar-select" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)}>
          <option value="">Set one reason for all pending changes…</option>
          {RFC_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {bulkReason === "Other" && <input className="rfc-bar-text" placeholder="Specify reason…" value={bulkOther} onChange={(e) => setBulkOther(e.target.value)} />}
        <button className="btn-secondary" type="button" disabled={!bulkText} onClick={applyBulkReason}>Apply to all</button>
        <span className="rfc-bar-note">Or click the dashed-red Δ on a cell to give that change its own reason.</span>
      </div>

      {/* Summary */}
      <div className="grid-summary">
        <span>Showing: <span className="sv">{visible.length} animals</span></span>
        <span>With data: <span className="sv ok">{dataN}</span></span>
        <span>With alerts: <span className="sv warn">{alertN}</span></span>
        <span>Pending Δ: <span className="sv">{pendingDeltas}</span></span>
        <span style={{ marginLeft: "auto" }}>{form.name}</span>
      </div>

      {/* Change-reason (Δ) slide-in panel (same as the Subject Record) */}
      <div className={`panel-overlay${delta ? " open" : ""}`} onClick={() => setDelta(null)}></div>
      <div className={`delta-panel${delta ? " open" : ""}`}>
        <div className="delta-panel-header"><span className="delta-panel-name">Change reason</span><span className="delta-id">Δ-{(delta?.field.code ?? "").toUpperCase()}</span><button className="panel-close-btn" onClick={() => setDelta(null)} type="button"><i className="ti ti-x"></i></button></div>
        <div className="delta-context"><div className="delta-context-label">Field · {delta && subjects.find((s) => s.id === delta.sid)?.subject_code}</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}><span className="delta-field-name">{delta?.field.label}</span><span className="delta-field-code">{(delta?.field.code ?? "").toUpperCase()}</span></div>
          <div className="delta-values"><span className="delta-old">{deltaOld || "—"}</span><span className="delta-arrow">→</span><span className="delta-new">{deltaNew || "—"}</span></div>
        </div>
        <div className="delta-thread">
          {deltaHistory.length === 0 && <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No change reason for this field.</p>}
          {deltaHistory.map((r) => r.status === "pending" ? (
            <div className="delta-entry pending" key={r.id}>
              <div className="delta-entry-change"><span className="delta-entry-old">{r.old_value || "—"}</span><span className="delta-entry-arrow">→</span><span className="delta-entry-new">{r.new_value || "—"}</span></div>
              <div className="delta-compose-hint">Reason for this change — {activeRole} · {ndaName}</div>
              <textarea className="delta-textarea" placeholder="Enter reason for this change…" value={recordReasons[r.id] ?? ""} onChange={(e) => setRecordReasons((p) => ({ ...p, [r.id]: e.target.value }))}></textarea>
              <div className="delta-compose-actions"><span className="delta-status-badge ds-change-required">Reason required</span><button className="delta-btn-submit" type="button" disabled={!(recordReasons[r.id] ?? "").trim()} onClick={() => submitReasonForRecord(r.id)}>Submit reason</button></div>
            </div>
          ) : (
            <div className="delta-entry" key={r.id}>
              <div className="delta-entry-change"><span className="delta-entry-old">{r.old_value || "—"}</span><span className="delta-entry-arrow">→</span><span className="delta-entry-new">{r.new_value || "—"}</span></div>
              <div className="delta-entry-reason">{r.reason}</div>
              <div className="delta-entry-meta"><span>{r.author_name} · {r.author_role}</span><span className="delta-entry-ts">{r.created_at.slice(0, 16).replace("T", " ")}</span></div>
              <div className="delta-entry-foot"><span className={`delta-status-badge ${r.status === "approved" ? "ds-approved" : "ds-answered"}`}>{r.status === "approved" ? "DM approved" : "Awaiting DM review"}</span>{activeRole === "DM" && r.status !== "approved" && <button className="delta-approve" type="button" onClick={() => approveDelta(r.id)}>Approve</button>}</div>
            </div>
          ))}
        </div>
      </div>

      {toast && <div className="be-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button className="be-toast-x" type="button" onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}
