"use client";

// ════════════════════════════════════════════════════════════════════════════
// Schedule of Events (SoE) — the protocol schedule grid (procedures × study days)
// with a live completion overlay derived from real session data. This is NOT a
// calendar: columns are protocol study days / visits, not dates. The grid layout
// (days, phase banding, procedures, footnotes) is protocol metadata per study;
// the done / due / overdue markers fall out of buildSchedule() → buildVisits().
// ════════════════════════════════════════════════════════════════════════════

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { buildSchedule, type MarkerType, type LiveStatus, type Phase } from "@/lib/schedule-data";
import "./schedule.css";

const PHASE_CLS: Record<Phase, string> = { screening: "phase-screening", treatment: "phase-treatment", followup: "phase-followup" };

function Marker({ type }: { type: MarkerType | LiveStatus }) {
  switch (type) {
    case "x": return <span className="marker marker-x" title="Procedure scheduled">X</span>;
    case "dose": return <span className="marker marker-dose" title="Dosing">D</span>;
    case "blood": return <span className="marker marker-blood" title="Blood / sample">B</span>;
    case "check": return <span className="marker marker-check" title="Assessment">A</span>;
    case "fast": return <span className="marker marker-fast" title="Fasting required">⊘</span>;
    case "done": return <span className="marker marker-done" title="Completed"><i className="ti ti-check"></i></span>;
    case "overdue": return <span className="marker marker-overdue" title="Overdue"><i className="ti ti-alert-circle"></i></span>;
    case "due": return <span className="marker marker-due" title="Due now">!</span>;
    default: return null;
  }
}

export default function SchedulePage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const { study } = useShell();
  const { dataset, ready } = useStudySession();

  const [today, setToday] = useState<string | null>(null);
  useEffect(() => { setToday(new Date().toISOString().slice(0, 10)); }, []);

  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);

  const model = useMemo(() => (ready && today ? buildSchedule(dataset, studyId, today) : null), [dataset, studyId, ready, today]);

  if (!ready || !today) return <div className="soe-screen"><div className="soe-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!model) return <div className="soe-screen"><div className="soe-loading">No schedule of events is defined for this study.</div></div>;

  const { config, phaseSpans, liveByDay, todayDay, subjectCount } = model;
  const ncol = config.days.length;

  return (
    <div className="soe-screen">
      <div className="soe-header">
        <div className="soe-title-group">
          <h1 className="soe-title">Protocol schedule</h1>
          <div className="soe-subtitle">{study.code} · {study.name} · Schedule of events{todayDay != null ? ` · live status vs ${config.days.find((d) => d.day === todayDay)?.label ?? "today"} (${subjectCount} active ${config.subjectNoun.toLowerCase()}${subjectCount === 1 ? "" : "s"})` : ""}</div>
        </div>
        <div className="soe-header-actions">
          <button className="soe-btn" type="button" onClick={() => setToast("Preparing SoE for print…")}><i className="ti ti-printer"></i> Print SoE</button>
          <button className="soe-btn" type="button" onClick={() => setToast("Export queued — SoE.csv")}><i className="ti ti-download"></i> Export</button>
        </div>
      </div>

      <div className="soe-scroll">
        <table className="soe-table">
          <thead>
            <tr>
              <th className="col-proc-hdr" rowSpan={2}>Procedure</th>
              {phaseSpans.map((ps, i) => (
                <th key={i} colSpan={ps.count} className={`phase-cell ${PHASE_CLS[ps.phase]}`}>{ps.label}</th>
              ))}
            </tr>
            <tr>
              {config.days.map((d) => {
                const isToday = d.day === todayDay;
                return (
                  <th key={d.day} className={`day-hdr${d.pivot ? " pivot" : ""}${isToday ? " today-hdr" : ""}`}>
                    <span className="day-num">{d.label}{d.pivot ? " ★" : ""}</span>
                    <span className="day-window">{isToday ? "← today" : d.window}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {config.groups.map((grp) => (
              <Fragment key={grp.group}>
                <tr className="group-spacer"><td colSpan={ncol + 1}></td></tr>
                <tr>
                  <td className="proc-label group-header">{grp.group}</td>
                  {config.days.map((d) => (
                    <td key={d.day} className={`soe-cell group-row ${PHASE_CLS[d.phase]}${d.day === todayDay ? " today-col" : ""}${d.pivot ? " pivot" : ""}`}></td>
                  ))}
                </tr>
                {grp.rows.map((row) => (
                  <tr key={`${grp.group}-${row.name}`}>
                    <td className="proc-label">{row.name}{row.fn ? <sup className="fn" title={`See footnote ${row.fn}`}>[{row.fn}]</sup> : null}</td>
                    {config.days.map((d, i) => {
                      const base = row.cells[i];
                      const live = base != null ? liveByDay.get(d.day) : undefined;
                      const eff = base == null ? null : (live ?? base);
                      return (
                        <td key={d.day} className={`soe-cell ${PHASE_CLS[d.phase]}${d.day === todayDay ? " today-col" : ""}${d.pivot ? " pivot" : ""}`}>
                          {eff ? <Marker type={eff} /> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="soe-footnotes">
        {config.footnotes.map((f) => (
          <div className="fn-item" key={f.num}><span className="fn-num">[{f.num}]</span><span>{f.text}</span></div>
        ))}
      </div>

      <div className="soe-legend">
        <span className="legend-title">Markers:</span>
        <span className="legend-item"><span className="marker marker-x">X</span> Procedure</span>
        <span className="legend-item"><span className="marker marker-dose">D</span> Dosing</span>
        <span className="legend-item"><span className="marker marker-blood">B</span> Blood / sample</span>
        <span className="legend-item"><span className="marker marker-check">A</span> Assessment</span>
        <span className="legend-item"><span className="marker marker-fast">⊘</span> Fasting</span>
        <span className="legend-sep"></span>
        <span className="legend-item"><span className="marker marker-done"><i className="ti ti-check"></i></span> Done</span>
        <span className="legend-item"><span className="marker marker-due">!</span> Due now</span>
        <span className="legend-item"><span className="marker marker-overdue"><i className="ti ti-alert-circle"></i></span> Overdue</span>
      </div>

      {toast && <div className="soe-toast" role="status"><i className="ti ti-circle-check"></i> {toast}</div>}
    </div>
  );
}
