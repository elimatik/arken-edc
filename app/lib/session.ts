// ════════════════════════════════════════════════════════════════════════════
// Demo session — backs the topbar role switcher.
// One session per browser, identified by a token in localStorage. The active
// role is persisted to demo_sessions.active_role in Supabase so it survives
// reloads (and study changes). Client-side only.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase";
import { DEMO_USER_ID } from "./constants";
import type { Role } from "./permissions";

const TOKEN_KEY = "arken_session_token";

export interface DemoSession {
  session_token: string;
  active_role: Role;
  active_study_id: string | null;
}

// Find the existing session (and point it at the current study), or create one.
export async function getOrCreateSession(
  studyId: string,
  defaultRole: Role,
): Promise<DemoSession> {
  const existingToken =
    typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;

  if (existingToken) {
    const { data } = await supabase
      .from("demo_sessions")
      .select("session_token, active_role, active_study_id")
      .eq("session_token", existingToken)
      .maybeSingle();

    if (data) {
      await supabase
        .from("demo_sessions")
        .update({ active_study_id: studyId, last_active_at: new Date().toISOString() })
        .eq("session_token", existingToken);
      return { ...data, active_study_id: studyId } as DemoSession;
    }
  }

  // No valid session — create a fresh one seeded with the study's default role.
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .from("demo_sessions")
    .insert({
      session_token: token,
      user_id: DEMO_USER_ID,
      active_role: defaultRole,
      active_study_id: studyId,
    })
    .select("session_token, active_role, active_study_id")
    .single();

  if (!error && typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }

  return (
    (data as DemoSession) ?? {
      session_token: token,
      active_role: defaultRole,
      active_study_id: studyId,
    }
  );
}

// Persist a role switch.
export async function persistActiveRole(token: string, role: Role): Promise<void> {
  await supabase
    .from("demo_sessions")
    .update({ active_role: role, last_active_at: new Date().toISOString() })
    .eq("session_token", token);
}
