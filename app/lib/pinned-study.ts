// ════════════════════════════════════════════════════════════════════════════
// Pinned studies — a session-scoped SET of pinned/active study ids, shared by the
// study-list table and the topbar dropdown. Stored as a JSON array directly in
// sessionStorage so it survives navigation within the tab (resets on tab close).
// The user pins/unpins each study explicitly via its pin icon; multiple studies
// can be pinned at once. No implicit default.
// ════════════════════════════════════════════════════════════════════════════

const KEY = "arken_pinned_studies_v1";

export function getPinnedStudies(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function setPinnedStudies(ids: string[]): void {
  try {
    if (ids.length) sessionStorage.setItem(KEY, JSON.stringify(ids));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore quota / unavailable storage */
  }
}

// Toggle one study's pinned state; returns the new pinned-id array.
export function togglePinnedStudy(id: string): string[] {
  const cur = getPinnedStudies();
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
  setPinnedStudies(next);
  return next;
}
