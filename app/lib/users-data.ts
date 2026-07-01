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
  // ── detail fields ──
  phone?: string;
  organization?: string;
  addedDate?: string;
  twoFactor?: boolean;
  ip?: string;
  trainingDate?: string;
  trainedBy?: string;
  gcpExpiry?: string; // e.g. "2027-03"
  delegationSigned?: boolean;
  delegatedTasks?: string[];
  signedSites?: string[]; // site codes where the delegation log is PI-signed
  studies?: string[]; // assigned study codes (for the Study & site access tab)
}

// Seed (BR-2502 study team) — 6 staff already referenced elsewhere in the app,
// plus one Pending and one Inactive account.
const BR_USERS: AppUser[] = [
  { id: "u-nguyen", name: "Anh Nguyen", email: "a.nguyen@feedlotco.com", role: "CRC", siteCodes: ["CO", "KS"], status: "active", online: true, training: "trained", trainingVersion: "v1.0", lastLogin: "Today, 13:55 UTC",
    phone: "+1 (303) 555-0142", organization: "Feedlot CO LLC", addedDate: "2026-03-15", twoFactor: true, ip: "203.0.113.47", trainingDate: "2026-03-14", trainedBy: "Dr. L. Chen, PhD", gcpExpiry: "2027-03", delegationSigned: true, delegatedTasks: ["Data entry", "Query response", "SDV"], signedSites: ["CO"], studies: ["BR-2502", "CA-0801"] },
  { id: "u-hayes", name: "Dr. M. Hayes, DVM", email: "m.hayes@feedlotco.com", role: "PI", siteCodes: ["CO"], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "Yesterday, 09:14 UTC",
    phone: "+1 (303) 555-0110", organization: "Feedlot CO LLC", addedDate: "2026-03-01", twoFactor: true, ip: "203.0.113.12", trainingDate: "2026-03-01", trainedBy: "Dr. L. Chen, PhD", gcpExpiry: "2027-05", delegationSigned: true, delegatedTasks: ["Signature authority", "Query response"], signedSites: ["CO"], studies: ["BR-2502"] },
  { id: "u-okafor", name: "M. Okafor", email: "m.okafor@feedlotne.com", role: "CRC", siteCodes: ["NE"], status: "active", online: false, training: "needs_update", lastLogin: "3 days ago",
    phone: "+1 (308) 555-0187", organization: "Feedlot NE Inc.", addedDate: "2026-03-20", twoFactor: false, ip: "198.51.100.9", trainingDate: "2026-03-19", trainedBy: "Dr. L. Chen, PhD", gcpExpiry: "2026-09", delegationSigned: true, delegatedTasks: ["Data entry"], signedSites: ["NE"], studies: ["BR-2502"] },
  { id: "u-chen", name: "Dr. L. Chen, PhD", email: "l.chen@biovet.com", role: "DM", siteCodes: [], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-28",
    phone: "+1 (415) 555-0100", organization: "BioVet Pharma Inc.", addedDate: "2026-02-15", twoFactor: true, ip: "192.0.2.44", trainingDate: "2026-02-15", trainedBy: "Sponsor QA", gcpExpiry: "2028-01", delegationSigned: true, delegatedTasks: ["Data management", "Query management", "Lock"], signedSites: [], studies: ["BR-2502", "CA-0801", "PH-2401"] },
  { id: "u-reyes", name: "Sofia Reyes", email: "s.reyes@cro-monitor.com", role: "CRA", siteCodes: ["CO", "KS", "NE"], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-25",
    phone: "+1 (512) 555-0166", organization: "CRO Monitor Group", addedDate: "2026-03-05", twoFactor: true, ip: "203.0.113.88", trainingDate: "2026-03-04", trainedBy: "Dr. L. Chen, PhD", gcpExpiry: "2027-07", delegationSigned: true, delegatedTasks: ["SDV", "Query"], signedSites: ["CO", "KS", "NE"], studies: ["BR-2502"] },
  { id: "u-etron", name: "Elisa Tron", email: "elisa@arken.com", role: "Admin", siteCodes: [], status: "active", online: true, training: "trained", trainingVersion: "v1.0", lastLogin: "Today, 14:32 UTC",
    phone: "+1 (628) 555-0000", organization: "Arken EDC", addedDate: "2026-01-01", twoFactor: true, ip: "203.0.113.1", trainingDate: "2026-01-01", trainedBy: "System", gcpExpiry: "2028-06", delegationSigned: true, delegatedTasks: ["System administration"], signedSites: [], studies: ["BR-2502", "CA-0801", "PH-2401"] },
  { id: "u-bell", name: "James Bell", email: "j.bell@feedlotks.com", role: "CRC", siteCodes: ["KS"], status: "pending", online: false, training: "not_trained", lastLogin: "Never",
    phone: "—", organization: "Feedlot KS Co.", addedDate: "2026-06-28", twoFactor: false, ip: "—", delegationSigned: false, delegatedTasks: [], signedSites: [], studies: ["BR-2502"] },
  { id: "u-werner", name: "Paul Werner", email: "p.werner@feedlotne.com", role: "CRC", siteCodes: ["NE"], status: "inactive", online: false, training: "na", lastLogin: "2026-05-12",
    phone: "+1 (308) 555-0044", organization: "Feedlot NE Inc.", addedDate: "2026-03-18", twoFactor: false, ip: "198.51.100.21", trainingDate: "2026-03-17", trainedBy: "Dr. L. Chen, PhD", gcpExpiry: "2026-08", delegationSigned: false, delegatedTasks: [], signedSites: [], studies: ["BR-2502"] },
];

