// ════════════════════════════════════════════════════════════════════════════
// SDV (Source Data Verification) derivations. SDV records link to a field VALUE
// (sdvRecords.field_value_id) with status 'verified'. A field is "not required"
// when it's derived (calculated / file / textarea) — verifying the source fields
// covers it. The worklist + form view read live from the session store.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";

// Fields that are NOT independently source-verified (derived / non-source).
const SDV_INELIGIBLE = new Set(["file", "calculated", "textarea"]);
export function isSdvField(fieldType: string): boolean {
  return !SDV_INELIGIBLE.has(fieldType);
}

export type FormSdvStatus = "pending" | "partial" | "complete" | "queried";

export interface SdvWorklistRow {
  formInstanceId: string;
  formId: string;
  subjectId: string;
  subjectCode: string;
  visitLabel: string;
  formName: string;
  siteId: string | null;
  siteLabel: string;
  sdvStatus: FormSdvStatus;
  verifiedFields: number;
  totalRequiredFields: number;
  openQueries: number;
  lastUpdated: string;
  lastActivity: string; // most recent SDV verify OR query on this form (for aging) — "" if none
}

export type FieldSdvStatus = "unverified" | "verified" | "queried" | "not-req";

export interface SdvFieldRow {
  fieldValueId: string;
  fieldCode: string;
  fieldName: string;
  fieldValue: string;
  section: string;
  sdvStatus: FieldSdvStatus;
  enteredBy: string;
  flagged: boolean; // open edit check
  queryId?: string;
}

function buildIndexes(dataset: Dataset) {
  return {
    fieldById: new Map(dataset.formFields.map((f) => [f.id, f])),
    formById: new Map(dataset.forms.map((f) => [f.id, f])),
    subjById: new Map(dataset.subjects.map((s) => [s.id, s])),
    siteById: new Map(dataset.sites.map((s) => [s.id, s])),
    sdvByFv: new Map(dataset.sdvRecords.map((r) => [r.field_value_id, r])),
  };
}

const visitLabelFor = (formName: string, parentName?: string): string => {
  const src = parentName ?? formName;
  const m = src.match(/Day\s+\d+|Week\s+\d+|Screening|Baseline|Follow-?Up\s*\d*|End of Study|Randomi[sz]ation|Enrol/i);
  return m ? m[0] : (parentName ?? "—");
};

// One worklist row per subject form instance that carries at least one SDV-eligible
// field with a value (i.e. there is something to verify).
export function buildSdvWorklist(dataset: Dataset, studyId: string): SdvWorklistRow[] {
  const ix = buildIndexes(dataset);
  const subjIds = new Set(dataset.subjects.filter((s) => s.study_id === studyId).map((s) => s.id));
  const insts = dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));

  // field values grouped by instance (only SDV-eligible, non-empty)
  const fvByInst = new Map<string, { id: string; fieldId: string; value: string }[]>();
  for (const fv of dataset.fieldValues) {
    if (fv.value == null || fv.value === "") continue;
    const field = ix.fieldById.get(fv.form_field_id);
    if (!field || !isSdvField(field.field_type)) continue;
    (fvByInst.get(fv.form_instance_id) ?? fvByInst.set(fv.form_instance_id, []).get(fv.form_instance_id)!).push({ id: fv.id, fieldId: fv.form_field_id, value: fv.value });
  }

  const queriedFvIds = new Set(dataset.queries.filter((q) => q.status !== "resolved" && q.field_value_id).map((q) => q.field_value_id!));
  const openQByInst = new Map<string, number>();
  const lastQueryByInst = new Map<string, string>(); // latest query created_at per instance
  for (const q of dataset.queries) {
    if (q.created_at && (q.created_at > (lastQueryByInst.get(q.form_instance_id) ?? ""))) lastQueryByInst.set(q.form_instance_id, q.created_at.slice(0, 10));
    if (q.status === "resolved") continue;
    openQByInst.set(q.form_instance_id, (openQByInst.get(q.form_instance_id) ?? 0) + 1);
  }

  const rows: SdvWorklistRow[] = [];
  for (const inst of insts) {
    const fields = fvByInst.get(inst.id);
    if (!fields || fields.length === 0) continue;
    const subj = ix.subjById.get(inst.subject_id!);
    const form = ix.formById.get(inst.form_id);
    if (!subj || !form) continue;
    const parent = form.parent_form_id ? ix.formById.get(form.parent_form_id) : undefined;
    const site = subj.site_id ? ix.siteById.get(subj.site_id) : undefined;

    const total = fields.length;
    const verified = fields.filter((f) => ix.sdvByFv.get(f.id)?.status === "verified").length;
    const anyQueried = fields.some((f) => queriedFvIds.has(f.id));
    const sdvStatus: FormSdvStatus = anyQueried
      ? "queried"
      : verified === 0
      ? "pending"
      : verified >= total
      ? "complete"
      : "partial";
    const lastSdv = fields.map((f) => ix.sdvByFv.get(f.id)?.verified_at).filter(Boolean).sort().at(-1) ?? "";
    const lastQ = lastQueryByInst.get(inst.id) ?? "";
    const lastActivity = lastSdv > lastQ ? lastSdv : lastQ;

    rows.push({
      formInstanceId: inst.id,
      formId: form.id,
      subjectId: subj.id,
      subjectCode: subj.subject_code,
      visitLabel: visitLabelFor(form.name, parent?.name),
      formName: form.name,
      siteId: subj.site_id ?? null,
      siteLabel: site ? `${site.code} · ${site.name}` : "—",
      sdvStatus,
      verifiedFields: verified,
      totalRequiredFields: total,
      openQueries: openQByInst.get(inst.id) ?? 0,
      lastUpdated: lastSdv,
      lastActivity,
    });
  }
  return rows;
}

// Field-by-field SDV rows for one form instance (in form-field order, with section).
export function getFormSdvFields(dataset: Dataset, formInstanceId: string): SdvFieldRow[] {
  const ix = buildIndexes(dataset);
  const inst = dataset.formInstances.find((i) => i.id === formInstanceId);
  if (!inst) return [];
  const fields = dataset.formFields.filter((f) => f.form_id === inst.form_id).slice().sort((a, b) => a.sequence - b.sequence);
  const fvByField = new Map(dataset.fieldValues.filter((v) => v.form_instance_id === formInstanceId).map((v) => [v.form_field_id, v]));
  const ecByFv = new Set(dataset.editChecks.filter((e) => e.status === "open").map((e) => e.field_value_id));
  const queryByFv = new Map(dataset.queries.filter((q) => q.status !== "resolved" && q.field_value_id).map((q) => [q.field_value_id!, q.id]));

  const out: SdvFieldRow[] = [];
  for (const field of fields) {
    const fv = fvByField.get(field.id);
    if (!fv || fv.value == null || fv.value === "") continue; // only fields that carry data
    const notReq = !isSdvField(field.field_type);
    const queryId = queryByFv.get(fv.id);
    const verified = ix.sdvByFv.get(fv.id)?.status === "verified";
    const status: FieldSdvStatus = notReq ? "not-req" : queryId ? "queried" : verified ? "verified" : "unverified";
    out.push({
      fieldValueId: fv.id,
      fieldCode: field.code,
      fieldName: field.label,
      fieldValue: fv.value,
      section: field.validation?.section ?? "Details",
      sdvStatus: status,
      enteredBy: ix.sdvByFv.get(fv.id)?.verified_by_name ?? "—",
      flagged: ecByFv.has(fv.id),
      queryId,
    });
  }
  return out;
}
