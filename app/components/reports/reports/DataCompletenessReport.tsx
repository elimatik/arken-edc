"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatTile, StatGrid, BarList, EmptyNote, ExportCsvButton, type Tone } from "@/components/reports/ReportKit";
import { completenessByForm, missingDataDetail } from "@/lib/reports-data";
import { formProgress, formProgressBySite } from "@/lib/dashboard-data";

const pctTone = (p: number): Tone => (p < 50 ? "crit" : p < 70 ? "warn" : "good");

export function DataCompletenessReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();

  const d = useMemo(() => {
    const fp = formProgress(dataset, studyId);
    return {
      overallPct: fp.total ? Math.round((fp.completed / fp.total) * 100) : 0, fp,
      bySite: formProgressBySite(dataset, studyId),
      byForm: completenessByForm(dataset, studyId),
      missing: missingDataDetail(dataset, studyId),
    };
  }, [dataset, studyId]);

  const csvHeaders = ["Form", "Submitted", "Missing required", "Pending", "Locked"];
  const csvRows = d.byForm.map((f) => [f.formName, f.submitted, f.missingRequired, f.pending, f.locked]);

  return (
    <>
      <Section title="Overall completeness" icon="checklist">
        <StatGrid>
          <StatTile value={`${d.overallPct}%`} label="Forms complete" sub={`${d.fp.completed}/${d.fp.total}`} tone={pctTone(d.overallPct)} />
          <StatTile value={d.byForm.reduce((n, f) => n + f.missingRequired, 0)} label="Missing required fields" tone="warn" />
          <StatTile value={d.byForm.reduce((n, f) => n + f.pending, 0)} label="Pending forms" />
          <StatTile value={d.byForm.reduce((n, f) => n + f.locked, 0)} label="Locked forms" tone="blue" />
        </StatGrid>
      </Section>

      <Section title="Completeness by site" icon="chart-bar">
        {d.bySite.length > 0 ? (
          <BarList items={d.bySite.map((s) => ({ label: `${s.code} · ${s.name}`, pct: s.pct, note: `${s.completed}/${s.total}` }))} tone={pctTone} />
        ) : <EmptyNote>No site data.</EmptyNote>}
      </Section>

      <Section title="Completeness by form type" icon="forms" action={<ExportCsvButton studyCode={study.code} slug="data_completeness" headers={csvHeaders} rows={csvRows} />}>
        <table className="rpt-table">
          <thead><tr><th>Form</th><th>Submitted</th><th>Missing required</th><th>Pending</th><th>Locked</th></tr></thead>
          <tbody>
            {d.byForm.map((f) => (
              <tr key={f.formCode}>
                <td>{f.formName}</td>
                <td className="mono">{f.submitted}</td>
                <td className={`mono${f.missingRequired > 0 ? " cell-crit" : ""}`}>{f.missingRequired}</td>
                <td className={`mono${f.pending > 0 ? " cell-warn" : ""}`}>{f.pending}</td>
                <td className="mono">{f.locked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Missing data detail" icon="list-search">
        {d.missing.length > 0 ? (
          <>
            <div className="rpt-action-banner"><i className="ti ti-clipboard-x"></i> {d.missing.length} required {d.missing.length === 1 ? "field" : "fields"} empty on submitted forms — query or complete each.</div>
            <table className="rpt-table">
              <thead><tr><th>Subject</th><th>Site</th><th>Form</th><th>Field</th></tr></thead>
              <tbody>
                {d.missing.map((m, i) => (
                  <tr key={i}><td className="mono">{m.subjectCode}</td><td>{m.siteName}</td><td>{m.formName}</td><td>{m.fieldLabel}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <EmptyNote>No missing required fields on submitted forms.</EmptyNote>}
      </Section>
    </>
  );
}
