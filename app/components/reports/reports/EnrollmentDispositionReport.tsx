"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, Funnel, ExportCsvButton, fmtDate } from "@/components/reports/ReportKit";
import {
  dispositions, dispositionFunnel, armBalance, screenFailureReasons,
  armLabeler, buildSubjectIndex, type Disposition,
} from "@/lib/reports-data";

const STATUS_CHIP: Record<string, string> = {
  active: "ms-active", completed: "ms-done", withdrawn: "ms-crit", screening: "ms-future", enrolled: "ms-active", randomized: "ms-active",
};

export function EnrollmentDispositionReport({ studyId, aggregate }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();
  const { sort, toggle } = useTableSort(null);

  const d = useMemo(() => {
    const ix = buildSubjectIndex(dataset, studyId);
    const label = armLabeler(dataset, studyId, aggregate);
    const disp = dispositions(dataset, studyId, ix);
    return {
      disp, label,
      funnel: dispositionFunnel(disp),
      arms: armBalance(disp, label),
      sfReasons: screenFailureReasons(dataset, studyId, ix),
    };
  }, [dataset, studyId, aggregate]);

  // Sponsor: collapse to site + count (no subject IDs, no per-subject rows).
  const sponsorRows = useMemo(() => {
    if (!aggregate) return [];
    const map = new Map<string, { site: string; arm: string; count: number }>();
    for (const x of d.disp) {
      const key = `${x.siteCode}|${d.label(x.arm)}`;
      const r = map.get(key) ?? { site: `${x.siteCode} · ${x.siteName}`, arm: d.label(x.arm), count: 0 };
      r.count++; map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => a.site.localeCompare(b.site) || a.arm.localeCompare(b.arm));
  }, [aggregate, d]);

  const sortedDisp = useMemo(() => {
    const arr = d.disp.slice();
    if (!sort) return arr.sort((a, b) => a.subjectCode.localeCompare(b.subjectCode));
    const dir = sort.dir === "asc" ? 1 : -1;
    const by: Record<string, (x: Disposition) => string> = {
      subject: (x) => x.subjectCode, arm: (x) => d.label(x.arm), site: (x) => x.siteCode,
      status: (x) => x.status, enroll: (x) => x.enrollDate ?? "", exit: (x) => x.exitDate ?? "",
    };
    const f = by[sort.col];
    return f ? arr.sort((a, b) => f(a).localeCompare(f(b)) * dir) : arr;
  }, [d, sort]);

  const csvHeaders = ["Subject", "Arm", "Site", "Status", "Enrollment date", "Exit date", "Exit reason"];
  const csvRows = d.disp.map((x) => [aggregate ? "—" : x.subjectCode, d.label(x.arm), `${x.siteCode} · ${x.siteName}`, x.status, x.enrollDate, x.exitDate, x.exitReason]);

  return (
    <>
      <Section title="Disposition funnel" icon="filter">
        <Funnel steps={[
          { label: "Screened", value: d.funnel.screened },
          { label: "Eligible", value: d.funnel.eligible },
          { label: "Enrolled", value: d.funnel.enrolled, tone: "blue" },
          { label: "Active", value: d.funnel.active, tone: "good" },
          { label: "Completed", value: d.funnel.completed, tone: "good" },
          { label: "Withdrawn", value: d.funnel.withdrawn, tone: "warn" },
          { label: "Screen fails", value: d.funnel.screenFailures, tone: "crit" },
        ]} />
      </Section>

      <Section title="Subject disposition" icon="users" action={!aggregate && <ExportCsvButton studyCode={study.code} slug="enrollment_disposition" headers={csvHeaders} rows={csvRows} />}>
        {aggregate ? (
          <table className="rpt-table">
            <thead><tr><th>Site</th><th>Arm</th><th>Subjects</th></tr></thead>
            <tbody>
              {sponsorRows.map((r, i) => <tr key={i}><td>{r.site}</td><td>{r.arm}</td><td className="mono">{r.count}</td></tr>)}
            </tbody>
          </table>
        ) : (
          <table className="rpt-table">
            <thead><tr>
              <SortTh label="Subject" sortKey="subject" sort={sort} onSort={toggle} />
              <SortTh label="Arm" sortKey="arm" sort={sort} onSort={toggle} />
              <SortTh label="Site" sortKey="site" sort={sort} onSort={toggle} />
              <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
              <SortTh label="Enrollment" sortKey="enroll" sort={sort} onSort={toggle} />
              <SortTh label="Exit" sortKey="exit" sort={sort} onSort={toggle} />
              <th>Exit reason</th>
            </tr></thead>
            <tbody>
              {sortedDisp.map((x) => (
                <tr key={x.subjectId}>
                  <td className="mono">{x.subjectCode}</td>
                  <td>{d.label(x.arm)}</td>
                  <td>{x.siteCode} · {x.siteName}</td>
                  <td><span className={`rpt-ms-chip ${STATUS_CHIP[x.status] ?? "ms-future"}`}>{x.status}</span></td>
                  <td className="mono">{fmtDate(x.enrollDate)}</td>
                  <td className="mono">{fmtDate(x.exitDate)}</td>
                  <td>{x.exitReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Arm balance" icon="scale">
        <table className="rpt-table">
          <thead><tr><th>Arm</th><th>Enrolled</th><th>Active</th><th>Completed</th><th>Withdrawn</th><th>Screen failures</th></tr></thead>
          <tbody>
            {d.arms.map((a) => (
              <tr key={a.arm}><td>{a.arm}</td><td className="mono">{a.enrolled}</td><td className="mono">{a.active}</td><td className="mono">{a.completed}</td><td className="mono">{a.withdrawn}</td><td className="mono">{a.screenFailures}</td></tr>
            ))}
            <tr className="rpt-table-foot">
              <td>Total</td>
              <td className="mono">{d.funnel.enrolled}</td>
              <td className="mono">{d.funnel.active}</td>
              <td className="mono">{d.funnel.completed}</td>
              <td className="mono">{d.funnel.withdrawn}</td>
              <td className="mono">{d.funnel.screenFailures}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {d.sfReasons.length > 0 && (
        <Section title="Screen failure reasons" icon="user-x">
          <table className="rpt-table rpt-table-narrow">
            <thead><tr><th>Reason</th><th>Count</th></tr></thead>
            <tbody>{d.sfReasons.map((r) => <tr key={r.reason}><td>{r.reason}</td><td className="mono">{r.count}</td></tr>)}</tbody>
          </table>
        </Section>
      )}
    </>
  );
}
