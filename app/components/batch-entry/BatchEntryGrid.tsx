"use client";

// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — Step 2: the entry grid (translated from 20-batch-entry.html's
// #view-grid). One row per animal, one column per field, inline editing. NO
// checkboxes — every visible animal is included. Each cell LIVE-PERSISTS to that
// animal's own form instance (so the Subject Record shows the same data), and
// carries the *exact* per-field flow of the Subject Record:
//   • edit checks (orange EC- icon → Edit Check panel; convert-to-query),
//   • manual queries (Queries mode → flag icon → Query panel; raise/respond/resolve),
//   • change reasons (Δ): changing a saved value shows the dashed-red Δ button →
//     the 380px Δ slide-in panel (old→new, reason textarea, history). DM approval
//     happens on the individual Subject Record only.
// Queries/SDV/the Submit→Lock form-flow live on the Subject Record, never here.
// The bottom rfc-bar is a summary shortcut for setting a reason across all pending
// changes at once. SDV mode is intentionally unavailable in batch.
// ════════════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { canQuery } from "@/lib/permissions";
import { DEMO_USER_ID } from "@/lib/constants";
import { useNdaName } from "@/lib/use-nda-name";
import { evaluateField } from "@/lib/forms/validation";
import { visitDayOf } from "@/lib/batch-entry";
import type { Dataset, FormFieldRow, SubjectRow } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./batch-entry.css";

