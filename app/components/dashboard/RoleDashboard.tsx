"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useNdaName } from "@/lib/use-nda-name";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { isStudyLocked, latestStudyLock, LOCK_REASONS } from "@/lib/study-lock";
import { capChipClass } from "@/lib/enrollment";
import { shouldHideArms } from "@/lib/study-config";
import {
  subjectCounts, openQueryCount, respondedQueryCount, formProgress, sdvProgress, openEditCheckCount,
  pendingDeltaCount, visitCompliance, upcomingVisits, formProgressBySite, sdvProgressBySite, queryWorklist,
  brMorbidity, brMortality, brRetreatment, brMeanDart, brEnrollmentBySite, editChecksBySite,
  phFlockHealth, phMeanFcr, phMeanAdg, phFeedAnalysisStatus,
  type SiteEnrollment, type SiteFormProgress, type RatePct,
} from "@/lib/dashboard-data";
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import {
  Card,
  Chip,
  EnrollBar,
  StackedEnrollBar,
  MiniBar,
  QueryRow,
  VisitRow,
  ActivityRow,
  SdvRow,
  QcatRow,
  LockRow,
  MilestoneRow,
  UserRow,
  CfgRow,
  SafetyItem,
} from "./widgets";
import "./dashboard.css";

// TODO: Dashboard metrics should be fully derived from session store aggregates —
// wire up in a final pass after all screens are complete. The CA-0801 dashboards
// already read live counts via computeAggregates(); the generic per-role
// dashboards (PH/HF and the non-CA fallbacks) still use placeholder data.

// ─── Live study aggregates, derived from the session store (no hardcoded counts) ─
export interface StudyAggregates {
  target: number;
  screened: number;
  randomized: number;
  active: number;
  completed: number;
  withdrawn: number;
  screenFailures: number;
  openQueries: number;
  respondedQueries: number;
  openEditChecks: number;
  pendingSignatures: number;
  readyToLock: number;
  reviewedForms: number;
  aes: number;
  saes: number;
  sites: { name: string; code: string; enrolled: number }[];
  arms: { label: string; count: number }[];
  queryList: { id: string; subjectCode: string; code: string; fieldLabel: string; status: string; ageLabel: string }[];
}

function computeAggregates(dataset: Dataset, studyId: string): StudyAggregates {
  const study = dataset.studies.find((s) => s.id === studyId);
  const subs = dataset.subjects.filter((s) => s.study_id === studyId);
  const subById = new Map(subs.map((s) => [s.id, s]));
  const cnt = (st: string) => subs.filter((s) => s.status === st).length;

  const subjIds = new Set(subs.map((s) => s.id));
  const insts = dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));
  const instById = new Map(insts.map((i) => [i.id, i]));
  const instIds = new Set(insts.map((i) => i.id));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const fvById = new Map(dataset.fieldValues.map((v) => [v.id, v]));

  const openQ = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved");

  // Per-query: subject code · short ref · field label · status · relative age.
  const msgByQuery = new Map<string, string>();
  for (const m of dataset.queryMessages) {
    if (!msgByQuery.has(m.query_id) && m.created_at) msgByQuery.set(m.query_id, m.created_at);
  }
  const now = new Date();
  const ageOf = (iso?: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "1d" : `${days}d`;
  };
  const queryList = openQ.map((q) => {
    const inst = instById.get(q.form_instance_id);
    const subject = inst && inst.subject_id ? subById.get(inst.subject_id) : undefined;
    const fv = q.field_value_id ? fvById.get(q.field_value_id) : undefined;
    const field = fv ? fieldById.get(fv.form_field_id) : undefined;
    return {
      id: q.id,
      subjectCode: subject?.subject_code ?? "—",
      code: `Q-${q.id.slice(0, 4).toUpperCase()}`,
      fieldLabel: field?.label ?? q.title,
      status: q.status,
      ageLabel: ageOf(msgByQuery.get(q.id)),
    };
  });

  // Adverse Event instances that carry any value (a reported AE); SAEs = sae_flag Yes.
  const aeFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId && f.name === "Adverse Event").map((f) => f.id));
  const aeInsts = insts.filter((i) => aeFormIds.has(i.form_id) && dataset.fieldValues.some((v) => v.form_instance_id === i.id && v.value));
  const saeFieldIds = new Set(dataset.formFields.filter((f) => f.code === "sae_flag").map((f) => f.id));
  const saes = aeInsts.filter((i) => dataset.fieldValues.some((v) => v.form_instance_id === i.id && saeFieldIds.has(v.form_field_id) && v.value === "Yes")).length;

  const sites = dataset.sites
    .filter((s) => s.study_id === studyId)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((site) => ({ name: site.name, code: site.code, enrolled: subs.filter((s) => s.site_id === site.id).length }));

  const armMap = new Map<string, number>();
  subs.forEach((s) => { if (s.randomization_arm) armMap.set(s.randomization_arm, (armMap.get(s.randomization_arm) ?? 0) + 1); });

  return {
    target: study?.enrollment_target ?? 0,
    screened: subs.length,
    randomized: subs.filter((s) => !!s.randomization_arm).length,
    active: cnt("active"),
    completed: cnt("completed"),
    withdrawn: cnt("withdrawn"),
    screenFailures: cnt("screening"),
    openQueries: openQ.length,
    respondedQueries: openQ.filter((q) => q.status === "responded").length,
    openEditChecks: dataset.editChecks.filter((e) => instIds.has(e.form_instance_id) && e.status === "open").length,
    pendingSignatures: insts.filter((i) => i.status === "in_review").length,
    readyToLock: insts.filter((i) => i.status === "finalized").length,
    reviewedForms: insts.filter((i) => ["reviewed", "finalized", "locked"].includes(i.status)).length,
    aes: aeInsts.length,
    saes,
    sites,
    arms: Array.from(armMap.entries()).map(([label, count]) => ({ label, count })),
    queryList,
  };
}

// 4-colour visit-urgency palette (Tailwind 400). Legend dot = bar fill (same token).
const VW_COLORS = {
  onTime: "var(--green-500)",
  dueWeek: "var(--amber-400)",
  outside: "var(--blue-400)",
  overdue: "var(--red-400)",
};

// Shared Visit-Windows proportion bar: [On time][Due this week][Outside][Overdue],
// most-urgent last; 0-count segments are omitted from the bar.
function VisitWindowsBar({ vc, note }: { vc: { onTime: number; dueThisWeek: number; outside: number; overdue: number }; note: string }) {
  const segs = [
    { key: "onTime", label: "On time", n: vc.onTime, c: VW_COLORS.onTime },
    { key: "dueWeek", label: "Due this week", n: vc.dueThisWeek, c: VW_COLORS.dueWeek },
    { key: "outside", label: "Outside", n: vc.outside, c: VW_COLORS.outside },
    { key: "overdue", label: "Overdue", n: vc.overdue, c: VW_COLORS.overdue },
  ];
  const total = segs.reduce((s, x) => s + x.n, 0);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <Card title="Visit Windows" icon="ti-calendar-check">
      <div className="vw-wrap">
        <div className="vw-counts">
          {segs.map((s, i) => (
            <Fragment key={s.key}>
              {i > 0 && <span> · </span>}
              <span><span className="vw-dot" style={{ background: s.c }}></span>{s.label} <span className="mono">{s.n}</span></span>
            </Fragment>
          ))}
        </div>
        <div className="vw-track">
          {segs.filter((s) => s.n > 0).map((s) => (
            <div key={s.key} className="vw-seg" style={{ width: `${pct(s.n)}%`, background: s.c }} title={`${s.label}: ${s.n}`}></div>
          ))}
        </div>
        <div className="card-note" style={{ padding: 0 }}>{note}</div>
      </div>
    </Card>
  );
}

function CaVisitWindowsCard({ dataset, studyId }: { dataset: Dataset; studyId: string }) {
  return <VisitWindowsBar vc={visitCompliance(dataset, studyId)} note="Scheduled Day 14 / 28 / 56 / 84 visits vs. ±2 / 3 / 5 / 5-day windows." />;
}

const ROLE_LABEL: Record<Role, string> = {
  CRC: "CRC",
  CRA: "CRA / Monitor",
  PI: "Principal Investigator",
  DM: "Data Manager",
  Sponsor: "Sponsor",
  Admin: "Administrator",
};

// ════════════════════════════════════════════════════════════════════════════
// Customize mode — card registry + drag-to-reorder + library drawer. Layout is
// persisted to sessionStorage per study+role; resets on fresh hydration. Pure UI.
// ════════════════════════════════════════════════════════════════════════════
type CardCtx = { dataset: Dataset; studyId: string; studyCode: string; role: Role; agg: StudyAggregates };
interface DashCardDef { id: string; name: string; desc: string; icon: string; cat: string; roles: Role[]; study?: string; render: (c: CardCtx) => JSX.Element }
interface DashLayout { left: string[]; right: string[] }

const VISIT_NOTE: Record<string, string> = {
  "CA-0801": "Scheduled Day 14 / 28 / 56 / 84 visits vs. ±2 / 3 / 5 / 5-day windows.",
  "BR-2502": "BR-2502 Day 0 / 3 / 7 / 14 / 28 visits vs ±0 / 1 / 2 / 3 / 4-day windows.",
  "PH-2401": "PH-2401 weekly visits (Day 7–42) vs ±2-day windows.",
};

// ─── Registry-only lightweight card components (live data) ───────────────────
// Blinding-aware enrollment bar — two-segment (per arm) for open-label studies and
// unblinded roles; a single blue Enrolled bar when arms are hidden. Same
// shouldHideArms() helper the Reports use, so the rule lives in one place.
function EnrollmentArmBar({ ctx }: { ctx: CardCtx }) {
  const hide = shouldHideArms(ctx.dataset, ctx.studyId, ctx.role);
  const arms = ctx.agg.arms;
  const enrolled = arms.reduce((n, a) => n + a.count, 0) || ctx.agg.randomized;
  if (enrolled === 0) return null;
  const target = ctx.agg.target || enrolled;
  const remaining = Math.max(0, target - enrolled);
  const pct = target ? Math.round((enrolled / target) * 100) : 0;
  const remLeg = remaining > 0 ? [{ c: "var(--slate-300)", t: `${remaining} remaining` }] : [];
  const segs = hide
    ? [{ c: "var(--blue-400)", pct: (enrolled / target) * 100 }]
    : arms.map((a, i) => ({ c: ARM_COLORS[i % ARM_COLORS.length], pct: (a.count / target) * 100 }));
  const legs = hide
    ? [{ c: "var(--blue-400)", t: `Enrolled — ${enrolled}` }, ...remLeg]
    : [...arms.map((a, i) => ({ c: ARM_COLORS[i % ARM_COLORS.length], t: `${a.label} — ${a.count}` })), ...remLeg];
  return <EnrollBar cur={enrolled} tgt={target} pct={pct} segs={segs} legs={legs} />;
}

