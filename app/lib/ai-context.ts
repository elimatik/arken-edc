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
import { isStudyBlinded, shouldHideArms, shouldHideArmForSubject } from "@/lib/study-config";
import { armLabeler } from "@/lib/reports-data";
import { buildFieldSchema } from "@/lib/report-builder";
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

  // ── Field schema + subject/site roster for intent → real-field mapping ──
  // The schema is form/field/type only — NO field values leave the client. Arm is
  // masked here exactly as the resolver masks it, so blinded roles never see arms.
  const fieldSchema = buildFieldSchema(dataset, studyId);
  const hideArms = shouldHideArms(dataset, studyId, role);
  const mask = armLabeler(dataset, studyId, hideArms);
  const armFor = (s: { id: string; randomization_arm: string | null }) =>
    s.randomization_arm == null ? "—" : shouldHideArmForSubject(dataset, studyId, role, s.id) ? mask(s.randomization_arm) : s.randomization_arm;
  const studySubjects = dataset.subjects.filter((s) => s.study_id === studyId && !(role === "CRC" && siteId && s.site_id !== siteId));
  const subjectRoster = studySubjects.map((s) => `${s.subject_code} (${s.ineligible ? "ineligible" : s.status}, ${armFor(s)})`).join("; ");
  const siteList = dataset.sites.filter((s) => s.study_id === studyId).map((s) => `${s.code} · ${s.name}`).join("; ");

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
STUDY SITES (for data queries)
  ${siteList}

SUBJECTS (id, status, arm — arm already masked for your role; never de-mask)
  ${subjectRoster || "none"}

FORMS & FIELDS (for mapping requests to real fields — no values, structure only)
${JSON.stringify(fieldSchema)}

INTENT CLASSIFICATION — respond with a SINGLE JSON object, nothing else (no prose, no markdown fences).
Classify every user message as one of three intents:

1. "question" — an explanation, definition, or narrative answer (e.g. "What is CADESI-04?", "How does blinded randomization work?").
   Return: { "intent": "question", "message": "<1-2 sentence summary>", "response": "<the full prose answer>" }

2. "data_query" — the user wants to SEE study data as a table (e.g. "Show dogs with CADESI FU4 below 20", "Which subjects have open queries?", "List BR-2502 animals in arm T01").
   You do NOT have field values — describe WHAT to show; the client resolves the rows from the session store.
   You do NOT have field values — describe WHAT to show; the client resolves the rows from the session store.
   Rows are always SUBJECT-grain (one row per subject/pen). Columns are either a built-in or a form field.
   Return: { "intent": "data_query", "message": "<short message>", "data": {
     "title": "<report title>",
     "columns": [ { "label": "Subject ID", "source": "builtin", "key": "subjectId" }, { "label": "CADESI FU4", "source": "form_field", "form": "<exact form name from FORMS & FIELDS>", "field": "<field code>", "visit": "Follow-Up 4" } ],
     "filters": [ { "column": "CADESI FU4", "operator": ">=" | "<=" | ">" | "<" | "=" | "!=" | "contains", "value": "20" } ],
     "exportFilename": "arken-${h.code}-<description>-<date>"
   } }
   Built-in column keys: subjectId, site, arm, status, enrollmentDate, daysOnStudy, withdrawalReason, visitName, targetDate, actualDate, complianceStatus, openQueryCount, queryStatus.
   Always include a subjectId column first. Use EXACT form names and field codes from the FORMS & FIELDS schema. A form_field column shows that field's value for the subject (optionally at a given "visit"). Filter columns must reference a column "label" you defined.

3. "report_config" — the user wants to BUILD or customise a report (e.g. "Build a report comparing FCR by arm", "Create a custom PH-2401 production report").
   Return: { "intent": "report_config", "message": "<short message>", "config": { "columns": [ ... same column shape as data_query ... ], "filters": [ ... ], "title": "<suggested title>" } }

RULES
- Output ONLY the JSON object. No markdown, no code fences, no commentary before/after.
- Use only the forms, fields, subjects, and sites listed above. Do not invent field codes or values.
- Never reveal or de-mask arm assignments for blinded roles. Blinded roles on this study: ${blindedRoles}. The arm labels above are already masked for the current role — use them as-is.
- For "question" intent, keep "response" concise (1-4 sentences) and factual to this study.
- If a data request needs a field not in the schema, still return data_query with your best-guess columns, or use "question" to explain what's unavailable.
`.trim();
}
