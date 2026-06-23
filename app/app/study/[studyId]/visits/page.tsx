"use client";

// ════════════════════════════════════════════════════════════════════════════
// Visits screen — the study-wide visit scheduler. Two tabs: Upcoming & Overdue
// (pending visits for active subjects, by urgency) and Visit History (completed
// visits, with variance to target). Everything is DERIVED from the session store
// (buildVisits) — the schedule, target dates, and completion all fall out of the
// form structure. Sortable headers reuse the shared standard; Sponsor sees the
// aggregate stat strip only.
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import { buildVisits, type VisitRow } from "@/lib/visits-data";
import "./visits.css";

type TabKey = "upcoming" | "history";
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

export default function VisitsPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, selectedSiteId } = useShell();
  const { dataset, ready } = useStudySession();

  const [today] = useState(() => dayKey());
  const allRows = useMemo(() => buildVisits(dataset, studyId), [dataset, studyId]);
  // Topbar site selection narrows what's shown (the screen also has its own filter).
  const roleRows = useMemo(() => (selectedSiteId ? allRows.filter((r) => r.siteId === selectedSiteId) : allRows), [allRows, selectedSiteId]);

  const isSponsor = activeRole === "Sponsor";

  const [tab, setTab] = useState<TabKey>("upcoming");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [siteF, setSiteF] = useState("all");
  const { sort, toggle, setSort } = useTableSort(null); // sorting is via column headers only

  const siteOptions = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.name.localeCompare(b.name)), [dataset.sites, studyId]);

  // Tab 1 = pending visits for ACTIVE subjects. Tab 2 = completed visits (any subject).
  const upcomingAll = useMemo(() => roleRows.filter((r) => !r.completed && r.subjectStatus !== "completed" && r.subjectStatus !== "withdrawn"), [roleRows]);
  const historyAll = useMemo(() => roleRows.filter((r) => r.completed), [roleRows]);

  // Stat strip (role-scoped, pre in-page filters).
  const stats = useMemo(() => {
    let overdue = 0, dueWeek = 0;
    for (const r of upcomingAll) { const s = upStatusOf(r, today).key; if (s === "overdue") overdue++; else if (s === "due_today" || s === "due_week") dueWeek++; }
    let onTime = 0, outside = 0;
    for (const r of historyAll) { const s = histStatusOf(r).key; if (s === "on_time") onTime++; else outside++; }
    return { overdue, dueWeek, onTime, outside, total: roleRows.length };
  }, [upcomingAll, historyAll, roleRows, today]);

  const resetFilters = () => { setSearch(""); setStatusF("all"); setSiteF("all"); };

  // ─── Tab 1 filter + sort ────────────────────────────────────────────────────
  const upcoming = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = upcomingAll.filter((r) => {
      const st = upStatusOf(r, today).key;
      if (statusF !== "all" && statusF !== st) return false;
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (q && !`${r.subjectCode} ${r.visitName}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort) {
        let r = 0;
        if (sort.col === "subject") r = a.subjectCode.localeCompare(b.subjectCode);
        else if (sort.col === "target") r = a.targetDate.localeCompare(b.targetDate);
        else if (sort.col === "days") r = upStatusOf(a, today).days - upStatusOf(b, today).days;
        else if (sort.col === "status") r = UP_META[upStatusOf(a, today).key].rank - UP_META[upStatusOf(b, today).key].rank; // asc = most urgent first
        return sort.dir === "asc" ? r : -r;
      }
      // Default order: by urgency (rank), then soonest target.
      const ra = UP_META[upStatusOf(a, today).key].rank, rb = UP_META[upStatusOf(b, today).key].rank;
      return ra - rb || a.targetDate.localeCompare(b.targetDate);
    });
  }, [upcomingAll, search, statusF, siteF, sort, today]);

  // ─── Tab 2 filter + sort ────────────────────────────────────────────────────
  const history = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = historyAll.filter((r) => {
      const st = histStatusOf(r).key;
      if (statusF === "on_time" && st !== "on_time") return false;
      if (statusF === "outside" && st === "on_time") return false;
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (q && !`${r.subjectCode} ${r.visitName}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort) {
        let r = 0;
        if (sort.col === "subject") r = a.subjectCode.localeCompare(b.subjectCode);
        else if (sort.col === "target") r = a.targetDate.localeCompare(b.targetDate);
        else if (sort.col === "completed") r = (a.recordedDate ?? "").localeCompare(b.recordedDate ?? "");
        else if (sort.col === "variance") r = (histStatusOf(a).variance ?? 0) - (histStatusOf(b).variance ?? 0);
        else if (sort.col === "status") r = HIST_RANK[histStatusOf(a).key] - HIST_RANK[histStatusOf(b).key]; // asc = most concerning first
        return sort.dir === "asc" ? r : -r;
      }
      return (b.recordedDate ?? "").localeCompare(a.recordedDate ?? ""); // default: newest first
    });
  }, [historyAll, search, statusF, siteF, sort]);

  // Deep-link to the subject record AND open this visit's form in the sidebar
  // (`?form=` is read by the Subject Record's initialFormId).
  function gotoRecord(r: VisitRow) { router.push(`/study/${studyId}/data-entry/${r.subjectId}?form=${r.formId}`); }
  function switchTab(t: TabKey) { setTab(t); setStatusF("all"); setSort(null); }

  if (!ready) return <div className="vs-screen"><div className="vs-empty"><i className="ti ti-loader-2"></i> Loading…</div></div>;

  const th = (label: string, key: string, width?: number) => <SortTh label={label} sortKey={key} sort={sort} onSort={toggle} style={width ? { width } : undefined} />;

  return (
    <div className="vs-screen">
      {/* Header */}
      <div className="vs-header">
        <h1 className="vs-title">Visits</h1>
      </div>

      {/* Stat strip — plain numbers, colored by severity (no chip backgrounds). */}
      <div className="vs-stat-strip">
        <div className="vs-stat"><div className="vs-stat-val red">{stats.overdue}</div><div className="vs-stat-lbl">Overdue</div></div>
        <div className="vs-stat"><div className="vs-stat-val amber">{stats.dueWeek}</div><div className="vs-stat-lbl">Due this week</div></div>
        <div className="vs-stat"><div className="vs-stat-val green">{stats.onTime}</div><div className="vs-stat-lbl">Completed on time</div></div>
        <div className="vs-stat"><div className="vs-stat-val amber">{stats.outside}</div><div className="vs-stat-lbl">Outside window</div></div>
        <div className="vs-stat"><div className="vs-stat-val">{stats.total.toLocaleString()}</div><div className="vs-stat-lbl">Total scheduled</div></div>
      </div>

      {isSponsor ? (
        <div className="vs-sponsor">
          <div className="vs-empty-icon"><i className="ti ti-chart-bar"></i></div>
          <div className="vs-empty-title">Aggregate view</div>
          <div className="vs-sponsor-sub">Subject-level visit detail is blinded for the sponsor role. The strip above shows study-wide visit compliance: <strong>{stats.overdue}</strong> overdue · <strong>{stats.dueWeek}</strong> due this week · <strong>{stats.onTime}</strong> completed on time · <strong>{stats.outside}</strong> outside window · <strong>{stats.total}</strong> scheduled.</div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="vs-tabs">
            <button className={`vs-tab${tab === "upcoming" ? " active" : ""}`} type="button" onClick={() => switchTab("upcoming")}>
              Upcoming &amp; Overdue <span className="vs-tab-count tc-up">{upcomingAll.length}</span>
            </button>
            <button className={`vs-tab${tab === "history" ? " active" : ""}`} type="button" onClick={() => switchTab("history")}>
              Visit History <span className="vs-tab-count tc-hist">{historyAll.length}</span>
            </button>
          </div>

          {/* Filter toolbar */}
          <div className="vs-toolbar">
            <div className="vs-search"><i className="ti ti-search"></i><input type="search" placeholder="Search subject, visit…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="vs-select" value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status">
              {tab === "upcoming" ? (
                <>
                  <option value="all">All statuses</option><option value="overdue">Overdue</option><option value="due_today">Due today</option><option value="due_week">Due this week</option><option value="upcoming">Upcoming</option>
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
            <span className="vs-count">{(tab === "upcoming" ? upcoming : history).length} {tab === "upcoming" ? "visits" : "completed"}</span>
          </div>

          {/* Tables */}
          <div className="vs-table-wrap">
            {tab === "upcoming" ? (
              upcoming.length === 0 ? (
                <div className="vs-empty">
                  <div className="vs-empty-icon ok"><i className="ti ti-calendar-check"></i></div>
                  <div className="vs-empty-title">{search || statusF !== "all" || siteF !== "all" ? "No visits match your filters" : "No upcoming or overdue visits"}</div>
                  {search || statusF !== "all" || siteF !== "all" ? <button className="vs-empty-link" type="button" onClick={resetFilters}>Reset filters</button> : <div className="vs-empty-sub">All scheduled visits are on track.</div>}
                </div>
              ) : (
                <table className="vs-table">
                  <thead><tr>
                    {th("Subject", "subject", 130)}<th style={{ width: 120 }}>Site</th><th>Visit</th>
                    {th("Target date", "target", 120)}<th style={{ width: 80 }}>Window</th>{th("Status", "status", 130)}
                    {th("Days", "days", 80)}<th style={{ width: 90 }}>Action</th>
                  </tr></thead>
                  <tbody>
                    {upcoming.map((r) => {
                      const s = upStatusOf(r, today); const meta = UP_META[s.key];
                      return (
                        <tr key={r.id}>
                          <td><span className="vs-subj" onClick={() => gotoRecord(r)} title="Open subject record">{r.subjectCode}</span></td>
                          <td><span className="vs-site">{r.siteName}</span></td>
                          <td><span className="vs-visit" title={r.visitName}>{r.visitName}</span></td>
                          <td><span className="vs-mono">{r.targetDate}</span></td>
                          <td><span className="vs-window">±{r.window} day{r.window === 1 ? "" : "s"}</span></td>
                          <td><span className={`vs-chip ${meta.cls}`}>{meta.label}</span></td>
                          <td><span className={`vs-mono${s.days < 0 ? " crit" : ""}`}>{fmtDays(s.days)}</span></td>
                          <td><button className="vs-act" type="button" onClick={() => gotoRecord(r)}>Open</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )
            ) : history.length === 0 ? (
              <div className="vs-empty">
                <div className="vs-empty-icon"><i className="ti ti-history"></i></div>
                <div className="vs-empty-title">{search || statusF !== "all" || siteF !== "all" ? "No visits match your filters" : "No completed visits yet"}</div>
                {(search || statusF !== "all" || siteF !== "all") && <button className="vs-empty-link" type="button" onClick={resetFilters}>Reset filters</button>}
              </div>
            ) : (
              <table className="vs-table">
                <thead><tr>
                  {th("Subject", "subject", 130)}<th style={{ width: 120 }}>Site</th><th>Visit</th>
                  {th("Target date", "target", 120)}{th("Completed", "completed", 120)}{th("Variance", "variance", 110)}{th("Status", "status", 140)}
                </tr></thead>
                <tbody>
                  {history.map((r) => {
                    const h = histStatusOf(r); const meta = HIST_META[h.key];
                    return (
                      <tr key={r.id} onClick={() => gotoRecord(r)} className="clickable">
                        <td><span className="vs-subj" onClick={(e) => { e.stopPropagation(); gotoRecord(r); }} title="Open subject record">{r.subjectCode}</span></td>
                        <td><span className="vs-site">{r.siteName}</span></td>
                        <td><span className="vs-visit" title={r.visitName}>{r.visitName}</span></td>
                        <td><span className="vs-mono">{r.targetDate}</span></td>
                        <td><span className="vs-mono">{r.recordedDate ?? "—"}</span></td>
                        <td><span className={`vs-mono${h.variance && Math.abs(h.variance) > r.window ? " warn" : ""}`}>{varianceLabel(h.variance)}</span></td>
                        <td><span className={`vs-chip ${meta.cls}`}>{meta.label}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
