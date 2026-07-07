"use client";

// ════════════════════════════════════════════════════════════════════════════
// Audit Trail — the study-wide 21 CFR Part 11 event log. Read-only. Every event
// is DERIVED from the session store (data entry, change reasons, queries, edit
// checks, SDV, form status, enrolment/withdrawal, login) — so the trail reflects
// the exact same data every other screen reads. Translated from
// 11-audit-trail-full.html, extended per spec (more columns, slide-in detail,
// role-scoped visibility, CFR badge + banner). Sortable headers use the shared
// `useTableSort` / `<SortTh>` standard; the detail panel reuses subject-record.css.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { downloadCsv } from "@/lib/reports-data";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { Dataset } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./audit-trail.css";

// ─── Action types + metadata ────────────────────────────────────────────────
type AuditType =
  | "data_entry" | "change_reason" | "change_reason_approved" | "edit_check" | "edit_check_resolved"
  | "query_raised" | "query_responded" | "query_resolved" | "form_signed"
  | "sdv" | "form_submitted" | "form_locked" | "form_reverted" | "submission_withdrawn"
  | "unlock_requested" | "form_unlocked" | "unlock_denied" | "sdv_revoked" | "field_notdone" | "visit_rescheduled"
  | "randomization" | "consent" | "protocol_deviation"
  | "subject_enrolled" | "subject_withdrawn" | "unblinding" | "database_lock" | "database_unlock" | "drug_supply" | "login";
type FilterCat = "data_entry" | "query" | "sdv" | "status_change" | "form_lock" | "randomization" | "consent" | "deviation" | "unblinding" | "database_lock" | "drug_supply" | "login";

const TYPE_META: Record<AuditType, { label: string; cls: string; icon: string; cat: FilterCat }> = {
  data_entry:        { label: "Data Entry",         cls: "at-entry",     icon: "pencil",          cat: "data_entry" },
  change_reason:     { label: "Change Reason",      cls: "at-change",    icon: "history",         cat: "data_entry" },
  change_reason_approved: { label: "Change Approved", cls: "at-change",  icon: "check",           cat: "data_entry" },
  form_signed:       { label: "Form Signed",        cls: "at-signed",    icon: "writing-sign",    cat: "status_change" },
  edit_check:        { label: "Edit Check",         cls: "at-check",     icon: "alert-triangle",  cat: "data_entry" },
  edit_check_resolved: { label: "Edit Check Resolved", cls: "at-check",   icon: "checks",          cat: "data_entry" },
  query_raised:      { label: "Query Raised",       cls: "at-query",     icon: "flag",            cat: "query" },
  query_responded:   { label: "Query Responded",    cls: "at-qresp",     icon: "message",         cat: "query" },
  query_resolved:    { label: "Query Resolved",     cls: "at-qres",      icon: "flag-check",      cat: "query" },
  sdv:               { label: "SDV Verified",       cls: "at-sdv",       icon: "circle-check",    cat: "sdv" },
  form_submitted:    { label: "Form Submitted",     cls: "at-submit",    icon: "send",            cat: "status_change" },
  form_reverted:     { label: "Form Reverted",       cls: "at-submit",    icon: "arrow-back-up",   cat: "status_change" },
  submission_withdrawn: { label: "Submission Withdrawn", cls: "at-withdraw", icon: "arrow-back-up", cat: "status_change" },
  unlock_requested:  { label: "Unlock Requested",     cls: "at-lock",      icon: "lock-open",       cat: "form_lock" },
  form_unlocked:     { label: "Form Unlocked",        cls: "at-lock",      icon: "lock-open",       cat: "form_lock" },
  unlock_denied:     { label: "Unlock Denied",        cls: "at-lock",      icon: "lock",            cat: "form_lock" },
  sdv_revoked:       { label: "SDV Revoked",          cls: "at-sdv",       icon: "shield-x",        cat: "sdv" },
  field_notdone:     { label: "Field Not Done",       cls: "at-entry",     icon: "square-off",      cat: "data_entry" },
  visit_rescheduled: { label: "Visit Rescheduled",    cls: "at-submit",    icon: "calendar-event",  cat: "status_change" },
  form_locked:       { label: "Form Locked",        cls: "at-lock",      icon: "lock",            cat: "form_lock" },
  randomization:     { label: "Randomization",      cls: "at-rand",      icon: "arrows-shuffle",  cat: "randomization" },
  consent:           { label: "Consent Obtained",   cls: "at-consent",   icon: "file-check",      cat: "consent" },
  protocol_deviation:{ label: "Protocol Deviation", cls: "at-deviation", icon: "alert-triangle",  cat: "deviation" },
  subject_enrolled:  { label: "Subject Enrolled",   cls: "at-enroll",    icon: "user-plus",       cat: "status_change" },
  subject_withdrawn: { label: "Subject Withdrawn",  cls: "at-withdraw",  icon: "user-minus",      cat: "status_change" },
  unblinding:        { label: "Emergency Unblinding",cls: "at-unblind",  icon: "eye-exclamation", cat: "unblinding" },
  database_lock:     { label: "Database Lock",       cls: "at-dblock",    icon: "lock",            cat: "database_lock" },
  database_unlock:   { label: "Database Unlock",     cls: "at-dunlock",   icon: "lock-open",       cat: "database_lock" },
  drug_supply:       { label: "Drug Dispensed",      cls: "at-supply",    icon: "flask",           cat: "drug_supply" },
  login:             { label: "Login",              cls: "at-login",     icon: "login",           cat: "login" },
};

// ─── Preset tabs — coarse groupings over action types, deep-linkable via ?cat= ──
type PresetKey = "clinical" | "query" | "system";
const PRESETS: Record<PresetKey, Set<AuditType>> = {
  clinical: new Set<AuditType>(["data_entry", "change_reason", "edit_check", "edit_check_resolved", "field_notdone", "sdv", "sdv_revoked", "form_submitted", "form_locked", "form_reverted", "submission_withdrawn", "unlock_requested", "form_unlocked", "unlock_denied", "form_signed"]),
  query: new Set<AuditType>(["query_raised", "query_responded", "query_resolved"]),
  system: new Set<AuditType>(["login", "database_lock", "database_unlock", "drug_supply", "unblinding", "randomization", "consent", "protocol_deviation", "subject_enrolled", "subject_withdrawn", "visit_rescheduled"]),
};
const PRESET_TABS: { key: PresetKey; label: string }[] = [
  { key: "clinical", label: "Clinical Data" },
  { key: "query", label: "Query Workflow" },
  { key: "system", label: "System & Security" },
];

// Per-tab action-filter options (secondary filter within a preset tab). Each value
// maps to a Set of AuditTypes; "all" is the tab's full preset set.
const FILTER_OPTIONS: Record<PresetKey, { value: string; label: string }[]> = {
  clinical: [
    { value: "all", label: "All actions" },
    { value: "data_entry", label: "Data entry" },
    { value: "change_reason", label: "Change reason" },
    { value: "edit_check", label: "Edit check" },
    { value: "sdv", label: "SDV" },
    { value: "form_status", label: "Form status" },
  ],
  query: [
    { value: "all", label: "All actions" },
    { value: "query", label: "Query" },
  ],
  system: [
    { value: "all", label: "All actions" },
    { value: "subject", label: "Subject" },
    { value: "visit", label: "Visit" },
    { value: "protocol", label: "Protocol" },
    { value: "inventory", label: "Inventory" },
    { value: "unblinding", label: "Unblinding" },
    { value: "database", label: "Database" },
    { value: "security", label: "Security" },
  ],
};
const TYPE_SETS: Record<PresetKey, Map<string, Set<AuditType>>> = {
  clinical: new Map<string, Set<AuditType>>([
    ["all", PRESETS.clinical],
    ["data_entry", new Set<AuditType>(["data_entry", "field_notdone"])],
    ["change_reason", new Set<AuditType>(["change_reason", "change_reason_approved"])],
    ["edit_check", new Set<AuditType>(["edit_check", "edit_check_resolved"])],
    ["sdv", new Set<AuditType>(["sdv", "sdv_revoked"])],
    ["form_status", new Set<AuditType>(["form_submitted", "form_reverted", "submission_withdrawn", "form_locked", "unlock_requested", "form_unlocked", "unlock_denied", "form_signed"])],
  ]),
  query: new Map<string, Set<AuditType>>([
    ["all", PRESETS.query],
    ["query", new Set<AuditType>(["query_raised", "query_responded", "query_resolved"])],
  ]),
  system: new Map<string, Set<AuditType>>([
    ["all", PRESETS.system],
    ["subject", new Set<AuditType>(["subject_enrolled", "subject_withdrawn", "randomization", "consent"])],
    ["visit", new Set<AuditType>(["visit_rescheduled"])],
    ["protocol", new Set<AuditType>(["protocol_deviation"])],
    ["inventory", new Set<AuditType>(["drug_supply"])],
    ["unblinding", new Set<AuditType>(["unblinding"])],
    ["database", new Set<AuditType>(["database_lock", "database_unlock"])],
    ["security", new Set<AuditType>(["login"])],
  ]),
};

