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

// On a blinded study these roles are NEVER unblinded — they always see neutralised
// (arm-free) views. PI is blinded too (the PI requests emergency unblinding but does
// not gain the cleartext arm here). Only DM and Admin can become unblinded, and only
// per individual subject via the emergency-unblinding log.
const BLINDED_ROLES = new Set<Role>(["CRC", "CRA", "PI", "Sponsor"]);

export function isStudyBlinded(dataset: Dataset, studyId: string): boolean {
  const study = dataset.studies.find((s) => s.id === studyId);
  return !!study && BLINDED_STUDY_CODES.has(study.code);
}

export function isRoleBlinded(role: Role): boolean {
  return BLINDED_ROLES.has(role);
}

// Has THIS subject been individually unblinded (emergency-unblinding log)? Only then
// may an unblindable role (DM/Admin) see its real arm.
export function isSubjectUnblinded(dataset: Dataset, subjectId: string): boolean {
  return (dataset.unblindings ?? []).some((u) => u.subject_id === subjectId);
}

// Per-subject guard — the check any surface that shows ONE subject's arm calls.
// CRC/CRA/PI/Sponsor: always hidden. DM/Admin: hidden unless that subject has been
// individually unblinded. Open-label studies: never hidden.
export function shouldHideArmForSubject(dataset: Dataset, studyId: string, role: Role, subjectId: string): boolean {
  if (!isStudyBlinded(dataset, studyId)) return false;
  if (isRoleBlinded(role)) return true;
  return !isSubjectUnblinded(dataset, subjectId);
}

// Aggregate guard — for arm-rollups that span MANY subjects (enrollment bars, arm
// balance, per-arm counts). Blinded roles are always hidden; DM/Admin stay hidden
// until EVERY randomized subject is unblinded (a rollup that includes any still-
// blinded subject would leak that subject's arm). Open-label studies: never hidden.
export function shouldHideArms(dataset: Dataset, studyId: string, role: Role): boolean {
  if (!isStudyBlinded(dataset, studyId)) return false;
  if (isRoleBlinded(role)) return true;
  const randomized = dataset.subjects.filter((s) => s.study_id === studyId && s.randomization_arm);
  if (randomized.length === 0) return true;
  return !randomized.every((s) => isSubjectUnblinded(dataset, s.id));
}
