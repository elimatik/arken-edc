// ════════════════════════════════════════════════════════════════════════════
// Study-type configuration — the single source of truth for how a study's
// enrollment / subject / randomization / inventory behaviour differs by design.
// Replaces scattered `code === "PH-2401"` style gates: features read the relevant
// flag from getStudyTypeConfig(studyCode) instead of hardcoding a study code.
//
// Keyed by study code (the studies have no `study_type` column in the seed). When
// Study Settings becomes editable this map is what the Study-design card writes to.
// ════════════════════════════════════════════════════════════════════════════

export type StudySpecies = "cattle" | "canine" | "poultry" | "swine" | "equine" | "feline" | "ovine" | "aquatic" | "other";

export interface StudyTypeConfig {
  species: StudySpecies; // downstream: withdrawal defaults, dosing-unit conventions, etc.
  enrollmentModel: "rolling" | "fixed_group" | "single_cohort";
  subjectUnit: "animal" | "pen" | "tank" | "cage";
  subjectUnitPlural: string;
  allowMidStudyAdditions: boolean;
  structureLockedAt: "initiation" | "first_enrollment" | "manual";
  randomizationUnit: "individual" | "group";
  groupAssignmentTiming: "at_enrollment" | "at_setup" | "predetermined";
  inventoryTracking: "unit" | "batch" | "none";
  inventoryItemNoun: string; // 'vial' | 'kit' | 'batch'
  hasAtHomeStatus: boolean;
  enrollmentLabel: string; // 'Target enrollment' | 'Target pens' | 'Target units'
  enrollmentCloseLabel: string; // 'Enrollment close' | 'Study initiation date'
}

const STUDY_TYPE_CONFIG: Record<string, StudyTypeConfig> = {
  "BR-2502": {
    species: "cattle",
    enrollmentModel: "rolling",
    subjectUnit: "animal",
    subjectUnitPlural: "animals",
    allowMidStudyAdditions: true,
    structureLockedAt: "first_enrollment",
    randomizationUnit: "individual",
    groupAssignmentTiming: "at_enrollment",
    inventoryTracking: "unit",
    inventoryItemNoun: "vial",
    hasAtHomeStatus: false,
    enrollmentLabel: "Target enrollment",
    enrollmentCloseLabel: "Enrollment close",
  },
  "CA-0801": {
    species: "canine",
    enrollmentModel: "rolling",
    subjectUnit: "animal",
    subjectUnitPlural: "animals",
    allowMidStudyAdditions: true,
    structureLockedAt: "first_enrollment",
    randomizationUnit: "individual",
    groupAssignmentTiming: "at_enrollment",
    inventoryTracking: "unit",
    inventoryItemNoun: "kit",
    hasAtHomeStatus: true,
    enrollmentLabel: "Target enrollment",
    enrollmentCloseLabel: "Enrollment close",
  },
  "PH-2401": {
    species: "poultry",
    enrollmentModel: "fixed_group",
    subjectUnit: "pen",
    subjectUnitPlural: "pens",
    allowMidStudyAdditions: false,
    structureLockedAt: "initiation",
    randomizationUnit: "group",
    groupAssignmentTiming: "at_setup",
    inventoryTracking: "batch",
    inventoryItemNoun: "batch",
    hasAtHomeStatus: false,
    enrollmentLabel: "Target pens",
    enrollmentCloseLabel: "Study initiation date",
  },
};

export function getStudyTypeConfig(studyCode: string): StudyTypeConfig {
  return STUDY_TYPE_CONFIG[studyCode] ?? STUDY_TYPE_CONFIG["BR-2502"];
}
