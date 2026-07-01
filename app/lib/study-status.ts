// ════════════════════════════════════════════════════════════════════════════
// Study status lifecycle — the foundational gate Settings sections reference.
// A study moves setup → active → enrollment_closed → closing → locked → archived;
// STATUS_LOCKS defines which Settings sections stay editable at each status.
// Seed status is per study code (no `status` lifecycle column in the seed yet);
// the Settings demo toggle overrides it in component state (resets on reload).
// ════════════════════════════════════════════════════════════════════════════

export type StudyStatus = "setup" | "active" | "enrollment_closed" | "closing" | "locked" | "archived";

export const STATUS_ORDER: StudyStatus[] = ["setup", "active", "enrollment_closed", "closing", "locked", "archived"];

// Settings nav section keys (must match NAV_GROUPS keys in the Settings page).
export const SETTINGS_SECTIONS = ["study", "preferences", "roles", "formperm", "randomization", "inventory", "audit", "billing"] as const;

// Display metadata for the status badge.
export const STATUS_META: Record<StudyStatus, { label: string; badge: string; icon?: string }> = {
  setup: { label: "Setup", badge: "set-badge-slate" },
  active: { label: "Active", badge: "set-badge-green" },
  enrollment_closed: { label: "Enrollment closed", badge: "set-badge-blue" },
  closing: { label: "Closing", badge: "set-badge-amber" },
  locked: { label: "Locked", badge: "set-badge-red", icon: "lock" },
  archived: { label: "Archived", badge: "set-badge-slate", icon: "archive" },
};

// Which sections are READ-ONLY at each status: "none" = all editable, "all" = all
// locked, or an explicit list of locked section keys.
export const STATUS_LOCKS: Record<StudyStatus, "none" | "all" | string[]> = {
  setup: "none", // fully configurable
  active: "none", // fully editable (randomization's first-enrollment lock is separate)
  enrollment_closed: ["randomization", "study"], // no new randomization / structure changes
  closing: SETTINGS_SECTIONS.filter((s) => s !== "audit" && s !== "billing"), // only audit + billing
  locked: "all", // database locked — read-only (audit still viewable)
  archived: "all", // study complete — read-only everywhere
};

// Seed current status per study.
const STUDY_STATUS: Record<string, StudyStatus> = {
  "BR-2502": "active",
  "CA-0801": "active",
  "PH-2401": "active",
};

export function getStudyStatus(studyCode: string): StudyStatus {
  return STUDY_STATUS[studyCode] ?? "active";
}

// Is a given Settings section editable at the given status?
export function isSectionEditable(status: StudyStatus, section: string): boolean {
  const locks = STATUS_LOCKS[status];
  if (locks === "none") return true;
  if (locks === "all") return false;
  return !locks.includes(section);
}
