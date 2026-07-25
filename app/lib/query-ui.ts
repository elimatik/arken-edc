// ════════════════════════════════════════════════════════════════════════════
// Shared query-panel UI wording. Used by the Subject Record, Scoped-form grid,
// and the Queries page so the compose-context text + the status-desc beside a
// query-status badge stay identical everywhere (no duplicated logic).
// ════════════════════════════════════════════════════════════════════════════

// Human-readable description shown directly beside a query-status badge.
export const queryStatusDesc = (status: string): string =>
  status === "open" ? "Awaiting site response"
  : status === "responded" ? "Awaiting CRA review"
  : status === "resolved" ? "Closed"
  : status === "closed" ? "Closed"
  : "";

// Compose-context copy (rendered without an icon).
export const RAISE_QUERY_CONTEXT = "Raise a query by selecting a query template or entering your own.";

// Open-query compose-context — role-dependent on resolve permission (pass the
// permission flags, never role names).
export const openQueryContext = (canRespond: boolean, canResolve: boolean): string =>
  canRespond && canResolve ? "Provide a response or resolve the query." : "Provide a response to the query.";
