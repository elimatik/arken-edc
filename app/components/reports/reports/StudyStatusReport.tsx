"use client";

import { useMemo } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, ProportionBar, EmptyNote, fmtDate } from "@/components/reports/ReportKit";
import {
  studyHeader, milestones, studyTeam, dispositions, dispositionFunnel,
  enrollmentByArm, armLabeler,
} from "@/lib/reports-data";
import { formProgress, openQueryCount, sdvProgress } from "@/lib/dashboard-data";

const ARM_COLORS = ["var(--blue-400)", "var(--amber-400)", "var(--green-400)", "var(--purple-200)"];
const STATUS_TONE: Record<string, string> = { active: "ss-active", locked: "ss-locked", closed: "ss-closed", completed: "ss-locked" };

export function StudyStatusReport({ studyId, aggregate }: ReportProps) {
  const { dataset } = useStudySession();

  const data = useMemo(() => {
    const header = studyHeader(dataset, studyId);
    const study = dataset.studies.find((s) => s.id === studyId);
    const disp = dispositions(dataset, studyId);
    const funnel = dispositionFunnel(disp);
    const label = armLabeler(dataset, studyId, aggregate);
    const arms = enrollmentByArm(disp, label);
    const fp = formProgress(dataset, studyId);
    const sdv = sdvProgress(dataset, studyId);
    const siteTargetSum = dataset.sites.filter((s) => s.study_id === studyId).reduce((n, s) => n + (s.enrollment_target ?? 0), 0);
    const target = study?.enrollment_target ?? (siteTargetSum || null);
    return {
      header, funnel, arms, target,
      fpPct: fp.total ? Math.round((fp.completed / fp.total) * 100) : 0, fp,
      openQ: openQueryCount(dataset, studyId),
      sdvPct: sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0,
      milestoneRows: milestones(header),
      team: studyTeam(dataset, studyId),
    };
  }, [dataset, studyId, aggregate]);

  const h = data.header;
  const enrolPct = data.target ? Math.round((data.funnel.enrolled / data.target) * 100) : 0;

  return (
    <>
      <div className="rpt-studyblock">
        <div className="rpt-studyblock-main">
          <div className="rpt-studyblock-code mono">{h.code}</div>
          <div className="rpt-studyblock-name">{h.name}</div>
          <div className="rpt-studyblock-facts">
            <span><span className="rpt-fact-k">Sponsor</span> {h.sponsor}</span>
            <span><span className="rpt-fact-k">Protocol</span> {h.protocolVersion}</span>
            <span><span className="rpt-fact-k">Phase</span> {h.phase}</span>
          </div>
        </div>
        <div className="rpt-studyblock-side">
          <span className={`rpt-status-chip ${STATUS_TONE[h.status.toLowerCase()] ?? "ss-active"}`}>{h.status}</span>
          {h.lockDate && <span className="rpt-studyblock-lock">Locked {fmtDate(h.lockDate)}</span>}
          <div className="rpt-studyblock-dates">
            <span><span className="rpt-fact-k">Start</span> {fmtDate(h.startDate)}</span>
            <span><span className="rpt-fact-k">Proj. end</span> {fmtDate(h.endDate)}</span>
            {h.dayOfStudy != null && <span><span className="rpt-fact-k">Now</span> Day {h.dayOfStudy} · Week {h.weekOfStudy}</span>}
          </div>
        </div>
      </div>

      <Section title="Key metrics" icon="gauge">
        <StatGrid>
          <StatTile value={data.target ? `${data.funnel.enrolled}/${data.target}` : String(data.funnel.enrolled)} label="Subjects enrolled" sub={data.target ? `${enrolPct}% of target` : undefined} tone="blue" />
          <StatTile value={`${data.fpPct}%`} label="Forms completed" sub={`${data.fp.completed}/${data.fp.total}`} tone={data.fpPct < 50 ? "crit" : data.fpPct < 70 ? "warn" : "good"} />
          <StatTile value={data.openQ} label="Open queries" tone={data.openQ > 0 ? "warn" : "good"} />
          <StatTile value={`${data.sdvPct}%`} label="SDV complete" tone={data.sdvPct < 50 ? "warn" : "good"} />
        </StatGrid>
      </Section>

      <Section title="Enrollment progress" icon="users">
        {data.arms.length > 0 ? (
          <ProportionBar
            total={data.target ?? data.funnel.enrolled}
            segments={data.arms.map((a, i) => ({ label: a.arm, count: a.count, color: ARM_COLORS[i % ARM_COLORS.length] }))}
          />
        ) : <EmptyNote>No randomized subjects yet.</EmptyNote>}
      </Section>

      <Section title="Study timeline" icon="flag-2">
        <table className="rpt-table">
          <thead><tr><th>Milestone</th><th>Date</th><th>Status</th></tr></thead>
          <tbody>
            {data.milestoneRows.map((m) => (
              <tr key={m.milestone}>
                <td>{m.milestone}</td>
                <td className="mono">{m.date}</td>
                <td><span className={`rpt-ms-chip ms-${m.status}`}>{m.status === "done" ? "Complete" : m.status === "active" ? "In progress" : "Planned"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Study team" icon="users-group">
        {data.team.length > 0 ? (
          <table className="rpt-table">
            <thead><tr><th>Name</th><th>Role</th><th>Site</th><th>Status</th></tr></thead>
            <tbody>
              {data.team.map((t, i) => (
                <tr key={`${t.name}-${i}`}>
                  <td>{t.name}</td><td>{t.role}</td><td>{t.siteName}</td>
                  <td><span className={`rpt-ms-chip ${t.status === "Active" ? "ms-done" : "ms-future"}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyNote>No study-team records.</EmptyNote>}
      </Section>
    </>
  );
}
