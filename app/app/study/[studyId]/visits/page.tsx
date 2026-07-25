"use client";

// ════════════════════════════════════════════════════════════════════════════
// Visits screen — the study-wide visit scheduler. Two tabs: Upcoming & Overdue
// (pending visits for active subjects, by urgency) and Visit History (completed
// visits, with variance to target). Everything is DERIVED from the session store
// (buildVisits) — the schedule, target dates, and completion all fall out of the
// form structure. Sortable headers reuse the shared standard; Sponsor sees the
// aggregate stat strip only.
//
// PH-2401 uses production terminology ("Production week" / "collection") — gated
// on the study code (Fix 4). Reschedules are component-state only (Fix 6, no
// DATA_KEY bump); the reschedule ALSO writes a `visit_rescheduled` formAudit so
// it appears in the Audit Trail.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import { buildVisits, addDays, type VisitRow } from "@/lib/visits-data";
import type { Dataset } from "@/lib/session-store/types";
import "./visits.css";

type TabKey = "upcoming" | "history";
const newId = () => crypto.randomUUID();
const fmtDays = (n: number) => (n === 0 ? "today" : n > 0 ? `+${n}d` : `${n}d`);
const dayKey = () => new Date().toISOString().slice(0, 10);
const daysBetween = (fromIso: string, toIso: string): number => {
  const a = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
};

// Tab 1 urgency: overdue (target+window passed) → due today (within window /
// ±1d) → due this week (≤7d out) → upcoming (>7d).
type UpStatus = "overdue" | "due_today" | "due_week" | "upcoming";
function upStatusOf(row: VisitRow, today: string): { key: UpStatus; days: number } {
  const days = daysBetween(today, row.targetDate);
  if (days < -row.window) return { key: "overdue", days };
  if (days <= 1) return { key: "due_today", days };
  if (days <= 7) return { key: "due_week", days };
  return { key: "upcoming", days };
}
const UP_META: Record<UpStatus, { label: string; cls: string; rank: number }> = {
  overdue: { label: "Overdue", cls: "vc-overdue", rank: 0 },
  due_today: { label: "Due today", cls: "vc-today", rank: 1 },
  due_week: { label: "Due this week", cls: "vc-week", rank: 2 },
  upcoming: { label: "Upcoming", cls: "vc-upcoming", rank: 3 },
};

// Tab 2 variance: on time (|var| ≤ window) · early (before window opened) · late.
type HistStatus = "on_time" | "early" | "outside";
function histStatusOf(row: VisitRow): { key: HistStatus; variance: number | null } {
  if (!row.recordedDate) return { key: "outside", variance: null };
  const variance = daysBetween(row.targetDate, row.recordedDate);
  if (Math.abs(variance) <= row.window) return { key: "on_time", variance };
  if (variance < 0) return { key: "early", variance };
  return { key: "outside", variance };
}
const HIST_META: Record<HistStatus, { label: string; cls: string }> = {
  on_time: { label: "On time", cls: "vc-ontime" },
  early: { label: "Early", cls: "vc-early" },
  outside: { label: "Outside window", cls: "vc-outside" },
};
// Status sort order (asc = most concerning first): Outside → On time → Early.
const HIST_RANK: Record<HistStatus, number> = { outside: 0, on_time: 1, early: 2 };
const varianceLabel = (v: number | null) => (v == null ? "—" : v === 0 ? "On time" : v > 0 ? `+${v} days` : `${v} days`);

// PH-2401 production-week / phase labels (Fix 4), keyed by the visit's Day offset.
const PH_PHASE: Record<number, string> = {
  7: "Week 1 — Starter phase", 14: "Week 2 — Starter phase",
  21: "Week 3 — Grower phase", 28: "Week 4 — Grower phase",
  35: "Week 5 — Finisher phase", 42: "Week 6 — Finisher phase",
};

const RESCHEDULE_REASONS = ["Subject unavailable", "Equipment failure", "Site closure", "Medical hold", "Weather/logistics", "Other"];

interface Reschedule { newDate: string; reason: string; original: string }

