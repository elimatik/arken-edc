"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, BarList, EmptyNote, ExportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { querySummary, queriesByType, queryAging, resolutionBySite } from "@/lib/reports-data";

const STATUS_CHIP: Record<string, string> = { open: "ms-crit", responded: "ms-active", resolved: "ms-done" };

export function QueryEditCheckReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();

  const d = useMemo(() => ({
    summary: querySummary(dataset, studyId),
    byType: queriesByType(dataset, studyId),
    aging: queryAging(dataset, studyId),
    bySite: resolutionBySite(dataset, studyId),
  }), [dataset, studyId]);

  const maxType = Math.max(1, ...d.byType.map((t) => t.count));
  const csvHeaders = ["Query ID", "Subject", "Form", "Field", "Raised by", "Raised date", "Days open", "Status", "Assigned to"];
  const csvRows = d.aging.map((q) => [q.code, q.subjectCode, q.formName, q.fieldLabel, q.raisedBy, q.raisedDate, q.daysOpen, q.status, q.assignedTo]);

  return (
    <>
      <Section title="Query summary" icon="message-report">
        <StatGrid>
          <StatTile value={d.summary.total} label="Total raised" />
          <StatTile value={d.summary.open} label="Open" tone={d.summary.open > 0 ? "crit" : "good"} />
          <StatTile value={d.summary.responded} label="Responded" tone={d.summary.responded > 0 ? "warn" : ""} />
          <StatTile value={d.summary.resolved} label="Resolved" tone="good" />
          <StatTile value={`${d.summary.resolutionRate}%`} label="Resolution rate" tone={d.summary.resolutionRate >= 70 ? "good" : "warn"} />
        </StatGrid>
      </Section>

      <Section title="Queries by type" icon="chart-bar">
        {d.summary.total > 0 ? (
          <BarList items={d.byType.map((t) => ({ label: t.label, pct: Math.round((t.count / maxType) * 100), note: String(t.count) }))} />
        ) : <EmptyNote>No queries raised for this study.</EmptyNote>}
      </Section>

      <Section title="Query aging" icon="clock-hour-4" action={<ExportCsvButton studyCode={study.code} slug="query_edit_check" headers={csvHeaders} rows={csvRows} />}>
        {d.aging.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>Query ID</th><th>Subject</th><th>Form</th><th>Field</th><th>Raised by</th><th>Raised</th><th>Days open</th><th>Status</th><th>Assigned to</th></tr></thead>
            <tbody>
              {d.aging.map((q) => {
                const ageCls = q.status !== "resolved" && q.daysOpen > 30 ? " cell-crit" : q.status !== "resolved" && q.daysOpen > 14 ? " cell-warn" : "";
                return (
                  <tr key={q.code}>
                    <td className="mono">{q.code}</td>
                    <td className="mono">{q.subjectCode}</td>
                    <td>{q.formName}</td>
                    <td>{q.fieldLabel}</td>
                    <td>{q.raisedBy}</td>
                    <td className="mono">{fmtDate(q.raisedDate)}</td>
                    <td className={`mono${ageCls}`}>{q.daysOpen}d</td>
                    <td><span className={`rpt-ms-chip ${STATUS_CHIP[q.status] ?? "ms-future"}`}>{q.status}</span></td>
                    <td>{q.assignedTo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyNote>No queries raised for this study.</EmptyNote>}
      </Section>

      <Section title="Resolution rate by site" icon="building-hospital">
        {d.bySite.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>Site</th><th>Raised</th><th>Resolved</th><th>Open</th><th>Avg days to resolve</th></tr></thead>
            <tbody>
              {d.bySite.map((s) => (
                <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.raised}</td><td className="mono">{s.resolved}</td><td className={`mono${s.open > 0 ? " cell-warn" : ""}`}>{s.open}</td><td className="mono">{s.avgDays == null ? "—" : `${s.avgDays}d`}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No queries raised for this study.</EmptyNote>}
      </Section>
    </>
  );
}
