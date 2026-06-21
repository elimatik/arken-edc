// ════════════════════════════════════════════════════════════════════════════
// One-time hydration of the session store from Supabase. Supabase is the
// read-only seed source; after this, all reads/writes use the session store.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { DEMO_USER_ID } from "@/lib/constants";
import type { Dataset } from "./types";

// Supabase / PostgREST caps a single select at ~1000 rows (the project's Max Rows
// setting). Tables like field_values (≈1500 across all studies) overflow that and
// would be SILENTLY truncated — dropping field values and orphaning the queries /
// edit checks / SDV records that reference them. Page through in 1000-row chunks so
// every row is hydrated.
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + SIZE - 1);
    if (error) { console.error(`hydrate: ${table} page ${from} failed`, error.message); break; }
    if (!data || data.length === 0) break;
    out.push(...(data as T[]));
    if (data.length < SIZE) break;
  }
  return out;
}

export async function hydrateFromSupabase(): Promise<Dataset> {
  const [
    studies,
    sites,
    barns,
    pens,
    subjects,
    owners,
    forms,
    memberships,
    speciesRanges,
  ] = await Promise.all([
    supabase.from("studies").select("id, code, name, sponsor, phase, type, species, status, enrollment_target, description"),
    supabase.from("sites").select("id, study_id, code, name, status, location, principal_investigator"),
    supabase.from("barns").select("id, site_id, code, name"),
    supabase.from("pens").select("id, barn_id, code, name"),
    supabase.from("subjects").select("id, study_id, site_id, barn_id, pen_id, owner_id, subject_code, species, status, randomization_arm"),
    supabase.from("companion_owners").select("id, study_id, full_name"),
    supabase.from("forms").select("id, study_id, visit_id, parent_form_id, code, name, sequence, scope, batch_eligible"),
    supabase.from("study_memberships").select("study_id, role").eq("user_id", DEMO_USER_ID),
    supabase.from("species_ranges").select("species, vital, min, max, unit"),
  ]);
  // Potentially-large tables — paged so none is truncated at 1000 rows.
  const [formFields, formInstances, fieldValues, queries, queryMessages, sdvRecords] = await Promise.all([
    fetchAll<Dataset["formFields"][number]>("form_fields", "id, form_id, code, label, field_type, options, unit, is_required, sequence, validation"),
    fetchAll<Dataset["formInstances"][number]>("form_instances", "id, form_id, subject_id, barn_id, site_id, status"),
    fetchAll<Dataset["fieldValues"][number]>("field_values", "id, form_instance_id, form_field_id, value"),
    fetchAll<Dataset["queries"][number]>("queries", "id, form_instance_id, field_value_id, status, title"),
    fetchAll<Dataset["queryMessages"][number]>("query_messages", "id, query_id, author_id, body, created_at"),
    fetchAll<Dataset["sdvRecords"][number]>("sdv_records", "id, form_instance_id, field_value_id, status"),
  ]);

  const rawQueries = queries;
  const rawMsgs = queryMessages;

  // Split: a seeded "auto edit-check" query is really an edit check, not a query.
  // Detect it by its first message (Auto edit-check: …) and move it to editChecks.
  const editChecks: Dataset["editChecks"] = [];
  const splitQueries = rawQueries.filter((q) => {
    const first = rawMsgs.find((m) => m.query_id === q.id);
    const isAuto = first?.body?.startsWith("Auto edit-check:") ?? false;
    if (isAuto && q.status !== "resolved" && q.field_value_id) {
      editChecks.push({
        id: q.id,
        form_instance_id: q.form_instance_id,
        field_value_id: q.field_value_id,
        message: q.title,
        status: "open",
        created_at: first?.created_at ?? new Date().toISOString(),
      });
      return false; // remove from queries
    }
    return true;
  });

  // Session-only per-feedlot enrolment targets for BR-2502 (not a DB column —
  // seeded here, same as the other Overview-config fields). Over the cap is a
  // protocol deviation. Counts: TX/KS under cap, NE at cap, CO over cap (demo).
  const BR_SITE_TARGETS: Record<string, number> = { TX: 5, KS: 4, NE: 3, CO: 2 };
  const brStudyId = (studies.data ?? []).find((s) => s.code === "BR-2502")?.id;
  const sitesWithTargets = ((sites.data ?? []) as Dataset["sites"]).map((s) =>
    s.study_id === brStudyId && BR_SITE_TARGETS[s.code] != null
      ? { ...s, enrollment_target: BR_SITE_TARGETS[s.code] }
      : s,
  );

  // Read-only auto-derived rollup forms — flag them on the form row (so renderers
  // check `form.is_summary`, not the form name).
  const SUMMARY_FORM_NAMES = new Set(["Production Summary", "Pen BRD Summary"]);
  const formsWithFlags = ((forms.data ?? []) as Dataset["forms"]).map((f) =>
    SUMMARY_FORM_NAMES.has(f.name) ? { ...f, is_summary: true } : f,
  );

  // ─── Seeded SDV state (session-only) ────────────────────────────────────────
  // No interactive SDV has run on a fresh tab, so seed verified records to a target
  // % per site — the CRA/DM dashboard SDV bars + lock-readiness then show real
  // progress, and the SDV worklist opens with partially-verified forms. Deterministic
  // (verify the first N% of SDV-eligible field values by id) so it's stable.
  const SDV_TARGETS: Record<string, Record<string, number>> = {
    "CA-0801": { "101": 74, "102": 58, "103": 42 },
    "BR-2502": { TX: 65, KS: 50, NE: 35, CO: 20 },
    "PH-2401": { RUA: 62 },
  };
  const SDV_INELIGIBLE = new Set(["file", "calculated", "textarea"]);
  const studyCodeById = new Map((studies.data ?? []).map((s) => [s.id, s.code]));
  const siteCodeById = new Map((sites.data ?? []).map((s) => [s.id, s.code]));
  const subjById2 = new Map((subjects.data ?? []).map((s) => [s.id, s]));
  const instById2 = new Map((formInstances as Dataset["formInstances"]).map((i) => [i.id, i]));
  const fieldTypeById = new Map((formFields as Dataset["formFields"]).map((f) => [f.id, f.field_type]));
  const fvByBucket = new Map<string, Dataset["fieldValues"]>();
  for (const fv of fieldValues as Dataset["fieldValues"]) {
    if (fv.value == null || fv.value === "") continue;
    const ft = fieldTypeById.get(fv.form_field_id);
    if (!ft || SDV_INELIGIBLE.has(ft)) continue;
    const inst = instById2.get(fv.form_instance_id);
    const subj = inst?.subject_id ? subjById2.get(inst.subject_id) : undefined;
    if (!subj || !subj.site_id) continue;
    const code = studyCodeById.get(subj.study_id), siteCode = siteCodeById.get(subj.site_id);
    if (!code || !siteCode || SDV_TARGETS[code]?.[siteCode] == null) continue;
    const key = `${code}|${siteCode}`;
    (fvByBucket.get(key) ?? fvByBucket.set(key, []).get(key)!).push(fv);
  }
  const seededSdv: Dataset["sdvRecords"] = [];
  for (const [key, fvs] of Array.from(fvByBucket.entries())) {
    const [code, siteCode] = key.split("|");
    const pct = SDV_TARGETS[code][siteCode];
    const sorted = fvs.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
    const n = Math.round((pct / 100) * sorted.length);
    for (let i = 0; i < n; i++) seededSdv.push({ id: `sdvseed-${sorted[i].id}`, form_instance_id: sorted[i].form_instance_id, field_value_id: sorted[i].id, status: "verified", verified_by_name: "Jordan Reyes", verified_at: "2026-06-12" });
  }
  const sdvWithSeed = [...(sdvRecords as Dataset["sdvRecords"]), ...seededSdv];

  return {
    studies: (studies.data ?? []) as Dataset["studies"],
    sites: sitesWithTargets,
    barns: (barns.data ?? []) as Dataset["barns"],
    pens: (pens.data ?? []) as Dataset["pens"],
    subjects: (subjects.data ?? []) as Dataset["subjects"],
    owners: (owners.data ?? []) as Dataset["owners"],
    forms: formsWithFlags,
    formFields: formFields as Dataset["formFields"],
    formInstances: formInstances as Dataset["formInstances"],
    fieldValues: fieldValues as Dataset["fieldValues"],
    queries: splitQueries,
    queryMessages: rawMsgs,
    editChecks,
    sdvRecords: sdvWithSeed,
    deltaRecords: [], // session-only — not sourced from Supabase
    unblindings: [], // session-only — emergency-unblinding log
    studyLocks: [], // session-only — database-lock log
    memberships: (memberships.data ?? []) as Dataset["memberships"],
    speciesRanges: (speciesRanges.data ?? []) as Dataset["speciesRanges"],
  };
}
