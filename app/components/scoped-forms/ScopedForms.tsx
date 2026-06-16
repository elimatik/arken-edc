"use client";

// ════════════════════════════════════════════════════════════════════════════
// Scoped form flow — renders site-/barn-scoped forms (instances keyed by site_id
// or barn_id, not subject_id). Laid out to match the Subject Record exactly:
//   • ScopedFormFlow      — the record's Forms tab: a Subject-Record-style sidebar
//       (.form-sidebar with status glyphs / query badges / SDV shields) + a form
//       content pane with a sticky header (title + Remarks + status CTA) over a
//       scrolling body. One-time forms render as a sectioned field grid; repeating
//       forms render as a table + a fields-only slide-in entry panel. The Remarks
//       modes (Queries / SDV) and the Submit/Finalize/Lock CTA live at the FORM
//       level and apply to the whole form (all entries together for a repeating
//       form).
//   • ScopedRepeatingTable — a single repeating form's table + add/edit panel,
//       reused directly in the Overview tab (Equipment Calibration, Continuing
//       Review).
// All edits go through the session store; static ranges auto-raise edit checks,
// required fields block save, range hints show under numeric fields.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { canSDV } from "@/lib/permissions";
import { useNdaName } from "@/lib/use-nda-name";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import { ScopedFieldGrid, isSdvEligible } from "./ScopedFieldGrid";
import { StatusGlyph, SidebarSdv, iconForInstance, ICON_LABEL, STATUS_LABEL, type SidebarIcon } from "@/components/subject-record/status-icons";
import type { Dataset, FormFieldRow, FormRow } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./scoped-forms.css";

type Scope = "site" | "barn";

const newId = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);
const STATUS_CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const STATUS_RANK: Record<string, number> = { empty: 0, in_work: 1, in_review: 2, reviewed: 3, finalized: 4, locked: 5 };
const STATUS_FLOW: Record<string, { next: string; label: string; roles: string[]; esign?: boolean }> = {
  in_work: { next: "in_review", label: "Submit for Review", roles: ["CRC", "CRA"] },
  in_review: { next: "reviewed", label: "Mark Reviewed", roles: ["CRA", "DM", "PI"] },
  reviewed: { next: "finalized", label: "Finalize", roles: ["PI", "DM"] },
  finalized: { next: "locked", label: "Lock", roles: ["DM"], esign: true },
};

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

// ─── Shared data helpers (one hook, reused by every export) ───────────────────
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
  return { dataset, update, species, ranges, instancesFor, fieldsFor, valueOf, valByCode, setValue, addInstance, deleteInstance, setStatus };
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

// ─── Repeating form: table + slide-in entry panel (Overview-tab cards) ────────
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

