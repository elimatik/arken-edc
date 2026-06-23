// ════════════════════════════════════════════════════════════════════════════
// Path 2 of the hybrid AI — context builder. Produces a concise, role-scoped
// plain-text summary of current study state to send as the system prompt for the
// Anthropic API fallback (questions that didn't match a keyword rule).
//
// Only pre-computed, role-appropriate numbers are included — never raw form
// instances or the full session store. Role scoping mirrors the keyword-path
// permission gates: CRC sees only their site, blinded roles never see arms, etc.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import {
  openQueryCount, openEditCheckCount, formProgress, sdvProgress,
  visitCompliance, subjectCounts,
} from "@/lib/dashboard-data";
import { sitePerformance, buildAeRoster, studyHeader, milestones } from "@/lib/reports-data";
import { buildCodingWorklist } from "@/lib/coding-data";
import { isStudyBlinded } from "@/lib/study-config";
import { ROLE_LABEL, aiScope } from "@/lib/ai-responses";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export interface AIContextInput {
  dataset: Dataset;
  studyId: string;
  role: Role;
  siteId: string | null; // CRC's active site
  siteName: string;
  today: string; // YYYY-MM-DD (passed in so this stays pure / SSR-safe)
}

export function buildAIContext({ dataset, studyId, role, siteId, siteName, today }: AIContextInput): string {
  const h = studyHeader(dataset, studyId);
  const study = dataset.studies.find((s) => s.id === studyId);

  // Enrolment.
  const sc = subjectCounts(dataset, studyId);
  const enrolled = sc.active + sc.completed + sc.withdrawn;
  const siteTargetSum = dataset.sites.filter((s) => s.study_id === studyId).reduce((n, s) => n + (s.enrollment_target ?? 0), 0);
  const target = study?.enrollment_target ?? (siteTargetSum || 0);
  const myEnrolled = siteId
    ? dataset.subjects.filter((s) => s.study_id === studyId && s.site_id === siteId && ["active", "completed", "withdrawn", "randomized", "enrolled"].includes(s.status)).length
    : enrolled;

  // Milestone.
  const ms = milestones(h).find((m) => m.status === "active") ?? milestones(h)[0];
  const nextMilestone = ms ? `${ms.milestone}${ms.date && ms.date !== "—" ? ` (${ms.date})` : ""}` : "—";

  // Data quality.
  const oq = openQueryCount(dataset, studyId);
  const ec = openEditCheckCount(dataset, studyId);
  const fp = formProgress(dataset, studyId);
  const sdv = sdvProgress(dataset, studyId);
  const sdvPct = pct(sdv.verified, sdv.total);
  const issues = oq + ec;

  // Visits.
  const vc = visitCompliance(dataset, studyId);

  // Safety.
  const aes = buildAeRoster(dataset, studyId);
  const saes = aes.filter((a) => a.serious);
  const myAes = aes.filter((a) => a.siteName === siteName);
  const saeList = saes.map((a) => `${a.subjectCode} ${a.description} (${a.severity}, ${a.status})`).join("; ") || "none";

  // Sites.
  const perf = sitePerformance(dataset, studyId);

  // Blinding.
  const blinded = isStudyBlinded(dataset, studyId);
  const blindedRoles = blinded ? "CRC, CRA, Sponsor" : "none — this is an open-label study";

  // Role flags (mirror the keyword-path gates).
  const isCRC = role === "CRC";
  const isSponsor = role === "Sponsor";
  const showSDV = role === "CRA" || role === "DM" || role === "Admin";
  const showSafetyDetail = role === "PI" || role === "DM" || role === "Admin";
  const showCoding = role === "DM" || role === "Admin";

  // ── Role-scoped sections ──
  const enrolledLine = isCRC
    ? `  Subjects enrolled at ${siteName}: ${myEnrolled}`
    : `  Subjects enrolled: ${enrolled} / ${target} (${pct(enrolled, target)}%)`;

  const dataQuality = [
    `  Open queries: ${oq}`,
    `  Edit checks: ${ec}`,
    `  Forms completed: ${fp.completed} / ${fp.total} (${pct(fp.completed, fp.total)}%)`,
    showSDV ? `  SDV complete: ${sdvPct}%` : null,
    `  Lock readiness: ${issues === 0 ? "Clean" : `${issues} open items`}`,
  ].filter(Boolean).join("\n");

  let safety: string;
  if (showSafetyDetail) safety = `  AEs reported: ${aes.length}\n  SAEs: ${saes.length}${saes.length ? ` — ${saeList}` : ""}`;
  else if (isCRC) safety = `  AEs reported at ${siteName}: ${myAes.length}`;
  else safety = `  AEs reported: ${aes.length} · SAEs: ${saes.length}`;

  let sites: string;
  if (isCRC) {
    const r = perf.find((p) => p.siteId === siteId);
    sites = r ? `  ${r.name} · ${r.enrolled} enrolled · ${r.openQueries} open queries${showSDV ? ` · ${r.sdvPct}% SDV` : ""}` : "  (your site — no data yet)";
  } else if (isSponsor) {
    sites = `  Aggregate across ${perf.length} sites — ${enrolled} enrolled · ${oq} open queries (per-site detail is not shown at Sponsor scope)`;
  } else {
    sites = perf.map((p) => `  ${p.name} · ${p.enrolled} enrolled · ${p.openQueries} queries${showSDV ? ` · ${p.sdvPct}% SDV` : ""}`).join("\n");
  }

  let coding = "";
  if (showCoding) {
    const work = buildCodingWorklist(dataset, studyId);
    coding = `\nCODING\n  Pending VeDDRA terms: ${work.filter((t) => t.status === "pending").length}\n  Terms needing review: ${work.filter((t) => t.status === "review").length}\n`;
  }

  return `
You are Arken Insights, an AI assistant embedded in Arken EDC — a veterinary clinical trial data management platform.
The active study is ${h.code} (${h.name}).
Current user role: ${ROLE_LABEL[role]}. Data scope: ${aiScope(role, siteName)}.
Today's date: ${today}.

STUDY OVERVIEW
  Status: ${h.status}
  Protocol: ${h.protocolVersion}
  IACUC: ${h.iacucNumber ?? "—"}
${enrolledLine}
  Study start: ${h.startDate ?? "—"}
  Next milestone: ${nextMilestone}

DATA QUALITY
${dataQuality}

VISITS
  Overdue: ${vc.overdue}
  Due this week: ${vc.dueThisWeek}
  On time: ${vc.onTime}

SAFETY
${safety}

SITES
${sites}
${coding}
INSTRUCTIONS
- Answer only using the data above. Do not invent numbers.
- Keep answers concise: 1-3 sentences or a short table.
- If the question requires data not in the summary above, say "I don't have that level of detail — check the relevant screen."
- Never reveal arm assignments or treatment-group data to blinded roles. Blinded roles on this study: ${blindedRoles}.
- Format tables as plain text with | separators if needed.
- Do not use markdown headers or bullet points — plain sentences only.
- You are not a general-purpose assistant. Stay focused on this study's data.
`.trim();
}
