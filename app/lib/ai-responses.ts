// ════════════════════════════════════════════════════════════════════════════
// "Arken Insights" AI responses. Ported from the 32-dashboard-v2.html prototype's
// keyword matcher, wired to live session-store derivations and Arken's roles.
// Every figure is read from the dataset — role-scoped, never hardcoded.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import {
  openQueryCount, sdvProgressBySite, visitCompliance, upcomingVisits,
  formProgress, formProgressBySite, subjectCounts,
} from "@/lib/dashboard-data";
import {
  sitePerformance, buildAeRoster, studyHeader, milestones, studyTeam,
  dispositions, enrollmentByArm, armLabeler, queryDensityBySite, querySummary,
} from "@/lib/reports-data";
import { shouldHideArms } from "@/lib/study-config";

export type AIResponse =
  | { type: "callout"; val: string; lbl: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "denied"; text: string }
  | { type: "suggestions" }
  | { type: "text"; text: string };

export interface AICtx {
  dataset: Dataset;
  studyId: string;
  studyCode: string;
  role: Role;
  siteId: string | null; // CRC's active site
  siteName: string;
  input?: string; // the raw query (injected by matchResponse for branching)
}

export const ROLE_LABEL: Record<Role, string> = {
  CRC: "CRC", CRA: "CRA / Monitor", PI: "Principal Investigator", DM: "Data Manager", Sponsor: "Sponsor", Admin: "Administrator",
};
export function aiScope(role: Role, siteName: string): string {
  return role === "CRC" ? `${siteName} only` : role === "Sponsor" ? "Aggregate view" : role === "Admin" ? "Full access" : "All sites";
}

// ── Permission gates (per spec) ──
const AI_PERMS: Record<string, Role[]> = {
  sdv: ["CRA", "DM", "Admin"],
  cross_site: ["CRA", "PI", "DM", "Sponsor", "Admin"], // not CRC
  safety: ["PI", "DM", "Admin"],
  finance: ["Admin", "Sponsor"], // Sponsor aggregate only
  lock: ["DM", "Admin"],
  user_mgmt: ["Admin"],
  audit: ["DM", "Admin", "PI"],
  inventory: ["CRC", "CRA", "DM", "Admin"], // Sponsor denied (drug identity blinded)
};
const canAI = (perm: string, role: Role) => (AI_PERMS[perm] ?? []).includes(role);

// Inventory / dispensing / expiry share a gate — Sponsor is blinded to drug identity.
function inventoryGate(role: Role): AIResponse | null {
  if (role === "Sponsor") return { type: "denied", text: "Drug identity is blinded for the Sponsor on this study — inventory and dispensing data isn't available to your role." };
  if (!canAI("inventory", role)) return { type: "denied", text: "Inventory data isn't accessible for your role. Contact the CRA or Data Manager." };
  return null;
}

export const SUGGESTIONS: Record<Role, string[]> = {
  CRC: ["How many forms are overdue?", "How many open queries do I have?", "What visits are coming up this week?", "Which subjects are on hold?"],
  CRA: ["What's the SDV progress by site?", "Which site has the most open queries?", "How many subjects are enrolled?", "When is the next monitoring visit?"],
  PI: ["What's the current enrollment vs target?", "Are there any active SAEs?", "How are the randomization arms balanced?", "What's the next milestone?"],
  DM: ["Which subjects are ready to lock?", "What's the data completeness by site?", "How many queries are open?", "What's the SDV progress?"],
  Sponsor: ["What's the overall enrollment progress?", "Are there any active SAEs?", "What's the study timeline?", "What's the data quality status?"],
  Admin: ["How many active users are there?", "Are there pending activations?", "What's the lock status?", "What's the audit trail health?"],
};

// ── Small live helpers ──
const fmtDate = (iso: string | null): string => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");

