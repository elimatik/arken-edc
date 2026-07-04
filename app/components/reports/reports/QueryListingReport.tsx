"use client";

// Query Listing (Fix 2) — the full query worklist as a filterable, sortable,
// exportable report. Blinding-safe: the query listing carries no arm column.
import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { queryListingRows, type QueryListingRow } from "@/lib/reports-data";
import { useTableSort, sortIcon } from "@/lib/useTableSort";

const STATUS_CHIP: Record<string, string> = { open: "ms-crit", responded: "ms-warn", resolved: "ms-done", closed: "ms-future" };
const STATUS_LABEL: Record<string, string> = { open: "Open", responded: "Responded", resolved: "Resolved", closed: "Closed" };
const ageTone = (d: number) => (d > 14 ? "cell-crit" : d >= 7 ? "cell-warn" : "cell-good");

export function QueryListingReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const rows = useMemo(() => queryListingRows(dataset, studyId), [dataset, studyId]);

  const [tab, setTab] = useState<"open" | "closed">("open");
  const [statusF, setStatusF] = useState("all");
  const [siteF, setSiteF] = useState("all");
  const [ageF, setAgeF] = useState("all");
  const [search, setSearch] = useState("");
  const { sort, toggle } = useTableSort(null);

  const siteOptions = useMemo(() => Array.from(new Map(rows.filter((r) => r.siteId).map((r) => [r.siteId!, r.siteName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const isClosed = (s: string) => s === "resolved" || s === "closed";

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = rows.filter((r) => {
      if (tab === "open" && isClosed(r.status)) return false;
      if (tab === "closed" && !isClosed(r.status)) return false;
      if (statusF !== "all" && r.status !== statusF) return false;
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (ageF === "lt7" && !(r.ageDays < 7)) return false;
      if (ageF === "7to14" && !(r.ageDays >= 7 && r.ageDays <= 14)) return false;
      if (ageF === "gt14" && !(r.ageDays > 14)) return false;
      if (q && ![r.code, r.subjectCode, r.fieldLabel, r.formName].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (!sort) return b.ageDays - a.ageDays;
      const dir = sort.dir === "asc" ? 1 : -1;
      switch (sort.col) {
        case "code": return a.code.localeCompare(b.code) * dir;
        case "subject": return a.subjectCode.localeCompare(b.subjectCode) * dir;
        case "age": return (a.ageDays - b.ageDays) * dir;
        case "raised": return (a.raisedDate ?? "").localeCompare(b.raisedDate ?? "") * dir;
        default: return 0;
      }
    });
  }, [rows, tab, statusF, siteF, ageF, search, sort]);

  const csvHeaders = ["Query ID", "Subject", "Site", "Form", "Field", "Status", "Age (days)", "Raised by", "Raised date", "Last response", "Assigned to (CRC)"];
  const csvRows = filtered.map((r: QueryListingRow) => [r.code, r.subjectCode, r.siteName, r.formName, r.fieldLabel, STATUS_LABEL[r.status] ?? r.status, r.ageDays, r.raisedBy, r.raisedDate ?? "—", r.lastResponseDate ?? "—", r.assignedCrc]);
  const siteLabel = siteF === "all" ? "All sites" : siteOptions.find(([id]) => id === siteF)?.[1] ?? "All sites";

  const th = (label: string, key?: string) => (
    <th className={key ? "rpt-sortable" : undefined} onClick={key ? () => toggle(key) : undefined}>
      {label}{key && <i className={`ti ${sortIcon(sort, key)} rpt-sort-icon`}></i>}
    </th>
  );

  return (
    <>
      <div className="rpt-note"><i className="ti ti-info-circle"></i> This report is a static snapshot for monitoring-visit documentation and regulatory submissions. For real-time query management, use the Queries module.</div>
      <Section title="Query summary" icon="list-details">
        <StatGrid>
          <StatTile value={rows.length} label="Total queries" />
          <StatTile value={rows.filter((r) => r.status === "open").length} label="Open" tone={rows.some((r) => r.status === "open") ? "crit" : "good"} />
          <StatTile value={rows.filter((r) => r.status === "responded").length} label="Responded" tone="warn" />
          <StatTile value={rows.filter((r) => r.status === "resolved" || r.status === "closed").length} label="Resolved / closed" tone="good" />
          <StatTile value={rows.filter((r) => r.ageDays > 14 && r.status !== "resolved" && r.status !== "closed").length} label="Overdue (>14d)" tone="crit" />
        </StatGrid>
      </Section>

      <Section title="Query listing" icon="table" action={<ReportCsvButton studyId={studyId} slug={tab === "open" ? "query_listing_open" : "query_listing_closed"} headers={csvHeaders} rows={csvRows} siteLabel={siteLabel} />}>
        <div className="rpt-tabs">
          <button className={`rpt-tab${tab === "open" ? " active" : ""}`} type="button" onClick={() => setTab("open")}>Open queries <span className="rpt-tab-count">{rows.filter((r) => !isClosed(r.status)).length}</span></button>
          <button className={`rpt-tab${tab === "closed" ? " active" : ""}`} type="button" onClick={() => setTab("closed")}>Closed queries <span className="rpt-tab-count">{rows.filter((r) => isClosed(r.status)).length}</span></button>
        </div>
        <div className="rpt-filters">
          <div className="rpt-search"><i className="ti ti-search"></i><input type="search" placeholder="Search subject, query, field…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <select className="rpt-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option><option value="open">Open</option><option value="responded">Responded</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>
          <select className="rpt-select" value={siteF} onChange={(e) => setSiteF(e.target.value)}>
            <option value="all">All sites</option>{siteOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="rpt-select" value={ageF} onChange={(e) => setAgeF(e.target.value)}>
            <option value="all">All ages</option><option value="lt7">&lt; 7 days</option><option value="7to14">7–14 days</option><option value="gt14">&gt; 14 days (overdue)</option>
          </select>
          <span className="rpt-filter-count">{filtered.length} {filtered.length === 1 ? "query" : "queries"}</span>
        </div>
        {filtered.length > 0 ? (
          <table className="rpt-table">
            <thead><tr>{th("Query ID", "code")}{th("Subject", "subject")}<th>Site</th><th>Form</th><th>Field</th><th>Status</th>{th("Age", "age")}<th>Raised by</th>{th("Raised", "raised")}<th>Last response</th><th>Assigned to</th></tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.queryId}>
                  <td className="mono">{r.code}</td>
                  <td className="mono">{r.subjectCode}</td>
                  <td>{r.siteName}</td>
                  <td>{r.formName}</td>
                  <td>{r.fieldLabel}</td>
                  <td><span className={`rpt-ms-chip ${STATUS_CHIP[r.status] ?? "ms-future"}`}>{STATUS_LABEL[r.status] ?? r.status}</span></td>
                  <td className={`mono ${r.status !== "resolved" && r.status !== "closed" ? ageTone(r.ageDays) : ""}`}>{r.ageDays}d</td>
                  <td>{r.raisedBy}</td>
                  <td className="mono">{fmtDate(r.raisedDate)}</td>
                  <td className="mono">{fmtDate(r.lastResponseDate)}</td>
                  <td>{r.assignedCrc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No queries match these filters.</EmptyNote>}
      </Section>
    </>
  );
}