// ─── Event source — where the event originated (v1 derivation, no key bump) ──
type SourceKey = "manual" | "site" | "barn" | "batch" | "system";
const SOURCE_META: Record<SourceKey, { label: string; cls: string }> = {
  manual: { label: "Manual", cls: "src-manual" },
  site: { label: "Site form", cls: "src-site" },
  barn: { label: "House form", cls: "src-barn" },
  batch: { label: "Batch", cls: "src-batch" },
  system: { label: "System", cls: "src-system" },
};
const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "manual", label: "Manual" },
  { value: "site", label: "Site form" },
  { value: "barn", label: "House form" },
  { value: "batch", label: "Batch" },
  { value: "system", label: "System" },
];

// Derive an event's source from its existing shape (v1): System for synthetic
// login / auto-raised edit checks / calculated-or-readonlyAuto field values; Site
// or House form when it came from a real scope='site' / scope='barn' instance;
// Manual for everything else (subject-scoped direct entry — Batch is folded in
// here until field values carry a via:'batch' provenance flag, which needs a bump).
function deriveSource(e: AuditEvent, fieldById: Map<string, Dataset["formFields"][number]>): SourceKey {
  if (e.type === "login") return "system";
  if (e.type === "edit_check") return "system"; // auto-raised (onViolation auto)
  if (e.type === "data_entry" && e.fieldId) {
    const f = fieldById.get(e.fieldId);
    if (f && (f.field_type === "calculated" || f.validation?.readonlyAuto)) return "system";
  }
  if (e.formId) {
    if (e.scope === "site") return "site";
    if (e.scope === "barn") return "barn";
  }
  return "manual";
}

interface AuditUser { name: string; role: string; initials: string; auto?: boolean }
type AuditScope = "subject" | "site" | "barn";
interface AuditEvent {
  id: string;
  ts: string; // ISO
  type: AuditType;
  user: AuditUser;
  scope: AuditScope; // which level the action occurred at (drives the Subject column)
  subjectId: string | null;
  subjectCode: string; // subject ID, or the site / barn name when not subject-scoped
  siteId: string | null; // resolved site (subject's site, the site itself, or the barn's site)
  siteName: string;
  formId: string | null;
  formName: string;
  formPath: string;
  fieldId: string | null;
  fieldLabel: string;
  fieldCode: string;
  oldValue: string | null;
  newValue: string | null;
  details: string;
  reason?: string;
  queryCode?: string;
  queryId?: string; // set on query events — drives the full thread in the panel
  approvedBy?: string; // change_reason: DM approver name
  approvedRole?: string;
  approvedAt?: string; // change_reason: ISO approval time
  authorName?: string; // change_reason: who submitted the reason (for the panel chain)
  authorRole?: string;
  createdAt?: string; // change_reason: when the reason was submitted
  meaning?: string; // form_signed: the attestation text
  statusBefore?: string;
  statusAfter?: string;
  source: SourceKey; // where the event originated (derived in buildAuditEvents)
}

// Seeded cast — actions that the session store can't attribute to a real person
// are assigned to a stable demo cast by role (visitor-authored actions keep their
// real NDA name + role).
const CAST: Record<string, AuditUser> = {
  CRC_CO: { name: "E. Tron", role: "CRC", initials: "ET" },     // Feedlot CO
  CRC_KS: { name: "A. Reyes", role: "CRC", initials: "AR" },    // Feedlot KS
  CRC_TX: { name: "D. Okonkwo", role: "CRC", initials: "DO" },  // Feedlot TX
  CRC_NE: { name: "S. Kim", role: "CRC", initials: "SK" },      // Feedlot NE
  CRC: { name: "E. Tron", role: "CRC", initials: "ET" },        // default CRC (site-less events)
  CRA: { name: "J. Reyes", role: "CRA", initials: "JR" },
  DM: { name: "M. Chen", role: "DM", initials: "MC" },
  PI: { name: "Dr. S. Patel", role: "PI", initials: "SP" },
  Auto: { name: "Edit check", role: "Auto", initials: "EC", auto: true },
};
// Data-entry / submission attribution varies across a realistic multi-site team so
// a 12-subject / 4-site trail shows 6-8 distinct users rather than one. Each site
// has its own CRC — an event is attributed to the CRC of the SUBJECT's site (CO →
// E. Tron etc.); site-less events fall back to a stable hash across the four CRCs.
const SITE_CRC: Record<string, AuditUser> = { CO: CAST.CRC_CO, KS: CAST.CRC_KS, TX: CAST.CRC_TX, NE: CAST.CRC_NE };
const SITE_CRC_LIST: AuditUser[] = [CAST.CRC_CO, CAST.CRC_KS, CAST.CRC_TX, CAST.CRC_NE];
const crcFor = (siteCode: string | null | undefined, fallbackSeed: string): AuditUser =>
  (siteCode && SITE_CRC[siteCode]) ? SITE_CRC[siteCode] : SITE_CRC_LIST[hashStr(fallbackSeed) % SITE_CRC_LIST.length];
const initialsFor = (name: string) => name.replace(/^Dr\.?\s+/i, "").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const mkUser = (name: string | null | undefined, role: string | null | undefined): AuditUser => {
  const n = name ?? "Study team";
  const r = role ?? "—";
  return { name: n, role: r.replace(/ · System$/, ""), initials: initialsFor(n), auto: /auto|system/i.test(r) };
};

