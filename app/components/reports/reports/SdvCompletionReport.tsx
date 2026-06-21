"use client";

import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, BarList, EmptyNote, ExportCsvButton, fmtDate, type Tone } from "@/components/reports/ReportKit";
import { sdvProgress, sdvProgressBySite } from "@/lib/dashboard-data";
import { buildSdvWorklist, getFormSdvFields, type FormSdvStatus } from "@/lib/sdv-data";

const pctTone = (p: number): Tone => (p < 50 ? "warn" : p < 80 ? "blue" : "good");
const STATUS_META: Record<FormSdvStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "ms-future" },
  partial: { label: "In progress", cls: "ms-active" },
  complete: { label: "Complete", cls: "ms-done" },
  queried: { label: "Queried", cls: "ms-crit" },
};

export function SdvCompletionReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study, activeRole } = useShell();
  const [filter, setFilter] = useState<"all" | FormSdvStatus>("all");
  const canSeeUnverified = activeRole === "DM" || activeRole === "Admin";

  const d = useMemo(() => {
    const sdv = sdvProgress(dataset, studyId);
    const worklist = buildSdvWorklist(dataset, studyId);
    const unverified: { subjectCode: string; formName: string; fieldName: string; enteredBy: string }[] = [];
    if (canSeeUnverified) {
      for (const w of worklist) {
        if (w.sdvStatus === "complete") continue;
        for (const f of getFormSdvFields(dataset, w.formInstanceId)) {
          if (f.sdvStatus !== "unverified") continue;
          unverified.push({ subjectCode: w.subjectCode, formName: w.formName, fieldName: f.fieldName, enteredBy: f.enteredBy });
          if (unverified.length >= 200) break;
        }
        if (unverified.length >= 200) break;
      }
    }
    return {
      sdv, worklist, unverified,
      pct: sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0,
      bySite: sdvProgressBySite(dataset, studyId),
      complete: worklist.filter((w) => w.sdvStatus === "complete").length,
      partial: worklist.filter((w) => w.sdvStatus === "partial" || w.sdvStatus === "queried").length,
      pending: worklist.filter((w) => w.sdvStatus === "pending").length,
    };
  }, [dataset, studyId, canSeeUnverified]);

  const filtered = useMemo(() => d.worklist.filter((w) => filter === "all" || w.sdvStatus === filter), [d.worklist, filter]);

  const csvHeaders = ["Subject", "Site", "Form", "SDV status", "Verified", "Total", "Open queries"];
  const csvRows = d.worklist.map((w) => [w.subjectCode, w.siteLabel, w.formName, STATUS_META[w.sdvStatus].label, w.verifiedFields, w.totalRequiredFields, w.openQueries]);

  return (
    <>
      <Section title="SDV summary" icon="shield-check">
        <StatGrid>
          <StatTile value={`${d.sdv.verified}/${d.sdv.total}`} label="Fields verified" sub={`${d.pct}%`} tone={pctTone(d.pct)} />
          <StatTile value={d.complete} label="Forms complete" tone="good" />
          <StatTile value={d.partial} label="Forms in progress" tone="blue" />
          <StatTile value={d.pending} label="Forms pending" tone={d.pending > 0 ? "warn" : ""} />
        </StatGrid>
      </Section>

      <Section title="SDV progress by site" icon="chart-bar">
        {d.bySite.length > 0 ? (
          <BarList items={d.bySite.map((s) => ({ label: `${s.code} · ${s.name}`, pct: s.pct, note: `${s.completed}/${s.total}` }))} tone={pctTone} />
        ) : <EmptyNote>No SDV-eligible data for this study.</EmptyNote>}
      </Section>

      <Section title="SDV completion" icon="list-check" action={
        <div className="rpt-section-controls">
          <div className="rpt-seg">
            {(["all", "pending", "partial", "complete", "queried"] as const).map((k) => (
              <button key={k} type="button" className={`rpt-seg-btn${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{k === "all" ? "All" : STATUS_META[k].label}</button>
            ))}
          </div>
          <ExportCsvButton studyCode={study.code} slug="sdv_completion" headers={csvHeaders} rows={csvRows} />
        </div>
      }>
        {filtered.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>Subject</th><th>Site</th><th>Form</th><th>SDV status</th><th>Verified by</th><th>Verified date</th><th>Open queries</th></tr></thead>
            <tbody>
              {filtered.map((w) => {
                const f = getFormSdvFields(dataset, w.formInstanceId).find((x) => x.sdvStatus === "verified");
                return (
                  <tr key={w.formInstanceId}>
                    <td className="mono">{w.subjectCode}</td>
                    <td>{w.siteLabel}</td>
                    <td>{w.formName}</td>
                    <td><span className={`rpt-ms-chip ${STATUS_META[w.sdvStatus].cls}`}>{STATUS_META[w.sdvStatus].label}</span></td>
                    <td>{f?.enteredBy && f.enteredBy !== "—" ? f.enteredBy : "—"}</td>
                    <td className="mono">{fmtDate(w.lastUpdated)}</td>
                    <td>{w.openQueries > 0 ? <span className="rpt-flag"><i className="ti ti-flag-filled"></i> {w.openQueries}</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyNote>No forms match this filter.</EmptyNote>}
      </Section>

      {canSeeUnverified && (
        <Section title="Unverified fields — CRA action list" icon="shield-x">
          {d.unverified.length > 0 ? (
            <table className="rpt-table">
              <thead><tr><th>Subject</th><th>Form</th><th>Field</th><th>Entered by</th></tr></thead>
              <tbody>
                {d.unverified.map((u, i) => (
                  <tr key={i}><td className="mono">{u.subjectCode}</td><td>{u.formName}</td><td>{u.fieldName}</td><td>{u.enteredBy}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyNote>All SDV-eligible fields have been verified.</EmptyNote>}
        </Section>
      )}
    </>
  );
}
