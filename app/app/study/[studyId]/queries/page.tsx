"use client";

// ════════════════════════════════════════════════════════════════════════════
// Queries screen — the study-wide query worklist (the CRA/DM's workstation).
// Two tabs (faithful to 15-queries-list.html's tab pattern, repurposed by spec):
//   • Queries     — manual queries (Q-…), the Raised → Responded → Resolved flow
//   • Edit Checks — open auto edit-checks (EC-…), value + range, resolved on the record
// Row click → inline slide-in thread panel (reuses the Subject Record query panel).
// The Subject-ID link instead navigates into the record + deep-links the field.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { canQuery } from "@/lib/permissions";
import { resolveRange } from "@/lib/forms/validation";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import { DEMO_USER_ID } from "@/lib/constants";
import { usersForStudy, type AppUser } from "@/lib/users-data";
import { addNotification } from "@/lib/notifications-data";
import { QUERY_TEMPLATES } from "@/lib/query-templates";
import type { Dataset, EditCheckRow, QueryRow } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./queries.css";

const newId = () => crypto.randomUUID();
const qCodeFor = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;
const ecCodeFor = (id: string) => `EC-${id.slice(0, 4).toUpperCase()}`;
const STATUS_CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };

type TabKey = "queries" | "editchecks";
type ItemStatus = "open" | "responded" | "resolved" | "closed" | "editcheck";
interface QueryItem {
  kind: "query" | "editcheck";
  id: string;
  code: string;
  query?: QueryRow;
  ec?: EditCheckRow;
  status: ItemStatus;
  subjectId: string | null;
  subjectCode: string;
  siteName: string;
  formId: string;
  formName: string;
  formPath: string; // "Group — Form" (immediate parent group), or just "Form" when standalone
  fieldId: string;
  fieldLabel: string;
  fieldCode: string;
  fieldValueId: string | null;
  openedISO: string | null;
  daysOpen: number;
  enteredValue: string; // the field value that triggered the query / edit check
  queryText: string; // the query message / EC description
  raisedByName: string; // who raised it (name only — no avatar)
  raisedByRole: string;
  normalRange: string; // edit checks: the expected range (e.g. "38.0–39.3 °C")
  assignedCrc: string; // CRC responsible for the subject's site (derived from users-data)
  priority: string; // routine | urgent | critical (manual queries)
  lastResponseISO: string | null; // last thread message timestamp (for export)
  convertedTo: string | null; // Q- code when an edit check was converted to a query
}

// Age SLA tone: green < 7d · amber 7–14d · red > 14d (overdue).
function ageTone(days: number): "green" | "amber" | "red" {
  if (days > 14) return "red";
  if (days >= 7) return "amber";
  return "green";
}
// The active CRC responsible for a site (by site code) — [] siteCodes = all sites.
function crcForSite(users: AppUser[], siteCode: string | null): string {
  if (!siteCode) {
    const any = users.find((u) => u.role === "CRC" && u.status === "active");
    return any?.name ?? "—";
  }
  const crc = users.find((u) => u.role === "CRC" && u.status === "active" && (u.siteCodes.length === 0 || u.siteCodes.includes(siteCode)));
  return crc?.name ?? "—";
}

// Who the query is currently assigned to (who needs to act), derived from status.
function assigneeFor(status: ItemStatus): { role: string; verb: string } | null {
  if (status === "open") return { role: "CRC", verb: "to respond" };
  if (status === "responded") return { role: "CRA", verb: "to resolve" };
  return null; // resolved — no one
}

// ─── Column sort comparator (state handled by the shared useTableSort hook) ──
const STATUS_RANK: Record<string, number> = { open: 0, responded: 1, resolved: 2, closed: 3, editcheck: 0 };
function colCompare(a: QueryItem, b: QueryItem, key: string): number {
  switch (key) {
    case "days": return a.daysOpen - b.daysOpen;
    case "status": return (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
    case "site": return a.siteName.localeCompare(b.siteName);
    case "assignee": return a.assignedCrc.localeCompare(b.assignedCrc);
    case "subject":
    default: return a.subjectCode.localeCompare(b.subjectCode);
  }
}

const daysSince = (iso: string | null | undefined, nowMs: number): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((nowMs - t) / 86400000));
};
// Fallback: pull a "38.3–39.2 °C" range out of an edit-check message's parentheses.
const rangeFromMessage = (msg: string): string => {
  const m = msg.match(/\(([^()]*\d[^()]*[–-][^()]*)\)/);
  return m ? m[1].trim() : "—";
};