// Smaller realistic teams for CA-0801 / PH-2401 (enough to show the module works
// across studies without replicating the full BR team).
const CA_USERS: AppUser[] = [
  { id: "u-etron", name: "Elisa Tron", email: "elisa@arken.com", role: "Admin", siteCodes: [], status: "active", online: true, training: "trained", trainingVersion: "v2.1", lastLogin: "Today, 14:32 UTC", organization: "Arken EDC", addedDate: "2026-01-01", twoFactor: true, ip: "203.0.113.1", delegatedTasks: ["System administration"], signedSites: [], studies: ["CA-0801"] },
  { id: "u-chen", name: "Dr. L. Chen, PhD", email: "l.chen@biovet.com", role: "DM", siteCodes: [], status: "active", online: false, training: "trained", trainingVersion: "v2.1", lastLogin: "2026-06-28", organization: "DermAlliv Therapeutics", addedDate: "2026-01-05", twoFactor: true, ip: "192.0.2.44", delegatedTasks: ["Data management"], signedSites: [], studies: ["CA-0801"] },
  { id: "u-kim", name: "Dr. S. Kim, DVM", email: "s.kim@ucdavis.edu", role: "PI", siteCodes: ["101"], status: "active", online: false, training: "trained", trainingVersion: "v2.1", lastLogin: "Yesterday, 11:20 UTC", organization: "UC Davis Dermatology", addedDate: "2026-01-10", twoFactor: true, ip: "169.237.0.5", delegatedTasks: ["Signature authority"], signedSites: ["101"], studies: ["CA-0801"] },
  { id: "u-nguyen", name: "Anh Nguyen", email: "a.nguyen@feedlotco.com", role: "CRC", siteCodes: ["101"], status: "active", online: true, training: "trained", trainingVersion: "v2.1", lastLogin: "Today, 13:55 UTC", organization: "UC Davis Dermatology", addedDate: "2026-01-20", twoFactor: true, ip: "203.0.113.47", delegatedTasks: ["Data entry", "Query response"], signedSites: ["101"], studies: ["BR-2502", "CA-0801"] },
];

