"use client";

// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — Step 2: the entry grid (translated from 20-batch-entry.html's
// #view-grid). One row per animal, one column per field, inline editing. NO
// checkboxes — every visible animal is included. Edit checks fire per cell
// (amber, non-blocking). Submit all writes to the session store, MIRRORING each
// row to that animal's own form instance (the Subject Record shows the same
// data); re-editing a previously-saved value reveals the reason-for-change bar
// and records a change-reason delta. Queries / SDV / form-flow CTAs live only on
// the individual Subject Record — never on the batch grid.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { evaluateField } from "@/lib/forms/validation";
import { ageMonthsOf, visitDayOf } from "@/lib/batch-entry";
import type { Dataset, FormFieldRow, SubjectRow } from "@/lib/session-store/types";
import "./batch-entry.css";

const newId = () => crypto.randomUUID();
const RFC_REASONS = ["Data correction", "Transcription error", "Updated source document", "Other"];
type ValMap = Record<string, Record<string, string>>; // subjectId → fieldId → value

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

  const study = dataset.studies.find((s) => s.id === studyId);
  const species = study?.species ?? "cattle";
  const form = dataset.forms.find((f) => f.id === formId);
  const fields = useMemo(
    () => dataset.formFields.filter((f) => f.form_id === formId).slice().sort((a, b) => a.sequence - b.sequence),
    [dataset.formFields, formId],
  );
  const cols = useMemo(() => fields.filter((f) => f.field_type !== "calculated"), [fields]);

  const subjects = useMemo(() => {
    const set = new Set(subjectIds);
    return dataset.subjects.filter((s) => set.has(s.id)).slice().sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  }, [dataset.subjects, subjectIds]);

  // Saved values currently in the store, per subject (for dirty / re-edit detection).
  const initial = useMemo<ValMap>(() => {
    const m: ValMap = {};
    for (const s of subjects) {
      m[s.id] = {};
      const inst = dataset.formInstances.find((i) => i.subject_id === s.id && i.form_id === formId);
      if (inst) for (const fv of dataset.fieldValues.filter((v) => v.form_instance_id === inst.id)) m[s.id][fv.form_field_id] = fv.value ?? "";
    }
    return m;
  }, [dataset.formInstances, dataset.fieldValues, subjects, formId]);

  const [values, setValues] = useState<ValMap>(() => JSON.parse(JSON.stringify(initial)));
  const [search, setSearch] = useState("");
  const [siteF, setSiteF] = useState("");
  const [barnF, setBarnF] = useState("");
  const [penF, setPenF] = useState("");
  const [rfcReason, setRfcReason] = useState("");
  const [rfcOther, setRfcOther] = useState("");
  const [perRow, setPerRow] = useState(false);
  const [perRowReason, setPerRowReason] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const ageBySubject = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, ageMonthsOf(dataset, s.id)])), [dataset, subjects]);
  const penName = (s: SubjectRow) => dataset.pens.find((p) => p.id === s.pen_id)?.name ?? dataset.barns.find((b) => b.id === s.barn_id)?.name ?? "—";
  const meta = (s: SubjectRow) => {
    const age = ageBySubject[s.id];
    return [s.randomization_arm, age != null ? `${age <= 6 ? "calf" : "adult"} ${age}mo` : null, penName(s)].filter(Boolean).join(" · ");
  };

  const v = (sid: string, fid: string) => values[sid]?.[fid] ?? "";
  const init = (sid: string, fid: string) => initial[sid]?.[fid] ?? "";
  const cellCheck = (field: FormFieldRow, value: string, sid: string) => evaluateField(field, value, species, dataset.speciesRanges, ageBySubject[sid]);
  const isDirty = (sid: string, fid: string) => init(sid, fid) !== "" && v(sid, fid) !== init(sid, fid);
  const rowHasData = (sid: string) => cols.some((f) => v(sid, f.id) !== "");
  const rowAlerts = (sid: string) => cols.filter((f) => !!cellCheck(f, v(sid, f.id), sid)).length;
  const rowDirty = (sid: string) => cols.some((f) => isDirty(sid, f.id));

  function setCell(sid: string, fid: string, value: string) {
    setValues((prev) => ({ ...prev, [sid]: { ...(prev[sid] ?? {}), [fid]: value } }));
  }

  // ── Filtering (display only — submit saves the whole scope that has data) ────
  const sites = dataset.sites.filter((s) => s.study_id === studyId);
  const barns = dataset.barns.filter((b) => sites.some((s) => s.id === b.site_id) && (!siteF || b.site_id === siteF));
  const pens = dataset.pens.filter((p) => barns.some((b) => b.id === p.barn_id) && (!barnF || p.barn_id === barnF));
  const visible = subjects.filter((s) => {
    if (search && !s.subject_code.toLowerCase().includes(search.toLowerCase())) return false;
    if (siteF && s.site_id !== siteF) return false;
    if (barnF && s.barn_id !== barnF) return false;
    if (penF && s.pen_id !== penF) return false;
    return true;
  });

  // ── Reason-for-change bar visibility + effective reason ─────────────────────
  const anyDirty = subjects.some((s) => rowDirty(s.id));
  const reasonText = rfcReason === "Other" ? rfcOther.trim() : rfcReason;
  const reasonReady = !anyDirty || (perRow ? subjects.every((s) => !rowDirty(s.id) || (perRowReason[s.id] ?? "")) : !!reasonText);

  // ── Summary ─────────────────────────────────────────────────────────────────
  let savedN = 0, alertN = 0, emptyN = 0;
  for (const s of visible) {
    if (rowAlerts(s.id) > 0) alertN += 1;
    else if (!rowHasData(s.id)) emptyN += 1;
    else savedN += 1; // has data, no alert → will be saved
  }
  const submitDisabled = visible.every((s) => !rowHasData(s.id)) || !reasonReady;

  // ── Submit — mirror every row with data to its own form instance ────────────
  function submitAll() {
    let saved = 0, withAlerts = 0, skipped = 0;
    update((d: Dataset) => {
      for (const s of subjects) {
        if (!rowHasData(s.id)) { skipped += 1; continue; }
        const reason = perRow ? (perRowReason[s.id] || reasonText || "Data correction") : (reasonText || "Data correction");
        let inst = d.formInstances.find((i) => i.subject_id === s.id && i.form_id === formId);
        if (!inst) { inst = { id: newId(), form_id: formId, subject_id: s.id, barn_id: null, site_id: null, status: "in_work" }; d.formInstances.push(inst); }
        else if (inst.status === "empty") inst.status = "in_work";
        let hadAlert = false;
        for (const f of cols) {
          const value = v(s.id, f.id);
          if (value === "") continue;
          let fv = d.fieldValues.find((x) => x.form_instance_id === inst!.id && x.form_field_id === f.id);
          const prev = fv?.value ?? "";
          if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: f.id, value }; d.fieldValues.push(fv); }
          else fv.value = value;
          // Re-edit of a previously-saved value → record a change-reason delta (the
          // CRC's reason from the bar), mirrored to the Subject Record's Δ flow.
          if (prev !== "" && prev !== value) {
            d.deltaRecords.push({ id: newId(), field_value_id: fv.id, old_value: prev, new_value: value, reason, author_name: ndaName, author_role: activeRole, created_at: new Date().toISOString(), status: "responded" });
          }
          // Edit check — open on out-of-range, resolve when back in range.
          const check = evaluateField(f, value, species, d.speciesRanges, ageMonthsOf(d, s.id));
          const ec = d.editChecks.find((e) => e.field_value_id === fv!.id && e.status === "open");
          if (check) { hadAlert = true; if (!ec) d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() }); else ec.message = check.message; }
          else if (ec) ec.status = "resolved";
        }
        saved += 1;
        if (hadAlert) withAlerts += 1;
      }
    });
    setToast(`${saved} record${saved === 1 ? "" : "s"} saved · ${withAlerts} with alerts · ${skipped} empty`);
  }

  if (!form) return <div className="be-screen"><div className="grid-empty">Form not found.</div></div>;
  const day = visitDayOf(form);

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
          <div className="grid-title">{form.name}{day != null ? "" : ""}</div>
        </div>
        <div className="grid-header-right">
          <button className="btn-secondary" type="button" onClick={onExitOrigin}><i className="ti ti-arrow-left"></i> Exit batch</button>
          <button className="btn-primary" type="button" disabled={submitDisabled} onClick={submitAll}><i className="ti ti-check"></i> Submit all</button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="grid-toolbar">
        <div className="search-box">
          <i className="ti ti-search"></i>
          <input type="search" placeholder="Search animal ID…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={siteF} onChange={(e) => { setSiteF(e.target.value); setBarnF(""); setPenF(""); }}>
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="filter-select" value={barnF} onChange={(e) => { setBarnF(e.target.value); setPenF(""); }}>
          <option value="">All barns</option>
          {barns.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="filter-select" value={penF} onChange={(e) => setPenF(e.target.value)}>
          <option value="">All pens</option>
          {pens.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <span className="tb-count">{visible.length} animal{visible.length === 1 ? "" : "s"}</span>
      </div>

      {/* Grid */}
      <div className="grid-wrap">
        <table className="batch-table">
          <thead>
            <tr>
              <th className="th-subject"><div className="th-subject-inner"><span className="th-hdr-label">Animal</span></div></th>
              {cols.map((f) => (
                <th className="th-field" key={f.id}>
                  <div className="field-col-header">
                    <div className="field-col-name">{f.label}{f.is_required ? <span className="req"> *</span> : ""}</div>
                    <div className="field-col-unit">{f.unit || ""}</div>
                  </div>
                </th>
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
              const dirty = rowDirty(s.id);
              return (
                <tr key={s.id}>
                  <td className="td-subject"><div className="td-subject-inner"><div className="subj-id">{s.subject_code}</div><div className="subj-meta">{meta(s)}</div></div></td>
                  {cols.map((f) => {
                    const value = v(s.id, f.id);
                    const check = cellCheck(f, value, s.id);
                    const dirtyCell = isDirty(s.id, f.id);
                    return (
                      <td className="batch-cell" key={f.id}>
                        {renderCell(f, value, (val) => setCell(s.id, f.id, val), !!check, dirtyCell)}
                        <span className={`val-hint${check ? " warn" : ""}`}>{check ? `Normal: ${check.range.min}–${check.range.max}${check.range.unit ? ` ${check.range.unit}` : ""}` : ""}</span>
                      </td>
                    );
                  })}
                  <td className="td-status">
                    {rowStatusBadge(alerts, hasData, dirty, init, s.id, cols, v)}
                    {alerts > 0 && <div><span className="ec-chip"><i className="ti ti-alert-circle"></i> EC- {alerts}</span></div>}
                    {perRow && dirty && (
                      <select className="rrfc-select" value={perRowReason[s.id] ?? ""} onChange={(e) => setPerRowReason((p) => ({ ...p, [s.id]: e.target.value }))}>
                        <option value="">Reason…</option>
                        {RFC_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reason-for-change bar */}
      <div className={`rfc-bar${anyDirty ? " visible" : ""}`}>
        <div className="rfc-bar-label"><i className="ti ti-pencil"></i> Reason for change</div>
        <select className="rfc-bar-select" disabled={perRow} value={rfcReason} onChange={(e) => setRfcReason(e.target.value)}>
          <option value="">Select reason for all changes…</option>
          {RFC_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {rfcReason === "Other" && !perRow && <input className="rfc-bar-text" placeholder="Specify reason…" value={rfcOther} onChange={(e) => setRfcOther(e.target.value)} />}
        <span className="rfc-bar-note">{perRow ? "Per-row reasons · " : "Applies to all modified cells · "}<span className={perRow ? "active" : ""} onClick={() => setPerRow((o) => !o)}>{perRow ? "Use one reason" : "Override per row"}</span></span>
      </div>

      {/* Summary */}
      <div className="grid-summary">
        <span>Showing: <span className="sv">{visible.length} animals</span></span>
        <span>To save: <span className="sv ok">{savedN}</span></span>
        <span>With alerts: <span className="sv warn">{alertN}</span></span>
        <span>Empty: <span className="sv">{emptyN}</span></span>
        <span style={{ marginLeft: "auto" }}>{form.name}</span>
      </div>

      {toast && <div className="be-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button className="be-toast-x" type="button" onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}

function rowStatusBadge(alerts: number, hasData: boolean, dirty: boolean, init: (s: string, f: string) => string, sid: string, cols: FormFieldRow[], v: (s: string, f: string) => string) {
  if (alerts > 0) return <span className="row-badge rb-alert"><i className="ti ti-alert-triangle"></i> Alert</span>;
  if (!hasData) return <span className="row-badge rb-empty"><i className="ti ti-circle"></i> Empty</span>;
  // "Saved" when every filled cell matches the stored value (nothing pending); else In-progress.
  const allSaved = cols.every((f) => v(sid, f.id) === init(sid, f.id)) && cols.some((f) => init(sid, f.id) !== "");
  if (allSaved && !dirty) return <span className="row-badge rb-ready"><i className="ti ti-check"></i> Saved</span>;
  return <span className="row-badge rb-partial"><i className="ti ti-pencil"></i> In-progress</span>;
}

function renderCell(field: FormFieldRow, value: string, onChange: (v: string) => void, warn: boolean, dirty: boolean) {
  const t = field.field_type;
  const stateCls = warn ? " warn" : dirty ? " dirty" : value ? " filled" : "";
  if (t === "radio") {
    const opts = field.options?.length ? field.options : ["Yes", "No"];
    return (
      <div className={`batch-yn${value ? " filled" : ""}`}>
        {opts.map((o) => <button key={o} type="button" className={`batch-yn-btn${value === o ? " active" : ""}`} onClick={() => onChange(value === o ? "" : o)}>{o}</button>)}
      </div>
    );
  }
  if (t === "select" || t === "multiselect") {
    const cur = t === "multiselect" ? (() => { try { return JSON.parse(value || "[]")[0] ?? ""; } catch { return value; } })() : value;
    return (
      <select className={`batch-select${stateCls}`} value={cur} onChange={(e) => onChange(t === "multiselect" ? (e.target.value ? JSON.stringify([e.target.value]) : "") : e.target.value)}>
        <option value="">—</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (t === "date" || t === "datetime") {
    return <input type="date" className={`batch-input sans${stateCls}`} value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  const numeric = t === "number" || t === "integer";
  return <input type="text" inputMode={numeric ? "decimal" : undefined} autoComplete="off" className={`batch-input${numeric ? "" : " sans"}${stateCls}`} value={value} onChange={(e) => onChange(e.target.value)} />;
}
