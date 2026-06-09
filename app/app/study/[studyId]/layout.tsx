import { notFound } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DEMO_USER_ID } from "@/lib/constants";
import { AppShell } from "@/components/shell/AppShell";
import type { Role } from "@/lib/permissions";

export default async function StudyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { studyId: string };
}) {
  const { studyId } = params;

  const { data: study } = await supabase
    .from("studies")
    .select("id, code, name")
    .eq("id", studyId)
    .maybeSingle();

  if (!study) notFound();

  const { data: sites } = await supabase
    .from("sites")
    .select("id, code, name")
    .eq("study_id", studyId)
    .order("code");

  const { data: membership } = await supabase
    .from("study_memberships")
    .select("role")
    .eq("study_id", studyId)
    .eq("user_id", DEMO_USER_ID)
    .maybeSingle();

  const initialRole = (membership?.role as Role) ?? "CRC";

  return (
    <AppShell study={study} sites={sites ?? []} initialRole={initialRole}>
      {children}
    </AppShell>
  );
}
