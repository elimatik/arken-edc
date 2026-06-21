"use client";

import { useParams, useSearchParams } from "next/navigation";
import { SubjectRecord } from "@/components/subject-record/SubjectRecord";

// Subject Record — the subject-level entry point. Forms live inside it.
// ?form=<formId>&field=<fieldId> deep-links from the Queries screen (selects the
// form and opens that field's query / edit-check panel).
export default function SubjectRecordPage() {
  const params = useParams();
  const sp = useSearchParams();
  return (
    <SubjectRecord
      studyId={String(params.studyId)}
      subjectId={String(params.subjectId)}
      initialFormId={sp.get("form") ?? undefined}
      initialPanelFieldId={sp.get("field") ?? undefined}
      initialSdv={sp.get("sdv") === "true"}
    />
  );
}