function buildItems(dataset: Dataset, studyId: string, hideEC: boolean, nowMs: number, users: AppUser[]): QueryItem[] {
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const subjById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const siteById = new Map(dataset.sites.map((s) => [s.id, s]));
  const barnById = new Map(dataset.barns.map((b) => [b.id, b]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));
  const study = dataset.studies.find((s) => s.id === studyId);

  const ctxOf = (instanceId: string) => {
    const inst = instById.get(instanceId);
    if (!inst) return null;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId) return null;
    const subj = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
    let siteId = subj?.site_id ?? inst.site_id ?? null;
    if (!siteId && inst.barn_id) siteId = barnById.get(inst.barn_id)?.site_id ?? null;
    const siteName = siteId ? siteById.get(siteId)?.name ?? "—" : "—";
    const siteCode = siteId ? siteById.get(siteId)?.code ?? null : null;
    const subjectCode = subj?.subject_code ?? (inst.site_id ? siteById.get(inst.site_id)?.name : inst.barn_id ? barnById.get(inst.barn_id)?.name : null) ?? "—";
    const species = subj?.species ?? study?.species ?? "";
    // Form path = immediate parent group name + form name (or just the form name).
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : null;
    const formPath = parent ? `${parent.name} — ${form.name}` : form.name;
    return { inst, form, subjectId: subj?.id ?? null, subjectCode, siteName, siteCode, species, formPath };
  };
  const fieldOf = (fvId: string | null) => {
    if (!fvId) return null;
    const fv = fvById.get(fvId);
    if (!fv) return null;
    const field = fieldById.get(fv.form_field_id);
    return field ? { field, fv } : null;
  };

  const items: QueryItem[] = [];

  for (const q of dataset.queries) {
    const ctx = ctxOf(q.form_instance_id);
    if (!ctx) continue;
    const fo = fieldOf(q.field_value_id);
    if (!fo) continue; // orphaned (no resolvable field) — skip
    const msgs = dataset.queryMessages.filter((m) => m.query_id === q.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const last = msgs[msgs.length - 1];
    const first = msgs[0];
    const qUnit = fo.field.unit ? ` ${fo.field.unit}` : "";
    items.push({
      kind: "query", id: q.id, code: qCodeFor(q.id), query: q, status: q.status as ItemStatus,
      subjectId: ctx.subjectId, subjectCode: ctx.subjectCode, siteName: ctx.siteName,
      formId: ctx.form.id, formName: ctx.form.name, formPath: ctx.formPath, fieldId: fo.field.id, fieldLabel: fo.field.label, fieldCode: (fo.field.code ?? "").toUpperCase(),
      fieldValueId: q.field_value_id, openedISO: q.created_at ?? last?.created_at ?? null, daysOpen: daysSince(q.created_at ?? last?.created_at, nowMs),
      enteredValue: fo.fv.value ? `${fo.fv.value}${qUnit}` : "—", queryText: q.title,
      raisedByName: first?.author_name ?? "Monitor", raisedByRole: first?.author_role ?? "CRA", normalRange: "",
      assignedCrc: crcForSite(users, ctx.siteCode), priority: q.priority ?? "routine",
      lastResponseISO: last?.created_at ?? null, convertedTo: null,
    });
  }

  if (!hideEC) {
    for (const ec of dataset.editChecks) {
      if (ec.status === "resolved") continue; // resolved-on-record ECs are gone
      // converted ECs stay visible (with a "Converted to Q-…" note); open ECs are active.
      const ctx = ctxOf(ec.form_instance_id);
      if (!ctx) continue;
      const fo = fieldOf(ec.field_value_id);
      if (!fo) continue;
      const r = resolveRange(fo.field, ctx.species, dataset.speciesRanges, null);
      const unit = fo.field.unit ? ` ${fo.field.unit}` : "";
      const enteredValue = fo.fv.value ? `${fo.fv.value}${unit}` : "—";
      const normalRange = r && Number.isFinite(r.min) && Number.isFinite(r.max)
        ? `${r.min}–${r.max}${r.unit ? ` ${r.unit}` : ""}`
        : rangeFromMessage(ec.message);
      items.push({
        kind: "editcheck", id: ec.id, code: ecCodeFor(ec.id), ec, status: "editcheck",
        subjectId: ctx.subjectId, subjectCode: ctx.subjectCode, siteName: ctx.siteName,
        formId: ctx.form.id, formName: ctx.form.name, formPath: ctx.formPath, fieldId: fo.field.id, fieldLabel: fo.field.label, fieldCode: (fo.field.code ?? "").toUpperCase(),
        fieldValueId: ec.field_value_id, openedISO: ec.created_at, daysOpen: daysSince(ec.created_at, nowMs),
        enteredValue, queryText: ec.message, raisedByName: "Edit check", raisedByRole: "Auto", normalRange,
        assignedCrc: crcForSite(users, ctx.siteCode), priority: "routine", lastResponseISO: null,
        convertedTo: ec.status === "converted" && ec.converted_to ? qCodeFor(ec.converted_to) : null,
      });
    }
  }
  return items;
}

