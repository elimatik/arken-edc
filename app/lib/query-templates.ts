// ════════════════════════════════════════════════════════════════════════════
// Predefined query templates — the standard query text a CRA/DM can pick when
// raising a manual query. Single source of truth shared by Settings → Study
// preferences (where they're displayed/edited) and every raise-query flow (the
// Queries module modal + the Subject Record field panel). Module-level constant,
// so no DATA_KEY / session involvement.
// ════════════════════════════════════════════════════════════════════════════

export const QUERY_TEMPLATES: string[] = [
  "Please clarify this value — it appears inconsistent with other records for this subject.",
  "This value is outside the protocol-defined range. Please confirm or correct.",
  "Missing data: this field is required for this visit. Please complete.",
  "Please confirm the date — it appears to conflict with the visit schedule.",
  "Adverse event severity does not match the narrative description. Please reconcile.",
];
