"use client";

import { useParams } from "next/navigation";
import { SubjectRecord } from "@/components/subject-record/SubjectRecord";

// The form route opens the Subject Record with that form pre-selected — forms
// live inside the subject record, not as a standalone screen.
export default function SubjectRecordFormPage() {
  const params = useParams();
  return (
    <SubjectRecord
      studyId={String(params.studyId)}
      subjectId={String(params.subjectId)}
      initialFormId={String(params.formId)}
    />
  );
}
