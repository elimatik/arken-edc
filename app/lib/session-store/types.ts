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
  code: string;
  name: string;
  sequence: number;
}

export interface FormInstanceRow {
  id: string;
  form_id: string;
  subject_id: string;
  status: string; // empty | in_work | reviewed | finalized | locked
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
}

export interface QueryMessageRow {
  id: string;
  query_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface SdvRecordRow {
  id: string;
  form_instance_id: string;
  field_value_id: string | null;
  status: string;
}

export interface MembershipRow {
  study_id: string;
  role: Role;
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
  formInstances: FormInstanceRow[];
  fieldValues: FieldValueRow[];
  queries: QueryRow[];
  queryMessages: QueryMessageRow[];
  sdvRecords: SdvRecordRow[];
  memberships: MembershipRow[];
}

export const EMPTY_DATASET: Dataset = {
  studies: [],
  sites: [],
  barns: [],
  pens: [],
  subjects: [],
  owners: [],
  forms: [],
  formInstances: [],
  fieldValues: [],
  queries: [],
  queryMessages: [],
  sdvRecords: [],
  memberships: [],
};