export default function QueriesPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, selectedSiteId } = useShell();
  const { dataset, ready, update } = useStudySession();
  const ndaName = useNdaName();

  const study = dataset.studies.find((s) => s.id === studyId);
  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");
  const canManageQ = canQuery(activeRole, "manage");
  const readOnly = activeRole === "Sponsor" || activeRole === "Admin"; // no query respond/resolve
  const hideEC = activeRole === "Sponsor"; // blinding — no edit checks visible
  const canReopen = activeRole === "CRA" || activeRole === "DM"; // Fix 3 — re-open a responded query
  const canBulk = activeRole === "DM" || activeRole === "Admin"; // Fix 7 — bulk close/export
  const canRaiseNew = activeRole === "CRA" || activeRole === "DM"; // Fix 6/8 — raise/convert

  const users = useMemo(() => usersForStudy(study?.code), [study?.code]);
  const nowMs = Date.now();
  const items = useMemo(() => buildItems(dataset, studyId, hideEC, nowMs, users), [dataset, studyId, hideEC, nowMs, users]);

  const [tab, setTab] = useState<TabKey>("queries");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all"); // all | raised | responded | resolved (queries tab only)
  const [formF, setFormF] = useState("");
  const [siteF, setSiteF] = useState("");
  const [assignF, setAssignF] = useState("all"); // all | mine
  const { sort: colSort, toggle: toggleSort, setSort: setColSort } = useTableSort(null); // header sort (asc→desc→clear)
  const [panelId, setPanelId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeReason, setCloseReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false); // Fix 3 — inline re-open compose
  const [reopenReason, setReopenReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set()); // Fix 7 — bulk selection
  const [bulkCloseOpen, setBulkCloseOpen] = useState(false);
  const [nqOpen, setNqOpen] = useState(false); // Fix 6/8 — new-query modal
  const [nqSubject, setNqSubject] = useState("");
  const [nqForm, setNqForm] = useState("");
  const [nqField, setNqField] = useState("");
  const [nqText, setNqText] = useState("");
  const [nqPriority, setNqPriority] = useState("routine");
  const [nqConvertEc, setNqConvertEc] = useState<string | null>(null); // EC id being converted
  const [infoOpen, setInfoOpen] = useState(false); // Q- vs EC- explainer popover
  function toggleInfo() { setInfoOpen((o) => !o); }
  function closeInfo() { setInfoOpen(false); }
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2800); return () => clearTimeout(t); }, [toast]);

  // Sponsor never has an Edit Checks tab — keep them on Queries.
  useEffect(() => { if (hideEC && tab === "editchecks") setTab("queries"); }, [hideEC, tab]);

  // ─── Split by kind ──────────────────────────────────────────────────────────
  const queryItems = useMemo(() => items.filter((i) => i.kind === "query"), [items]);
  const ecItems = useMemo(() => items.filter((i) => i.kind === "editcheck"), [items]);

  const raised = queryItems.filter((i) => i.status === "open");
  const responded = queryItems.filter((i) => i.status === "responded");
  const openItems = [...raised, ...responded];

  // ─── Filter options (scoped to the active tab's source) ─────────────────────
  const tabItems = tab === "queries" ? queryItems : ecItems;
  const formNames = Array.from(new Set(tabItems.map((i) => i.formName))).sort();
  const siteNames = Array.from(new Set(tabItems.map((i) => i.siteName).filter((s) => s !== "—"))).sort();
  const showAssign = tab === "queries" && (activeRole === "CRC" || activeRole === "PI" || activeRole === "CRA" || activeRole === "DM");
  const needsMyAction = (i: QueryItem) => {
    if (i.kind !== "query" || i.status === "resolved") return false;
    if (activeRole === "CRC" || activeRole === "PI") return i.status === "open";
    if (activeRole === "CRA" || activeRole === "DM") return true;
    return false;
  };

  // CRC/PI are scoped to their site context (the topbar site selector) — they only
  // see queries on subjects at their assigned site. CRA/DM/Admin see all sites.
  const scopedSiteName = (activeRole === "CRC" || activeRole === "PI") && selectedSiteId
    ? dataset.sites.find((s) => s.id === selectedSiteId)?.name ?? null
    : null;

  // ─── Filter + sort the active tab ───────────────────────────────────────────
  const filtered = tabItems
    .filter((i) => {
      if (scopedSiteName && i.siteName !== scopedSiteName) return false;
      if (tab === "queries") {
        if (statusF === "raised" && i.status !== "open") return false;
        if (statusF === "responded" && i.status !== "responded") return false;
        if (statusF === "resolved" && i.status !== "resolved" && i.status !== "closed") return false;
        if (assignF === "mine" && !needsMyAction(i)) return false;
      }
      if (formF && i.formName !== formF) return false;
      if (siteF && i.siteName !== siteF) return false;
      if (search) {
        const q = search.toLowerCase();
        if (![i.code, i.subjectCode, i.fieldLabel, i.fieldCode, i.formName, i.query?.title ?? i.ec?.message ?? ""].join(" ").toLowerCase().includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Column-header sort when active (asc→desc→clear); otherwise a role-based
      // default: DM/CRA triage oldest-first (SLA), CRC/others see newest-first.
      if (colSort) {
        const r = colCompare(a, b, colSort.col);
        return colSort.dir === "asc" ? r : -r;
      }
      const at = a.openedISO ? Date.parse(a.openedISO) : 0;
      const bt = b.openedISO ? Date.parse(b.openedISO) : 0;
      const oldestFirst = activeRole === "DM" || activeRole === "CRA";
      return oldestFirst ? at - bt : bt - at;
    });

  // ─── Panel data ─────────────────────────────────────────────────────────────
  const panelItem = panelId ? items.find((i) => i.id === panelId) ?? null : null;
  const panelQueries = panelItem?.fieldValueId
    ? dataset.queries.filter((q) => q.field_value_id === panelItem.fieldValueId).slice().sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1))
    : [];
  const panelQuery = panelItem?.query;
  const msgsForQuery = (qid: string) => dataset.queryMessages.filter((m) => m.query_id === qid).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const panelHasResponse = panelQuery ? msgsForQuery(panelQuery.id).some((m) => m.author_role && !m.author_role.includes("System")) : false;
  const panelDaysTone = panelItem ? ageTone(panelItem.daysOpen) : "green";

  // ─── New-query cascade (subject → form → field), scoped to this study ────────
  const siteStudy = useMemo(() => new Map(dataset.sites.map((s) => [s.id, s.study_id])), [dataset.sites]);
  const nqSubjects = useMemo(
    () => dataset.subjects.filter((s) => s.site_id && siteStudy.get(s.site_id) === studyId).slice().sort((a, b) => a.subject_code.localeCompare(b.subject_code)),
    [dataset.subjects, siteStudy, studyId],
  );
  const nqForms = useMemo(() => {
    if (!nqSubject) return [] as { id: string; name: string }[];
    const formIds = Array.from(new Set(dataset.formInstances.filter((i) => i.subject_id === nqSubject).map((i) => i.form_id)));
    return formIds.map((fid) => dataset.forms.find((f) => f.id === fid)).filter((f): f is NonNullable<typeof f> => !!f && f.study_id === studyId).sort((a, b) => a.name.localeCompare(b.name));
  }, [nqSubject, dataset.formInstances, dataset.forms, studyId]);
  const nqFields = useMemo(
    () => (nqForm ? dataset.formFields.filter((f) => f.form_id === nqForm) : []),
    [nqForm, dataset.formFields],
  );

  // ─── Handlers (mutate the session store — same as the Subject Record) ───────
  function pushMsg(d: Dataset, queryId: string, body: string) {
    d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, author_name: ndaName, author_role: activeRole, body, created_at: new Date().toISOString() });
  }
  function respondQuery(queryId: string) {
    const body = reply.trim() || `Response acknowledged by ${activeRole}.`;
    update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; q.status = "responded"; pushMsg(d, queryId, body); });
    setReply(""); setToast("Query responded.");
  }
  function resolveQuery(queryId: string) {
    const body = reply.trim();
    update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; if (body) pushMsg(d, queryId, body); q.status = "resolved"; });
    setReply(""); setManageOpen(false); setToast("Query resolved.");
  }
  function confirmCloseWithoutResponse(queryId: string) {
    if (!closeReason.trim()) return;
    update((d: Dataset) => { const q = d.queries.find((x) => x.id === queryId); if (!q) return; d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, author_name: ndaName, author_role: `${activeRole} · System`, body: `Closed without response — ${closeReason.trim()}`, created_at: new Date().toISOString() }); q.status = "resolved"; });
    setCloseReason(""); setCloseModalOpen(false); setManageOpen(false); setToast("Query closed without response.");
  }

  // Notify the CRC responsible for a subject/field (shared study inbox in the portfolio).
  function notifyCrc(title: string, fieldLabel: string, subjectCode: string, subjId: string | null, formId: string, fieldId: string) {
    if (!study?.code) return;
    addNotification(study.code, {
      id: `q-${newId()}`, kind: "query", title, body: `${fieldLabel} · ${subjectCode}`,
      ts: "just now", bucket: "today", route: subjId ? `data-entry/${subjId}?form=${formId}&field=${fieldId}` : "queries",
      read: false, delivery: "delivered", subjectCode,
    });
  }

  // Fix 3 — CRA/DM re-open a responded query: back to raised, reason logged, CRC notified.
  function reopenQuery(i: QueryItem) {
    const reason = reopenReason.trim();
    if (!reason || !i.query) return;
    update((d: Dataset) => {
      const q = d.queries.find((x) => x.id === i.id); if (!q) return;
      q.status = "open";
      d.queryMessages.push({ id: newId(), query_id: q.id, author_id: DEMO_USER_ID, author_name: ndaName, author_role: activeRole, body: `${ndaName} re-opened this query — ${reason}`, created_at: new Date().toISOString() });
    });
    notifyCrc("Query re-opened — additional information required", i.fieldLabel, i.subjectCode, i.subjectId, i.formId, i.fieldId);
    setReopenReason(""); setReopenOpen(false); setToast("Query re-opened — CRC notified.");
  }

  // Fix 6/8 — raise a brand-new query (or convert an edit check) from the module.
  function openNewQuery() { setNqConvertEc(null); setNqSubject(""); setNqForm(""); setNqField(""); setNqText(""); setNqPriority("routine"); setNqOpen(true); }
  function openConvertEc(i: QueryItem) {
    if (!i.ec) return;
    setNqConvertEc(i.ec.id);
    setNqSubject(i.subjectId ?? "");
    setNqForm(i.formId);
    setNqField(i.fieldId);
    setNqText(`Edit check flagged — please confirm this value is correct per source document: ${i.queryText}`);
    setNqPriority("routine");
    setNqOpen(true);
  }
  const nqValid = !!nqSubject && !!nqForm && !!nqField && !!nqText.trim();
  function submitNewQuery() {
    if (!nqValid) return;
    const subj = dataset.subjects.find((s) => s.id === nqSubject);
    const field = dataset.formFields.find((f) => f.id === nqField);
    const subjectCode = subj?.subject_code ?? "—";
    update((d: Dataset) => {
      let inst = d.formInstances.find((x) => x.subject_id === nqSubject && x.form_id === nqForm);
      if (!inst) { inst = { id: newId(), form_id: nqForm, subject_id: nqSubject, status: "in_work" }; d.formInstances.push(inst); }
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === nqField);
      if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: nqField, value: "" }; d.fieldValues.push(fv); }
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: nqText.trim(), from_edit_check: !!nqConvertEc, created_at: new Date().toISOString(), priority: nqPriority });
      d.queryMessages.push({ id: newId(), query_id: qid, author_id: DEMO_USER_ID, author_name: ndaName, author_role: activeRole, body: nqText.trim(), created_at: new Date().toISOString() });
      if (nqConvertEc) { const ec = d.editChecks.find((e) => e.id === nqConvertEc); if (ec) { ec.status = "converted"; ec.converted_to = qid; } }
    });
    notifyCrc(nqConvertEc ? "Edit check converted to a query" : "New query raised", field?.label ?? "Field", subjectCode, nqSubject, nqForm, nqField);
    setNqOpen(false);
    setToast(nqConvertEc ? `Edit check converted · ${subjectCode}` : `Query raised on ${subjectCode} · ${field?.label ?? "field"}`);
  }

  // Fix 7 — bulk close (DM/Admin). Only responded/resolved queries are closable.
  const selectedItems = filtered.filter((i) => selected.has(i.id));
  const canCloseSelected = selectedItems.length > 0 && selectedItems.every((i) => i.status === "responded" || i.status === "resolved");
  function toggleSelect(id: string) { setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleSelectAll() { setSelected((s) => (s.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map((i) => i.id)))); }
  function confirmBulkClose() {
    const ids = selectedItems.map((i) => i.id);
    update((d: Dataset) => {
      for (const id of ids) {
        const q = d.queries.find((x) => x.id === id); if (!q) continue;
        q.status = "closed";
        d.queryMessages.push({ id: newId(), query_id: q.id, author_id: DEMO_USER_ID, author_name: ndaName, author_role: `${activeRole} · System`, body: `Query closed by ${ndaName} (bulk close).`, created_at: new Date().toISOString() });
      }
    });
    setBulkCloseOpen(false); setSelected(new Set()); setToast(`${ids.length} quer${ids.length === 1 ? "y" : "ies"} closed.`);
  }

  // Export — current filtered list as CSV (blinding-safe: no arm column).
  function exportCsv(rows: QueryItem[]) {
    const cols = ["Query ID", "Subject ID", "Site", "Form", "Field", "Status", "Age (days)", "Raised by", "Raised date", "Assigned to", "Last response date"];
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [cols.join(",")];
    for (const i of rows) {
      lines.push([
        i.code, i.subjectCode, i.siteName, i.formName, i.fieldLabel,
        i.status === "open" ? "Raised" : STATUS_CAP(i.status), String(i.daysOpen),
        i.raisedByName, i.openedISO ? i.openedISO.slice(0, 10) : "—", i.assignedCrc,
        i.lastResponseISO ? i.lastResponseISO.slice(0, 10) : "—",
      ].map((v) => esc(String(v))).join(","));
    }
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `arken-${study?.code ?? "study"}-queries-${today}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    setToast(`Exported ${rows.length} quer${rows.length === 1 ? "y" : "ies"} to CSV.`);
  }

  function gotoRecord(i: QueryItem) {
    if (!i.subjectId) return;
    router.push(`/study/${studyId}/data-entry/${i.subjectId}?form=${i.formId}&field=${i.fieldId}`);
  }
  function openPanel(i: QueryItem) { setPanelId(i.id); setReply(""); setManageOpen(false); setReopenOpen(false); setReopenReason(""); }
  function closePanel() { setPanelId(null); setReply(""); setManageOpen(false); setReopenOpen(false); setReopenReason(""); }

  function switchTab(t: TabKey) { setTab(t); setPanelId(null); setColSort(null); setSelected(new Set()); }

  const daysCritQuery = (i: QueryItem) => (i.status === "open" && i.daysOpen > 7) || (i.status === "responded" && i.daysOpen > 3);

  function actionsFor(i: QueryItem) {
    if (readOnly) return <span className="qy-readonly">—</span>;
    if (i.status === "resolved" || i.status === "closed") return <span className="qy-readonly">—</span>;
    const open = (e: React.MouseEvent) => { e.stopPropagation(); openPanel(i); };
    if (canManageQ) return <button className="qy-act qy-act-secondary" type="button" onClick={open}><i className="ti ti-settings" style={{ fontSize: 12 }}></i> Manage</button>;
    if (canResolve) return (
      <div className="qy-actions">
        <button className="qy-act qy-act-primary" type="button" onClick={open}>Resolve</button>
        <button className="qy-act qy-act-secondary" type="button" onClick={open}>Respond</button>
      </div>
    );
    if (canRespond && i.status === "open") return <button className="qy-act qy-act-primary" type="button" onClick={open}>Respond</button>;
    return <span className="qy-readonly">—</span>;
  }

  if (!ready) return <div className="qy-screen"><div className="qy-empty"><i className="ti ti-loader-2"></i> Loading…</div></div>;

  const truncate = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
  const statusChip = (i: QueryItem) =>
    i.kind === "editcheck" ? (i.convertedTo ? <span className="qy-chip qc-converted"><i className="ti ti-arrow-right" style={{ fontSize: 11 }}></i> Converted</span> : <span className="qy-chip qc-editcheck"><i className="ti ti-alert-circle" style={{ fontSize: 11 }}></i> Edit Check</span>)
      : i.status === "open" ? <span className="qy-chip qc-raised">Raised</span>
      : i.status === "responded" ? <span className="qy-chip qc-responded">Responded</span>
      : i.status === "closed" ? <span className="qy-chip qc-closed"><i className="ti ti-square-x" style={{ fontSize: 11 }}></i> Closed</span>
      : <span className="qy-chip qc-resolved"><i className="ti ti-check" style={{ fontSize: 11 }}></i> Resolved</span>;
  const priorityChip = (i: QueryItem) =>
    i.kind === "query" && (i.priority === "urgent" || i.priority === "critical")
      ? <span className={`qy-prio qy-prio-${i.priority}`}>{i.priority === "critical" ? "Critical" : "Urgent"}</span>
      : null;
  const ageCell = (i: QueryItem) => <span className={`qy-age qy-age-${ageTone(i.daysOpen)}`}>{i.daysOpen <= 0 ? "<1d" : `${i.daysOpen}d`}</span>;
  const fieldCell = (i: QueryItem) => (
    <span className="qy-field">
      <span className="qy-field-top">
        <span className="qy-field-label" title={i.fieldLabel}>{i.fieldLabel}</span>
        {i.fieldCode && <span className="qy-field-code">{i.fieldCode}</span>}
      </span>
      <span className="qy-field-form" title={i.formPath}>{i.formPath}</span>
    </span>
  );
  // A table header — sortable (clickable, with the arrow icon) when `sortKey` is given.
  const th = (label: string, width: number, sortKey?: string) => (
    <SortTh label={label} sortKey={sortKey} sort={colSort} onSort={toggleSort} style={{ width }} />
  );

  return (
    <div className="qy-screen">
      {/* Header */}
      <div className="qy-header">
        <div className="qy-title-row">
          <div className="qy-title-left">
            <h1 className="qy-title">Queries</h1>
            <div className="qy-info-wrap">
              <button
                className="qy-info-btn"
                type="button"
                onClick={toggleInfo}
                aria-label="What do the Q- and EC- prefixes mean?"
                aria-expanded={infoOpen}
                title="What's the difference between a query (Q-) and an edit check (EC-)?"
              >
                <i className="ti ti-info-circle"></i>
              </button>
              {infoOpen && <div className="qy-info-backdrop" onClick={closeInfo} />}
              <div className={`qy-info-pop${infoOpen ? " open" : ""}`} role="dialog" aria-label="Query and edit-check definitions">
                <div className="qy-info-item">
                  <span className="qy-info-tag tc-q">Q-</span>
                  <div className="qy-info-text">
                    <div className="qy-info-name">Manual Query</div>
                    <p className="qy-info-desc">Raised by a monitor (CRA) or data manager (DM) when data needs clarification or correction. Flow: Raised → Responded (CRC) → Resolved.</p>
                  </div>
                </div>
                <div className="qy-info-item">
                  <span className="qy-info-tag tc-ec">EC-</span>
                  <div className="qy-info-text">
                    <div className="qy-info-name">Edit Check</div>
                    <p className="qy-info-desc">Raised automatically when a value fails a validation rule (out of range, missing required, inconsistent). Resolved by correcting the value, or by adding an explanation that converts it to a query.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="qy-header-actions">
            <button className="btn-secondary" type="button" onClick={() => exportCsv(tab === "queries" ? filtered : filtered)} disabled={filtered.length === 0}><i className="ti ti-download"></i> Export</button>
            {canRaiseNew && <button className="btn-primary" type="button" onClick={openNewQuery}><i className="ti ti-plus"></i> New query</button>}
          </div>
        </div>
      </div>

      {/* Tabs — Queries (Q-) vs Edit Checks (EC-) */}
      <div className="qy-tabs">
        <button className={`qy-tab${tab === "queries" ? " active" : ""}`} type="button" onClick={() => switchTab("queries")}>
          Queries <span className="qy-tab-count tc-q">{queryItems.length}</span>
        </button>
        {!hideEC && (
          <button className={`qy-tab${tab === "editchecks" ? " active" : ""}`} type="button" onClick={() => switchTab("editchecks")}>
            Edit Checks <span className="qy-tab-count tc-ec">{ecItems.filter((i) => !i.convertedTo).length}</span>
          </button>
        )}
      </div>

      {/* Filter toolbar */}
      <div className="qy-toolbar">
        <div className="qy-search"><i className="ti ti-search"></i><input type="search" placeholder={tab === "queries" ? "Search query ID, subject, field…" : "Search edit check, subject, field…"} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {tab === "queries" && (
          <select className="qy-select" value={statusF} onChange={(e) => setStatusF(e.target.value)}>
            <option value="all">All statuses</option><option value="raised">Raised</option><option value="responded">Responded</option><option value="resolved">Resolved</option>
          </select>
        )}
        <select className="qy-select" value={formF} onChange={(e) => setFormF(e.target.value)}>
          <option value="">All forms</option>{formNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="qy-select" value={siteF} onChange={(e) => setSiteF(e.target.value)}>
          <option value="">All sites</option>{siteNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {showAssign && (
          <select className="qy-select" value={assignF} onChange={(e) => setAssignF(e.target.value)}>
            <option value="all">All queries</option><option value="mine">Needs my action</option>
          </select>
        )}
        <span className="qy-count">{filtered.length} {tab === "queries" ? (filtered.length === 1 ? "query" : "queries") : (filtered.length === 1 ? "edit check" : "edit checks")}</span>
      </div>

      {/* Bulk action bar (DM/Admin, queries tab) */}
      {canBulk && tab === "queries" && selected.size > 0 && (
        <div className="qy-bulkbar">
          <span className="qy-bulkbar-count">{selected.size} selected</span>
          <button className="btn-primary" type="button" disabled={!canCloseSelected} title={canCloseSelected ? undefined : "Only responded or resolved queries can be closed"} onClick={() => setBulkCloseOpen(true)}><i className="ti ti-square-x"></i> Close selected ({selected.size})</button>
          <button className="btn-secondary" type="button" onClick={() => exportCsv(selectedItems)}><i className="ti ti-download"></i> Export selected</button>
          <button className="qy-bulkbar-clear" type="button" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="qy-table-wrap">
        {filtered.length === 0 ? (
          <div className="qy-empty">
            <div className="qy-empty-icon"><i className="ti ti-checks"></i></div>
            <div className="qy-empty-title">{tab === "queries" ? "No queries" : "No open edit checks"}</div>
            <div className="qy-empty-sub">Nothing matches the current filters.</div>
          </div>
        ) : tab === "queries" ? (
          <table className="qy-table">
            <thead>
              <tr>
                {canBulk && <th style={{ width: 34 }}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} ref={(el) => { if (el) el.indeterminate = selected.size > 0 && selected.size < filtered.length; }} onChange={toggleSelectAll} aria-label="Select all" /></th>}
                {th("Query ID", 92)}
                {th("Subject", 130, "subject")}
                {th("Site", 110, "site")}
                {th("Field", 200)}
                {th("Value", 110)}
                {th("Query text", 260)}
                {th("Status", 116, "status")}
                {th("Age", 76, "days")}
                {th("Assigned to", 160, "assignee")}
                {th("Actions", 150)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const assignee = assigneeFor(i.status);
                return (
                <tr key={i.id} className={panelId === i.id ? "active-row" : ""} onClick={() => openPanel(i)}>
                  {canBulk && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSelect(i.id)} aria-label={`Select ${i.code}`} /></td>}
                  <td><span className="qy-id">{i.code}</span></td>
                  <td>{i.subjectId ? <span className="qy-subj" onClick={(e) => { e.stopPropagation(); gotoRecord(i); }} title="Open in subject record">{i.subjectCode}</span> : <span className="qy-mono">{i.subjectCode}</span>}</td>
                  <td><span className="qy-site">{i.siteName}</span></td>
                  <td>{fieldCell(i)}</td>
                  <td><span className="qy-val">{i.enteredValue}</span></td>
                  <td><span className="qy-qtext" title={i.queryText}>{priorityChip(i)}{truncate(i.queryText)}</span></td>
                  <td>{statusChip(i)}</td>
                  <td>{ageCell(i)}</td>
                  <td><span className="qy-crc" title={`Assigned to ${i.assignedCrc}`}>{i.assignedCrc}</span>{assignee && <span className="qy-assign-verb">{assignee.role} {assignee.verb}</span>}</td>
                  <td onClick={(e) => e.stopPropagation()}>{actionsFor(i)}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        ) : (
          <table className="qy-table">
            <thead>
              <tr>
                {th("Edit check ID", 92)}
                {th("Subject", 120, "subject")}
                {th("Site", 100, "site")}
                {th("Field", 190)}
                {th("Rule", 260)}
                {th("Status", 120)}
                {th("Age", 76, "days")}
                {th("Actions", 150)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className={panelId === i.id ? "active-row" : ""} onClick={() => openPanel(i)}>
                  <td><span className="qy-id ec">{i.code}</span></td>
                  <td>{i.subjectId ? <span className="qy-subj" onClick={(e) => { e.stopPropagation(); gotoRecord(i); }} title="Open in subject record">{i.subjectCode}</span> : <span className="qy-mono">{i.subjectCode}</span>}</td>
                  <td><span className="qy-site">{i.siteName}</span></td>
                  <td>{fieldCell(i)}</td>
                  <td><span className="qy-rule"><span className="qy-rule-exp">Expected {i.normalRange}</span><span className="qy-rule-sep">·</span><span className="qy-rule-act">Entered {i.enteredValue}</span></span></td>
                  <td>{statusChip(i)}{i.convertedTo && <span className="qy-conv-to">→ {i.convertedTo}</span>}</td>
                  <td>{ageCell(i)}</td>
                  <td onClick={(e) => e.stopPropagation()}>{i.convertedTo ? <span className="qy-readonly">—</span> : canRaiseNew ? <button className="qy-act qy-act-secondary" type="button" onClick={() => openConvertEc(i)}><i className="ti ti-arrow-right" style={{ fontSize: 12 }}></i> Convert to query</button> : <span className="qy-readonly">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Summary bar */}
      <div className="qy-summary">
        {tab === "queries" ? (
          <>
            <span>Open: <span className="sv warn">{openItems.length}</span></span>
            <span>Raised: <span className="sv">{raised.length}</span></span>
            <span>Responded: <span className="sv">{responded.length}</span></span>
            <span>&gt;7 days: <span className="sv crit">{queryItems.filter((i) => daysCritQuery(i)).length}</span></span>
          </>
        ) : (
          <>
            <span>Open edit checks: <span className="sv warn">{ecItems.filter((i) => !i.convertedTo).length}</span></span>
            <span>&gt;14 days: <span className="sv crit">{ecItems.filter((i) => !i.convertedTo && i.daysOpen > 14).length}</span></span>
          </>
        )}
        <span style={{ marginLeft: "auto" }}>{study?.code} · {queryItems.length} quer{queryItems.length === 1 ? "y" : "ies"}{hideEC ? "" : ` · ${ecItems.filter((i) => !i.convertedTo).length} edit check${ecItems.filter((i) => !i.convertedTo).length === 1 ? "" : "s"}`}</span>
      </div>

      {/* Slide-in thread panel — reuses the Subject Record query panel */}
      <div className={`panel-overlay${panelItem ? " open" : ""}`} onClick={closePanel}></div>
      <div className={`slide-panel qy-panel${panelItem ? " open" : ""}`}>
        {panelItem && (
          <>
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-title">{panelItem.kind === "editcheck" ? "Edit check" : "Query thread"}</div>
                <div className="panel-title-meta"><span className="query-id">{panelItem.code}</span><span className="query-id" style={{ marginLeft: 6 }}>{panelItem.subjectCode}</span></div>
              </div>
              <button className="panel-close" onClick={closePanel} type="button"><i className="ti ti-x"></i></button>
            </div>
            {panelItem.subjectId && (
              <div className="qy-viewlink-bar">
                <span className="qy-panel-link" onClick={() => gotoRecord(panelItem)}><i className="ti ti-external-link" style={{ fontSize: 12 }}></i> View in subject record</span>
              </div>
            )}
            <div className="status-bar">
              <span className="status-bar-label">Status</span>
              {panelItem.kind === "editcheck" ? <span className="query-status qs-editcheck">{panelItem.convertedTo ? "Converted" : "Edit check"}</span> : <span className={`query-status ${QS_CLS[panelItem.status] || "qs-open"}`}>{STATUS_CAP(panelItem.status)}</span>}
              <span className="status-desc">{panelItem.kind === "editcheck" ? (panelItem.convertedTo ? `Converted to ${panelItem.convertedTo}` : "Out of range — resolve on the subject record") : panelItem.status === "open" ? "Awaiting response" : panelItem.status === "responded" ? "Awaiting CRA review" : panelItem.status === "closed" ? "Closed — no further action" : "Resolved — no further action"}</span>
              {panelItem.kind === "query" && panelItem.status !== "resolved" && panelItem.status !== "closed" && (
                <span className={`qy-panel-age qy-age-${panelDaysTone}`} style={{ marginLeft: "auto" }}>Open for {panelItem.daysOpen} day{panelItem.daysOpen === 1 ? "" : "s"}</span>
              )}
            </div>
            <div className="field-context">
              <div className="fc-label">Field</div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}><span className="fc-field">{panelItem.fieldLabel}</span><span className="fc-code">{panelItem.fieldCode}</span></div>
              <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)" }}>{panelItem.formName}</div>
            </div>
            {panelItem.kind === "editcheck" && (
              <div className="qy-rule-block">
                <div className="qy-rule-block-title"><i className="ti ti-ruler-2"></i> Validation rule</div>
                <div className="qy-rule-block-row"><span className="qy-rule-block-lbl">Rule</span><span className="qy-rule-block-val">{panelItem.queryText}</span></div>
                <div className="qy-rule-block-row"><span className="qy-rule-block-lbl">Expected</span><span className="qy-mono">{panelItem.normalRange}</span></div>
                <div className="qy-rule-block-row"><span className="qy-rule-block-lbl">Entered</span><span className="qy-rule-block-entered">{panelItem.enteredValue}</span></div>
                <div className="qy-rule-block-row"><span className="qy-rule-block-lbl">Fired</span><span className="qy-mono">{panelItem.openedISO ? panelItem.openedISO.slice(0, 10) : "—"}</span></div>
                {panelItem.convertedTo && <div className="qy-rule-block-row"><span className="qy-rule-block-lbl">Converted</span><span className="qy-conv-to">→ {panelItem.convertedTo}</span></div>}
              </div>
            )}
            <div className="thread-body">
              {panelItem.kind === "editcheck" && panelItem.ec ? (
                <div className="message"><div className="msg-header"><div className="msg-avatar av-auto">EC</div><span className="msg-author">Edit check</span><span className="msg-role">· Auto</span></div><div className="msg-bubble">{panelItem.ec.message}</div></div>
              ) : panelQueries.length > 0 ? (
                panelQueries.map((q) => (
                  <div className="query-block" key={q.id}>
                    <div className="query-block-head"><span className="query-id">{qCodeFor(q.id)}</span><span className={`query-status ${QS_CLS[q.status] || "qs-open"}`}>{STATUS_CAP(q.status)}</span></div>
                    {msgsForQuery(q.id).map((m) => { const isHuman = !!m.author_role; const name = m.author_name ?? "Edit check"; const initials = isHuman ? name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() : "EC"; return (
                      <div className="message" key={m.id}><div className="msg-header"><div className={`msg-avatar${isHuman ? "" : " av-auto"}`}>{initials}</div><span className="msg-author">{name}</span><span className="msg-role">· {isHuman ? m.author_role : "Auto"}</span></div><div className="msg-bubble">{m.body}</div></div>
                    ); })}
                  </div>
                ))
              ) : <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No thread.</p>}
            </div>
            <div className="compose-area">
              {panelItem.kind === "query" && panelItem.status === "responded" && canReopen && (
                <div className="qy-reopen">
                  {!reopenOpen ? (
                    <button className="qy-reopen-btn" type="button" onClick={() => setReopenOpen(true)}><i className="ti ti-rotate-2"></i> Re-open query</button>
                  ) : (
                    <>
                      <div className="compose-context"><i className="ti ti-rotate-2"></i> Re-opening — sends the query back to the CRC for more information</div>
                      <textarea className="compose-textarea" placeholder="Reason for re-opening…" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)}></textarea>
                      <div className="compose-btns">
                        <span className="compose-sub">Required — the CRC will be notified</span>
                        <div style={{ display: "flex", gap: "var(--space-2)" }}>
                          <button className="btn-comment" type="button" onClick={() => { setReopenOpen(false); setReopenReason(""); }}>Cancel</button>
                          <button className="btn-respond" type="button" disabled={!reopenReason.trim()} onClick={() => panelItem && reopenQuery(panelItem)}>Re-open query</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {panelItem.kind === "editcheck" ? (
                <div className="sr-perm-note"><i className="ti ti-alert-circle"></i> Edit checks are resolved on the individual subject record — correct the value, or use “Convert to query” to escalate.</div>
              ) : readOnly ? (
                <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>
              ) : panelItem.status === "resolved" ? (
                <div className="sr-perm-note"><i className="ti ti-flag-check"></i> This query is resolved — no further action.</div>
              ) : panelItem.status === "closed" ? (
                <div className="sr-perm-note"><i className="ti ti-square-x"></i> This query was closed — no further action.</div>
              ) : !panelQuery ? null : activeRole === "DM" ? (
                <>
                  <div className="compose-context"><i className="ti ti-user-circle"></i> Managing as DM</div>
                  <textarea className="compose-textarea" placeholder="Add a comment…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
                  <div className="compose-btns">
                    <span className="compose-sub">Shift+Enter for new line</span>
                    <div className="manage-q-wrap">
                      <button className="btn-respond" type="button" onClick={() => setManageOpen((o) => !o)}>Manage <i className="ti ti-chevron-down" style={{ fontSize: "11px" }}></i></button>
                      {manageOpen && <div className="manage-q-backdrop" onClick={() => setManageOpen(false)} />}
                      <div className={`manage-q-menu${manageOpen ? " open" : ""}`} role="menu">
                        <button className="manage-item" type="button" onClick={() => { respondQuery(panelQuery.id); setManageOpen(false); }}><i className="ti ti-message"></i> Respond</button>
                        <button className="manage-item" type="button" disabled={!panelHasResponse} title={panelHasResponse ? undefined : "A response is required before resolving"} onClick={() => { if (panelHasResponse) resolveQuery(panelQuery.id); }}><i className="ti ti-flag-check"></i> Resolve</button>
                        <button className="manage-item" type="button" onClick={() => { setManageOpen(false); setCloseReason(""); setCloseModalOpen(true); }}><i className="ti ti-square-x"></i> Close without response</button>
                        <button className="manage-item" type="button" onClick={() => { setManageOpen(false); setToast("Reassign — recorded (stub)."); }}><i className="ti ti-user-share"></i> Reassign</button>
                        <button className="manage-item" type="button" onClick={() => { setManageOpen(false); setToast("Escalated to the PI (stub)."); }}><i className="ti ti-arrow-up-right"></i> Escalate</button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (canRespond || canResolve || activeRole === "CRA") ? (
                <>
                  <div className="compose-context"><i className="ti ti-user-circle"></i> Acting as {activeRole}</div>
                  <textarea className="compose-textarea" placeholder="Add a response…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
                  <div className="compose-btns">
                    <span className="compose-sub">Shift+Enter for new line</span>
                    <div style={{ display: "flex", gap: "var(--space-2)" }}>
                      {(canRespond || activeRole === "CRA") && <button className={canResolve ? "btn-comment" : "btn-respond"} type="button" onClick={() => respondQuery(panelQuery.id)}>Respond</button>}
                      {canResolve && <button className="btn-respond" type="button" onClick={() => resolveQuery(panelQuery.id)}>Resolve</button>}
                    </div>
                  </div>
                </>
              ) : <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>}
            </div>
          </>
        )}
      </div>

      {/* Close-without-response modal (DM) */}
      {closeModalOpen && panelQuery && (
        <div className="sr-modal-overlay" onClick={() => { setCloseModalOpen(false); setCloseReason(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-square-x"></i> Close without response</div>
            <div className="sr-modal-body">Document an auditable reason for closing this query without a response.</div>
            <textarea className="sr-modal-input" placeholder="Reason…" value={closeReason} onChange={(e) => setCloseReason(e.target.value)} />
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}><button className="btn-secondary" type="button" onClick={() => { setCloseModalOpen(false); setCloseReason(""); }}>Cancel</button><button className="btn-primary" type="button" disabled={!closeReason.trim()} onClick={() => confirmCloseWithoutResponse(panelQuery.id)}>Close query</button></div>
          </div>
        </div>
      )}

      {/* Bulk-close confirmation modal (DM/Admin) */}
      {bulkCloseOpen && (
        <div className="sr-modal-overlay" onClick={() => setBulkCloseOpen(false)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className="ti ti-square-x"></i> Close {selectedItems.length} quer{selectedItems.length === 1 ? "y" : "ies"}?</div>
            <div className="sr-modal-body">This action will mark all selected queries as closed. This cannot be undone.</div>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}><button className="btn-secondary" type="button" onClick={() => setBulkCloseOpen(false)}>Cancel</button><button className="btn-primary" type="button" onClick={confirmBulkClose}>Close {selectedItems.length} quer{selectedItems.length === 1 ? "y" : "ies"}</button></div>
          </div>
        </div>
      )}

      {/* New-query / convert-edit-check modal (CRA/DM) */}
      {nqOpen && (
        <div className="sr-modal-overlay" onClick={() => setNqOpen(false)}>
          <div className="sr-modal qy-nq-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="sr-modal-title"><i className={nqConvertEc ? "ti ti-arrow-right" : "ti ti-plus"}></i> {nqConvertEc ? "Convert edit check to query" : "Raise a new query"}</div>
            <div className="qy-nq-grid">
              <label className="qy-nq-field"><span className="qy-nq-lbl">Subject</span>
                <select className="qy-select" value={nqSubject} disabled={!!nqConvertEc} onChange={(e) => { setNqSubject(e.target.value); setNqForm(""); setNqField(""); }}>
                  <option value="">Select a subject…</option>
                  {nqSubjects.map((s) => <option key={s.id} value={s.id}>{s.subject_code}</option>)}
                </select>
              </label>
              <label className="qy-nq-field"><span className="qy-nq-lbl">Form</span>
                <select className="qy-select" value={nqForm} disabled={!!nqConvertEc || !nqSubject} onChange={(e) => { setNqForm(e.target.value); setNqField(""); }}>
                  <option value="">{nqSubject ? "Select a form…" : "Select a subject first"}</option>
                  {nqForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
              <label className="qy-nq-field"><span className="qy-nq-lbl">Field</span>
                <select className="qy-select" value={nqField} disabled={!!nqConvertEc || !nqForm} onChange={(e) => setNqField(e.target.value)}>
                  <option value="">{nqForm ? "Select a field…" : "Select a form first"}</option>
                  {nqFields.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </label>
              <label className="qy-nq-field"><span className="qy-nq-lbl">Priority</span>
                <select className="qy-select" value={nqPriority} onChange={(e) => setNqPriority(e.target.value)}>
                  <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="critical">Critical</option>
                </select>
              </label>
              <label className="qy-nq-field qy-nq-full"><span className="qy-nq-lbl"><i className="ti ti-file-text" style={{ fontSize: 12 }}></i> Use template</span>
                <select className="qy-select" value="" onChange={(e) => { if (e.target.value) setNqText(e.target.value); }}>
                  <option value="">Select a template…</option>
                  {QUERY_TEMPLATES.map((t, k) => <option key={k} value={t}>{t.length > 70 ? `${t.slice(0, 70)}…` : t}</option>)}
                </select>
              </label>
              <label className="qy-nq-field qy-nq-full"><span className="qy-nq-lbl">Query text</span>
                <textarea className="sr-modal-input" style={{ minHeight: 90 }} placeholder="Describe the issue with this value…" value={nqText} onChange={(e) => setNqText(e.target.value)} />
              </label>
            </div>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="btn-secondary" type="button" onClick={() => setNqOpen(false)}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!nqValid} onClick={submitNewQuery}>{nqConvertEc ? "Convert to query" : "Raise query"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="qy-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button className="be-toast-x" type="button" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", paddingLeft: 8 }} onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}
