"use client";

import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useTableSort } from "@/lib/useTableSort";
import { getStudyTypeConfig } from "@/lib/study-type-config";
import { SortTh } from "@/components/common/SortTh";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, Funnel, ExportCsvButton, EmptyNote, fmtDate } from "@/components/reports/ReportKit";
import {
  dispositions, dispositionFunnel, armBalance, screenFailureDetail,
  armLabeler, buildSubjectIndex, type Disposition,
} from "@/lib/reports-data";

const STATUS_LABEL: Record<string, string> = {
  screenfail: "Screen failure", enrolled: "Enrolled", active: "Active", completed: "Completed",
  withdrawn: "Withdrawn", screening: "Screening", randomized: "Randomized", ineligible: "Ineligible",
};
const statusKey = (x: { status: string; isScreenFailure: boolean }) => (x.isScreenFailure ? "screenfail" : x.status);

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
  // Pen/group studies enrol pens, not individual birds — swap the experimental-unit labels.
  const isPen = getStudyTypeConfig(study.code).subjectUnit === "pen";
  const unit = isPen ? "Pen" : "Subject";
  const fLabel = (base: string) => (isPen ? `Pens ${base.toLowerCase()}` : base);

  const [tab, setTab] = useState<"disp" | "arm" | "sf">("disp");
  const [statusF, setStatusF] = useState("all");

  const d = useMemo(() => {
    const ix = buildSubjectIndex(dataset, studyId);
    const label = armLabeler(dataset, studyId, false); // real arm names; gated at render by hideArms
    const disp = dispositions(dataset, studyId, ix);
    return {
      disp, label,
      funnel: dispositionFunnel(disp),
      arms: armBalance(disp, label),
      sfDetail: screenFailureDetail(dataset, studyId, ix),
    };
  }, [dataset, studyId]);

  const statusOptions = useMemo(() => Array.from(new Set(d.disp.map(statusKey))), [d.disp]);

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

  // Fix 4 — status filter on the disposition table (replaces the drill-down panel).
  const filteredDisp = useMemo(() => sortedDisp.filter((x) => statusF === "all" || statusKey(x) === statusF), [sortedDisp, statusF]);

  const csvHeaders = showArm
    ? ["Subject", "Arm", "Site", "Status", "Enrollment date", "Exit date", "Exit reason"]
    : ["Subject", "Site", "Status", "Enrollment date", "Exit date", "Exit reason"];
  const csvRows = filteredDisp.map((x) => {
    const base = [aggregate ? "—" : x.subjectCode];
    if (showArm) base.push(d.label(x.arm));
    return [...base, `${x.siteCode} · ${x.siteName}`, x.status, x.enrollDate, x.exitDate, x.exitReason];
  });

  // Fix 5 — per-tab CSV data (arm balance, screen-failure detail).
  const armHeaders = [showArm ? "Arm" : "Cohort", "Enrolled", "Active", "Completed", "Withdrawn", "Screen failures"];
  const armRows = showArm ? d.arms.map((a) => [a.arm, a.enrolled, a.active, a.completed, a.withdrawn, a.screenFailures]) : [];
  const sfHeaders = ["Subject", "Site", "Screen failure reason", "Date", "Eligibility criterion failed"];
  const sfRows = d.sfDetail.map((r) => [aggregate ? "—" : r.subjectCode, `${r.siteCode} · ${r.siteName}`, r.reason, r.date ?? "—", r.criterion]);

  const armBalanceTable = (
    <>
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
    </>
  );

  return (
    <>
      <div className="rpt-guideline-banner">
        <i className="ti ti-book"></i>
        <span>This report follows the REFLECT statement (Reporting guideline for Randomized Controlled Trials in livestock and companion animal research, Sargeant et al. 2010) — the veterinary equivalent of CONSORT for human trials.</span>
      </div>
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

      {aggregate ? (
        <>
          <Section title={`${unit} disposition`} icon="users">
            <table className="rpt-table">
              <thead><tr><th>Site</th>{showArm && <th>Arm</th>}<th>{isPen ? "Pens" : "Subjects"}</th></tr></thead>
              <tbody>
                {sponsorRows.map((r, i) => <tr key={i}><td>{r.site}</td>{showArm && <td>{r.arm}</td>}<td className="mono">{r.count}</td></tr>)}
              </tbody>
            </table>
          </Section>
          <Section title="Arm balance" icon="scale">{armBalanceTable}</Section>
        </>
      ) : (
        <Section title={`${unit} accounting`} icon="users" action={
          tab === "disp" ? <ExportCsvButton studyCode={study.code} slug="enrollment_disposition" headers={csvHeaders} rows={csvRows} />
          : tab === "arm" ? <ExportCsvButton studyCode={study.code} slug="enrollment_arm_balance" headers={armHeaders} rows={armRows} />
          : <ExportCsvButton studyCode={study.code} slug="enrollment_screen_failures" headers={sfHeaders} rows={sfRows} />
        }>
          <div className="rpt-tabs">
            <button className={`rpt-tab${tab === "disp" ? " active" : ""}`} type="button" onClick={() => setTab("disp")}>{unit} disposition <span className="rpt-tab-count">{d.disp.length}</span></button>
            <button className={`rpt-tab${tab === "arm" ? " active" : ""}`} type="button" onClick={() => setTab("arm")}>Arm balance</button>
            <button className={`rpt-tab${tab === "sf" ? " active" : ""}`} type="button" onClick={() => setTab("sf")}>Screen failure reasons <span className="rpt-tab-count tc-crit">{d.sfDetail.length}</span></button>
          </div>

          {tab === "disp" && (
            <>
              <div className="rpt-filters">
                <select className="rpt-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
                  <option value="all">All statuses</option>
                  {statusOptions.map((s) => <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>)}
                </select>
                <span className="rpt-filter-count">{filteredDisp.length} {isPen ? "pens" : "subjects"}</span>
              </div>
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
                  {filteredDisp.map((x) => (
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
              {filteredDisp.length === 0 && <EmptyNote>No {isPen ? "pens" : "subjects"} with this status.</EmptyNote>}
              {isPen && (
                <p className="rpt-footnote">Individual bird mortality (cumulative flock mortality %) is reported in the Flock Health &amp; Litter form and summarized in the AE / SAE Roster. Pen withdrawal (removing an entire pen from the study) is distinct from flock mortality.</p>
              )}
            </>
          )}

          {tab === "arm" && armBalanceTable}

          {tab === "sf" && (
            d.sfDetail.length > 0 ? (
              <table className="rpt-table">
                <thead><tr><th>Subject</th><th>Site</th><th>Screen failure reason</th><th>Date</th><th>Eligibility criterion failed</th></tr></thead>
                <tbody>
                  {d.sfDetail.map((r, i) => (
                    <tr key={i}><td className="mono">{r.subjectCode}</td><td>{r.siteCode} · {r.siteName}</td><td>{r.reason}</td><td className="mono">{fmtDate(r.date)}</td><td>{r.criterion}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyNote>No screen failures recorded for this study.</EmptyNote>
          )}
        </Section>
      )}
    </>
  );
}
