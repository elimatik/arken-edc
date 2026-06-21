"use client";

import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, ProportionBar, EmptyNote, ExportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { visitComplianceRows, visitComplianceSummary, type VisitStatus, type VisitComplianceRow } from "@/lib/reports-data";

const STATUS_META: Record<VisitStatus, { label: string; cls: string }> = {
  "on-time": { label: "On time", cls: "ms-done" },
  outside: { label: "Outside window", cls: "ms-active" },
  overdue: { label: "Overdue", cls: "ms-crit" },
  pending: { label: "Pending", cls: "ms-future" },
};

export function VisitComplianceReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();
  const { sort, toggle } = useTableSort(null);
  const [filter, setFilter] = useState<"all" | VisitStatus>("all");

  const { rows, summary } = useMemo(() => {
    const rows = visitComplianceRows(dataset, studyId);
    return { rows, summary: visitComplianceSummary(rows) };
  }, [dataset, studyId]);

  const filtered = useMemo(() => {
    const arr = rows.filter((r) => filter === "all" || r.status === filter);
    const dir = sort?.dir === "asc" ? 1 : -1;
    if (sort) {
      const by: Record<string, (x: VisitComplianceRow) => string | number> = {
        subject: (x) => x.subjectCode, site: (x) => x.siteName, visit: (x) => x.visitName,
        target: (x) => x.targetDate, actual: (x) => x.actualDate ?? "", days: (x) => x.daysFromTarget ?? -9999,
      };
      const f = by[sort.col];
      if (f) return arr.sort((a, b) => { const va = f(a), vb = f(b); return (typeof va === "number" ? (va as number) - (vb as number) : String(va).localeCompare(String(vb))) * dir; });
    }
    // Default: worst (most overdue / most outside) first.
    return arr.sort((a, b) => Math.abs(b.daysFromTarget ?? 0) - Math.abs(a.daysFromTarget ?? 0));
  }, [rows, filter, sort]);

  const overdue = useMemo(() => rows.filter((r) => r.status === "overdue").sort((a, b) => (b.daysFromTarget ?? 0) - (a.daysFromTarget ?? 0)), [rows]);

  const csvHeaders = ["Subject", "Site", "Visit", "Target date", "Window (±d)", "Actual date", "Days from target", "Status"];
  const csvRows = rows.map((v) => [v.subjectCode, v.siteName, v.visitName, v.targetDate, v.window, v.actualDate, v.daysFromTarget, STATUS_META[v.status].label]);

  return (
    <>
      <Section title="Compliance summary" icon="calendar-stats">
        <StatGrid>
          <StatTile value={summary.onTime} label="On time" tone="good" />
          <StatTile value={summary.outside} label="Outside window" tone="blue" />
          <StatTile value={summary.overdue} label="Overdue" tone={summary.overdue > 0 ? "crit" : "good"} />
          <StatTile value={summary.total} label="Total scheduled" />
        </StatGrid>
      </Section>

      <Section title="Compliance proportion" icon="chart-pie">
        {summary.total > 0 ? (
          <ProportionBar total={summary.total} segments={[
            { label: "On time", count: summary.onTime, color: "var(--green-400)" },
            { label: "Outside window", count: summary.outside, color: "var(--blue-400)" },
            { label: "Overdue", count: summary.overdue, color: "var(--red-400)" },
            { label: "Pending", count: summary.total - summary.onTime - summary.outside - summary.overdue, color: "var(--slate-300)" },
          ]} />
        ) : <EmptyNote>No scheduled visits for this study.</EmptyNote>}
      </Section>

      <Section title="Visit compliance" icon="calendar-check" action={
        <div className="rpt-section-controls">
          <div className="rpt-seg">
            {(["all", "on-time", "outside", "overdue"] as const).map((k) => (
              <button key={k} type="button" className={`rpt-seg-btn${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{k === "all" ? "All" : STATUS_META[k].label}</button>
            ))}
          </div>
          <ExportCsvButton studyCode={study.code} slug="visit_compliance" headers={csvHeaders} rows={csvRows} />
        </div>
      }>
        {filtered.length > 0 ? (
          <table className="rpt-table">
            <thead><tr>
              <SortTh label="Subject" sortKey="subject" sort={sort} onSort={toggle} />
              <SortTh label="Site" sortKey="site" sort={sort} onSort={toggle} />
              <SortTh label="Visit" sortKey="visit" sort={sort} onSort={toggle} />
              <SortTh label="Target date" sortKey="target" sort={sort} onSort={toggle} />
              <th>Window</th>
              <SortTh label="Actual date" sortKey="actual" sort={sort} onSort={toggle} />
              <SortTh label="Days from target" sortKey="days" sort={sort} onSort={toggle} />
              <th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id}>
                  <td className="mono">{v.subjectCode}</td>
                  <td>{v.siteName}</td>
                  <td>{v.visitName}</td>
                  <td className="mono">{fmtDate(v.targetDate)}</td>
                  <td className="mono">±{v.window}d</td>
                  <td className="mono">{fmtDate(v.actualDate)}</td>
                  <td className={`mono${v.status === "overdue" ? " cell-crit" : v.status === "outside" ? " cell-warn" : ""}`}>{v.daysFromTarget == null ? "—" : v.daysFromTarget > 0 ? `+${v.daysFromTarget}` : v.daysFromTarget}</td>
                  <td><span className={`rpt-ms-chip ${STATUS_META[v.status].cls}`}>{STATUS_META[v.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No visits match this filter.</EmptyNote>}
      </Section>

      {overdue.length > 0 && (
        <Section title="Overdue visits — action required" icon="alert-triangle">
          <div className="rpt-action-banner"><i className="ti ti-phone"></i> Overdue {overdue.length} {overdue.length === 1 ? "visit" : "visits"} — contact the site coordinator to reschedule.</div>
          <table className="rpt-table">
            <thead><tr><th>Subject</th><th>Site</th><th>Visit</th><th>Target date</th><th>Days overdue</th></tr></thead>
            <tbody>
              {overdue.map((v) => (
                <tr key={v.id}><td className="mono">{v.subjectCode}</td><td>{v.siteName}</td><td>{v.visitName}</td><td className="mono">{fmtDate(v.targetDate)}</td><td className="mono cell-crit">{v.daysFromTarget}d</td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <p className="rpt-footnote">Visit windows per {study.code} protocol. A visit is overdue when today exceeds the target date + window end; a visit still within its window is not overdue even if past the target date.</p>
    </>
  );
}
