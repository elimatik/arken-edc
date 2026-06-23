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
  // Session-only ethics & regulatory config (seeded in hydrate.ts).
  iacuc_number?: string | null;
  iacuc_approval_date?: string | null;
  iacuc_expiry?: string | null;
  vich_guideline?: string | null;
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
  // Session-only Overview-tab configuration (Site Information + Regulatory & Ethics).
  city?: string | null;
  state_country?: string | null;
  iec_name?: string | null;
  iec_ref?: string | null;
  iec_approval_date?: string | null;
  iec_expiry_date?: string | null;
  regulatory_authority?: string | null;
  import_export_required?: string | null; // "Yes" | "No"
  permit_number?: string | null;
  enrollment_target?: number | null; // per-site enrolment cap (over-enrolment = a protocol deviation)
}

export interface BarnRow {
  id: string;
  site_id: string;
  code: string;
  name: string;
  // Session-only Overview-tab configuration (House Information + Biosecurity).
  floor_area_m2?: string | null;
  capacity?: string | null;
  house_type?: string | null;
  feeder_type?: string | null;
  drinker_type?: string | null;
  ventilation_type?: string | null;
  litter_type?: string | null;
  house_status?: string | null;
  biosecurity_level?: string | null;
  last_cleanout?: string | null;
  last_disinfection?: string | null;
  disinfection_product?: string | null;
  downtime_days?: string | null;
  visitor_log_required?: string | null;
  flock_placement_date?: string | null;
  biosecurity_notes?: string | null;
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
  scope?: string; // 'subject' (default, pen/animal record) | 'barn' (house record)
  batch_eligible?: boolean; // fillable for many animals at once in Batch Entry
  is_summary?: boolean; // read-only, auto-derived rollup (Production Summary, Pen BRD Summary)
}

