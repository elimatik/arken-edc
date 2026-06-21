// ════════════════════════════════════════════════════════════════════════════
// Study blinding configuration — the single source of truth for whether treatment
// arms may be shown to a given role on a given study. Consumed by BOTH the Reports
// components and the Dashboard cards so the rule lives in exactly one place.
//
// Blinding is a property of the study (no `blinded` column exists in the seed, so
// it's keyed by study code) AND the role. A view hides arms only when the study is
// blinded AND the role is a blinded role.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";

// CA-0801 is the only blinded (double-blind, placebo-controlled) study.
// BR-2502 ("masked") and PH-2401 are treated as open-label per protocol.
const BLINDED_STUDY_CODES = new Set(["CA-0801"]);

// On a blinded study these roles see neutralised (arm-free) views; DM, PI, and
// Admin are unblinded (PI gains access via emergency unblinding).
const BLINDED_ROLES = new Set<Role>(["CRC", "CRA", "Sponsor"]);

export function isStudyBlinded(dataset: Dataset, studyId: string): boolean {
  const study = dataset.studies.find((s) => s.id === studyId);
  return !!study && BLINDED_STUDY_CODES.has(study.code);
}

export function isRoleBlinded(role: Role): boolean {
  return BLINDED_ROLES.has(role);
}

// The one check every arm-rendering surface calls before showing an arm name,
// arm-colour segment, or per-arm count.
export function shouldHideArms(dataset: Dataset, studyId: string, role: Role): boolean {
  return isStudyBlinded(dataset, studyId) && isRoleBlinded(role);
}