// ─── A single form's content pane — Subject-Record-style sticky header (title +
// Remarks + status CTA) over a scrolling body. One-time forms render the field
// grid directly; repeating forms render a table + a fields-only slide-in entry
// panel. The Remarks modes and the CTA are form-level and apply to the whole form
// (all entries together for a repeating form). ───────────────────────────────
function ScopedFormView({ studyId, scope, scopeId, form, modeQueries, modeSdv, setModeQueries, setModeSdv, topNote }: {
  studyId: string; scope: Scope; scopeId: string; form: FormRow;
  modeQueries: boolean; modeSdv: boolean; setModeQueries: (f: (m: boolean) => boolean) => void; setModeSdv: (f: (m: boolean) => boolean) => void; topNote?: string;
}) {
  const s = useScoped(studyId, scope, scopeId);
  const { dataset, update } = s;
  const { activeRole } = useShell();
  const ndaName = useNdaName();
  const canSdv = canSDV(activeRole);

  const repeating = SCOPED_REPEATING.has(form.name);
  const fields = s.fieldsFor(form.id);
  const instances = s.instancesFor(form.id);
  const cols = COLUMNS[form.name] ?? fields.slice(0, 5).map((f) => ({ code: f.code, label: f.label }));

  const [remarksOpen, setRemarksOpen] = useState(false);
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [lockPassword, setLockPassword] = useState("");
  const [entryInst, setEntryInst] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);

  // One-time forms: a single instance (a stable generated id until first saved).
  const singleId = repeating ? null : (instances[0]?.id ?? (pendingRef.current ||= crypto.randomUUID()));
  // Instances the form-level status / SDV / Submit act on.
  const targetInstances = repeating ? instances : instances.filter((i) => i.id === singleId);

  // Form-level status = the weakest status among the target instances (empty if none).
  const formStatus = repeating
    ? (instances.length ? instances.reduce<string>((acc, i) => (STATUS_RANK[i.status] < STATUS_RANK[acc] ? i.status : acc), "locked") : "empty")
    : (instances.find((i) => i.id === singleId)?.status ?? "empty");
  const locked = formStatus === "locked";
  const flow = STATUS_FLOW[formStatus];
  const canAdvance = !!flow && flow.roles.includes(activeRole);

  // ─── Form-level gating + helpers (over every target instance) ───────────────
  const fvIdOf = (instId: string, fieldId: string) => dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.id;
  const instHasData = (instId: string) => fields.some((f) => s.valueOf(instId, f.id).trim() !== "");
  const instOpenEC = (instId: string) => fields.some((f) => { const id = fvIdOf(instId, f.id); return !!id && dataset.editChecks.some((e) => e.field_value_id === id && e.status === "open"); });
  const instPendingDelta = (instId: string) => fields.some((f) => { const id = fvIdOf(instId, f.id); return !!id && dataset.deltaRecords.some((r) => r.field_value_id === id && r.status === "pending"); });
  const instEmptyRequired = (instId: string) => fields.some((f) => f.is_required && s.valueOf(instId, f.id).trim() === "");

  const formHasData = targetInstances.some((i) => instHasData(i.id));
  const hasOpenEditCheck = targetInstances.some((i) => instOpenEC(i.id));
  const hasPendingDelta = targetInstances.some((i) => instPendingDelta(i.id));
  const hasEmptyRequired = targetInstances.some((i) => instEmptyRequired(i.id));
  const submitBlocked = hasOpenEditCheck || hasPendingDelta || hasEmptyRequired;
  const submitBlockReason = hasEmptyRequired ? "Complete all required fields first" : hasOpenEditCheck ? "Resolve all edit checks first" : hasPendingDelta ? "Provide all change reasons first" : undefined;

  const openEcCount = (instId: string) => dataset.editChecks.filter((e) => e.form_instance_id === instId && e.status === "open").length;
  const allSdvComplete = targetInstances.length > 0 && targetInstances.every((i) => i.sdv_complete);

  function applyStatus(next: string) {
    update((d: Dataset) => { for (const t of targetInstances) { const inst = d.formInstances.find((i) => i.id === t.id); if (inst) inst.status = next; } });
  }
  function advanceStatus() {
    if (!flow || !canAdvance) return;
    if (flow.esign) { setLockModalOpen(true); return; }
    applyStatus(flow.next);
  }
  function confirmLock() { if (!lockPassword.trim()) return; applyStatus("locked"); setLockPassword(""); setLockModalOpen(false); }

  // SDV blocking for a field on an instance (form-level; mirrors the per-field rule).
  function sdvBlocked(d: Dataset, instId: string, field: FormFieldRow, fvId: string): boolean {
    if (d.editChecks.some((e) => e.field_value_id === fvId && e.status === "open")) return true;
    if (d.deltaRecords.some((r) => r.field_value_id === fvId && r.status === "pending")) return true;
    const q = d.queries.filter((x) => x.field_value_id === fvId).find((x) => x.status === "open" || x.status === "responded");
    return !!q;
  }
  function verifyAll() {
    if (!canSdv || locked) return;
    update((d: Dataset) => {
      for (const t of targetInstances) {
        for (const f of fields.filter(isSdvEligible)) {
          const fv = d.fieldValues.find((v) => v.form_instance_id === t.id && v.form_field_id === f.id);
          if (!fv || (fv.value ?? "") === "" || sdvBlocked(d, t.id, f, fv.id)) continue;
          const rec = d.sdvRecords.find((r) => r.field_value_id === fv.id);
          if (rec) { rec.status = "verified"; rec.verified_by_name = ndaName; rec.verified_at = todayISO(); }
          else d.sdvRecords.push({ id: newId(), form_instance_id: fv.form_instance_id, field_value_id: fv.id, status: "verified", verified_by_name: ndaName, verified_at: todayISO() });
        }
      }
    });
  }
  function markSdvComplete() { if (!canSdv || locked) return; update((d: Dataset) => { for (const t of targetInstances) { const inst = d.formInstances.find((i) => i.id === t.id); if (inst) inst.sdv_complete = true; } }); }

  const statusLabel = (st: string) => (st === "in_work" ? "In-Work" : st === "in_review" ? "In-Review" : STATUS_CAP(st));

  // ─── Sticky header (title + Remarks + status CTA) ─────────────────────────
  const header = (
    <div className="form-sticky-header">
      <div className="form-header">
        <h1 className="form-title">{form.name}</h1>
        <div className="form-actions">
          <div className="remarks-wrap">
            <button className="btn-secondary" onClick={() => setRemarksOpen((o) => !o)} type="button">
              Remarks: {[modeQueries && "Queries", modeSdv && "SDV mode"].filter(Boolean).join(", ") || "Off"}
              <i className="ti ti-chevron-down" style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}></i>
            </button>
            {remarksOpen && <div className="remarks-backdrop" onClick={() => setRemarksOpen(false)} />}
            <div className={`remarks-menu${remarksOpen ? " open" : ""}`}>
              <div className="remarks-section-label">Activate mode</div>
              <button className={`remarks-item${modeQueries ? " active-mode" : ""}`} onClick={() => setModeQueries((m) => !m)} type="button"><span>Queries</span>{modeQueries && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}</button>
              {canSdv && <button className={`remarks-item${modeSdv ? " active-mode" : ""}`} onClick={() => setModeSdv((m) => !m)} type="button"><span>SDV mode</span>{modeSdv && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}</button>}
            </div>
          </div>
          {modeSdv ? (
            <>
              <button className="btn-secondary" type="button" disabled={!canSdv} onClick={verifyAll}>Verify all</button>
              <button className="btn-primary" type="button" disabled={!canSdv} onClick={markSdvComplete}>{allSdvComplete ? <><i className="ti ti-shield-check-filled"></i> SDV complete</> : "Mark SDV complete"}</button>
            </>
          ) : formStatus === "empty" || formStatus === "in_work" ? (
            <button className="btn-primary" type="button" disabled={!formHasData || submitBlocked || !STATUS_FLOW.in_work.roles.includes(activeRole)} onClick={advanceStatus}
              title={!formHasData ? "Enter data before submitting for review" : submitBlockReason ?? (STATUS_FLOW.in_work.roles.includes(activeRole) ? undefined : `Submit for Review — not permitted for ${activeRole}`)}>Submit for Review</button>
          ) : flow ? (
            <button className="btn-primary" type="button" disabled={!canAdvance} onClick={advanceStatus} title={canAdvance ? undefined : `${flow.label} — not permitted for ${activeRole}`}>{flow.esign && <i className="ti ti-lock"></i>}{flow.label}</button>
          ) : (
            <span className="badge badge-success" style={{ alignSelf: "center" }}>{STATUS_CAP(formStatus)}</span>
          )}
        </div>
      </div>
    </div>
  );

  // ─── Body ──────────────────────────────────────────────────────────────────
  let body: React.ReactNode;
  if (repeating) {
    body = (
      <>
        {topNote && <div className="scf-banner note"><i className="ti ti-info-circle"></i> {topNote}</div>}
        <div className="scf-toolbar">
          <span className="scf-count">{instances.length} {instances.length === 1 ? "entry" : "entries"}</span>
          {!locked && <button className="st-btn-secondary" type="button" onClick={() => setEntryInst(s.addInstance(form.id))}><i className="ti ti-plus"></i> {ADD_LABEL[form.name] ?? "New entry"}</button>}
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
                  <tr key={i.id} className="clickable" onClick={() => setEntryInst(i.id)}>
                    {cols.map((c, ci) => { const f = fields.find((x) => x.code === c.code); const raw = c.code ? s.valByCode(i.id, fields, c.code) : ""; const disp = f?.field_type === "multiselect" ? parseMulti(raw).join(", ") : raw; return <td key={ci} className={f?.field_type === "date" ? "mono" : ""}><span className={c.trunc ? "trunc" : ""}>{disp || "—"}</span></td>; })}
                    <td>{ecN > 0 ? <span className="scf-status-pill overdue"><i className="ti ti-alert-circle"></i> {ecN}</span> : <span className="scf-hint">—</span>}</td>
                    <td><span className={`scf-status-pill ${i.status === "reviewed" || i.status === "finalized" || i.status === "locked" ? "current" : "due"}`}>{statusLabel(i.status)}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {/* Fields-only slide-in entry panel (no Remarks / no Submit — those are form-level) */}
        {entryInst && (
          <>
            <div className="scf-overlay" onClick={() => setEntryInst(null)} />
            <div className="scf-panel">
              <div className="scf-panel-head"><div className="scf-panel-title">{form.name} — entry</div><button className="scf-panel-close" type="button" onClick={() => setEntryInst(null)}><i className="ti ti-x"></i></button></div>
              <div className="scf-panel-body">
                <ScopedFieldGrid key={entryInst} studyId={studyId} scope={scope} scopeId={scopeId} form={form} instanceId={entryInst} modeQueries={modeQueries} modeSdv={modeSdv} readOnly={locked} panel />
              </div>
              <div className="scf-panel-foot"><button className="st-btn-primary" type="button" onClick={() => setEntryInst(null)}>Done</button></div>
            </div>
          </>
        )}
      </>
    );
  } else {
    body = (
      <>
        {topNote && <div className="scf-banner note"><i className="ti ti-info-circle"></i> {topNote}</div>}
        <ScopedFieldGrid key={singleId!} studyId={studyId} scope={scope} scopeId={scopeId} form={form} instanceId={singleId!} modeQueries={modeQueries} modeSdv={modeSdv} readOnly={locked} />
      </>
    );
  }

  return (
    <div className="form-content">
      {header}
      <div className="form-body">{body}</div>

      {/* E-signature modal (form-level Lock) */}
      {lockModalOpen && (
        <div className="sr-modal-overlay" onClick={() => { setLockModalOpen(false); setLockPassword(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-lock"></i> Electronic signature</div>
            <div className="sr-modal-body">Locking finalizes this form and makes it read-only. Re-enter your password to sign (21 CFR Part 11).</div>
            <input type="password" className="sr-modal-input" placeholder="Password" value={lockPassword} onChange={(e) => setLockPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmLock(); }} autoFocus />
            <div className="sr-modal-actions"><button className="btn-secondary" type="button" onClick={() => { setLockModalOpen(false); setLockPassword(""); }}>Cancel</button><button className="btn-primary" type="button" disabled={!lockPassword.trim()} onClick={confirmLock}><i className="ti ti-lock"></i> Sign &amp; Lock</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Forms tab: Subject-Record-style sidebar + the selected form's content ────
export function ScopedFormFlow({ studyId, scope, scopeId, exclude = [], topNote }: { studyId: string; scope: Scope; scopeId: string; exclude?: string[]; topNote?: Record<string, string> }) {
  const s = useScoped(studyId, scope, scopeId);
  const { dataset } = s;
  const { activeRole } = useShell();
  const canSdv = canSDV(activeRole);
  const forms = dataset.forms
    .filter((f) => f.study_id === studyId && f.scope === scope && !exclude.includes(f.name))
    .slice().sort((a, b) => a.sequence - b.sequence);
  const [selId, setSelId] = useState<string | null>(null);
  // Remarks modes live at the record level (like the Subject Record) so the sidebar
  // SDV shields and the active form's panel share one state.
  const [modeQueries, setModeQueries] = useState(false);
  const [modeSdv, setModeSdv] = useState(false);
  // If the role loses SDV permission, leave SDV mode (never stuck in an unusable mode).
  useEffect(() => { if (!canSdv) setModeSdv(false); }, [canSdv]);

  const form = forms.find((f) => f.id === selId) ?? forms[0];

  if (forms.length === 0) return <div className="scf-empty">No {scope === "site" ? "site" : "house"}-level forms for this study.</div>;

  // Sidebar metadata for a form (rolled up across its instances).
  function sidebarMeta(f: FormRow): { icon: SidebarIcon; status: string; queryCount: number; sdv: "complete" | "partial" | "none" } {
    const insts = s.instancesFor(f.id);
    const openQ = insts.flatMap((i) => dataset.queries.filter((q) => q.form_instance_id === i.id && (q.status === "open" || q.status === "responded")));
    const worst = insts.length ? insts.reduce<string>((acc, i) => (STATUS_RANK[i.status] < STATUS_RANK[acc] ? i.status : acc), "locked") : "empty";
    const icon: SidebarIcon = openQ.length ? "queried" : iconForInstance(worst);
    const anyVerified = insts.some((i) => dataset.sdvRecords.some((r) => r.status === "verified" && dataset.fieldValues.some((v) => v.id === r.field_value_id && v.form_instance_id === i.id)));
    const allComplete = insts.length > 0 && insts.every((i) => i.sdv_complete);
    const sdv: "complete" | "partial" | "none" = allComplete ? "complete" : anyVerified ? "partial" : "none";
    return { icon, status: worst, queryCount: openQ.length, sdv };
  }

  return (
    <div className="scf-shell">
      <nav className="form-sidebar" aria-label="Forms">
        {forms.map((f) => {
          const m = sidebarMeta(f);
          return (
            <button key={f.id} className={`form-item${f.id === form?.id ? " active" : ""}${m.icon === "final" ? " done" : ""}`} onClick={() => setSelId(f.id)} title={f.name} type="button">
              <span className="form-item-label">{f.name}</span>
              <div className="form-item-right">
                {m.queryCount > 0 && <span className="issue-badge warning">{m.queryCount}</span>}
                <SidebarSdv active={modeSdv} sdv={m.sdv} />
                <StatusGlyph icon={m.icon} title={m.icon === "queried" ? "Open query" : STATUS_LABEL[m.status] ?? ICON_LABEL[m.icon]} />
              </div>
            </button>
          );
        })}
      </nav>
      {form && (
        <ScopedFormView key={form.id} studyId={studyId} scope={scope} scopeId={scopeId} form={form}
          modeQueries={modeQueries} modeSdv={modeSdv} setModeQueries={setModeQueries} setModeSdv={setModeSdv} topNote={topNote?.[form.name]} />
      )}
    </div>
  );
}
