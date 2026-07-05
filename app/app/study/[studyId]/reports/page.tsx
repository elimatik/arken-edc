"use client";

// Reports — clinical-trial report catalog (left) + report view (right). Role-
// scoped: each role sees only its permitted reports; CRC (data-entry only) is
// redirected away. All report content derives from the session store.
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { reportsForRole, reportById, isAggregateRole, type ReportId } from "@/lib/reports-data";
import { shouldHideArms } from "@/lib/study-config";
import { ReportSidebar } from "@/components/reports/ReportSidebar";
import { CustomReportBuilder } from "@/components/reports/CustomReportBuilder";
import { loadSavedReports, takePendingConfig, type SavedReport, type ReportConfig } from "@/lib/report-builder";
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
import { SubjectDataListingReport } from "@/components/reports/reports/SubjectDataListingReport";
import { PhProductionPenReport } from "@/components/reports/reports/PhProductionPenReport";
import { PhFeedConversionReport } from "@/components/reports/reports/PhFeedConversionReport";
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
  "subject-data-listing": SubjectDataListingReport,
  "ph-production-pen": PhProductionPenReport,
  "ph-feed-conversion": PhFeedConversionReport,
};

export default function ReportsPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, study } = useShell();
  const { dataset, ready } = useStudySession();

  const available = useMemo(() => reportsForRole(activeRole, study.code), [activeRole, study.code]);
  const allowed = available.length > 0; // CRC has none → redirect

  useEffect(() => {
    if (ready && !allowed) router.replace(`/study/${studyId}`);
  }, [ready, allowed, router, studyId]);

  // Selection: a pre-built report, the empty custom builder, or a saved report.
  type Sel = { kind: "report"; id: ReportId } | { kind: "custom" } | { kind: "saved"; id: string };
  const [sel, setSel] = useState<Sel>({ kind: "report", id: available[0]?.id ?? "study-status" });
  const activeId = sel.kind === "report" ? sel.id : available[0]?.id ?? "study-status";
  const canCustom = activeRole !== "CRC"; // CRC has no Reports access anyway
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [pendingCfg, setPendingCfg] = useState<ReportConfig | null>(null);
  const searchParams = useSearchParams();

  // Keep the selection valid when the role (and thus the catalog) changes.
  useEffect(() => {
    if (sel.kind === "report" && !available.some((r) => r.id === sel.id)) setSel({ kind: "report", id: available[0]?.id ?? "study-status" });
  }, [available, sel]);

  // Load saved reports + consume a pending Arken Insights config (or ?custom=1).
  // Re-runs on ?custom= changes so "Open in report builder" works even when the
  // Reports page is already mounted.
  const qs = searchParams.toString();
  useEffect(() => {
    setSavedReports(loadSavedReports(studyId));
    const pend = takePendingConfig();
    if (pend) { setPendingCfg(pend); setSel({ kind: "custom" }); }
    else if (searchParams.get("custom") === "1" && canCustom) setSel({ kind: "custom" });
  }, [studyId, qs]); // eslint-disable-line react-hooks/exhaustive-deps

  const [generatedAt, setGeneratedAt] = useState("");
  useEffect(() => {
    setGeneratedAt(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
  }, [activeId]);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  if (!ready) return <div className="rpt-screen"><div className="rpt-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="rpt-screen"><div className="rpt-loading">Redirecting…</div></div>;

  const isCustom = sel.kind === "custom" || sel.kind === "saved";
  const savedActive = sel.kind === "saved" ? savedReports.find((r) => r.id === sel.id) : undefined;
  const meta = reportById(activeId);
  const aggregate = isAggregateRole(activeRole);
  const hideArms = shouldHideArms(dataset, studyId, activeRole);
  const Renderer = RENDERERS[activeId];
  function refreshSaved() { setSavedReports(loadSavedReports(studyId)); }

  return (
    <div className="rpt-screen">
      <ReportSidebar
        reports={available}
        activeId={activeId}
        onSelect={(id) => setSel({ kind: "report", id })}
        role={activeRole}
        studyCode={study.code}
        studyId={studyId}
        canCustom={canCustom}
        customActive={sel.kind === "custom"}
        onSelectCustom={() => { setPendingCfg(null); setSel({ kind: "custom" }); }}
        savedReports={savedReports}
        savedActiveId={sel.kind === "saved" ? sel.id : null}
        onSelectSaved={(id) => setSel({ kind: "saved", id })}
        onDeleteSaved={(id) => { const next = savedReports.filter((r) => r.id !== id); setSavedReports(next); import("@/lib/report-builder").then((m) => m.persistSavedReports(studyId, next)); if (sel.kind === "saved" && sel.id === id) setSel({ kind: "custom" }); }}
      />
      <div className="rpt-main" id="rpt-print-area">
        {isCustom ? (
          <>
            <div className="rpt-header">
              <div className="rpt-header-text">
                <div className="rpt-eyebrow">Custom</div>
                <h1 className="rpt-title">{savedActive ? savedActive.name : "Custom report"}</h1>
                <p className="rpt-desc">{savedActive ? savedActive.description || "Saved custom report." : "Build a report — pick a data source, add columns and filters, preview and export."}</p>
                <div className="rpt-meta">
                  <span><i className="ti ti-flask"></i> {study.code} · {study.name}</span>
                  <span><i className="ti ti-user-shield"></i> {activeRole}</span>
                </div>
              </div>
            </div>
            <div className="rpt-body">
              <CustomReportBuilder
                key={sel.kind === "saved" ? sel.id : pendingCfg ? "ai" : "new"}
                studyId={studyId}
                initial={savedActive ? savedActive.config : pendingCfg}
                source={savedActive ? "saved" : pendingCfg ? "ai" : "manual"}
                onSaved={refreshSaved}
                onToast={setToast}
              />
            </div>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
      {toast && <div className="crb-toast" role="status"><i className="ti ti-circle-check"></i> {toast}</div>}
    </div>
  );
}
