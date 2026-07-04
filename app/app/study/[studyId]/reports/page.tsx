"use client";

// Reports — clinical-trial report catalog (left) + report view (right). Role-
// scoped: each role sees only its permitted reports; CRC (data-entry only) is
// redirected away. All report content derives from the session store.
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { reportsForRole, reportById, isAggregateRole, type ReportId } from "@/lib/reports-data";
import { shouldHideArms } from "@/lib/study-config";
import { ReportSidebar } from "@/components/reports/ReportSidebar";
import { StudyStatusReport } from "@/components/reports/reports/StudyStatusReport";
import { EnrollmentDispositionReport } from "@/components/reports/reports/EnrollmentDispositionReport";
import { SitePerformanceReport } from "@/components/reports/reports/SitePerformanceReport";
import { VisitComplianceReport } from "@/components/reports/reports/VisitComplianceReport";
import { DataCompletenessReport } from "@/components/reports/reports/DataCompletenessReport";
import { QueryEditCheckReport } from "@/components/reports/reports/QueryEditCheckReport";
import { AeSaeSummaryReport } from "@/components/reports/reports/AeSaeSummaryReport";
import { ConMedLogReport } from "@/components/reports/reports/ConMedLogReport";
import { SdvCompletionReport } from "@/components/reports/reports/SdvCompletionReport";
import { QueryListingReport } from "@/components/reports/reports/QueryListingReport";
import { ProtocolDeviationsReport } from "@/components/reports/reports/ProtocolDeviationsReport";
import { RandomizationReport } from "@/components/reports/reports/RandomizationReport";
import { DrugAccountabilityReport } from "@/components/reports/reports/DrugAccountabilityReport";
import "./reports.css";

export interface ReportProps {
  studyId: string;
  aggregate: boolean; // Sponsor — no subject-level data / IDs
  hideArms: boolean; // blinded role on a blinded study — no arm names / splits
}

const RENDERERS: Record<ReportId, (p: ReportProps) => JSX.Element> = {
  "study-status": StudyStatusReport,
  "enrollment-disposition": EnrollmentDispositionReport,
  "site-performance": SitePerformanceReport,
  "visit-compliance": VisitComplianceReport,
  "data-completeness": DataCompletenessReport,
  "query-edit-check": QueryEditCheckReport,
  "safety-ae": AeSaeSummaryReport,
  "conmed-log": ConMedLogReport,
  "sdv-completion": SdvCompletionReport,
  "query-listing": QueryListingReport,
  "protocol-deviations": ProtocolDeviationsReport,
  "randomization": RandomizationReport,
  "drug-accountability": DrugAccountabilityReport,
};

export default function ReportsPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, study } = useShell();
  const { dataset, ready } = useStudySession();

  const available = useMemo(() => reportsForRole(activeRole), [activeRole]);
  const allowed = available.length > 0; // CRC has none → redirect

  useEffect(() => {
    if (ready && !allowed) router.replace(`/study/${studyId}`);
  }, [ready, allowed, router, studyId]);

  const [activeId, setActiveId] = useState<ReportId>(available[0]?.id ?? "study-status");
  // Keep the selection valid when the role (and thus the catalog) changes.
  useEffect(() => {
    if (!available.some((r) => r.id === activeId)) setActiveId(available[0]?.id ?? "study-status");
  }, [available, activeId]);

  const [generatedAt, setGeneratedAt] = useState("");
  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
  }, [activeId]);

  if (!ready) return <div className="rpt-screen"><div className="rpt-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="rpt-screen"><div className="rpt-loading">Redirecting…</div></div>;

  const meta = reportById(activeId);
  const aggregate = isAggregateRole(activeRole);
  const hideArms = shouldHideArms(dataset, studyId, activeRole);
  const Renderer = RENDERERS[activeId];

  return (
    <div className="rpt-screen">
      <ReportSidebar
        reports={available}
        activeId={activeId}
        onSelect={setActiveId}
        role={activeRole}
        studyCode={study.code}
        studyId={studyId}
      />
      <div className="rpt-main" id="rpt-print-area">
        {meta && (
          <div className="rpt-header">
            <div className="rpt-header-text">
              <div className="rpt-eyebrow">{meta.category}</div>
              <h1 className="rpt-title">{meta.title}</h1>
              <p className="rpt-desc">{meta.description}</p>
              <div className="rpt-meta">
                <span><i className="ti ti-flask"></i> {study.code} · {study.name}</span>
                <span><i className="ti ti-clock"></i> Generated {generatedAt}</span>
                <span><i className="ti ti-user-shield"></i> {activeRole}</span>
              </div>
              {aggregate && (
                <div className="rpt-disclaimer"><i className="ti ti-eye-off"></i> Aggregate sponsor view — individual subject data is omitted.</div>
              )}
              {hideArms && !aggregate && (
                <div className="rpt-disclaimer"><i className="ti ti-eye-off"></i> Blinded view — treatment-arm allocation is hidden for your role on this study.</div>
              )}
            </div>
            <div className="rpt-header-actions">
              <button className="rpt-btn" type="button" onClick={() => window.print()}><i className="ti ti-printer"></i> Print / Export PDF</button>
            </div>
          </div>
        )}
        <div className="rpt-body">
          {Renderer && <Renderer studyId={studyId} aggregate={aggregate} hideArms={hideArms} />}
        </div>
      </div>
    </div>
  );
}
