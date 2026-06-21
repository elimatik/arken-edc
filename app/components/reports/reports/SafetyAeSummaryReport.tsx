"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, fmtDate } from "@/components/reports/ReportKit";
import { adverseEvents, safetySummary, aeBySite, dartDistribution, brWithdrawalBlocks } from "@/lib/reports-data";

const SEV_CLS: Record<string, string> = { mild: "ms-done", moderate: "ms-active", severe: "ms-crit", "life-threatening": "ms-crit" };

export function SafetyAeSummaryReport({ studyId, aggregate }: ReportProps) {
  const { dataset } = useStudySession();

  const d = useMemo(() => {
    const aes = adverseEvents(dataset, studyId);
    const study = dataset.studies.find((s) => s.id === studyId);
    return {
      aes, summary: safetySummary(dataset, studyId, aes),
      bySite: aeBySite(aes), isBr: study?.code === "BR-2502",
      dart: dartDistribution(dataset, studyId), withdrawals: brWithdrawalBlocks(dataset, studyId),
    };
  }, [dataset, studyId]);

  const s = d.summary;

  return (
    <>
      <Section title="Safety summary" icon="heartbeat">
        <StatGrid>
          <StatTile value={s.aeCount} label="AEs reported" tone={s.aeCount > 0 ? "warn" : "good"} />
          <StatTile value={s.saeCount} label="SAEs" tone={s.saeCount > 0 ? "crit" : "good"} />
          <StatTile value={s.aeRate == null ? "—" : `${(s.aeRate * 100).toFixed(0)}%`} label="AE rate" sub={`${s.aeCount} ÷ ${s.enrolled} enrolled`} />
          <StatTile value={s.subjectsWithAe} label="Subjects with AE" />
          {d.isBr && <StatTile value={s.withdrawalBlocks} label="Withdrawal blocks active" tone={s.withdrawalBlocks > 0 ? "warn" : ""} />}
        </StatGrid>
      </Section>

      <Section title="Adverse events" icon="alert-octagon">
        {d.aes.length === 0 ? (
          <EmptyNote>No adverse events recorded for this study.</EmptyNote>
        ) : aggregate ? (
          <table className="rpt-table">
            <thead><tr><th>Site</th><th>AEs</th><th>SAEs</th></tr></thead>
            <tbody>{d.bySite.map((r) => <tr key={r.siteName}><td>{r.siteName}</td><td className="mono">{r.aeCount}</td><td className={`mono${r.saeCount > 0 ? " cell-crit" : ""}`}>{r.saeCount}</td></tr>)}</tbody>
          </table>
        ) : (
          <table className="rpt-table">
            <thead><tr><th>Subject</th><th>Site</th><th>AE description</th><th>Onset</th><th>Severity</th><th>Relatedness</th><th>Status</th><th>Outcome</th></tr></thead>
            <tbody>
              {d.aes.map((a, i) => (
                <tr key={i} className={a.serious ? "rpt-row-crit" : ""}>
                  <td className="mono">{a.subjectCode}</td>
                  <td>{a.siteName}</td>
                  <td>{a.description}{a.serious && <span className="rpt-sae-tag">SAE</span>}</td>
                  <td className="mono">{fmtDate(a.onsetDate)}</td>
                  <td><span className={`rpt-ms-chip ${SEV_CLS[a.severity.toLowerCase()] ?? "ms-future"}`}>{a.severity}</span></td>
                  <td>{a.relatedness}</td>
                  <td>{a.status}</td>
                  <td>{a.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {d.isBr && (
        <Section title="DART severity distribution" icon="activity-heartbeat">
          {d.dart.some((r) => r.count > 0) ? (
            <table className="rpt-table rpt-table-narrow">
              <thead><tr><th>Worst DART score</th><th>Animals</th><th>%</th></tr></thead>
              <tbody>{d.dart.map((r) => <tr key={r.score}><td>DART {r.score}</td><td className="mono">{r.count}</td><td className="mono">{r.pct}%</td></tr>)}</tbody>
            </table>
          ) : <EmptyNote>No DART scores recorded.</EmptyNote>}
        </Section>
      )}

      {d.isBr && (
        <Section title="Withdrawal period status" icon="hourglass">
          {d.withdrawals.length > 0 ? (
            <table className="rpt-table rpt-table-narrow">
              <thead><tr><th>Animal</th><th>Withdrawal ends</th><th>Days remaining</th></tr></thead>
              <tbody>{d.withdrawals.map((w) => <tr key={w.subjectCode}><td className="mono">{w.subjectCode}</td><td className="mono">{fmtDate(w.endDate)}</td><td className="mono cell-warn">{w.daysLeft}d</td></tr>)}</tbody>
            </table>
          ) : <EmptyNote>No active withdrawal-period blocks.</EmptyNote>}
        </Section>
      )}
    </>
  );
}
