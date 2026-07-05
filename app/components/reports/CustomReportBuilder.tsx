"use client";

// Custom Report builder — subject-grain. Two lifecycles:
//  • Unsaved (new / AI / manual)  → BUILD mode: column builder + conditions + preview.
//  • Saved                        → RUN mode (toolbar + KPI strip + results table),
//                                    with an EDIT mode that reopens the builder above.
// Blinding-aware throughout (resolveReport). No data-source selector — form-field
// columns join each subject's value/metadata.
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { ReportCsvButton } from "@/components/reports/ReportKit";
import { subjectCounts, visitCompliance, openQueryCount, sdvProgress } from "@/lib/dashboard-data";
import { buildAeRoster, buildSubjectIndex } from "@/lib/reports-data";
import { buildVisits, addDays } from "@/lib/visits-data";
import { buildSdvWorklist } from "@/lib/sdv-data";
import {
  ASPECT_GROUPS, ASPECT_LABEL, BUILTIN_GROUPS, LOCKED_COLUMNS, OPERATORS, NO_VALUE_OPS, TWO_VALUE_OPS, DAYS_OPS,
  isLockedColumn, colId, pickableForms, resolveReport, columnFieldType, loadSavedReports, persistSavedReports,
  type ReportColumn, type ReportFilter, type ReportConfig, type FieldAspect, type SavedReport, type FieldType,
} from "@/lib/report-builder";

type Mode = "build" | "run" | "edit";
type StatKey = "enrolled" | "overdue" | "queries" | "sdv" | "saes";
const ENROLLED = new Set(["active", "completed", "withdrawn", "randomized", "enrolled"]);
const todayISO = () => new Date().toISOString().slice(0, 10);

