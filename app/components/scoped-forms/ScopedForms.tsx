"use client";

// ════════════════════════════════════════════════════════════════════════════
// Scoped form flow — renders site-/barn-scoped forms (instances keyed by site_id
// or barn_id, not subject_id). Two exports:
//   • ScopedFormFlow      — the record's Forms tab: a form list + content area.
//       One-time forms render as a sectioned read/write grid with a Submit-for-
//       review button; recurring/log forms render as a table + slide-in panel.
//   • ScopedRepeatingTable — a single repeating form's table + add/edit panel,
//       reused directly in the Overview tab (Equipment Calibration, Continuing
//       Review).
// All edits go through the session store; static ranges auto-raise edit checks,
// required fields block save, range hints show under numeric fields.
// ════════════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import { ScopedFormRenderer } from "./ScopedFormRenderer";
import type { Dataset, FormFieldRow, FormRow } from "@/lib/session-store/types";
import "./scoped-forms.css";

type Scope = "site" | "barn";

// Forms that render as a repeating table (one row per instance). Everything else
// is a one-time sectioned form (a single instance).
export const SCOPED_REPEATING = new Set([
  "Site Staff & Delegation Log",
  "Monitoring Visit Reports",
  "Protocol Amendments",
  "Continuing Review",
  "Feed Delivery Log",
  "Equipment Calibration Log",
  "Daily Environmental Log",
]);

// Table columns per repeating form. `compute` columns are derived, not stored.
type Col = { code?: string; label: string; compute?: "status" | "flags"; trunc?: boolean };
const COLUMNS: Record<string, Col[]> = {
  "Site Staff & Delegation Log": [
    { code: "staff_name", label: "Staff Name" }, { code: "role", label: "Role" },
    { code: "gcp_training_date", label: "GCP Training" }, { code: "gcp_expiry", label: "GCP Expiry" },
    { code: "protocol_training_date", label: "Protocol Training" }, { code: "delegated_tasks", label: "Delegated Tasks", trunc: true },
    { code: "active_at_site", label: "Active" },
  ],
  "Monitoring Visit Reports": [
    { code: "visit_date", label: "Visit Date" }, { code: "visit_type", label: "Type" },
    { code: "cra_name", label: "CRA" }, { code: "findings_summary", label: "Findings", trunc: true },
    { code: "report_submitted", label: "Submitted" },
  ],
  "Protocol Amendments": [
    { code: "protocol_version", label: "Version" }, { code: "amendment_date", label: "Amendment Date" },
    { code: "iec_approval_date", label: "IEC Approval" }, { code: "amendment_summary", label: "Summary", trunc: true },
    { code: "status", label: "Status" },
  ],
  "Continuing Review": [
    { code: "review_date", label: "Review Date" }, { code: "renewed_until", label: "Renewed Until" }, { code: "outcome", label: "Outcome" },
  ],
  "Feed Delivery Log": [
    { code: "delivery_date", label: "Delivery Date" }, { code: "feed_lot_number", label: "Lot Number" },
    { code: "supplier", label: "Supplier" }, { code: "quantity_kg", label: "Quantity kg" },
    { code: "feed_phase", label: "Feed Phase" }, { code: "quality_check", label: "Quality Check" },
  ],
  "Equipment Calibration Log": [
    { code: "equipment_name", label: "Equipment" }, { code: "serial_number", label: "Serial No" },
    { code: "last_calibration", label: "Last Calibration" }, { code: "next_due", label: "Next Due" },
    { compute: "status", label: "Status" },
  ],
  "Daily Environmental Log": [
    { code: "log_date", label: "Date" }, { code: "temp_morning", label: "Morning Temp °C" }, { code: "temp_evening", label: "Evening Temp °C" },
    { code: "ammonia_ppm", label: "Ammonia ppm" }, { code: "co2_ppm", label: "CO₂ ppm" }, { code: "rh_morning", label: "Humidity %" },
  ],
};
const ADD_LABEL: Record<string, string> = {
  "Site Staff & Delegation Log": "Add staff member",
  "Monitoring Visit Reports": "Log monitoring visit",
  "Protocol Amendments": "Add amendment",
  "Continuing Review": "Add review",
  "Feed Delivery Log": "Log delivery",
  "Equipment Calibration Log": "Add equipment",
  "Daily Environmental Log": "New daily log",
};

