// Audit & Signatures preferences that need to be read outside the Settings page
// (the Subject Record's reason-for-change behaviour). Session-scoped, per tab —
// mirrors the DATA_KEY sessionStorage convention (resets on tab close).
const REASON_ALL_EDITS_KEY = "arken_audit_reason_all_edits";

// "Require reason for change on all field edits" — ON forces a reason panel that
// blocks navigation; OFF auto-logs the change without a reason. Default OFF.
export function getReasonAllEdits(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(REASON_ALL_EDITS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setReasonAllEditsPref(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REASON_ALL_EDITS_KEY, value ? "1" : "0");
  } catch {
    /* ignore quota errors */
  }
}
