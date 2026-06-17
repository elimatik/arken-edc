"use client";

// ════════════════════════════════════════════════════════════════════════════
// ScopedFieldGrid — the per-field editing surface for ONE site-/barn-scoped form
// instance: the field grid plus the query / edit-check / change-reason (Δ) slide-
// in panels. It is the body that sits below the form-level sticky header (which
// owns Remarks + the status CTA — see ScopedFormRenderer). The Remarks modes
// (Queries / SDV) are passed in as props so a single form-level Remarks dropdown
// drives the whole form, including the entry panel of a repeating form.
//
// Behaviour is identical to the Subject Record (same subject-record.css classes,
// same validation engine, same session-store data model keyed by instance):
//   • edit checks (orange EC-), manual queries (Raise→Respond→Resolve, role-gated),
//   • change-reason Δ (pending→responded→approved), per-field SDV verify (CRA).
// ════════════════════════════════════════════════════════════════════════════

import { Fragment, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { canQuery, canSDV } from "@/lib/permissions";
import { DEMO_USER_ID } from "@/lib/constants";
import { useNdaName } from "@/lib/use-nda-name";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import type { Dataset, FormFieldRow, FormRow } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";

const newId = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);
const STATUS_CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const qCodeFor = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;
const ecCodeFor = (id: string) => `EC-${id.slice(0, 4).toUpperCase()}`;
const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };
export const isSdvEligible = (f: FormFieldRow) => !["file", "calculated", "textarea"].includes(f.field_type);
const parseMulti = (v: string): string[] => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []; } };