const today = () => new Date();
const daysUntil = (iso: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - today().getTime()) / 86400000);
};
// Equipment calibration status from the next-due date.
export function calibrationStatus(nextDue: string): "current" | "due" | "overdue" {
  const n = daysUntil(nextDue);
  if (n == null) return "current";
  if (n < 0) return "overdue";
  if (n <= 14) return "due";
  return "current";
}

function parseMulti(v: string): string[] {
  try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []; }
}

// ─── Shared data helpers (one hook, reused by both exports) ───────────────────
function useScoped(studyId: string, scope: Scope, scopeId: string) {
  const { dataset, update } = useStudySession();
  const species = dataset.studies.find((s) => s.id === studyId)?.species ?? "chicken";
  const ranges = dataset.speciesRanges;
  const instancesFor = (formId: string) =>
    dataset.formInstances.filter((i) => i.form_id === formId && (scope === "site" ? i.site_id === scopeId : i.barn_id === scopeId));
  const fieldsFor = (formId: string) => dataset.formFields.filter((f) => f.form_id === formId).slice().sort((a, b) => a.sequence - b.sequence);
  const valueOf = (instId: string, fieldId: string) => dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.value ?? "";
  const valByCode = (instId: string, fields: FormFieldRow[], code: string) => { const f = fields.find((x) => x.code === code); return f ? valueOf(instId, f.id) : ""; };
  function setValue(instId: string, field: FormFieldRow, value: string) {
    update((d: Dataset) => {
      const row = d.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === field.id);
      if (row) row.value = value; else d.fieldValues.push({ id: crypto.randomUUID(), form_instance_id: instId, form_field_id: field.id, value });
      const fi = d.formInstances.find((i) => i.id === instId);
      if (fi && fi.status === "empty") fi.status = "in_work";
    });
  }
  function addInstance(formId: string): string {
    const id = crypto.randomUUID();
    update((d: Dataset) => d.formInstances.push({ id, form_id: formId, subject_id: null, barn_id: scope === "barn" ? scopeId : null, site_id: scope === "site" ? scopeId : null, status: "in_work" }));
    return id;
  }
  function deleteInstance(instId: string) {
    update((d: Dataset) => {
      d.formInstances = d.formInstances.filter((i) => i.id !== instId);
      d.fieldValues = d.fieldValues.filter((v) => v.form_instance_id !== instId);
    });
  }
  function setStatus(instId: string, status: string) {
    update((d: Dataset) => { const fi = d.formInstances.find((i) => i.id === instId); if (fi) fi.status = status; });
  }
  return { dataset, species, ranges, instancesFor, fieldsFor, valueOf, valByCode, setValue, addInstance, deleteInstance, setStatus };
}

