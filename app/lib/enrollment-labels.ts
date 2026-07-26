// ════════════════════════════════════════════════════════════════════════════
// Species-aware enrollment-model terminology. The enrollment-model ENUM values are
// fixed (individual | cohort_pen | dam_litter | dynamic_herd); only the DISPLAY
// label changes with the study's species so the same control/column/breadcrumb
// reads naturally for cattle, poultry, fish, or companion animals.
//
// One source of truth — used by the Study configuration seg control, the subject
// hierarchy card, SoE column headers, and data-entry breadcrumbs.
// ════════════════════════════════════════════════════════════════════════════

export type EnrollmentModel = "individual" | "cohort_pen" | "dam_litter" | "dynamic_herd";

// The four label families. A species resolves to exactly one.
type LabelGroup = "livestock" | "poultry" | "aquatic" | "companion";

// Classify a free-text species name into a label family. Livestock (bovine, ovine,
// swine, equine, caprine…) is the default; poultry, aquatic, and companion are
// matched explicitly. Case-insensitive, tolerant of custom names.
export function speciesLabelGroup(species: string | null | undefined): LabelGroup {
  const s = (species ?? "").toLowerCase();
  if (/poultry|broiler|layer|chicken|hen|turkey|duck|quail|fowl|avian|bird/.test(s)) return "poultry";
  if (/fish|aqua|tilapia|salmon|trout|catfish|carp|shrimp|prawn|mollusc|shellfish/.test(s)) return "aquatic";
  if (/dog|canine|cat|feline|rabbit/.test(s)) return "companion";
  return "livestock"; // cattle/bovine, sheep/ovine, swine/pig, equine/horse, goat/caprine, …
}

// model → label, per species family.
const LABELS: Record<LabelGroup, Record<EnrollmentModel, string>> = {
  livestock: { individual: "Individual", cohort_pen: "Pen",         dam_litter: "Dam / Litter",        dynamic_herd: "Herd" },
  poultry:   { individual: "Individual", cohort_pen: "Flock / Pen", dam_litter: "Dam / Litter",        dynamic_herd: "Flock" },
  aquatic:   { individual: "Individual", cohort_pen: "Tank",        dam_litter: "Broodstock / Batch",  dynamic_herd: "Stock" },
  companion: { individual: "Subject",    cohort_pen: "Group",       dam_litter: "Dam / Litter",        dynamic_herd: "Colony" },
};

// The display label for an enrollment MODEL given the study's species.
export function enrollmentModelLabel(model: EnrollmentModel, species: string | null | undefined): string {
  return LABELS[speciesLabelGroup(species)][model];
}

// The singular name of ONE enrolled unit for a study — i.e. the label of its
// selected enrollment model. Use this for the subject-hierarchy subject level, SoE
// column headers, sidebar counts, and data-entry breadcrumbs.
export function enrollmentUnitLabel(model: EnrollmentModel, species: string | null | undefined): string {
  return enrollmentModelLabel(model, species);
}
