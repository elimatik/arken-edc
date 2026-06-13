// ════════════════════════════════════════════════════════════════════════════
// Form validation engine (Case Study 3). Pure functions: a field declares what
// to validate (validation.vital or static min/max); the species table provides
// the parameters; the value is checked → an edit-check, or null.
// ════════════════════════════════════════════════════════════════════════════

import type { FormFieldRow, SpeciesRangeRow } from "@/lib/session-store/types";

export interface Range {
  min: number;
  max: number;
  unit: string;
}

export interface EditCheck {
  fieldId: string;
  fieldCode: string;
  /** Human message for the inline state / query title. */
  message: string;
  range: Range;
  value: number;
}

// Resolve the effective range for a field given the subject's species (and, for
// age-class vitals like bovine heart rate, the animal's age in months).
export function resolveRange(
  field: FormFieldRow,
  species: string,
  ranges: SpeciesRangeRow[],
  ageMonths?: number | null,
): Range | null {
  const v = field.validation;
  if (!v) return null;
  if (v.vital) {
    // Age-class vitals resolve `<vital>_calf` / `<vital>_adult` (calf ≤ 6 months;
    // adult — or unknown age — uses the adult range).
    const vitalKey = v.ageClass
      ? `${v.vital}_${ageMonths != null && ageMonths <= 6 ? "calf" : "adult"}`
      : v.vital;
    const r = ranges.find((x) => x.species === species && x.vital === vitalKey);
    return r ? { min: Number(r.min), max: Number(r.max), unit: r.unit } : null;
  }
  if (v.min != null || v.max != null) {
    return { min: v.min ?? -Infinity, max: v.max ?? Infinity, unit: field.unit ?? "" };
  }
  return null;
}

// A "Normal: min–max unit" hint for vital fields (species-resolved).
export function rangeLabel(field: FormFieldRow, species: string, ranges: SpeciesRangeRow[], ageMonths?: number | null): string | null {
  const r = resolveRange(field, species, ranges, ageMonths);
  if (!r || !Number.isFinite(r.min) || !Number.isFinite(r.max)) return null;
  const unit = r.unit ? ` ${r.unit}` : "";
  return `Normal: ${r.min}–${r.max}${unit}`;
}

// Evaluate a field value → an edit-check if out of range, else null.
export function evaluateField(
  field: FormFieldRow,
  rawValue: string | null | undefined,
  species: string,
  ranges: SpeciesRangeRow[],
  ageMonths?: number | null,
): EditCheck | null {
  if (rawValue == null || String(rawValue).trim() === "") return null; // empty → no range check
  const range = resolveRange(field, species, ranges, ageMonths);
  if (!range) return null;
  const value = Number(rawValue);
  if (Number.isNaN(value)) return null; // non-numeric → skip
  if (value < range.min || value > range.max) {
    const unit = range.unit ? ` ${range.unit}` : "";
    return {
      fieldId: field.id,
      fieldCode: field.code,
      message: `Value outside expected range (${range.min}–${range.max}${unit}) — verify`,
      range,
      value,
    };
  }
  return null;
}
