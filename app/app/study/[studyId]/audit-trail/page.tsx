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
import { useParams, useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { Dataset } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./audit-trail.css";

// ─── Action types + metadata ────────────────────────────────────────────────
type AuditType =
  | "data_entry" | "change_reason" | "edit_check"
  | "query_raised" | "query_responded" | "query_resolved"
  | "sdv" | "form_submitted" | "form_locked"
  | "randomization" | "consent" | "protocol_deviation"
  | "subject_enrolled" | "subject_withdrawn" | "unblinding" | "login";
type FilterCat = "data_entry" | "query" | "sdv" | "status_change" | "form_lock" | "randomization" | "consent" | "deviation" | "unblinding" | "login";

const TYPE_META: Record<AuditType, { label: string; cls: string; icon: string; cat: FilterCat }> = {
  data_entry:        { label: "Data Entry",         cls: "at-entry",     icon: "pencil",          cat: "data_entry" },
  change_reason:     { label: "Change Reason",      cls: "at-change",    icon: "history",         cat: "data_entry" },
  edit_check:        { label: "Edit Check",         cls: "at-check",     icon: "alert-triangle",  cat: "data_entry" },
  query_raised:      { label: "Query Raised",       cls: "at-query",     icon: "flag",            cat: "query" },
  query_responded:   { label: "Query Responded",    cls: "at-qresp",     icon: "message",         cat: "query" },
  query_resolved:    { label: "Query Resolved",     cls: "at-qres",      icon: "flag-check",      cat: "query" },
  sdv:               { label: "SDV Verified",       cls: "at-sdv",       icon: "circle-check",    cat: "sdv" },
  form_submitted:    { label: "Form Submitted",     cls: "at-submit",    icon: "send",            cat: "status_change" },
  form_locked:       { label: "Form Locked",        cls: "at-lock",      icon: "lock",            cat: "form_lock" },
  randomization:     { label: "Randomization",      cls: "at-rand",      icon: "arrows-shuffle",  cat: "randomization" },
  consent:           { label: "Consent Obtained",   cls: "at-consent",   icon: "file-check",      cat: "consent" },
  protocol_deviation:{ label: "Protocol Deviation", cls: "at-deviation", icon: "alert-triangle",  cat: "deviation" },
  subject_enrolled:  { label: "Subject Enrolled",   cls: "at-enroll",    icon: "user-plus",       cat: "status_change" },
  subject_withdrawn: { label: "Subject Withdrawn",  cls: "at-withdraw",  icon: "user-minus",      cat: "status_change" },
  unblinding:        { label: "Emergency Unblinding",cls: "at-unblind",  icon: "eye-exclamation", cat: "unblinding" },
  login:             { label: "Login",              cls: "at-login",     icon: "login",           cat: "login" },
};

const CAT_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "data_entry", label: "Data entry" },
  { value: "query", label: "Query" },
  { value: "sdv", label: "SDV" },
  { value: "status_change", label: "Status change" },
  { value: "form_lock", label: "Form lock" },
  { value: "randomization", label: "Randomization" },
  { value: "consent", label: "Consent" },
  { value: "deviation", label: "Protocol deviation" },
  { value: "unblinding", label: "Emergency unblinding" },
  { value: "login", label: "Login" },
];

interface AuditUser { name: string; role: string; initials: string; auto?: boolean }
interface AuditEvent {
  id: string;
  ts: string; // ISO
  type: AuditType;
  user: AuditUser;
  subjectId: string | null;
  subjectCode: string;
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
  statusBefore?: string;
  statusAfter?: string;
}

