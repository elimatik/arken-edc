"use client";

// Subject Data Listing (Fix 5) — one row per subject, study-specific primary
// endpoint columns. CA-0801 is blinding-aware (masked "Treatment A/B" for CRC/CRA).
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, EmptyNote, ReportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import { brSubjectDataRows, caSubjectDataRows, phPenProduction } from "@/lib/reports-data";

export function SubjectDataListingReport({ studyId, hideArms, aggregate }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();
  const code = study.code;

  const armMask = (rows: { armCode?: string; arm?: string }[]) => {
    const arms = Array.from(new Set(rows.map((r) => r.armCode ?? r.arm ?? "—"))).sort();
    const m = new Map<string, string>();
    arms.forEach((a, i) => m.set(a, hideArms ? `Treatment ${String.fromCharCode(65 + i)}` : a));
    return (a: string) => m.get(a) ?? a;
  };

  if (code === "BR-2502") {
    const rows = brSubjectDataRows(dataset, studyId);
    const headers = ["Subject ID", "Arm", "Site", "Baseline DART", "Day 3", "Day 7", "Day 14", "Day 28", "Clinical cure", "Withdrawal date"];
    const csv = rows.map((r) => [aggregate ? "—" : r.subjectCode, r.arm, r.siteName, r.dart[0], r.dart[3], r.dart[7], r.dart[14], r.dart[28], r.cure, r.withdrawalDate ?? "—"]);
    return (
      <Section title="Subject data listing — DART by visit" icon="table-options" action={<ReportCsvButton studyId={studyId} slug="subject_data_listing" headers={headers} rows={csv} />}>
        {rows.length ? (
          <table className="rpt-table">
            <thead><tr><th>Subject</th><th>Arm</th><th>Site</th><th>Baseline</th><th>Day 3</th><th>Day 7</th><th>Day 14</th><th>Day 28</th><th>Clinical cure</th><th>Withdrawal</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subjectId}>
                  <td className="mono">{r.subjectCode}</td><td>{r.arm}</td><td>{r.siteName}</td>
                  <td className="mono">{r.dart[0]}</td><td className="mono">{r.dart[3]}</td><td className="mono">{r.dart[7]}</td><td className="mono">{r.dart[14]}</td><td className="mono">{r.dart[28]}</td>
                  <td><span className={`rpt-ms-chip ${r.cure === "Yes" ? "ms-done" : r.cure === "No" ? "ms-crit" : "ms-future"}`}>{r.cure}</span></td>
                  <td className="mono">{fmtDate(r.withdrawalDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No subject endpoint data recorded for this study.</EmptyNote>}
      </Section>
    );
  }

  if (code === "CA-0801") {
    const rows = caSubjectDataRows(dataset, studyId);
    const disp = armMask(rows);
    const headers = ["Subject ID", "Arm", "Site", "Baseline CADESI", "FU1", "FU2", "FU3", "FU4", "% change", "Responder (≥50%)"];
    const csv = rows.map((r) => [aggregate ? "—" : r.subjectCode, disp(r.armCode), r.siteName, r.cadesi[0], r.cadesi[14], r.cadesi[28], r.cadesi[42], r.cadesi[56], r.pctChange == null ? "—" : `${r.pctChange}%`, r.responder]);
    return (
      <Section title="Subject data listing — CADESI-04 by visit" icon="table-options" action={<ReportCsvButton studyId={studyId} slug="subject_data_listing" headers={headers} rows={csv} />}>
        {rows.length ? (
          <table className="rpt-table">
            <thead><tr><th>Subject</th><th>Arm</th><th>Site</th><th>Baseline</th><th>FU1</th><th>FU2</th><th>FU3</th><th>FU4</th><th>% change</th><th>Responder</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.subjectId}>
                  <td className="mono">{r.subjectCode}</td><td><span className="rpt-ms-chip ms-future">{disp(r.armCode)}</span></td><td>{r.siteName}</td>
                  <td className="mono">{r.cadesi[0]}</td><td className="mono">{r.cadesi[14]}</td><td className="mono">{r.cadesi[28]}</td><td className="mono">{r.cadesi[42]}</td><td className="mono">{r.cadesi[56]}</td>
                  <td className={`mono${r.pctChange != null && r.pctChange < 0 ? " cell-good" : ""}`}>{r.pctChange == null ? "—" : `${r.pctChange}%`}</td>
                  <td><span className={`rpt-ms-chip ${r.responder === "Yes" ? "ms-done" : r.responder === "No" ? "ms-warn" : "ms-future"}`}>{r.responder}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No subject endpoint data recorded for this study.</EmptyNote>}
      </Section>
    );
  }

  // PH-2401 — pen-level FCR/weight/mortality.
  const rows = phPenProduction(dataset, studyId);
  const headers = ["Pen ID", "Arm", "House", "Starter FCR", "Grower FCR", "Finisher FCR", "Overall FCR", "Final avg weight (kg)", "Mortality %"];
  const csv = rows.map((r) => [r.penCode, r.arm, r.house, r.starterFcr ?? "—", r.growerFcr ?? "—", r.finisherFcr ?? "—", r.overallFcr ?? "—", r.finalWeight ?? "—", r.mortalityPct == null ? "—" : `${r.mortalityPct}%`]);
  return (
    <Section title="Subject data listing — pen production" icon="table-options" action={<ReportCsvButton studyId={studyId} slug="subject_data_listing" headers={headers} rows={csv} />}>
      {rows.length ? (
        <table className="rpt-table">
          <thead><tr><th>Pen</th><th>Arm</th><th>House</th><th>Starter FCR</th><th>Grower FCR</th><th>Finisher FCR</th><th>Overall FCR</th><th>Final wt (kg)</th><th>Mortality %</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.penId}>
                <td className="mono">{r.penCode}</td><td>{r.arm}</td><td>{r.house}</td>
                <td className="mono">{r.starterFcr ?? "—"}</td><td className="mono">{r.growerFcr ?? "—"}</td><td className="mono">{r.finisherFcr ?? "—"}</td><td className="mono">{r.overallFcr ?? "—"}</td>
                <td className="mono">{r.finalWeight ?? "—"}</td><td className="mono">{r.mortalityPct == null ? "—" : `${r.mortalityPct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <EmptyNote>No pen production data recorded for this study.</EmptyNote>}
    </Section>
  );
}
