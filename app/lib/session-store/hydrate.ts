// ════════════════════════════════════════════════════════════════════════════
// One-time hydration of the session store from Supabase. Supabase is the
// read-only seed source; after this, all reads/writes use the session store.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from "@/lib/supabase";
import { DEMO_USER_ID } from "@/lib/constants";
import type { Dataset } from "./types";

export async function hydrateFromSupabase(): Promise<Dataset> {
  const [
    studies,
    sites,
    barns,
    pens,
    subjects,
    owners,
    forms,
    formFields,
    formInstances,
    fieldValues,
    queries,
    queryMessages,
    sdvRecords,
    memberships,
    speciesRanges,
  ] = await Promise.all([
    supabase.from("studies").select("id, code, name, sponsor, phase, type, species, status, enrollment_target, description"),
    supabase.from("sites").select("id, study_id, code, name, status, location, principal_investigator"),
    supabase.from("barns").select("id, site_id, code, name"),
    supabase.from("pens").select("id, barn_id, code, name"),
    supabase.from("subjects").select("id, study_id, site_id, barn_id, pen_id, owner_id, subject_code, species, status, randomization_arm"),
    supabase.from("companion_owners").select("id, study_id, full_name"),
    supabase.from("forms").select("id, study_id, visit_id, parent_form_id, code, name, sequence, scope"),
    supabase.from("form_fields").select("id, form_id, code, label, field_type, options, unit, is_required, sequence, validation"),
    supabase.from("form_instances").select("id, form_id, subject_id, barn_id, site_id, status"),
    supabase.from("field_values").select("id, form_instance_id, form_field_id, value"),
    supabase.from("queries").select("id, form_instance_id, field_value_id, status, title"),
    supabase.from("query_messages").select("id, query_id, author_id, body, created_at"),
    supabase.from("sdv_records").select("id, form_instance_id, field_value_id, status"),
    supabase.from("study_memberships").select("study_id, role").eq("user_id", DEMO_USER_ID),
    supabase.from("species_ranges").select("species, vital, min, max, unit"),
  ]);

  const rawQueries = (queries.data ?? []) as Dataset["queries"];
  const rawMsgs = (queryMessages.data ?? []) as Dataset["queryMessages"];

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

  return {
    studies: (studies.data ?? []) as Dataset["studies"],
    sites: (sites.data ?? []) as Dataset["sites"],
    barns: (barns.data ?? []) as Dataset["barns"],
    pens: (pens.data ?? []) as Dataset["pens"],
    subjects: (subjects.data ?? []) as Dataset["subjects"],
    owners: (owners.data ?? []) as Dataset["owners"],
    forms: (forms.data ?? []) as Dataset["forms"],
    formFields: (formFields.data ?? []) as Dataset["formFields"],
    formInstances: (formInstances.data ?? []) as Dataset["formInstances"],
    fieldValues: (fieldValues.data ?? []) as Dataset["fieldValues"],
    queries: splitQueries,
    queryMessages: rawMsgs,
    editChecks,
    sdvRecords: (sdvRecords.data ?? []) as Dataset["sdvRecords"],
    deltaRecords: [], // session-only — not sourced from Supabase
    memberships: (memberships.data ?? []) as Dataset["memberships"],
    speciesRanges: (speciesRanges.data ?? []) as Dataset["speciesRanges"],
  };
}
