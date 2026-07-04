"use client";

// Drug Accountability (Fix 7) — investigational-product reconciliation surfaced
// from the same vial dataset the Inventory → Reconciliation tab uses. One row per
// treatment group per site; accountability % = (dispensed+returned+destroyed)/received.
import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton } from "@/components/reports/ReportKit";
import { drugAccountability } from "@/lib/reports-data";

export function DrugAccountabilityReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const rows = useMemo(() => drugAccountability(dataset, studyId), [dataset, studyId]);

  const overall = useMemo(() => {
    const rec = rows.reduce((n, r) => n + r.received, 0);
    const accounted = rows.reduce((n, r) => n + r.dispensed + r.returned + r.destroyed, 0);
    return rec ? Math.round((accounted / rec) * 100) : 0;
  }, [rows]);

  const csvHeaders = ["Treatment group", "Site", "Units received", "Units dispensed", "Units returned", "Units destroyed", "Units remaining", "Accountability %", "Status"];
  const csvRows = rows.map((r) => [r.group, r.siteName, r.received, r.dispensed, r.returned, r.destroyed, r.remaining, `${r.accountabilityPct}%`, r.status]);

  return (
    <>
      <Section title="Overall accountability" icon="clipboard-check">
        <StatGrid>
          <StatTile value={`${overall}%`} label="Study accountability" tone={overall >= 100 ? "good" : overall >= 90 ? "warn" : "crit"} />
          <StatTile value={rows.reduce((n, r) => n + r.received, 0)} label="Units received" />
          <StatTile value={rows.reduce((n, r) => n + r.dispensed, 0)} label="Dispensed" />
          <StatTile value={rows.reduce((n, r) => n + r.remaining, 0)} label="Remaining" tone={rows.some((r) => r.remaining > 0) ? "warn" : "good"} />
        </StatGrid>
      </Section>

      <Section title="Reconciliation by treatment group & site" icon="table" action={<ReportCsvButton studyId={studyId} slug="drug_accountability" headers={csvHeaders} rows={csvRows} />}>
        {rows.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>Treatment group</th><th>Site</th><th>Received</th><th>Dispensed</th><th>Returned</th><th>Destroyed</th><th>Remaining</th><th>Accountability %</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.group}|${r.siteId}`}>
                  <td>{r.group}</td>
                  <td>{r.siteName}</td>
                  <td className="mono">{r.received}</td>
                  <td className="mono">{r.dispensed}</td>
                  <td className="mono">{r.returned}</td>
                  <td className="mono">{r.destroyed}</td>
                  <td className={`mono${r.remaining > 0 ? " cell-warn" : ""}`}>{r.remaining}</td>
                  <td className={`mono${r.accountabilityPct >= 100 ? " cell-good" : " cell-warn"}`}>{r.accountabilityPct}%</td>
                  <td><span className={`rpt-ms-chip ${r.status === "Balanced" ? "ms-done" : "ms-warn"}`}>{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No investigational-product inventory recorded for this study.</EmptyNote>}
      </Section>
    </>
  );
}