export interface FormInstanceRow {
  id: string;
  form_id: string;
  subject_id: string | null; // null for barn-/site-scoped instances
  barn_id?: string | null; // set on barn-scoped instances (Daily Environmental Log)
  site_id?: string | null; // set on site-scoped instances (SIV, Staff, Monitoring …)
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

// VeDDRA coding task — the unit of work in the Coding module (the DM's write path).
// One per uncoded/coded verbatim AE or ConMed term. The Coding module is the source
// of truth for a term's coding state; panels + reports read it back by subject +
// verbatim match. Session-only (seeded + created in-session).
export interface CodingTask {
  id: string;
  studyId: string;
  subjectId: string;
  formInstanceId: string; // "" when the term lives in a seeded saeReports/conMeds entry
  fieldCode: string;
  verbatimTerm: string;
  termType: "ae" | "drug";
  status: "pending" | "coded" | "review" | "excluded";
  llt?: string;
  pt?: string;
  hlt?: string;
  soc?: string;
  code?: string;
  codedBy?: string; // user name or "Auto"
  autoConf?: number; // 0–1, only when codedBy === "Auto"
  conflict?: boolean; // autoConf < 0.80
  codedAt?: string; // ISO timestamp
}

// Serious adverse event with its GCP/VICH reporting timeline. Session-only seed
// (the AE forms carry no notification dates); the AE/SAE Roster merges these into
// the serious-event sub-section. `sponsor_notified_date` null = not yet notified.
export interface SaeReportRow {
  id: string;
  study_id: string;
  subject_id: string;
  description: string;
  onset_date: string;
  severity: string;
  relatedness: string;
  sae_criterion: string; // Death | Life-threatening | Hospitalization | Disability | Congenital anomaly | Other important medical event
  outcome: string;
  pi_aware_date: string;
  sponsor_notified_date: string | null;
  veddra_code: string; // coded AE term (VeDDRA)
  veddra_coding: "coded" | "pending" | "excluded";
  serious?: boolean; // default true; false = a seeded non-serious AE (e.g. excluded minor reaction)
}

// Concomitant medication — a medicine a subject takes alongside the investigational
// product. Session-only seed data (no conmeds table in Supabase); the ConMed Log
// report reads these directly. `interaction` flags a known drug-interaction class
// (e.g. a concurrent antibiotic in an antimicrobial-treatment study).
export interface ConMedRow {
  id: string;
  study_id: string;
  subject_id: string;
  medication: string;
  drug_class: string;
  dose: string;
  route: string;
  start_date: string;
  end_date: string | null; // null = ongoing
  ongoing: boolean;
  indication: string;
  concurrent_with: string; // visit / timepoint label
  interaction: boolean; // overlaps a known drug-interaction class
  veddra_code: string; // coded drug term (VeDDRA dictionary)
  coding_status: "coded" | "pending" | "excluded"; // DM coding state (excluded = not codable, e.g. water)
  washout_days: number; // protocol-defined washout (CA-0801 immunosuppressants); 0 = none
  conmed_type: "metaphylaxis" | "therapeutic" | "preventive" | null; // BR-2502 antibiotic admin type
}

// Protocol deviation (ICH E6 §8.3.16). Session-only seed.
export interface ProtocolDeviationRow {
  id: string;
  study_id: string;
  site_id: string | null;
  subject_code: string;
  deviation_type: string; // Eligibility | Visit window | Dosing | Consent | Procedure
  date: string;
  severity: string; // Minor | Major
  reported_to_sponsor: boolean;
  status: string; // Open | Closed
}

// Emergency unblinding (double-blind studies only) — session-only. Records who
// revealed a subject's arm and why; drives the Subject-Record arm reveal and an
// "Emergency Unblinding" entry in the Audit Trail. Permanent + auditable.
export interface UnblindingRow {
  id: string;
  subject_id: string;
  arm: string; // the revealed treatment arm
  reason: string;
  author_name: string;
  author_role: string;
  created_at: string;
}

// Session-only Database Lock log. A full-study lock taken prior to statistical
// analysis renders ALL forms read-only. Each toggle (lock / unlock) pushes a
// record; the latest record's `locked` flag is the study's current state.
export interface StudyLockRow {
  id: string;
  study_id: string;
  locked: boolean; // true = lock taken, false = unlocked
  reason: string;
  authorized_by: string;
  author_role: string;
  created_at: string;
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
  hint?: string; // persistent help text shown under the field (e.g. score-scale legend)
  message?: string; // custom edit-check message (overrides the generic out-of-range text)
  // Field-level conditional display: show this field only when the referenced
  // field's value equals `equals` (same form first, else any value on the subject).
  // `equals` omitted → shown whenever the referenced field has any value.
  showIf?: { code: string; equals?: string };
  readonlyAuto?: boolean; // computed/auto read-only value (e.g. Protocol version) — AUTO badge
  cadesiTotal?: boolean; // CADESI-04 total — carries a collapsible lesion-type breakdown
  cadesiSub?: boolean; // a CADESI-04 lesion subtotal (erythema/lichenification/…)
  dartSource?: string; // "Recommended action" calc field — code of the DART score it derives from
  overallEligibility?: boolean; // calc field that summarises this form's I/E criteria into a verdict
  autoFromArm?: boolean; // value auto-populated from the subject's randomization assigned_arm (read-only)
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

// ─── Inventory (session-only — drug supply tracking) ─────────────────────────
export type VialStatus = "available" | "athome" | "depleted" | "removed" | "returned" | "unusable";
export type VialEventType = "received" | "dispense" | "return" | "removed" | "returned";

export interface VialEvent {
  type: VialEventType;
  date: string; // ISO YYYY-MM-DD
  note?: string;
  // dispense fields
  subject?: string; // subject_code
  visit?: string;
  volDispensed?: number;
  route?: string;
  location?: "clinic" | "home" | "farm";
  formInstanceId?: string; // links to Treatment Admin / Feed setup instance
  by?: string; // dispensed by
  // return fields
  volReturned?: number;
  condition?: string;
}

export interface Vial {
  id: string; // "VL-BR-001" — or BATCH ID for feed studies
  studyId: string;
  lotId: string; // groups vials into shipment lots
  kitNumber?: string; // CA-0801 blinded kit label ("Kit A-001")
  drugName: string; // blinding-gated on CA-0801
  treatmentGroup: string; // "Treatment A" / "Control" etc.
  initialVol: number;
  concentration: number; // %
  unit: string; // "ml" for vials, "kg" for feed batches
  expiryDate: string;
  receivedDate: string;
  status: VialStatus;
  siteId: string | null;
  events: VialEvent[];
  expectedDailyDose?: number; // CA-0801 volume accountability (ml/day)
  withdrawalDays?: number; // BR-2502 withdrawal period (days)
}

export interface Shipment {
  id: string; // "SHP-001"
  studyId: string;
  lot: string; // "LOT-001"
  shipDate: string;
  receiveDate: string;
  vialCount: number;
  usableCount: number;
  confirmed: boolean;
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
  unblindings: UnblindingRow[]; // session-only emergency-unblinding log
  studyLocks: StudyLockRow[]; // session-only database-lock log
  conMeds: ConMedRow[]; // session-only concomitant-medication seed
  saeReports: SaeReportRow[]; // session-only SAE reporting-timeline seed
  protocolDeviations: ProtocolDeviationRow[]; // session-only protocol-deviation seed
  codingTasks: CodingTask[]; // session-only VeDDRA coding worklist (source of truth for coded state)
  vials: Vial[]; // session-only drug-inventory worklist (Inventory module)
  shipments: Shipment[]; // session-only drug shipments (Inventory module)
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
  unblindings: [],
  studyLocks: [],
  conMeds: [],
  saeReports: [],
  protocolDeviations: [],
  codingTasks: [],
  vials: [],
  shipments: [],
  memberships: [],
  speciesRanges: [],
};
