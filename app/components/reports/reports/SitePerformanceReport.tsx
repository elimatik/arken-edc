"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, BarList, EmptyNote, ExportCsvButton, fmtDate, type Tone } from "@/components/reports/ReportKit";
import { sitePerformance, monitoringLog } from "@/lib/reports-data";

const pctTone = (p: number): Tone => (p < 50 ? "crit" : p < 70 ? "warn" : "good");

export function SitePerformanceReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();

  const { rows, mon } = useMemo(() => ({
    rows: sitePerformance(dataset, studyId),
    mon: monitoringLog(dataset, studyId),
  }), [dataset, studyId]);

  const csvHeaders = ["Site", "Enrolled", "Target", "Form completion %", "SDV %", "Open queries", "Overdue visits", "Last data entry", "Last monitoring"];
  const csvRows = rows.map((s) => [`${s.code} · ${s.name}`, s.enrolled, s.target, s.formPct, s.sdvPct, s.openQueries, s.overdueVisits, s.lastDataEntry, s.lastMonitoring]);

  return (
    <>
      <Section title="Per-site summary" icon="building-hospital" action={<ExportCsvButton studyCode={study.code} slug="site_performance" headers={csvHeaders} rows={csvRows} />}>
        <table className="rpt-table">
          <thead><tr>
            <th>Site</th><th>Enrolled / target</th><th>Form completion</th><th>SDV</th><th>Open queries</th><th>Overdue visits</th><th>Last data entry</th><th>Last monitoring</th>
          </tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.siteId}>
                <td>{s.code} · {s.name}</td>
                <td className="mono">{s.enrolled}{s.target != null ? ` / ${s.target}` : ""}</td>
                <td className={`mono cell-${pctTone(s.formPct)}`}>{s.formPct}%</td>
                <td className={`mono cell-${pctTone(s.sdvPct)}`}>{s.sdvPct}%</td>
                <td className={`mono${s.openQueries > 5 ? " cell-warn" : ""}`}>{s.openQueries}</td>
                <td className={`mono${s.overdueVisits > 2 ? " cell-crit" : ""}`}>{s.overdueVisits}</td>
                <td className="mono">{fmtDate(s.lastDataEntry)}</td>
                <td className="mono">{fmtDate(s.lastMonitoring)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Enrollment by site" icon="chart-bar">
        <BarList items={rows.map((s) => ({ label: `${s.code} · ${s.name}`, pct: s.target ? Math.round((s.enrolled / s.target) * 100) : 0, note: `${s.enrolled}${s.target != null ? `/${s.target}` : ""}` }))} tone={pctTone} />
      </Section>
      <Section title="Form completion by site" icon="chart-bar">
        <BarList items={rows.map((s) => ({ label: `${s.code} · ${s.name}`, pct: s.formPct }))} tone={pctTone} />
      </Section>
      <Section title="SDV by site" icon="chart-bar">
        <BarList items={rows.map((s) => ({ label: `${s.code} · ${s.name}`, pct: s.sdvPct }))} tone={pctTone} />
      </Section>

      <Section title="Monitoring visit log" icon="clipboard-check">
        {mon.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>Site</th><th>Visit type</th><th>Date</th><th>Conducted by</th><th>Findings summary</th></tr></thead>
            <tbody>
              {mon.map((m, i) => (
                <tr key={i}><td>{m.siteCode} · {m.siteName}</td><td>{m.visitType}</td><td className="mono">{fmtDate(m.date)}</td><td>{m.conductedBy}</td><td className="rpt-cell-wrap">{m.findings}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No site-initiation or monitoring visits recorded yet.</EmptyNote>}
      </Section>
    </>
  );
}