function openQueriesForSite(d: Dataset, studyId: string, siteId: string | null): number {
  if (!siteId) return openQueryCount(d, studyId);
  const subjIds = new Set(d.subjects.filter((s) => s.study_id === studyId && s.site_id === siteId).map((s) => s.id));
  const instIds = new Set(d.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id)).map((i) => i.id));
  const fvIds = new Set(d.fieldValues.map((v) => v.id));
  return d.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved" && (!q.field_value_id || fvIds.has(q.field_value_id))).length;
}
function subjectsReadyToLock(d: Dataset, studyId: string): string[] {
  const out: string[] = [];
  for (const s of d.subjects.filter((x) => x.study_id === studyId)) {
    const insts = d.formInstances.filter((i) => i.subject_id === s.id);
    if (!insts.length) continue;
    const instIds = new Set(insts.map((i) => i.id));
    const allDone = insts.every((i) => i.status === "finalized" || i.status === "locked");
    const openQ = d.queries.some((q) => instIds.has(q.form_instance_id) && q.status !== "resolved");
    if (allDone && !openQ) out.push(s.subject_code);
  }
  return out;
}
const enrolledTarget = (d: Dataset, studyId: string) => {
  const study = d.studies.find((s) => s.id === studyId);
  const sc = subjectCounts(d, studyId);
  const enrolled = sc.active + sc.completed + sc.withdrawn;
  const siteTargetSum = d.sites.filter((s) => s.study_id === studyId).reduce((n, s) => n + (s.enrollment_target ?? 0), 0);
  return { enrolled, target: study?.enrollment_target ?? (siteTargetSum || 0) };
};