function SiteEnrollCard({ ctx }: { ctx: CardCtx }) {
  const bar = <EnrollmentArmBar ctx={ctx} />;
  if (ctx.studyCode === "BR-2502") return <EnrollmentBySiteCard rows={brEnrollmentBySite(ctx.dataset)} top={bar} />;
  return (
    <Card title="Study enrollment" icon="ti-users">
      {bar}
      <table className="dash-table">
        <thead><tr><th>Site</th><th>Enrolled</th></tr></thead>
        <tbody>{ctx.agg.sites.map((s) => <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}
function LockReadinessCard({ ctx }: { ctx: CardCtx }) {
  const ec = openEditCheckCount(ctx.dataset, ctx.studyId), pd = pendingDeltaCount(ctx.dataset, ctx.studyId), oq = openQueryCount(ctx.dataset, ctx.studyId);
  const sdv = sdvProgress(ctx.dataset, ctx.studyId);
  const sdvPct = sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0;
  const clean = ec === 0 && pd === 0 && oq === 0; // SDV is informational — does not gate
  return (
    <Card title="Data lock readiness" icon="ti-lock">
      <div className="agg-list">
        <div className="agg-row"><span className="agg-lbl">Open queries</span><span className="agg-val" style={{ color: oq ? "var(--amber-700)" : undefined }}>{oq}</span></div>
        <div className="agg-row"><span className="agg-lbl">Open edit checks</span><span className="agg-val" style={{ color: ec ? "var(--orange-700)" : undefined }}>{ec}</span></div>
        <div className="agg-row"><span className="agg-lbl">Pending Δ approvals</span><span className="agg-val" style={{ color: pd ? "var(--amber-700)" : undefined }}>{pd}</span></div>
        <div className="agg-row"><span className="agg-lbl"><i className="ti ti-shield-check" style={{ fontSize: "13px", marginRight: "4px", color: "var(--color-text-tertiary)" }}></i>SDV complete</span><span className="agg-val" style={{ color: "var(--color-text-secondary)" }}>{sdvPct}% ({sdv.verified} / {sdv.total})</span></div>
        <div className="agg-row"><span className="agg-lbl">Status</span><span className="agg-val" style={{ color: clean ? "var(--green-600)" : "var(--amber-700)" }}>{clean ? "Clean" : "Issues"}</span></div>
      </div>
    </Card>
  );
}
function KeyMilestonesCard() {
  return (
    <Card title="Key milestones" icon="ti-flag-2">
      <div className="milestone-list">
        <MilestoneRow label="Site initiation — all sites" sub="All sites activated" date="Sep 2025" state="done" />
        <MilestoneRow label="50% enrollment milestone" sub="Reached" date="Mar 2026" state="done" />
        <MilestoneRow label="Interim safety review" sub="Sponsor review scheduled" date="Aug 2026" state="active" />
        <MilestoneRow label="Database lock" sub="All queries resolved" date="Feb 2027" state="future" />
      </div>
      <MilestoneLegend />
    </Card>
  );
}
function SiteComparisonCard({ ctx }: { ctx: CardCtx }) {
  const fp = formProgressBySite(ctx.dataset, ctx.studyId);
  return (
    <Card title="Site comparison" icon="ti-table">
      <table className="dash-table">
        <thead><tr><th>Site</th><th>Enrolled</th><th>Forms</th></tr></thead>
        <tbody>{ctx.agg.sites.map((s) => { const r = fp.find((x) => x.code === s.code); return <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td><td className="mono">{r ? `${r.completed}/${r.total}` : "—"}</td></tr>; })}</tbody>
      </table>
    </Card>
  );
}

// ─── Card registry ──────────────────────────────────────────────────────────
const ALL: Role[] = ["CRC", "CRA", "DM", "PI", "Admin"];
const CARD_REGISTRY: Record<string, DashCardDef> = {
  enrollment:        { id: "enrollment", name: "Study enrollment", desc: "Enrolled subjects per site", icon: "ti-users", cat: "Clinical", roles: ALL, render: (c) => <SiteEnrollCard ctx={c} /> },
  visit_windows:     { id: "visit_windows", name: "Visit Windows", desc: "On-time / overdue visit compliance", icon: "ti-calendar-check", cat: "Clinical", roles: ["CRC", "CRA", "PI", "DM"], render: (c) => <VisitWindowsCard vc={visitCompliance(c.dataset, c.studyId)} note={VISIT_NOTE[c.studyCode] ?? ""} /> },
  upcoming_visits:   { id: "upcoming_visits", name: "Upcoming visits", desc: "Most urgent pending visits", icon: "ti-clock", cat: "Clinical", roles: ["CRC", "PI", "CRA"], render: (c) => <UpcomingVisitsCard dataset={c.dataset} studyId={c.studyId} /> },
  brd_outcomes:      { id: "brd_outcomes", name: "BRD outcomes", desc: "Morbidity / re-treatment / mortality", icon: "ti-virus", cat: "Clinical", roles: ["CRC", "CRA", "DM", "PI"], study: "BR-2502", render: (c) => <BrdOutcomesCard dataset={c.dataset} /> },
  flock_health:      { id: "flock_health", name: "Flock health", desc: "Birds / mortality / FCR / ADG", icon: "ti-feather", cat: "Clinical", roles: ["CRC", "CRA", "DM", "PI"], study: "PH-2401", render: (c) => <PhFlockHealthCard dataset={c.dataset} /> },
  data_completeness: { id: "data_completeness", name: "Data entry progress", desc: "Form completion by site", icon: "ti-database", cat: "Data quality", roles: ["CRC", "CRA", "DM"], render: (c) => <SiteProgressCard rows={formProgressBySite(c.dataset, c.studyId)} title="Data entry progress" icon="ti-forms" /> },
  sdv_progress:      { id: "sdv_progress", name: "SDV progress", desc: "Source-verified fields by site", icon: "ti-shield-check", cat: "Data quality", roles: ["CRA", "DM"], render: (c) => <SiteProgressCard rows={sdvProgressBySite(c.dataset, c.studyId)} title="SDV progress" icon="ti-shield-check" suffix="fields" /> },
  open_queries:      { id: "open_queries", name: "Open queries", desc: "Query counts by status", icon: "ti-message-report", cat: "Data quality", roles: ["CRC", "CRA", "DM"], render: (c) => <OpenQueriesCountCard dataset={c.dataset} studyId={c.studyId} /> },
  query_worklist:    { id: "query_worklist", name: "Query worklist", desc: "Oldest open queries", icon: "ti-list-check", cat: "Data quality", roles: ["CRA", "DM"], render: (c) => <QueryWorklistCard dataset={c.dataset} studyId={c.studyId} /> },
  lock_readiness:    { id: "lock_readiness", name: "Data lock readiness", desc: "Queries / ECs / deltas outstanding", icon: "ti-lock", cat: "Data quality", roles: ["DM", "Admin"], render: (c) => <LockReadinessCard ctx={c} /> },
  key_milestones:    { id: "key_milestones", name: "Key milestones", desc: "Study timeline", icon: "ti-flag", cat: "Oversight", roles: ["PI", "Admin", "CRC"], render: () => <KeyMilestonesCard /> },
  site_comparison:   { id: "site_comparison", name: "Site comparison", desc: "Enrolled + forms per site", icon: "ti-table", cat: "Oversight", roles: ["CRA", "DM", "Admin"], render: (c) => <SiteComparisonCard ctx={c} /> },
  study_status:      { id: "study_status", name: "Study status", desc: "Lock / enrolled / queries per study", icon: "ti-clipboard-data", cat: "Admin", roles: ["Admin"], render: () => <AdminStudyStatusCard /> },
  study_lock:        { id: "study_lock", name: "Database lock", desc: "Lock / unlock the study database", icon: "ti-lock", cat: "Admin", roles: ["Admin"], render: () => <StudyLockAdminCard /> },
  audit_health:      { id: "audit_health", name: "Audit trail health", desc: "21 CFR Part 11 status", icon: "ti-clipboard-list", cat: "Admin", roles: ["Admin"], render: () => <AdminAuditHealthCard /> },
};

function cardAvailable(def: DashCardDef, role: Role, studyCode: string): boolean {
  return def.roles.includes(role) && (!def.study || def.study === studyCode);
}

// Default per-role layout — the reset target. Study-scoped cards are folded in
// only for the matching study, mirroring the existing bespoke arrangements.
function defaultLayout(role: Role, studyCode: string): DashLayout {
  const studyClinical = studyCode === "BR-2502" ? "brd_outcomes" : studyCode === "PH-2401" ? "flock_health" : null;
  const base: Record<string, DashLayout> = {
    CRC: { left: [studyClinical ?? "enrollment", "data_completeness"], right: ["upcoming_visits", "open_queries", "visit_windows"] },
    CRA: { left: ["sdv_progress", "enrollment", ...(studyClinical ? [studyClinical] : [])], right: ["query_worklist", "visit_windows"] },
    PI:  { left: ["enrollment", "visit_windows", ...(studyClinical ? [studyClinical] : [])], right: ["upcoming_visits", "key_milestones"] },
    DM:  { left: [...(studyClinical ? [studyClinical] : ["lock_readiness"]), "data_completeness"], right: ["query_worklist", "visit_windows"] },
    Admin: { left: ["study_status", "study_lock"], right: ["audit_health", "lock_readiness"] },
  };
  const lay = base[role] ?? { left: ["enrollment"], right: [] };
  // Keep only cards that are actually available for this role+study.
  const filt = (ids: string[]) => ids.filter((id) => CARD_REGISTRY[id] && cardAvailable(CARD_REGISTRY[id], role, studyCode));
  return { left: filt(lay.left), right: filt(lay.right) };
}

const layoutKey = (studyId: string, role: Role) => `arken_dash_layout_${studyId}_${role}`;

function loadLayout(studyId: string, role: Role, studyCode: string): DashLayout {
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(layoutKey(studyId, role));
      if (raw) {
        const p = JSON.parse(raw) as DashLayout;
        if (Array.isArray(p.left) && Array.isArray(p.right)) return p;
      }
    } catch { /* fall through to default */ }
  }
  return defaultLayout(role, studyCode);
}

// ─── Customizable dashboard shell ───────────────────────────────────────────
function CustomizableDashboard({ ctx, greeting }: { ctx: CardCtx; greeting: JSX.Element }) {
  const { studyId, role, studyCode } = ctx;
  // Deterministic default on first render (SSR-safe); the saved layout loads in the
  // effect below after mount, so there's no hydration mismatch.
  const [layout, setLayout] = useState<DashLayout>(() => defaultLayout(role, studyCode));
  const [edit, setEdit] = useState(false);
  const [drawerCol, setDrawerCol] = useState<null | "left" | "right">(null);
  const [drag, setDrag] = useState<null | { id: string; col: "left" | "right" }>(null);
  const [dropAt, setDropAt] = useState<null | { col: "left" | "right"; index: number }>(null);

  // Reload layout + exit edit mode when the study or role changes (item 8).
  useEffect(() => {
    setLayout(loadLayout(studyId, role, studyCode));
    setEdit(false); setDrawerCol(null); setDrag(null); setDropAt(null);
  }, [studyId, role, studyCode]);

  const canCustomize = role !== "Sponsor";

  function persist(l: DashLayout) {
    try { sessionStorage.setItem(layoutKey(studyId, role), JSON.stringify(l)); } catch { /* ignore */ }
  }
  function saveLayout() { persist(layout); setEdit(false); setDrawerCol(null); }
  function resetLayout() { setLayout(defaultLayout(role, studyCode)); }
  function removeCard(col: "left" | "right", id: string) {
    setLayout((l) => ({ ...l, [col]: l[col].filter((x) => x !== id) }));
  }
  function addCard(col: "left" | "right", id: string) {
    setLayout((l) => (l.left.includes(id) || l.right.includes(id) ? l : { ...l, [col]: [...l[col], id] }));
  }
  function onDrop(col: "left" | "right", index: number) {
    if (!drag) return;
    setLayout((l) => {
      const fromCol = drag.col;
      const without = { left: [...l.left], right: [...l.right] };
      const fromIdx = without[fromCol].indexOf(drag.id);
      if (fromIdx >= 0) without[fromCol].splice(fromIdx, 1);
      let target = index;
      if (fromCol === col && fromIdx < index) target -= 1; // account for removal shift
      without[col].splice(Math.max(0, Math.min(target, without[col].length)), 0, drag.id);
      return without;
    });
    setDrag(null); setDropAt(null);
  }

  const onDash = new Set([...layout.left, ...layout.right]);

  function renderColumn(col: "left" | "right") {
    return (
      <div
        className="dash-col"
        onDragOver={edit ? (e) => { e.preventDefault(); if (layout[col].length === 0) setDropAt({ col, index: 0 }); } : undefined}
        onDrop={edit ? (e) => { e.preventDefault(); if (layout[col].length === 0) onDrop(col, 0); } : undefined}
      >
        {layout[col].map((id, i) => {
          const def = CARD_REGISTRY[id];
          if (!def || !cardAvailable(def, role, studyCode)) return null;
          return (
            <Fragment key={id}>
              {edit && dropAt && dropAt.col === col && dropAt.index === i && <div className="dash-drop-line" />}
              <div
                className="card-wrap"
                draggable={edit}
                onDragStart={edit ? () => setDrag({ id, col }) : undefined}
                onDragOver={edit ? (e) => { e.preventDefault(); setDropAt({ col, index: i }); } : undefined}
                onDrop={edit ? (e) => { e.preventDefault(); e.stopPropagation(); onDrop(col, i); } : undefined}
                onDragEnd={edit ? () => { setDrag(null); setDropAt(null); } : undefined}
              >
                {edit && <button className="card-remove-btn" type="button" title="Remove card" onClick={() => removeCard(col, id)}><i className="ti ti-x"></i></button>}
                {edit && <span className="card-drag-handle" title="Drag to reorder"><i className="ti ti-grip-vertical"></i></span>}
                {def.render(ctx)}
              </div>
            </Fragment>
          );
        })}
        {edit && dropAt && dropAt.col === col && dropAt.index >= layout[col].length && <div className="dash-drop-line" />}
        {edit && (
          <button className="dash-add-card" type="button" onClick={() => setDrawerCol(col)}>
            <i className="ti ti-plus"></i> Add card
          </button>
        )}
      </div>
    );
  }

  // Library = role/study-eligible cards not already on the dashboard, grouped by cat.
  const libraryByCat = useMemo(() => {
    const groups: Record<string, DashCardDef[]> = {};
    for (const def of Object.values(CARD_REGISTRY)) {
      if (!cardAvailable(def, role, studyCode)) continue;
      (groups[def.cat] ??= []).push(def);
    }
    return groups;
  }, [role, studyCode]);

  return (
    <>
      <div className="dash-header-row">
        {greeting}
        {canCustomize && (
          <button className="btn-customize" type="button" onClick={() => setEdit((e) => !e)}>
            <i className="ti ti-layout-dashboard"></i> Customize
          </button>
        )}
      </div>

      {edit && (
        <div className="customize-banner">
          <span><i className="ti ti-info-circle"></i> Drag cards to reorder · click × to remove · use Add card to add new ones</span>
          <div className="cb-actions">
            <button className="cb-btn-secondary" type="button" onClick={resetLayout}>Reset to default</button>
            <button className="cb-btn-primary" type="button" onClick={saveLayout}>Save layout</button>
          </div>
        </div>
      )}

      <div className={`dash-grid dash-2col${edit ? " edit-mode" : ""}`}>
        {renderColumn("left")}
        {renderColumn("right")}
      </div>

      {drawerCol && (
        <>
          <div className="lib-overlay" onClick={() => setDrawerCol(null)} />
          <div className="lib-drawer" role="dialog" aria-label="Card library">
            <div className="lib-head"><span>Card library</span><button className="lib-close" type="button" onClick={() => setDrawerCol(null)}><i className="ti ti-x"></i></button></div>
            <div className="lib-body">
              {Object.entries(libraryByCat).map(([cat, defs]) => (
                <div className="lib-cat" key={cat}>
                  <div className="lib-cat-label">{cat}</div>
                  {defs.map((def) => {
                    const added = onDash.has(def.id);
                    return (
                      <div className={`lib-item${added ? " added" : ""}`} key={def.id}>
                        <i className={`ti ${def.icon} lib-item-icon`}></i>
                        <div className="lib-item-body"><div className="lib-item-name">{def.name}</div><div className="lib-item-desc">{def.desc}</div></div>
                        <button className="lib-item-add" type="button" disabled={added} onClick={() => addCard(drawerCol, def.id)}>{added ? "✓ On dashboard" : "Add"}</button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="lib-foot"><button className="cb-btn-primary" type="button" onClick={() => setDrawerCol(null)}>Done</button></div>
          </div>
        </>
      )}
    </>
  );
}

interface Props {
  role: Role;
  studyName: string;
  studyCode: string;
  today: string;
}

export function RoleDashboard({ role, studyName, studyCode, today }: Props) {
  const name = useNdaName();
  const { study } = useShell();
  const { dataset, ready } = useStudySession();
  const firstName = name.split(/\s+/)[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  const agg = useMemo(() => computeAggregates(dataset, study.id), [dataset, study.id]);

  const greeting = (
    <div className="greeting">
      <div className="greeting-name">Good {partOfDay}, {firstName}</div>
      <div className="greeting-sub">
        {today ? <>{today} · </> : null}
        <span>{studyName}</span> · {ROLE_LABEL[role]}
      </div>
    </div>
  );

  // Sponsor keeps the read-only bespoke aggregate view (no Customize). Every other
  // role gets the customizable, registry-driven dashboard.
  const sponsorRender = studyCode === "CA-0801" ? CA_RENDERERS.Sponsor : studyCode === "BR-2502" ? BR_RENDERERS.Sponsor : studyCode === "PH-2401" ? PH_RENDERERS.Sponsor : undefined;

  return (
    <div className="dashboard">
      {!ready ? (
        greeting
      ) : role === "Sponsor" ? (
        <>{greeting}{sponsorRender ? sponsorRender(agg, dataset, study.id) : ROLE_RENDERERS.Sponsor()}</>
      ) : (
        <CustomizableDashboard ctx={{ dataset, studyId: study.id, studyCode, role, agg }} greeting={greeting} />
      )}
    </div>
  );
}

const ROLE_RENDERERS: Record<Role, () => JSX.Element> = {
  CRC: renderCRC,
  CRA: renderCRA,
  PI: renderPI,
  DM: renderDM,
  Sponsor: renderSponsor,
  Admin: renderAdmin,
};

// CA-0801 — bespoke CRC / PI / DM dashboards wired to live store aggregates.
type CaRenderer = (agg: StudyAggregates, dataset: Dataset, studyId: string) => JSX.Element;
const CA_RENDERERS: Partial<Record<Role, CaRenderer>> = {
  CRC: renderCaCRC,
  CRA: renderCaCRA,
  PI: renderCaPI,
  DM: renderCaDM,
  Sponsor: renderCaSponsor,
};

const ENROLL_COLORS = {
  active: "var(--blue-400)",
  completed: "var(--green-500)",
  withdrawn: "var(--red-400)",
  screenFail: "var(--amber-400)",
};
// Categorical arm colors (distinct hues, no purple): blue · amber · red.
const ARM_COLORS = ["var(--blue-400)", "var(--amber-400)", "var(--red-400)"];

// Legend for the milestone-timeline dot colors — no color without a label.
function MilestoneLegend() {
  return (
    <div className="ms-legend">
      <span><span className="ms-dot done"></span>Completed</span>
      <span><span className="ms-dot active"></span>In progress</span>
      <span><span className="ms-dot future"></span>Upcoming</span>
    </div>
  );
}

// The four aggregate groups shared across the CA-0801 CRC/PI/DM dashboards:
// Enrollment · Compliance · Safety · Data quality. All numbers from the store.
function CaAggregates({ agg }: { agg: StudyAggregates }) {
  // Visit/medication compliance proxied from real form completeness (no separate
  // compliance source in the store): % of started forms reaching review.
  const startedForms = agg.reviewedForms + agg.pendingSignatures + agg.openQueries;
  const formCompletePct = startedForms > 0 ? Math.round((agg.reviewedForms / startedForms) * 100) : 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)" }}>
      <Card title="Enrollment" icon="ti-users">
        <StackedEnrollBar
          total={agg.screened}
          target={agg.target}
          segments={[
            { label: "Active", count: agg.active, color: ENROLL_COLORS.active },
            { label: "Completed", count: agg.completed, color: ENROLL_COLORS.completed },
            { label: "Withdrawn", count: agg.withdrawn, color: ENROLL_COLORS.withdrawn },
            { label: "Screen failures", count: agg.screenFailures, color: ENROLL_COLORS.screenFail },
          ]}
        />
        <div className="agg-list" style={{ marginTop: "var(--space-3)" }}>
          <div className="agg-row"><span className="agg-lbl">Screened</span><span className="agg-val">{agg.screened}</span></div>
          <div className="agg-row"><span className="agg-lbl">Randomized</span><span className="agg-val">{agg.randomized}</span></div>
          <div className="agg-row"><span className="agg-lbl">Enrollment target</span><span className="agg-val">{agg.target}</span></div>
        </div>
      </Card>
      <Card title="Compliance" icon="ti-checklist">
        <SdvRow name="Form completeness" pct={formCompletePct} />
        <SdvRow name="Forms reviewed" pct={startedForms > 0 ? Math.round((agg.reviewedForms / Math.max(1, startedForms)) * 100) : 0} />
        <div className="card-note">
          Derived from {agg.reviewedForms} reviewed of {startedForms} started forms.
        </div>
      </Card>
      <Card title="Safety" icon="ti-shield-exclamation">
        <div className="safety-list">
          <SafetyItem tone={agg.aes > 0 ? "s-warn" : "s-good"} icon="ti-alert-triangle" title="Adverse events" sub="Reported across all sites" count={String(agg.aes)} />
          <SafetyItem tone={agg.saes > 0 ? "s-crit" : "s-good"} icon="ti-circle-check" title="Serious AEs (SAEs)" sub={agg.saes > 0 ? "Require expedited reporting" : "None reported"} count={String(agg.saes)} />
          <SafetyItem tone={agg.pendingSignatures > 0 ? "s-warn" : ""} icon="ti-clipboard-list" title="Forms in review" sub="Awaiting sign-off" count={String(agg.pendingSignatures)} />
        </div>
      </Card>
      <Card title="Data quality" icon="ti-database">
        <div className="agg-list">
          <div className="agg-row"><span className="agg-lbl">Open queries</span><span className="agg-val" style={{ color: agg.openQueries ? "var(--amber-700)" : undefined }}>{agg.openQueries}</span></div>
          <div className="agg-row"><span className="agg-lbl">Open edit checks</span><span className="agg-val" style={{ color: agg.openEditChecks ? "var(--orange-700)" : undefined }}>{agg.openEditChecks}</span></div>
          <div className="agg-row"><span className="agg-lbl">Pending signatures</span><span className="agg-val" style={{ color: agg.pendingSignatures ? "var(--amber-700)" : undefined }}>{agg.pendingSignatures}</span></div>
        </div>
      </Card>
    </div>
  );
}

// Compact, dense open-queries list (item 4) — subject · ref · field · status · age.
function CaQueryCard({ agg, studyId }: { agg: StudyAggregates; studyId: string }) {
  return (
    <Card title="Open queries" icon="ti-message-report" action="View all →" actionHref={`/study/${studyId}/queries`}>
      {agg.queryList.length === 0 ? (
        <div className="dq-empty">No open queries.</div>
      ) : (
        <div className="dq-list">
          {agg.queryList.slice(0, 8).map((q) => (
            <div className="dq-row" key={q.id}>
              <span className="dq-id mono">{q.subjectCode}</span>
              <span className="dq-code mono">{q.code}</span>
              <span className="dq-field">{q.fieldLabel}</span>
              <span className={`dq-status ${q.status}`}>{q.status === "responded" ? "Responded" : "Open"}</span>
              <span className="dq-age mono">{q.ageLabel}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ══ CA-0801 · CRC ══════════════════════════════════════════════════════════
function renderCaCRC(agg: StudyAggregates, dataset: Dataset, studyId: string) {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val={String(agg.randomized)} label="Randomized" accent="blue" />
        <Chip val={String(agg.active)} label="Active subjects" />
        <Chip val={String(agg.openQueries)} label="Open queries" accent={agg.openQueries ? "warn" : ""} />
        <Chip val={String(agg.openEditChecks)} label="Open edit checks" accent={agg.openEditChecks ? "crit" : ""} />
        <Chip val={String(agg.target)} label="Enrollment target" />
      </div>
      <CaAggregates agg={agg} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <CaQueryCard agg={agg} studyId={studyId} />
        </div>
        <div className="dash-col">
          <CaVisitWindowsCard dataset={dataset} studyId={studyId} />
          <Card title="Sites" icon="ti-building-hospital">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Enrolled</th></tr></thead>
              <tbody>
                {agg.sites.map((s) => (
                  <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ CA-0801 · PI ═══════════════════════════════════════════════════════════
function renderCaPI(agg: StudyAggregates) {
  const armTotal = agg.arms.reduce((a, x) => a + x.count, 0) || 1;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val={String(agg.randomized)} label={`Randomized · ${agg.sites.length} sites`} accent="blue" />
        <Chip val={String(agg.active)} label="Active subjects" accent="good" />
        <Chip val={String(agg.saes)} label="Serious AEs" accent={agg.saes ? "crit" : "good"} />
        <Chip val={String(agg.screenFailures)} label="Screen failures" />
        <Chip val={String(agg.openQueries)} label="Open queries" accent={agg.openQueries ? "warn" : ""} />
      </div>
      <CaAggregates agg={agg} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <Card title="Site enrollment" icon="ti-building-hospital">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Enrolled</th></tr></thead>
              <tbody>
                {agg.sites.map((s) => (
                  <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Randomization balance" icon="ti-scale">
            <div className="arm-list">
              {agg.arms.map((a, i) => (
                <div key={a.label}>
                  <div className="arm-hdr"><span className="arm-label">{a.label}</span><span className="arm-count">{a.count} subjects</span></div>
                  <div className="arm-track"><div className="arm-fill" style={{ width: `${Math.round((a.count / armTotal) * 100)}%`, background: ARM_COLORS[i % ARM_COLORS.length] }}></div></div>
                </div>
              ))}
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-2)" }}>
                Protocol target 2:1 (Active:Placebo)
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ CA-0801 · DM ═══════════════════════════════════════════════════════════
function renderCaDM(agg: StudyAggregates, dataset: Dataset, studyId: string) {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
        <Chip val={String(agg.randomized)} label="Randomized" />
        <Chip val={String(agg.reviewedForms)} label="Forms reviewed" accent="good" />
        <Chip val={String(agg.openQueries)} label="Open queries" accent={agg.openQueries ? "warn" : ""} />
        <Chip val={String(agg.openEditChecks)} label="Open edit checks" accent={agg.openEditChecks ? "crit" : ""} />
        <Chip val={String(agg.pendingSignatures)} label="Pending signatures" accent={agg.pendingSignatures ? "warn" : ""} />
        <Chip val={String(agg.readyToLock)} label="Ready to lock" accent="blue" />
      </div>
      <CaAggregates agg={agg} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <CaQueryCard agg={agg} studyId={studyId} />
        </div>
        <div className="dash-col">
          <CaVisitWindowsCard dataset={dataset} studyId={studyId} />
          <Card title="Enrollment by site" icon="ti-database">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Enrolled</th></tr></thead>
              <tbody>
                {agg.sites.map((s) => (
                  <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ CA-0801 · CRA ══════════════════════════════════════════════════════════
// Monitoring view — all site labels come from the store (real CA sites), never a
// hardcoded city list. Reuses the generic SDV / query / visit-window helpers.
function renderCaCRA(agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const sdv = sdvProgress(dataset, studyId);
  const toResolve = openQueryCount(dataset, studyId);
  const ec = openEditCheckCount(dataset, studyId);
  const sdvPct = sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={`${sdv.verified} / ${sdv.total}`} label={`Fields SDV-verified (${sdvPct}%)`} accent="blue" />
        <Chip val={String(toResolve)} label="Queries to resolve" accent={toResolve ? "warn" : ""} />
        <Chip val={String(ec)} label="Open edit checks" accent={ec ? "crit" : ""} />
        <Chip val={String(agg.sites.length)} label="Active sites" accent="good" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <SiteProgressCard rows={sdvProgressBySite(dataset, studyId)} title="SDV progress by site" icon="ti-shield-check" suffix="fields" />
          <Card title="Site status" icon="ti-building-hospital">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Enrolled</th></tr></thead>
              <tbody>
                {agg.sites.map((s) => (
                  <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="dash-col">
          <QueryWorklistCard dataset={dataset} studyId={studyId} />
          <CaVisitWindowsCard dataset={dataset} studyId={studyId} />
        </div>
      </div>
    </>
  );
}

// ══ CA-0801 · Sponsor (live, blinded aggregate — real sites, no city placeholders) ══
function renderCaSponsor(agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const enrolledPct = agg.target ? Math.round((agg.randomized / agg.target) * 100) : 0;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val={String(agg.randomized)} label="Subjects enrolled" accent="blue" />
        <Chip val={`${enrolledPct}%`} label="Enrollment progress" accent="good" />
        <Chip val={String(agg.sites.length)} label="Sites active" accent="good" />
        <Chip val={String(agg.saes)} label="Active SAEs" accent={agg.saes ? "crit" : "good"} />
        <Chip val={String(agg.withdrawn)} label="Withdrawals" accent={agg.withdrawn ? "warn" : ""} />
      </div>
      <CaAggregates agg={agg} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <Card title="Site enrollment" icon="ti-building-hospital">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Enrolled</th></tr></thead>
              <tbody>
                {agg.sites.map((s) => (
                  <tr key={s.code}><td>{s.code} · {s.name}</td><td className="mono">{s.enrolled}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="dash-col">
          <CaVisitWindowsCard dataset={dataset} studyId={studyId} />
        </div>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// BR-2502 — live-wired CRC / CRA / DM dashboards (same widgets + layout as CA).
// ════════════════════════════════════════════════════════════════════════════
const SEV = (pct: number | null, warnAt = 10, badAt = 25) =>
  pct == null ? undefined : pct >= badAt ? "var(--red-600)" : pct >= warnAt ? "var(--amber-700)" : "var(--green-600)";
const pctTxt = (p: number | null) => (p == null ? "—" : `${Math.round(p)}%`);

// Generic visit-window card (On time / Outside / Overdue + proportion bar) — the
// CaVisitWindowsCard generalised for any study's visit schedule.
function VisitWindowsCard({ vc, note }: { vc: { onTime: number; dueThisWeek: number; outside: number; overdue: number }; note: string }) {
  return <VisitWindowsBar vc={vc} note={note} />;
}

function EnrollmentBySiteCard({ rows, title = "Enrollment by feedlot", top }: { rows: SiteEnrollment[]; title?: string; top?: JSX.Element }) {
  return (
    <Card title={title} icon="ti-building-warehouse">
      {top}
      <table className="dash-table">
        <thead><tr><th>Feedlot</th><th>Enrolled / Target</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.siteId}>
              <td>{r.label}</td>
              <td className="mono">{r.enrolled} / {r.target ?? "—"}</td>
              <td>{r.target == null ? <span className="dash-hint">—</span> : <span className={`cap-chip ${capChipClass(r.capLevel)}`}>{r.capLevel === "over" ? "Over cap" : r.capLevel === "at" ? "At cap" : r.capLevel === "near" ? "Near cap" : "Under cap"}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// Per-site completion bars (form completion / SDV) — least-complete first optional.
function SiteProgressCard({ rows, title, icon, suffix }: { rows: SiteFormProgress[]; title: string; icon: string; suffix?: string }) {
  return (
    <Card title={title} icon={icon}>
      <div style={{ paddingTop: "var(--space-3)" }}>
        {rows.map((r) => (
          <div className="dash-bar" key={r.siteId}>
            <div className="dash-bar-hdr">
              <span className="dash-bar-name">{r.code} · {r.name}</span>
              <span className="dash-bar-count">{r.completed} / {r.total}{suffix ? ` ${suffix}` : ""}</span>
            </div>
            <div className="dash-bar-track"><div className={`dash-bar-fill${r.pct < 60 ? " low" : ""}`} style={{ width: `${r.pct}%` }}></div></div>
            <div className="dash-bar-pct">{r.pct}%</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function UpcomingVisitsCard({ dataset, studyId }: { dataset: Dataset; studyId: string }) {
  const rows = upcomingVisits(dataset, studyId, 5);
  return (
    <Card title="Upcoming visits" icon="ti-calendar-clock" action="View all →" actionHref={`/study/${studyId}/visits`}>
      {rows.length === 0 ? (
        <div className="dq-empty">No visits due this week.</div>
      ) : (
        <table className="dash-table">
          <thead><tr><th>Animal</th><th>Feedlot</th><th>Visit</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="mono">{v.subjectCode}</td>
                <td>{v.siteName}</td>
                <td>{v.visitName}</td>
                <td><span className={`vstat ${v.urgency === 0 ? "vstat-over" : v.urgency === 1 ? "vstat-today" : "vstat-week"}`}>{v.statusLabel}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function OpenQueriesCountCard({ dataset, studyId }: { dataset: Dataset; studyId: string }) {
  const open = openQueryCount(dataset, studyId);
  const responded = respondedQueryCount(dataset, studyId);
  const raised = Math.max(0, open - responded);
  return (
    <Card title="Open queries" icon="ti-message-report" action="Queries screen →" actionHref={`/study/${studyId}/queries`}>
      <div className="agg-list">
        <div className="agg-row"><span className="agg-lbl">Raised — awaiting response</span><span className="agg-val" style={{ color: raised ? "var(--amber-700)" : undefined }}>{raised}</span></div>
        <div className="agg-row"><span className="agg-lbl">Responded — awaiting resolution</span><span className="agg-val" style={{ color: responded ? "var(--blue-600)" : undefined }}>{responded}</span></div>
        <div className="agg-row"><span className="agg-lbl">Total open</span><span className="agg-val">{open}</span></div>
      </div>
    </Card>
  );
}

function QueryWorklistCard({ dataset, studyId }: { dataset: Dataset; studyId: string }) {
  const rows = queryWorklist(dataset, studyId, 5);
  return (
    <Card title="Query worklist" icon="ti-message-report" action="Queries screen →" actionHref={`/study/${studyId}/queries`}>
      {rows.length === 0 ? (
        <div className="dq-empty">No open queries.</div>
      ) : (
        <div className="dq-list">
          {rows.map((q) => (
            <div className="dq-row" key={q.id}>
              <span className="dq-id mono">{q.subjectCode}</span>
              <span className="dq-code mono">{q.code}</span>
              <span className="dq-field">Open query</span>
              <span className="dq-age mono" style={{ color: q.daysOpen > 7 ? "var(--red-600)" : undefined }}>{q.daysOpen}d</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ══ BR-2502 · CRC ══════════════════════════════════════════════════════════
function renderBrCRC(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const sc = subjectCounts(dataset, studyId);
  const fp = formProgress(dataset, studyId);
  const vc = visitCompliance(dataset, studyId);
  const enrolled = sc.active + sc.completed + sc.withdrawn;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={String(enrolled)} label="Animals enrolled" accent="blue" />
        <Chip val={String(openQueryCount(dataset, studyId))} label="Open queries" accent={openQueryCount(dataset, studyId) ? "warn" : ""} />
        <Chip val={`${fp.completed} / ${fp.total}`} label="Forms completed" />
        <Chip val={`${vc.overdue} · ${vc.dueThisWeek}`} label="visits overdue · due this week" accent={vc.overdue ? "crit" : vc.dueThisWeek ? "warn" : ""} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <EnrollmentBySiteCard rows={brEnrollmentBySite(dataset)} />
          <SiteProgressCard rows={formProgressBySite(dataset, studyId)} title="Data entry progress" icon="ti-forms" />
        </div>
        <div className="dash-col">
          <UpcomingVisitsCard dataset={dataset} studyId={studyId} />
          <OpenQueriesCountCard dataset={dataset} studyId={studyId} />
        </div>
      </div>
    </>
  );
}

// ══ BR-2502 · CRA ══════════════════════════════════════════════════════════
function renderBrCRA(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const sdv = sdvProgress(dataset, studyId);
  const toResolve = openQueryCount(dataset, studyId);
  const ec = openEditCheckCount(dataset, studyId);
  const nSites = dataset.sites.filter((s) => s.study_id === studyId).length;
  const sdvPct = sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={`${sdv.verified} / ${sdv.total}`} label={`Fields SDV-verified (${sdvPct}%)`} accent="blue" />
        <Chip val={String(toResolve)} label="Queries to resolve" accent={toResolve ? "warn" : ""} />
        <Chip val={String(ec)} label="Open edit checks" accent={ec ? "crit" : ""} />
        <Chip val={String(nSites)} label="Active feedlots" accent="good" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <SiteProgressCard rows={sdvProgressBySite(dataset, studyId)} title="SDV progress by feedlot" icon="ti-shield-check" suffix="fields" />
          <EnrollmentBySiteCard rows={brEnrollmentBySite(dataset)} title="Enrollment status" />
        </div>
        <div className="dash-col">
          <QueryWorklistCard dataset={dataset} studyId={studyId} />
          <VisitWindowsCard vc={visitCompliance(dataset, studyId)} note="BR-2502 Day 0 / 3 / 7 / 14 / 28 visits vs ±0 / 1 / 2 / 3 / 4-day windows." />
        </div>
      </div>
    </>
  );
}

// ══ BR-2502 · DM ═══════════════════════════════════════════════════════════
function BrdOutcomesCard({ dataset }: { dataset: Dataset }) {
  const morb = brMorbidity(dataset), retx = brRetreatment(dataset), mort = brMortality(dataset);
  const dart = brMeanDart(dataset);
  const Stat = ({ label, r, warnAt, badAt }: { label: string; r: RatePct; warnAt?: number; badAt?: number }) => (
    <div className="brd-stat">
      <div className="brd-stat-val" style={{ color: SEV(r.pct, warnAt, badAt) }}>{pctTxt(r.pct)}</div>
      <div className="brd-stat-lbl">{label}</div>
      <div className="brd-stat-sub mono">{r.num}/{r.denom}</div>
    </div>
  );
  return (
    <Card title="BRD outcomes (study)" icon="ti-virus">
      <div className="brd-stat-row">
        <Stat label="Morbidity" r={morb} warnAt={50} badAt={80} />
        <Stat label="Re-treatment" r={retx} warnAt={15} badAt={30} />
        <Stat label="BRD mortality" r={mort} warnAt={5} badAt={10} />
        <div className="brd-stat">
          <div className="brd-stat-val">{dart == null ? "—" : dart.toFixed(1)}</div>
          <div className="brd-stat-lbl">Mean peak DART</div>
          <div className="brd-stat-sub mono">0–3 scale</div>
        </div>
      </div>
      <div className="card-note">Study-level rollup of the per-pen Pen BRD Summary. Morbidity = treated ÷ enrolled · Re-treatment = re-treated ÷ treated · Mortality = BRD deaths ÷ enrolled.</div>
    </Card>
  );
}

function renderBrDM(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const ec = openEditCheckCount(dataset, studyId);
  const pendingDelta = pendingDeltaCount(dataset, studyId);
  const open = openQueryCount(dataset, studyId), responded = respondedQueryCount(dataset, studyId);
  const clean = open === 0 && ec === 0 && pendingDelta === 0;
  const ecBySite = editChecksBySite(dataset);
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={String(ec)} label="Open edit checks" accent={ec ? "crit" : ""} />
        <Chip val={String(pendingDelta)} label="Pending Δ approvals" accent={pendingDelta ? "warn" : ""} />
        <Chip val={`${open} · ${responded}`} label="Queries open · responded" accent={open ? "warn" : ""} />
        <Chip val={clean ? "Clean" : "Issues"} label="Lock readiness" accent={clean ? "good" : "warn"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <BrdOutcomesCard dataset={dataset} />
          <Card title="Edit checks by feedlot" icon="ti-alert-circle">
            <table className="dash-table">
              <thead><tr><th>Feedlot</th><th>Open ECs</th></tr></thead>
              <tbody>
                {ecBySite.map((s) => (
                  <tr key={s.siteId}><td>{s.code} · {s.name}</td><td className="mono" style={{ color: s.count ? "var(--orange-700)" : undefined }}>{s.count || "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
        <div className="dash-col">
          <VisitWindowsCard vc={visitCompliance(dataset, studyId)} note="BR-2502 Day 0 / 3 / 7 / 14 / 28 visits vs ±0 / 1 / 2 / 3 / 4-day windows." />
          <QueryWorklistCard dataset={dataset} studyId={studyId} />
        </div>
      </div>
    </>
  );
}

const BR_RENDERERS: Partial<Record<Role, CaRenderer>> = {
  CRC: renderBrCRC,
  CRA: renderBrCRA,
  DM: renderBrDM,
};

// ════════════════════════════════════════════════════════════════════════════
// PH-2401 — live-wired CRC / CRA / DM / Sponsor dashboards (pens, not animals;
// single facility). All data scoped to the PH study from the store — never the
// generic CA placeholders.
// ════════════════════════════════════════════════════════════════════════════
function PhFlockHealthCard({ dataset }: { dataset: Dataset }) {
  const fh = phFlockHealth(dataset);
  const fcr = phMeanFcr(dataset);
  const adg = phMeanAdg(dataset);
  return (
    <Card title="Flock health (study)" icon="ti-feather">
      <div className="brd-stat-row">
        <div className="brd-stat"><div className="brd-stat-val">{fh.totalBirdsPlaced}</div><div className="brd-stat-lbl">Birds placed</div></div>
        <div className="brd-stat"><div className="brd-stat-val">{fh.currentAlive}</div><div className="brd-stat-lbl">Currently alive</div></div>
        <div className="brd-stat"><div className="brd-stat-val" style={{ color: SEV(fh.mortalityPct, 4, 7) }}>{fh.mortalityPct == null ? "—" : `${fh.mortalityPct.toFixed(1)}%`}</div><div className="brd-stat-lbl">Mortality</div><div className="brd-stat-sub mono">{fh.cumulativeMortality} birds</div></div>
        <div className="brd-stat"><div className="brd-stat-val">{fcr == null ? "—" : fcr.toFixed(2)}</div><div className="brd-stat-lbl">Mean FCR</div><div className="brd-stat-sub mono">ADG {adg == null ? "—" : Math.round(adg)} g/d</div></div>
      </div>
      <div className="card-note">Live rollup across pens. Mortality = cumulative deaths ÷ birds placed.</div>
    </Card>
  );
}

// ══ PH-2401 · CRC ══════════════════════════════════════════════════════════
function renderPhCRC(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const sc = subjectCounts(dataset, studyId);
  const fp = formProgress(dataset, studyId);
  const vc = visitCompliance(dataset, studyId);
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={String(sc.total)} label="Pens enrolled" accent="blue" />
        <Chip val={String(openQueryCount(dataset, studyId))} label="Open queries" accent={openQueryCount(dataset, studyId) ? "warn" : ""} />
        <Chip val={`${fp.completed} / ${fp.total}`} label="Forms completed" />
        <Chip val={`${vc.overdue} · ${vc.dueThisWeek}`} label="visits overdue · due this week" accent={vc.overdue ? "crit" : vc.dueThisWeek ? "warn" : ""} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <PhFlockHealthCard dataset={dataset} />
          <SiteProgressCard rows={formProgressBySite(dataset, studyId)} title="Data entry progress" icon="ti-forms" />
        </div>
        <div className="dash-col">
          <UpcomingVisitsCard dataset={dataset} studyId={studyId} />
          <OpenQueriesCountCard dataset={dataset} studyId={studyId} />
        </div>
      </div>
    </>
  );
}

// ══ PH-2401 · CRA ══════════════════════════════════════════════════════════
function renderPhCRA(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const sdv = sdvProgress(dataset, studyId);
  const toResolve = openQueryCount(dataset, studyId);
  const ec = openEditCheckCount(dataset, studyId);
  const fa = phFeedAnalysisStatus(dataset);
  const sdvPct = sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={`${sdv.verified} / ${sdv.total}`} label={`Fields SDV-verified (${sdvPct}%)`} accent="blue" />
        <Chip val={String(toResolve)} label="Queries to resolve" accent={toResolve ? "warn" : ""} />
        <Chip val={String(ec)} label="Open edit checks" accent={ec ? "crit" : ""} />
        <Chip val={`${fa.confirmed} / ${fa.total}`} label="T02 feed analysis confirmed" accent={fa.pending ? "warn" : "good"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <SiteProgressCard rows={sdvProgressBySite(dataset, studyId)} title="SDV progress" icon="ti-shield-check" suffix="fields" />
          <PhFlockHealthCard dataset={dataset} />
        </div>
        <div className="dash-col">
          <QueryWorklistCard dataset={dataset} studyId={studyId} />
          <VisitWindowsCard vc={visitCompliance(dataset, studyId)} note="PH-2401 weekly visits (Day 7–42) vs ±2-day windows." />
        </div>
      </div>
    </>
  );
}

// ══ PH-2401 · DM ═══════════════════════════════════════════════════════════
function renderPhDM(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const ec = openEditCheckCount(dataset, studyId);
  const pendingDelta = pendingDeltaCount(dataset, studyId);
  const open = openQueryCount(dataset, studyId), responded = respondedQueryCount(dataset, studyId);
  const clean = open === 0 && ec === 0 && pendingDelta === 0;
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={String(ec)} label="Open edit checks" accent={ec ? "crit" : ""} />
        <Chip val={String(pendingDelta)} label="Pending Δ approvals" accent={pendingDelta ? "warn" : ""} />
        <Chip val={`${open} · ${responded}`} label="Queries open · responded" accent={open ? "warn" : ""} />
        <Chip val={clean ? "Clean" : "Issues"} label="Lock readiness" accent={clean ? "good" : "warn"} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <PhFlockHealthCard dataset={dataset} />
          <SiteProgressCard rows={formProgressBySite(dataset, studyId)} title="Data entry progress" icon="ti-forms" />
        </div>
        <div className="dash-col">
          <VisitWindowsCard vc={visitCompliance(dataset, studyId)} note="PH-2401 weekly visits (Day 7–42) vs ±2-day windows." />
          <QueryWorklistCard dataset={dataset} studyId={studyId} />
        </div>
      </div>
    </>
  );
}

// ══ PH-2401 · Sponsor (live aggregate) ═════════════════════════════════════
function renderPhSponsor(_agg: StudyAggregates, dataset: Dataset, studyId: string) {
  const sc = subjectCounts(dataset, studyId);
  const fh = phFlockHealth(dataset);
  const fcr = phMeanFcr(dataset);
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Chip val={String(sc.total)} label="Pens enrolled" accent="blue" />
        <Chip val={String(fh.totalBirdsPlaced)} label="Birds placed" accent="good" />
        <Chip val={fh.mortalityPct == null ? "—" : `${fh.mortalityPct.toFixed(1)}%`} label="Mortality" accent={fh.mortalityPct && fh.mortalityPct > 5 ? "warn" : "good"} />
        <Chip val={fcr == null ? "—" : fcr.toFixed(2)} label="Mean FCR" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
        <div className="dash-col">
          <PhFlockHealthCard dataset={dataset} />
        </div>
        <div className="dash-col">
          <VisitWindowsCard vc={visitCompliance(dataset, studyId)} note="PH-2401 weekly visits (Day 7–42) vs ±2-day windows." />
        </div>
      </div>
    </>
  );
}

const PH_RENDERERS: Partial<Record<Role, CaRenderer>> = {
  CRC: renderPhCRC,
  CRA: renderPhCRA,
  DM: renderPhDM,
  Sponsor: renderPhSponsor,
};

// ══ CRC ═══════════════════════════════════════════════════════════════════
function renderCRC() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="30" label="Subjects enrolled" accent="blue" trend={{ d: "up", t: "+2 this week" }} />
        <Chip val="40" label="Site target" />
        <Chip val="3" label="Queries assigned to me" accent="warn" />
        <Chip val="2" label="Forms overdue" accent="crit" />
        <Chip val="4" label="Visits this week" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="My open queries" icon="ti-message-report" action="View all →">
            <div className="query-list">
              <QueryRow subject="AUSB1P1-01" text="Rectal temp — Visit 2 (28.5°C out of range)" meta="Q-001 · Edit check · May 07" status="Awaiting my response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="AUSB1P2-01" text="Body weight — Visit 1 (missing unit)" meta="Q-002 · J. Hollis (CRA) · May 06" status="Awaiting my response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="AUSB1P3-01" text="AE form — date inconsistency" meta="Q-003 · Edit check · May 04" status="Responded" icon="qi-auto" badge="qb-resp" />
            </div>
          </Card>
          <Card title="Overdue forms" icon="ti-forms" action="Open Data Entry →">
            <div className="list-rows">
              <VisitRow day="06" mon="Jun" primary="AUSB1P3-01 · Bovine #A-006" secondary="Visit 2 — Physical exam" tagCls="vt-overdue" tagTxt="Overdue 3 days" overdue />
              <VisitRow day="07" mon="Jun" primary="AUSB1P3-02 · Bovine #A-007" secondary="Visit 2 — Treatment admin." tagCls="vt-overdue" tagTxt="Overdue 2 days" overdue />
            </div>
          </Card>
          <Card title="Recent activity" icon="ti-activity">
            <div>
              <ActivityRow icon="ti-forms" ts="Today 08:42 UTC"><strong>AUSB1P1-01</strong> — Visit 2 Physical exam saved</ActivityRow>
              <ActivityRow icon="ti-message-report" ts="Yesterday 16:14 UTC">Query Q-003 response submitted for <strong>AUSB1P3-01</strong></ActivityRow>
              <ActivityRow icon="ti-check" ts="Jun 07 · 11:30 UTC"><strong>AUSB1P1-04</strong> — End of study form completed</ActivityRow>
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Site enrollment" icon="ti-users">
            <EnrollBar cur={30} tgt={40} pct={75}
              segs={[{ c: "var(--blue-400)", pct: (16 / 40) * 100 }, { c: "var(--amber-400)", pct: (14 / 40) * 100 }]}
              legs={[
              { c: "var(--blue-400)", t: "Group A — 16 subjects" },
              { c: "var(--amber-400)", t: "Group B — 14 subjects" },
              { c: "var(--slate-300)", t: "10 slots remaining" },
            ]} />
          </Card>
          <Card title="Upcoming visits" icon="ti-calendar-event" action="View all →">
            <div className="list-rows">
              <VisitRow day="09" mon="Jun" primary="AUSB1P1-02 · Bovine #A-002" secondary="Visit 3 — Day 14" tagCls="vt-today" tagTxt="Today" />
              <VisitRow day="10" mon="Jun" primary="AUSB1P2-01 · Bovine #A-005" secondary="Visit 3 — Day 14" tagCls="vt-due" tagTxt="Tomorrow" />
              <VisitRow day="11" mon="Jun" primary="AUSB1P1-03 · Bovine #A-003" secondary="Visit 3 — Day 14" tagCls="vt-due" tagTxt="In 2 days" />
              <VisitRow day="14" mon="Jun" primary="AUSB2P4-01 · Bovine #B-001" secondary="Visit 4 — Day 28" tagCls="vt-due" tagTxt="In 5 days" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ CRA ═══════════════════════════════════════════════════════════════════
function SiteCompareRow({ name, enrolled, target, queries, overdue, last }: { name: string; enrolled: number; target: number; queries: number; overdue: number; last: string }) {
  const pct = Math.round((enrolled / target) * 100);
  return (
    <tr>
      <td>{name}</td>
      <td className="mono">{enrolled}</td>
      <td className="mono muted">{target}</td>
      <td><MiniBar pct={pct} /></td>
      <td className={queries > 3 ? "nw" : "mono muted"}>{queries || "—"}</td>
      <td className={overdue > 0 ? "na" : "mono muted"}>{overdue || "—"}</td>
      <td className="mono muted" style={{ fontSize: "var(--text-xs)" }}>{last}</td>
    </tr>
  );
}

function renderCRA() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="89" label="Subjects enrolled (all sites)" accent="blue" trend={{ d: "up", t: "+5 this week" }} />
        <Chip val="11" label="Total open queries" accent="warn" />
        <Chip val="3" label="Overdue queries (> 7 days)" accent="crit" />
        <Chip val="62%" label="Avg SDV progress" />
        <Chip val="3" label="Monitoring visits scheduled" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Site comparison" icon="ti-building-hospital" action="Export →">
            <table className="dash-table">
              <thead>
                <tr><th>Site</th><th>Enrolled</th><th>Target</th><th>Progress</th><th>Queries</th><th>Overdue</th><th>Last entry</th></tr>
              </thead>
              <tbody>
                <SiteCompareRow name="Austin" enrolled={30} target={40} queries={4} overdue={2} last="May 09" />
                <SiteCompareRow name="Dallas" enrolled={29} target={40} queries={5} overdue={1} last="May 08" />
                <SiteCompareRow name="Houston" enrolled={30} target={40} queries={2} overdue={0} last="May 09" />
              </tbody>
            </table>
          </Card>
          <Card title="Open queries by site" icon="ti-message-report" action="View all →">
            <div className="query-list">
              <QueryRow subject="AUSB1P1-01" text="Rectal temp — Visit 2 out of range" meta="Q-001 · Austin · Edit check · May 07" status="Awaiting CRC response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="DALB1P7-02" text="Body weight missing unit — Visit 1" meta="Q-004 · Dallas · J. Hollis · May 06" status="Awaiting CRC response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="HOUB1P1-02" text="Clinical remarks — inconsistency" meta="Q-005 · Houston · Edit check · May 05" status="Responded" icon="qi-auto" badge="qb-resp" />
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="SDV progress" icon="ti-shield-check">
            <div>
              <SdvRow name="Austin Research Center" pct={74} />
              <SdvRow name="Dallas Vet Clinic" pct={58} />
              <SdvRow name="Houston Animal Hospital" pct={42} />
            </div>
          </Card>
          <Card title="Next monitoring visits" icon="ti-calendar">
            <div className="list-rows">
              <VisitRow day="15" mon="Jun" primary="Austin Research Center" secondary="Routine monitoring · SDV planned" tagCls="vt-due" tagTxt="In 6 days" />
              <VisitRow day="22" mon="Jun" primary="Dallas Vet Clinic" secondary="Routine monitoring" tagCls="vt-due" tagTxt="In 13 days" />
              <VisitRow day="01" mon="Jul" primary="Houston Animal Hospital" secondary="Follow-up visit" tagCls="vt-due" tagTxt="In 22 days" />
            </div>
          </Card>
          <Card title="Recent activity" icon="ti-activity">
            <div>
              <ActivityRow icon="ti-shield-check" ts="Today 09:00 UTC">SDV completed — <strong>AUSB1P1-01</strong> Visit 1 · Heart rate field</ActivityRow>
              <ActivityRow icon="ti-message-report" ts="Yesterday 14:22 UTC">Query Q-004 raised on <strong>DALB1P7-02</strong></ActivityRow>
              <ActivityRow icon="ti-check" ts="Jun 05 · 16:40 UTC">Monitoring visit report submitted — Dallas</ActivityRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ PI ════════════════════════════════════════════════════════════════════
function renderPI() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="89" label="Subjects enrolled" accent="blue" trend={{ d: "up", t: "+5 this week" }} />
        <Chip val="74%" label="Enrollment progress" accent="good" />
        <Chip val="0" label="Active SAEs" accent="good" />
        <Chip val="2" label="Subjects on hold" accent="warn" />
        <Chip val="11" label="Open queries (all sites)" accent="warn" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Study enrollment" icon="ti-users">
            <EnrollBar cur={89} tgt={120} pct={74}
              segs={[{ c: "var(--blue-400)", pct: (46 / 120) * 100 }, { c: "var(--amber-400)", pct: (43 / 120) * 100 }]}
              legs={[
              { c: "var(--blue-400)", t: "Group A — 46 subjects" },
              { c: "var(--amber-400)", t: "Group B — 43 subjects" },
              { c: "var(--slate-300)", t: "31 slots remaining" },
            ]} />
            <table className="dash-table" style={{ marginTop: 0 }}>
              <thead><tr><th>Site</th><th>Enrolled</th><th>Target</th><th>Progress</th></tr></thead>
              <tbody>
                <tr><td>Austin</td><td className="mono">30</td><td className="mono muted">40</td><td><MiniBar pct={75} /></td></tr>
                <tr><td>Dallas</td><td className="mono">29</td><td className="mono muted">40</td><td><MiniBar pct={73} /></td></tr>
                <tr><td>Houston</td><td className="mono">30</td><td className="mono muted">40</td><td><MiniBar pct={75} /></td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Queries by site" icon="ti-message-report" action="View all →">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Open</th><th>Responded</th><th>Resolved</th><th>Overdue</th></tr></thead>
              <tbody>
                <tr><td>Austin</td><td className="nw">4</td><td className="mono muted">2</td><td className="ng">18</td><td className="na">2</td></tr>
                <tr><td>Dallas</td><td className="nw">5</td><td className="mono muted">3</td><td className="ng">14</td><td className="na">1</td></tr>
                <tr><td>Houston</td><td className="nw">2</td><td className="mono muted">1</td><td className="ng">9</td><td className="mono muted">—</td></tr>
              </tbody>
            </table>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Safety overview" icon="ti-shield-exclamation">
            <div className="safety-list">
              <SafetyItem tone="s-good" icon="ti-circle-check" title="Active SAEs" sub="No serious adverse events" count="0" />
              <SafetyItem tone="s-warn" icon="ti-pause-circle" title="Subjects on hold" sub="AUSB1P3-01 · AUSB1P3-02" count="2" />
              <SafetyItem icon="ti-file-description" title="Protocol deviations" sub="This month" count="1" />
            </div>
          </Card>
          <Card title="Randomization balance" icon="ti-scale">
            <div className="arm-list">
              <div>
                <div className="arm-hdr"><span className="arm-label">Group A — Dose</span><span className="arm-count">46 subjects</span></div>
                <div className="arm-track"><div className="arm-fill-a" style={{ width: "52%" }}></div></div>
              </div>
              <div>
                <div className="arm-hdr"><span className="arm-label">Group B — Control</span><span className="arm-count">43 subjects</span></div>
                <div className="arm-track"><div className="arm-fill-b" style={{ width: "48%" }}></div></div>
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-2)" }}>
                Target 1:1 · Current 52:48 — within range
              </div>
            </div>
          </Card>
          <Card title="Key milestones" icon="ti-flag-2">
            <div className="milestone-list">
              <MilestoneRow label="Site initiation — all sites" sub="All 3 sites activated" date="Sep 2025" state="done" />
              <MilestoneRow label="Protocol amendment v2.1" sub="Safety monitoring reduced to 2 weeks" date="Jan 2026" state="done" />
              <MilestoneRow label="Interim safety review" sub="Scheduled — sponsor review" date="Aug 2026" state="active" />
              <MilestoneRow label="Last subject last visit" sub="LSLV target" date="Dec 2026" state="future" />
              <MilestoneRow label="Database lock" sub="All queries resolved" date="Feb 2027" state="future" />
            </div>
            <MilestoneLegend />
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ DM ════════════════════════════════════════════════════════════════════
function renderDM() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
        <Chip val="89" label="Subjects enrolled" />
        <Chip val="78%" label="Data completeness" accent="good" />
        <Chip val="11" label="Open queries" accent="warn" />
        <Chip val="4" label="Ready to lock" accent="blue" />
        <Chip val="14" label="Forms pending review" accent="warn" />
        <Chip val="62%" label="SDV complete" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Data completeness" icon="ti-database">
            <div className="comp-grid">
              <div className="comp-item"><div className="comp-lbl">Austin</div><div className="comp-val">82%</div><div className="comp-track"><div className="comp-fill" style={{ width: "82%" }}></div></div></div>
              <div className="comp-item"><div className="comp-lbl">Dallas</div><div className="comp-val">74%</div><div className="comp-track"><div className="comp-fill partial" style={{ width: "74%" }}></div></div></div>
              <div className="comp-item"><div className="comp-lbl">Houston</div><div className="comp-val">78%</div><div className="comp-track"><div className="comp-fill partial" style={{ width: "78%" }}></div></div></div>
              <div className="comp-item"><div className="comp-lbl">Overall</div><div className="comp-val">78%</div><div className="comp-track"><div className="comp-fill partial" style={{ width: "78%" }}></div></div></div>
            </div>
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Submitted</th><th>Missing</th><th>Pending</th><th>Locked</th></tr></thead>
              <tbody>
                <tr><td>Austin</td><td className="mono">156</td><td className="na">8</td><td className="nw">6</td><td className="ng">142</td></tr>
                <tr><td>Dallas</td><td className="mono">148</td><td className="na">12</td><td className="nw">5</td><td className="ng">131</td></tr>
                <tr><td>Houston</td><td className="mono">152</td><td className="na">9</td><td className="nw">3</td><td className="ng">140</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Subjects ready to lock" icon="ti-lock" action="Lock all →">
            <div>
              <LockRow id="AUSB1P1-04" site="Austin · Barn A · Pen 1" forms="5/5 · 0 queries" />
              <LockRow id="AUSB2P5-01" site="Austin · Barn B · Pen 5" forms="5/5 · 0 queries" />
              <LockRow id="DALB1P6-01" site="Dallas · Barn C · Pen 6" forms="5/5 · 0 queries" />
              <LockRow id="HOUB1P2-01" site="Houston · Barn D · Pen 2" forms="5/5 · 0 queries" />
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Queries by type" icon="ti-tag" action="View all →">
            <div className="qcat-list">
              <QcatRow label="Edit check" n={5} pct={100} fill="ec" />
              <QcatRow label="Missing data" n={3} pct={60} fill="md" />
              <QcatRow label="Out of range" n={2} pct={40} fill="or" />
              <QcatRow label="Source discrepancy" n={1} pct={20} fill="sd" />
            </div>
          </Card>
          <Card title="SDV progress" icon="ti-shield-check">
            <div>
              <SdvRow name="Austin" pct={74} />
              <SdvRow name="Dallas" pct={58} />
              <SdvRow name="Houston" pct={42} />
            </div>
          </Card>
          <Card title="Recent audit activity" icon="ti-clipboard-list" action="Audit trail →">
            <div>
              <ActivityRow icon="ti-pencil" ts="Today 08:42 · E. Tron (CRC)"><strong>AUSB1P1-01</strong> Rectal temp corrected 28.5→38.4 °C</ActivityRow>
              <ActivityRow icon="ti-lock" ts="Jun 07 · 10:00 · M. Chen"><strong>AUSB1P1-04</strong> Record locked</ActivityRow>
              <ActivityRow icon="ti-file-alert" ts="Jun 05 · 14:22 · Dr. Mercer">Protocol deviation logged — AUSB1P3-01</ActivityRow>
              <ActivityRow icon="ti-message-report" ts="May 07 · 09:14 · System">Query Q-001 raised — Austin</ActivityRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ SPONSOR (adapted — oversight + blinded Reports/Inventory) ══════════════
function renderSponsor() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="89" label="Subjects enrolled" accent="blue" trend={{ d: "up", t: "+5 this week" }} />
        <Chip val="74%" label="Enrollment progress" accent="good" />
        <Chip val="3" label="Sites active" accent="good" />
        <Chip val="0" label="Active SAEs" accent="good" />
        <Chip val="1" label="Protocol deviations" accent="warn" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Study enrollment" icon="ti-users">
            <EnrollBar cur={89} tgt={120} pct={74} legs={[
              { c: "var(--blue-400)", t: "Enrolled — 89" },
              { c: "var(--slate-300)", t: "31 remaining" },
            ]} />
          </Card>
          <Card title="Key milestones" icon="ti-flag-2">
            <div className="milestone-list">
              <MilestoneRow label="Site initiation — all sites" sub="All 3 sites activated" date="Sep 2025" state="done" />
              <MilestoneRow label="50% enrollment milestone" sub="89/120 — currently 74%" date="Mar 2026" state="done" />
              <MilestoneRow label="Interim safety review" sub="Sponsor review scheduled" date="Aug 2026" state="active" />
              <MilestoneRow label="Full enrollment target" sub="All 120 subjects enrolled" date="Dec 2026" state="future" />
              <MilestoneRow label="Database lock" sub="All queries resolved" date="Feb 2027" state="future" />
            </div>
            <MilestoneLegend />
          </Card>
        </div>
        <div className="dash-col">
          {/* Aggregate totals only — no treatment-arm / randomization breakdown. */}
          <Card title="Reports" icon="ti-chart-bar">
            <div className="agg-list">
              <div className="agg-row"><span className="agg-lbl">Subjects enrolled</span><span className="agg-val">89</span></div>
              <div className="agg-row"><span className="agg-lbl">Forms submitted</span><span className="agg-val">456</span></div>
              <div className="agg-row"><span className="agg-lbl">Queries resolved</span><span className="agg-val">41</span></div>
              <div className="agg-row"><span className="agg-lbl">Data completeness</span><span className="agg-val">78%</span></div>
              <span className="blinded-note"><i className="ti ti-eye-off"></i> Aggregate totals — treatment arm breakdown is blinded for your role</span>
            </div>
          </Card>
          <Card title="Inventory" icon="ti-package">
            <div className="agg-list">
              <div className="agg-row"><span className="agg-lbl">Units dispensed</span><span className="agg-val">178</span></div>
              <div className="agg-row"><span className="agg-lbl">Units returned</span><span className="agg-val">24</span></div>
              <div className="agg-row"><span className="agg-lbl">On-hand stock</span><span className="agg-val">96</span></div>
              <span className="blinded-note"><i className="ti ti-eye-off"></i> Aggregate totals — per-arm allocation is blinded for your role</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ ADMIN ═════════════════════════════════════════════════════════════════
// ─── Database Lock — Admin workflow (lock/unlock the whole study database) ─────
const newId = () => crypto.randomUUID();

function StudyLockAdminCard() {
  const { study } = useShell();
  const { dataset, update, activeRole } = useStudySession();
  const name = useNdaName();
  const locked = isStudyLocked(dataset, study.id);
  const last = latestStudyLock(dataset, study.id);

  const [mode, setMode] = useState<null | "lock" | "unlock">(null);
  const [reason, setReason] = useState("");
  const [authorizedBy, setAuthorizedBy] = useState(name);
  const [override, setOverride] = useState(false);

  // Lock-readiness — GCP gates a database lock on data cleanliness ("you don't lock
  // dirty data"). Derived live from the store: open queries must be 0 and every started
  // form finalized; SDV shown for context. When not clean the lock is blocked unless an
  // Admin explicitly overrides (and documents why in the reason field).
  const readiness = useMemo(() => {
    const formIds = new Set(dataset.forms.filter((f) => f.study_id === study.id).map((f) => f.id));
    const insts = dataset.formInstances.filter((i) => formIds.has(i.form_id));
    const instIds = new Set(insts.map((i) => i.id));
    const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved").length;
    const totalForms = insts.length;
    const finalizedForms = insts.filter((i) => i.status === "finalized" || i.status === "locked").length;
    const notFinalized = totalForms - finalizedForms;
    // Field-level SDV % — same source as the CRA dashboard SDV tile (display only).
    const sdv = sdvProgress(dataset, study.id);
    const sdvPct = sdv.total ? Math.round((sdv.verified / sdv.total) * 100) : 0;
    const clean = openQueries === 0 && notFinalized === 0;
    const outstanding: string[] = [];
    if (openQueries > 0) outstanding.push(`${openQueries} open ${openQueries === 1 ? "query" : "queries"}`);
    if (notFinalized > 0) outstanding.push(`${notFinalized} ${notFinalized === 1 ? "form" : "forms"} not finalized`);
    return { openQueries, totalForms, finalizedForms, notFinalized, sdvPct, sdvVerified: sdv.verified, sdvFields: sdv.total, clean, outstanding };
  }, [dataset, study.id]);

  function open(next: "lock" | "unlock") {
    setReason(""); setAuthorizedBy(name); setOverride(false); setMode(next);
  }
  function confirm() {
    if (!reason.trim() || !authorizedBy.trim()) return;
    if (mode === "lock" && !readiness.clean && !override) return;
    update((d) => {
      (d.studyLocks ??= []).push({
        id: newId(),
        study_id: study.id,
        locked: mode === "lock",
        reason: reason.trim(),
        authorized_by: authorizedBy.trim(),
        author_role: activeRole,
        created_at: new Date().toISOString(),
      });
    });
    setMode(null);
  }

  return (
    <Card title="Database lock" icon="ti-lock">
      <div className="db-lock-card">
        <div className="db-lock-status">
          <span className={`db-lock-pill ${locked ? "locked" : "open"}`}>
            <i className={`ti ${locked ? "ti-lock" : "ti-lock-open"}`}></i>
            {locked ? "Locked" : "Open for data entry"}
          </span>
          {locked && last && (
            <span className="db-lock-meta">{last.reason} · {last.authorized_by}</span>
          )}
        </div>
        <p className="db-lock-desc">
          Locks <strong>all</strong> form instances across <strong>all</strong> subjects to read-only — used prior to statistical analysis. In a production system this cannot be undone.
        </p>
        {locked ? (
          <button className="db-lock-btn unlock" type="button" onClick={() => open("unlock")}>
            <i className="ti ti-lock-open"></i> Unlock database
          </button>
        ) : (
          <button className="db-lock-btn warn" type="button" onClick={() => open("lock")}>
            <i className="ti ti-lock"></i> Lock study data
          </button>
        )}
      </div>

      {mode && (
        <>
          <div className="db-lock-backdrop" onClick={() => setMode(null)} />
          <div className="db-lock-modal" role="dialog" aria-modal="true" aria-label="Database lock">
            <div className="db-lock-modal-head">
              <i className={`ti ${mode === "lock" ? "ti-lock" : "ti-lock-open"}`}></i>
              <span>{mode === "lock" ? "Database Lock" : "Unlock Database"}</span>
            </div>
            <div className={`db-lock-warn ${mode === "lock" ? "danger" : ""}`}>
              {mode === "lock"
                ? "This will lock ALL form instances across ALL subjects to read-only. This action is used prior to statistical analysis and cannot be undone in a production system."
                : "This will restore data entry across the study. Unlocking after a database lock is permitted in this demonstration; in production it requires documented authorisation."}
            </div>
            {mode === "lock" && (
              <div className="db-lock-checklist">
                <div className="db-lock-checklist-title">Lock readiness</div>
                <div className={`db-lock-check ${readiness.openQueries === 0 ? "ok" : "bad"}`}>
                  <i className={`ti ${readiness.openQueries === 0 ? "ti-circle-check" : "ti-alert-circle"}`}></i>
                  Open queries: <strong>{readiness.openQueries}</strong>{readiness.openQueries === 0 ? "" : " (must be 0)"}
                </div>
                <div className={`db-lock-check ${readiness.notFinalized === 0 ? "ok" : "bad"}`}>
                  <i className={`ti ${readiness.notFinalized === 0 ? "ti-circle-check" : "ti-alert-circle"}`}></i>
                  Forms finalized: <strong>{readiness.finalizedForms} / {readiness.totalForms}</strong>
                </div>
                <div className="db-lock-check info">
                  <i className="ti ti-shield-check"></i>
                  SDV complete: <strong>{readiness.sdvPct}% ({readiness.sdvVerified} / {readiness.sdvFields} fields verified)</strong>
                </div>
                {!readiness.clean && (
                  <>
                    <div className="db-lock-blocked">
                      <i className="ti ti-lock-exclamation"></i> Cannot lock — outstanding: {readiness.outstanding.join(", ")}.
                    </div>
                    <label className="db-lock-override">
                      <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                      Override and lock despite outstanding items (document the reason below)
                    </label>
                  </>
                )}
              </div>
            )}
            <label className="db-lock-field">
              <span>Reason <span className="req">*</span></span>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {LOCK_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
            <label className="db-lock-field">
              <span>Authorized by <span className="req">*</span></span>
              <input value={authorizedBy} onChange={(e) => setAuthorizedBy(e.target.value)} />
            </label>
            <div className="db-lock-modal-foot">
              <button className="db-lock-cancel" type="button" onClick={() => setMode(null)}>Cancel</button>
              <button
                className={`db-lock-confirm ${mode === "lock" ? "danger" : ""}`}
                type="button"
                disabled={!reason.trim() || !authorizedBy.trim() || (mode === "lock" && !readiness.clean && !override)}
                onClick={confirm}
              >
                {mode === "lock" ? "Lock Database" : "Unlock Database"}
              </button>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// Admin left-column content (fills the column + gives the two most action-needed
// views): live per-study status overview + the pending-user activations summary.
function AdminStudyStatusCard() {
  const { dataset } = useStudySession();
  const studies = dataset.studies.slice().sort((a, b) => a.code.localeCompare(b.code));
  return (
    <Card title="Study status" icon="ti-clipboard-data">
      <table className="dash-table">
        <thead><tr><th>Study</th><th>Database</th><th>Enrolled</th><th>Open Q</th></tr></thead>
        <tbody>
          {studies.map((s) => {
            const sc = subjectCounts(dataset, s.id);
            const enrolled = sc.active + sc.completed + sc.withdrawn;
            const oq = openQueryCount(dataset, s.id);
            const locked = isStudyLocked(dataset, s.id);
            return (
              <tr key={s.id}>
                <td><Link className="card-link" href={`/study/${s.id}`} style={{ textDecoration: "none", fontWeight: "var(--weight-medium)" }}>{s.code}</Link></td>
                <td><span className={`cap-chip ${locked ? "cap-over" : "cap-under"}`}>{locked ? "Locked" : "Open"}</span></td>
                <td className="mono">{enrolled}</td>
                <td className="mono" style={{ color: oq ? "var(--amber-700)" : undefined }}>{oq || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function AdminAuditHealthCard() {
  const { study } = useShell();
  return (
    <Card title="Audit trail health" icon="ti-clipboard-list" action="View full log →" actionHref={`/study/${study.id}/audit-trail`}>
      <div className="safety-list">
        <SafetyItem tone="s-good" icon="ti-circle-check" title="21 CFR Part 11 compliance" sub="All entries timestamped · user-attributed" count="✓" />
        <SafetyItem icon="ti-file-text" title="Audit entries this week" sub="Across all users and sites" count="248" />
        <SafetyItem tone="s-good" icon="ti-lock" title="Locked records" sub="No modifications after lock" count="4" />
      </div>
    </Card>
  );
}

function renderAdmin() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
        <Chip val="12" label="Active users" accent="blue" />
        <Chip val="3" label="Sites configured" accent="good" />
        <Chip val="6" label="Role types in use" />
        <Chip val="0" label="System errors" accent="good" />
        <Chip val="2" label="Pending user activations" accent="warn" />
        <Chip val="100%" label="Audit trail coverage" accent="good" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <AdminStudyStatusCard />
          <Card title="Active users" icon="ti-users" action="Manage users →">
            <div>
              <UserRow initials="ET" name="Elisa Tron" role="CRC" roleCls="rc-crc" site="Austin · Barn A" lastLogin="Today 08:42" />
              <UserRow initials="SK" name="Sarah Kim" role="CRC" roleCls="rc-crc" site="Austin" lastLogin="Yesterday" />
              <UserRow initials="JH" name="James Hollis" role="CRA" roleCls="rc-cra" site="All sites" lastLogin="Jun 07" />
              <UserRow initials="DM" name="Dr. Daniel Mercer" role="PI" roleCls="rc-pi" site="Austin" lastLogin="Jun 05" />
              <UserRow initials="MC" name="Margaret Chen" role="DM" roleCls="rc-dm" site="All sites" lastLogin="Jun 06" />
              <UserRow initials="CV" name="Carla Voss" role="Sponsor" roleCls="rc-sponsor" site="All sites" lastLogin="Today 08:00" />
            </div>
          </Card>
          <Card title="Pending activations" icon="ti-user-check">
            <div className="list-rows">
              <div className="list-row">
                <div className="list-row-body">
                  <div className="list-row-primary">Dr. Anna Reyes</div>
                  <div className="list-row-secondary">Invited as PI · Houston · Jun 06</div>
                </div>
                <button className="btn-xs" type="button"><i className="ti ti-check"></i> Activate</button>
              </div>
              <div className="list-row">
                <div className="list-row-body">
                  <div className="list-row-primary">Tom Walsh</div>
                  <div className="list-row-secondary">Invited as CRC · Dallas · Jun 07</div>
                </div>
                <button className="btn-xs" type="button"><i className="ti ti-check"></i> Activate</button>
              </div>
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <StudyLockAdminCard />
          <Card title="Study configuration status" icon="ti-settings" action="Settings →">
            <div>
              <CfgRow label="Study settings" sub="Hierarchy, type, subject level" status="ok" />
              <CfgRow label="Form permissions" sub="Role-based access configured" status="ok" />
              <CfgRow label="Randomization" sub="Block randomization v2.1" status="ok" />
              <CfgRow label="Electronic signatures" sub="Co-signature enabled" status="ok" />
              <CfgRow label="Inventory" sub="Dispense/return triggers set" status="ok" />
              <CfgRow label="Billing" sub="Fee schedule — 1 item missing" status="warn" />
              <CfgRow label="Email notifications" sub="Not configured" status="pending" />
            </div>
          </Card>
          <AdminAuditHealthCard />
          <Card title="Recent admin activity" icon="ti-activity">
            <div>
              <ActivityRow icon="ti-user-plus" ts="Today 07:55 · System">User Carla Voss activated — Sponsor role</ActivityRow>
              <ActivityRow icon="ti-settings" ts="Jun 07 · 09:00 · Admin">Billing fee schedule updated</ActivityRow>
              <ActivityRow icon="ti-lock" ts="Jan 10 · 14:00 · Admin">Study settings locked for amendment</ActivityRow>
              <ActivityRow icon="ti-shield-check" ts="Jan 08 · 10:00 · Admin">Role permissions audit completed</ActivityRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