// ─── A single editable field (label + control + hint / edit-check / required) ──
// Validation states only surface AFTER the user touches the field (focus→blur or
// a change) or the parent forces it on a submit attempt — never pre-emptively.
function ScopedField({ field, value, onChange, species, ranges, forceShow }: {
  field: FormFieldRow; value: string; onChange: (v: string) => void; species: string; ranges: Dataset["speciesRanges"]; forceShow?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const change = (v: string) => { setTouched(true); onChange(v); };
  const touch = () => setTouched(true);
  const ec = evaluateField(field, value, species, ranges); // value-based → never fires while empty
  const missing = field.is_required && value.trim() === "" && (touched || !!forceShow);
  const cls = ec ? " warn" : missing ? " err" : "";
  const hint = rangeLabel(field, species, ranges);
  const opts = field.options ?? [];
  const wide = field.field_type === "textarea" || field.field_type === "multiselect";
  return (
    <div className={`scf-field${wide ? " full" : ""}`}>
      <label className="scf-label">{field.label}{field.is_required && <span className="req"> *</span>}{field.unit ? ` (${field.unit})` : ""}</label>
      {field.field_type === "textarea" ? (
        <textarea className={`scf-textarea${cls}`} value={value} onChange={(e) => change(e.target.value)} onBlur={touch} rows={2} />
      ) : field.field_type === "multiselect" ? (
        <div className="scf-checks">
          {opts.map((o) => { const set = parseMulti(value); const on = set.includes(o);
            return <label className="scf-check" key={o}><input type="checkbox" checked={on} onChange={() => change(JSON.stringify(on ? set.filter((x) => x !== o) : [...set, o]))} /> {o}</label>; })}
        </div>
      ) : opts.length > 0 ? (
        <select className={`scf-select${cls}`} value={value} onChange={(e) => change(e.target.value)} onBlur={touch}>
          <option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.field_type === "calculated" ? (
        <div className="scf-readonly">{value || "—"}</div>
      ) : (
        <input className={`scf-input${field.field_type === "number" ? " mono" : ""}${cls}`} type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"} value={value} onChange={(e) => change(e.target.value)} onBlur={touch} />
      )}
      {ec ? <div className="scf-alert"><i className="ti ti-alert-triangle"></i> {ec.message}</div>
        : missing ? <div className="scf-required"><i className="ti ti-asterisk" style={{ fontSize: 10 }}></i> Required</div>
        : hint ? <div className="scf-hint">{hint}</div> : null}
    </div>
  );
}

// ─── Repeating form: table + slide-in entry panel ─────────────────────────────
export function ScopedRepeatingTable({ studyId, scope, scopeId, form }: { studyId: string; scope: Scope; scopeId: string; form: FormRow }) {
  const s = useScoped(studyId, scope, scopeId);
  const fields = s.fieldsFor(form.id);
  const instances = s.instancesFor(form.id);
  const cols = COLUMNS[form.name] ?? fields.slice(0, 4).map((f) => ({ code: f.code, label: f.label }));
  const [panelInst, setPanelInst] = useState<string | null>(null);
  const inst = panelInst ? instances.find((i) => i.id === panelInst) : undefined;
  const requiredMissing = !!inst && fields.some((f) => f.is_required && s.valueOf(inst.id, f.id).trim() === "");

  const cell = (instId: string, c: Col) => {
    if (c.compute === "status") { const st = calibrationStatus(s.valByCode(instId, fields, "next_due")); return <span className={`scf-status-pill ${st}`}>{st === "due" ? "Due Soon" : st === "overdue" ? "Overdue" : "Current"}</span>; }
    if (c.compute === "flags") { const n = ["temp_morning", "temp_evening", "rh_morning", "rh_evening", "co2_ppm", "ammonia_ppm"].filter((code) => { const f = fields.find((x) => x.code === code); return f && evaluateField(f, s.valueOf(instId, f.id), s.species, s.ranges); }).length; return n > 0 ? <span style={{ color: "var(--amber-700)", fontWeight: 600 }}><i className="ti ti-alert-triangle"></i> {n}</span> : <span className="scf-hint">—</span>; }
    const raw = s.valByCode(instId, fields, c.code!);
    const f = fields.find((x) => x.code === c.code);
    const disp = f?.field_type === "multiselect" ? parseMulti(raw).join(", ") : raw;
    return <span className={c.trunc ? "trunc" : ""} title={c.trunc ? disp : undefined}>{disp || "—"}</span>;
  };

  return (
    <div>
      <div className="scf-toolbar">
        <span className="scf-count">{instances.length} {instances.length === 1 ? "entry" : "entries"}</span>
        <button className="st-btn-secondary" type="button" onClick={() => setPanelInst(s.addInstance(form.id))}><i className="ti ti-plus"></i> {ADD_LABEL[form.name] ?? "Add entry"}</button>
      </div>
      {instances.length === 0 ? (
        <div className="scf-empty">No entries yet.</div>
      ) : (
        <table className="scf-table">
          <thead><tr>{cols.map((c, i) => <th key={i}>{c.label}</th>)}<th></th></tr></thead>
          <tbody>
            {instances.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => setPanelInst(i.id)}>
                {cols.map((c, ci) => <td key={ci} className={c.code && fields.find((f) => f.code === c.code)?.field_type === "date" ? "mono" : ""}>{cell(i.id, c)}</td>)}
                <td className="scf-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="scf-icon-btn" title="Edit" type="button" onClick={() => setPanelInst(i.id)}><i className="ti ti-pencil"></i></button>
                  <button className="scf-icon-btn" title="Delete" type="button" onClick={() => s.deleteInstance(i.id)}><i className="ti ti-trash"></i></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {inst && (
        <>
          <div className="scf-overlay" onClick={() => setPanelInst(null)} />
          <div className="scf-panel">
            <div className="scf-panel-head"><div className="scf-panel-title">{form.name}</div><button className="scf-panel-close" type="button" onClick={() => setPanelInst(null)}><i className="ti ti-x"></i></button></div>
            <div className="scf-panel-body">
              {fields.map((f) => <ScopedField key={f.id} field={f} value={s.valueOf(inst.id, f.id)} onChange={(v) => s.setValue(inst.id, f, v)} species={s.species} ranges={s.ranges} />)}
            </div>
            <div className="scf-panel-foot">
              {requiredMissing && <span className="scf-panel-note">Complete required fields to save</span>}
              <button className="st-btn-primary" type="button" disabled={requiredMissing} onClick={() => setPanelInst(null)}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Recurring/log form: a repeating TABLE + a slide-in panel running the full
// ScopedFormRenderer flow (edit checks fire inline, ammonia >25 / temp out of
// range → EC-). One row per entry; an Alerts column counts the row's open edit
// checks; Status shows the instance status. Scales to 40+ rows (no per-day tabs).
function ScopedLogTable({ studyId, scope, scopeId, form, topNote }: { studyId: string; scope: Scope; scopeId: string; form: FormRow; topNote?: string }) {
  const s = useScoped(studyId, scope, scopeId);
  const fields = s.fieldsFor(form.id);
  const instances = s.instancesFor(form.id);
  const cols = COLUMNS[form.name] ?? fields.slice(0, 5).map((f) => ({ code: f.code, label: f.label }));
  const [panelInst, setPanelInst] = useState<string | null>(null);
  const openEcCount = (instId: string) => s.dataset.editChecks.filter((e) => e.form_instance_id === instId && e.status === "open").length;
  const statusLabel = (st: string) => (st === "in_work" ? "In-Work" : st === "in_review" ? "In-Review" : st.charAt(0).toUpperCase() + st.slice(1));

  return (
    <div>
      {topNote && <div className="scf-banner note"><i className="ti ti-info-circle"></i> {topNote}</div>}
      <div className="scf-toolbar">
        <span className="scf-count">{instances.length} {instances.length === 1 ? "entry" : "entries"}</span>
        <button className="st-btn-secondary" type="button" onClick={() => setPanelInst(s.addInstance(form.id))}><i className="ti ti-plus"></i> {ADD_LABEL[form.name] ?? "New entry"}</button>
      </div>
      {instances.length === 0 ? (
        <div className="scf-empty">No entries yet.</div>
      ) : (
        <table className="scf-table">
          <thead><tr>{cols.map((c, i) => <th key={i}>{c.label}</th>)}<th>Alerts</th><th>Status</th></tr></thead>
          <tbody>
            {instances.map((i) => {
              const ecN = openEcCount(i.id);
              return (
                <tr key={i.id} className="clickable" onClick={() => setPanelInst(i.id)}>
                  {cols.map((c, ci) => { const f = fields.find((x) => x.code === c.code); const raw = c.code ? s.valByCode(i.id, fields, c.code) : ""; const disp = f?.field_type === "multiselect" ? parseMulti(raw).join(", ") : raw; return <td key={ci} className={f?.field_type === "date" ? "mono" : ""}><span className={c.trunc ? "trunc" : ""}>{disp || "—"}</span></td>; })}
                  <td>{ecN > 0 ? <span className="scf-status-pill overdue"><i className="ti ti-alert-circle"></i> {ecN}</span> : <span className="scf-hint">—</span>}</td>
                  <td><span className={`scf-status-pill ${i.status === "reviewed" || i.status === "finalized" || i.status === "locked" ? "current" : "due"}`}>{statusLabel(i.status)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {panelInst && (
        <>
          <div className="scf-overlay" onClick={() => setPanelInst(null)} />
          <div className="scf-panel" style={{ width: 420 }}>
            <div className="scf-panel-head"><div className="scf-panel-title">{form.name}</div><button className="scf-panel-close" type="button" onClick={() => setPanelInst(null)}><i className="ti ti-x"></i></button></div>
            <div className="scf-panel-body" style={{ padding: "var(--space-4)" }}>
              <ScopedFormRenderer key={panelInst} studyId={studyId} scope={scope} scopeId={scopeId} form={form} instanceId={panelInst} panel />
            </div>
            <div className="scf-panel-foot"><button className="st-btn-primary" type="button" onClick={() => setPanelInst(null)}>Done</button></div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Forms tab: form list + content (each form rendered with the FULL flow) ────
export function ScopedFormFlow({ studyId, scope, scopeId, exclude = [], topNote }: { studyId: string; scope: Scope; scopeId: string; exclude?: string[]; topNote?: Record<string, string> }) {
  const s = useScoped(studyId, scope, scopeId);
  const forms = s.dataset.forms
    .filter((f) => f.study_id === studyId && f.scope === scope && !exclude.includes(f.name))
    .slice().sort((a, b) => a.sequence - b.sequence);
  const [selId, setSelId] = useState<string | null>(null);
  const pendingRef = useRef<Record<string, string>>({}); // one-time forms not yet saved
  const form = forms.find((f) => f.id === selId) ?? forms[0];

  if (forms.length === 0) return <div className="scf-empty">No {scope === "site" ? "site" : "house"}-level forms for this study.</div>;

  const glyphFor = (f: FormRow) => {
    const insts = s.instancesFor(f.id);
    if (insts.length === 0) return "empty";
    if (insts.every((i) => i.status === "reviewed" || i.status === "finalized" || i.status === "locked")) return "reviewed";
    return "in_work";
  };

  const recurring = form ? SCOPED_REPEATING.has(form.name) : false;
  // One-time forms: a single instance (a stable generated id until first saved).
  const oneTimeId = !form || recurring ? undefined : (s.instancesFor(form.id)[0]?.id ?? (pendingRef.current[form.id] ||= crypto.randomUUID()));

  return (
    <div className="scf">
      <div className="scf-list">
        <div className="scf-list-label">Forms</div>
        {forms.map((f) => (
          <button key={f.id} className={`scf-list-item${f.id === form?.id ? " active" : ""}`} type="button" onClick={() => setSelId(f.id)} title={f.name}>
            <span className="scf-name">{f.name}</span>
            <span className={`scf-glyph ${glyphFor(f)}`}></span>
          </button>
        ))}
      </div>
      <div className="scf-content">
        {form && (recurring
          ? <ScopedLogTable studyId={studyId} scope={scope} scopeId={scopeId} form={form} topNote={topNote?.[form.name]} />
          : oneTimeId
          ? <>
              {topNote?.[form.name] && <div className="scf-banner note"><i className="ti ti-info-circle"></i> {topNote[form.name]}</div>}
              <ScopedFormRenderer key={oneTimeId} studyId={studyId} scope={scope} scopeId={scopeId} form={form} instanceId={oneTimeId} />
            </>
          : null)}
      </div>
    </div>
  );
}
