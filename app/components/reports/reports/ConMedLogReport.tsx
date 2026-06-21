"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ExportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { buildConMedLog, conMedByClass, conMedSummary, type ConMedEntry } from "@/lib/reports-data";

// ConMed is subject-level medication data — no treatment-arm column, so blinding
// (hideArms) has nothing to neutralise here.
export function ConMedLogReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();
  const { sort, toggle } = useTableSort(null);

  const d = useMemo(() => {
    const entries = buildConMedLog(dataset, studyId);
    return { entries, byClass: conMedByClass(entries), summary: conMedSummary(entries) };
  }, [dataset, studyId]);

  const sorted = useMemo(() => {
    const arr = d.entries.slice();
    if (!sort) return arr;
    const dir = sort.dir === "asc" ? 1 : -1;
    const by: Record<string, (x: ConMedEntry) => string> = {
      subject: (x) => x.subjectCode, class: (x) => x.drugClass, start: (x) => x.startDate, med: (x) => x.medication,
    };
    const f = by[sort.col];
    return f ? arr.sort((a, b) => f(a).localeCompare(f(b)) * dir) : arr;
  }, [d.entries, sort]);

  const csvHeaders = ["Subject", "Site", "Medication", "Drug class", "Dose", "Route", "Start date", "End date", "Indication", "Concurrent with", "Interaction"];
  const csvRows = d.entries.map((e) => [e.subjectCode, `${e.siteCode} · ${e.siteName}`, e.medication, e.drugClass, e.dose, e.route, e.startDate, e.ongoing ? "Ongoing" : e.endDate, e.indication, e.concurrentWith, e.interaction ? "Yes" : "No"]);

  if (d.entries.length === 0) {
    return (
      <Section title="Concomitant medications" icon="pill">
        <EmptyNote>No concomitant medications recorded for this study.</EmptyNote>
      </Section>
    );
  }

  return (
    <>
      <Section title="ConMed summary" icon="pill">
        <StatGrid>
          <StatTile value={d.summary.total} label="ConMed entries" />
          <StatTile value={d.summary.subjectsWithConMed} label="Subjects with ≥1 ConMed" />
          <StatTile value={d.summary.topClass} label="Most common drug class" />
          <StatTile value={d.summary.interactionCount} label="Interaction-flagged" tone={d.summary.interactionCount > 0 ? "warn" : ""} />
        </StatGrid>
      </Section>

      <Section title="Concomitant medication log" icon="list-details" action={<ExportCsvButton studyCode={study.code} slug="conmed_log" headers={csvHeaders} rows={csvRows} />}>
        <table className="rpt-table">
          <thead><tr>
            <SortTh label="Subject" sortKey="subject" sort={sort} onSort={toggle} />
            <th>Site</th>
            <SortTh label="Medication" sortKey="med" sort={sort} onSort={toggle} />
            <SortTh label="Drug class" sortKey="class" sort={sort} onSort={toggle} />
            <th>Dose</th><th>Route</th>
            <SortTh label="Start" sortKey="start" sort={sort} onSort={toggle} />
            <th>End</th><th>Indication</th><th>Concurrent with</th>
          </tr></thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className={e.interaction ? "rpt-row-warn" : ""}>
                <td className="mono">{e.subjectCode}</td>
                <td>{e.siteCode} · {e.siteName}</td>
                <td>{e.medication}{e.interaction && <span className="rpt-interaction-flag" title="Overlaps a known interaction class"><i className="ti ti-alert-triangle-filled"></i></span>}</td>
                <td>{e.drugClass}</td>
                <td className="mono">{e.dose}</td>
                <td>{e.route}</td>
                <td className="mono">{fmtDate(e.startDate)}</td>
                <td className="mono">{e.ongoing ? <span className="rpt-ms-chip ms-active">Ongoing</span> : fmtDate(e.endDate)}</td>
                <td className="rpt-cell-wrap">{e.indication}</td>
                <td>{e.concurrentWith}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="ConMed by drug class" icon="chart-bar">
        <table className="rpt-table rpt-table-narrow">
          <thead><tr><th>Drug class</th><th>Entries</th><th>Subjects affected</th></tr></thead>
          <tbody>
            {d.byClass.map((c) => (
              <tr key={c.drugClass} className={c.interaction ? "rpt-row-warn" : ""}>
                <td>{c.drugClass}{c.interaction && <span className="rpt-interaction-flag"><i className="ti ti-alert-triangle-filled"></i></span>}</td>
                <td className="mono">{c.count}</td>
                <td className="mono">{c.subjects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
