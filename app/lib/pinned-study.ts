// ════════════════════════════════════════════════════════════════════════════
// Pinned study — a single, session-scoped "pinned/active" study id, shared by
// the study-list table and the topbar dropdown. Stored directly in
// sessionStorage so it survives navigation within the tab (resets on tab close).
// The user pins/unpins explicitly via the pin icon; there is no implicit default.
// ════════════════════════════════════════════════════════════════════════════

const PIN_KEY = "arken_pinned_study_v1";

export function getPinnedStudy(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

export function setPinnedStudy(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(PIN_KEY, id);
    else sessionStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore quota / unavailable storage */
  }
}
