// ════════════════════════════════════════════════════════════════════════════
// Coding module derivations. The Coding module is the source of truth for a
// verbatim term's VeDDRA state; the AE/ConMed panels and the reports read it back
// via codingIndex() (keyed by subject + verbatim). buildCodingWorklist merges the
// seeded coding tasks with any AE/ConMed form instances that don't have one yet.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, CodingTask } from "@/lib/session-store/types";

const AE_DESC_CODES = ["ae_term", "ae_description", "event_description", "description"];
const CONMED_MED_CODES = ["medication", "medication_name"];

// Normalise a verbatim term for matching — lowercase, drop a trade-name in
// parentheses, collapse spaces. "Tulathromycin (Draxxin)" → "tulathromycin".
// VeDDRA coding is per verbatim term, so a coded term applies study-wide.
export function normalizeTerm(s: string): string {
  return s.toLowerCase().replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
}

export interface CodingRow extends CodingTask {
  subjectCode: string;
  formLabel: string;
  species: string;
}

function aeFormIds(dataset: Dataset, studyId: string): Set<string> {
  return new Set(dataset.forms.filter((f) => f.study_id === studyId && f.name === "Adverse Event").map((f) => f.id));
}
function conmedFormIds(dataset: Dataset, studyId: string): Set<string> {
  const studyFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  const out = new Set<string>();
  for (const f of dataset.formFields) if (studyFormIds.has(f.form_id) && CONMED_MED_CODES.includes(f.code)) out.add(f.form_id);
  return out;
}