// Seeded cast — actions that the session store can't attribute to a real person
// are assigned to a stable demo cast by role (visitor-authored actions keep their
// real NDA name + role).
const CAST: Record<string, AuditUser> = {
  CRC: { name: "Elisa Tron", role: "CRC", initials: "ET" },
  CRA: { name: "Jordan Reyes", role: "CRA", initials: "JR" },
  DM: { name: "Mei Chen", role: "DM", initials: "MC" },
  PI: { name: "Dr. S. Patel", role: "PI", initials: "SP" },
  Auto: { name: "Edit check", role: "Auto", initials: "EC", auto: true },
};
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
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
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
    const subjectCode = subj?.subject_code ?? (inst.site_id ? siteById.get(inst.site_id)?.name : inst.barn_id ? barnById.get(inst.barn_id)?.name : null) ?? "—";
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : null;
    const formPath = parent ? `${parent.name} — ${form.name}` : form.name;
    return { subjectId: subj?.id ?? null, subjectCode, siteName, formId: form.id, formName: form.name, formPath };
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
  const push = (e: Omit<AuditEvent, "id">) => events.push({ id: `ae-${seq++}`, ...e });
  const qCode = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;

  // 1 — Data entry: one event per saved field value.
  for (const fv of dataset.fieldValues) {
    if (fv.value == null || String(fv.value).trim() === "") continue;
    const ctx = ctxOfInstance(fv.form_instance_id); if (!ctx) continue;
    const field = fieldById.get(fv.form_field_id); if (!field) continue;
    const unit = field.unit ? ` ${field.unit}` : "";
    push({ ts: synthTs(`fv${fv.id}`, baseNow), type: "data_entry", user: CAST.CRC, ...ctx, ...fieldBits(field),
      oldValue: null, newValue: `${fv.value}${unit}`, details: `${field.label} recorded as ${fv.value}${unit}` });
  }

  // 2 — Change reasons (Δ records — visitor-authored, carry real timestamps).
  for (const d of dataset.deltaRecords) {
    const fo = fieldOfValue(d.field_value_id); if (!fo) continue;
    const ctx = ctxOfInstance(fo.fv.form_instance_id); if (!ctx) continue;
    push({ ts: d.created_at, type: "change_reason", user: mkUser(d.author_name, d.author_role), ...ctx, ...fieldBits(fo.field),
      oldValue: d.old_value, newValue: d.new_value, reason: d.reason,
      details: `${fo.field.label} changed from ${d.old_value} to ${d.new_value}`, statusBefore: d.status });
  }

  // 3 — Queries: raised, responded, resolved.
  for (const q of dataset.queries) {
    const ctx = ctxOfInstance(q.form_instance_id); if (!ctx) continue;
    const fo = fieldOfValue(q.field_value_id);
    const fb = fieldBits(fo?.field);
    const msgs = dataset.queryMessages.filter((m) => m.query_id === q.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const first = msgs[0];
    const auto = (first?.body ?? "").startsWith("Auto edit-check:");
    const raiser = auto ? CAST.Auto : first?.author_role ? mkUser(first.author_name, first.author_role) : CAST.CRA;
    push({ ts: q.created_at ?? first?.created_at ?? synthTs(`q${q.id}`, baseNow), type: "query_raised", user: raiser, ...ctx, ...fb,
      oldValue: null, newValue: null, details: q.title, queryCode: qCode(q.id) });
    if (q.status === "responded" || q.status === "resolved") {
      const resp = msgs.find((m) => m !== first && m.author_role && !m.author_role.includes("System"));
      if (resp) push({ ts: resp.created_at, type: "query_responded", user: mkUser(resp.author_name, resp.author_role), ...ctx, ...fb,
        oldValue: null, newValue: null, details: resp.body, queryCode: qCode(q.id) });
    }
    if (q.status === "resolved") {
      const last = msgs[msgs.length - 1];
      push({ ts: last?.created_at ?? synthTs(`qr${q.id}`, baseNow), type: "query_resolved", user: CAST.CRA, ...ctx, ...fb,
        oldValue: null, newValue: null, details: `Query ${qCode(q.id)} resolved`, queryCode: qCode(q.id) });
    }
  }

  // 4 — Edit checks (open auto-validation flags).
  for (const ec of dataset.editChecks) {
    if (ec.status !== "open") continue;
    const ctx = ctxOfInstance(ec.form_instance_id); if (!ctx) continue;
    const fo = fieldOfValue(ec.field_value_id);
    push({ ts: ec.created_at, type: "edit_check", user: CAST.Auto, ...ctx, ...fieldBits(fo?.field),
      oldValue: null, newValue: fo?.fv.value ?? null, details: ec.message });
  }

  // 5 — SDV verifications (each sdv_record is a verification act).
  for (const s of dataset.sdvRecords) {
    const ctx = ctxOfInstance(s.form_instance_id); if (!ctx) continue;
    const fo = fieldOfValue(s.field_value_id ?? null);
    push({ ts: s.verified_at ?? synthTs(`sdv${s.id}`, baseNow), type: "sdv",
      user: s.verified_by_name ? mkUser(s.verified_by_name, "CRA") : CAST.CRA, ...ctx, ...fieldBits(fo?.field),
      oldValue: null, newValue: null, details: fo?.field ? `${fo.field.label} verified against source` : "Source data verified" });
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
      push({ ts: synthTs(`sub${inst.id}`, baseNow), type: "form_submitted", user: CAST.CRC, ...ctx, ...noField,
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
    push({ ts: u.created_at, type: "unblinding", user: mkUser(u.author_name, u.author_role),
      subjectId: subj.id, subjectCode: subj.subject_code, siteName, formId: null, formName: "Subject record", formPath: "Subject record",
      fieldId: null, fieldLabel: "", fieldCode: "", oldValue: "Blinded", newValue: u.arm,
      details: `Emergency unblinding — treatment arm revealed: ${u.arm}`, reason: u.reason });
  }

  // 7 — Subject enrolment + withdrawal.
  for (const subj of dataset.subjects) {
    if (subj.study_id !== studyId) continue;
    const siteName = subj.site_id ? siteById.get(subj.site_id)?.name ?? "—" : "—";
    const ctx = { subjectId: subj.id, subjectCode: subj.subject_code, siteName, formId: null, formName: "Subject record", formPath: "Subject record" };
    push({ ts: synthTs(`enr${subj.id}`, baseNow), type: "subject_enrolled", user: CAST.CRC, ...ctx, fieldId: null, fieldLabel: "", fieldCode: "",
      oldValue: null, newValue: null, details: "Subject enrolled — screening complete, all criteria met", statusBefore: "—", statusAfter: "Screened" });
    if (subj.status === "withdrawn") {
      push({ ts: synthTs(`wd${subj.id}`, baseNow, 30), type: "subject_withdrawn", user: CAST.PI, ...ctx, fieldId: null, fieldLabel: "", fieldCode: "",
        oldValue: null, newValue: null, details: "Subject withdrawn from study — data preserved for analysis", statusBefore: "Active", statusAfter: "Withdrawn" });
    }
  }

  // 8 — Login events (synthetic; surfaced to Admin only — see visibleTo).
  for (const role of ["CRC", "CRA", "DM", "PI"] as const) {
    const u = CAST[role];
    push({ ts: synthTs(`login${role}`, baseNow, 7), type: "login", user: u, subjectId: null, subjectCode: "—", siteName: "—",
      formId: null, formName: "—", formPath: "—", fieldId: null, fieldLabel: "", fieldCode: "",
      oldValue: null, newValue: null, details: `${u.name} authenticated to the study` });
  }

  return events;
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
  if (role === "PI") return e.subjectId != null; // all types, scoped to subjects
  return true;
}

function cmp(a: AuditEvent, b: AuditEvent, col: string): number {
  switch (col) {
    case "ts": return a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0;
    case "user": return a.user.name.localeCompare(b.user.name);
    case "type": return TYPE_META[a.type].label.localeCompare(TYPE_META[b.type].label);
    case "subject": return a.subjectCode.localeCompare(b.subjectCode);
    case "form": return a.formName.localeCompare(b.formName);
    case "field": return a.fieldLabel.localeCompare(b.fieldLabel);
    case "old": return (a.oldValue ?? "").localeCompare(b.oldValue ?? "");
    case "new": return (a.newValue ?? "").localeCompare(b.newValue ?? "");
    case "details": return a.details.localeCompare(b.details);
    default: return 0;
  }
}

export default function AuditTrailPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
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
  const [userF, setUserF] = useState("all");
  const [subjF, setSubjF] = useState("all");
  const [formF, setFormF] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => dateKey(new Date(baseNow - 60 * 86400000).toISOString()));
  const [dateTo, setDateTo] = useState(() => dateKey(new Date(baseNow).toISOString()));
  const { sort, toggle } = useTableSort(null); // null → default (newest first)
  const [panelId, setPanelId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  // Filter option lists (scoped to what this role can see).
  const userNames = useMemo(() => Array.from(new Set(roleEvents.map((e) => e.user.name))).sort(), [roleEvents]);
  const subjectCodes = useMemo(() => Array.from(new Set(roleEvents.map((e) => e.subjectCode).filter((s) => s !== "—"))).sort(), [roleEvents]);
  const formNames = useMemo(() => Array.from(new Set(roleEvents.map((e) => e.formName).filter((f) => f !== "—"))).sort(), [roleEvents]);

  const resetFilters = () => { setSearch(""); setCatF("all"); setUserF("all"); setSubjF("all"); setFormF("all"); };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = roleEvents.filter((e) => {
      if (catF !== "all" && TYPE_META[e.type].cat !== catF) return false;
      if (userF !== "all" && e.user.name !== userF) return false;
      if (subjF !== "all" && e.subjectCode !== subjF) return false;
      if (formF !== "all" && e.formName !== formF) return false;
      const dk = dateKey(e.ts);
      if (dateFrom && dk < dateFrom) return false;
      if (dateTo && dk > dateTo) return false;
      if (q) {
        const hay = [e.subjectCode, e.user.name, e.fieldLabel, e.fieldCode, TYPE_META[e.type].label, e.details, e.formName, e.oldValue ?? "", e.newValue ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return out.sort((a, b) => {
      if (sort) { const r = cmp(a, b, sort.col); return sort.dir === "asc" ? r : -r; }
      return a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0; // default newest first
    });
  }, [roleEvents, search, catF, userF, subjF, formF, dateFrom, dateTo, sort]);

  // Fall back to roleEvents (role-filtered + arm-masked), never allEvents, so the
  // detail panel can never surface a hidden/unmasked value.
  const panelEvent = panelId ? filtered.find((e) => e.id === panelId) ?? roleEvents.find((e) => e.id === panelId) ?? null : null;

  function gotoRecord(e: AuditEvent) {
    if (!e.subjectId) return;
    const q = e.formId && e.fieldId ? `?form=${e.formId}&field=${e.fieldId}` : e.formId ? `?form=${e.formId}` : "";
    router.push(`/study/${studyId}/data-entry/${e.subjectId}${q}`);
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

  const th = (label: string, key: string, width?: number) => <SortTh label={label} sortKey={key} sort={sort} onSort={toggle} style={width ? { width } : undefined} />;
  const userCell = (u: AuditUser) => (
    <span className="au-user"><span className="au-uname">{u.name}</span><span className="au-role">{u.role}</span></span>
  );

  return (
    <div className="au-screen">
      {/* Header + CFR badge */}
      <div className="au-header">
        <div className="au-bc">{study?.code ?? "Study"} · Audit Trail</div>
        <div className="au-title-row">
          <div className="au-title-left">
            <h1 className="au-title">Audit Trail</h1>
            <span className="au-cfr-badge"><i className="ti ti-shield-lock"></i> 21 CFR Part 11</span>
          </div>
          <button className="btn-secondary" type="button" onClick={() => setToast("Export initiated — CSV will download shortly.")}><i className="ti ti-download"></i> Export CSV</button>
        </div>
      </div>

      {/* Compliance banner */}
      <div className="au-banner">
        <i className="ti ti-info-circle"></i>
        <span>This audit trail is session-based for portfolio demonstration. In production, all entries are permanently recorded and tamper-evident per 21 CFR Part 11.</span>
      </div>

      {/* Filter toolbar */}
      <div className="au-toolbar">
        <div className="au-search"><i className="ti ti-search"></i><input type="search" placeholder="Search subject, user, field, action…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="au-select" value={catF} onChange={(e) => setCatF(e.target.value)} aria-label="Action type">
          {CAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="au-select" value={userF} onChange={(e) => setUserF(e.target.value)} aria-label="User">
          <option value="all">All users</option>{userNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="au-select" value={subjF} onChange={(e) => setSubjF(e.target.value)} aria-label="Subject">
          <option value="all">All subjects</option>{subjectCodes.map((n) => <option key={n} value={n}>{n}</option>)}
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
                {th("Timestamp", "ts", 140)}
                {th("User", "user", 156)}
                {th("Action", "type", 132)}
                {th("Subject", "subject", 110)}
                {th("Form", "form", 180)}
                {th("Field", "field", 170)}
                {th("Old value", "old", 110)}
                {th("New value", "new", 110)}
                {th("Details", "details")}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const meta = TYPE_META[e.type];
                return (
                  <tr key={e.id} className={panelId === e.id ? "active-row" : ""} onClick={() => setPanelId(e.id)}>
                    <td><span className="au-ts">{fmtTs(e.ts)}</span></td>
                    <td>{userCell(e.user)}</td>
                    <td><span className={`au-type ${meta.cls}`}><i className={`ti ti-${meta.icon}`}></i> {meta.label}</span></td>
                    <td>{e.subjectId ? <span className="au-subj" onClick={(ev) => { ev.stopPropagation(); gotoRecord(e); }} title="Open in subject record">{e.subjectCode}</span> : <span className="au-subj plain">{e.subjectCode}</span>}</td>
                    <td><span className="au-form" title={e.formPath}>{e.formName}</span></td>
                    <td>{e.fieldLabel ? <span className="au-field"><span className="au-field-label" title={e.fieldLabel}>{e.fieldLabel}</span>{e.fieldCode && <span className="au-field-code">{e.fieldCode}</span>}</span> : <span className="au-dash">—</span>}</td>
                    <td>{e.oldValue != null ? <span className="au-old" title={e.oldValue}>{e.oldValue}</span> : <span className="au-dash">—</span>}</td>
                    <td>{e.newValue != null ? <span className="au-new" title={e.newValue}>{e.newValue}</span> : <span className="au-dash">—</span>}</td>
                    <td><span className="au-details" title={e.details}>{e.details}</span></td>
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
              <div className="au-detail-grid">
                {row("Timestamp", fmtTs(panelEvent.ts), true)}
                {row("Action", <span className={`au-type ${meta.cls}`}><i className={`ti ti-${meta.icon}`}></i> {meta.label}</span>)}
                {row("User", <>{panelEvent.user.name} <span className="au-role" style={{ marginLeft: 4 }}>{panelEvent.user.role}</span></>)}
                {row("Session", <span style={{ color: "var(--color-text-tertiary)" }}><i className="ti ti-device-desktop" style={{ fontSize: 12, marginRight: 4 }}></i>Timestamp: UTC · Electronic signature: session-authenticated</span>)}
                {panelEvent.subjectCode !== "—" && row("Subject", <span style={{ fontFamily: "var(--font-mono)" }}>{panelEvent.subjectCode}</span>)}
                {panelEvent.siteName !== "—" && row("Site", panelEvent.siteName)}
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
