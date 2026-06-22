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

// Status → standard chip class (same light-tint .rpt-ms-chip primitive as the
// Overdue/On-time chips). active/completed→green, enrolled→blue, screening &
// withdrawn→slate (neutral/closed — no action), screen-fail→red.
const STATUS_CHIP: Record<string, string> = {
  active: "ms-done", completed: "ms-done", withdrawn: "ms-future", screening: "ms-future", enrolled: "ms-active", randomized: "ms-active",
};
function dispChip(x: { status: string; isScreenFailure: boolean }): { cls: string; label: string } {
  if (x.isScreenFailure) return { cls: "ms-crit", label: "Screen fail" };
  return { cls: STATUS_CHIP[x.status] ?? "ms-future", label: x.status };
}

export function EnrollmentDispositionReport({ studyId, aggregate, hideArms }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();
  const { sort, toggle } = useTableSort(null);
  const showArm = !hideArms;
  // PH-2401 enrolls pens, not individual birds — swap the experimental-unit labels.
  const isPen = study.code === "PH-2401";
  const unit = isPen ? "Pen" : "Subject";
  const fLabel = (base: string) => (isPen ? `Pens ${base.toLowerCase()}` : base);

  const d = useMemo(() => {
    const ix = buildSubjectIndex(dataset, studyId);
    const label = armLabeler(dataset, studyId, false); // real arm names; gated at render by hideArms
    const disp = dispositions(dataset, studyId, ix);
    return {
      disp, label,
      funnel: dispositionFunnel(disp),
      arms: armBalance(disp, label),
      sfReasons: screenFailureReasons(dataset, studyId, ix),
    };
  }, [dataset, studyId]);

  // Sponsor: collapse to site (+ arm when visible) + count — no subject IDs.
  const sponsorRows = useMemo(() => {
    if (!aggregate) return [];
    const map = new Map<string, { site: string; arm: string; count: number }>();
    for (const x of d.disp) {
      const arm = showArm ? d.label(x.arm) : "";
      const key = `${x.siteCode}|${arm}`;
      const r = map.get(key) ?? { site: `${x.siteCode} · ${x.siteName}`, arm, count: 0 };
      r.count++; map.set(key, r);
    }
    return Array.from(map.values()).sort((a, b) => a.site.localeCompare(b.site) || a.arm.localeCompare(b.arm));
  }, [aggregate, showArm, d]);

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

  const csvHeaders = showArm
    ? ["Subject", "Arm", "Site", "Status", "Enrollment date", "Exit date", "Exit reason"]
    : ["Subject", "Site", "Status", "Enrollment date", "Exit date", "Exit reason"];
  const csvRows = d.disp.map((x) => {
    const base = [aggregate ? "—" : x.subjectCode];
    if (showArm) base.push(d.label(x.arm));
    return [...base, `${x.siteCode} · ${x.siteName}`, x.status, x.enrollDate, x.exitDate, x.exitReason];
  });

  return (
    <>
      {isPen && (
        <div className="rpt-action-banner" style={{ background: "var(--blue-50)", color: "var(--blue-600)" }}>
          <i className="ti ti-info-circle"></i> Pen-level enrollment — PH-2401 uses the pen as the experimental unit; individual bird mortality is tracked in the Flock Health form, not as subject disposition.
        </div>
      )}
      <Section title={`${unit} disposition funnel`} icon="filter">
        <Funnel steps={[
          { label: fLabel("Screened"), value: d.funnel.screened },
          { label: fLabel("Eligible"), value: d.funnel.eligible },
          { label: fLabel("Enrolled"), value: d.funnel.enrolled, tone: "blue" },
          { label: fLabel("Active"), value: d.funnel.active, tone: "good" },
          { label: fLabel("Completed"), value: d.funnel.completed, tone: "good" },
          { label: fLabel("Withdrawn"), value: d.funnel.withdrawn, tone: "warn" },
          { label: "Screen fails", value: d.funnel.screenFailures, tone: "crit" },
        ]} />
      </Section>

      <Section title={`${unit} disposition`} icon="users" action={!aggregate && <ExportCsvButton studyCode={study.code} slug="enrollment_disposition" headers={csvHeaders} rows={csvRows} />}>
        {aggregate ? (
          <table className="rpt-table">
            <thead><tr><th>Site</th>{showArm && <th>Arm</th>}<th>{isPen ? "Pens" : "Subjects"}</th></tr></thead>
            <tbody>
              {sponsorRows.map((r, i) => <tr key={i}><td>{r.site}</td>{showArm && <td>{r.arm}</td>}<td className="mono">{r.count}</td></tr>)}
            </tbody>
          </table>
        ) : (
          <table className="rpt-table">
            <thead><tr>
              <SortTh label={isPen ? "Pen ID" : "Subject"} sortKey="subject" sort={sort} onSort={toggle} />
              {showArm && <SortTh label="Arm" sortKey="arm" sort={sort} onSort={toggle} />}
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
                  {showArm && <td>{d.label(x.arm)}</td>}
                  <td>{x.siteCode} · {x.siteName}</td>
                  <td>{(() => { const c = dispChip(x); return <span className={`rpt-ms-chip ${c.cls}`}>{c.label}</span>; })()}</td>
                  <td className="mono">{fmtDate(x.enrollDate)}</td>
                  <td className="mono">{fmtDate(x.exitDate)}</td>
                  <td>{x.exitReason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {isPen && (
          <p className="rpt-footnote">Individual bird mortality (cumulative flock mortality %) is reported in the Flock Health &amp; Litter form and summarized in the AE / SAE Roster. Pen withdrawal (removing an entire pen from the study) is distinct from flock mortality.</p>
        )}
      </Section>

      <Section title="Arm balance" icon="scale">
        <table className="rpt-table">
          <thead><tr><th>{showArm ? "Arm" : "Cohort"}</th><th>Enrolled</th><th>Active</th><th>Completed</th><th>Withdrawn</th><th>Screen failures</th></tr></thead>
          <tbody>
            {showArm && d.arms.map((a) => (
              <tr key={a.arm}><td>{a.arm}</td><td className="mono">{a.enrolled}</td><td className="mono">{a.active}</td><td className="mono">{a.completed}</td><td className="mono">{a.withdrawn}</td><td className="mono">{a.screenFailures}</td></tr>
            ))}
            <tr className="rpt-table-foot">
              <td>{showArm ? "Total" : "All subjects"}</td>
              <td className="mono">{d.funnel.enrolled}</td>
              <td className="mono">{d.funnel.active}</td>
              <td className="mono">{d.funnel.completed}</td>
              <td className="mono">{d.funnel.withdrawn}</td>
              <td className="mono">{d.funnel.screenFailures}</td>
            </tr>
          </tbody>
        </table>
        {!showArm && <div className="rpt-bar-caption">Per-arm breakdown is hidden for your role on this blinded study.</div>}
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
