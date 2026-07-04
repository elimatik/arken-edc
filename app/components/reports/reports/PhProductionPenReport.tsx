"use client";

// PH-2401 Production Performance by Pen (Fix 9A) — per-pen FCR (phase + overall),
// final weight, feed consumed, and mortality. FCR color-coded green/amber/red.
import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, EmptyNote, ReportCsvButton } from "@/components/reports/ReportKit";
import { phPenProduction } from "@/lib/reports-data";

const fcrCls = (v: number | null) => (v == null ? "" : v <= 1.8 ? "cell-good" : v <= 2.0 ? "cell-warn" : "cell-crit");
const fcr = (v: number | null) => (v == null ? "—" : v.toFixed(2));

export function PhProductionPenReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const rows = useMemo(() => phPenProduction(dataset, studyId), [dataset, studyId]);

  const headers = ["Pen ID", "House", "Arm", "Starter FCR", "Grower FCR", "Finisher FCR", "Overall FCR", "Final avg weight (kg)", "Feed consumed (kg)", "Mortality count", "Mortality %"];
  const csv = rows.map((r) => [r.penCode, r.house, r.arm, fcr(r.starterFcr), fcr(r.growerFcr), fcr(r.finisherFcr), fcr(r.overallFcr), r.finalWeight ?? "—", r.feedConsumed ?? "—", r.mortalityCount, r.mortalityPct == null ? "—" : `${r.mortalityPct}%`]);

  return (
    <Section title="Production performance by pen" icon="chart-histogram" action={<ReportCsvButton studyId={studyId} slug="ph_production_pen" headers={headers} rows={csv} />}>
      {rows.length ? (
        <>
          <table className="rpt-table">
            <thead><tr><th>Pen</th><th>House</th><th>Arm</th><th>Starter FCR</th><th>Grower FCR</th><th>Finisher FCR</th><th>Overall FCR</th><th>Final wt (kg)</th><th>Feed (kg)</th><th>Mortality</th><th>Mortality %</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.penId}>
                  <td className="mono">{r.penCode}</td><td>{r.house}</td><td>{r.arm}</td>
                  <td className={`mono ${fcrCls(r.starterFcr)}`}>{fcr(r.starterFcr)}</td>
                  <td className={`mono ${fcrCls(r.growerFcr)}`}>{fcr(r.growerFcr)}</td>
                  <td className={`mono ${fcrCls(r.finisherFcr)}`}>{fcr(r.finisherFcr)}</td>
                  <td className={`mono ${fcrCls(r.overallFcr)}`}>{fcr(r.overallFcr)}</td>
                  <td className="mono">{r.finalWeight ?? "—"}</td><td className="mono">{r.feedConsumed ?? "—"}</td>
                  <td className="mono">{r.mortalityCount}</td><td className="mono">{r.mortalityPct == null ? "—" : `${r.mortalityPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rpt-footnote">FCR (feed conversion ratio) targets: green ≤ 1.80 · amber 1.81–2.00 · red &gt; 2.00. Lower is better.</p>
        </>
      ) : <EmptyNote>No pen production data recorded for this study.</EmptyNote>}
    </Section>
  );
}
