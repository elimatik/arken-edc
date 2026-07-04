"use client";

// AE / SAE Roster (Fix 4) — CIOMS clinical-depth columns, split into two tabs:
// Adverse Events (non-serious) and Serious Adverse Events. Each tab has its own
// CSV export with the study header block.
import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton, DrillCount, fmtDate } from "@/components/reports/ReportKit";
import { buildAeRoster, safetySummary, aeBySite, aeByArm, dartDistribution, brWithdrawalBlocks, type AeRow } from "@/lib/reports-data";

const SEV_CLS: Record<string, string> = { mild: "ms-done", moderate: "ms-active", severe: "ms-crit", "life-threatening": "ms-crit" };

// VeDDRA coded-term cell — the coded term, or "Uncoded" in amber when still pending.
function VeddraCell({ a }: { a: AeRow }) {
  if (a.veddraCoding === "coded") return <span>{a.veddraCode}</span>;
  if (a.veddraCoding === "excluded") return <span className="rpt-ms-chip ms-future">Excluded</span>;
  return <span className="rpt-ms-chip ms-warn">Uncoded</span>;
}

export function AeSaeSummaryReport({ studyId, aggregate, hideArms }: ReportProps) {
  const { dataset } = useStudySession();
  const [tab, setTab] = useState<"ae" | "sae">("ae");

  const d = useMemo(() => {
    const aes = buildAeRoster(dataset, studyId);
    const study = dataset.studies.find((s) => s.id === studyId);
    return {
      aes, nonSerious: aes.filter((a) => !a.serious), saes: aes.filter((a) => a.serious),
      summary: safetySummary(dataset, studyId, aes),
      bySite: aeBySite(aes), byArm: aeByArm(dataset, studyId, aes), isBr: study?.code === "BR-2502",
      dart: dartDistribution(dataset, studyId), withdrawals: brWithdrawalBlocks(dataset, studyId),
    };
  }, [dataset, studyId]);

  const s = d.summary;

  const aeCsvHeaders = ["Subject", "Site", "Visit", "Verbatim term", "VeDDRA coded term", "Onset date", "Severity", "Causality", "Action taken", "Outcome", "Expectedness", "Resolved"];
  const aeCsvRows = d.nonSerious.map((a) => [a.subjectCode, a.siteName, "—", a.description, a.veddraCoding === "coded" ? a.veddraCode : a.veddraCoding === "excluded" ? "Excluded" : "Uncoded", a.onsetDate ?? "—", a.severity, a.causality, a.actionTaken, a.outcome, a.expectedness, a.resolved ? "Yes" : "No"]);
  const saeCsvHeaders = [...aeCsvHeaders, "Serious criteria", "Sponsor notified", "SLA status", "Regulatory report"];
  const saeCsvRows = d.saes.map((a) => [a.subjectCode, a.siteName, "—", a.description, a.veddraCoding === "coded" ? a.veddraCode : "Uncoded", a.onsetDate ?? "—", a.severity, a.causality, a.actionTaken, a.outcome, a.expectedness, a.resolved ? "Yes" : "No", a.seriousCriteria.join("; "), a.sponsorNotifiedDate ?? "—", a.filedOnTime === "yes" ? "On time" : a.filedOnTime === "no" ? "Overdue" : "Pending", a.regulatoryReportDate ?? "—"]);

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

      {aggregate ? (
        <Section title="Adverse events by site" icon="alert-octagon">
          {d.aes.length > 0 ? (
            <>
              <p className="rpt-drill-hint">Click a site&apos;s AE count to reveal those events (subject IDs are omitted in the aggregate view).</p>
              <div className="rpt-drill-row">
                {d.bySite.map((r) => (
                  <DrillCount key={r.siteName}
                    count={<span>{r.siteName}: <strong>{r.aeCount}</strong> {r.aeCount === 1 ? "AE" : "AEs"}{r.saeCount > 0 && <> · <span className="cell-crit">{r.saeCount} SAE</span></>}</span>}
                    label={`AEs at ${r.siteName}`} studyId={studyId} slug="ae_by_site"
                    headers={["Subject", "Verbatim term", "Severity", "Causality", "Outcome"]}
                    rows={d.aes.filter((a) => a.siteName === r.siteName).map((a) => ["—", a.description, a.severity, a.causality, a.outcome])} />
                ))}
              </div>
            </>
          ) : <EmptyNote>No adverse events recorded for this study.</EmptyNote>}
        </Section>
      ) : (
        <Section title="AE / SAE roster" icon="clipboard-list"
          action={tab === "ae"
            ? <ReportCsvButton studyId={studyId} slug="ae_roster" headers={aeCsvHeaders} rows={aeCsvRows} />
            : <ReportCsvButton studyId={studyId} slug="sae_roster" headers={saeCsvHeaders} rows={saeCsvRows} />}>
          <div className="rpt-tabs">
            <button className={`rpt-tab${tab === "ae" ? " active" : ""}`} type="button" onClick={() => setTab("ae")}>Adverse Events (AE) <span className="rpt-tab-count">{d.nonSerious.length}</span></button>
            <button className={`rpt-tab${tab === "sae" ? " active" : ""}`} type="button" onClick={() => setTab("sae")}>Serious Adverse Events (SAE) <span className="rpt-tab-count tc-crit">{d.saes.length}</span></button>
          </div>

          {tab === "ae" ? (
            d.nonSerious.length > 0 ? (
              <table className="rpt-table">
                <thead><tr><th>Subject</th><th>Site</th><th>Visit</th><th>Verbatim term</th><th>VeDDRA coded term</th><th>Onset</th><th>Severity</th><th>Causality</th><th>Action taken</th><th>Outcome</th><th>Expectedness</th><th>Resolved</th></tr></thead>
                <tbody>
                  {d.nonSerious.map((a, i) => (
                    <tr key={i}>
                      <td className="mono">{a.subjectCode}</td><td>{a.siteName}</td><td>—</td><td>{a.description}</td>
                      <td className="rpt-vedra-cell"><VeddraCell a={a} /></td>
                      <td className="mono">{fmtDate(a.onsetDate)}</td>
                      <td><span className={`rpt-ms-chip ${SEV_CLS[a.severity.toLowerCase()] ?? "ms-future"}`}>{a.severity}</span></td>
                      <td>{a.causality}</td><td>{a.actionTaken}</td><td>{a.outcome}</td>
                      <td><span className={`rpt-ms-chip ${a.expectedness === "Unexpected" ? "ms-crit" : "ms-done"}`}>{a.expectedness}</span></td>
                      <td>{a.resolved ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyNote>No non-serious adverse events recorded for this study.</EmptyNote>
          ) : (
            d.saes.length > 0 ? (
              <>
                <div className="rpt-action-banner"><i className="ti ti-urgent"></i> {d.saes.length} serious {d.saes.length === 1 ? "event" : "events"} — expedited reporting may be required.</div>
                <table className="rpt-table">
                  <thead><tr><th>Subject</th><th>Site</th><th>Verbatim term</th><th>VeDDRA coded term</th><th>Onset</th><th>Severity</th><th>Causality</th><th>Action</th><th>Outcome</th><th>Expectedness</th><th>Serious criteria</th><th>Sponsor notified</th><th>SLA</th><th>Reg. report</th></tr></thead>
                  <tbody>
                    {d.saes.map((a, i) => (
                      <tr key={i} className="rpt-row-crit">
                        <td className="mono">{a.subjectCode}</td><td>{a.siteName}</td><td>{a.description}</td>
                        <td className="rpt-vedra-cell"><VeddraCell a={a} /></td>
                        <td className="mono">{fmtDate(a.onsetDate)}</td>
                        <td><span className={`rpt-ms-chip ${SEV_CLS[a.severity.toLowerCase()] ?? "ms-future"}`}>{a.severity}</span></td>
                        <td>{a.causality}</td><td>{a.actionTaken}</td><td>{a.outcome}</td>
                        <td><span className={`rpt-ms-chip ${a.expectedness === "Unexpected" ? "ms-crit" : "ms-done"}`}>{a.expectedness}</span></td>
                        <td><div className="rpt-crit-chips">{a.seriousCriteria.length ? a.seriousCriteria.map((c) => <span key={c} className="rpt-ms-chip ms-crit">{c}</span>) : "—"}</div></td>
                        <td className="mono">{a.sponsorNotifiedDate ? fmtDate(a.sponsorNotifiedDate) : "—"}</td>
                        <td>{a.filedOnTime === "yes" ? <span className="rpt-ms-chip ms-done">On time</span> : a.filedOnTime === "no" ? <span className="rpt-ms-chip ms-crit">Overdue</span> : <span className="rpt-ms-chip ms-warn">Pending</span>}</td>
                        <td className="mono">{fmtDate(a.regulatoryReportDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="rpt-footnote">SAE reporting timelines per ICH E6 R2 §5.17 and VICH GL42. Fatal / life-threatening SAEs: sponsor notification within 24 h, regulatory report within 7 calendar days. All other SAEs: 15 days. Expectedness is assessed against the Investigator&apos;s Brochure.</p>
              </>
            ) : <EmptyNote>No serious adverse events recorded for this study.</EmptyNote>
          )}
        </Section>
      )}

      {!hideArms && !aggregate && d.byArm.length > 0 && d.aes.length > 0 && (
        <Section title="AE rate by arm" icon="scale">
          <table className="rpt-table">
            <thead><tr><th>Arm</th><th>Enrolled</th><th>Subjects with AE</th><th>AEs</th><th>SAEs</th><th>AE rate</th></tr></thead>
            <tbody>
              {d.byArm.map((a) => (
                <tr key={a.arm}>
                  <td>{a.arm}</td><td className="mono">{a.enrolled}</td><td className="mono">{a.subjects}</td><td className="mono">{a.aeCount}</td>
                  <td className={`mono${a.saeCount > 0 ? " cell-crit" : ""}`}>{a.saeCount}</td>
                  <td className="mono">{a.rate == null ? "—" : `${(a.rate * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {d.isBr && !aggregate && (
        <Section title="DART severity distribution" icon="activity-heartbeat">
          {d.dart.some((r) => r.count > 0) ? (
            <table className="rpt-table rpt-table-narrow">
              <thead><tr><th>Worst DART score</th><th>Animals</th><th>%</th></tr></thead>
              <tbody>{d.dart.map((r) => <tr key={r.score}><td>DART {r.score}</td><td className="mono">{r.count}</td><td className="mono">{r.pct}%</td></tr>)}</tbody>
            </table>
          ) : <EmptyNote>No DART scores recorded.</EmptyNote>}
        </Section>
      )}
    </>
  );
}
