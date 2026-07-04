"use client";

// Drug Accountability (Fix 7) — investigational-product reconciliation surfaced
// from the same vial dataset the Inventory → Reconciliation tab uses. One row per
// treatment group per site; accountability % = (dispensed+returned+destroyed)/received.
import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton } from "@/components/reports/ReportKit";
import { drugAccountability, type DrugAccountabilityRow } from "@/lib/reports-data";

// Roll the per-(group,site) rows up by a single dimension for the two tab views.
function rollup(rows: DrugAccountabilityRow[], by: "group" | "site"): DrugAccountabilityRow[] {
  const m = new Map<string, DrugAccountabilityRow>();
  for (const r of rows) {
    const key = by === "group" ? r.group : r.siteName;
    let b = m.get(key);
    if (!b) { b = { group: by === "group" ? r.group : "All groups", siteName: by === "site" ? r.siteName : "All sites", siteId: r.siteId, received: 0, dispensed: 0, returned: 0, destroyed: 0, remaining: 0, accountabilityPct: 0, status: "Balanced" }; m.set(key, b); }
    b.received += r.received; b.dispensed += r.dispensed; b.returned += r.returned; b.destroyed += r.destroyed; b.remaining += r.remaining;
  }
  return Array.from(m.values()).map((b) => ({ ...b, accountabilityPct: b.received ? Math.round(((b.dispensed + b.returned + b.destroyed) / b.received) * 100) : 0, status: (b.remaining === 0 ? "Balanced" : "Outstanding") as "Balanced" | "Outstanding" }))
    .sort((a, b) => (by === "group" ? a.group.localeCompare(b.group) : a.siteName.localeCompare(b.siteName)));
}

export function DrugAccountabilityReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const base = useMemo(() => drugAccountability(dataset, studyId), [dataset, studyId]);
  const [tab, setTab] = useState<"group" | "site">("group");
  const rows = useMemo(() => rollup(base, tab), [base, tab]);

  const overall = useMemo(() => {
    const rec = base.reduce((n, r) => n + r.received, 0);
    const accounted = base.reduce((n, r) => n + r.dispensed + r.returned + r.destroyed, 0);
    return rec ? Math.round((accounted / rec) * 100) : 0;
  }, [base]);

  const csvHeaders = ["Treatment group", "Site", "Units received", "Units dispensed", "Units returned", "Units destroyed", "Units remaining", "Accountability %", "Status"];
  const csvRows = rows.map((r) => [r.group, r.siteName, r.received, r.dispensed, r.returned, r.destroyed, r.remaining, `${r.accountabilityPct}%`, r.status]);

  return (
    <>
      <Section title="Overall accountability" icon="clipboard-check">
        <StatGrid>
          <StatTile value={`${overall}%`} label="Study accountability" tone={overall >= 100 ? "good" : overall >= 90 ? "warn" : "crit"} />
          <StatTile value={base.reduce((n, r) => n + r.received, 0)} label="Units received" />
          <StatTile value={base.reduce((n, r) => n + r.dispensed, 0)} label="Dispensed" />
          <StatTile value={base.reduce((n, r) => n + r.remaining, 0)} label="Remaining" tone={base.some((r) => r.remaining > 0) ? "warn" : "good"} />
        </StatGrid>
      </Section>

      <Section title="Reconciliation" icon="table" action={<ReportCsvButton studyId={studyId} slug={tab === "group" ? "drug_accountability_by_group" : "drug_accountability_by_site"} headers={csvHeaders} rows={csvRows} />}>
        <div className="rpt-tabs">
          <button className={`rpt-tab${tab === "group" ? " active" : ""}`} type="button" onClick={() => setTab("group")}>By treatment group</button>
          <button className={`rpt-tab${tab === "site" ? " active" : ""}`} type="button" onClick={() => setTab("site")}>By site</button>
        </div>
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
