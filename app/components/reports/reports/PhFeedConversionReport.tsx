"use client";

// PH-2401 Feed Conversion Summary (Fix 9B) — the primary efficacy comparison,
// Control (T01) vs Phytogenic (T02), per production phase side by side.
import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ReportCsvButton } from "@/components/reports/ReportKit";
import { phPenProduction, type PhPenRow } from "@/lib/reports-data";

const ARM_LABEL: Record<string, string> = { T01: "T01 · Control", T02: "T02 · Phytogenic" };
const PHASES: { key: keyof PhPenRow; label: string }[] = [
  { key: "starterFcr", label: "Starter" }, { key: "growerFcr", label: "Grower" }, { key: "finisherFcr", label: "Finisher" }, { key: "overallFcr", label: "Overall" },
];
const mean = (ns: number[]) => (ns.length ? Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 100) / 100 : null);
const fcrCls = (v: number | null) => (v == null ? "" : v <= 1.8 ? "cell-good" : v <= 2.0 ? "cell-warn" : "cell-crit");

export function PhFeedConversionReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const rows = useMemo(() => phPenProduction(dataset, studyId), [dataset, studyId]);
  const arms = useMemo(() => Array.from(new Set(rows.map((r) => r.arm))).sort(), [rows]);

  const armFcr = (arm: string, key: keyof PhPenRow) => mean(rows.filter((r) => r.arm === arm).map((r) => r[key] as number | null).filter((n): n is number => n != null && Number.isFinite(n)));
  const armFeed = (arm: string) => rows.filter((r) => r.arm === arm).reduce((s, r) => s + (r.feedConsumed ?? 0), 0);
  const armWeight = (arm: string) => mean(rows.filter((r) => r.arm === arm).map((r) => r.finalWeight).filter((n): n is number => n != null));

  const headers = ["Phase", ...arms.map((a) => `${ARM_LABEL[a] ?? a} avg FCR`)];
  const csv = PHASES.map((p) => [p.label, ...arms.map((a) => armFcr(a, p.key) ?? "—")]);
  csv.push(["Total feed consumed (kg)", ...arms.map((a) => Math.round(armFeed(a)))]);
  csv.push(["Avg final weight (kg)", ...arms.map((a) => armWeight(a) ?? "—")]);

  if (!rows.length) return <Section title="Feed conversion summary" icon="scale"><EmptyNote>No pen production data recorded for this study.</EmptyNote></Section>;

  return (
    <>
      <Section title="Overall efficacy comparison" icon="scale">
        <StatGrid>
          {arms.map((a) => <StatTile key={a} value={armFcr(a, "overallFcr") ?? "—"} label={`${ARM_LABEL[a] ?? a} — overall FCR`} tone={(armFcr(a, "overallFcr") ?? 9) <= 1.8 ? "good" : (armFcr(a, "overallFcr") ?? 9) <= 2.0 ? "warn" : "crit"} />)}
        </StatGrid>
      </Section>

      <Section title="Feed conversion by phase — Control vs Phytogenic" icon="chart-bar" action={<ReportCsvButton studyId={studyId} slug="ph_feed_conversion" headers={headers} rows={csv} />}>
        <table className="rpt-table">
          <thead><tr><th>Production phase</th>{arms.map((a) => <th key={a}>{ARM_LABEL[a] ?? a} — avg FCR</th>)}</tr></thead>
          <tbody>
            {PHASES.map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                {arms.map((a) => { const v = armFcr(a, p.key); return <td key={a} className={`mono ${fcrCls(v)}`}>{v == null ? "—" : v.toFixed(2)}</td>; })}
              </tr>
            ))}
            <tr><td><strong>Total feed consumed (kg)</strong></td>{arms.map((a) => <td key={a} className="mono">{Math.round(armFeed(a)).toLocaleString()}</td>)}</tr>
            <tr><td><strong>Avg final weight (kg)</strong></td>{arms.map((a) => <td key={a} className="mono">{armWeight(a) ?? "—"}</td>)}</tr>
          </tbody>
        </table>
        <p className="rpt-footnote">Primary efficacy endpoint: overall feed conversion ratio, Phytogenic (T02) vs Control (T01). Lower FCR = better feed efficiency. Targets: green ≤ 1.80 · amber 1.81–2.00 · red &gt; 2.00.</p>
      </Section>
    </>
  );
}
