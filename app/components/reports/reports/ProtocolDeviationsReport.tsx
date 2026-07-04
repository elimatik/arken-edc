"use client";

// Protocol Deviations (Fix 3) — the PD listing derived from the seeded
// protocolDeviations table (the app's canonical PD source, also used by the Site
// Performance report). Auto-numbered PD-001…; major/minor category, status.
import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { protocolDeviationListing } from "@/lib/reports-data";

export function ProtocolDeviationsReport({ studyId, aggregate }: ReportProps) {
  const { dataset } = useStudySession();
  const rows = useMemo(() => protocolDeviationListing(dataset, studyId), [dataset, studyId]);

  const [siteF, setSiteF] = useState("all");
  const [catF, setCatF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const siteOptions = useMemo(() => Array.from(new Map(rows.filter((r) => r.siteId).map((r) => [r.siteId!, r.siteName])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (siteF !== "all" && r.siteId !== siteF) return false;
    if (catF !== "all" && r.category !== catF) return false;
    if (statusF !== "all" && r.status !== statusF) return false;
    return true;
  }), [rows, siteF, catF, statusF]);

  const summary = useMemo(() => ({
    total: rows.length,
    major: rows.filter((r) => r.category === "Major").length,
    minor: rows.filter((r) => r.category === "Minor").length,
    open: rows.filter((r) => r.status === "Open").length,
  }), [rows]);

  const csvHeaders = ["PD ID", "Subject", "Site", "Visit", "Category", "Description", "Date discovered", "Impact", "Corrective action", "Status"];
  const csvRows = filtered.map((r) => [r.pdId, aggregate ? "—" : r.subjectCode, r.siteName, r.visit, r.category, r.description, r.dateDiscovered ?? "—", r.impact, r.correctiveAction, r.status]);
  const siteLabel = siteF === "all" ? "All sites" : siteOptions.find(([id]) => id === siteF)?.[1] ?? "All sites";

  return (
    <>
      <Section title="Deviation summary" icon="alert-triangle">
        <StatGrid>
          <StatTile value={summary.total} label="Total PDs" />
          <StatTile value={summary.major} label="Major" tone={summary.major > 0 ? "crit" : "good"} />
          <StatTile value={summary.minor} label="Minor" tone={summary.minor > 0 ? "warn" : ""} />
          <StatTile value={summary.open} label="Open" tone={summary.open > 0 ? "warn" : "good"} />
        </StatGrid>
      </Section>

      <Section title="Protocol deviations" icon="table" action={<ReportCsvButton studyId={studyId} slug="protocol_deviations" headers={csvHeaders} rows={csvRows} siteLabel={siteLabel} />}>
        <div className="rpt-filters">
          <select className="rpt-select" value={siteF} onChange={(e) => setSiteF(e.target.value)}>
            <option value="all">All sites</option>{siteOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="rpt-select" value={catF} onChange={(e) => setCatF(e.target.value)}>
            <option value="all">All categories</option><option value="Major">Major</option><option value="Minor">Minor</option>
          </select>
          <select className="rpt-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option><option value="Open">Open</option><option value="Closed">Closed</option>
          </select>
          <span className="rpt-filter-count">{filtered.length} {filtered.length === 1 ? "deviation" : "deviations"}</span>
        </div>
        {filtered.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>PD ID</th>{!aggregate && <th>Subject</th>}<th>Site</th><th>Visit</th><th>Category</th><th>Description</th><th>Date discovered</th><th>Impact</th><th>Corrective action</th><th>Status</th></tr></thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expanded === r.pdId;
                return (
                  <tr key={r.pdId}>
                    <td className="mono">{r.pdId}</td>
                    {!aggregate && <td className="mono">{r.subjectCode}</td>}
                    <td>{r.siteName}</td>
                    <td>{r.visit}</td>
                    <td><span className={`rpt-ms-chip ${r.category === "Major" ? "ms-crit" : "ms-warn"}`}>{r.category}</span></td>
                    <td className="rpt-pd-desc" onClick={() => setExpanded(isOpen ? null : r.pdId)} title="Click to expand" style={{ cursor: "pointer", maxWidth: isOpen ? "none" : 220, whiteSpace: isOpen ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.description}</td>
                    <td className="mono">{fmtDate(r.dateDiscovered)}</td>
                    <td>{r.impact}</td>
                    <td>{r.correctiveAction}</td>
                    <td><span className={`rpt-ms-chip ${r.status === "Open" ? "ms-warn" : "ms-done"}`}>{r.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyNote>No protocol deviations recorded for this study.</EmptyNote>}
      </Section>
    </>
  );
}
