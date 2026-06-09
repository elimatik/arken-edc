"use client";

import { useParams } from "next/navigation";
import { SubjectRecord } from "@/components/subject-record/SubjectRecord";

// Subject Record — the subject-level entry point. Forms live inside it.
export default function SubjectRecordPage() {
  const params = useParams();
  return (
    <SubjectRecord
      studyId={String(params.studyId)}
      subjectId={String(params.subjectId)}
    />
  );
}
