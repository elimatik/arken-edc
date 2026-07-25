// ════════════════════════════════════════════════════════════════════════════
// Investigational Products (IP) registry — the single source of truth for the
// study's treatment arms. Settings → Study Identity edits the IP cards; Settings →
// Protocol Builder (Randomization) derives each treatment-group row's Code and
// Blinded label from the matching IP card (1 IP card ↔ 1 treatment group, by
// index). A small module-level external store so both sections stay in lockstep
// across client navigation. Resets to the seeds on a full reload (display-only for
// the portfolio — no session-store shape change).
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";

export type IPType = "drug" | "biologic" | "device" | "supplement" | "placebo";
// One entry per treatment arm. `code` + `blindedLabel` drive the Randomization
// treatment-group row; the rest is drug-registry metadata.
export interface IPProduct {
  type: IPType;
  controlledSubstance: boolean;
  deaSchedule: string;
  name: string;
  indNada: string;
  drugClass: string;
  route: string;
  doseUnit: string;
  sponsor: string;
  code: string;        // Treatment code (T01, ARM-A …) — surfaced app-wide
  blindedLabel: string; // Shown instead of the name when blinding is active
}

export const EMPTY_IP: IPProduct = {
  type: "drug", controlledSubstance: false, deaSchedule: "II",
  name: "", indNada: "", drugClass: "", route: "Oral", doseUnit: "", sponsor: "",
  code: "", blindedLabel: "",
};

// Per-arm seeds — one card per treatment group, aligned by order with the
// randomization groups (randConfig) so group[i] ↔ ip[i].
export const SEEDED_IPS: Record<string, IPProduct[]> = {
  "BR-2502": [
    { type: "drug", controlledSubstance: false, deaSchedule: "II", name: "Tulathromycin 2.5 mg/kg", indNada: "NADA 141-244", drugClass: "Macrolide antimicrobial · Injectable solution", route: "Injectable (SC)", doseUnit: "mL (2.5 mg/kg body weight)", sponsor: "Elanco Animal Health", code: "T01", blindedLabel: "" },
    { type: "drug", controlledSubstance: false, deaSchedule: "II", name: "Tulathromycin 5.0 mg/kg", indNada: "NADA 141-244", drugClass: "Macrolide antimicrobial · Injectable solution", route: "Injectable (SC)", doseUnit: "mL (5.0 mg/kg body weight)", sponsor: "Elanco Animal Health", code: "T02", blindedLabel: "" },
    { type: "placebo", controlledSubstance: false, deaSchedule: "II", name: "Saline 0.9% Placebo", indNada: "", drugClass: "Placebo · Injectable solution", route: "Injectable (SC)", doseUnit: "mL", sponsor: "Site-prepared", code: "T03", blindedLabel: "" },
  ],
  "CA-0801": [
    { type: "drug", controlledSubstance: false, deaSchedule: "II", name: "DermAlliv 10 mg Tablets", indNada: "INAD 012-788", drugClass: "JAK inhibitor · Oral tablet", route: "Oral", doseUnit: "mg/kg", sponsor: "VetDerm Therapeutics", code: "T01", blindedLabel: "Group A" },
    { type: "placebo", controlledSubstance: false, deaSchedule: "II", name: "Placebo Tablets", indNada: "", drugClass: "Placebo · Oral tablet", route: "Oral", doseUnit: "mg/kg", sponsor: "VetDerm Therapeutics", code: "T02", blindedLabel: "Group B" },
  ],
  "PH-2401": [
    { type: "supplement", controlledSubstance: false, deaSchedule: "II", name: "PhytoGrow Plus Feed Additive", indNada: "INAD 012-441", drugClass: "Phytogenic feed additive · Premix", route: "In-feed", doseUnit: "g/tonne feed", sponsor: "PhytoNutra Animal Health", code: "T01", blindedLabel: "" },
    { type: "placebo", controlledSubstance: false, deaSchedule: "II", name: "Control (basal feed)", indNada: "", drugClass: "Control · Basal feed", route: "In-feed", doseUnit: "g/tonne feed", sponsor: "Site-prepared", code: "T02", blindedLabel: "" },
  ],
};

const store: Record<string, IPProduct[]> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };

// Idempotent lazy seed — first access for a study populates the store from `seed`.
function ensure(studyCode: string, seed: IPProduct[]): IPProduct[] {
  if (!store[studyCode]) store[studyCode] = seed.length ? seed.map((x) => ({ ...x })) : [{ ...EMPTY_IP }];
  return store[studyCode];
}

export function getIps(studyCode: string): IPProduct[] { return store[studyCode] ?? []; }

export function updateIp(studyCode: string, index: number, patch: Partial<IPProduct>): void {
  const cur = store[studyCode]; if (!cur) return;
  store[studyCode] = cur.map((x, j) => (j === index ? { ...x, ...patch } : x));
  emit();
}
export function addIp(studyCode: string): void {
  store[studyCode] = [...(store[studyCode] ?? []), { ...EMPTY_IP }];
  emit();
}
export function removeIp(studyCode: string, index: number): void {
  const cur = store[studyCode];
  if (!cur || index === 0 || cur.length <= 1) return; // first card is anchor, never remove the last
  store[studyCode] = cur.filter((_, j) => j !== index);
  emit();
}

// Reactive snapshot. Seeds on first render so the returned reference is stable.
export function useIps(studyCode: string, seed: IPProduct[]): IPProduct[] {
  ensure(studyCode, seed);
  const snap = () => store[studyCode];
  return useSyncExternalStore(subscribe, snap, snap);
}
