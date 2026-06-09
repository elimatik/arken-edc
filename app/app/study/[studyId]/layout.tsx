import { StudyShell } from "@/components/shell/StudyShell";

// Thin wrapper — the shell + its data now come from the session store
// (StudyShell, client-side), not a Supabase fetch here.
export default function StudyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { studyId: string };
}) {
  return <StudyShell studyId={params.studyId}>{children}</StudyShell>;
}
