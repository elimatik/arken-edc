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
import type { Dataset, EditCheckRow, QueryRow } from "@/lib/session-store/types";
import "@/components/subject-record/subject-record.css";
import "./queries.css";

const newId = () => crypto.randomUUID();
const qCodeFor = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;
const ecCodeFor = (id: string) => `EC-${id.slice(0, 4).toUpperCase()}`;
const STATUS_CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };

type TabKey = "queries" | "editchecks";
type ItemStatus = "open" | "responded" | "resolved" | "editcheck";
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
}

// Who the query is currently assigned to (who needs to act), derived from status.
function assigneeFor(status: ItemStatus): { role: string; verb: string } | null {
  if (status === "open") return { role: "CRC", verb: "to respond" };
  if (status === "responded") return { role: "CRA", verb: "to resolve" };
  return null; // resolved — no one
}

// ─── Column sort comparator (state handled by the shared useTableSort hook) ──
const STATUS_RANK: Record<string, number> = { open: 0, responded: 1, resolved: 2, editcheck: 0 };
const assignKey = (i: QueryItem): string => assigneeFor(i.status)?.role ?? "~"; // resolved sorts last
function colCompare(a: QueryItem, b: QueryItem, key: string): number {
  switch (key) {
    case "days": return a.daysOpen - b.daysOpen;
    case "status": return (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
    case "site": return a.siteName.localeCompare(b.siteName);
    case "assignee": return assignKey(a).localeCompare(assignKey(b));
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

function buildItems(dataset: Dataset, studyId: string, hideEC: boolean, nowMs: number): QueryItem[] {
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
    const subjectCode = subj?.subject_code ?? (inst.site_id ? siteById.get(inst.site_id)?.name : inst.barn_id ? barnById.get(inst.barn_id)?.name : null) ?? "—";
    const species = subj?.species ?? study?.species ?? "";
    // Form path = immediate parent group name + form name (or just the form name).
    const parent = form.parent_form_id ? formById.get(form.parent_form_id) : null;
    const formPath = parent ? `${parent.name} — ${form.name}` : form.name;
    return { inst, form, subjectId: subj?.id ?? null, subjectCode, siteName, species, formPath };
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
    });
  }

  if (!hideEC) {
    for (const ec of dataset.editChecks) {
      if (ec.status !== "open") continue; // converted/resolved ECs are gone (the Q- shows instead)
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
      });
    }
  }
  return items;
}