// Deterministic pseudo-timestamps for seeded events that carry no real time —
// stable across renders, spread across the last `days` days.
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function synthTs(seed: string, baseNow: number, days = 60): string {
  const off = hashStr(seed) % (days * 86400000);
  return new Date(baseNow - off).toISOString();
}
// 21 CFR Part 11 audit timestamps are recorded and displayed in UTC.
function fmtTs(iso: string): string {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  // Full seconds precision — required for 21 CFR Part 11 timestamps.
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}
function dateKey(iso: string): string {
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

function buildAuditEvents(dataset: Dataset, studyId: string, baseNow: number): AuditEvent[] {
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const subjById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const barnById = new Map(dataset.barns.map((b) => [b.id, b]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));

  // form_instance → study-scoped context (subject / site / form path), or null.
  const ctxOfInstance = (instanceId: string) => {
    const inst = instById.get(instanceId);
    if (!inst) return null;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId) return null;
    const subj = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
    let siteId = subj?.site_id ?? inst.site_id ?? null;
    if (!siteId && inst.barn_id) siteId = barnById.get(inst.barn_id)?.site_id ?? null;
    const siteName = siteId ? siteById.get(siteId)?.name ?? "—" : "—";
    const scope: AuditScope = subj ? "subject" : inst.site_id ? "site" : inst.barn_id ? "barn" : "subject";
    const subjectCode = subj?.subject_code ?? (inst.site_id ? siteById.get(inst.site_id)?.name : inst.barn_id ? barnById.get(inst.barn_id)?.name : null) ?? "—";
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : null;
    const formPath = parent ? `${parent.name} — ${form.name}` : form.name;
    return { scope, subjectId: subj?.id ?? null, subjectCode, siteId, siteName, formId: form.id, formName: form.name, formPath };
  };
  const fieldOfValue = (fvId: string | null) => {
    if (!fvId) return null;
    const fv = fvById.get(fvId);
    if (!fv) return null;
    const field = fieldById.get(fv.form_field_id);
    if (!field) return null;
    return { field, fv };
  };
  const fieldBits = (field?: { id: string; label: string; code: string | null }) => ({
    fieldId: field?.id ?? null, fieldLabel: field?.label ?? "", fieldCode: (field?.code ?? "").toUpperCase(),
  });

  const events: AuditEvent[] = [];
  let seq = 0;
  // `source` is derived in one pass after all events are built (see return).
  const push = (e: Omit<AuditEvent, "id" | "source">) => events.push({ id: `ae-${seq++}`, source: "manual", ...e });
  const qCode = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;
  const siteCodeOf = (siteId: string | null) => (siteId ? siteById.get(siteId)?.code ?? null : null);

  // 1 — Data entry: one event per saved field value. Attribution is the CRC of the
  // subject's SITE (fix 1). Field values documented "Not done" / "N/A" become
  // field_notdone events instead (fix 7).
  for (const fv of dataset.fieldValues) {
    const ctx = ctxOfInstance(fv.form_instance_id); if (!ctx) continue;
    const field = fieldById.get(fv.form_field_id); if (!field) continue;
    const entryUser = crcFor(siteCodeOf(ctx.siteId), fv.id);
    if (fv.notDone || fv.value === "N/A") {
      push({ ts: synthTs(`nd${fv.id}`, baseNow), type: "field_notdone", user: entryUser, ...ctx, ...fieldBits(field),
        oldValue: null, newValue: fv.notDoneReason ?? "Not done", details: `${field.label} marked as Not done${fv.notDoneReason ? ` — ${fv.notDoneReason}` : ""}` });
      continue;
    }
    if (fv.value == null || String(fv.value).trim() === "") continue;
    const unit = field.unit ? ` ${field.unit}` : "";
    push({ ts: synthTs(`fv${fv.id}`, baseNow), type: "data_entry", user: entryUser, ...ctx, ...fieldBits(field),
      oldValue: null, newValue: `${fv.value}${unit}`, details: `${field.label} recorded as ${fv.value}${unit}` });
  }

  // 2 — Change reasons (Δ records). One event per change; the DM approval is
  // surfaced inline via the "Approved by" column (approvedBy/approvedAt) and the
  // panel's edit → reason → approval chain.
  for (const d of dataset.deltaRecords) {
    const fo = fieldOfValue(d.field_value_id); if (!fo) continue;
    const ctx = ctxOfInstance(fo.fv.form_instance_id); if (!ctx) continue;
    const chain = { authorName: d.author_name, authorRole: d.author_role, createdAt: d.created_at,
      approvedBy: d.approved_by, approvedRole: d.approved_role, approvedAt: d.approved_at };
    push({ ts: d.created_at, type: "change_reason", user: mkUser(d.author_name, d.author_role), ...ctx, ...fieldBits(fo.field),
      oldValue: d.old_value, newValue: d.new_value, reason: d.reason, ...chain,
      details: `${fo.field.label} changed from ${d.old_value} to ${d.new_value}`, statusBefore: d.status });
  }

  // 2b — Form lifecycle: reverts, withdrawn submissions, and unlock request/approve/deny.
  for (const a of dataset.formAudits) {
    // field_notdone is surfaced from the field value itself (section 1) with full
    // field context — skip here to avoid a duplicate event for the same action.
    if (a.action === "field_notdone") continue;
    const ctx = ctxOfInstance(a.form_instance_id); if (!ctx) continue;
    const noField = { fieldId: null, fieldLabel: "", fieldCode: "" };
    const type: AuditType =
      a.action === "revert" ? "form_reverted"
      : a.action === "withdraw" ? "submission_withdrawn"
      : a.action === "unlock_request" ? "unlock_requested"
      : a.action === "unlock_approved" ? "form_unlocked"
      : a.action === "unlock_denied" ? "unlock_denied"
      : a.action === "sdv_revoked" ? "sdv_revoked"
      : a.action === "visit_rescheduled" ? "visit_rescheduled"
      : "field_notdone";
    const details =
      a.action === "revert" ? `${ctx.formName} reverted from ${a.from_status} to in-work`
      : a.action === "withdraw" ? `${ctx.formName} submission withdrawn — returned to in-work`
      : a.action === "unlock_request" ? `Unlock requested for ${ctx.formName}${a.reason ? ` — reason: ${a.reason}` : ""}${a.description ? ` — ${a.description}` : ""}`
      : a.action === "unlock_approved" ? `${ctx.formName} unlocked — request approved${a.reason ? ` (original reason: ${a.reason})` : ""}`
      : a.action === "unlock_denied" ? `Unlock request denied for ${ctx.formName}${a.note ? ` — ${a.note}` : ""}`
      : a.action === "sdv_revoked" ? `SDV verification revoked on ${a.reason}${a.description ? ` — ${a.description}` : ""}`
      : a.action === "visit_rescheduled" ? `${a.description || "Visit rescheduled"}${a.reason ? ` — reason: ${a.reason}` : ""}`
      : `Field "${a.reason}" marked as ${a.description || "Not done"}`;
    // Reschedules carry the old → new visit dates in the description; surface them
    // in the Old/New value columns (fix 8).
    let odVal: string | null = null, nwVal: string | null = null;
    if (a.action === "visit_rescheduled") {
      const m = /from (\S+) to (\S+)/.exec(a.description ?? "");
      if (m) { odVal = m[1]; nwVal = m[2]; }
    }
    push({ ts: a.created_at, type, user: mkUser(a.author_name, a.author_role), ...ctx, ...noField,
      oldValue: odVal, newValue: nwVal, reason: a.reason || undefined, details,
      statusBefore: a.from_status, statusAfter: a.to_status });
  }

  // 3 — Queries: raised → responded → resolved. Each event carries the actual
  // message body (details) and its message author (authorName/authorRole →
  // "Entered by"), distinct from the attributed User. For resolved queries the
  // responded step is always emitted when a distinct reply exists (previously it
  // was dropped when the reply was System-authored).
  for (const q of dataset.queries) {
    const ctx = ctxOfInstance(q.form_instance_id); if (!ctx) continue;
    const fo = fieldOfValue(q.field_value_id);
    const fb = fieldBits(fo?.field);
    const code = qCode(q.id);
    const msgs = dataset.queryMessages.filter((m) => m.query_id === q.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const first = msgs[0];
    const auto = (first?.body ?? "").startsWith("Auto edit-check:");
    const raiser = auto ? CAST.Auto : first?.author_role ? mkUser(first.author_name, first.author_role) : CAST.CRA;
    const enteredBy = (m?: typeof msgs[number], fallback?: AuditUser) => ({
      authorName: m?.author_name ?? (m && (m.author_role?.includes("System") || (m.body ?? "").startsWith("Auto edit-check:")) ? "Edit check" : fallback?.name ?? "—"),
      authorRole: m?.author_role?.replace(/ · System$/, "") ?? fallback?.role ?? "—",
    });
    push({ ts: q.created_at ?? first?.created_at ?? synthTs(`q${q.id}`, baseNow), type: "query_raised", user: raiser, ...ctx, ...fb,
      oldValue: null, newValue: null, details: first?.body ?? q.title, queryCode: code, queryId: q.id, ...enteredBy(first, raiser) });

    const resolveMsg = q.status === "resolved" ? msgs[msgs.length - 1] : undefined;
    const respMsg = msgs.find((m) => m !== first && m !== resolveMsg); // first reply that isn't the resolution
    if ((q.status === "responded" || q.status === "resolved") && respMsg) {
      push({ ts: respMsg.created_at, type: "query_responded", user: mkUser(respMsg.author_name, respMsg.author_role), ...ctx, ...fb,
        oldValue: null, newValue: null, details: respMsg.body, queryCode: code, queryId: q.id, ...enteredBy(respMsg) });
    }
    if (resolveMsg) {
      push({ ts: resolveMsg.created_at ?? synthTs(`qr${q.id}`, baseNow), type: "query_resolved", user: CAST.CRA, ...ctx, ...fb,
        oldValue: null, newValue: null, details: resolveMsg.body ?? "Query closed", queryCode: code, queryId: q.id, ...enteredBy(resolveMsg, CAST.CRA) });
    }
  }

  // 4 — Edit checks (auto-validation flags), open AND resolved. Converted checks
  // are surfaced as queries instead, so they're skipped here. A resolved check adds
  // a second event recording who corrected it and when (fix 5).
  for (const ec of dataset.editChecks) {
    if (ec.status === "converted") continue;
    const ctx = ctxOfInstance(ec.form_instance_id); if (!ctx) continue;
    const fo = fieldOfValue(ec.field_value_id);
    push({ ts: ec.created_at, type: "edit_check", user: CAST.Auto, ...ctx, ...fieldBits(fo?.field),
      oldValue: null, newValue: fo?.fv.value ?? null, details: ec.message });
    if (ec.status === "resolved") {
      const resolvedAt = new Date(new Date(ec.created_at).getTime() + (hashStr(ec.id) % 72) * 3600000).toISOString();
      push({ ts: resolvedAt, type: "edit_check_resolved", user: crcFor(siteCodeOf(ctx.siteId), ec.id), ...ctx, ...fieldBits(fo?.field),
        oldValue: null, newValue: fo?.fv.value ?? null, details: `Edit check resolved${fo?.field ? ` — ${fo.field.label} corrected` : ""}` });
    }
  }

  // 5 — SDV records: verifications AND revocations (fix 6). Seeded baseline
  // records aren't audit events.
  for (const s of dataset.sdvRecords) {
    if (s.id.startsWith("sdvseed-")) continue;
    if (s.status !== "verified" && s.status !== "revoked") continue;
    const ctx = ctxOfInstance(s.form_instance_id); if (!ctx) continue;
    const fo = fieldOfValue(s.field_value_id ?? null);
    const sdvUser = s.verified_by_name ? mkUser(s.verified_by_name, "CRA") : CAST.CRA;
    if (s.status === "revoked") {
      push({ ts: s.verified_at ?? synthTs(`sdvr${s.id}`, baseNow), type: "sdv_revoked", user: sdvUser, ...ctx, ...fieldBits(fo?.field),
        oldValue: null, newValue: null, details: `${fo?.field ? fo.field.label : "Source data"} SDV verification revoked` });
    } else {
      push({ ts: s.verified_at ?? synthTs(`sdv${s.id}`, baseNow), type: "sdv", user: sdvUser, ...ctx, ...fieldBits(fo?.field),
        oldValue: null, newValue: null, details: fo?.field ? `${fo.field.label} verified against source` : "Source data verified" });
    }
  }

  // 6 — Form status: submitted + locked, plus milestone events keyed on the form.
  const advanced = (st: string) => ["in_review", "reviewed", "finalized", "locked"].includes(st);
  const finalized = (st: string) => ["finalized", "locked"].includes(st);
  for (const inst of dataset.formInstances) {
    const ctx = ctxOfInstance(inst.id); if (!ctx) continue;
    const st = inst.status;
    const name = ctx.formName;
    const noField = { fieldId: null, fieldLabel: "", fieldCode: "" };
    if (advanced(st)) {
      push({ ts: synthTs(`sub${inst.id}`, baseNow), type: "form_submitted", user: crcFor(siteCodeOf(ctx.siteId), inst.id), ...ctx, ...noField,
        oldValue: null, newValue: null, details: `${name} submitted for review`, statusBefore: "in_work", statusAfter: st === "locked" ? "reviewed" : st });
    }
    if (st === "locked") {
      push({ ts: synthTs(`lck${inst.id}`, baseNow), type: "form_locked", user: CAST.CRA, ...ctx, ...noField,
        oldValue: null, newValue: null, details: `${name} locked after SDV and signature`, statusBefore: "reviewed", statusAfter: "locked" });
    }
    // Randomization — the randomization/allocation form finalized.
    if (/Randomization/i.test(name) && finalized(st)) {
      push({ ts: synthTs(`rand${inst.id}`, baseNow), type: "randomization", user: CAST.DM, ...ctx, ...noField,
        oldValue: null, newValue: null, details: `${ctx.subjectCode} randomized — treatment arm assigned (blinded)`, statusBefore: "Screened", statusAfter: "Randomized" });
    }
    // Consent obtained — Owner Consent form finalized (CA-0801).
    if (/Owner Consent|Informed Consent/i.test(name) && finalized(st)) {
      push({ ts: synthTs(`csnt${inst.id}`, baseNow), type: "consent", user: CAST.CRC, ...ctx, ...noField,
        oldValue: null, newValue: null, details: "Owner informed consent obtained and documented" });
    }
    // Protocol deviation — a deviation form submitted.
    if (/Protocol Deviation/i.test(name) && advanced(st)) {
      push({ ts: synthTs(`dev${inst.id}`, baseNow), type: "protocol_deviation", user: CAST.CRA, ...ctx, ...noField,
        oldValue: null, newValue: null, details: `Protocol deviation recorded on ${name}` });
    }
  }

  // 6b — Emergency unblinding (session-only log; double-blind studies).
  for (const u of dataset.unblindings ?? []) {
    const subj = subjById.get(u.subject_id);
    if (!subj || subj.study_id !== studyId) continue;
    const siteName = subj.site_id ? siteById.get(subj.site_id)?.name ?? "—" : "—";
    push({ ts: u.created_at, type: "unblinding", user: mkUser(u.author_name, u.author_role), scope: "subject",
      subjectId: subj.id, subjectCode: subj.subject_code, siteId: subj.site_id ?? null, siteName, formId: null, formName: "Subject record", formPath: "Subject record",
      fieldId: null, fieldLabel: "", fieldCode: "", oldValue: "Blinded", newValue: u.arm,
      details: `Emergency unblinding — treatment arm revealed: ${u.arm}`, reason: u.reason });
  }

  // 6c — Database Lock / Unlock (session-only log; full-study read-only lock).
  for (const l of dataset.studyLocks ?? []) {
    if (l.study_id !== studyId) continue;
    push({ ts: l.created_at, type: l.locked ? "database_lock" : "database_unlock", user: mkUser(l.authorized_by, l.author_role), scope: "site",
      subjectId: null, subjectCode: "All subjects", siteId: null, siteName: "All sites", formId: null, formName: "Study database", formPath: "Study database",
      fieldId: null, fieldLabel: "", fieldCode: "", oldValue: l.locked ? "Open" : "Locked", newValue: l.locked ? "Locked" : "Open",
      details: l.locked
        ? `Full study database locked by ${l.authorized_by} — reason: ${l.reason}`
        : `Study database unlocked by ${l.authorized_by} — reason: ${l.reason}`,
      reason: l.reason });
  }

  // 7 — Subject enrolment + withdrawal.
  for (const subj of dataset.subjects) {
    if (subj.study_id !== studyId) continue;
    const siteName = subj.site_id ? siteById.get(subj.site_id)?.name ?? "—" : "—";
    const ctx = { scope: "subject" as AuditScope, subjectId: subj.id, subjectCode: subj.subject_code, siteId: subj.site_id ?? null, siteName, formId: null, formName: "Subject record", formPath: "Subject record" };
    push({ ts: synthTs(`enr${subj.id}`, baseNow), type: "subject_enrolled", user: crcFor(siteCodeOf(subj.site_id ?? null), subj.id), ...ctx, fieldId: null, fieldLabel: "", fieldCode: "",
      oldValue: null, newValue: null, details: "Subject enrolled — screening complete, all criteria met", statusBefore: "—", statusAfter: "Screened" });
    if (subj.status === "withdrawn") {
      push({ ts: synthTs(`wd${subj.id}`, baseNow, 30), type: "subject_withdrawn", user: CAST.PI, ...ctx, fieldId: null, fieldLabel: "", fieldCode: "",
        oldValue: null, newValue: null, details: "Subject withdrawn from study — data preserved for analysis", statusBefore: "Active", statusAfter: "Withdrawn" });
    }
  }

  // 7.5 — Drug supply (Inventory module). Each vial lifecycle event + every
  // confirmed shipment is an auditable manual action. Subjects are referenced by
  // code on dispense events; sites come from the vial's siteId.
  {
    const subjByCode = new Map(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => [s.subject_code, s]));
    const invUser = mkUser("Supply Coordinator", "CRC");
    const supplyCtx = (vialSiteId: string | null, subjectCode: string | null) => {
      const subj = subjectCode ? subjByCode.get(subjectCode) : undefined;
      const siteId = subj?.site_id ?? vialSiteId ?? null;
      const siteName = siteId ? siteById.get(siteId)?.name ?? "—" : "—";
      return { scope: (subj ? "subject" : "site") as AuditScope, subjectId: subj?.id ?? null, subjectCode: subjectCode ?? "—", siteId, siteName,
        formId: null, formName: "Inventory", formPath: "Inventory", fieldId: null, fieldLabel: "", fieldCode: "", oldValue: null };
    };
    for (const v of dataset.vials.filter((x) => x.studyId === studyId)) {
      for (const e of v.events) {
        if (e.type === "received") continue; // surfaced via the shipment, not separately
        const ts = `${e.date}T09:00:00Z`;
        const u = e.by ? mkUser(e.by, "CRC") : invUser;
        if (e.type === "dispense") push({ ts, type: "drug_supply", user: u, ...supplyCtx(v.siteId, e.subject ?? null), newValue: v.id, details: `Drug dispensed — ${v.id} — ${e.subject ?? "—"} (${e.volDispensed ?? 0} ${v.unit})` });
        else if (e.type === "return") push({ ts, type: "drug_supply", user: u, ...supplyCtx(v.siteId, null), newValue: v.id, details: `Drug returned — ${v.id} — ${e.volReturned ?? 0} ${v.unit}` });
        else if (e.type === "removed") push({ ts, type: "drug_supply", user: invUser, ...supplyCtx(v.siteId, null), newValue: v.id, details: `Vial removed — ${v.id} — ${e.note ?? "removed"}` });
        else if (e.type === "returned") push({ ts, type: "drug_supply", user: invUser, ...supplyCtx(v.siteId, null), newValue: v.id, details: `Drug returned to sponsor — ${v.id}` });
      }
    }
    for (const s of dataset.shipments.filter((x) => x.studyId === studyId && x.confirmed)) {
      push({ ts: `${s.receiveDate}T08:00:00Z`, type: "drug_supply", user: invUser, ...supplyCtx(null, null), newValue: s.id, details: `Shipment confirmed — ${s.id} (${s.usableCount}/${s.vialCount} usable)` });
    }
  }

  // 7.6 — Randomization performed via the Subject Record button (session-only
  // randomized_at). The arm reveal is captured separately via the unblindings log.
  for (const s of dataset.subjects) {
    if (s.study_id !== studyId || !s.randomized_at) continue;
    const siteName = s.site_id ? siteById.get(s.site_id)?.name ?? "—" : "—";
    push({ ts: s.randomized_at, type: "randomization", user: mkUser(s.randomized_by ?? "System", "CRC"), scope: "subject", subjectId: s.id, subjectCode: s.subject_code, siteId: s.site_id ?? null, siteName,
      formId: null, formName: "Randomization", formPath: "Randomization", fieldId: null, fieldLabel: "", fieldCode: "",
      oldValue: null, newValue: s.randomization_arm, details: `Subject randomized — ${s.subject_code}`, statusBefore: "Screened", statusAfter: "Randomized" });
  }

  // 7.7 — Electronic signatures (21 CFR Part 11 §11.50) — a PI sign-off linked to a
  // finalized form instance (fix 4).
  for (const sig of dataset.eSignatures ?? []) {
    const ctx = ctxOfInstance(sig.form_instance_id); if (!ctx) continue;
    push({ ts: sig.signed_at, type: "form_signed", user: mkUser(sig.signed_by, sig.signed_by_role), ...ctx, fieldId: null, fieldLabel: "", fieldCode: "",
      oldValue: null, newValue: null, details: sig.meaning, meaning: sig.meaning });
  }

  // 8 — Login events (synthetic; surfaced to Admin only — see visibleTo). One per
  // team member, including each site CRC.
  for (const u of [CAST.CRC_CO, CAST.CRC_KS, CAST.CRC_TX, CAST.CRC_NE, CAST.CRA, CAST.DM, CAST.PI]) {
    push({ ts: synthTs(`login${u.initials}`, baseNow, 7), type: "login", user: u, scope: "subject", subjectId: null, subjectCode: "—", siteId: null, siteName: "—",
      formId: null, formName: "—", formPath: "—", fieldId: null, fieldLabel: "", fieldCode: "",
      oldValue: null, newValue: null, details: `${u.name} authenticated to the study` });
  }

  // Tag every event's source in one pass (pure derivation from existing shape).
  return events.map((e) => ({ ...e, source: deriveSource(e, fieldById) }));
}