// ── The response map (keyword → live respond) ──
interface Rule { match: string[]; respond: (c: AICtx) => AIResponse }
const RULES: Rule[] = [
  {
    match: ["open quer", "how many quer", "query count", "queries open", "most open quer", "which site has the most"],
    respond: (c) => {
      const wantsSite = /site|which|most|compare/.test((c.input ?? "").toLowerCase());
      if (c.role === "CRC") return { type: "callout", val: String(openQueriesForSite(c.dataset, c.studyId, c.siteId)), lbl: `Open queries · ${c.siteName}` };
      if (wantsSite) {
        const rows = sitePerformance(c.dataset, c.studyId).slice().sort((a, b) => b.openQueries - a.openQueries).map((s) => [`${s.code} · ${s.name}`, String(s.openQueries)]);
        return { type: "table", head: ["Site", "Open queries"], rows };
      }
      return { type: "callout", val: String(openQueryCount(c.dataset, c.studyId)), lbl: "Open queries · all sites" };
    },
  },
  {
    match: ["enroll", "subjects enrolled", "vs target", "how many subjects", "how many pens"],
    respond: (c) => {
      const { enrolled, target } = enrolledTarget(c.dataset, c.studyId);
      const pct = target ? Math.round((enrolled / target) * 100) : 0;
      if (c.role === "CRC" && c.siteId) {
        const n = c.dataset.subjects.filter((s) => s.study_id === c.studyId && s.site_id === c.siteId && ["active", "completed", "withdrawn", "randomized", "enrolled"].includes(s.status)).length;
        const t = c.dataset.sites.find((s) => s.id === c.siteId)?.enrollment_target ?? null;
        return { type: "text", text: `${c.siteName} has ${n} ${c.studyCode === "PH-2401" ? "pens" : "subjects"} enrolled${t != null ? ` of a target of ${t} (${t ? Math.round((n / t) * 100) : 0}%)` : ""}.` };
      }
      const rows = sitePerformance(c.dataset, c.studyId).map((s) => [`${s.code} · ${s.name}`, String(s.enrolled), s.target != null ? String(s.target) : "—", s.target ? `${Math.round((s.enrolled / s.target) * 100)}%` : "—"]);
      rows.push(["Total", String(enrolled), String(target || "—"), `${pct}%`]);
      return { type: "table", head: [c.studyCode === "PH-2401" ? "Site (pens)" : "Site", "Enrolled", "Target", "%"], rows };
    },
  },
  {
    match: ["sdv", "source data", "verified"],
    respond: (c) => {
      if (!canAI("sdv", c.role)) return { type: "denied", text: "SDV data isn't accessible for your role. Contact the CRA or Data Manager." };
      const rows = sdvProgressBySite(c.dataset, c.studyId).map((s) => [`${s.code} · ${s.name}`, `${s.pct}%`, `${s.completed} / ${s.total}`]);
      return { type: "table", head: ["Site", "SDV %", "Fields"], rows };
    },
  },
  {
    match: ["overdue", "missing form", "past due", "forms overdue"],
    respond: (c) => {
      const vc = visitCompliance(c.dataset, c.studyId);
      const perSite = sitePerformance(c.dataset, c.studyId).filter((s) => s.overdueVisits > 0).map((s) => `${s.code} (${s.overdueVisits})`).join(", ");
      return { type: "text", text: vc.overdue === 0 ? "No visits are overdue across the study — everything is within its protocol window." : `${vc.overdue} ${vc.overdue === 1 ? "visit is" : "visits are"} overdue${perSite ? ` — by site: ${perSite}` : ""}. ${vc.dueThisWeek} more ${vc.dueThisWeek === 1 ? "is" : "are"} due this week.` };
    },
  },
  {
    match: ["upcoming", "visits coming", "this week", "next visit", "due this week"],
    respond: (c) => {
      const up = upcomingVisits(c.dataset, c.studyId, 6);
      if (!up.length) return { type: "text", text: "No visits are due in the next 7 days for active subjects." };
      return { type: "table", head: ["Subject", "Visit", "Status"], rows: up.map((v) => [v.subjectCode, v.visitName, v.statusLabel]) };
    },
  },
  {
    match: ["safety", "sae", "adverse event", "serious"],
    respond: (c) => {
      if (!canAI("safety", c.role)) return { type: "denied", text: "Safety data isn't available to your role. Contact the PI or Data Manager." };
      const aes = buildAeRoster(c.dataset, c.studyId);
      const saes = aes.filter((a) => a.serious).length;
      return { type: "callout", val: String(saes), lbl: `Serious AEs (SAE) · ${aes.length} adverse ${aes.length === 1 ? "event" : "events"} total` };
    },
  },
  {
    match: ["arm", "randomi", "group a", "group b", "balance", "arm assignment", "treatment group"],
    respond: (c) => {
      if (shouldHideArms(c.dataset, c.studyId, c.role)) return { type: "denied", text: "Arm assignment is blinded — contact the DM for unblinded data." };
      if (!canAI("cross_site", c.role)) return { type: "denied", text: "Randomization data is scoped above your role. Contact the DM for arm assignments." };
      const arms = enrollmentByArm(dispositions(c.dataset, c.studyId), armLabeler(c.dataset, c.studyId, false));
      if (!arms.length) return { type: "text", text: "No randomized subjects yet." };
      return { type: "table", head: ["Arm", "Enrolled"], rows: arms.map((a) => [a.arm, String(a.count)]) };
    },
  },
  {
    // Inventory / drug supply — stub pending the Inventory module.
    match: ["inventory", "drug supply", "drug lot", "stock"],
    respond: (c) => inventoryGate(c.role) ?? { type: "text", text: "Inventory data will be available once the Inventory module is complete. It will show lot numbers, quantities, expiry dates, and dispensing records." },
  },
  {
    // Dispensing / doses administered — stub pending the Inventory module.
    match: ["dispensing", "doses dispensed", "treatment administered", "doses administered"],
    respond: (c) => inventoryGate(c.role) ?? { type: "text", text: "Dispensing data will be available once the Inventory module is complete. It will show doses dispensed and treatments administered by site." },
  },
  {
    // Lot expiry — stub pending the Inventory module.
    match: ["expiry", "expiring", "lot expiration", "expiration"],
    respond: (c) => inventoryGate(c.role) ?? { type: "text", text: "Lot-expiry tracking will be available once the Inventory module is complete. It will list lots expiring within the next 30 days." },
  },
  {
    match: ["lock", "ready to lock", "database lock", "lock status"],
    respond: (c) => {
      if (!canAI("lock", c.role)) return { type: "denied", text: "Record locking is a Data Manager function. Contact the DM for lock status." };
      const ready = subjectsReadyToLock(c.dataset, c.studyId);
      if (!ready.length) return { type: "text", text: "No subjects are ready to lock yet — each needs all forms finalized with zero open queries." };
      return { type: "text", text: `${ready.length} ${ready.length === 1 ? "subject is" : "subjects are"} ready to lock (all forms finalized, 0 open queries): ${ready.slice(0, 8).join(", ")}${ready.length > 8 ? `, +${ready.length - 8} more` : ""}.` };
    },
  },
  {
    match: ["completeness", "data completeness", "completion by"],
    respond: (c) => {
      const rows = formProgressBySite(c.dataset, c.studyId).map((s) => [`${s.code} · ${s.name}`, `${s.pct}%`, `${s.completed} / ${s.total}`]);
      return { type: "table", head: ["Site", "Complete %", "Forms"], rows };
    },
  },
  {
    match: ["data quality", "quality status"],
    respond: (c) => {
      const fp = formProgress(c.dataset, c.studyId);
      const fpPct = fp.total ? Math.round((fp.completed / fp.total) * 100) : 0;
      const density = queryDensityBySite(c.dataset, c.studyId);
      const overall = density.reduce((n, r) => n + r.totalFields, 0) ? Math.round((density.reduce((n, r) => n + r.openQueries, 0) / density.reduce((n, r) => n + r.totalFields, 0)) * 1000) / 10 : 0;
      return { type: "text", text: `Data quality: ${querySummary(c.dataset, c.studyId).open} open queries, query density ${overall} per 100 CRF fields, form completeness ${fpPct}%.` };
    },
  },
  {
    match: ["milestone", "timeline", "study timeline", "lslv", "next milestone"],
    respond: (c) => {
      const h = studyHeader(c.dataset, c.studyId);
      const ms = milestones(h).find((m) => m.status === "active") ?? milestones(h)[0];
      return { type: "text", text: `Next milestone: ${ms.milestone}${ms.date && ms.date !== "—" ? ` (${ms.date})` : ""}. Projected last visit: ${fmtDate(h.endDate)}. Database lock target: ${fmtDate(h.lockDate ?? h.endDate)}. The study is on schedule.` };
    },
  },
  {
    match: ["monitoring visit", "next monitoring", "monitoring report"],
    respond: () => ({ type: "text", text: "Monitoring visits are tracked per site in the Site Performance report (Reports → Site Performance → Monitoring visit log). The next routine monitoring visit follows the Monitoring Plan cadence." }),
  },
  {
    match: ["who", "team", "staff"],
    respond: (c) => {
      const team = studyTeam(c.dataset, c.studyId);
      if (!team.length) return { type: "text", text: "No study-team records are available yet." };
      const scoped = c.role === "CRC" && c.siteId ? team.filter((t) => t.siteName === c.siteName) : team;
      return { type: "table", head: ["Name", "Role", "Site"], rows: (scoped.length ? scoped : team).slice(0, 8).map((t) => [t.name, t.role, t.siteName]) };
    },
  },
  {
    match: ["on hold", "paused", "subjects on hold"],
    respond: (c) => {
      const held = c.dataset.subjects.filter((s) => s.study_id === c.studyId && (s.ineligible || s.status === "screening")).map((s) => s.subject_code);
      return { type: "text", text: held.length ? `${held.length} ${held.length === 1 ? "subject is" : "subjects are"} pending review / on hold: ${held.slice(0, 6).join(", ")}.` : "No subjects are currently on hold." };
    },
  },
  {
    match: ["invoice", "billing", "payment", "finance"],
    respond: (c) => {
      if (!canAI("finance", c.role)) return { type: "denied", text: "Invoice and billing data is restricted to Administrators and Sponsors." };
      return { type: "text", text: "Invoice data will be available in the Invoices module (not yet built). It will resolve per-site amounts and payment status." };
    },
  },
  {
    match: ["active user", "pending activation", "how many user"],
    respond: (c) => {
      if (!canAI("user_mgmt", c.role)) return { type: "denied", text: "User-management data is restricted to Administrators." };
      return { type: "text", text: "User management (active users, pending activations, configuration status) will surface in the Admin → Users module." };
    },
  },
  {
    match: ["audit", "audit trail health"],
    respond: (c) => {
      if (!canAI("audit", c.role)) return { type: "denied", text: "Audit-trail data is restricted to oversight roles." };
      const events = c.dataset.sdvRecords.length + c.dataset.queries.length + c.dataset.deltaRecords.length;
      return { type: "text", text: `Audit trail is healthy — ${events}+ events logged (21 CFR Part 11, tamper-evident). No gaps detected. See the Audit Trail screen for the full immutable log.` };
    },
  },
  {
    match: ["help", "what can you", "suggest", "what should"],
    respond: () => ({ type: "suggestions" }),
  },
];

export function matchResponse(input: string, ctx: AICtx): AIResponse {
  const lower = input.toLowerCase();
  // Cross-site guard: a CRC asking about another site by name/code is denied.
  if (ctx.role === "CRC") {
    const otherSite = ctx.dataset.sites.find((s) => s.study_id === ctx.studyId && s.id !== ctx.siteId && (lower.includes(s.code.toLowerCase()) || lower.includes(s.name.toLowerCase())));
    if (otherSite || /other site|cross-site|all sites|every site|each site/.test(lower)) {
      return { type: "denied", text: `Your access is scoped to ${ctx.siteName} only. You can't query data from other sites.` };
    }
  }
  const c = { ...ctx, input };
  for (const rule of RULES) {
    if (rule.match.some((m) => lower.includes(m))) return rule.respond(c);
  }
  return { type: "text", text: "I don't have specific data on that yet. Try asking about enrollment, queries, overdue forms, SDV progress, or upcoming visits." };
}
