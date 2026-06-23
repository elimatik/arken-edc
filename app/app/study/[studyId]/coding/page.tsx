"use client";

// VeDDRA Coding — the DM's central dictionary-coding workstation (the write path
// for VeDDRA). DM only; all other roles redirect to the dashboard.
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

  const allowed = activeRole === "DM";
  useEffect(() => { if (ready && !allowed) router.replace(`/study/${studyId}`); }, [ready, allowed, router, studyId]);

  if (!ready) return <div className="cod-screen"><div className="cod-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="cod-screen"><div className="cod-loading">Redirecting…</div></div>;

  return <CodingWorklist studyId={studyId} />;
}
