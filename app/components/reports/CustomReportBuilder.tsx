"use client";

// Custom Report builder (Step 3) — data source → columns → filters → live preview.
// Arrives empty (manual build) or pre-populated from an Arken Insights request
// (sessionStorage arken_pending_report_config). Blinding-aware via resolveReport.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { ReportCsvButton } from "@/components/reports/ReportKit";
import {
  DATA_SOURCES, BUILTIN_COLUMNS, OPERATORS, buildFieldSchema, resolveReport,
  loadSavedReports, persistSavedReports,
  type DataSource, type ReportColumn, type ReportFilter, type ReportConfig, type FieldType, type SavedReport,
} from "@/lib/report-builder";

const LOCKED_KEYS = ["subjectId", "site"]; // always-present, not removable

function defaultColumns(ds: DataSource): ReportColumn[] {
  const builtins = BUILTIN_COLUMNS[ds];
  const locked = builtins.filter((b) => LOCKED_KEYS.includes(b.key));
  const base = locked.length ? locked : builtins.slice(0, 2);
  return base.map((b) => ({ label: b.label, source: "builtin", key: b.key }));
}

export function CustomReportBuilder({ studyId, initial, source = "manual", onSaved }: { studyId: string; initial?: ReportConfig | null; source?: "ai" | "saved" | "manual"; onSaved?: () => void }) {
  const { dataset } = useStudySession();
  const { study, activeRole } = useShell();

  const [dataSource, setDataSource] = useState<DataSource>(initial?.dataSource ?? "subjects");
  const [columns, setColumns] = useState<ReportColumn[]>(initial?.columns?.length ? initial.columns : defaultColumns(initial?.dataSource ?? "subjects"));
  const [filters, setFilters] = useState<ReportFilter[]>(initial?.filters ?? []);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [prepopulated, setPrepopulated] = useState(source === "ai");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");

  const schema = useMemo(() => buildFieldSchema(dataset, studyId), [dataset, studyId]);
  const config: ReportConfig = useMemo(() => ({ dataSource, columns, filters, title }), [dataSource, columns, filters, title]);

  // Debounced preview (300ms) — re-resolves as the config changes.
  const [preview, setPreview] = useState<ReturnType<typeof resolveReport>>({ columns: [], rows: [], total: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(resolveReport(dataset, studyId, config, activeRole)), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dataset, studyId, config, activeRole]);

  function pickDataSource(ds: DataSource) {
    if (ds === dataSource) return;
    setDataSource(ds); setColumns(defaultColumns(ds)); setFilters([]); setPrepopulated(false);
  }
  function addBuiltin(key: string, label: string) {
    if (columns.some((c) => c.source === "builtin" && c.key === key)) return;
    setColumns((c) => [...c, { label, source: "builtin", key }]); setPickerOpen(false);
  }
  function addFormField(form: string, code: string, label: string) {
    setColumns((c) => [...c, { label, source: "form_field", form, field: code }]); setPickerOpen(false);
  }
  const removeColumn = (i: number) => setColumns((c) => c.filter((_, j) => j !== i));
  const moveColumn = (i: number, dir: -1 | 1) => setColumns((c) => { const j = i + dir; if (j < 0 || j >= c.length) return c; const n = c.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
  const isLocked = (col: ReportColumn) => col.source === "builtin" && LOCKED_KEYS.includes(col.key ?? "");

  function addFilter() { setFilters((f) => [...f, { column: columns[0]?.label ?? "", operator: "contains", value: "" }]); }
  const setFilter = (i: number, patch: Partial<ReportFilter>) => setFilters((f) => f.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeFilter = (i: number) => setFilters((f) => f.filter((_, j) => j !== i));

  // A filter's operator set = the type of its target column (builtin type, else numeric/text guess).
  function columnType(label: string): FieldType {
    const col = columns.find((c) => c.label === label);
    if (!col) return "text";
    if (col.source === "builtin") return BUILTIN_COLUMNS[dataSource].find((b) => b.key === col.key)?.type ?? "text";
    const f = schema.forms.find((x) => x.name === col.form)?.fields.find((x) => x.code === col.field);
    return f?.type === "number" || f?.type === "integer" ? "number" : f?.type === "date" ? "date" : "text";
  }

  function reset() { setDataSource("subjects"); setColumns(defaultColumns("subjects")); setFilters([]); setTitle(""); setPrepopulated(false); }
  function confirmSave() {
    if (!saveName.trim()) return;
    const report: SavedReport = { id: `cr-${Math.random().toString(36).slice(2, 8)}`, name: saveName.trim(), description: saveDesc.trim(), config, createdAt: study.code };
    persistSavedReports(studyId, [...loadSavedReports(studyId), report]);
    setSaveOpen(false); setSaveName(""); setSaveDesc(""); onSaved?.();
  }

  const csvRows = preview.rows.map((r) => preview.columns.map((c) => r[c] ?? ""));

  return (
    <div className="crb">
      {prepopulated && (
        <div className="crb-banner"><i className="ti ti-sparkles"></i> Pre-populated from your Arken Insights request. Review and adjust before exporting.</div>
      )}

      {/* Step 1 — data source */}
      <div className="crb-step">
        <div className="crb-step-head"><span className="crb-step-n">1</span> Data source</div>
        <div className="crb-source-grid">
          {DATA_SOURCES.map((s) => (
            <button key={s.key} type="button" className={`crb-source${dataSource === s.key ? " active" : ""}`} onClick={() => pickDataSource(s.key)}>
              <i className={`ti ti-${s.icon}`}></i>
              <span className="crb-source-label">{s.label}</span>
              <span className="crb-source-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2 — columns */}
      <div className="crb-step">
        <div className="crb-step-head"><span className="crb-step-n">2</span> Columns
          <div className="crb-picker-wrap">
            <button type="button" className="crb-add-btn" onClick={() => setPickerOpen((o) => !o)}><i className="ti ti-plus"></i> Add column</button>
            {pickerOpen && (
              <>
                <div className="crb-picker-backdrop" onClick={() => setPickerOpen(false)} />
                <div className="crb-picker">
                  <div className="crb-picker-sec">Built-in</div>
                  {BUILTIN_COLUMNS[dataSource].filter((b) => !columns.some((c) => c.source === "builtin" && c.key === b.key)).map((b) => (
                    <button key={b.key} type="button" className="crb-picker-item" onClick={() => addBuiltin(b.key, b.label)}>{b.label}</button>
                  ))}
                  <div className="crb-picker-sec">Form fields</div>
                  {schema.forms.map((f) => (
                    <div key={f.name} className="crb-picker-form">
                      <div className="crb-picker-form-name">{f.name}</div>
                      {f.fields.map((fd) => (
                        <button key={fd.code} type="button" className="crb-picker-item crb-picker-field" onClick={() => addFormField(f.name, fd.code, `${fd.label}`)}>{fd.label} <span className="crb-picker-code">{fd.code}</span></button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="crb-cols">
          {columns.map((col, i) => (
            <div key={i} className="crb-col-row">
              <div className="crb-col-move">
                <button type="button" onClick={() => moveColumn(i, -1)} disabled={i === 0} aria-label="Move up"><i className="ti ti-chevron-up"></i></button>
                <button type="button" onClick={() => moveColumn(i, 1)} disabled={i === columns.length - 1} aria-label="Move down"><i className="ti ti-chevron-down"></i></button>
              </div>
              <input className="crb-col-label" value={col.label} onChange={(e) => setColumns((c) => c.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
              <span className={`crb-col-src ${col.source}`}>{col.source === "builtin" ? "Built-in" : col.visit ? `${col.form} · ${col.visit}` : col.form}</span>
              {isLocked(col) ? <span className="crb-col-lock"><i className="ti ti-lock" title="Always present"></i></span> : <button type="button" className="crb-col-x" onClick={() => removeColumn(i)} aria-label="Remove"><i className="ti ti-x"></i></button>}
            </div>
          ))}
        </div>
      </div>

      {/* Step 3 — filters */}
      <div className="crb-step">
        <div className="crb-step-head"><span className="crb-step-n">3</span> Filters
          <button type="button" className="crb-add-btn" onClick={addFilter}><i className="ti ti-plus"></i> Add filter</button>
        </div>
        {filters.length === 0 ? <div className="crb-filter-empty">No filters — all rows shown.</div> : (
          <div className="crb-filters">
            {filters.map((f, i) => {
              const t = columnType(f.column);
              const ops = OPERATORS[t];
              return (
                <div key={i} className="crb-filter-row">
                  {i > 0 && <span className="crb-filter-and">AND</span>}
                  <select className="crb-select" value={f.column} onChange={(e) => setFilter(i, { column: e.target.value, operator: OPERATORS[columnType(e.target.value)][0].op })}>
                    {columns.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                  <select className="crb-select" value={f.operator} onChange={(e) => setFilter(i, { operator: e.target.value })}>
                    {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  <input className="crb-filter-val" type={t === "number" ? "number" : t === "date" ? "date" : "text"} value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder="value" />
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
          <div className="crb-actions">
            <ReportCsvButton studyId={studyId} slug={title ? title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) : "custom_report"} headers={preview.columns} rows={csvRows} />
            <button type="button" className="crb-btn" onClick={() => setSaveOpen(true)} disabled={preview.columns.length === 0}><i className="ti ti-device-floppy"></i> Save report</button>
            <button type="button" className="crb-btn crb-btn-ghost" onClick={reset}><i className="ti ti-refresh"></i> Reset</button>
          </div>
        </div>
        {preview.columns.length === 0 ? (
          <div className="crb-preview-empty">Add at least one column to preview.</div>
        ) : (
          <div className="crb-preview-table-wrap">
            <table className="rpt-table">
              <thead><tr>{preview.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {preview.rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>{preview.columns.map((c, j) => <td key={c} className={j === 0 ? "mono" : ""}>{r[c] ?? "—"}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {preview.total > 20 && <div className="crb-preview-more">Showing first 20 of {preview.total} rows — export CSV for the full set.</div>}
            {preview.total === 0 && <div className="crb-preview-empty">No rows match the current filters.</div>}
          </div>
        )}
      </div>

      {saveOpen && (
        <div className="sr-modal-overlay" onClick={() => setSaveOpen(false)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-device-floppy"></i> Save custom report</div>
            <input className="crb-filter-val" style={{ width: "100%", marginBottom: "var(--space-2)" }} placeholder="Report name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
            <textarea className="sr-modal-input" placeholder="Description (optional)" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} />
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setSaveOpen(false)}>Cancel</button>
              <button className="crb-btn" type="button" disabled={!saveName.trim()} onClick={confirmSave}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