// Role-scoped visibility. PI sees EVERY action type CRA sees (data entry, all
// query states, SDV, form submitted/locked, edit check, change reason, enrolled/
// withdrawn, consent, randomization, protocol deviation, …) — only narrowed to
// subject-level events (no site/barn/study-level rows). Login events are
// Admin-only. Emergency Unblinding rows ARE visible to every audit-trail role
// (oversight transparency) — the sensitive details are masked instead (see
// roleEvents), not the whole row. CRA/DM/Admin see everything else.
function visibleTo(e: AuditEvent, role: string): boolean {
  if (e.type === "login") return role === "Admin";
  // PI is responsible for ALL activity at their site — subject-, site-, AND
  // barn/house-level events (the demo has no PI→site assignment, so PI sees all
  // location-level entries, same as DM for site/barn scope). No action-type limit.
  if (role === "PI") return e.scope === "subject" || e.scope === "site" || e.scope === "barn";
  return true;
}

const trunc = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const QUERY_TYPES = new Set<AuditType>(["query_raised", "query_responded", "query_resolved"]);
// The Reason column shows the change reason; for query events it shows the relevant
// message text (fix 3), for form_signed the attestation.
function reasonColumn(e: AuditEvent): string | null {
  if (QUERY_TYPES.has(e.type)) return trunc(e.details, 60);
  if (e.type === "form_signed") return e.meaning ?? e.details;
  return e.reason ?? null;
}