export function ScopedFieldGrid({ studyId, scope, scopeId, form, instanceId, modeQueries, modeSdv, readOnly, panel }: {
  studyId: string; scope: "site" | "barn"; scopeId: string; form: FormRow; instanceId: string;
  modeQueries: boolean; modeSdv: boolean; readOnly: boolean; panel?: boolean;
}) {
  const { dataset, update } = useStudySession();
  const { activeRole } = useShell();
  const ndaName = useNdaName();
  const species = dataset.studies.find((s) => s.id === studyId)?.species ?? "chicken";

  const [panelField, setPanelField] = useState<FormFieldRow | null>(null);
  const [panelKind, setPanelKind] = useState<"query" | "edit_check">("query");
  const [reply, setReply] = useState("");
  const [deltaField, setDeltaField] = useState<FormFieldRow | null>(null);
  const [recordReasons, setRecordReasons] = useState<Record<string, string>>({});
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const editStartRef = useRef<{ fieldId: string; value: string } | null>(null);
  const [manageOpenQuery, setManageOpenQuery] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");

  const canSdv = canSDV(activeRole);
  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");
  const canRaise = canQuery(activeRole, "raise");

  const fields = dataset.formFields.filter((f) => f.form_id === form.id).slice().sort((a, b) => a.sequence - b.sequence);

  const instScope = () => (scope === "site" ? { subject_id: null, barn_id: null, site_id: scopeId } : { subject_id: null, barn_id: scopeId, site_id: null });
  const ensureInst = (d: Dataset) => {
    let inst = d.formInstances.find((i) => i.id === instanceId);
    if (!inst) { inst = { id: instanceId, form_id: form.id, ...instScope(), status: "in_work" }; d.formInstances.push(inst); }
    else if (inst.status === "empty") inst.status = "in_work";
    return inst;
  };

  const fvFor = (fieldId: string) => dataset.fieldValues.find((v) => v.form_instance_id === instanceId && v.form_field_id === fieldId);
  const fieldQueryFor = (fvId?: string) => {
    if (!fvId) return undefined;
    const qs = dataset.queries.filter((q) => q.field_value_id === fvId);
    return qs.find((q) => q.status === "open" || q.status === "responded") ?? qs.filter((q) => q.status === "resolved").slice(-1)[0];
  };
  const editCheckFor = (fvId?: string) => (fvId ? dataset.editChecks.find((e) => e.field_value_id === fvId && e.status === "open") : undefined);
  const sdvRecordFor = (fvId?: string) => (fvId ? dataset.sdvRecords.find((r) => r.field_value_id === fvId && r.status === "verified") : undefined);
  const deltaStateFor = (fieldId: string, fvId?: string): "pending" | "responded" | "approved" | null => {
    if (editingFieldId === fieldId) return null;
    const recs = fvId ? dataset.deltaRecords.filter((r) => r.field_value_id === fvId) : [];
    if (recs.length === 0) return null;
    if (recs.some((r) => r.status === "pending")) return "pending";
    return recs.every((r) => r.status === "approved") ? "approved" : "responded";
  };
  const computed = (f: FormFieldRow): string => {
    if (f.code === "all_satisfactory") {
      const yns = fields.filter((x) => x.field_type === "radio" && x.code !== "site_approved_to_enroll" && (x.options?.length ?? 0) === 2);
      if (!yns.some((x) => (fvFor(x.id)?.value ?? "") !== "")) return "—";
      return yns.every((x) => fvFor(x.id)?.value === "Yes") ? "Yes" : "No";
    }
    return "—";
  };

  // ─── Writes (mirror SubjectRecord, keyed by instanceId) ─────────────────────
  function recordTransition(d: Dataset, fvId: string, prev: string, next: string) {
    if (prev === "" || prev === next) return;
    d.deltaRecords.push({ id: newId(), field_value_id: fvId, old_value: prev, new_value: next, reason: "", author_name: ndaName, author_role: activeRole, created_at: new Date().toISOString(), status: "pending" });
  }
  function evalEditCheckInline(d: Dataset, inst: { id: string }, fv: { id: string }, field: FormFieldRow, value: string) {
    const check = evaluateField(field, value, species, d.speciesRanges);
    const ec = d.editChecks.find((e) => e.field_value_id === fv.id && e.status === "open");
    const hasConvertedQ = d.queries.some((q) => q.field_value_id === fv.id && (q.status === "open" || q.status === "responded"));
    if (check) {
      if (!ec && !hasConvertedQ) d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() });
      else if (ec) ec.message = check.message;
    } else if (ec) ec.status = "resolved";
  }
  function setFieldValue(field: FormFieldRow, value: string, recordChange = false, skipCheck = false) {
    if (readOnly) return;
    update((d: Dataset) => {
      const inst = ensureInst(d);
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id);
      const prev = fv?.value ?? "";
      if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value }; d.fieldValues.push(fv); }
      else fv.value = value;
      if (recordChange) recordTransition(d, fv.id, prev, value);
      // Discrete controls evaluate the edit check on change; text/number inputs pass
      // skipCheck while typing and evaluate on BLUR only (no amber flicker mid-keystroke).
      if (!skipCheck) evalEditCheckInline(d, inst, fv, field, value);
    });
  }
  function snapshotTextFocus(field: FormFieldRow) { editStartRef.current = { fieldId: field.id, value: fvFor(field.id)?.value ?? "" }; }
  function recordTextEdit(field: FormFieldRow) {
    const snap = editStartRef.current; editStartRef.current = null;
    if (!snap || snap.fieldId !== field.id) return;
    const fv = fvFor(field.id); if (!fv) return;
    const cur = fv.value ?? ""; if (cur === snap.value) return;
    update((d: Dataset) => { const f = d.fieldValues.find((v) => v.id === fv.id); if (f) recordTransition(d, f.id, snap.value, cur); });
  }
  function evalEditCheck(field: FormFieldRow) {
    if (readOnly) return;
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.id === instanceId); if (!inst) return;
      const fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id); if (!fv) return;
      evalEditCheckInline(d, inst, fv, field, fv.value ?? "");
    });
  }
  const toggleMulti = (field: FormFieldRow, opt: string, value: string) => { const cur = parseMulti(value); setFieldValue(field, JSON.stringify(cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]), true); };

  function sdvBlockReason(field: FormFieldRow, fvId?: string): string | null {
    if (editCheckFor(fvId)) return "Resolve the edit check before verifying";
    if (deltaStateFor(field.id, fvId) === "pending") return "Provide the change reason before verifying";
    const q = fieldQueryFor(fvId);
    if (q && q.status !== "resolved") return "Resolve the open query before verifying";
    return null;
  }
  function toggleSdv(field: FormFieldRow) {
    if (!canSdv || readOnly) return;
    const fv0 = fvFor(field.id);
    if (!fv0 || (fv0.value ?? "") === "") return;
    if (sdvBlockReason(field, fv0.id)) return;
    update((d: Dataset) => {
      const rec = d.sdvRecords.find((r) => r.field_value_id === fv0.id);
      if (rec) { const v = rec.status !== "verified"; rec.status = v ? "verified" : "pending"; rec.verified_by_name = v ? ndaName : null; rec.verified_at = v ? todayISO() : null; }
      else d.sdvRecords.push({ id: newId(), form_instance_id: fv0.form_instance_id, field_value_id: fv0.id, status: "verified", verified_by_name: ndaName, verified_at: todayISO() });
    });
  }

  function submitReasonForRecord(recordId: string) {
    const text = (recordReasons[recordId] ?? "").trim(); if (!text) return;
    update((d: Dataset) => { const r = d.deltaRecords.find((x) => x.id === recordId); if (r && r.status === "pending") { r.reason = text; r.author_name = ndaName; r.author_role = activeRole; r.status = "responded"; } });
    setRecordReasons((p) => { const n = { ...p }; delete n[recordId]; return n; });
  }
  function approveDelta(recordId: string) { if (activeRole !== "DM") return; update((d: Dataset) => { const r = d.deltaRecords.find((x) => x.id === recordId); if (r) r.status = "approved"; }); }

  function pushMsg(d: Dataset, queryId: string, body: string) { d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, author_name: ndaName, author_role: activeRole, body, created_at: new Date().toISOString() }); }
  function raiseQuery(field: FormFieldRow) {
    if (!canRaise) return;
    const body = reply.trim() || `Manual query raised by ${activeRole}.`;
    update((d: Dataset) => {
      const inst = ensureInst(d);
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id);
      if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value: "" }; d.fieldValues.push(fv); }
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: body, from_edit_check: false, created_at: new Date().toISOString() });
      pushMsg(d, qid, body);
    });
    setReply("");
  }
  function convertEditCheck(field: FormFieldRow) {
    const explanation = reply.trim(); if (!explanation) return;
    update((d: Dataset) => {
      const fv = d.fieldValues.find((v) => v.form_instance_id === instanceId && v.form_field_id === field.id);
      if (!fv) return;
      const ec = d.editChecks.find((e) => e.field_value_id === fv.id && e.status === "open");
      if (!ec) return;
      ec.status = "converted";
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: instanceId, field_value_id: fv.id, status: "open", title: ec.message, from_edit_check: true, created_at: new Date().toISOString() });
      d.queryMessages.push({ id: newId(), query_id: qid, author_id: DEMO_USER_ID, body: `Auto edit-check: ${ec.message}`, created_at: ec.created_at });
      pushMsg(d, qid, explanation);
    });
    setReply(""); setPanelKind("query");
  }
  function respondQuery(queryId: string) { const body = reply.trim() || `Response acknowledged by ${activeRole}.`; update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; q.status = "responded"; pushMsg(d, queryId, body); }); setReply(""); }
  function resolveQuery(queryId: string) { const body = reply.trim(); update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; if (body) pushMsg(d, queryId, body); q.status = "resolved"; }); setReply(""); setPanelField(null); }
  function confirmCloseWithoutResponse(queryId: string) {
    if (!closeReason.trim()) return;
    update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, author_name: ndaName, author_role: `${activeRole} · System`, body: `Closed without response — ${closeReason.trim()}`, created_at: new Date().toISOString() }); q.status = "resolved"; });
    setCloseReason(""); setCloseModalOpen(false); setManageOpenQuery(false); setPanelField(null);
  }

  // ─── Derived (panels) ───────────────────────────────────────────────────────
  const panelFv = panelField ? fvFor(panelField.id) : undefined;
  const panelQueries = panelFv ? dataset.queries.filter((q) => q.field_value_id === panelFv.id).slice().sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1)) : [];
  const panelQuery = fieldQueryFor(panelFv?.id);
  const panelEC = editCheckFor(panelFv?.id);
  const isECPanel = panelKind === "edit_check" && !!panelEC;
  const panelResolved = panelQuery?.status === "resolved";
  const msgsForQuery = (qid: string) => dataset.queryMessages.filter((m) => m.query_id === qid).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const panelHasResponse = panelQuery ? msgsForQuery(panelQuery.id).some((m) => m.author_role && !m.author_role.includes("System")) : false;

  const deltaFv = deltaField ? fvFor(deltaField.id) : undefined;
  const deltaHistory = deltaFv ? dataset.deltaRecords.filter((r) => r.field_value_id === deltaFv.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : [];
  const deltaPendingCount = deltaHistory.filter((r) => r.status === "pending").length;
  const deltaCurState = deltaField ? deltaStateFor(deltaField.id, deltaFv?.id) : null;
  const deltaOld = deltaHistory[deltaHistory.length - 1]?.old_value ?? "";
  const deltaNew = deltaHistory[deltaHistory.length - 1]?.new_value ?? (deltaFv?.value ?? "");

  function sectionForIdx(idx: number): string | null {
    if (idx < 0 || idx >= fields.length) return null;
    return (fields[idx].validation as { section?: string } | null)?.section ?? null;
  }

  function renderControl(field: FormFieldRow, value: string, queried: boolean, editcheck = false) {
    const commit = (v: string) => setFieldValue(field, v, true);
    const typeChange = (v: string) => setFieldValue(field, v, false, true);
    const onFocus = () => { setEditingFieldId(field.id); snapshotTextFocus(field); };
    const onBlur = () => { setEditingFieldId(null); recordTextEdit(field); evalEditCheck(field); };
    const stateCls = editcheck ? " editcheck" : queried ? " query" : "";
    const ro = readOnly;
    const type = field.field_type;
    if (type === "calculated") return <div className="calc-value">{computed(field)}</div>;
    if (type === "textarea") return <textarea className={`field-input${stateCls}`} style={{ height: 60, fontFamily: "var(--font-sans)" }} value={value} disabled={ro} onChange={(e) => typeChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} />;
    // yes/no radio → two-button toggle (.yn-toggle / .yn-btn — same as the Subject Record)
    if (type === "radio") {
      const opts = field.options?.length ? field.options : ["Yes", "No"];
      return (
        <div className={`yn-toggle${stateCls}`} role="group">
          {opts.map((o) => (
            <button key={o} type="button" disabled={ro} className={`yn-btn${value === o ? " active" : ""}`} onClick={() => commit(value === o ? "" : o)}>{o}</button>
          ))}
        </div>
      );
    }
    if (type === "multiselect" || type === "checkbox") {
      const sel = parseMulti(value);
      return (
        <div className={`check-group${stateCls}`}>
          {(field.options ?? []).map((o) => (
            <label key={o} className="check-item"><input type="checkbox" checked={sel.includes(o)} disabled={ro} onChange={() => toggleMulti(field, o, value)} /><span>{o}</span></label>
          ))}
        </div>
      );
    }
    if (type === "select") {
      return (
        <select className={`field-select${stateCls}`} value={value} disabled={ro} onChange={(e) => commit(e.target.value)}>
          <option value="">—</option>{(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (type === "date" || type === "datetime") {
      return <input type={type === "datetime" ? "datetime-local" : "date"} className={`field-input field-date${stateCls}`} value={value} disabled={ro} onChange={(e) => commit(e.target.value)}
        onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* not supported */ } }} />;
    }
    const mono = type === "number" || type === "integer";
    return <input className={`field-input${stateCls}`} inputMode={mono ? "decimal" : undefined} style={mono ? undefined : { fontFamily: "var(--font-sans)" }} value={value} disabled={ro} onFocus={onFocus} onBlur={onBlur} onChange={(e) => typeChange(e.target.value)} />;
  }

  return (
    <>
      <div className="field-grid-2" style={panel ? { gridTemplateColumns: "1fr" } : undefined}>
        {fields.map((field, fIdx) => {
          const section = sectionForIdx(fIdx);
          const showSection = !!section && section !== sectionForIdx(fIdx - 1);
          const fv = fvFor(field.id);
          const value = fv?.value ?? "";
          const ec = editCheckFor(fv?.id);
          const dispQ = fieldQueryFor(fv?.id);
          const raised = dispQ?.status === "open";
          const sdvRec = sdvRecordFor(fv?.id);
          const verified = !!sdvRec;
          const dState = deltaStateFor(field.id, fv?.id);
          const showInteractiveSdv = isSdvEligible(field) && !readOnly && modeSdv;
          const showStaticSdv = isSdvEligible(field) && verified && !showInteractiveSdv;
          const sdvBlock = sdvBlockReason(field, fv?.id);
          const numeric = field.field_type === "number" || field.field_type === "integer";
          const hint = rangeLabel(field, species, dataset.speciesRanges) ?? (numeric && field.unit ? field.unit : null);
          const isWide = field.field_type === "textarea" || field.field_type === "multiselect";
          const deltaTitle = dState === "approved" ? "Change approved by DM" : dState === "responded" ? "Change reason submitted — awaiting DM review" : "Change reason required";
          return (
            <Fragment key={field.id}>
              {showSection && <div className="form-section-title">{section}</div>}
              <div className={`field${isWide ? " full" : ""}${readOnly ? " state-locked" : ""}`}>
                <label className="field-label">{field.label}{field.is_required && <span className="field-req"> *</span>}{field.unit ? ` (${field.unit})` : ""}</label>
                <div className="field-row">
                  {renderControl(field, value, raised, !!ec)}
                  {showInteractiveSdv && (
                    <button className={`sdv-btn visible${verified ? " verified" : ""}${(sdvBlock || value.trim() === "") && !verified ? " blocked" : ""}`} onClick={() => toggleSdv(field)} disabled={!canSdv || (!verified && (value.trim() === "" || !!sdvBlock))}
                      title={!canSdv ? "SDV verify — CRA only" : verified ? "SDV verified — click to undo" : value.trim() === "" ? "Enter a value before verifying" : sdvBlock ?? "SDV: click to verify"} type="button"><i className={`ti ${verified ? "ti-shield-check-filled" : "ti-shield"}`}></i></button>
                  )}
                  {showStaticSdv && <span className="sdv-static" title="SDV verified"><i className="ti ti-shield-check-filled"></i></span>}
                  {!readOnly && dState && <button className={`delta-btn ${dState}`} onClick={() => setDeltaField(field)} title={deltaTitle} type="button">Δ</button>}
                  {ec && <button className="ec-btn" onClick={() => { setPanelField(field); setPanelKind("edit_check"); }} title="Edit check — out of range. Click to review." type="button"><i className="ti ti-alert-circle"></i></button>}
                  {!ec && (modeQueries || dispQ) && (
                    <button className={`flag-btn${dispQ ? (dispQ.status === "resolved" ? " resolved" : " flagged") : ""}`} onClick={() => { setPanelField(field); setPanelKind("query"); }}
                      title={dispQ ? (dispQ.status === "resolved" ? "Query resolved — click to view" : "Query — click to view") : "Raise a query"} type="button"><i className={`ti ${dispQ ? (dispQ.status === "resolved" ? "ti-flag-check" : "ti-flag-filled") : "ti-flag"}`}></i></button>
                  )}
                </div>
                {ec ? (
                  <div className="field-state state-editcheck"><i className="ti ti-alert-circle"></i><span className="ec-link" onClick={() => { setPanelField(field); setPanelKind("edit_check"); }}>[{ecCodeFor(ec.id)}] Value outside expected range{hint ? ` (${hint})` : ""}</span></div>
                ) : dispQ && dispQ.status !== "resolved" ? (
                  <div className="field-state state-query"><i className="ti ti-info-circle"></i><span className="query-link" onClick={() => { setPanelField(field); setPanelKind("query"); }}>{dispQ.status === "open" ? `[${qCodeFor(dispQ.id)}] ${dispQ.title}` : `[${qCodeFor(dispQ.id)}] open — view thread`}</span></div>
                ) : (hint && <span className="field-hint">{hint}</span>)}
                {modeSdv && verified && <span className="sdv-verified-note">Verified by {sdvRec?.verified_by_name ?? ndaName} · {sdvRec?.verified_at ?? todayISO()}</span>}
              </div>
            </Fragment>
          );
        })}
      </div>

      {/* Query / Edit-check panel */}
      <div className={`panel-overlay${panelField ? " open" : ""}`} onClick={() => { setPanelField(null); setReply(""); }}></div>
      <div className={`slide-panel${panelField ? " open" : ""}`}>
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="panel-title">{isECPanel ? "Edit Check" : panelQuery ? "Query thread" : "Raise a query"}</div>
            <div className="panel-title-meta">{isECPanel && panelEC && <span className="query-id">{ecCodeFor(panelEC.id)}</span>}{!isECPanel && panelQuery && <span className="query-id">{qCodeFor(panelQuery.id)}</span>}</div>
          </div>
          <button className="panel-close" onClick={() => { setPanelField(null); setReply(""); }} type="button"><i className="ti ti-x"></i></button>
        </div>
        {isECPanel ? (
          <div className="status-bar"><span className="status-bar-label">Status</span><span className="query-status qs-editcheck">Edit check</span><span className="status-desc">Out of range — correct the value or explain it</span></div>
        ) : panelQuery ? (
          <div className="status-bar"><span className="status-bar-label">Status</span><span className={`query-status ${QS_CLS[panelQuery.status] || "qs-open"}`}>{STATUS_CAP(panelQuery.status)}</span><span className="status-desc">{panelQuery.status === "open" ? "Awaiting response" : panelQuery.status === "responded" ? "Awaiting CRA review" : "Resolved — no further action"}</span></div>
        ) : null}
        <div className="field-context">
          <div className="fc-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}><span className="fc-field">{panelField?.label}</span><span className="fc-code">{(panelField?.code ?? "").toUpperCase()}</span></div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", lineHeight: 1.6, color: "var(--color-text-primary)" }}>{panelFv?.value ? `${panelFv.value}${panelField?.unit ? ` ${panelField.unit}` : ""}` : "—"}</div>
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
            <><div className="compose-context"><i className="ti ti-user-circle"></i> Explain this value, or correct it in the form to clear the check</div>
            <textarea className="compose-textarea" placeholder="Explain why this value is correct — this escalates to a formal query…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
            <div className="compose-btns"><span className="compose-sub">Converting raises a formal query</span><button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panelField && convertEditCheck(panelField)}>Convert to query</button></div></>
          ) : panelResolved ? (
            canRaise ? (
              <><div className="compose-context"><i className="ti ti-flag-check"></i> This query is resolved — raise a new query if a fresh issue remains (as {activeRole})</div>
              <textarea className="compose-textarea" placeholder="Describe a new issue with this value…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns"><span className="compose-sub">Opens a new query</span><button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panelField && raiseQuery(panelField)}>Raise new query</button></div></>
            ) : <div className="sr-perm-note"><i className="ti ti-flag-check"></i> This query is resolved — no further action.</div>
          ) : !panelQuery ? (
            canRaise ? (
              <><div className="compose-context"><i className="ti ti-user-circle"></i> Raising as {activeRole}</div>
              <textarea className="compose-textarea" placeholder="Describe the issue with this value…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns"><span className="compose-sub">Shift+Enter for new line</span><button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panelField && raiseQuery(panelField)}>Raise query</button></div></>
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

      {/* Change-reason (Δ) panel */}
      <div className={`panel-overlay${deltaField ? " open" : ""}`} onClick={() => setDeltaField(null)}></div>
      <div className={`delta-panel${deltaField ? " open" : ""}`}>
        <div className="delta-panel-header"><span className="delta-panel-name">Change reason</span><span className="delta-id">Δ-{(deltaField?.code ?? "").toUpperCase()}</span><button className="panel-close-btn" onClick={() => setDeltaField(null)} type="button"><i className="ti ti-x"></i></button></div>
        <div className="delta-status-bar">
          <span className={`delta-status-badge ${deltaCurState === "approved" ? "ds-approved" : deltaCurState === "responded" ? "ds-answered" : "ds-change-required"}`}>{deltaCurState === "approved" ? "Approved" : deltaCurState === "responded" ? "Answered" : "Change reason"}</span>
          <span className="delta-status-desc">{deltaCurState === "approved" ? "All changes approved by the data manager" : deltaPendingCount > 0 ? `${deltaPendingCount} change${deltaPendingCount > 1 ? "s" : ""} need${deltaPendingCount > 1 ? "" : "s"} a reason from ${activeRole}` : "Awaiting DM review"}</span>
        </div>
        <div className="delta-context"><div className="delta-context-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}><span className="delta-field-name">{deltaField?.label}</span><span className="delta-field-code">{(deltaField?.code ?? "").toUpperCase()}</span></div>
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
    </>
  );
}
