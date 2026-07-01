// ════════════════════════════════════════════════════════════════════════════
// Users module seed — study team accounts. Standalone module-level data (NOT part
// of the session-store dataset), so no DATA_KEY bump. Mutations (invite → pending
// user) live in component state. Names mirror the study staff already used in the
// seed's form instances; site assignment resolves against the study's real sites.
// ════════════════════════════════════════════════════════════════════════════
import type { Role } from "@/lib/permissions";

export type UserStatus = "active" | "inactive" | "pending" | "locked";
export type TrainingState = "trained" | "needs_update" | "not_trained" | "na";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role; // role in this study
  siteCodes: string[]; // [] = all sites
  status: UserStatus;
  online: boolean;
  training: TrainingState;
  trainingVersion?: string;
  lastLogin: string; // display string (UTC)
}

// Seed (BR-2502 study team) — 6 staff already referenced elsewhere in the app,
// plus one Pending and one Inactive account.
const USERS: AppUser[] = [
  { id: "u-tron", name: "Elisa Tron", email: "e.tron@arken.io", role: "Admin", siteCodes: [], status: "active", online: true, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-07-01 08:12 UTC" },
  { id: "u-hayes", name: "Dr. M. Hayes", email: "m.hayes@csu.edu", role: "PI", siteCodes: ["CO"], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-30 16:40 UTC" },
  { id: "u-okafor", name: "M. Okafor", email: "m.okafor@arken.io", role: "CRC", siteCodes: ["TX"], status: "active", online: false, training: "needs_update", lastLogin: "2026-06-29 11:05 UTC" },
  { id: "u-chen", name: "Dr. L. Chen", email: "l.chen@arken.io", role: "DM", siteCodes: [], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-30 09:22 UTC" },
  { id: "u-reyes", name: "Sofia Reyes", email: "s.reyes@arken.io", role: "CRC", siteCodes: ["KS"], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-28 14:30 UTC" },
  { id: "u-nguyen", name: "Anh Nguyen", email: "a.nguyen@arken.io", role: "CRC", siteCodes: ["CO"], status: "active", online: true, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-07-01 07:55 UTC" },
  { id: "u-bell", name: "James Bell", email: "j.bell@arken.io", role: "CRC", siteCodes: ["KS"], status: "pending", online: false, training: "not_trained", lastLogin: "—" },
  { id: "u-werner", name: "Paul Werner", email: "p.werner@arken.io", role: "CRC", siteCodes: ["NE"], status: "inactive", online: false, training: "na", lastLogin: "2026-05-10 10:00 UTC" },
];

// studyCode is accepted for forward compat (per-study team seeds); the current
// seed is the shared BR-2502 team.
export function usersForStudy(studyCode?: string): AppUser[] {
  void studyCode;
  return USERS.map((u) => ({ ...u }));
}

// Deterministic avatar colour from the user's name.
const AVATAR_COLORS = ["--blue-600", "--purple-600", "--green-600", "--amber-700", "--slate-600", "--red-600"];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(${AVATAR_COLORS[h % AVATAR_COLORS.length]})`;
}
export function initials(name: string): string {
  const parts = name.replace(/^(Dr\.|Mr\.|Ms\.)\s*/i, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
