// ════════════════════════════════════════════════════════════════════════════
// Hierarchy terminology — the labels used for the housing levels between a site
// and an animal differ by species. Equine studies say Stable / Stall where a
// bovine study says Barn / Pen. Driven by a map keyed on the study's species
// (falling back to study type), so every screen relabels from one source.
// ════════════════════════════════════════════════════════════════════════════

export interface HousingTerms {
  barn: string; // the mid-level container (Barn / Stable)
  pen: string; // the leaf container holding animals (Pen / Stall)
}

// Species-specific overrides. Anything not listed uses the default below.
const SPECIES_TERMS: Record<string, HousingTerms> = {
  equine: { barn: "Stable", pen: "Stall" },
};

const DEFAULT_TERMS: HousingTerms = { barn: "Barn", pen: "Pen" };

export interface TerminologyStudy {
  type?: string | null; // companion | livestock_group | livestock_individual
  species?: string | null;
}

// Resolve the housing terms for a study (keyed on species, then type).
export function housingTerms(study: TerminologyStudy | null | undefined): HousingTerms {
  if (!study) return DEFAULT_TERMS;
  if (study.species && SPECIES_TERMS[study.species]) return SPECIES_TERMS[study.species];
  return DEFAULT_TERMS;
}

// The ordered hierarchy level names for a study, terminology applied.
//   companion              → Site → Animal
//   livestock_group/indiv. → Site → Barn|Stable → Pen|Stall → Animal
export function hierarchyLevels(study: TerminologyStudy | null | undefined): string[] {
  if (study?.type === "companion") return ["Site", "Animal"];
  const t = housingTerms(study);
  return ["Site", t.barn, t.pen, "Animal"];
}