export default function VisitsPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, selectedSiteId } = useShell();
  const { dataset, ready, update } = useStudySession();
  const ndaName = useNdaName();

  const [today] = useState(() => dayKey());
  const study = dataset.studies.find((s) => s.id === studyId);
  const isPH = study?.code === "PH-2401";

  const allRows = useMemo(() => buildVisits(dataset, studyId), [dataset, studyId]);
  // Topbar site selection narrows what's shown (the screen also has its own filter).
  const roleRows = useMemo(() => (selectedSiteId ? allRows.filter((r) => r.siteId === selectedSiteId) : allRows), [allRows, selectedSiteId]);

  const isSponsor = activeRole === "Sponsor";
  const canReschedule = activeRole === "CRC" || activeRole === "DM"; // Fix 6
  const isDM = activeRole === "DM";

  // The study's Protocol Deviation form definition (for Fix 5 deep-link + PD-needed count).
  const pdFormId = useMemo(() => dataset.forms.find((f) => f.study_id === studyId && /protocol deviation/i.test(f.name))?.id ?? null, [dataset.forms, studyId]);
  // Subjects that already have a Protocol Deviation instance on file.
  const subjectsWithPD = useMemo(() => {
    const set = new Set<string>();
    if (!pdFormId) return set;
    for (const i of dataset.formInstances) if (i.form_id === pdFormId && i.subject_id) set.add(i.subject_id);
    return set;
  }, [dataset.formInstances, pdFormId]);

  const [tab, setTab] = useState<TabKey>("upcoming");
  const [search, setSearch] = useState("");
  // Honour a ?status= deep-link from the dashboard Visit-compliance card (overdue / due_week).
  const searchParams = useSearchParams();
  const [statusF, setStatusF] = useState(() => searchParams.get("status") ?? "all");
  const [siteF, setSiteF] = useState("all");
  const { sort, toggle, setSort } = useTableSort(null); // sorting is via column headers only

  // Reschedules (component-state, keyed by visit id) + PD flags from overrides.
  const [reschedules, setReschedules] = useState<Record<string, Reschedule>>({});
  const [pdFlagged, setPdFlagged] = useState<Set<string>>(new Set());
  const [rsRow, setRsRow] = useState<VisitRow | null>(null);
  const [rsDate, setRsDate] = useState("");
  const [rsReason, setRsReason] = useState("");
  const [rsOther, setRsOther] = useState("");
  const [rsOverride, setRsOverride] = useState(false);
  // Fix 5 — the PD prompt modal target ({ subjectId }).
  const [pdModal, setPdModal] = useState<{ subjectId: string; visitName: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const siteOptions = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.name.localeCompare(b.name)), [dataset.sites, studyId]);

  // ─── PH-aware terminology (Fix 4) ───────────────────────────────────────────
  const T = {
    overdue: isPH ? "Overdue collections" : "Overdue",
    dueWeek: isPH ? "Due this week" : "Due this week",
    onTime: isPH ? "Collected on time" : "Completed on time",
    outside: "Outside window",
    total: isPH ? "Total collections" : "Total scheduled",
    historyTab: isPH ? "Collection History" : "Visit History",
    visitCol: isPH ? "Production week" : "Visit",
    visitsWord: isPH ? "collections" : "visits",
    completedWord: isPH ? "collected" : "completed",
    searchPh: isPH ? "Search pen, collection…" : "Search subject, visit…",
    complianceLbl: isPH ? "Collection compliance" : "Compliance",
    pdLbl: "PD to file",
  };
  const visitLabel = (r: VisitRow) => (isPH ? PH_PHASE[r.day] ?? r.visitName : r.visitName);
  const upLabel = (k: UpStatus) => (isPH && k === "due_today" ? "Due this week" : UP_META[k].label);

  // Reschedule-aware view of a row (effective target date drives Tab 1 status/sort).
  const eff = (r: VisitRow): VisitRow => { const rs = reschedules[r.id]; return rs ? { ...r, targetDate: rs.newDate } : r; };

  // Tab 1 = pending visits for ACTIVE subjects. Tab 2 = completed visits (any subject).
  const upcomingAll = useMemo(() => roleRows.filter((r) => !r.completed && r.subjectStatus !== "completed" && r.subjectStatus !== "withdrawn"), [roleRows]);
  const historyAll = useMemo(() => roleRows.filter((r) => r.completed), [roleRows]);

  // ─── The single filtered set that drives BOTH the stat strip and the tab rows,
  // so the stats react to the in-page filters (status / site / search) — same
  // pattern as the Animals list (stats derive from `filtered`, not the raw data).
  const filteredVisits = useMemo(() => {
    const q = search.toLowerCase().trim();
    return roleRows.filter((r) => {
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (q && !`${r.subjectCode} ${visitLabel(r)}`.toLowerCase().includes(q)) return false;
      if (statusF !== "all") {
        if (r.completed) {
          const st = histStatusOf(r).key;
          if (statusF === "on_time") return st === "on_time";
          if (statusF === "outside") return st !== "on_time";
          return false; // an upcoming-urgency filter excludes completed visits
        }
        return upStatusOf(eff(r), today).key === statusF;
      }
      return true;
    });
  }, [roleRows, search, siteF, statusF, today, reschedules]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Stat strip — derived from filteredVisits so every card reacts to filters ─
  const stats = useMemo(() => {
    let overdue = 0, dueWeek = 0, onTime = 0, outside = 0, due = 0, onTimeOfDue = 0, pdToFile = 0;
    for (const r of filteredVisits) {
      if (r.completed) {
        const s = histStatusOf(r).key;
        if (s === "on_time") onTime++; else outside++;
        if (pdFormId && s === "outside" && !subjectsWithPD.has(r.subjectId)) pdToFile++;
      } else if (r.subjectStatus !== "completed" && r.subjectStatus !== "withdrawn") {
        const s = upStatusOf(eff(r), today).key;
        if (s === "overdue") overdue++; else if (s === "due_today" || s === "due_week") dueWeek++;
      }
      // Compliance: of visits whose window has closed, how many were on time?
      if (today > addDays(r.targetDate, r.window)) { due++; if (r.completed && histStatusOf(r).key === "on_time") onTimeOfDue++; }
    }
    const compliance = due > 0 ? Math.round((onTimeOfDue / due) * 100) : null;
    return { overdue, dueWeek, onTime, outside, total: filteredVisits.length, compliance, complianceNum: onTimeOfDue, complianceDen: due, pdToFile };
  }, [filteredVisits, today, reschedules, subjectsWithPD, pdFormId]); // eslint-disable-line react-hooks/exhaustive-deps

  const complianceTone = stats.compliance == null ? "" : stats.compliance >= 90 ? "green" : stats.compliance >= 75 ? "amber" : "red";

  const resetFilters = () => { setSearch(""); setStatusF("all"); setSiteF("all"); };

  // ─── Tab 1 filter + sort ────────────────────────────────────────────────────
  const upcoming = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = upcomingAll.filter((r) => {
      const st = upStatusOf(eff(r), today).key;
      if (statusF !== "all" && statusF !== st) return false;
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (q && !`${r.subjectCode} ${visitLabel(r)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort) {
        let r = 0;
        if (sort.col === "subject") r = a.subjectCode.localeCompare(b.subjectCode);
        else if (sort.col === "target") r = eff(a).targetDate.localeCompare(eff(b).targetDate);
        else if (sort.col === "days") r = upStatusOf(eff(a), today).days - upStatusOf(eff(b), today).days;
        else if (sort.col === "status") r = UP_META[upStatusOf(eff(a), today).key].rank - UP_META[upStatusOf(eff(b), today).key].rank;
        return sort.dir === "asc" ? r : -r;
      }
      const ra = UP_META[upStatusOf(eff(a), today).key].rank, rb = UP_META[upStatusOf(eff(b), today).key].rank;
      return ra - rb || eff(a).targetDate.localeCompare(eff(b).targetDate);
    });
  }, [upcomingAll, search, statusF, siteF, sort, today, reschedules]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Tab 2 filter + sort ────────────────────────────────────────────────────
  const history = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = historyAll.filter((r) => {
      const st = histStatusOf(r).key;
      if (statusF === "on_time" && st !== "on_time") return false;
      if (statusF === "outside" && st === "on_time") return false;
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (q && !`${r.subjectCode} ${visitLabel(r)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort) {
        let r = 0;
        if (sort.col === "subject") r = a.subjectCode.localeCompare(b.subjectCode);
        else if (sort.col === "target") r = a.targetDate.localeCompare(b.targetDate);
        else if (sort.col === "completed") r = (a.recordedDate ?? "").localeCompare(b.recordedDate ?? "");
        else if (sort.col === "variance") r = (histStatusOf(a).variance ?? 0) - (histStatusOf(b).variance ?? 0);
        else if (sort.col === "status") r = HIST_RANK[histStatusOf(a).key] - HIST_RANK[histStatusOf(b).key];
        return sort.dir === "asc" ? r : -r;
      }
      return (b.recordedDate ?? "").localeCompare(a.recordedDate ?? "");
    });
  }, [historyAll, search, statusF, siteF, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Navigation ─────────────────────────────────────────────────────────────
  // Deep-link to the subject record AND open this visit's form (`?form=` is read by
  // the Subject Record's initialFormId — the parent visit group auto-expands).
  function gotoRecord(r: VisitRow) { router.push(`/study/${studyId}/data-entry/${r.subjectId}?form=${r.formId}`); }
  function gotoPdForm(subjectId: string) { router.push(`/study/${studyId}/data-entry/${subjectId}${pdFormId ? `?form=${pdFormId}` : ""}`); }
  function switchTab(t: TabKey) { setTab(t); setStatusF("all"); setSort(null); }

  // ─── Reschedule (Fix 6) ─────────────────────────────────────────────────────
  function openReschedule(r: VisitRow) {
    setRsRow(r); setRsDate(eff(r).targetDate); setRsReason(""); setRsOther(""); setRsOverride(false);
  }
  const rsReasonText = rsReason === "Other" ? rsOther.trim() : rsReason;
  const rsDelta = rsRow && rsDate ? Math.abs(daysBetween(rsRow.targetDate, rsDate)) : 0;
  const rsOutsideWindow = !!rsRow && rsDate !== "" && Math.abs(daysBetween(rsRow.targetDate, rsDate)) > rsRow.window;
  const rsBeyondRange = rsDelta > 14; // protocol-reasonable range is ±14 days
  const rsValid = !!rsRow && !!rsDate && !!rsReasonText && (!rsBeyondRange || rsOverride);
  function confirmReschedule() {
    if (!rsRow || !rsValid) return;
    const r = rsRow;
    const original = r.targetDate;
    setReschedules((m) => ({ ...m, [r.id]: { newDate: rsDate, reason: rsReasonText, original } }));
    if (rsOutsideWindow && rsOverride) setPdFlagged((s) => new Set(s).add(r.id));
    // Audit event → dataset.formAudits (creates an in_work instance if the visit has
    // none yet, so the Audit Trail can resolve its form context).
    update((d: Dataset) => {
      let inst = d.formInstances.find((i) => i.subject_id === r.subjectId && i.form_id === r.formId);
      if (!inst) { inst = { id: newId(), form_id: r.formId, subject_id: r.subjectId, status: "in_work" }; d.formInstances.push(inst); }
      d.formAudits.push({
        id: newId(), form_instance_id: inst.id, subject_id: r.subjectId, action: "visit_rescheduled",
        from_status: "", to_status: "", reason: rsReasonText, author_name: ndaName, author_role: activeRole,
        created_at: new Date().toISOString(),
        description: `${visitLabel(r)} rescheduled from ${original} to ${rsDate}${rsOutsideWindow && rsOverride ? " (outside window — PD required)" : ""}`,
      });
    });
    setToast(`${isPH ? "Collection" : "Visit"} rescheduled to ${rsDate}`);
    setRsRow(null);
  }

  if (!ready) return <div className="vs-screen"><div className="vs-empty"><i className="ti ti-loader-2"></i> Loading…</div></div>;

  const th = (label: string, key: string, width?: number) => <SortTh label={label} sortKey={key} sort={sort} onSort={toggle} style={width ? { width } : undefined} />;

  // A single Tab-1 visit line.
  const renderVisitRow = (r: VisitRow) => {
    const s = upStatusOf(eff(r), today); const meta = UP_META[s.key];
    const rs = reschedules[r.id];
    const pd = pdFlagged.has(r.id);
    return (
      <tr key={r.id}>
        <td><span className="vs-subj" onClick={() => gotoRecord(r)} title="Open subject record">{r.subjectCode}</span></td>
        <td><span className="vs-site">{r.siteName}</span></td>
        <td>
          <span className="vs-visit" title={visitLabel(r)}>{visitLabel(r)}</span>
          {pd && <span className="vs-pd-chip" title="Protocol deviation required" onClick={() => setPdModal({ subjectId: r.subjectId, visitName: visitLabel(r) })}><i className="ti ti-flag"></i> PD required</span>}
        </td>
        <td>
          <span className="vs-mono">{eff(r).targetDate}</span>
          {rs && <span className="vs-resched-chip" title={`Rescheduled from ${rs.original}`}><i className="ti ti-calendar-event" style={{ fontSize: 11 }}></i> Rescheduled</span>}
        </td>
        <td><span className="vs-window">±{r.window} day{r.window === 1 ? "" : "s"}</span></td>
        <td><span className={`vs-chip ${meta.cls}`}>{upLabel(s.key)}</span></td>
        <td><span className={`vs-mono${s.days < 0 ? " crit" : ""}`}>{fmtDays(s.days)}</span></td>
        <td>
          <div className="vs-row-actions">
            <button className="vs-act" type="button" onClick={() => gotoRecord(r)}>Open</button>
            {canReschedule && <button className="vs-act vs-act-icon" type="button" title="Reschedule" onClick={() => openReschedule(r)}><i className="ti ti-calendar-cog"></i></button>}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="vs-screen">
      {/* Header */}
      <div className="vs-header">
        <h1 className="vs-title">Visits</h1>
      </div>

      {/* Stat strip — plain numbers, colored by severity (no chip backgrounds). */}
      <div className="vs-stat-strip">
        <div className="vs-stat"><div className="vs-stat-val red">{stats.overdue}</div><div className="vs-stat-lbl">{T.overdue}</div></div>
        <div className="vs-stat"><div className="vs-stat-val amber">{stats.dueWeek}</div><div className="vs-stat-lbl">{T.dueWeek}</div></div>
        <div className="vs-stat"><div className={`vs-stat-val ${complianceTone}`}>{stats.compliance == null ? "—" : `${stats.compliance}%`}</div><div className="vs-stat-lbl">{T.complianceLbl}{stats.compliance != null && <span className="vs-stat-sub"> · {stats.complianceNum} of {stats.complianceDen} on time</span>}</div></div>
        <div className="vs-stat"><div className="vs-stat-val green">{stats.onTime}</div><div className="vs-stat-lbl">{T.onTime}</div></div>
        <div className="vs-stat"><div className="vs-stat-val amber">{stats.outside}</div><div className="vs-stat-lbl">{T.outside}</div></div>
        <div className="vs-stat"><div className={`vs-stat-val${stats.pdToFile > 0 ? " red" : ""}`}>{stats.pdToFile}</div><div className="vs-stat-lbl">{T.pdLbl}</div></div>
        <div className="vs-stat"><div className="vs-stat-val">{stats.total.toLocaleString()}</div><div className="vs-stat-lbl">{T.total}</div></div>
      </div>

      {isSponsor ? (
        <div className="vs-sponsor">
          <div className="vs-empty-icon"><i className="ti ti-chart-bar"></i></div>
          <div className="vs-empty-title">Aggregate view</div>
          <div className="vs-sponsor-sub">Subject-level visit detail is blinded for the sponsor role. The strip above shows study-wide visit compliance: <strong>{stats.overdue}</strong> overdue · <strong>{stats.dueWeek}</strong> due this week · <strong>{stats.compliance == null ? "—" : `${stats.compliance}%`}</strong> compliance · <strong>{stats.onTime}</strong> on time · <strong>{stats.outside}</strong> outside window · <strong>{stats.total}</strong> scheduled.</div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="vs-tabs">
            <button className={`vs-tab${tab === "upcoming" ? " active" : ""}`} type="button" onClick={() => switchTab("upcoming")}>
              Upcoming &amp; Overdue <span className="vs-tab-count tc-up">{upcomingAll.length}</span>
            </button>
            <button className={`vs-tab${tab === "history" ? " active" : ""}`} type="button" onClick={() => switchTab("history")}>
              {T.historyTab} <span className="vs-tab-count tc-hist">{historyAll.length}</span>
            </button>
          </div>

          {/* Filter toolbar */}
          <div className="vs-toolbar">
            <div className="vs-search"><i className="ti ti-search"></i><input type="search" placeholder={T.searchPh} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="vs-select" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status">
              {tab === "upcoming" ? (
                <>
                  <option value="all">All statuses</option><option value="overdue">{T.overdue}</option><option value="due_today">{isPH ? "Due this week" : "Due today"}</option><option value="due_week">Due this week</option><option value="upcoming">Upcoming</option>
                </>
              ) : (
                <>
                  <option value="all">All statuses</option><option value="on_time">On time</option><option value="outside">Outside window</option>
                </>
              )}
            </select>
            <select className="vs-select" value={siteF} onChange={(e) => setSiteF(e.target.value)} aria-label="Site">
              <option value="all">All sites</option>{siteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="vs-count">{(tab === "upcoming" ? upcoming : history).length} {tab === "upcoming" ? T.visitsWord : T.completedWord}</span>
          </div>

          {/* Tables */}
          <div className="vs-table-wrap">
            {tab === "upcoming" ? (
              upcoming.length === 0 ? (
                <div className="vs-empty">
                  <div className="vs-empty-icon ok"><i className="ti ti-calendar-check"></i></div>
                  <div className="vs-empty-title">{search || statusF !== "all" || siteF !== "all" ? `No ${T.visitsWord} match your filters` : `No upcoming or overdue ${T.visitsWord}`}</div>
                  {search || statusF !== "all" || siteF !== "all" ? <button className="vs-empty-link" type="button" onClick={resetFilters}>Reset filters</button> : <div className="vs-empty-sub">All scheduled {T.visitsWord} are on track.</div>}
                </div>
              ) : (
                <table className="vs-table">
                  <thead><tr>
                    {th("Subject", "subject", 150)}<th style={{ width: 120 }}>Site</th><th>{T.visitCol}</th>
                    {th("Target date", "target", 150)}<th style={{ width: 80 }}>Window</th>{th("Status", "status", 130)}
                    {th("Days", "days", 80)}<th style={{ width: 120 }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {upcoming.map((r) => renderVisitRow(r))}
                  </tbody>
                </table>
              )
            ) : history.length === 0 ? (
              <div className="vs-empty">
                <div className="vs-empty-icon"><i className="ti ti-history"></i></div>
                <div className="vs-empty-title">{search || statusF !== "all" || siteF !== "all" ? `No ${T.visitsWord} match your filters` : `No ${T.completedWord} ${T.visitsWord} yet`}</div>
                {(search || statusF !== "all" || siteF !== "all") && <button className="vs-empty-link" type="button" onClick={resetFilters}>Reset filters</button>}
              </div>
            ) : (
              <table className="vs-table">
                <thead><tr>
                  {th("Subject", "subject", 130)}<th style={{ width: 120 }}>Site</th><th>{T.visitCol}</th>
                  {th("Target date", "target", 120)}{th("Completed", "completed", 120)}{th("Variance", "variance", 110)}{th("Status", "status", 170)}
                </tr></thead>
                <tbody>
                  {history.map((r) => {
                    const h = histStatusOf(r); const meta = HIST_META[h.key];
                    const needsPd = h.key === "outside" && !!pdFormId && !subjectsWithPD.has(r.subjectId);
                    return (
                      <tr key={r.id} onClick={() => gotoRecord(r)} className="clickable">
                        <td><span className="vs-subj" onClick={(e) => { e.stopPropagation(); gotoRecord(r); }} title="Open subject record">{r.subjectCode}</span></td>
                        <td><span className="vs-site">{r.siteName}</span></td>
                        <td><span className="vs-visit" title={visitLabel(r)}>{visitLabel(r)}</span></td>
                        <td><span className="vs-mono">{r.targetDate}</span></td>
                        <td><span className="vs-mono">{r.recordedDate ?? "—"}</span></td>
                        <td><span className={`vs-mono${h.variance && Math.abs(h.variance) > r.window ? " warn" : ""}`}>{varianceLabel(h.variance)}</span></td>
                        <td>
                          <span className={`vs-chip ${meta.cls}`}>{meta.label}</span>
                          {needsPd && <span className="vs-pd-chip" title="A protocol deviation should be filed" onClick={(e) => { e.stopPropagation(); setPdModal({ subjectId: r.subjectId, visitName: visitLabel(r) }); }}><i className="ti ti-flag"></i> PD required</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Reschedule modal (Fix 6, CRC/DM) */}
      {rsRow && (
        <div className="vs-modal-overlay" onClick={() => setRsRow(null)}>
          <div className="vs-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="vs-modal-title"><i className="ti ti-calendar-cog"></i> Reschedule {isPH ? "collection" : "visit"}</div>
            <div className="vs-modal-meta">
              <span><span className="vs-modal-meta-lbl">Subject</span> {rsRow.subjectCode}</span>
              <span><span className="vs-modal-meta-lbl">{T.visitCol}</span> {visitLabel(rsRow)}</span>
              <span><span className="vs-modal-meta-lbl">Original target</span> {rsRow.targetDate}</span>
              <span><span className="vs-modal-meta-lbl">Window</span> ±{rsRow.window} day{rsRow.window === 1 ? "" : "s"}</span>
            </div>
            <div className="vs-modal-field">
              <label className="vs-modal-lbl">New target date <span className="vs-req">*</span></label>
              <input type="date" className="vs-modal-input" value={rsDate} onChange={(e) => setRsDate(e.target.value)} />
              {rsBeyondRange && <span className={`vs-modal-note${rsOverride ? " ok" : " warn"}`}>{rsOverride ? "Outside the ±14-day protocol range — override acknowledged." : `${rsDelta} days from target — beyond the ±14-day protocol range. A DM override is required.`}</span>}
              {!rsBeyondRange && rsOutsideWindow && <span className="vs-modal-note warn">Outside the ±{rsRow.window}-day window — a protocol deviation may be required.</span>}
            </div>
            <div className="vs-modal-field">
              <label className="vs-modal-lbl">Reason for rescheduling <span className="vs-req">*</span></label>
              <select className="vs-modal-input" value={rsReason} onChange={(e) => setRsReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {RESCHEDULE_REASONS.map((rr) => <option key={rr} value={rr}>{rr}</option>)}
              </select>
              {rsReason === "Other" && <input type="text" className="vs-modal-input" style={{ marginTop: "var(--space-2)" }} placeholder="Specify reason…" value={rsOther} onChange={(e) => setRsOther(e.target.value)} />}
            </div>
            {isDM && (
              <label className="vs-modal-check">
                <input type="checkbox" checked={rsOverride} onChange={(e) => setRsOverride(e.target.checked)} />
                <span>Allow scheduling outside protocol window — will require protocol deviation documentation</span>
              </label>
            )}
            <div className="vs-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setRsRow(null)}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!rsValid} onClick={confirmReschedule}>Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Protocol-deviation prompt (Fix 5) */}
      {pdModal && (
        <div className="vs-modal-overlay" onClick={() => setPdModal(null)}>
          <div className="vs-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="vs-modal-title"><i className="ti ti-flag"></i> Protocol deviation</div>
            <div className="vs-modal-body">A protocol deviation should be filed for this {isPH ? "collection" : "visit"} (<strong>{pdModal.visitName}</strong>). Go to the subject record to complete the Protocol Deviation form?</div>
            <div className="vs-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setPdModal(null)}>Cancel</button>
              <button className="btn-primary" type="button" onClick={() => { const sid = pdModal.subjectId; setPdModal(null); gotoPdForm(sid); }}>Go to form</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="vs-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button type="button" className="vs-toast-x" onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}