export function buildCodingWorklist(dataset: Dataset, studyId: string): CodingRow[] {
  const subById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fieldById = new Map(dataset.formFields.map((f) => [f.id, f]));
  const speciesOf = (subjId: string) => subById.get(subjId)?.species ?? dataset.studies.find((s) => s.id === studyId)?.species ?? "—";
  const enrich = (t: CodingTask): CodingRow => {
    const subj = subById.get(t.subjectId);
    const form = t.formInstanceId ? formById.get(dataset.formInstances.find((i) => i.id === t.formInstanceId)?.form_id ?? "") : undefined;
    return { ...t, subjectCode: subj?.subject_code ?? "—", species: speciesOf(t.subjectId), formLabel: form?.name ?? (t.termType === "drug" ? "ConMed" : "Adverse Event") };
  };

  const tasks = dataset.codingTasks.filter((t) => t.studyId === studyId);
  const seen = new Set(tasks.map((t) => `${t.subjectId}|${t.verbatimTerm.toLowerCase()}`));
  const rows: CodingRow[] = tasks.map(enrich);

  // Derive pending tasks from real AE/ConMed form instances not already covered.
  const aeForms = aeFormIds(dataset, studyId);
  const conmedForms = conmedFormIds(dataset, studyId);
  for (const inst of dataset.formInstances) {
    if (!inst.subject_id) continue;
    const isAe = aeForms.has(inst.form_id);
    const isConmed = conmedForms.has(inst.form_id);
    if (!isAe && !isConmed) continue;
    const vals = new Map<string, string>();
    for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id && v.value) { const c = fieldById.get(v.form_field_id)?.code; if (c) vals.set(c, v.value); }
    const codes = isAe ? AE_DESC_CODES : CONMED_MED_CODES;
    let verbatim = "";
    let fieldCode = "";
    for (const c of codes) { const val = vals.get(c); if (val) { verbatim = val; fieldCode = c; break; } }
    if (!verbatim) continue;
    const key = `${inst.subject_id}|${verbatim.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(enrich({
      id: `ct-inst-${inst.id}-${fieldCode}`, studyId, subjectId: inst.subject_id, formInstanceId: inst.id,
      fieldCode, verbatimTerm: verbatim, termType: isConmed ? "drug" : "ae", status: "pending",
    }));
  }
  return rows.sort((a, b) => a.verbatimTerm.localeCompare(b.verbatimTerm));
}

// The patch a Coding action writes onto a task.
export interface CodingPatch {
  status: CodingTask["status"];
  llt?: string; pt?: string; hlt?: string; soc?: string; code?: string;
  codedBy?: string; autoConf?: number; conflict?: boolean;
}

// Apply a coding result inside an update() draft. Upserts the task (instance-derived
// rows aren't in the store yet), then mirrors the coded term onto any matching
// seeded saeReports / conMeds entry so the reports stay consistent.
export function applyCoding(d: Dataset, row: CodingRow, patch: CodingPatch, nowISO: string): void {
  let task = d.codingTasks.find((t) => t.id === row.id);
  if (!task) {
    task = { id: row.id, studyId: row.studyId, subjectId: row.subjectId, formInstanceId: row.formInstanceId, fieldCode: row.fieldCode, verbatimTerm: row.verbatimTerm, termType: row.termType, status: "pending" };
    d.codingTasks.push(task);
  }
  task.status = patch.status;
  task.llt = patch.llt; task.pt = patch.pt; task.hlt = patch.hlt; task.soc = patch.soc; task.code = patch.code;
  task.codedBy = patch.codedBy; task.autoConf = patch.autoConf; task.conflict = patch.conflict;
  task.codedAt = nowISO;

  const term = patch.status === "excluded" ? "N/A — excluded from coding" : patch.pt ?? task.verbatimTerm;
  const codingStatus = patch.status === "coded" ? "coded" : patch.status === "excluded" ? "excluded" : "pending";
  const v = normalizeTerm(row.verbatimTerm);
  // Mirror study-wide onto matching seeded ConMed entries (a coded verbatim term
  // applies wherever it appears in the study).
  for (const c of d.conMeds) {
    if (c.study_id === row.studyId && normalizeTerm(c.medication) === v) {
      c.veddra_code = patch.status === "excluded" ? "N/A — not a regulated drug" : patch.pt ?? c.veddra_code;
      c.coding_status = codingStatus;
    }
  }
  // Mirror onto matching seeded SAE entries (AE terms — description match).
  for (const s of d.saeReports) {
    if (s.study_id === row.studyId && normalizeTerm(s.description) === v) {
      s.veddra_code = term; s.veddra_coding = codingStatus;
    }
  }
  // Write veddra fields onto the originating instance where such fields exist.
  if (row.formInstanceId) {
    const inst = d.formInstances.find((i) => i.id === row.formInstanceId);
    if (inst) {
      const veddraField = d.formFields.find((f) => f.form_id === inst.form_id && (f.code === "veddra_term" || f.code === "event_term" || f.code === "veddra_code"));
      if (veddraField) {
        const fv = d.fieldValues.find((x) => x.form_instance_id === inst.id && x.form_field_id === veddraField.id);
        if (fv) fv.value = term; else d.fieldValues.push({ id: `fv-veddra-${inst.id}`, form_instance_id: inst.id, form_field_id: veddraField.id, value: term });
      }
    }
  }
}

// normalized verbatim → coding task (study-wide). Panels + reports read this to
// override a term's displayed VeDDRA state with the DM's coding. A coded task wins
// over a pending one for the same term.
export function codingIndex(dataset: Dataset, studyId: string): Map<string, CodingTask> {
  const m = new Map<string, CodingTask>();
  for (const t of dataset.codingTasks) {
    if (t.studyId !== studyId) continue;
    const k = normalizeTerm(t.verbatimTerm);
    const prev = m.get(k);
    if (!prev || (t.status === "coded" || t.status === "excluded")) m.set(k, t);
  }
  return m;
}

// Resolve a coding task to the {term, status} a display surface should show.
export function codedDisplay(t: CodingTask | undefined): { term: string; status: "coded" | "pending" | "excluded" } | null {
  if (!t) return null;
  if (t.status === "coded") return { term: t.pt ?? t.verbatimTerm, status: "coded" };
  if (t.status === "excluded") return { term: "N/A — excluded from coding", status: "excluded" };
  return { term: t.verbatimTerm, status: "pending" }; // pending / review → still uncoded
}