export default function QueriesPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const ndaName = useNdaName();

  const study = dataset.studies.find((s) => s.id === studyId);
  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");
  const canManageQ = canQuery(activeRole, "manage");
  const readOnly = activeRole === "Sponsor" || activeRole === "Admin"; // no query actions
  const hideEC = activeRole === "Sponsor"; // blinding — no edit checks visible

  const nowMs = Date.now();
  const items = useMemo(() => buildItems(dataset, studyId, hideEC, nowMs), [dataset, studyId, hideEC, nowMs]);

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

  // ─── Filter + sort the active tab ───────────────────────────────────────────
  const filtered = tabItems
    .filter((i) => {
      if (tab === "queries") {
        if (statusF === "raised" && i.status !== "open") return false;
        if (statusF === "responded" && i.status !== "responded") return false;
        if (statusF === "resolved" && i.status !== "resolved") return false;
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
      // Column-header sort when active (asc→desc→clear); otherwise newest-first.
      if (colSort) {
        const r = colCompare(a, b, colSort.col);
        return colSort.dir === "asc" ? r : -r;
      }
      const at = a.openedISO ? Date.parse(a.openedISO) : 0;
      const bt = b.openedISO ? Date.parse(b.openedISO) : 0;
      return bt - at; // newest first by default
    });

  // ─── Panel data ─────────────────────────────────────────────────────────────
  const panelItem = panelId ? items.find((i) => i.id === panelId) ?? null : null;
  const panelQueries = panelItem?.fieldValueId
    ? dataset.queries.filter((q) => q.field_value_id === panelItem.fieldValueId).slice().sort((a, b) => ((a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1))
    : [];
  const panelQuery = panelItem?.query;
  const msgsForQuery = (qid: string) => dataset.queryMessages.filter((m) => m.query_id === qid).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const panelHasResponse = panelQuery ? msgsForQuery(panelQuery.id).some((m) => m.author_role && !m.author_role.includes("System")) : false;

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

  function gotoRecord(i: QueryItem) {
    if (!i.subjectId) return;
    router.push(`/study/${studyId}/data-entry/${i.subjectId}?form=${i.formId}&field=${i.fieldId}`);
  }
  function openPanel(i: QueryItem) { setPanelId(i.id); setReply(""); setManageOpen(false); }
  function closePanel() { setPanelId(null); setReply(""); setManageOpen(false); }

  function switchTab(t: TabKey) { setTab(t); setPanelId(null); setColSort(null); }

  const daysCritQuery = (i: QueryItem) => (i.status === "open" && i.daysOpen > 7) || (i.status === "responded" && i.daysOpen > 3);

  function actionsFor(i: QueryItem) {
    if (readOnly) return <span className="qy-readonly">—</span>;
    if (i.status === "resolved") return <span className="qy-readonly">—</span>;
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
    i.kind === "editcheck" ? <span className="qy-chip qc-editcheck"><i className="ti ti-alert-circle" style={{ fontSize: 11 }}></i> Edit Check</span>
      : i.status === "open" ? <span className="qy-chip qc-raised">Raised</span>
      : i.status === "responded" ? <span className="qy-chip qc-responded">Responded</span>
      : <span className="qy-chip qc-resolved"><i className="ti ti-check" style={{ fontSize: 11 }}></i> Resolved</span>;
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
        <div className="qy-bc">Queries</div>
        <div className="qy-title-row">
          <h1 className="qy-title">Queries</h1>
          <button className="btn-secondary" type="button"><i className="ti ti-download"></i> Export</button>
        </div>
      </div>

      {/* Tabs — Queries (Q-) vs Edit Checks (EC-) */}
      <div className="qy-tabs">
        <button className={`qy-tab${tab === "queries" ? " active" : ""}`} type="button" onClick={() => switchTab("queries")}>
          Queries <span className="qy-tab-count tc-q">{queryItems.length}</span>
        </button>
        {!hideEC && (
          <button className={`qy-tab${tab === "editchecks" ? " active" : ""}`} type="button" onClick={() => switchTab("editchecks")}>
            Edit Checks <span className="qy-tab-count tc-ec">{ecItems.length}</span>
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
                {th("Query ID", 92)}
                {th("Subject", 130, "subject")}
                {th("Site", 120, "site")}
                {th("Field", 220)}
                {th("Value", 120)}
                {th("Query text", 300)}
                {th("Status", 116, "status")}
                {th("Days open", 84, "days")}
                {th("Assigned to", 150, "assignee")}
                {th("Actions", 150)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => {
                const assignee = assigneeFor(i.status);
                return (
                <tr key={i.id} className={panelId === i.id ? "active-row" : ""} onClick={() => openPanel(i)}>
                  <td><span className="qy-id">{i.code}</span></td>
                  <td>{i.subjectId ? <span className="qy-subj" onClick={(e) => { e.stopPropagation(); gotoRecord(i); }} title="Open in subject record">{i.subjectCode}</span> : <span className="qy-mono">{i.subjectCode}</span>}</td>
                  <td><span className="qy-site">{i.siteName}</span></td>
                  <td>{fieldCell(i)}</td>
                  <td><span className="qy-val">{i.enteredValue}</span></td>
                  <td><span className="qy-qtext" title={i.queryText}>{truncate(i.queryText)}</span></td>
                  <td>{statusChip(i)}</td>
                  <td><span className={`qy-days${daysCritQuery(i) ? " crit" : ""}`}>{i.daysOpen <= 0 ? "—" : `${i.daysOpen}d`}</span></td>
                  <td>{assignee ? <><span className="qy-role">{assignee.role}</span> <span className="qy-assign-verb">{assignee.verb}</span></> : <span className="qy-readonly">—</span>}</td>
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
                {th("Subject", 130, "subject")}
                {th("Site", 120, "site")}
                {th("Field", 220)}
                {th("Value", 120)}
                {th("Normal range", 150)}
                {th("Status", 120)}
                {th("Days open", 84, "days")}
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className={panelId === i.id ? "active-row" : ""} onClick={() => openPanel(i)}>
                  <td><span className="qy-id ec">{i.code}</span></td>
                  <td>{i.subjectId ? <span className="qy-subj" onClick={(e) => { e.stopPropagation(); gotoRecord(i); }} title="Open in subject record">{i.subjectCode}</span> : <span className="qy-mono">{i.subjectCode}</span>}</td>
                  <td><span className="qy-site">{i.siteName}</span></td>
                  <td>{fieldCell(i)}</td>
                  <td><span className="qy-val">{i.enteredValue}</span></td>
                  <td><span className="qy-mono">{i.normalRange}</span></td>
                  <td>{statusChip(i)}</td>
                  <td><span className={`qy-days${i.daysOpen > 7 ? " crit" : ""}`}>{i.daysOpen <= 0 ? "—" : `${i.daysOpen}d`}</span></td>
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
            <span>Open edit checks: <span className="sv warn">{ecItems.length}</span></span>
            <span>&gt;7 days: <span className="sv crit">{ecItems.filter((i) => i.daysOpen > 7).length}</span></span>
          </>
        )}
        <span style={{ marginLeft: "auto" }}>{study?.code} · {queryItems.length} quer{queryItems.length === 1 ? "y" : "ies"}{hideEC ? "" : ` · ${ecItems.length} edit check${ecItems.length === 1 ? "" : "s"}`}</span>
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
              {panelItem.kind === "editcheck" ? <span className="query-status qs-editcheck">Edit check</span> : <span className={`query-status ${QS_CLS[panelItem.status] || "qs-open"}`}>{STATUS_CAP(panelItem.status)}</span>}
              <span className="status-desc">{panelItem.kind === "editcheck" ? "Out of range — resolve on the subject record" : panelItem.status === "open" ? "Awaiting response" : panelItem.status === "responded" ? "Awaiting CRA review" : "Resolved — no further action"}</span>
            </div>
            <div className="field-context">
              <div className="fc-label">Field</div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}><span className="fc-field">{panelItem.fieldLabel}</span><span className="fc-code">{panelItem.fieldCode}</span></div>
              <div style={{ fontSize: "10px", color: "var(--color-text-tertiary)" }}>{panelItem.formName}</div>
              {panelItem.kind === "editcheck" && (
                <div className="qy-ec-detail">
                  <span className="qy-ec-detail-row"><span className="qy-ec-detail-lbl">Value</span><span className="qy-ec-val">{panelItem.enteredValue}</span></span>
                  <span className="qy-ec-detail-row"><span className="qy-ec-detail-lbl">Normal</span><span className="qy-mono">{panelItem.normalRange}</span></span>
                  <span className="qy-ec-detail-row"><span className="qy-ec-detail-lbl">Fired</span><span className="qy-mono">{panelItem.openedISO ? panelItem.openedISO.slice(0, 10) : "—"}</span></span>
                </div>
              )}
            </div>
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
              {panelItem.kind === "editcheck" ? (
                <div className="sr-perm-note"><i className="ti ti-alert-circle"></i> Edit checks are resolved on the individual subject record — correct the value or convert it to a query there.</div>
              ) : readOnly ? (
                <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>
              ) : panelItem.status === "resolved" ? (
                <div className="sr-perm-note"><i className="ti ti-flag-check"></i> This query is resolved — no further action.</div>
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

      {toast && <div className="qy-toast" role="status"><i className="ti ti-circle-check"></i> {toast}<button className="be-toast-x" type="button" style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", paddingLeft: 8 }} onClick={() => setToast(null)}><i className="ti ti-x"></i></button></div>}
    </div>
  );
}