const newId = () => crypto.randomUUID();
const STATUS_CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const qCodeFor = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;
const ecCodeFor = (id: string) => `EC-${id.slice(0, 4).toUpperCase()}`;
const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };
const RFC_REASONS = ["Data correction", "Transcription error", "Updated source document", "Other"];
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
  const cols = fields.filter((f) => f.field_type !== "calculated");

  const subjects = (() => {
    const set = new Set(subjectIds);
    return dataset.subjects.filter((s) => set.has(s.id)).slice().sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  })();

  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");
  const canRaise = canQuery(activeRole, "raise");

  // ── State ───────────────────────────────────────────────────────────────────
  const [modeQueries, setModeQueries] = useState(false);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [panel, setPanel] = useState<(Target & { kind: "query" | "edit_check" }) | null>(null);
  const [reply, setReply] = useState("");
  const [delta, setDelta] = useState<Target | null>(null);
  const [recordReasons, setRecordReasons] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ sid: string; fieldId: string } | null>(null);
  const editStartRef = useRef<{ sid: string; fieldId: string; value: string } | null>(null);
  const [manageOpenQuery, setManageOpenQuery] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [search, setSearch] = useState("");
  const [siteF, setSiteF] = useState("");
  const [barnF, setBarnF] = useState("");
  const [penF, setPenF] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [bulkOther, setBulkOther] = useState("");
  const [toast, setToast] = useState<string | null>(null);

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
  const fieldQueryFor = (fvId?: string) => {
    if (!fvId) return undefined;
    const qs = dataset.queries.filter((q) => q.field_value_id === fvId);
    return qs.find((q) => q.status === "open" || q.status === "responded") ?? qs.filter((q) => q.status === "resolved").slice(-1)[0];
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
  function setFieldValue(sid: string, field: FormFieldRow, value: string, recordChange = false) {
    update((d: Dataset) => {
      const inst = ensureInst(d, sid);
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id);
      const prev = fv?.value ?? "";
      if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value }; d.fieldValues.push(fv); }
      else fv.value = value;
      if (recordChange) recordTransition(d, fv.id, prev, value);
      const check = evaluateField(field, value, species, d.speciesRanges, ageOf(sid));
      const ec = d.editChecks.find((e) => e.field_value_id === fv!.id && e.status === "open");
      const hasConvertedQ = d.queries.some((q) => q.field_value_id === fv!.id && (q.status === "open" || q.status === "responded"));
      if (check) { if (!ec && !hasConvertedQ) d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() }); else if (ec) ec.message = check.message; }
      else if (ec) ec.status = "resolved";
    });
  }
  function snapshotTextFocus(sid: string, field: FormFieldRow) { editStartRef.current = { sid, fieldId: field.id, value: fvFor(sid, field.id)?.value ?? "" }; }
  function recordTextEdit(sid: string, field: FormFieldRow) {
    const snap = editStartRef.current; editStartRef.current = null;
    if (!snap || snap.sid !== sid || snap.fieldId !== field.id) return;
    const fv = fvFor(sid, field.id); if (!fv) return;
    const cur = fv.value ?? ""; if (cur === snap.value) return;
    update((d: Dataset) => { const f = d.fieldValues.find((v) => v.id === fv.id); if (f) recordTransition(d, f.id, snap.value, cur); });
  }

  function submitReasonForRecord(recordId: string) {
    const text = (recordReasons[recordId] ?? "").trim(); if (!text) return;
    update((d: Dataset) => { const r = d.deltaRecords.find((x) => x.id === recordId); if (r && r.status === "pending") { r.reason = text; r.author_name = ndaName; r.author_role = activeRole; r.status = "responded"; } });
    setRecordReasons((p) => { const n = { ...p }; delete n[recordId]; return n; });
  }
  function approveDelta(recordId: string) { if (activeRole !== "DM") return; update((d: Dataset) => { const r = d.deltaRecords.find((x) => x.id === recordId); if (r) r.status = "approved"; }); }

  function pushMsg(d: Dataset, queryId: string, body: string) { d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, author_name: ndaName, author_role: activeRole, body, created_at: new Date().toISOString() }); }
  function raiseQuery(t: Target) {
    if (!canRaise) return;
    const body = reply.trim() || `Manual query raised by ${activeRole}.`;
    update((d: Dataset) => {
      const inst = ensureInst(d, t.sid);
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === t.field.id);
      if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: t.field.id, value: "" }; d.fieldValues.push(fv); }
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: body, from_edit_check: false, created_at: new Date().toISOString() });
      pushMsg(d, qid, body);
    });
    setReply("");
  }
  function convertEditCheck(t: Target) {
    const explanation = reply.trim(); if (!explanation) return;
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.subject_id === t.sid && i.form_id === formId); if (!inst) return;
      const fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === t.field.id); if (!fv) return;
      const ec = d.editChecks.find((e) => e.field_value_id === fv.id && e.status === "open"); if (!ec) return;
      ec.status = "converted";
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: ec.message, from_edit_check: true, created_at: new Date().toISOString() });
      d.queryMessages.push({ id: newId(), query_id: qid, author_id: DEMO_USER_ID, body: `Auto edit-check: ${ec.message}`, created_at: ec.created_at });
      pushMsg(d, qid, explanation);
    });
    setReply(""); setPanel((p) => (p ? { ...p, kind: "query" } : p));
  }
  function respondQuery(queryId: string) { const body = reply.trim() || `Response acknowledged by ${activeRole}.`; update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; q.status = "responded"; pushMsg(d, queryId, body); }); setReply(""); }
  function resolveQuery(queryId: string) { const body = reply.trim(); update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; if (body) pushMsg(d, queryId, body); q.status = "resolved"; }); setReply(""); setPanel(null); }
  function confirmCloseWithoutResponse(queryId: string) {
    if (!closeReason.trim()) return;
    update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, author_name: ndaName, author_role: `${activeRole} · System`, body: `Closed without response — ${closeReason.trim()}`, created_at: new Date().toISOString() }); q.status = "resolved"; });
    setCloseReason(""); setCloseModalOpen(false); setManageOpenQuery(false); setPanel(null);
  }

  // ── Derived (panels) ─────────────────────────────────────────────────────────
  const panelFv = panel ? fvFor(panel.sid, panel.field.id) : undefined;
  const panelQueries = panelFv ? dataset.queries.filter((q) => q.field_value_id === panelFv.id).slice().sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1)) : [];
  const panelQuery = fieldQueryFor(panelFv?.id);
  const panelEC = editCheckFor(panelFv?.id);
  const isECPanel = panel?.kind === "edit_check" && !!panelEC;
  const panelResolved = panelQuery?.status === "resolved";
  const msgsForQuery = (qid: string) => dataset.queryMessages.filter((m) => m.query_id === qid).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const panelHasResponse = panelQuery ? msgsForQuery(panelQuery.id).some((m) => m.author_role && !m.author_role.includes("System")) : false;

  const deltaFv = delta ? fvFor(delta.sid, delta.field.id) : undefined;
  const deltaHistory = deltaFv ? dataset.deltaRecords.filter((r) => r.field_value_id === deltaFv.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : [];
  const deltaPendingCount = deltaHistory.filter((r) => r.status === "pending").length;
  const deltaCurState = delta ? deltaStateFor(delta.sid, delta.field.id, deltaFv?.id) : null;
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
  }

  if (!form) return <div className="be-screen"><div className="grid-empty">Form not found.</div></div>;
  const day = visitDayOf(form);

  // ── Cell control (batch styling: amber=EC/query · dashed-red=pending Δ · no green) ──
  function renderControl(sid: string, field: FormFieldRow, value: string, stateCls: string) {
    const commit = (v: string) => setFieldValue(sid, field, v, true);
    const typeChange = (v: string) => setFieldValue(sid, field, v);
    const onFocus = () => { setEditing({ sid, fieldId: field.id }); snapshotTextFocus(sid, field); };
    const onBlur = () => { setEditing(null); recordTextEdit(sid, field); };
    const t = field.field_type;
    if (t === "radio") {
      const opts = field.options?.length ? field.options : ["Yes", "No"];
      return <div className={`batch-yn${stateCls}`}>{opts.map((o) => <button key={o} type="button" className={`batch-yn-btn${value === o ? " active" : ""}`} onClick={() => commit(value === o ? "" : o)}>{o}</button>)}</div>;
    }
    if (t === "select" || t === "multiselect") {
      const cur = t === "multiselect" ? (parseMulti(value)[0] ?? "") : value;
      return <select className={`batch-select${stateCls}`} value={cur} onChange={(e) => commit(t === "multiselect" ? (e.target.value ? JSON.stringify([e.target.value]) : "") : e.target.value)}><option value="">—</option>{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    }
    if (t === "date" || t === "datetime") return <input type="date" className={`batch-input sans${stateCls}`} value={value} onChange={(e) => commit(e.target.value)} />;
    const numeric = t === "number" || t === "integer";
    return <input type="text" inputMode={numeric ? "decimal" : undefined} autoComplete="off" className={`batch-input${numeric ? "" : " sans"}${stateCls}`} value={value} onFocus={onFocus} onBlur={onBlur} onChange={(e) => typeChange(e.target.value)} />;
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
          {/* Remarks dropdown — Off / Queries (SDV happens on the Subject Record only) */}
          <div className="remarks-wrap">
            <button className="btn-secondary" onClick={() => setRemarksOpen((o) => !o)} type="button">
              Remarks: {modeQueries ? "Queries" : "Off"}<i className="ti ti-chevron-down" style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}></i>
            </button>
            {remarksOpen && <div className="remarks-backdrop" onClick={() => setRemarksOpen(false)} />}
            <div className={`remarks-menu${remarksOpen ? " open" : ""}`}>
              <div className="remarks-section-label">Activate mode</div>
              <button className={`remarks-item${modeQueries ? " active-mode" : ""}`} onClick={() => setModeQueries((m) => !m)} type="button"><span>Queries</span>{modeQueries && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}</button>
            </div>
          </div>
          <button className="btn-secondary" type="button" onClick={onExitOrigin}><i className="ti ti-arrow-left"></i> Exit batch</button>
          <button className="btn-primary" type="button" disabled={dataN === 0} onClick={submitAll}><i className="ti ti-check"></i> Submit all</button>
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

      {/* Grid */}
      <div className="grid-wrap">
        <table className="batch-table">
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
              const dirty = cols.some((f) => deltaStateFor(s.id, f.id, fvFor(s.id, f.id)?.id) === "pending");
              return (
                <tr key={s.id}>
                  <td className="td-subject"><div className="td-subject-inner"><div className="subj-id">{s.subject_code}</div><div className="subj-meta">{rowMeta(s)}</div></div></td>
                  {cols.map((f) => {
                    const fv = fvFor(s.id, f.id);
                    const value = fv?.value ?? "";
                    const ec = editCheckFor(fv?.id);
                    const dispQ = fieldQueryFor(fv?.id);
                    const dState = deltaStateFor(s.id, f.id, fv?.id);
                    const amber = !!ec || (!!dispQ && dispQ.status !== "resolved");
                    const stateCls = amber ? " warn" : dState === "pending" ? " delta-pending" : "";
                    return (
                      <td className="batch-cell" key={f.id}>
                        <div className="be-cell-row">
                          {renderControl(s.id, f, value, stateCls)}
                          {dState && <button className={`delta-btn ${dState}`} title={dState === "approved" ? "Change approved by DM" : dState === "responded" ? "Change reason submitted — awaiting DM review" : "Change reason required"} onClick={() => setDelta({ sid: s.id, field: f })} type="button">Δ</button>}
                          {ec && <button className="ec-btn" title="Edit check — out of range. Click to review." onClick={() => setPanel({ sid: s.id, field: f, kind: "edit_check" })} type="button"><i className="ti ti-alert-circle"></i></button>}
                          {!ec && (modeQueries || dispQ) && (
                            <button className={`flag-btn${dispQ ? (dispQ.status === "resolved" ? " resolved" : " flagged") : ""}`} title={dispQ ? (dispQ.status === "resolved" ? "Query resolved — click to view" : "Query — click to view") : "Raise a query"} onClick={() => setPanel({ sid: s.id, field: f, kind: "query" })} type="button"><i className={`ti ${dispQ ? (dispQ.status === "resolved" ? "ti-flag-check" : "ti-flag-filled") : "ti-flag"}`}></i></button>
                          )}
                        </div>
                        <span className={`val-hint${ec ? " warn" : ""}`}>{ec ? ec.message.replace(/—.*/, "").trim() : ""}</span>
                      </td>
                    );
                  })}
                  <td className="td-status">
                    {alerts > 0 ? <span className="row-badge rb-alert"><i className="ti ti-alert-triangle"></i> Alert</span>
                      : dirty ? <span className="row-badge rb-partial"><i className="ti ti-pencil"></i> Changed</span>
                      : hasData ? <span className="row-badge rb-ready"><i className="ti ti-check"></i> Saved</span>
                      : <span className="row-badge rb-empty"><i className="ti ti-circle"></i> Empty</span>}
                    {alerts > 0 && <div><span className="ec-chip"><i className="ti ti-alert-circle"></i> EC- {alerts}</span></div>}
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

      {/* Query / Edit-check slide-in panel (same as the Subject Record) */}
      <div className={`panel-overlay${panel ? " open" : ""}`} onClick={() => { setPanel(null); setReply(""); }}></div>
      <div className={`slide-panel${panel ? " open" : ""}`}>
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="panel-title">{isECPanel ? "Edit Check" : panelQuery ? "Query thread" : "Raise a query"}</div>
            <div className="panel-title-meta">{isECPanel && panelEC && <span className="query-id">{ecCodeFor(panelEC.id)}</span>}{!isECPanel && panelQuery && <span className="query-id">{qCodeFor(panelQuery.id)}</span>}{panel && <span className="query-id" style={{ marginLeft: 6 }}>{subjects.find((s) => s.id === panel.sid)?.subject_code}</span>}</div>
          </div>
          <button className="panel-close" onClick={() => { setPanel(null); setReply(""); }} type="button"><i className="ti ti-x"></i></button>
        </div>
        {isECPanel ? (
          <div className="status-bar"><span className="status-bar-label">Status</span><span className="query-status qs-editcheck">Edit check</span><span className="status-desc">Out of range — correct the value or explain it</span></div>
        ) : panelQuery ? (
          <div className="status-bar"><span className="status-bar-label">Status</span><span className={`query-status ${QS_CLS[panelQuery.status] || "qs-open"}`}>{STATUS_CAP(panelQuery.status)}</span><span className="status-desc">{panelQuery.status === "open" ? "Awaiting response" : panelQuery.status === "responded" ? "Awaiting CRA review" : "Resolved — no further action"}</span></div>
        ) : null}
        <div className="field-context">
          <div className="fc-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}><span className="fc-field">{panel?.field.label}</span><span className="fc-code">{(panel?.field.code ?? "").toUpperCase()}</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", lineHeight: 1.6, color: "var(--color-text-primary)" }}>{panelFv?.value ? `${panelFv.value}${panel?.field.unit ? ` ${panel.field.unit}` : ""}` : "—"}</div>
        </div>
        <div className="thread-body">
          {isECPanel && panelEC ? (
            <div className="message"><div className="msg-header"><div className="msg-avatar av-auto">EC</div><span className="msg-author">Edit check</span><span className="msg-role">· Auto</span></div><div className="msg-bubble">{panelEC.message}</div></div>
          ) : panelQueries.length > 0 ? (
            panelQueries.map((q) => (
              <div className="query-block" key={q.id}>
                <div className="query-block-head"><span className="query-id">{qCodeFor(q.id)}</span><span className={`query-status ${QS_CLS[q.status] || "qs-open"}`}>{STATUS_CAP(q.status)}</span></div>
                {msgsForQuery(q.id).map((m) => { const isHuman = !!m.author_role; const name = m.author_name ?? "Edit check"; const initials = isHuman ? name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() : "EC"; return (
                  <div className="message" key={m.id}><div className="msg-header"><div className={`msg-avatar${isHuman ? "" : " av-auto"}`}>{initials}</div><span className="msg-author">{name}</span><span className="msg-role">· {isHuman ? m.author_role : "Auto"}</span></div><div className="msg-bubble">{m.body}</div></div>
                ); })}
              </div>
            ))
          ) : <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No query has been raised on this field yet.</p>}
        </div>
        <div className="compose-area">
          {isECPanel ? (
            <><div className="compose-context"><i className="ti ti-user-circle"></i> Explain this value, or correct it in the grid to clear the check</div>
            <textarea className="compose-textarea" placeholder="Explain why this value is correct — this escalates to a formal query…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
            <div className="compose-btns"><span className="compose-sub">Converting raises a formal query</span><button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panel && convertEditCheck(panel)}>Convert to query</button></div></>
          ) : panelResolved ? (
            canRaise ? (
              <><div className="compose-context"><i className="ti ti-flag-check"></i> This query is resolved — raise a new query if a fresh issue remains (as {activeRole})</div>
              <textarea className="compose-textarea" placeholder="Describe a new issue with this value…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns"><span className="compose-sub">Opens a new query</span><button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panel && raiseQuery(panel)}>Raise new query</button></div></>
            ) : <div className="sr-perm-note"><i className="ti ti-flag-check"></i> This query is resolved — no further action.</div>
          ) : !panelQuery ? (
            canRaise ? (
              <><div className="compose-context"><i className="ti ti-user-circle"></i> Raising as {activeRole}</div>
              <textarea className="compose-textarea" placeholder="Describe the issue with this value…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns"><span className="compose-sub">Shift+Enter for new line</span><button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panel && raiseQuery(panel)}>Raise query</button></div></>
            ) : <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) cannot raise queries.</div>
          ) : activeRole === "DM" ? (
            <><div className="compose-context"><i className="ti ti-user-circle"></i> Managing as DM</div>
            <textarea className="compose-textarea" placeholder="Add a comment…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
            <div className="compose-btns"><span className="compose-sub">Shift+Enter for new line</span>
              <div className="manage-q-wrap">
                <button className="btn-respond" type="button" onClick={() => setManageOpenQuery((o) => !o)}>Manage <i className="ti ti-chevron-down" style={{ fontSize: "11px" }}></i></button>
                {manageOpenQuery && <div className="manage-q-backdrop" onClick={() => setManageOpenQuery(false)} />}
                <div className={`manage-q-menu${manageOpenQuery ? " open" : ""}`} role="menu">
                  <button className="manage-item" type="button" onClick={() => { respondQuery(panelQuery.id); setManageOpenQuery(false); }}><i className="ti ti-message"></i> Respond</button>
                  <button className="manage-item" type="button" disabled={!panelHasResponse} title={panelHasResponse ? undefined : "A response is required before resolving"} onClick={() => { if (panelHasResponse) { resolveQuery(panelQuery.id); setManageOpenQuery(false); } }}><i className="ti ti-flag-check"></i> Resolve</button>
                  <button className="manage-item" type="button" onClick={() => { setManageOpenQuery(false); setCloseReason(""); setCloseModalOpen(true); }}><i className="ti ti-square-x"></i> Close without response</button>
                </div>
              </div>
            </div></>
          ) : canRespond || canResolve || activeRole === "CRA" ? (
            <><div className="compose-context"><i className="ti ti-user-circle"></i> Acting as {activeRole}</div>
            <textarea className="compose-textarea" placeholder="Add a response…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
            <div className="compose-btns"><span className="compose-sub">Shift+Enter for new line</span>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {(canRespond || activeRole === "CRA") && <button className={canResolve ? "btn-comment" : "btn-respond"} type="button" onClick={() => respondQuery(panelQuery.id)}>Respond</button>}
                {canResolve && <button className="btn-respond" type="button" onClick={() => resolveQuery(panelQuery.id)}>Resolve</button>}
              </div>
            </div></>
          ) : <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>}
        </div>
      </div>

      {/* Change-reason (Δ) slide-in panel (same as the Subject Record) */}
      <div className={`panel-overlay${delta ? " open" : ""}`} onClick={() => setDelta(null)}></div>
      <div className={`delta-panel${delta ? " open" : ""}`}>
        <div className="delta-panel-header"><span className="delta-panel-name">Change reason</span><span className="delta-id">Δ-{(delta?.field.code ?? "").toUpperCase()}</span><button className="panel-close-btn" onClick={() => setDelta(null)} type="button"><i className="ti ti-x"></i></button></div>
        <div className="delta-status-bar">
          <span className={`delta-status-badge ${deltaCurState === "approved" ? "ds-approved" : deltaCurState === "responded" ? "ds-answered" : "ds-change-required"}`}>{deltaCurState === "approved" ? "Approved" : deltaCurState === "responded" ? "Answered" : "Change reason"}</span>
          <span className="delta-status-desc">{deltaCurState === "approved" ? "Approved by the data manager (on the subject record)" : deltaPendingCount > 0 ? `${deltaPendingCount} change${deltaPendingCount > 1 ? "s" : ""} need${deltaPendingCount > 1 ? "" : "s"} a reason from ${activeRole}` : "Awaiting DM review on the subject record"}</span>
        </div>
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

      {/* Close-without-response modal (DM) */}
      {closeModalOpen && (
        <div className="sr-modal-overlay" onClick={() => { setCloseModalOpen(false); setCloseReason(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-square-x"></i> Close without response</div>
            <div className="sr-modal-body">Document an auditable reason for closing this query without a response.</div>
            <textarea className="sr-modal-input" placeholder="Reason…" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}><button className="btn-secondary" type="button" onClick={() => { setCloseModalOpen(false); setCloseReason(""); }}>Cancel</button><button className="btn-primary" type="button" disabled={!closeReason.trim()} onClick={() => panelQuery && confirmCloseWithoutResponse(panelQuery.id)}>Close query</button></div>
          </div>
        </div>
      )}

      {toast && <div className="be-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button className="be-toast-x" type="button" onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}
