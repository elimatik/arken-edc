"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { BatchEntryGrid } from "@/components/batch-entry/BatchEntryGrid";

export default function BatchEntryPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const sp = useSearchParams();
  const formId = sp.get("form") ?? "";
  const loc = sp.get("loc") ?? undefined;
  const from = sp.get("from") ?? "animals";
  const { ready } = useStudySession();

  if (!ready) {
    return (
      <div className="be-grid-screen">
        <div className="be-grid-empty"><i className="ti ti-loader-2"></i> Loading…</div>
      </div>
    );
  }
  return <BatchEntryGrid studyId={studyId} formId={formId} loc={loc} from={from} />;
}
