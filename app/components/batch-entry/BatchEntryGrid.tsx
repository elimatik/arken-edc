"use client";

// ════════════════════════════════════════════════════════════════════════════
// Batch Entry — Step 2: the full-screen grid. One row per animal, one column per
// form field, inline editing. Edit checks fire per cell as values are entered
// (flag the row, count in the Alerts column) but never block the CRC. "Save all"
// persists every row that has at least one value; empty rows stay Not-started.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { evaluateField } from "@/lib/forms/validation";
import { ageMonthsOf, dueStatusFor, visitDayOf, type DueStatus } from "@/lib/batch-entry";
import type { Dataset, FormFieldRow } from "@/lib/session-store/types";
import "./batch-entry.css";

const newId = () => crypto.randomUUID();
const parseMulti = (v: string): string[] => { try { const a = JSON.parse(v || "[]"); return Array.isArray(a) ? a : []; } catch { return v ? [v] : []; } };

type StatusFilter = "all" | "due" | "overdue" | "not-started";

export function BatchEntryGrid({ studyId, formId, loc, from }: { studyId: string; formId: string; loc?: string; from: string }) {
  const router = useRouter();
  const { dataset, update } = useStudySession();

  const study = dataset.studies.find((s) => s.id === studyId);
  const species = study?.species ?? "cattle";
  const form = dataset.forms.find((f) => f.id === formId);
  const fields = useMemo(
    () => dataset.formFields.filter((f) => f.form_id === formId).slice().sort((a, b) => a.sequence - b.sequence),
    [dataset.formFields, formId],
  );
  // Editable columns — calculated fields are read-only/derived, so they're omitted.
  const cols = fields.filter((f) => f.field_type !== "calculated");

  // Candidate animals — the study's subjects, optionally scoped to one location
  // (site / barn / pen id passed from the drill-down).
  const subjects = useMemo(() => {
    let list = dataset.subjects.filter((s) => s.study_id === studyId);
    if (loc) list = list.filter((s) => s.site_id === loc || s.barn_id === loc || s.pen_id === loc);
    return list.slice().sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  }, [dataset.subjects, studyId, loc]);

  const penName = (id: string | null) => (id ? dataset.pens.find((p) => p.id === id)?.name : null);
  const barnName = (id: string | null) => (id ? dataset.barns.find((b) => b.id === id)?.name : null);
  const locationLabel = (s: (typeof subjects)[number]) => penName(s.pen_id) ?? barnName(s.barn_id) ?? "—";

  // Existing instance + its saved values for a subject (re-opening shows them).
  const instanceFor = (subjectId: string) => dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId);
  const savedValues = (subjectId: string): Record<string, string> => {
    const inst = instanceFor(subjectId);
    if (!inst) return {};
    const out: Record<string, string> = {};
    for (const fv of dataset.fieldValues.filter((v) => v.form_instance_id === inst.id)) out[fv.form_field_id] = fv.value ?? "";
    return out;
  };

  // ── Working state: per-subject checked + values + saved flag ────────────────
  const [rows, setRows] = useState(() =>
    subjects.map((s) => {
      const vals = savedValues(s.id);
      const hasData = Object.values(vals).some((v) => v !== "");
      return { subjectId: s.id, code: s.subject_code, checked: true, values: vals, saved: hasData };
    }),
  );
  const [siteF, setSiteF] = useState("");
  const [barnF, setBarnF] = useState("");
  const [penF, setPenF] = useState("");
  const [statusF, setStatusF] = useState<StatusFilter>("all");
  const [toast, setToast] = useState<string | null>(null);

  const ageBySubject = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const s of subjects) m[s.id] = ageMonthsOf(dataset, s.id);
    return m;
  }, [dataset, subjects]);

  // Per-cell edit check (live, never persisted until Save).
  const cellCheck = (field: FormFieldRow, value: string, subjectId: string) =>
    evaluateField(field, value, species, dataset.speciesRanges, ageBySubject[subjectId]);
  const alertsCount = (r: (typeof rows)[number]) => cols.filter((f) => !!cellCheck(f, r.values[f.id] ?? "", r.subjectId)).length;
  const rowHasData = (r: (typeof rows)[number]) => cols.some((f) => (r.values[f.id] ?? "") !== "");

  const setCell = (subjectId: string, fieldId: string, value: string) =>
    setRows((rs) => rs.map((r) => (r.subjectId === subjectId ? { ...r, values: { ...r.values, [fieldId]: value }, saved: false } : r)));
  const setChecked = (subjectId: string, checked: boolean) =>
    setRows((rs) => rs.map((r) => (r.subjectId === subjectId ? { ...r, checked } : r)));

  // ── Filters ─────────────────────────────────────────────────────────────────
  const sites = dataset.sites.filter((s) => s.study_id === studyId);
  const barns = dataset.barns.filter((b) => sites.some((s) => s.id === b.site_id) && (!siteF || b.site_id === siteF));
  const pens = dataset.pens.filter((p) => barns.some((b) => b.id === p.barn_id) && (!barnF || p.barn_id === barnF));
  const subjById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);

  const visibleRows = rows.filter((r) => {
    const s = subjById[r.subjectId];
    if (!s) return false;
    if (siteF && s.site_id !== siteF) return false;
    if (barnF && s.barn_id !== barnF) return false;
    if (penF && s.pen_id !== penF) return false;
    if (statusF !== "all" && form) {
      const ds: DueStatus = dueStatusFor(dataset, form, r.subjectId);
      if (statusF === "due" && ds !== "due") return false;
      if (statusF === "overdue" && ds !== "overdue") return false;
      if (statusF === "not-started" && rowHasData(r)) return false;
    }
    return true;
  });

  // ── Save all ─────────────────────────────────────────────────────────────────
  function saveAll() {
    let saved = 0, withChecks = 0, skipped = 0;
    const toPersist = rows.filter((r) => r.checked);
    update((d: Dataset) => {
      for (const r of toPersist) {
        if (!rowHasData(r)) { skipped += 1; continue; }
        let inst = d.formInstances.find((i) => i.subject_id === r.subjectId && i.form_id === formId);
        if (!inst) { inst = { id: newId(), form_id: formId, subject_id: r.subjectId, barn_id: null, site_id: null, status: "in_work" }; d.formInstances.push(inst); }
        else if (inst.status === "empty") inst.status = "in_work";
        let rowChecks = 0;
        for (const f of cols) {
          const value = r.values[f.id] ?? "";
          if (value === "") continue;
          let fv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === f.id);
          if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: f.id, value }; d.fieldValues.push(fv); }
          else fv.value = value;
          // Persist an open edit check for out-of-range cells (mirrors the Subject Record).
          const check = evaluateField(f, value, species, d.speciesRanges, ageMonthsOf(d, r.subjectId));
          const existing = d.editChecks.find((e) => e.field_value_id === fv!.id && e.status === "open");
          if (check) {
            rowChecks += 1;
            if (!existing) d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() });
            else existing.message = check.message;
          } else if (existing) existing.status = "resolved";
        }
        saved += 1;
        if (rowChecks > 0) withChecks += 1;
      }
    });
    // skipped also counts unchecked rows with no data? Spec: skipped = empty rows.
    const uncheckedSkipped = rows.filter((r) => !r.checked && rowHasData(r)).length;
    setRows((rs) => rs.map((r) => (r.checked && rowHasData(r) ? { ...r, saved: true } : r)));
    setToast(`${saved} record${saved === 1 ? "" : "s"} saved · ${withChecks} with open edit checks · ${skipped + uncheckedSkipped} skipped`);
  }

  function exitBatch() {
    if (from === "data-entry") router.push(`/study/${studyId}/data-entry${loc ? `?site=${loc}` : ""}`);
    else router.push(`/study/${studyId}/animals`);
  }

  const checkedCount = rows.filter((r) => r.checked).length;
  const day = form ? visitDayOf(form) : null;

  if (!form) return <div className="be-grid-screen"><div className="be-grid-empty">Form not found.</div></div>;

  return (
    <div className="be-grid-screen">
      {/* Header */}
      <div className="be-grid-header">
        <div>
          <div className="be-grid-title">Batch Entry — {form.name} · {study?.code}</div>
          <div className="be-grid-subhead">{study?.name} · {new Date().toISOString().slice(0, 10)} · {visibleRows.length} animal{visibleRows.length === 1 ? "" : "s"}{day != null ? ` · scheduled Day ${day}` : ""}</div>
        </div>
        <div className="be-grid-actions">
          <button className="btn-secondary" type="button" onClick={exitBatch}><i className="ti ti-arrow-left"></i> Exit batch</button>
          <button className="btn-primary" type="button" onClick={saveAll}><i className="ti ti-device-floppy"></i> Save all ({checkedCount})</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="be-filter-bar">
        <select className="be-filter" value={siteF} onChange={(e) => { setSiteF(e.target.value); setBarnF(""); setPenF(""); }}>
          <option value="">All sites</option>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="be-filter" value={barnF} onChange={(e) => { setBarnF(e.target.value); setPenF(""); }}>
          <option value="">All barns</option>
          {barns.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="be-filter" value={penF} onChange={(e) => setPenF(e.target.value)}>
          <option value="">All pens</option>
          {pens.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="be-filter-sep" />
        <select className="be-filter" value={statusF} onChange={(e) => setStatusF(e.target.value as StatusFilter)}>
          <option value="all">All</option>
          <option value="due">Due today</option>
          <option value="overdue">Overdue</option>
          <option value="not-started">Not started</option>
        </select>
      </div>

      {/* Grid */}
      <div className="be-grid-wrap">
        <table className="be-grid">
          <thead>
            <tr>
              <th className="be-col-check">
                <input type="checkbox" checked={visibleRows.length > 0 && visibleRows.every((r) => r.checked)} onChange={(e) => { const v = e.target.checked; setRows((rs) => rs.map((r) => (visibleRows.some((vr) => vr.subjectId === r.subjectId) ? { ...r, checked: v } : r))); }} />
              </th>
              <th className="be-col-id be-sticky">Animal ID</th>
              <th className="be-col-loc be-sticky-2">Location</th>
              {cols.map((f) => (
                <th key={f.id} className="be-col-field">{f.label}{f.unit ? <span className="be-col-unit"> ({f.unit})</span> : ""}{f.is_required ? <span className="be-req"> *</span> : ""}</th>
              ))}
              <th className="be-col-status">Status</th>
              <th className="be-col-alerts">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan={cols.length + 5}><div className="be-grid-empty">No animals match the current filters.</div></td></tr>
            ) : visibleRows.map((r) => {
              const alerts = alertsCount(r);
              const hasData = rowHasData(r);
              const status = alerts > 0 ? "alerts" : r.saved ? "saved" : hasData ? "progress" : "not-started";
              return (
                <tr key={r.subjectId} className={`${r.checked ? "" : "be-row-skip"}${alerts > 0 ? " be-row-alert" : ""}`}>
                  <td className="be-col-check"><input type="checkbox" checked={r.checked} onChange={(e) => setChecked(r.subjectId, e.target.checked)} /></td>
                  <td className="be-col-id be-sticky"><span className="mono">{r.code}</span></td>
                  <td className="be-col-loc be-sticky-2">{locationLabel(subjById[r.subjectId])}</td>
                  {cols.map((f) => (
                    <td key={f.id} className="be-cell">{renderCell(f, r.values[f.id] ?? "", (v) => setCell(r.subjectId, f.id, v), !!cellCheck(f, r.values[f.id] ?? "", r.subjectId), !r.checked)}</td>
                  ))}
                  <td className="be-col-status">{statusBadge(status)}</td>
                  <td className="be-col-alerts">{alerts > 0 ? <span className="be-ec-chip"><i className="ti ti-alert-circle"></i> EC- {alerts}</span> : <span className="be-dash">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {toast && <div className="be-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button className="be-toast-x" type="button" onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}

function statusBadge(status: string) {
  if (status === "alerts") return <span className="be-status be-status-alert"><i className="ti ti-alert-triangle"></i> Has alerts</span>;
  if (status === "saved") return <span className="be-status be-status-saved"><i className="ti ti-check"></i> Saved</span>;
  if (status === "progress") return <span className="be-status be-status-prog"><i className="ti ti-pencil"></i> In progress</span>;
  return <span className="be-status be-status-none"><i className="ti ti-circle"></i> Not started</span>;
}

function renderCell(field: FormFieldRow, value: string, onChange: (v: string) => void, warn: boolean, disabled: boolean) {
  const t = field.field_type;
  const cls = `be-input${warn ? " warn" : ""}`;
  if (t === "radio") {
    const opts = field.options?.length ? field.options : ["Yes", "No"];
    return (
      <div className="be-yn">
        {opts.map((o) => (
          <button key={o} type="button" disabled={disabled} className={`be-yn-btn${value === o ? " active" : ""}`} onClick={() => onChange(value === o ? "" : o)}>{o}</button>
        ))}
      </div>
    );
  }
  if (t === "select") {
    return (
      <select className={`be-select${warn ? " warn" : ""}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (t === "multiselect") {
    const sel = parseMulti(value);
    return (
      <select className={`be-select${warn ? " warn" : ""}`} value={sel[0] ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value ? JSON.stringify([e.target.value]) : "")}>
        <option value="">—</option>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (t === "date" || t === "datetime") {
    return <input type="date" className={cls} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
  }
  const numeric = t === "number" || t === "integer";
  return <input type="text" inputMode={numeric ? "decimal" : undefined} className={`${cls}${numeric ? " mono" : ""}`} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}
