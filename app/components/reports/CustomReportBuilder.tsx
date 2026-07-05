"use client";

// Custom Report builder — subject-grain (no data-source selector). Columns are
// added via a 3-step picker (form → field → what-to-show), reorderable by drag,
// with a live blinding-aware preview. Arrives empty or pre-populated from Arken
// Insights (arken_pending_report_config).
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { ReportCsvButton } from "@/components/reports/ReportKit";
import {
  ASPECT_GROUPS, ASPECT_LABEL, BUILTIN_GROUPS, LOCKED_COLUMNS, OPERATORS, isLockedColumn, colId,
  pickableForms, resolveReport, columnFieldType, loadSavedReports, persistSavedReports,
  type ReportColumn, type ReportFilter, type ReportConfig, type FieldAspect, type SavedReport, type FieldType,
} from "@/lib/report-builder";

export function CustomReportBuilder({ studyId, initial, source = "manual", savedReport, onSaved, onDelete, onToast }: {
  studyId: string; initial?: ReportConfig | null; source?: "ai" | "saved" | "manual"; savedReport?: SavedReport | null;
  onSaved?: () => void; onDelete?: (id: string) => void; onToast?: (msg: string) => void;
}) {
  const { dataset } = useStudySession();
  const { activeRole } = useShell();

  const [columns, setColumns] = useState<ReportColumn[]>(initial?.columns?.length ? withIds(initial.columns) : [...LOCKED_COLUMNS]);
  const [filters, setFilters] = useState<ReportFilter[]>(initial?.filters ?? []);
  const [title, setTitle] = useState(initial?.title?.trim() || "Untitled report");
  const [editingTitle, setEditingTitle] = useState(false);
  const prepopulated = source === "ai";
  const forms = useMemo(() => pickableForms(dataset, studyId), [dataset, studyId]);

  // Picker (3-step slide-in) + modals.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pForm, setPForm] = useState<{ builtin: boolean; name: string } | null>(null);
  const [pField, setPField] = useState<{ code: string; label: string } | null>(null);
  const [pSearch, setPSearch] = useState("");
  const [pAspects, setPAspects] = useState<Set<FieldAspect>>(new Set<FieldAspect>(["value"]));
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState(savedReport?.description ?? "");
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const dragFrom = useRef<number | null>(null);

  const namedTitle = title.trim() && title.trim() !== "Untitled report" ? title.trim() : "";
  const config: ReportConfig = useMemo(() => ({ columns, filters, title: namedTitle || undefined }), [columns, filters, namedTitle]);

  // Debounced preview (300ms).
  const [preview, setPreview] = useState<ReturnType<typeof resolveReport>>({ columns: [], rows: [], total: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(resolveReport(dataset, studyId, config, activeRole)), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dataset, studyId, config, activeRole]);

  // ── Column ops ──
  function openPicker() { setPickerOpen(true); setPForm(null); setPField(null); setPSearch(""); setPAspects(new Set<FieldAspect>(["value"])); }
  function pickBuiltinField(key: string, label: string) {
    if (!columns.some((c) => c.kind === "builtin" && c.builtinKey === key)) setColumns((c) => [...c, { id: colId(), label, kind: "builtin", builtinKey: key }]);
    setPickerOpen(false);
  }
  function addFieldAspects() {
    if (!pForm || !pField) return;
    const added: ReportColumn[] = Array.from(pAspects).map((a) => ({ id: colId(), label: `${pField.label} — ${ASPECT_LABEL[a]}`, kind: "field", form: pForm.name, field: pField.code, fieldLabel: pField.label, aspect: a }));
    setColumns((c) => [...c, ...added]);
    setPickerOpen(false);
  }
  const removeColumn = (id: string) => setColumns((c) => c.filter((x) => x.id !== id));
  const setLabel = (id: string, label: string) => setColumns((c) => c.map((x) => (x.id === id ? { ...x, label } : x)));
  function onDrop(to: number) {
    const from = dragFrom.current; dragFrom.current = null;
    if (from == null || from === to) return;
    setColumns((c) => { const n = c.slice(); const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
  }

  function addFilter() { setFilters((f) => [...f, { column: columns[0]?.label ?? "", operator: "contains", value: "" }]); }
  const setFilter = (i: number, patch: Partial<ReportFilter>) => setFilters((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, j) => j !== i));
  const filterType = (label: string): FieldType => { const col = columns.find((c) => c.label === label); return col ? columnFieldType(dataset, studyId, col) : "text"; };

  function doReset() { setColumns([...LOCKED_COLUMNS]); setFilters([]); setResetOpen(false); }
  function commitTitle() { setEditingTitle(false); if (!title.trim()) setTitle("Untitled report"); }
  function openSave() { setSaveName(namedTitle); setSaveOpen(true); }
  function confirmSave() {
    if (!saveName.trim()) return;
    const report: SavedReport = { id: `cr-${Math.random().toString(36).slice(2, 8)}`, name: saveName.trim(), description: saveDesc.trim(), config: { columns, filters, title: saveName.trim() }, createdAt: studyId };
    persistSavedReports(studyId, [...loadSavedReports(studyId), report]);
    setTitle(report.name); setSaveOpen(false); onSaved?.(); onToast?.(`Report saved — ${report.name}`);
  }
  function confirmDelete() { if (savedReport) onDelete?.(savedReport.id); setDeleteOpen(false); }

  const csvRows = preview.rows.map((r) => preview.columns.map((c) => r[c] ?? ""));

  return (
    <div className="crb">
      {/* Header row — editable title (left) + actions (right) */}
      <div className="crb-header-row">
        {editingTitle ? (
          <input className="crb-title-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTitle(); } }} />
        ) : (
          <button type="button" className={`crb-title${namedTitle ? "" : " untitled"}`} onClick={() => setEditingTitle(true)} title="Edit report title">
            {title}<i className="ti ti-pencil crb-title-pencil"></i>
          </button>
        )}
        <div className="crb-header-actions">
          <ReportCsvButton studyId={studyId} slug="custom" headers={preview.columns} rows={csvRows} />
          <button type="button" className="crb-btn" onClick={openSave} disabled={columns.length === 0}><i className="ti ti-device-floppy"></i> Save report</button>
          {source === "saved" && savedReport && (
            <button type="button" className="crb-btn crb-btn-danger" onClick={() => setDeleteOpen(true)}><i className="ti ti-trash"></i> Delete report</button>
          )}
        </div>
      </div>

      {prepopulated && <div className="crb-banner"><i className="ti ti-sparkles"></i> Pre-populated from your Arken Insights request. Review and adjust before exporting.</div>}

      {/* Columns */}
      <div className="crb-step">
        <div className="crb-step-head">Columns
          <button type="button" className="crb-add-primary" onClick={openPicker}><i className="ti ti-plus"></i> Add column</button>
        </div>
        <div className="crb-cols">
          {columns.map((col, i) => {
            const locked = isLockedColumn(col);
            return (
              <div key={col.id} className="crb-col-row" draggable={!locked}
                onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}>
                <span className={`crb-grip${locked ? " disabled" : ""}`}><i className="ti ti-grip-vertical"></i></span>
                <input className="crb-col-label" value={col.label} onChange={(e) => setLabel(col.id, e.target.value)} />
                <span className={`crb-col-src ${col.kind}`}>{col.kind === "builtin" ? "Built-in" : `${col.form} · ${ASPECT_LABEL[col.aspect ?? "value"]}`}</span>
                {locked ? <span className="crb-col-lock"><i className="ti ti-lock" title="Always present"></i></span> : <button type="button" className="crb-col-x" onClick={() => removeColumn(col.id)} aria-label="Remove"><i className="ti ti-x"></i></button>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="crb-step">
        <div className="crb-step-head">Filters
          <button type="button" className="crb-add-btn" onClick={addFilter}><i className="ti ti-plus"></i> Add filter</button>
        </div>
        {filters.length === 0 ? <div className="crb-filter-empty">No filters — all rows shown.</div> : (
          <div className="crb-filters">
            {filters.map((f, i) => {
              const ops = OPERATORS[filterType(f.column)];
              return (
                <div key={i} className="crb-filter-row">
                  {i > 0 && <span className="crb-filter-and">AND</span>}
                  <select className="crb-select" value={f.column} onChange={(e) => setFilter(i, { column: e.target.value, operator: OPERATORS[filterType(e.target.value)][0].op })}>
                    {columns.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </select>
                  <select className="crb-select" value={f.operator} onChange={(e) => setFilter(i, { operator: e.target.value })}>
                    {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  <input className="crb-filter-val" type={filterType(f.column) === "number" ? "number" : filterType(f.column) === "date" ? "date" : "text"} value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder="value" />
                  <button type="button" className="crb-col-x" onClick={() => removeFilter(i)} aria-label="Remove filter"><i className="ti ti-x"></i></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="crb-preview">
        <div className="crb-preview-head">
          <span><i className="ti ti-table"></i> Preview <span className="crb-preview-count">{preview.total} row{preview.total === 1 ? "" : "s"} total</span></span>
        </div>
        {columns.length === 0 ? <div className="crb-preview-empty">Add at least one column to preview.</div> : (
          <div className="crb-preview-table-wrap">
            <table className="rpt-table">
              <thead><tr>{preview.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{preview.rows.slice(0, 20).map((r, i) => <tr key={i}>{preview.columns.map((c, j) => <td key={c} className={j === 0 ? "mono" : ""}>{r[c] ?? "—"}</td>)}</tr>)}</tbody>
            </table>
            {preview.total === 0 && <div className="crb-preview-empty">No rows match the current filters.</div>}
            {preview.total > 20 && <div className="crb-preview-more">Showing first 20 of {preview.total} rows — export CSV for the full set.</div>}
          </div>
        )}
      </div>

      {/* Actions — Reset only (Export + Save live in the header row) */}
      <div className="crb-actionbar">
        <button type="button" className="crb-reset-link" onClick={() => setResetOpen(true)}><i className="ti ti-refresh"></i> Reset</button>
      </div>

      {/* 3-step column picker */}
      {pickerOpen && <div className="crb-picker-overlay" onClick={() => setPickerOpen(false)} />}
      <div className={`crb-slidepicker${pickerOpen ? " open" : ""}`}>
        <div className="crb-picker-header">
          {(pForm || pField) && <button type="button" className="crb-picker-back" onClick={() => (pField ? setPField(null) : setPForm(null))}><i className="ti ti-arrow-left"></i></button>}
          <span>{!pForm ? "Pick a form" : !pField ? "Pick a field" : "What to show"}</span>
          <button type="button" className="crb-picker-close" onClick={() => setPickerOpen(false)}><i className="ti ti-x"></i></button>
        </div>

        {/* Step A — form */}
        {!pForm && (
          <div className="crb-picker-body">
            <div className="crb-picker-sec">Built-in</div>
            {BUILTIN_GROUPS.map((g) => (
              <button key={g.form} type="button" className="crb-picker-row" onClick={() => setPForm({ builtin: true, name: g.name })}><i className={`ti ti-${g.icon}`}></i> {g.name} <i className="ti ti-chevron-right crb-picker-chev"></i></button>
            ))}
            <div className="crb-picker-sec">Forms</div>
            {forms.map((f) => (
              <button key={f.name} type="button" className="crb-picker-row" onClick={() => setPForm({ builtin: false, name: f.name })}><i className="ti ti-file-text"></i> {f.name} <i className="ti ti-chevron-right crb-picker-chev"></i></button>
            ))}
          </div>
        )}

        {/* Step B — field (built-in groups add directly; forms need a field) */}
        {pForm && !pField && (
          pForm.builtin ? (
            <div className="crb-picker-body">
              {BUILTIN_GROUPS.find((g) => g.name === pForm.name)!.fields.map((fd) => (
                <button key={fd.key} type="button" className="crb-picker-row" onClick={() => pickBuiltinField(fd.key, fd.label)}>{fd.label}</button>
              ))}
            </div>
          ) : (
            <div className="crb-picker-body">
              <div className="crb-picker-search"><i className="ti ti-search"></i><input placeholder="Search fields…" value={pSearch} onChange={(e) => setPSearch(e.target.value)} /></div>
              {(forms.find((f) => f.name === pForm.name)?.fields ?? []).filter((fd) => !pSearch || fd.label.toLowerCase().includes(pSearch.toLowerCase()) || fd.code.includes(pSearch.toLowerCase())).map((fd) => (
                <button key={fd.code} type="button" className="crb-picker-row" onClick={() => { setPField({ code: fd.code, label: fd.label }); setPAspects(new Set<FieldAspect>(["value"])); }}>{fd.label} <span className="crb-picker-type">{fd.type}</span></button>
              ))}
            </div>
          )
        )}

        {/* Step C — what to show */}
        {pForm && !pForm.builtin && pField && (
          <>
            <div className="crb-picker-body">
              <div className="crb-picker-field-crumb">{pForm.name} → {pField.label}</div>
              {ASPECT_GROUPS.map((g) => (
                <div key={g.group} className="crb-aspect-group">
                  <div className="crb-picker-sec">{g.group}</div>
                  {g.items.map((it) => (
                    <label key={it.key} className="crb-aspect">
                      <input type="checkbox" checked={pAspects.has(it.key)} onChange={(e) => setPAspects((s) => { const n = new Set(s); if (e.target.checked) n.add(it.key); else n.delete(it.key); return n; })} />
                      <span>{it.label}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            <div className="crb-picker-foot">
              <button type="button" className="crb-btn" disabled={pAspects.size === 0} onClick={addFieldAspects}>Add to report{pAspects.size > 1 ? ` (${pAspects.size})` : ""}</button>
            </div>
          </>
        )}
      </div>

      {/* Save modal */}
      {saveOpen && (
        <div className="sr-modal-overlay" onClick={() => setSaveOpen(false)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-device-floppy"></i> Save report</div>
            <label className="crb-modal-lbl">Report name <span className="vs-req" style={{ color: "var(--red-600)" }}>*</span></label>
            <input className="crb-filter-val" style={{ width: "100%" }} placeholder="e.g. CADESI responders by site" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
            <label className="crb-modal-lbl" style={{ marginTop: "var(--space-2)" }}>Description</label>
            <textarea className="sr-modal-input" placeholder="Optional — describe what this report shows" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} />
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setSaveOpen(false)}>Cancel</button>
              <button className="crb-btn" type="button" disabled={!saveName.trim()} onClick={confirmSave}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirm */}
      {resetOpen && (
        <div className="sr-modal-overlay" onClick={() => setResetOpen(false)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-refresh"></i> Reset this report?</div>
            <div className="sr-modal-body">All columns and filters will be cleared.</div>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setResetOpen(false)}>Cancel</button>
              <button className="crb-btn" type="button" onClick={doReset}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm (saved reports only) */}
      {deleteOpen && savedReport && (
        <div className="sr-modal-overlay" onClick={() => setDeleteOpen(false)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-trash"></i> Delete “{savedReport.name}”?</div>
            <div className="sr-modal-body">This cannot be undone.</div>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button className="crb-btn crb-btn-danger" type="button" onClick={confirmDelete}><i className="ti ti-trash"></i> Delete report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Ensure every column carries a stable id (AI/saved configs may omit it).
function withIds(cols: ReportColumn[]): ReportColumn[] {
  const locked = [...LOCKED_COLUMNS];
  const extra = cols.filter((c) => !isLockedColumn(c)).map((c) => ({ ...c, id: c.id ?? colId() }));
  return [...locked, ...extra];
}
