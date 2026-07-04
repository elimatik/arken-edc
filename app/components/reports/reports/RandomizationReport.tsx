"use client";

// Randomization (Fix 6) — the randomization list with an arm-balance check.
// CA-0801 (blinded): CRC/CRA see masked "Treatment A/B" labels; DM sees real arms.
import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { randomizationRows, randomizationBalance, studyHeader } from "@/lib/reports-data";

export function RandomizationReport({ studyId, hideArms, aggregate }: ReportProps) {
  const { dataset } = useStudySession();
  const rows = useMemo(() => randomizationRows(dataset, studyId), [dataset, studyId]);
  const lockDate = useMemo(() => studyHeader(dataset, studyId).lockDate, [dataset, studyId]);

  // Blinded roles see stable masked labels (Treatment A/B/…) instead of real arms.
  const armMap = useMemo(() => {
    const arms = Array.from(new Set(rows.map((r) => r.armCode))).sort();
    const m = new Map<string, string>();
    arms.forEach((a, i) => m.set(a, hideArms ? `Treatment ${String.fromCharCode(65 + i)}` : a));
    return m;
  }, [rows, hideArms]);
  const dispArm = (code: string) => armMap.get(code) ?? code;

  const balance = useMemo(() => randomizationBalance(rows), [rows]);

  const csvHeaders = ["Randomization #", "Subject", "Site", "Arm", "Randomization date", "Method", "Block", "Randomized by"];
  const csvRows = rows.map((r) => [r.seq, aggregate ? "—" : r.subjectCode, r.siteName, dispArm(r.armCode), r.randDate ?? "—", r.method, r.block, r.randomizedBy]);

  return (
    <>
      <Section title="Randomization summary" icon="arrows-shuffle">
        <StatGrid>
          <StatTile value={rows.length} label="Total randomized" />
          {balance.map((b) => (
            <StatTile key={b.arm} value={b.actual} label={dispArm(b.arm)} sub={`expected ${b.expected}`} tone={Math.abs(b.actual - b.expected) <= 1 ? "good" : "warn"} />
          ))}
        </StatGrid>
        <div style={{ marginTop: "var(--space-3)" }}>
          {lockDate
            ? <span className="rpt-ms-chip ms-done"><i className="ti ti-lock" style={{ fontSize: 12, marginRight: 3 }}></i> Randomization list locked · {fmtDate(lockDate)}</span>
            : <span className="rpt-ms-chip ms-warn"><i className="ti ti-lock-open" style={{ fontSize: 12, marginRight: 3 }}></i> Randomization list not yet locked</span>}
        </div>
      </Section>

      <Section title="Randomization list" icon="table" action={<ReportCsvButton studyId={studyId} slug="randomization" headers={csvHeaders} rows={csvRows} />}>
        {rows.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>#</th>{!aggregate && <th>Subject</th>}<th>Site</th><th>Arm</th><th>Randomization date</th><th>Method</th><th>Block</th><th>Randomized by</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subjectId}>
                  <td className="mono">{r.seq}</td>
                  {!aggregate && <td className="mono">{r.subjectCode}</td>}
                  <td>{r.siteName}</td>
                  <td><span className="rpt-ms-chip ms-future">{dispArm(r.armCode)}</span></td>
                  <td className="mono">{fmtDate(r.randDate)}</td>
                  <td>{r.method}</td>
                  <td className="mono">{r.block}</td>
                  <td>{r.randomizedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No subjects have been randomized for this study yet.</EmptyNote>}
      </Section>
    </>
  );
}
