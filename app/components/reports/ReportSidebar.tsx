"use client";

import { useStudySession } from "@/lib/session-store/SessionStore";
import {
  REPORT_CATEGORIES, type ReportMeta, type ReportId,
  dispositions, sitePerformance, visitComplianceRows, completenessByForm,
  queryAging, armLabeler, downloadCsv, csvFilename, buildConMedLog,
} from "@/lib/reports-data";
import { buildSdvWorklist } from "@/lib/sdv-data";
import type { SavedReport } from "@/lib/report-builder";
import type { Role } from "@/lib/permissions";
import type { Dataset } from "@/lib/session-store/types";

export function ReportSidebar({
  reports, activeId, onSelect, role, studyCode, studyId,
  canCustom, customActive, onSelectCustom, savedReports, savedActiveId, onSelectSaved, onDeleteSaved,
}: {
  reports: ReportMeta[];
  activeId: ReportId;
  onSelect: (id: ReportId) => void;
  role: Role;
  studyCode: string;
  studyId: string;
  canCustom: boolean;
  customActive: boolean;
  onSelectCustom: () => void;
  savedReports: SavedReport[];
  savedActiveId: string | null;
  onSelectSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
}) {
  const { dataset } = useStudySession();
  const canExportAll = role === "DM" || role === "Admin";

  function exportAll() {
    // Sequential per-report CSV downloads (a zip is overkill for the demo).
    for (const r of reports.filter((x) => x.hasCsv)) {
      const built = buildReportCsv(r.id, dataset, studyId);
      if (built) downloadCsv(csvFilename(studyCode, r.slug), built.headers, built.rows);
    }
  }

  return (
    <aside className="rpt-sidebar">
      <div className="rpt-sidebar-head">
        <i className="ti ti-report-analytics"></i>
        <span>Reports</span>
      </div>
      <nav className="rpt-catalog">
        {REPORT_CATEGORIES.map((cat) => {
          const items = reports.filter((r) => r.category === cat);
          if (items.length === 0) return null;
          return (
            <div className="rpt-cat" key={cat}>
              <div className="rpt-cat-label">{cat}</div>
              {items.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`rpt-cat-item${r.id === activeId ? " active" : ""}`}
                  onClick={() => onSelect(r.id)}
                >
                  <i className={`ti ti-${r.icon}`}></i>
                  <span className="rpt-cat-item-name">{r.title}</span>
                </button>
              ))}
            </div>
          );
        })}

        {canCustom && (
          <div className="rpt-cat">
            {savedReports.length > 0 && (
              <>
                <div className="rpt-cat-label">Saved reports</div>
                {savedReports.map((r) => (
                  <div key={r.id} className={`rpt-cat-item rpt-saved-item${r.id === savedActiveId ? " active" : ""}`} onClick={() => onSelectSaved(r.id)}>
                    <i className="ti ti-bookmark"></i>
                    <span className="rpt-cat-item-name">{r.name}</span>
                    <span className="rpt-saved-badge">Custom</span>
                    <button type="button" className="rpt-saved-del" title="Delete saved report" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete saved report "${r.name}"?`)) onDeleteSaved(r.id); }}><i className="ti ti-trash"></i></button>
                  </div>
                ))}
              </>
            )}
            <div className="rpt-cat-label">Build</div>
            <button type="button" className={`rpt-cat-item${customActive ? " active" : ""}`} onClick={onSelectCustom}>
              <i className="ti ti-table-plus"></i>
              <span className="rpt-cat-item-name">Custom report</span>
            </button>
          </div>
        )}
      </nav>
      {canExportAll && (
        <button className="rpt-export-all" type="button" onClick={exportAll}>
          <i className="ti ti-download"></i> Export all → CSV
        </button>
      )}
    </aside>
  );
}

// Primary-table CSV per report (reused by Export-all here and the per-report
// Export CSV buttons via the same builders).
export function buildReportCsv(id: ReportId, dataset: Dataset, studyId: string): { headers: string[]; rows: (string | number | null)[][] } | null {
  switch (id) {
    case "enrollment-disposition": {
      const label = armLabeler(dataset, studyId, false);
      return {
        headers: ["Subject", "Arm", "Site", "Status", "Enrollment date", "Exit date", "Exit reason"],
        rows: dispositions(dataset, studyId).map((d) => [d.subjectCode, label(d.arm), `${d.siteCode} · ${d.siteName}`, d.status, d.enrollDate, d.exitDate, d.exitReason]),
      };
    }
    case "site-performance":
      return {
        headers: ["Site", "Enrolled", "Target", "Form completion %", "SDV %", "Open queries", "Overdue visits", "Deviations", "Last data entry", "Last monitoring"],
        rows: sitePerformance(dataset, studyId).map((s) => [`${s.code} · ${s.name}`, s.enrolled, s.target, s.formPct, s.sdvPct, s.openQueries, s.overdueVisits, s.deviations, s.lastDataEntry, s.lastMonitoring]),
      };
    case "visit-compliance":
      return {
        headers: ["Subject", "Site", "Visit", "Target date", "Window (±d)", "Actual date", "Days from target", "Status"],
        rows: visitComplianceRows(dataset, studyId).map((v) => [v.subjectCode, v.siteName, v.visitName, v.targetDate, v.window, v.actualDate, v.daysFromTarget, v.status]),
      };
    case "data-completeness":
      return {
        headers: ["Form", "Submitted", "Missing required", "Pending", "Locked"],
        rows: completenessByForm(dataset, studyId).map((f) => [f.formName, f.submitted, f.missingRequired, f.pending, f.locked]),
      };
    case "query-edit-check":
      return {
        headers: ["Query ID", "Subject", "Form", "Field", "Raised by", "Raised date", "Days open", "Status", "Assigned to"],
        rows: queryAging(dataset, studyId).map((q) => [q.code, q.subjectCode, q.formName, q.fieldLabel, q.raisedBy, q.raisedDate, q.daysOpen, q.status, q.assignedTo]),
      };
    case "conmed-log":
      return {
        headers: ["Subject", "Site", "Medication", "Drug class", "Dose", "Route", "Start date", "End date", "Indication", "VeDDRA code", "Coding", "Concurrent with", "Interaction"],
        rows: buildConMedLog(dataset, studyId).map((e) => [e.subjectCode, `${e.siteCode} · ${e.siteName}`, e.medication, e.drugClass, e.dose, e.route, e.startDate, e.ongoing ? "Ongoing" : e.endDate, e.indication, e.veddraCode, e.codingStatus, e.concurrentWith, e.interaction ? "Yes" : "No"]),
      };
    case "sdv-completion":
      return {
        headers: ["Subject", "Site", "Form", "SDV status", "Verified", "Total", "Open queries"],
        rows: buildSdvWorklist(dataset, studyId).map((r) => [r.subjectCode, r.siteLabel, r.formName, r.sdvStatus, r.verifiedFields, r.totalRequiredFields, r.openQueries]),
      };
    default:
      return null;
  }
}
