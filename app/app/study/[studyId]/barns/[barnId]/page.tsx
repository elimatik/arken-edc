"use client";

// ════════════════════════════════════════════════════════════════════════════
// Barn / House Record — the house-level counterpart to the Site Record, sharing
// its exact layout (breadcrumb + header strip + stat strip + card grid). Some
// forms belong to the HOUSE, not the pen (PH-2401's Daily Environmental Log is
// recorded once per house per day); those carry scope='barn' with instances keyed
// by barn_id. Cards: House information · Pen summary · Daily environmental log
// (table + slide-in entry panel with live edit checks) · Environmental alerts.
// Reached via Data Entry → drill into the House → "Open house record".
// ════════════════════════════════════════════════════════════════════════════

import { Fragment, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import type { Dataset, FormFieldRow } from "@/lib/session-store/types";
import "../../sites/sites.css";
import "../barns.css";

export default function BarnRecordPage() {
  const params = useParams();
  const router = useRouter();
  const studyId = String(params.studyId);
  const barnId = String(params.barnId);
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const [panelInstId, setPanelInstId] = useState<string | null>(null);
  const isAdmin = activeRole === "Admin";

  const barn = dataset.barns.find((b) => b.id === barnId);
  const site = dataset.sites.find((s) => s.id === barn?.site_id);
  const study = dataset.studies.find((s) => s.id === studyId);
  const species = study?.species ?? "chicken";

  if (!ready) return <div className="sites-screen" style={{ padding: "var(--space-6)" }}>Loading house record…</div>;
  if (!barn) return <div className="sites-screen" style={{ padding: "var(--space-6)" }}>House not found.</div>;

  // ─── Forms & lookups ────────────────────────────────────────────────────────
  const studyForms = dataset.forms.filter((f) => f.study_id === studyId);
  const barnForm = studyForms.filter((f) => f.scope === "barn").slice().sort((a, b) => a.sequence - b.sequence)[0];
  const logFields = barnForm ? dataset.formFields.filter((f) => f.form_id === barnForm.id).slice().sort((a, b) => a.sequence - b.sequence) : [];
  const logInstances = barnForm ? dataset.formInstances.filter((i) => i.form_id === barnForm.id && i.barn_id === barnId) : [];

  const formByName = (name: string) => studyForms.find((f) => f.name === name);
  const subjInst = (subjectId: string, formId?: string) => (formId ? dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId) : undefined);
  const subjVal = (subjectId: string, formId: string | undefined, code: string): string => {
    if (!formId) return "";
    const inst = subjInst(subjectId, formId);
    const fld = dataset.formFields.find((f) => f.form_id === formId && f.code === code);
    if (!inst || !fld) return "";
    return dataset.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === fld.id)?.value ?? "";
  };
  const logFieldByCode = (code: string) => logFields.find((f) => f.code === code);
  const logVal = (instId: string, code: string) => {
    const f = logFieldByCode(code);
    return f ? dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === f.id)?.value ?? "" : "";
  };
  const logEC = (instId: string, code: string) => {
    const f = logFieldByCode(code);
    return f ? evaluateField(f, logVal(instId, code), species, dataset.speciesRanges) : null;
  };

  // ─── Pens (the pen-subjects under this house) ───────────────────────────────
  const pens = dataset.pens.filter((p) => p.barn_id === barnId).slice().sort((a, b) => a.code.localeCompare(b.code));
  const penSetup = formByName("Pen Demographics & Setup");
  const housing = formByName("Housing & Environment Setup");
  const subjForms = studyForms.filter((f) => f.scope !== "barn" && !studyForms.some((g) => g.parent_form_id === f.id));
  const penRows = pens.map((p) => {
    const subj = dataset.subjects.find((s) => s.pen_id === p.id);
    const placed = subj ? subjVal(subj.id, penSetup?.id, "birds_placed") : "";
    const done = subj ? subjForms.filter((f) => { const i = subjInst(subj.id, f.id); return i && i.status !== "empty"; }).length : 0;
    return { pen: p, subj, arm: subj?.randomization_arm ?? "—", placed, status: subj?.status ?? "—", done, total: subjForms.length };
  });

  // ─── Stat strip ─────────────────────────────────────────────────────────────
  const penSubjects = penRows.map((r) => r.subj).filter(Boolean) as NonNullable<(typeof penRows)[number]["subj"]>[];
  const subjIds = new Set(penSubjects.map((s) => s.id));
  const subjInstances = dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));
  const subjInstIds = new Set(subjInstances.map((i) => i.id));
  const openQueries = dataset.queries.filter((q) => subjInstIds.has(q.form_instance_id) && q.status !== "resolved").length;
  const formsSubmitted = subjInstances.filter((i) => i.status !== "empty").length;
  const totalBirds = penRows.reduce((a, r) => a + (Number(r.placed) || 0), 0);
  const activePens = penRows.filter((r) => r.status === "active").length;

  // ─── House information (aggregated from the first pen's setup) ──────────────
  const firstSubj = penSubjects[0];
  const floorTotal = penRows.reduce((a, r) => a + (r.subj ? Number(subjVal(r.subj.id, penSetup?.id, "floor_area_m2")) || 0 : 0), 0);
  const houseInfo = {
    pens: pens.length,
    floor: floorTotal ? floorTotal.toFixed(1) : "—",
    feeder: firstSubj ? subjVal(firstSubj.id, penSetup?.id, "feeder_type") : "",
    drinker: firstSubj ? subjVal(firstSubj.id, penSetup?.id, "drinker_type") : "",
    ventilation: firstSubj ? subjVal(firstSubj.id, housing?.id, "ventilation_type") : "",
    litter: firstSubj ? subjVal(firstSubj.id, penSetup?.id, "litter_type") : "",
  };

  // ─── Environmental alerts (open edit checks across all daily logs) ──────────
  const alertCodes = ["temp_morning", "temp_evening", "rh_morning", "rh_evening", "co2_ppm", "ammonia_ppm"];
  const alerts: { day: string; label: string; message: string }[] = [];
  for (const i of logInstances) {
    const day = logVal(i.id, "log_date") || "—";
    for (const code of alertCodes) {
      const ec = logEC(i.id, code);
      if (ec) alerts.push({ day, label: logFieldByCode(code)?.label ?? code, message: ec.message });
    }
  }

  // ─── Writes ─────────────────────────────────────────────────────────────────
  function setValue(instId: string, field: FormFieldRow, value: string) {
    update((d: Dataset) => {
      const row = d.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === field.id);
      if (row) row.value = value;
      else d.fieldValues.push({ id: crypto.randomUUID(), form_instance_id: instId, form_field_id: field.id, value });
      const fi = d.formInstances.find((i) => i.id === instId);
      if (fi && fi.status === "empty") fi.status = "in_work";
    });
  }
  function addLog() {
    if (!barnForm) return;
    const id = crypto.randomUUID();
    update((d: Dataset) => d.formInstances.push({ id, form_id: barnForm.id, subject_id: null, barn_id: barnId, status: "in_work" }));
    setPanelInstId(id);
  }
  const panelInst = panelInstId ? logInstances.find((i) => i.id === panelInstId) : undefined;
  const logRequiredMissing = !!panelInst && logFields.some((f) => f.is_required && logVal(panelInst.id, f.code).trim() === "");

  const dash = (v: string) => (v && v !== "" ? v : "—");

  return (
    <div className="sites-screen sr-rec">
      {/* Header */}
      <div className="sr-page-header">
        <nav className="sites-bc" aria-label="Breadcrumb">
          <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/data-entry`)}><span>Data Entry</span></button>
          {site && (
            <Fragment>
              <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
              <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/data-entry?site=${site.id}`)}><span>{site.name}</span></button>
            </Fragment>
          )}
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">{barn.name}</span>
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">House record</span>
        </nav>
        <div className="sr-title-row">
          <div>
            <div className="sr-title">{barn.name}</div>
            <div className="sr-title-sub">{barn.code} · House record</div>
          </div>
          <div className="sr-actions">
            <button className="st-btn-secondary" type="button"><i className="ti ti-download"></i> Export</button>
            <button className="st-btn-secondary" type="button"><i className="ti ti-clipboard-list"></i> Audit trail</button>
            {isAdmin && <button className="st-btn-primary" type="button"><i className="ti ti-pencil"></i> Edit</button>}
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="sr-stat-strip">
        <div className="sr-stat">
          <div className="sr-stat-val">{penSubjects.length} <span className="sr-stat-of">/ {pens.length}</span></div>
          <div className="sr-stat-lbl">Pens enrolled</div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-val">{totalBirds || "—"}</div>
          <div className="sr-stat-lbl">Total birds</div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-val">{activePens}</div>
          <div className="sr-stat-lbl">Active pens</div>
        </div>
        <div className="sr-stat">
          <div className={`sr-stat-val${openQueries > 0 ? " warn" : ""}`}>{openQueries}</div>
          <div className="sr-stat-lbl">Open queries</div>
          <div className="sr-stat-sub">{openQueries > 0 ? "needs review" : "all clear"}</div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-val">{formsSubmitted}</div>
          <div className="sr-stat-lbl">Forms submitted</div>
          <div className="sr-stat-sub">Across all pens</div>
        </div>
      </div>

      {/* Cards */}
      <div className="sr-scroll">
        <div className="sr-content-col">
          {/* House information */}
          <div className="sr-card">
            <div className="sr-card-header"><div><div className="sr-card-title">House information</div><div className="sr-card-sub">Housing configuration for this controlled-environment house</div></div></div>
            <div className="sr-card-body">
              <div className="sr-grid-3" style={{ rowGap: "var(--space-5)" }}>
                <Field label="Pen count"><div className="brn-val mono">{houseInfo.pens}</div></Field>
                <Field label="Floor area" hint="Summed across pens"><div className="brn-val mono">{houseInfo.floor}{houseInfo.floor !== "—" ? " m²" : ""}</div></Field>
                <Field label="House status"><span className="badge badge-active">Active</span></Field>
                <Field label="Feeder type"><div className={`brn-val${houseInfo.feeder ? "" : " muted"}`}>{dash(houseInfo.feeder)}</div></Field>
                <Field label="Drinker type"><div className={`brn-val${houseInfo.drinker ? "" : " muted"}`}>{dash(houseInfo.drinker)}</div></Field>
                <Field label="Ventilation type"><div className={`brn-val${houseInfo.ventilation ? "" : " muted"}`}>{dash(houseInfo.ventilation)}</div></Field>
                <Field label="Litter type"><div className={`brn-val${houseInfo.litter ? "" : " muted"}`}>{dash(houseInfo.litter)}</div></Field>
              </div>
            </div>
          </div>

          {/* Pen summary */}
          <div className="sr-card">
            <div className="sr-card-header"><div><div className="sr-card-title">Pen summary</div><div className="sr-card-sub">Pens housed in this house and their progress</div></div></div>
            <div className="sr-card-body">
              {penRows.length === 0 ? (
                <div className="brn-empty">No pens in this house yet.</div>
              ) : (
                <table className="brn-table">
                  <thead>
                    <tr><th>Pen ID</th><th>Arm</th><th>Birds placed</th><th>Status</th><th>Forms completed</th></tr>
                  </thead>
                  <tbody>
                    {penRows.map((r) => (
                      <tr key={r.pen.id} className={r.subj ? "clickable" : ""} onClick={() => r.subj && router.push(`/study/${studyId}/data-entry/${r.subj.id}`)}>
                        <td className="mono">{r.pen.code.toUpperCase()}</td>
                        <td>{r.arm}</td>
                        <td className="mono">{dash(r.placed)}</td>
                        <td><span className={`badge ${r.status === "active" ? "badge-active" : r.status === "completed" ? "badge-success" : "badge-hold"}`}>{r.status}</span></td>
                        <td className="mono">{r.done}/{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Daily environmental log */}
          <div className="sr-card">
            <div className="sr-card-header">
              <div><div className="sr-card-title">Daily environmental log</div><div className="sr-card-sub">Recorded once per house per day</div></div>
              {barnForm && <button className="st-btn-secondary" type="button" onClick={addLog}><i className="ti ti-plus"></i> New daily log</button>}
            </div>
            <div className="sr-card-body">
              {!barnForm ? (
                <div className="brn-empty">No house-level forms for this study.</div>
              ) : logInstances.length === 0 ? (
                <div className="brn-empty">No daily logs yet.</div>
              ) : (
                <table className="brn-table">
                  <thead>
                    <tr><th>Log date</th><th>AM °C</th><th>PM °C</th><th>RH AM %</th><th>NH₃ ppm</th><th>Status</th><th>Flags</th></tr>
                  </thead>
                  <tbody>
                    {logInstances.map((i) => {
                      const flags = alertCodes.map((c) => logEC(i.id, c)).filter(Boolean).length;
                      return (
                        <tr key={i.id} className="clickable" onClick={() => setPanelInstId(i.id)}>
                          <td className="mono">{logVal(i.id, "log_date") || "—"}</td>
                          <td>{logVal(i.id, "temp_morning") || "—"}</td>
                          <td>{logVal(i.id, "temp_evening") || "—"}</td>
                          <td>{logVal(i.id, "rh_morning") || "—"}</td>
                          <td>{logVal(i.id, "ammonia_ppm") || "—"}</td>
                          <td><span className="badge badge-hold">{i.status}</span></td>
                          <td>{flags > 0 ? <span className="brn-flag"><i className="ti ti-alert-triangle"></i> {flags}</span> : <span className="brn-val muted">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Environmental alerts */}
          <div className="sr-card">
            <div className="sr-card-header"><div><div className="sr-card-title">Environmental alerts</div><div className="sr-card-sub">Open edit checks from the daily log — welfare thresholds</div></div></div>
            <div className="sr-card-body">
              {alerts.length === 0 ? (
                <div className="brn-ok"><i className="ti ti-circle-check"></i> No open environmental alerts.</div>
              ) : (
                alerts.map((a, idx) => (
                  <div className="brn-alert" key={idx}>
                    <i className="ti ti-alert-triangle"></i>
                    <div><span className="brn-alert-day">{a.day}</span><strong>{a.label}:</strong> {a.message}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Slide-in entry panel (New / edit daily log) */}
      {panelInst && barnForm && (
        <>
          <div className="brn-overlay" onClick={() => setPanelInstId(null)} />
          <div className="brn-panel">
            <div className="brn-panel-head">
              <div className="brn-panel-title">{barnForm.name} entry</div>
              <button className="brn-panel-close" type="button" onClick={() => setPanelInstId(null)}><i className="ti ti-x"></i></button>
            </div>
            <div className="brn-panel-body">
              {logFields.map((field) => {
                const v = logVal(panelInst.id, field.code);
                const ec = evaluateField(field, v, species, dataset.speciesRanges);
                const opts = field.options ?? [];
                const missing = field.is_required && v.trim() === "";
                const warn = ec ? " warn" : missing ? " err" : "";
                const hint = rangeLabel(field, species, dataset.speciesRanges) ?? (field.field_type === "number" && field.unit ? field.unit : null);
                return (
                  <div className="sr-field" key={field.id}>
                    <label className="sr-label">{field.label}{field.is_required && <span className="req"> *</span>}{field.unit ? ` (${field.unit})` : ""}</label>
                    {field.field_type === "textarea" ? (
                      <textarea className={`sr-textarea${warn}`} value={v} onChange={(e) => setValue(panelInst.id, field, e.target.value)} rows={2} />
                    ) : opts.length > 0 ? (
                      <select className={`sr-select${warn}`} value={v} onChange={(e) => setValue(panelInst.id, field, e.target.value)}>
                        <option value="">—</option>
                        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className={`sr-input${field.field_type === "number" ? " mono" : ""}${warn}`} type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"} value={v} onChange={(e) => setValue(panelInst.id, field, e.target.value)} />
                    )}
                    {ec ? (
                      <div className="brn-field-alert"><i className="ti ti-alert-triangle"></i> {ec.message}</div>
                    ) : missing ? (
                      <div className="brn-field-required"><i className="ti ti-asterisk"></i> Required</div>
                    ) : (
                      hint && <div className="sr-hint">{hint}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="brn-panel-foot">
              {logRequiredMissing && <span className="brn-panel-note">Complete required fields to save</span>}
              <button className="st-btn-primary" type="button" disabled={logRequiredMissing} onClick={() => setPanelInstId(null)}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="sr-field">
      <label className="sr-label">{label}</label>
      {children}
      {hint && <div className="sr-hint">{hint}</div>}
    </div>
  );
}
