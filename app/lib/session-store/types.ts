// ════════════════════════════════════════════════════════════════════════════
// Session store data model — the in-memory dataset hydrated from Supabase once
// per browser tab. Rows mirror the DB tables. All edits mutate this dataset
// (persisted to sessionStorage); nothing is written back to Supabase.
// ════════════════════════════════════════════════════════════════════════════

import type { Role } from "@/lib/permissions";

export interface StudyRow {
  id: string;
  code: string;
  name: string;
  sponsor: string | null;
  phase: string | null;
  type: string; // companion | livestock_group | livestock_individual
  species: string | null;
  status: string;
  enrollment_target: number | null;
  description: string | null;
}

export interface SiteRow {
  id: string;
  study_id: string;
  code: string;
  name: string;
  status: string;
  location?: string | null;
  principal_investigator?: string | null;
  // Session-only extras captured by the Add Site modal (not in the DB seed).
  time_zone?: string | null;
  investigator_phone?: string | null;
  investigator_email?: string | null;
}

export interface BarnRow {
  id: string;
  site_id: string;
  code: string;
  name: string;
}

export interface PenRow {
  id: string;
  barn_id: string;
  code: string;
  name: string;
}

export interface SubjectRow {
  id: string;
  study_id: string;
  site_id: string | null;
  barn_id: string | null;
  pen_id: string | null;
  owner_id: string | null;
  subject_code: string;
  species: string | null;
  status: string;
  randomization_arm: string | null;
  ineligible?: boolean; // set when an inclusion/exclusion criterion fails (session-only)
  override_reason?: string | null; // PI override reason (clears ineligibility, session-only)
  override_by?: string | null; // PI who overrode
  override_at?: string | null; // YYYY-MM-DD of override
}

export interface OwnerRow {
  id: string;
  study_id: string;
  full_name: string;
}

export interface FormRow {
  id: string;
  study_id: string;
  visit_id: string | null;
  parent_form_id: string | null; // set on sub-forms (→ their group container)
  code: string;
  name: string;
  sequence: number;
}

export interface FormInstanceRow {
  id: string;
  form_id: string;
  subject_id: string;
  status: string; // empty | in_work | reviewed | finalized | locked
  sdv_complete?: boolean; // form marked SDV-complete (session-only)
}

export interface FieldValueRow {
  id: string;
  form_instance_id: string;
  form_field_id: string;
  value: string | null;
}

export interface QueryRow {
  id: string;
  form_instance_id: string;
  field_value_id: string | null;
  status: string; // open | responded | resolved
  title: string;
  from_edit_check?: boolean; // true when this query was converted from an edit check
  created_at?: string; // for chronological ordering of multiple queries on a field
}

// Auto-raised validation alert (out-of-range), distinct from a manual query.
// Resolves when the value is corrected; converts to a query when the user explains it.
export interface EditCheckRow {
  id: string;
  form_instance_id: string;
  field_value_id: string;
  message: string;
  status: string; // open | resolved | converted
  created_at: string;
}

export interface QueryMessageRow {
  id: string;
  query_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
  author_name?: string | null; // set on human responses (null/absent = auto edit-check)
  author_role?: string | null; // the role that authored the response
}

export interface SdvRecordRow {
  id: string;
  form_instance_id: string;
  field_value_id: string | null;
  status: string;
  verified_by_name?: string | null; // who verified (set on verify)
  verified_at?: string | null; // YYYY-MM-DD of verification
}

// Change-reason (Δ) record — one per value transition of an already-saved field
// (21 CFR Part 11). A change pushes a `pending` record (reason empty); providing the
// reason makes it `responded`; a DM sign-off makes it `approved`. `reason` is "" while
// pending. A→B→C without reasons in between yields two records (A→B, B→C).
export interface DeltaRecordRow {
  id: string;
  field_value_id: string;
  old_value: string;
  new_value: string;
  reason: string;
  author_name: string;
  author_role: string;
  created_at: string;
  status: "pending" | "responded" | "approved";
}

export interface MembershipRow {
  study_id: string;
  role: Role;
}

// Field validation declared on a form field. `vital` resolves a species-specific
// range from species_ranges; `min`/`max` are species-independent static bounds.
export interface FieldValidation {
  vital?: string; // heart_rate | temperature | respiratory_rate | weight
  min?: number;
  max?: number;
  onViolation?: "query" | "block";
  coded?: boolean; // text field that opens a dictionary (VeDDRA) lookup
  exclusion_criterion?: boolean; // yes/no inclusion-exclusion criterion
  exclusion_if?: "Yes" | "No"; // the answer that FAILS the criterion (default "No")
  ageClass?: boolean; // vital whose range depends on the animal's age class (calf/adult)
  section?: string; // explicit in-form section heading this field belongs to
}

export interface FormFieldRow {
  id: string;
  form_id: string;
  code: string;
  label: string;
  field_type: string;
  options: string[] | null;
  unit: string | null;
  is_required: boolean;
  sequence: number;
  validation: FieldValidation | null;
}

export interface SpeciesRangeRow {
  species: string;
  vital: string;
  min: number;
  max: number;
  unit: string;
}

// The full hydrated dataset held in the session.
export interface Dataset {
  studies: StudyRow[];
  sites: SiteRow[];
  barns: BarnRow[];
  pens: PenRow[];
  subjects: SubjectRow[];
  owners: OwnerRow[];
  forms: FormRow[];
  formFields: FormFieldRow[];
  formInstances: FormInstanceRow[];
  fieldValues: FieldValueRow[];
  queries: QueryRow[];
  queryMessages: QueryMessageRow[];
  editChecks: EditCheckRow[];
  sdvRecords: SdvRecordRow[];
  deltaRecords: DeltaRecordRow[];
  memberships: MembershipRow[];
  speciesRanges: SpeciesRangeRow[];
}

export const EMPTY_DATASET: Dataset = {
  studies: [],
  sites: [],
  barns: [],
  pens: [],
  subjects: [],
  owners: [],
  forms: [],
  formFields: [],
  formInstances: [],
  fieldValues: [],
  queries: [],
  queryMessages: [],
  editChecks: [],
  sdvRecords: [],
  deltaRecords: [],
  memberships: [],
  speciesRanges: [],
};