function cmp(a: AuditEvent, b: AuditEvent, col: string): number {
  switch (col) {
    case "ts": return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    case "user": return a.user.name.localeCompare(b.user.name);
    case "role": return a.user.role.localeCompare(b.user.role);
    case "type": return TYPE_META[a.type].label.localeCompare(TYPE_META[b.type].label);
    case "subject": return a.subjectCode.localeCompare(b.subjectCode);
    case "form": return a.formName.localeCompare(b.formName);
    case "site": return a.siteName.localeCompare(b.siteName);
    case "field": return a.fieldLabel.localeCompare(b.fieldLabel);
    case "old": return (a.oldValue ?? "").localeCompare(b.oldValue ?? "");
    case "new": return (a.newValue ?? "").localeCompare(b.newValue ?? "");
    case "details":
    case "text": return a.details.localeCompare(b.details);
    case "reason": return (a.reason ?? "").localeCompare(b.reason ?? "");
    case "queryid": return (a.queryCode ?? "").localeCompare(b.queryCode ?? "");
    case "enteredby": return (a.authorName ?? "").localeCompare(b.authorName ?? "");
    case "approved": return (a.approvedAt ?? "").localeCompare(b.approvedAt ?? "");
    default: return 0;
  }
}

export default function AuditTrailPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeRole } = useShell();
  const { dataset, ready } = useStudySession();
  const study = dataset.studies.find((s) => s.id === studyId);

  const isDoubleBlind = study?.code === "CA-0801";
  const isPrivileged = activeRole === "DM" || activeRole === "Admin";

  // Treatment-arm labels for the study (subject arms + the treatment_arm field
  // options) — masked to "[Blinded]" for non-privileged viewers of a blind study.
  const armValues = useMemo(() => {
    const s = new Set<string>();
    dataset.subjects.forEach((x) => { if (x.study_id === studyId && x.randomization_arm) s.add(x.randomization_arm); });
    dataset.formFields.forEach((f) => { if (f.code === "treatment_arm" && f.options) f.options.forEach((o) => s.add(o)); });
    return Array.from(s).filter(Boolean);
  }, [dataset, studyId]);

  const [baseNow] = useState(() => Date.now()); // stable across renders
  const allEvents = useMemo(() => buildAuditEvents(dataset, studyId, baseNow), [dataset, studyId, baseNow]);
  const roleEvents = useMemo(() => {
    const visible = allEvents.filter((e) => visibleTo(e, activeRole));
    // Non-privileged viewer of a double-blind study: an Emergency Unblinding row
    // STAYS VISIBLE (oversight transparency — who/when), but its sensitive payload
    // is blinded; every other event has the treatment arm masked anywhere it leaks.
    if (!isDoubleBlind || isPrivileged) return visible;
    const maskArm = (t: string | null): string | null => {
      if (!t) return t;
      let out = t;
      for (const a of armValues) out = out.split(a).join("[Blinded]");
      return out;
    };
    return visible.map((e) => {
      if (e.type === "unblinding") {
        return { ...e, oldValue: "[Blinded]", newValue: "[Blinded]",
          details: "Treatment arm revealed — details restricted to DM/Admin",
          reason: e.reason ? "[Restricted]" : e.reason };
      }
      return { ...e, oldValue: maskArm(e.oldValue), newValue: maskArm(e.newValue), details: maskArm(e.details) ?? e.details };
    });
  }, [allEvents, activeRole, isDoubleBlind, isPrivileged, armValues]);

  const [search, setSearch] = useState("");
  const [catF, setCatF] = useState("all");
  const [preset, setPreset] = useState<PresetKey>(() => {
    const c = searchParams.get("cat");
    return c === "query" || c === "system" ? c : "clinical";
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [userF, setUserF] = useState("all");
  const [siteF, setSiteF] = useState("all"); // by site id; subject search covers subject IDs
  const [formF, setFormF] = useState("all");
  const [sourceF, setSourceF] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => dateKey(new Date(baseNow - 60 * 86400000).toISOString()));
  const [dateTo, setDateTo] = useState(() => dateKey(new Date(baseNow).toISOString()));
  const { sort, toggle } = useTableSort(null); // null → default (newest first)
  const [panelId, setPanelId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  // Filter option lists (scoped to what this role can see).
  const userNames = useMemo(() => Array.from(new Set(roleEvents.map((e) => e.user.name))).sort(), [roleEvents]);
  const siteOptions = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.name.localeCompare(b.name)), [dataset.sites, studyId]);
  const formNames = useMemo(() => Array.from(new Set(roleEvents.map((e) => e.formName).filter((f) => f !== "—"))).sort(), [roleEvents]);

  const resetFilters = () => { setSearch(""); setCatF("all"); setSourceF("all"); setUserF("all"); setSiteF("all"); setFormF("all"); };

  // Action filter — the option list and their AuditType sets are per tab.
  const filterOptions = FILTER_OPTIONS[preset];
  const activeTypeSets = TYPE_SETS[preset];

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    // The selected filter's type set (falls back to the tab's full preset set).
    const typeSet = activeTypeSets.get(catF) ?? PRESETS[preset];
    const out = roleEvents.filter((e) => {
      if (!typeSet.has(e.type)) return false;
      if (sourceF !== "all" && e.source !== sourceF) return false;
      if (userF !== "all" && e.user.name !== userF) return false;
      if (siteF !== "all" && e.siteId !== siteF) return false;
      if (formF !== "all" && e.formName !== formF) return false;
      const dk = dateKey(e.ts);
      if (dateFrom && dk < dateFrom) return false;
      if (dateTo && dk > dateTo) return false;
      if (q) {
        const hay = [e.subjectCode, e.user.name, e.fieldLabel, e.fieldCode, TYPE_META[e.type].label, e.details, e.reason ?? "", e.formName, e.oldValue ?? "", e.newValue ?? "", e.queryCode ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return out.sort((a, b) => {
      if (sort) { const r = cmp(a, b, sort.col); return sort.dir === "asc" ? r : -r; }
      return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0; // default newest first
    });
  }, [roleEvents, preset, activeTypeSets, search, catF, sourceF, userF, siteF, formF, dateFrom, dateTo, sort]);

  // Fall back to roleEvents (role-filtered + arm-masked), never allEvents, so the
  // detail panel can never surface a hidden/unmasked value. Query events never open
  // the panel — they deep-link to the Queries module (their thread lives there).
  const panelFound = panelId ? filtered.find((e) => e.id === panelId) ?? roleEvents.find((e) => e.id === panelId) ?? null : null;
  const panelEvent = panelFound && !QUERY_TYPES.has(panelFound.type) ? panelFound : null;

  function gotoRecord(e: AuditEvent) {
    if (!e.subjectId) return;
    // Navigate to the subject record in its default state only — no deep-linked
    // form/field, no auto-opened query panel. The user can find the field themselves.
    router.push(`/study/${studyId}/data-entry/${e.subjectId}`);
  }
  // Query events deep-link "into the form" where the query lives (subject record
  // opened at the form via ?form=). Non-query rows open the detail panel.
  const gotoForm = (e: AuditEvent) => { if (e.subjectId && e.formId) router.push(`/study/${studyId}/data-entry/${e.subjectId}?form=${e.formId}`); };
  const openRow = (e: AuditEvent) => { if (QUERY_TYPES.has(e.type)) gotoForm(e); else setPanelId(e.id); };

  // Preset tab → set the action grouping, reset the secondary dropdown, and sync
  // ?cat= so the view is deep-linkable.
  function selectPreset(p: PresetKey) {
    setPreset(p); setCatF("all"); setPanelId(null);
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("cat", p);
    router.replace(`/study/${studyId}/audit-trail?${sp.toString()}`, { scroll: false });
  }

  // CSV export — fixed column order; Full ignores filters, Current view respects them.
  const CSV_HEADERS = ["Timestamp (UTC)", "User", "Role", "Action", "Subject", "Site", "Form", "Field", "Field code", "Old value", "New value", "Reason", "Source"];
  const csvRow = (e: AuditEvent): (string | number | null)[] => [
    fmtTs(e.ts), e.user.name, e.user.role, TYPE_META[e.type].label, e.subjectCode, e.siteName, e.formName,
    e.fieldLabel, e.fieldCode, e.oldValue ?? "", e.newValue ?? "", reasonColumn(e) ?? "", SOURCE_META[e.source].label,
  ];
  const today = dateKey(new Date(baseNow).toISOString());
  function exportFull() {
    const rows = roleEvents.slice().sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0)).map(csvRow);
    downloadCsv(`audit-trail-${study?.code ?? "study"}-${today}.csv`, CSV_HEADERS, rows);
    setExportOpen(false); setToast(`Exported ${rows.length.toLocaleString()} events — full audit trail.`);
  }
  function exportView() {
    downloadCsv(`audit-trail-${study?.code ?? "study"}-${preset}-${today}.csv`, CSV_HEADERS, filtered.map(csvRow));
    setExportOpen(false); setToast(`Exported ${filtered.length.toLocaleString()} events — current view.`);
  }

  if (!ready) return <div className="au-screen"><div className="au-empty"><i className="ti ti-loader-2"></i> Loading…</div></div>;

  // Roles without audit access (CRC, Sponsor) shouldn't reach this via the nav,
  // but guard direct navigation.
  if (activeRole === "CRC" || activeRole === "Sponsor") {
    return (
      <div className="au-screen">
        <div className="au-empty">
          <div className="au-empty-icon"><i className="ti ti-lock"></i></div>
          <div className="au-empty-title">Audit Trail isn’t available for your role</div>
          <div style={{ fontSize: "var(--text-sm)" }}>The audit trail is restricted to monitoring and oversight roles (CRA · DM · PI · Admin).</div>
        </div>
      </div>
    );
  }

  // Subject column — a linked subject ID for subject-scoped events; for site- or
  // barn-level events show the location name in a distinct (non-ID) style so it
  // reads as a level, not a subject.
  const subjectCell = (e: AuditEvent) => {
    if (e.scope === "subject" && e.subjectId) {
      return <span className="au-subj" onClick={(ev) => { ev.stopPropagation(); gotoRecord(e); }} title="Open in subject record">{e.subjectCode}</span>;
    }
    if ((e.scope === "site" || e.scope === "barn") && e.subjectCode !== "—") {
      return <span className={`au-scope au-scope-${e.scope}`} title={`${e.scope === "site" ? "Site" : "House / barn"}-level entry`}><i className={`ti ti-${e.scope === "site" ? "map-pin" : "building-warehouse"}`}></i> {e.subjectCode}</span>;
    }
    return <span className="au-subj plain">{e.subjectCode}</span>;
  };

  // Per-tab column definitions — each tab surfaces only the columns that carry
  // meaning for its event types.
  type ColDef = { label: string; key?: string; width?: number; render: (e: AuditEvent) => React.ReactNode };
  const dash = <span className="au-dash">—</span>;
  const cTs: ColDef = { label: "Timestamp", key: "ts", width: 148, render: (e) => <span className="au-ts">{fmtTs(e.ts)}</span> };
  const cUser: ColDef = { label: "User", key: "user", width: 100, render: (e) => <span className="au-uname au-uname-clip">{e.user.name}</span> };
  const cRole: ColDef = { label: "Role", key: "role", width: 52, render: (e) => <span className="au-role">{e.user.role}</span> };
  const cAction: ColDef = { label: "Action", key: "type", width: 120, render: (e) => { const m = TYPE_META[e.type]; return <span className={`au-type ${m.cls}`}><i className={`ti ti-${m.icon}`}></i> {m.label}</span>; } };
  const cSubject: ColDef = { label: "Subject", key: "subject", width: 96, render: subjectCell };
  const cForm: ColDef = { label: "Form", key: "form", width: 150, render: (e) => <span className="au-form" title={e.formPath}>{e.formName}</span> };
  const cField: ColDef = { label: "Field", key: "field", width: 140, render: (e) => e.fieldLabel ? <span className="au-field"><span className="au-field-label" title={e.fieldLabel}>{e.fieldLabel}</span>{e.fieldCode && <span className="au-field-code">{e.fieldCode}</span>}</span> : dash };
  const cOld: ColDef = { label: "Old value", key: "old", width: 88, render: (e) => e.oldValue != null ? <span className="au-old" title={e.oldValue}>{e.oldValue}</span> : dash };
  const cNew: ColDef = { label: "New value", key: "new", width: 88, render: (e) => e.newValue != null ? <span className="au-new" title={e.newValue}>{e.newValue}</span> : dash };
  const cReason: ColDef = { label: "Reason", key: "reason", render: (e) => { const r = reasonColumn(e); return r ? <span className="au-details au-reason-clip" title={r}>{r}</span> : dash; } };
  const cApproved: ColDef = { label: "Approved by", key: "approved", width: 140, render: (e) => (e.approvedAt && e.approvedBy) ? <span className="au-approved" title={`${e.approvedBy} (${e.approvedRole}) · ${fmtTs(e.approvedAt)}`}><i className="ti ti-rosette-discount-check"></i> {e.approvedBy} ({e.approvedRole}) · {fmtTs(e.approvedAt)}</span> : dash };
  const cQid: ColDef = { label: "Query ID", key: "queryid", width: 96, render: (e) => e.queryCode ? <span className="au-qid">{e.queryCode}</span> : dash };
  const cText: ColDef = { label: "Text", key: "text", render: (e) => e.details ? <span className="au-details" title={e.details}>{trunc(e.details, 80)}</span> : dash };
  const cLink: ColDef = { label: "Link", width: 120, render: (e) => (e.subjectId && e.formId) ? <span className="au-thread-link" onClick={(ev) => { ev.stopPropagation(); gotoForm(e); }}>View in form →</span> : dash };
  const cSite: ColDef = { label: "Site", key: "site", width: 150, render: (e) => e.siteName !== "—" ? <span className="au-form">{e.siteName}</span> : dash };
  const cDetails: ColDef = { label: "Details", key: "details", render: (e) => <span className="au-details" title={e.details}>{e.details}</span> };
  const COLS: Record<PresetKey, ColDef[]> = {
    clinical: [cTs, cUser, cRole, cAction, cSubject, cForm, cField, cOld, cNew, cReason, cApproved],
    query: [cTs, cUser, cRole, cAction, cSubject, cForm, cQid, cText, cLink],
    system: [cTs, cUser, cRole, cAction, cSubject, cSite, cDetails],
  };
  const columns = COLS[preset];

  return (
    <div className="au-screen">
      {/* Header + CFR badge */}
      <div className="au-header">
        <div className="au-title-row">
          <div className="au-title-left">
            <h1 className="au-title">Audit Trail</h1>
            <span className="au-cfr-badge"><i className="ti ti-shield-lock"></i> 21 CFR Part 11</span>
          </div>
          <div className="au-export">
            <button className="btn-secondary au-export-btn" type="button" onClick={() => setExportOpen((o) => !o)} aria-haspopup="menu" aria-expanded={exportOpen}>
              <i className="ti ti-download"></i> Export <i className="ti ti-chevron-down" style={{ fontSize: 12 }}></i>
            </button>
            {exportOpen && (
              <>
                <div className="au-export-backdrop" onClick={() => setExportOpen(false)}></div>
                <div className="au-export-menu" role="menu">
                  <button type="button" role="menuitem" onClick={exportFull}><i className="ti ti-database"></i><span><span className="au-export-title">Full audit trail</span><span className="au-export-sub">All events, chronological · ignores filters</span></span></button>
                  <button type="button" role="menuitem" onClick={exportView}><i className="ti ti-filter"></i><span><span className="au-export-title">Current view</span><span className="au-export-sub">This tab + filters ({filtered.length.toLocaleString()} events)</span></span></button>
                  <button type="button" role="menuitem" onClick={() => { setExportOpen(false); setToast("ZIP export coming soon — use individual tab exports for now."); }}><i className="ti ti-file-zip"></i><span><span className="au-export-title">By category (zip)</span><span className="au-export-sub">Coming soon</span></span></button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compliance banner */}
      <div className="au-banner">
        <i className="ti ti-info-circle"></i>
        <span>This audit trail is session-based for portfolio demonstration. In production, all entries are permanently recorded and tamper-evident per 21 CFR Part 11.</span>
      </div>

      {/* Preset tabs */}
      <div className="au-tabs">
        {PRESET_TABS.map((t) => (
          <button key={t.key} type="button" className={`au-tab${preset === t.key ? " active" : ""}`} onClick={() => selectPreset(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Filter toolbar */}
      <div className="au-toolbar">
        <div className="au-search"><i className="ti ti-search"></i><input type="search" placeholder="Search subject, user, field, action…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="au-select" value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Action type">
          {filterOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="au-select" value={sourceF} onChange={(e) => setSourceF(e.target.value)} aria-label="Source">
          {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="au-select" value={userF} onChange={(e) => setUserF(e.target.value)} aria-label="User">
          <option value="all">All users</option>{userNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="au-select" value={siteF} onChange={(e) => setSiteF(e.target.value)} aria-label="Site">
          <option value="all">All sites</option>{siteOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="au-select" value={formF} onChange={(e) => setFormF(e.target.value)} aria-label="Form">
          <option value="all">All forms</option>{formNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="au-date-group"><span className="au-date-lbl">From</span><input type="date" className="au-date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
        <div className="au-date-group"><span className="au-date-lbl">To</span><input type="date" className="au-date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
        <span className="au-count">{filtered.length.toLocaleString()} {filtered.length === 1 ? "event" : "events"}</span>
      </div>

      {/* Table */}
      <div className="au-table-wrap">
        {filtered.length === 0 ? (
          <div className="au-empty">
            <div className="au-empty-icon"><i className="ti ti-clipboard-list"></i></div>
            <div className="au-empty-title">No audit entries match your filters</div>
            <button className="au-empty-link" type="button" onClick={resetFilters}>Reset filters</button>
          </div>
        ) : (
          <table className="au-table">
            <thead>
              <tr>
                {columns.map((c) => c.key
                  ? <SortTh key={c.label} label={c.label} sortKey={c.key} sort={sort} onSort={toggle} style={c.width ? { width: c.width } : undefined} />
                  : <th key={c.label} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const muted = e.source === "system" && preset !== "system"; // de-emphasise system rows outside the System tab
                return (
                  <tr key={e.id} className={`${panelId === e.id ? "active-row" : ""}${muted ? " au-row-muted" : ""}${QUERY_TYPES.has(e.type) ? " au-row-link" : ""}`} onClick={() => openRow(e)}>
                    {columns.map((c) => <td key={c.label}>{c.render(e)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary bar */}
      <div className="au-summary">
        <span><span className="sv">{filtered.length.toLocaleString()}</span> events shown</span>
        <span>·</span>
        <span>of <span className="sv">{roleEvents.length.toLocaleString()}</span> in study</span>
        <span>·</span>
        <span>Period <span className="sv">{dateFrom}</span> → <span className="sv">{dateTo}</span></span>
        <span className="au-immutable"><i className="ti ti-lock"></i> Immutable · 21 CFR Part 11</span>
      </div>

      {/* Slide-in detail panel */}
      <div className={`panel-overlay${panelEvent ? " open" : ""}`} onClick={() => setPanelId(null)}></div>
      <div className={`slide-panel au-panel${panelEvent ? " open" : ""}`}>
        {panelEvent && (() => {
          const meta = TYPE_META[panelEvent.type];
          const row = (label: string, value: React.ReactNode, mono = false) => (
            <div className="au-detail-row"><div className="au-detail-label">{label}</div><div className={`au-detail-value${mono ? " mono" : ""}`}>{value}</div></div>
          );
          return (
            <>
              <div className="panel-header">
                <div className="panel-header-left">
                  <div className="panel-title">{meta.label}</div>
                  <div className="panel-title-meta"><span className="query-id">{fmtTs(panelEvent.ts)}</span></div>
                </div>
                <button className="panel-close" onClick={() => setPanelId(null)} type="button"><i className="ti ti-x"></i></button>
              </div>
              {panelEvent.subjectId && (
                <div className="au-viewlink-bar"><span className="au-panel-link" onClick={() => gotoRecord(panelEvent)}><i className="ti ti-external-link" style={{ fontSize: 12 }}></i> View in subject record</span></div>
              )}

              {/* Change-reason approval chain (fix 2) */}
              {(panelEvent.type === "change_reason" || panelEvent.type === "change_reason_approved") && (
                <div className="au-chain">
                  <div className="au-chain-step">
                    <div className="au-chain-dot"></div>
                    <div className="au-chain-body">
                      <div className="au-chain-head"><span className="au-chain-title">Field edited</span><span className="au-chain-meta">{panelEvent.authorName ?? panelEvent.user.name} · {panelEvent.authorRole ?? panelEvent.user.role} · {fmtTs(panelEvent.createdAt ?? panelEvent.ts)}</span></div>
                      <div className="au-chain-detail">{panelEvent.fieldLabel && <><strong>{panelEvent.fieldLabel}</strong>: </>}<span className="au-old">{panelEvent.oldValue}</span> → <span className="au-new">{panelEvent.newValue}</span></div>
                    </div>
                  </div>
                  <div className="au-chain-step">
                    <div className="au-chain-dot"></div>
                    <div className="au-chain-body">
                      <div className="au-chain-head"><span className="au-chain-title">Reason submitted</span><span className="au-chain-meta">{panelEvent.authorName ?? "—"} · {panelEvent.authorRole ?? "—"} · {fmtTs(panelEvent.createdAt ?? panelEvent.ts)}</span></div>
                      <div className="au-chain-detail au-chain-quote">“{panelEvent.reason}”</div>
                    </div>
                  </div>
                  <div className={`au-chain-step${panelEvent.approvedAt ? " done" : " pending"}`}>
                    <div className="au-chain-dot">{panelEvent.approvedAt && <i className="ti ti-check"></i>}</div>
                    <div className="au-chain-body">
                      <div className="au-chain-head"><span className="au-chain-title">{panelEvent.approvedAt ? "Approved by DM" : "Awaiting DM approval"}</span>{panelEvent.approvedAt && <span className="au-chain-meta">{panelEvent.approvedBy} · {panelEvent.approvedRole} · {fmtTs(panelEvent.approvedAt)}</span>}</div>
                      {panelEvent.approvedAt && <div className="au-chain-detail">Change reason reviewed and approved</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* Electronic signature (fix 4) */}
              {panelEvent.type === "form_signed" && (
                <div className="au-sign">
                  <div className="au-sign-head"><i className="ti ti-writing-sign"></i> Electronic signature</div>
                  <div className="au-sign-meaning">“{panelEvent.meaning ?? panelEvent.details}”</div>
                  <div className="au-sign-meta">Signed by <strong>{panelEvent.user.name}</strong> · {panelEvent.user.role} · {fmtTs(panelEvent.ts)}</div>
                  <div className="au-sign-note"><i className="ti ti-shield-lock"></i> In production: cryptographically linked to the record hash per 21 CFR Part 11 §11.50</div>
                </div>
              )}

              <div className="au-detail-grid">
                {row("Timestamp", fmtTs(panelEvent.ts), true)}
                {row("Action", <span className={`au-type ${meta.cls}`}><i className={`ti ti-${meta.icon}`}></i> {meta.label}</span>)}
                {row("Source", <span className={`au-src-tag ${SOURCE_META[panelEvent.source].cls}`}>{SOURCE_META[panelEvent.source].label}</span>)}
                {row("User", <>{panelEvent.user.name} <span className="au-role" style={{ marginLeft: 4 }}>{panelEvent.user.role}</span></>)}
                {row("Session", <span style={{ color: "var(--color-text-tertiary)" }}><i className="ti ti-device-desktop" style={{ fontSize: 12, marginRight: 4 }}></i>Timestamp: UTC · Electronic signature: session-authenticated</span>)}
                {panelEvent.subjectCode !== "—" && panelEvent.scope === "subject" && row("Subject", <span style={{ fontFamily: "var(--font-mono)" }}>{panelEvent.subjectCode}</span>)}
                {panelEvent.subjectCode !== "—" && panelEvent.scope === "site" && row("Site (level)", <span className="au-scope au-scope-site"><i className="ti ti-map-pin"></i> {panelEvent.subjectCode}</span>)}
                {panelEvent.subjectCode !== "—" && panelEvent.scope === "barn" && row("House (level)", <span className="au-scope au-scope-barn"><i className="ti ti-building-warehouse"></i> {panelEvent.subjectCode}</span>)}
                {panelEvent.siteName !== "—" && panelEvent.scope !== "site" && row("Site", panelEvent.siteName)}
                {panelEvent.formName !== "—" && row("Form", panelEvent.formPath)}
                {panelEvent.fieldLabel && row("Field", <>{panelEvent.fieldLabel} {panelEvent.fieldCode && <span className="au-field-code">{panelEvent.fieldCode}</span>}</>)}
                {panelEvent.oldValue != null && row("Old value", <span className="au-old">{panelEvent.oldValue}</span>)}
                {panelEvent.newValue != null && row("New value", <span className="au-new">{panelEvent.newValue}</span>)}
                {(panelEvent.statusBefore || panelEvent.statusAfter) && row("Form status", <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{panelEvent.statusBefore ?? "—"} → {panelEvent.statusAfter ?? "—"}</span>)}
                {panelEvent.queryCode && row("Query ID", <span style={{ fontFamily: "var(--font-mono)" }}>{panelEvent.queryCode}</span>)}
                {panelEvent.reason && row("Reason", panelEvent.reason)}
                {row("Detail", panelEvent.details)}
              </div>
              <div className="au-panel-footer"><i className="ti ti-shield-lock"></i> In production: tamper-evident, append-only per 21 CFR Part 11</div>
            </>
          );
        })()}
      </div>

      {toast && <div className="au-toast" role="status"><i className="ti ti-circle-check"></i> {toast}</div>}
    </div>
  );
}
