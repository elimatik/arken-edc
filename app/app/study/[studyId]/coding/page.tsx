"use client";

// VeDDRA Coding — the medical-coding workstation (the write path for VeDDRA).
// DM/Admin code + verify; CRC and Sponsor get a read-only view; all other roles
// redirect to the dashboard.
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { CodingWorklist } from "@/components/coding/CodingWorklist";
import "./coding.css";

export default function CodingPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole } = useShell();
  const { ready } = useStudySession();

  // DM/Admin can code + verify; CRC and Sponsor may view read-only. Everyone else
  // (CRA, PI) is redirected — coding is not part of their workflow.
  const canView = activeRole === "DM" || activeRole === "Admin" || activeRole === "CRC" || activeRole === "Sponsor";
  const canCode = activeRole === "DM" || activeRole === "Admin";
  useEffect(() => { if (ready && !canView) router.replace(`/study/${studyId}`); }, [ready, canView, router, studyId]);

  if (!ready) return <div className="cod-screen"><div className="cod-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!canView) return <div className="cod-screen"><div className="cod-loading">Redirecting…</div></div>;

  return <CodingWorklist studyId={studyId} canCode={canCode} />;
}
