"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, fmtDate } from "@/components/reports/ReportKit";
import { buildAeRoster, safetySummary, aeBySite, aeByArm, dartDistribution, brWithdrawalBlocks, type AeRow } from "@/lib/reports-data";

const SEV_CLS: Record<string, string> = { mild: "ms-done", moderate: "ms-active", severe: "ms-crit", "life-threatening": "ms-crit" };
const FILED_META: Record<string, { label: string; cls: string }> = {
  yes: { label: "Yes", cls: "ms-done" }, no: { label: "No", cls: "ms-crit" }, pending: { label: "Pending", cls: "ms-active" },
};

function AeTable({ rows }: { rows: AeRow[] }) {
  return (
    <table className="rpt-table">
      <thead><tr>
        <th>Subject</th><th>Site</th><th>AE description</th><th>Onset</th><th>Severity</th>
        <th>Relatedness</th><th>Status</th><th>Outcome</th>
      </tr></thead>
      <tbody>
        {rows.map((a, i) => (
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
  );
}

// SAE sub-table with the GCP/VICH reporting timeline.
function SaeTimelineTable({ rows }: { rows: AeRow[] }) {
  return (
    <table className="rpt-table">
      <thead><tr>
        <th>Subject</th><th>Site</th><th>AE description</th><th>SAE date</th><th>Severity</th>
        <th>Relatedness</th><th>SAE criterion</th><th>PI aware</th><th>Sponsor notified</th>
        <th>Days to notify</th><th>Report due</th><th>Filed on time</th>
      </tr></thead>
      <tbody>
        {rows.map((a, i) => {
          const filed = a.filedOnTime ? FILED_META[a.filedOnTime] : null;
          return (
            <tr key={i} className="rpt-row-crit">
              <td className="mono">{a.subjectCode}</td>
              <td>{a.siteName}</td>
              <td>{a.description}</td>
              <td className="mono">{fmtDate(a.onsetDate)}</td>
              <td><span className={`rpt-ms-chip ${SEV_CLS[a.severity.toLowerCase()] ?? "ms-future"}`}>{a.severity}</span></td>
              <td>{a.relatedness}</td>
              <td>{a.saeCriterion ?? "—"}</td>
              <td className="mono">{fmtDate(a.piAwareDate)}</td>
              <td className="mono">{a.sponsorNotifiedDate ? fmtDate(a.sponsorNotifiedDate) : <span className="rpt-ms-chip ms-active">Pending</span>}</td>
              <td className={`mono${a.daysToNotify == null ? "" : a.daysToNotify <= 1 ? " cell-good" : " cell-crit"}`}>{a.daysToNotify == null ? "—" : `${a.daysToNotify}d`}</td>
              <td className="mono">{fmtDate(a.reportDueDate)}</td>
              <td>{filed ? <span className={`rpt-ms-chip ${filed.cls}`}>{filed.label}</span> : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function AeSaeSummaryReport({ studyId, aggregate, hideArms }: ReportProps) {
  const { dataset } = useStudySession();

  const d = useMemo(() => {
    const aes = buildAeRoster(dataset, studyId);
    const study = dataset.studies.find((s) => s.id === studyId);
    return {
      aes, saes: aes.filter((a) => a.serious),
      summary: safetySummary(dataset, studyId, aes),
      bySite: aeBySite(aes), byArm: aeByArm(dataset, studyId, aes), isBr: study?.code === "BR-2502",
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

      {/* SAEs first — immediately visible without scrolling. Skipped in the Sponsor
          aggregate view (no subject IDs). */}
      {!aggregate && (
        <Section title="Serious adverse events (SAE)" icon="alert-triangle">
          {d.saes.length > 0 ? (
            <>
              <div className="rpt-action-banner"><i className="ti ti-urgent"></i> {d.saes.length} serious {d.saes.length === 1 ? "event" : "events"} — expedited reporting may be required.</div>
              <SaeTimelineTable rows={d.saes} />
              <p className="rpt-footnote">SAE reporting timelines per ICH E6 R2 §5.17 and VICH GL42. Fatal or life-threatening SAEs: sponsor notification within 24 h, regulatory report within 7 calendar days. All other SAEs: 15 days.</p>
            </>
          ) : <EmptyNote>No serious adverse events recorded for this study.</EmptyNote>}
        </Section>
      )}

      <Section title="Adverse events" icon="alert-octagon">
        {d.aes.length === 0 ? (
          <EmptyNote>No adverse events recorded for this study.</EmptyNote>
        ) : aggregate ? (
          <table className="rpt-table">
            <thead><tr><th>Site</th><th>AEs</th><th>SAEs</th></tr></thead>
            <tbody>{d.bySite.map((r) => <tr key={r.siteName}><td>{r.siteName}</td><td className="mono">{r.aeCount}</td><td className={`mono${r.saeCount > 0 ? " cell-crit" : ""}`}>{r.saeCount}</td></tr>)}</tbody>
          </table>
        ) : (
          <AeTable rows={d.aes} />
        )}
      </Section>

      {!hideArms && d.byArm.length > 0 && d.aes.length > 0 && (
        <Section title="AE rate by arm" icon="scale">
          <table className="rpt-table">
            <thead><tr><th>Arm</th><th>Enrolled</th><th>Subjects with AE</th><th>AEs</th><th>SAEs</th><th>AE rate</th></tr></thead>
            <tbody>
              {d.byArm.map((a) => (
                <tr key={a.arm}>
                  <td>{a.arm}</td>
                  <td className="mono">{a.enrolled}</td>
                  <td className="mono">{a.subjects}</td>
                  <td className="mono">{a.aeCount}</td>
                  <td className={`mono${a.saeCount > 0 ? " cell-crit" : ""}`}>{a.saeCount}</td>
                  <td className="mono">{a.rate == null ? "—" : `${(a.rate * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

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