const PH_USERS: AppUser[] = [
  { id: "u-etron", name: "Elisa Tron", email: "elisa@arken.com", role: "Admin", siteCodes: [], status: "active", online: true, training: "trained", trainingVersion: "v1.0", lastLogin: "Today, 14:32 UTC", organization: "Arken EDC", addedDate: "2026-04-01", twoFactor: true, ip: "203.0.113.1", delegatedTasks: ["System administration"], signedSites: [], studies: ["PH-2401"] },
  { id: "u-chen", name: "Dr. L. Chen, PhD", email: "l.chen@biovet.com", role: "DM", siteCodes: [], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-28", organization: "PhytoVet Nutrition", addedDate: "2026-04-01", twoFactor: true, ip: "192.0.2.44", delegatedTasks: ["Data management"], signedSites: [], studies: ["PH-2401"] },
  { id: "u-mwangi", name: "S. Mwangi", email: "s.mwangi@purdue.edu", role: "CRC", siteCodes: ["RUA"], status: "active", online: false, training: "trained", trainingVersion: "v1.0", lastLogin: "2026-06-30 10:12 UTC", organization: "Purdue Poultry Unit", addedDate: "2026-04-05", twoFactor: false, ip: "128.210.0.7", delegatedTasks: ["Data entry"], signedSites: ["RUA"], studies: ["PH-2401"] },
];

export function usersForStudy(studyCode?: string): AppUser[] {
  const list = studyCode === "CA-0801" ? CA_USERS : studyCode === "PH-2401" ? PH_USERS : BR_USERS;
  return list.map((u) => ({ ...u }));
}
export function findUser(studyCode: string, userId: string): AppUser | undefined {
  return usersForStudy(studyCode).find((u) => u.id === userId);
}

// ── Activity log seed (module-level; realistic, spans BR-2502 + CA-0801) ──
export interface ActivityEntry { ts: string; action: string; kind: "form" | "query" | "login" | "settings" | "sdv" | "inv"; module: string; record: string; study: string; ip: string }
const ACTIVITY: ActivityEntry[] = [
  { ts: "2026-06-30 13:55:02", action: "Login", kind: "login", module: "Auth", record: "—", study: "BR-2502", ip: "203.0.113.47" },
  { ts: "2026-06-30 13:57:18", action: "Field saved", kind: "form", module: "Data entry", record: "BR-2502-CO-001 · Visit Day 3 · Heart rate", study: "BR-2502", ip: "203.0.113.47" },
  { ts: "2026-06-30 14:02:44", action: "Form submitted", kind: "form", module: "Data entry", record: "BR-2502-CO-001 · Vital Signs", study: "BR-2502", ip: "203.0.113.47" },
  { ts: "2026-06-30 14:08:11", action: "Query response", kind: "query", module: "Queries", record: "QRY-0042 · BR-2502-CO-002", study: "BR-2502", ip: "203.0.113.47" },
  { ts: "2026-06-30 14:15:33", action: "Field edited", kind: "form", module: "Data entry", record: "BR-2502-CO-003 · DART Score", study: "BR-2502", ip: "203.0.113.47" },
  { ts: "2026-06-30 14:22:09", action: "SDV verified", kind: "sdv", module: "SDV", record: "BR-2502-CO-001 · Visit Day 0", study: "BR-2502", ip: "203.0.113.47" },
  { ts: "2026-06-29 09:31:55", action: "Login", kind: "login", module: "Auth", record: "—", study: "CA-0801", ip: "203.0.113.47" },
  { ts: "2026-06-29 09:35:12", action: "Field saved", kind: "form", module: "Data entry", record: "CA-0801-101-01 · Baseline CADESI-04", study: "CA-0801", ip: "203.0.113.47" },
  { ts: "2026-06-28 16:04:22", action: "Kit dispensed", kind: "inv", module: "Inventory", record: "CA-0801-101-01 · Kit A-001-V2", study: "CA-0801", ip: "203.0.113.47" },
];
export function userActivity(_userId: string): ActivityEntry[] { void _userId; return ACTIVITY.map((a) => ({ ...a })); }

// Deterministic avatar colour from the user's name.
const AVATAR_COLORS = ["--blue-600", "--purple-600", "--green-600", "--amber-700", "--slate-600", "--red-600"];
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `var(${AVATAR_COLORS[h % AVATAR_COLORS.length]})`;
}
export function initials(name: string): string {
  const parts = name.replace(/^(Dr\.|Mr\.|Ms\.)\s*/i, "").replace(/,.*$/, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}