export function CustomReportBuilder({ studyId, initial, source = "manual", savedReport, onSaved, onDelete, onToast }: {
  studyId: string; initial?: ReportConfig | null; source?: "ai" | "saved" | "manual"; savedReport?: SavedReport | null;
  onSaved?: () => void; onDelete?: (id: string) => void; onToast?: (msg: string) => void;
}) {
  const { dataset } = useStudySession();
  const { study, activeRole } = useShell();

  const [columns, setColumns] = useState<ReportColumn[]>(initial?.columns?.length ? withIds(initial.columns) : [...LOCKED_COLUMNS]);
  const [filters, setFilters] = useState<ReportFilter[]>(initial?.filters ?? []);
  const [title, setTitle] = useState(initial?.title?.trim() || "Untitled report");
  const [editingTitle, setEditingTitle] = useState(false);
  const [mode, setMode] = useState<Mode>(source === "saved" ? "run" : "build");
  const [saved, setSaved] = useState<SavedReport | null>(savedReport ?? null);
  const prepopulated = source === "ai";
  const forms = useMemo(() => pickableForms(dataset, studyId), [dataset, studyId]);

  // Picker + modals.
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
  const editSnap = useRef<{ columns: ReportColumn[]; filters: ReportFilter[]; title: string } | null>(null);

  // Run-mode state.
  const [siteF, setSiteF] = useState(""); const [barnF, setBarnF] = useState(""); const [penF, setPenF] = useState("");
  const [dateFrom, setDateFrom] = useState(""); const [dateTo, setDateTo] = useState("");
  const [statFocus, setStatFocus] = useState<StatKey | null>(null);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState<{ columns: string[]; rows: Record<string, string>[] }>({ columns: [], rows: [] });
  const [lastRun, setLastRun] = useState(""); const [dataAsOf, setDataAsOf] = useState("");

  const namedTitle = title.trim() && title.trim() !== "Untitled report" ? title.trim() : "";
  const config: ReportConfig = useMemo(() => ({ columns, filters, title: namedTitle || undefined }), [columns, filters, namedTitle]);

  // Debounced preview (build/edit only).
  const [preview, setPreview] = useState<ReturnType<typeof resolveReport>>({ columns: [], rows: [], total: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (mode === "run") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(resolveReport(dataset, studyId, config, activeRole)), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [dataset, studyId, config, activeRole, mode]);

  // ── Per-subject metadata + KPIs (for run mode) ──
  const meta = useMemo(() => computeSubjectMeta(dataset, studyId), [dataset, studyId]);
  const kpis = useMemo(() => {
    const sc = subjectCounts(dataset, studyId);
    const vc = visitCompliance(dataset, studyId);
    const sdv = sdvProgress(dataset, studyId);
    const saes = buildAeRoster(dataset, studyId).filter((a) => a.serious).length;
    return { enrolled: sc.active + sc.completed + sc.withdrawn, overdue: vc.overdue, queries: openQueryCount(dataset, studyId), sdv: sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0, saes };
  }, [dataset, studyId]);

  // Toolbar option lists (cascading).
  const sites = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId), [dataset.sites, studyId]);
  const siteIds = useMemo(() => new Set(sites.map((s) => s.id)), [sites]);
  const barns = useMemo(() => dataset.barns.filter((b) => siteIds.has(b.site_id) && (!siteF || b.site_id === siteF)), [dataset.barns, siteIds, siteF]);
  const barnIds = useMemo(() => new Set(barns.map((b) => b.id)), [barns]);
  const pens = useMemo(() => dataset.pens.filter((p) => barnIds.has(p.barn_id) && (!barnF || p.barn_id === barnF)), [dataset.pens, barnIds, barnF]);
  const isBR = study.code === "BR-2502"; const isPH = study.code === "PH-2401";
  const barnWord = isPH ? "houses" : "barns";

  function runReport() {
    setRunning(true);
    setTimeout(() => {
      const base = resolveReport(dataset, studyId, config, activeRole);
      const allowed = allowedCodes();
      const rows = allowed ? base.rows.filter((r) => allowed.has(r["Subject ID"])) : base.rows;
      setRunResults({ columns: base.columns, rows });
      setLastRun(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
      setDataAsOf(todayISO());
      setRunning(false);
    }, 350);
  }
  function allowedCodes(): Set<string> | null {
    let allowed: Set<string> | null = null;
    const narrow = (pred: (m: SubjectMetaRow) => boolean) => {
      const s = new Set(Array.from(meta.entries()).filter(([, mm]) => pred(mm)).map(([code]) => code));
      allowed = allowed ? new Set(Array.from(allowed).filter((c) => s.has(c))) : s;
    };
    if (siteF) narrow((m) => m.siteId === siteF);
    if (barnF) narrow((m) => m.barnId === barnF);
    if (penF) narrow((m) => m.penId === penF);
    if (dateFrom) narrow((m) => !!m.enrollDate && m.enrollDate >= dateFrom);
    if (dateTo) narrow((m) => !!m.enrollDate && m.enrollDate <= dateTo);
    return allowed;
  }
  // Auto-run whenever run mode is (re)entered.
  useEffect(() => {
    if (mode === "run") runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const statPredicate: Record<StatKey, (m: SubjectMetaRow) => boolean> = {
    enrolled: (m) => m.enrolled, overdue: (m) => m.overdue, queries: (m) => m.openQ, sdv: (m) => m.sdvIncomplete, saes: (m) => m.sae,
  };
  const subjectIdLabel = columns.find((c) => c.kind === "builtin" && c.builtinKey === "subjectId")?.label ?? "Subject ID";
  const displayRows = statFocus ? runResults.rows.filter((r) => { const m = meta.get(r[subjectIdLabel]); return m && statPredicate[statFocus](m); }) : runResults.rows;

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
  const setColLabel = (id: string, label: string) => setColumns((c) => c.map((x) => (x.id === id ? { ...x, label } : x)));
  function onDrop(to: number) {
    const from = dragFrom.current; dragFrom.current = null;
    if (from == null || from === to) return;
    setColumns((c) => { const n = c.slice(); const [m] = n.splice(from, 1); n.splice(to, 0, m); return n; });
  }

  function addCondition() { setFilters((f) => [...f, { column: columns[0]?.label ?? "", operator: "contains", value: "" }]); }
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
    setTitle(report.name); setSaved(report); setSaveOpen(false); onSaved?.(); onToast?.(`Report saved — ${report.name}`);
    setMode("run");
  }
  function confirmDelete() { const id = saved?.id; setDeleteOpen(false); setSaved(null); setMode("build"); if (id) onDelete?.(id); }
  function startEdit() { editSnap.current = { columns, filters, title }; setMode("edit"); }
  function cancelEdit() { if (editSnap.current) { setColumns(editSnap.current.columns); setFilters(editSnap.current.filters); setTitle(editSnap.current.title); } setMode("run"); }
  function saveEdit() {
    if (!saved) return;
    const name = title.trim() || saved.name;
    const updated: SavedReport = { ...saved, name, config: { columns, filters, title: name } };
    persistSavedReports(studyId, loadSavedReports(studyId).map((r) => (r.id === saved.id ? updated : r)));
    setSaved(updated); setTitle(name); onSaved?.(); onToast?.(`Report saved — ${name}`); setMode("run");
  }

  const exportCols = mode === "run" ? runResults.columns : preview.columns;
  const exportRows = (mode === "run" ? displayRows : preview.rows).map((r) => exportCols.map((c) => r[c] ?? ""));

  const builderBody = (
    <>
      {/* Columns */}
      <div className="crb-step">
        <div className="crb-step-head">Columns
          <button type="button" className="crb-add-primary" onClick={openPicker}><i className="ti ti-plus"></i> Add column</button>
        </div>
        <div className="crb-cols">
          {columns.map((col, i) => {
            const locked = isLockedColumn(col);
            return (
              <div key={col.id} className="crb-col-row" draggable={!locked} onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}>
                <span className={`crb-grip${locked ? " disabled" : ""}`}><i className="ti ti-grip-vertical"></i></span>
                <input className="crb-col-label" value={col.label} onChange={(e) => setColLabel(col.id, e.target.value)} />
                <span className={`crb-col-src ${col.kind}`}>{col.kind === "builtin" ? "Built-in" : `${col.form} · ${ASPECT_LABEL[col.aspect ?? "value"]}`}</span>
                {locked ? <span className="crb-col-lock"><i className="ti ti-lock" title="Always present"></i></span> : <button type="button" className="crb-col-x" onClick={() => removeColumn(col.id)} aria-label="Remove"><i className="ti ti-x"></i></button>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Conditions */}
      <div className="crb-step">
        <div className="crb-step-head">Conditions
          <button type="button" className="crb-add-btn" onClick={addCondition}><i className="ti ti-plus"></i> Add condition</button>
        </div>
        {filters.length === 0 ? <div className="crb-filter-empty">No conditions — all rows shown.</div> : (
          <div className="crb-filters">
            {filters.map((f, i) => {
              const ft = filterType(f.column);
              const ops = OPERATORS[ft];
              const baseType = ft === "number" ? "number" : ft === "date" ? "date" : "text";
              return (
                <div key={i} className="crb-filter-row">
                  {i > 0 && <span className="crb-filter-and">AND</span>}
                  <select className="crb-select" value={f.column} onChange={(e) => setFilter(i, { column: e.target.value, operator: OPERATORS[filterType(e.target.value)][0].op, value: "", value2: "" })}>
                    {columns.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                  </select>
                  <select className="crb-select" value={f.operator} onChange={(e) => setFilter(i, { operator: e.target.value, ...(TWO_VALUE_OPS.has(e.target.value) ? {} : { value2: "" }) })}>
                    {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  {NO_VALUE_OPS.has(f.operator) ? null
                    : TWO_VALUE_OPS.has(f.operator) ? (
                      <>
                        <input className="crb-filter-val crb-filter-val-sm" type={baseType} value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder="from" />
                        <span className="crb-filter-and">and</span>
                        <input className="crb-filter-val crb-filter-val-sm" type={baseType} value={f.value2 ?? ""} onChange={(e) => setFilter(i, { value2: e.target.value })} placeholder="to" />
                      </>
                    ) : DAYS_OPS.has(f.operator) ? (
                      <><input className="crb-filter-val crb-filter-val-sm" type="number" value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder="X" /><span className="crb-filter-and">days</span></>
                    ) : (
                      <input className="crb-filter-val" type={f.operator === "one_of" || f.operator === "not_one_of" ? "text" : baseType} value={f.value} onChange={(e) => setFilter(i, { value: e.target.value })} placeholder={f.operator === "one_of" || f.operator === "not_one_of" ? "a, b, c" : "value"} />
                    )}
                  <button type="button" className="crb-col-x" onClick={() => removeFilter(i)} aria-label="Remove condition"><i className="ti ti-x"></i></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="crb-preview">
        <div className="crb-preview-head"><span><i className="ti ti-table"></i> Preview <span className="crb-preview-count">{preview.total} row{preview.total === 1 ? "" : "s"} total</span></span></div>
        {columns.length === 0 ? <div className="crb-preview-empty">Add at least one column to preview.</div> : (
          <div className="crb-preview-table-wrap">
            <table className="rpt-table">
              <thead><tr>{preview.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{preview.rows.slice(0, 20).map((r, i) => <tr key={i}>{preview.columns.map((c, j) => <td key={c} className={j === 0 ? "mono" : ""}>{r[c] ?? "—"}</td>)}</tr>)}</tbody>
            </table>
            {preview.total === 0 && <div className="crb-preview-empty">No rows match the current conditions.</div>}
            {preview.total > 20 && <div className="crb-preview-more">Showing first 20 of {preview.total} rows — export CSV for the full set.</div>}
          </div>
        )}
      </div>

      <div className="crb-actionbar"><button type="button" className="crb-reset-link" onClick={() => setResetOpen(true)}><i className="ti ti-refresh"></i> Reset</button></div>
    </>
  );

  return (
    <div className="crb">
      {/* Header — standard report style */}
      <div className="rpt-header">
        <div className="rpt-header-text">
          <div className="rpt-eyebrow">Custom report</div>
          {editingTitle ? (
            <input className="crb-title-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTitle(); } }} />
          ) : (
            <button type="button" className={`crb-title-h${namedTitle ? "" : " untitled"}`} onClick={() => setEditingTitle(true)} title="Edit report title">{title}<i className="ti ti-pencil crb-title-pencil"></i></button>
          )}
          <div className="rpt-meta">
            <span><i className="ti ti-flask"></i> {study.code} · {study.name}</span>
            {mode === "run"
              ? <><span><i className="ti ti-player-play"></i> Last run: {lastRun || "—"}</span><span><i className="ti ti-database"></i> Data as of: {dataAsOf || todayISO()}</span></>
              : <span><i className="ti ti-user-shield"></i> {activeRole}</span>}
          </div>
        </div>
        <div className="rpt-header-actions crb-head-btns">
          {mode === "run" ? (
            <>
              <ReportCsvButton studyId={studyId} slug="custom" headers={exportCols} rows={exportRows} />
              <button type="button" className="rpt-btn" onClick={() => onToast?.("PDF export coming soon")}><i className="ti ti-file-type-pdf"></i> Export PDF</button>
              <button type="button" className="rpt-btn" onClick={startEdit}><i className="ti ti-pencil"></i> Edit</button>
              <button type="button" className="crb-btn crb-btn-danger" onClick={() => setDeleteOpen(true)}><i className="ti ti-trash"></i> Delete</button>
            </>
          ) : mode === "edit" ? (
            <ReportCsvButton studyId={studyId} slug="custom" headers={exportCols} rows={exportRows} />
          ) : (
            <>
              <ReportCsvButton studyId={studyId} slug="custom" headers={exportCols} rows={exportRows} />
              <button type="button" className="crb-btn" onClick={openSave} disabled={columns.length === 0}><i className="ti ti-device-floppy"></i> Save report</button>
            </>
          )}
        </div>
      </div>

      {prepopulated && mode !== "run" && <div className="crb-banner"><i className="ti ti-sparkles"></i> Pre-populated from your Arken Insights request. Review and adjust before exporting.</div>}

      {/* BUILD mode */}
      {mode === "build" && builderBody}

      {/* EDIT mode — builder above the run table */}
      {mode === "edit" && (
        <>
          <div className="crb-banner crb-banner-edit">
            <span><i className="ti ti-pencil"></i> Editing saved report — <strong>{saved?.name}</strong>. Save to apply changes.</span>
            <span className="crb-banner-actions">
              <button type="button" className="crb-btn crb-btn-ghost" onClick={cancelEdit}>Cancel</button>
              <button type="button" className="crb-btn" onClick={saveEdit}>Save</button>
            </span>
          </div>
          {builderBody}
        </>
      )}

      {/* RUN mode */}
      {mode === "run" && (
        <>
          <div className="crb-toolbar">
            <select className="crb-pill" value={siteF} onChange={(e) => { setSiteF(e.target.value); setBarnF(""); setPenF(""); }}>
              <option value="">All sites ›</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
            </select>
            {(isBR || isPH) && (
              <select className="crb-pill" value={barnF} onChange={(e) => { setBarnF(e.target.value); setPenF(""); }}>
                <option value="">All {barnWord} ›</option>{barns.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {(isBR || isPH) && (
              <select className="crb-pill" value={penF} onChange={(e) => setPenF(e.target.value)}>
                <option value="">All pens ›</option>{pens.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <span className="crb-daterange">From <input type="date" className="crb-date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /> to <input type="date" className="crb-date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></span>
            <button type="button" className="crb-btn crb-run-btn" onClick={runReport} disabled={running}>{running ? <><i className="ti ti-loader-2 crb-spin"></i> Running…</> : <><i className="ti ti-refresh"></i> Run report</>}</button>
          </div>

          <div className="crb-statstrip">
            {([["enrolled", kpis.enrolled, "Enrolled", ""], ["overdue", kpis.overdue, "Overdue visits", kpis.overdue > 0 ? "amber" : ""], ["queries", kpis.queries, "Open queries", kpis.queries > 0 ? "amber" : ""], ["sdv", `${kpis.sdv}%`, "SDV complete", kpis.sdv >= 90 ? "green" : "amber"], ["saes", kpis.saes, "SAEs", kpis.saes > 0 ? "red" : ""]] as [StatKey, string | number, string, string][]).map(([key, val, label, tone]) => (
              <button key={key} type="button" className={`crb-stat${statFocus === key ? " active" : ""}`} onClick={() => setStatFocus((s) => (s === key ? null : key))}>
                <div className={`crb-stat-val ${tone}`}>{val}</div>
                <div className="crb-stat-lbl">{label}</div>
              </button>
            ))}
          </div>

          {statFocus && <div className="crb-focus-note">Filtered to <strong>{displayRows.length}</strong> subject{displayRows.length === 1 ? "" : "s"} · {statFocus === "enrolled" ? "enrolled" : statFocus === "overdue" ? "with overdue visits" : statFocus === "queries" ? "with open queries" : statFocus === "sdv" ? "with incomplete SDV" : "with an SAE"} <button type="button" className="crb-focus-clear" onClick={() => setStatFocus(null)}>Clear</button></div>}

          <div className="crb-preview-table-wrap crb-run-table">
            <table className="rpt-table">
              <thead><tr>{runResults.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{displayRows.map((r, i) => <tr key={i}>{runResults.columns.map((c, j) => <td key={c} className={j === 0 ? "mono" : ""}>{r[c] ?? "—"}</td>)}</tr>)}</tbody>
            </table>
            {displayRows.length === 0 && !running && <div className="crb-preview-empty">No rows match the current filters.</div>}
          </div>
        </>
      )}

      {/* 3-step column picker */}
      {pickerOpen && <div className="crb-picker-overlay" onClick={() => setPickerOpen(false)} />}
      <div className={`crb-slidepicker${pickerOpen ? " open" : ""}`}>
        <div className="crb-picker-header">
          {(pForm || pField) && <button type="button" className="crb-picker-back" onClick={() => (pField ? setPField(null) : setPForm(null))}><i className="ti ti-arrow-left"></i></button>}
          <span>{!pForm ? "Pick a form" : !pField ? "Pick a field" : "What to show"}</span>
          <button type="button" className="crb-picker-close" onClick={() => setPickerOpen(false)}><i className="ti ti-x"></i></button>
        </div>
        {!pForm && (
          <div className="crb-picker-body">
            <div className="crb-picker-sec">Built-in</div>
            {BUILTIN_GROUPS.map((g) => <button key={g.form} type="button" className="crb-picker-row" onClick={() => setPForm({ builtin: true, name: g.name })}><i className={`ti ti-${g.icon}`}></i> {g.name} <i className="ti ti-chevron-right crb-picker-chev"></i></button>)}
            <div className="crb-picker-sec">Forms</div>
            {forms.map((f) => <button key={f.name} type="button" className="crb-picker-row" onClick={() => setPForm({ builtin: false, name: f.name })}><i className="ti ti-file-text"></i> {f.name} <i className="ti ti-chevron-right crb-picker-chev"></i></button>)}
          </div>
        )}
        {pForm && !pField && (pForm.builtin ? (
          <div className="crb-picker-body">
            {BUILTIN_GROUPS.find((g) => g.name === pForm.name)!.fields.map((fd) => <button key={fd.key} type="button" className="crb-picker-row" onClick={() => pickBuiltinField(fd.key, fd.label)}>{fd.label}</button>)}
          </div>
        ) : (
          <div className="crb-picker-body">
            <div className="crb-picker-search"><i className="ti ti-search"></i><input placeholder="Search fields…" value={pSearch} onChange={(e) => setPSearch(e.target.value)} /></div>
            {(forms.find((f) => f.name === pForm.name)?.fields ?? []).filter((fd) => !pSearch || fd.label.toLowerCase().includes(pSearch.toLowerCase()) || fd.code.includes(pSearch.toLowerCase())).map((fd) => <button key={fd.code} type="button" className="crb-picker-row" onClick={() => { setPField({ code: fd.code, label: fd.label }); setPAspects(new Set<FieldAspect>(["value"])); }}>{fd.label} <span className="crb-picker-type">{fd.type}</span></button>)}
          </div>
        ))}
        {pForm && !pForm.builtin && pField && (
          <>
            <div className="crb-picker-body">
              <div className="crb-picker-field-crumb">{pForm.name} → {pField.label}</div>
              {ASPECT_GROUPS.map((g) => (
                <div key={g.group} className="crb-aspect-group">
                  <div className="crb-picker-sec">{g.group}</div>
                  {g.items.map((it) => <label key={it.key} className="crb-aspect"><input type="checkbox" checked={pAspects.has(it.key)} onChange={(e) => setPAspects((s) => { const n = new Set(s); if (e.target.checked) n.add(it.key); else n.delete(it.key); return n; })} /><span>{it.label}</span></label>)}
                </div>
              ))}
            </div>
            <div className="crb-picker-foot"><button type="button" className="crb-btn" disabled={pAspects.size === 0} onClick={addFieldAspects}>Add to report{pAspects.size > 1 ? ` (${pAspects.size})` : ""}</button></div>
          </>
        )}
      </div>

      {/* Save modal */}
      {saveOpen && (
        <div className="crb-modal-overlay" onClick={() => setSaveOpen(false)}>
          <div className="crb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="crb-modal-header">
              <span className="crb-modal-title">Save report</span>
              <button type="button" className="crb-modal-close" onClick={() => setSaveOpen(false)} aria-label="Close"><i className="ti ti-x"></i></button>
            </div>
            <div className="crb-modal-body">
              <label className="crb-modal-lbl">Report name <span style={{ color: "var(--red-600)" }}>*</span></label>
              <input className="crb-modal-input" placeholder="e.g. CADESI responders by site" value={saveName} onChange={(e) => setSaveName(e.target.value)} autoFocus />
              <label className="crb-modal-lbl" style={{ marginTop: "var(--space-3)" }}>Description</label>
              <textarea className="crb-modal-input crb-modal-textarea" placeholder="Optional — describe what this report shows" value={saveDesc} onChange={(e) => setSaveDesc(e.target.value)} />
              <div className="crb-save-note"><i className="ti ti-info-circle"></i> This report will be added to your saved reports list in the sidebar.</div>
            </div>
            <div className="crb-modal-footer">
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setSaveOpen(false)}>Cancel</button>
              <button className="crb-btn" type="button" disabled={!saveName.trim()} onClick={confirmSave}>Save &amp; add to sidebar</button>
            </div>
          </div>
        </div>
      )}

      {/* Reset confirm */}
      {resetOpen && (
        <div className="crb-modal-overlay" onClick={() => setResetOpen(false)}>
          <div className="crb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="crb-modal-header"><span className="crb-modal-title">Reset this report?</span><button type="button" className="crb-modal-close" onClick={() => setResetOpen(false)} aria-label="Close"><i className="ti ti-x"></i></button></div>
            <div className="crb-modal-body">All columns and conditions will be cleared.</div>
            <div className="crb-modal-footer">
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setResetOpen(false)}>Cancel</button>
              <button className="crb-btn" type="button" onClick={doReset}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteOpen && saved && (
        <div className="crb-modal-overlay" onClick={() => setDeleteOpen(false)}>
          <div className="crb-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="crb-modal-header"><span className="crb-modal-title">Delete “{saved.name}”?</span><button type="button" className="crb-modal-close" onClick={() => setDeleteOpen(false)} aria-label="Close"><i className="ti ti-x"></i></button></div>
            <div className="crb-modal-body">This cannot be undone.</div>
            <div className="crb-modal-footer">
              <button className="crb-btn crb-btn-ghost" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button>
              <button className="crb-btn crb-btn-danger" type="button" onClick={confirmDelete}><i className="ti ti-trash"></i> Delete report</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Per-subject metadata for run-mode filters + stat-card focus ──
interface SubjectMetaRow { siteId: string | null; barnId: string | null; penId: string | null; enrollDate: string | null; enrolled: boolean; overdue: boolean; openQ: boolean; sae: boolean; sdvIncomplete: boolean }
function computeSubjectMeta(dataset: Parameters<typeof buildSubjectIndex>[0], studyId: string): Map<string, SubjectMetaRow> {
  const ix = buildSubjectIndex(dataset, studyId);
  const m = new Map<string, SubjectMetaRow>();
  const enrollOf = (sid: string) => { const byCode = ix.byCode.get(sid); for (const c of ["enrollment_date", "randomization_date", "consent_date", "placement_date", "screening_date"]) { const v = byCode?.get(c)?.[0]; if (v) return v; } return null; };
  for (const s of ix.subjects) m.set(s.subject_code, { siteId: s.site_id, barnId: s.barn_id, penId: s.pen_id, enrollDate: enrollOf(s.id), enrolled: ENROLLED.has(s.status), overdue: false, openQ: false, sae: false, sdvIncomplete: false });
  const codeById = new Map(ix.subjects.map((s) => [s.id, s.subject_code]));
  const today = todayISO();
  for (const v of buildVisits(dataset, studyId)) { if (!v.completed && v.subjectStatus === "active" && addDays(v.targetDate, v.window) < today) { const r = m.get(v.subjectCode); if (r) r.overdue = true; } }
  const instSubj = new Map(dataset.formInstances.map((i) => [i.id, i.subject_id]));
  for (const q of dataset.queries) { if (q.status === "resolved" || q.status === "closed") continue; const sid = instSubj.get(q.form_instance_id); const code = sid ? codeById.get(sid) : undefined; const r = code ? m.get(code) : undefined; if (r) r.openQ = true; }
  for (const a of buildAeRoster(dataset, studyId)) { if (a.serious) { const r = m.get(a.subjectCode); if (r) r.sae = true; } }
  for (const w of buildSdvWorklist(dataset, studyId)) { if (w.sdvStatus !== "complete") { const r = m.get(w.subjectCode); if (r) r.sdvIncomplete = true; } }
  return m;
}

// Ensure every column carries a stable id (AI/saved configs may omit it).
function withIds(cols: ReportColumn[]): ReportColumn[] {
  const locked = [...LOCKED_COLUMNS];
  const extra = cols.filter((c) => !isLockedColumn(c)).map((c) => ({ ...c, id: c.id ?? colId() }));
  return [...locked, ...extra];
}
