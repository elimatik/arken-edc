// ════════════════════════════════════════════════════════════════════════════
// Inventory derivations — ported from the 24-inventory.html prototype's helpers,
// wired to the session store. Pure functions over Dataset; no writes here (the
// components mutate via useStudySession().update). Study-specific behaviour
// (BR withdrawal link, CA volume accountability, PH batch/kg) lives here too.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, Vial, VialEvent, VialStatus } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { shouldHideArms } from "@/lib/study-config";
import { subjectWeightKg } from "@/lib/randomization";

// BR-2502 arm → drug / mg-per-kg (mirrors SubjectRecord; small enough to duplicate).
export const BR_ARM_TO_DRUG: Record<string, string> = { T01: "Tulathromycin 2.5 mg/kg SC", T02: "Tulathromycin 5.0 mg/kg SC", T03: "Saline placebo SC (volume-matched)" };
export const BR_ARM_MGKG: Record<string, number> = { T01: 2.5, T02: 5.0, T03: 2.5 };
const armCode = (arm: string | null | undefined) => (arm ?? "").match(/T0\d/)?.[0] ?? "";

// ─── Role permissions (hardcoded defaults) ──────────────────────────────────
// TODO: move to Settings → Inventory permissions when the Settings module exists
// (flagged in SESSION_HANDOFF). Segregation of duties: the role that physically
// receives a shipment does not confirm its own receipt.
export type InvAction = "receive" | "confirm" | "return" | "remove" | "dispense" | "reconcile";
export const INVENTORY_PERMISSIONS: Record<InvAction, Role[]> = {
  receive: ["CRC", "Admin"],
  confirm: ["CRA", "DM", "Admin"],
  return: ["CRC", "CRA", "Admin"],
  remove: ["Admin"],
  dispense: ["CRC", "Admin"],
  reconcile: ["CRA", "DM", "Admin"],
};
export const canInv = (action: InvAction, role: Role): boolean => INVENTORY_PERMISSIONS[action].includes(role);

const todayISO = () => new Date().toISOString().slice(0, 10);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * 86400000).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

// ─── Study-specific vocabulary / behaviour ──────────────────────────────────
export interface InvConfig {
  itemNoun: string; // "vial" | "batch"
  itemNounCap: string; // "Vial" | "Batch"
  idLabel: string; // "Vial ID" | "Batch ID"
  unit: string; // "ml" | "kg"
  tracksReturns: boolean;
  feed: boolean; // PH-2401 feed study
  blinded: boolean; // CA-0801
  accountability: boolean; // CA-0801 volume accountability
  withdrawal: boolean; // BR-2502 withdrawal link
  drugLabel: string; // header subtitle
}
export function invConfig(studyCode: string): InvConfig {
  if (studyCode === "PH-2401")
    return { itemNoun: "batch", itemNounCap: "Batch", idLabel: "Batch ID", unit: "kg", tracksReturns: false, feed: true, blinded: false, accountability: false, withdrawal: false, drugLabel: "Feed additive · Batch / kg tracking · Linked to F3 Feed & Ration Setup" };
  if (studyCode === "CA-0801")
    return { itemNoun: "kit", itemNounCap: "Kit", idLabel: "Kit ID", unit: "ml", tracksReturns: true, feed: false, blinded: true, accountability: true, withdrawal: false, drugLabel: "Topical / oral · Kit-level + volume accountability · Blinded" };
  // BR-2502 default
  return { itemNoun: "vial", itemNounCap: "Vial", idLabel: "Vial ID", unit: "ml", tracksReturns: true, feed: false, blinded: false, accountability: false, withdrawal: true, drugLabel: "Injectable antimicrobial · Vial-level tracking · Withdrawal-linked" };
}

// ─── Per-vial helpers (ported exactly) ──────────────────────────────────────
export function currentVol(v: Vial): number {
  let vol = v.initialVol;
  for (const e of v.events) {
    if (e.type === "dispense") vol -= e.volDispensed ?? 0;
    if (e.type === "return") vol = e.volReturned ?? vol; // set to returned volume
  }
  return Math.max(0, r1(vol));
}
export function totalDispensed(v: Vial): number {
  return r1(v.events.filter((e) => e.type === "dispense").reduce((s, e) => s + (e.volDispensed ?? 0), 0));
}
export function totalReturned(v: Vial): number {
  const rets = v.events.filter((e) => e.type === "return");
  return rets.length ? rets[rets.length - 1].volReturned ?? 0 : v.initialVol;
}
export function vialUses(v: Vial): number {
  return v.events.filter((e) => e.type === "dispense").length;
}
export function lastUse(v: Vial): string | null {
  const d = v.events.filter((e) => e.type === "dispense");
  return d.length ? d[d.length - 1].date : null;
}
// Date of the most recent lifecycle event (any type) — the "last updated" column.
export function lastUpdated(v: Vial): string | null {
  return v.events.length ? v.events[v.events.length - 1].date : null;
}
export function autoStatus(v: Vial): VialStatus {
  const cv = currentVol(v);
  if (v.events.some((e) => e.type === "returned")) return "returned";
  if (v.events.some((e) => e.type === "removed")) return "removed";
  if (cv <= 0) return "depleted";
  const lastDisp = v.events.filter((e) => e.type === "dispense").pop();
  if (lastDisp?.location === "home") {
    const lastRet = v.events.filter((e) => e.type === "return").pop();
    if (!lastRet || Date.parse(lastRet.date) < Date.parse(lastDisp.date)) return "athome";
  }
  return "available";
}

// ─── Status presentation ────────────────────────────────────────────────────
export const STATUS_LABELS: Record<string, string> = { available: "Available", athome: "At home", depleted: "Depleted", removed: "Removed", returned: "Returned", unusable: "Unusable" };
export const STATUS_BADGE: Record<string, string> = { available: "inv-badge-available", athome: "inv-badge-athome", depleted: "inv-badge-depleted", removed: "inv-badge-removed", returned: "inv-badge-returned", unusable: "inv-badge-unusable" };

// Volume bar fill: green >50%, amber 20-50%, red <20%; muted when not in use.
export function volFill(current: number, initial: number, status: VialStatus): { pct: number; color: string } {
  const pct = initial > 0 ? Math.round((current / initial) * 100) : 0;
  const color = status === "depleted" || status === "returned" || status === "removed"
    ? "var(--color-border)"
    : pct > 50 ? "var(--green-600)" : pct > 20 ? "var(--amber-700)" : "var(--red-600)";
  return { pct, color };
}

// Expiry colour: red if past, amber if within `days`, else default.
export function expiryColor(expiry: string, days = 30): string {
  const today = todayISO();
  if (expiry < today) return "var(--red-600)";
  if (dayDiff(today, expiry) <= days) return "var(--amber-700)";
  return "var(--color-text-secondary)";
}

// ─── Blinding-aware display ─────────────────────────────────────────────────
// `hideArms` = shouldHideArms(dataset, studyId, role). Blinded roles see the kit
// number as the item ID and never the treatment group / drug name.
export function vialDisplayId(v: Vial, hideArms: boolean): string {
  // CA-0801 units ARE kits — the kit number is the unit's identity for every role
  // (it's already arm-free, so no blinding concern); the internal VL-CA-* id is never
  // surfaced. BR/PH vials have no kit number, so they show their vial / batch id.
  void hideArms;
  return v.kitNumber ?? v.id;
}

// ─── Study-scoped selectors ─────────────────────────────────────────────────
export function studyVials(d: Dataset, studyId: string): Vial[] {
  return d.vials.filter((v) => v.studyId === studyId);
}
export function studyShipments(d: Dataset, studyId: string) {
  return d.shipments.filter((s) => s.studyId === studyId);
}
// Vials whose dispenses (or home siteId) touch a given site — used for CRC scoping.
export function vialsForSite(vials: Vial[], siteId: string | null): Vial[] {
  if (!siteId) return vials;
  return vials.filter((v) => v.siteId === siteId);
}

// ─── AI / nav-badge derivations ─────────────────────────────────────────────
export function drugLotsRemaining(d: Dataset, studyId: string): { availableItems: number; volRemaining: number; unit: string } {
  const vials = studyVials(d, studyId);
  const avail = vials.filter((v) => v.status === "available" || v.status === "athome");
  const unit = vials[0]?.unit ?? "ml";
  return { availableItems: avail.length, volRemaining: r1(avail.reduce((s, v) => s + currentVol(v), 0)), unit };
}
export function dispensingCount(d: Dataset, studyId: string): number {
  return studyVials(d, studyId).reduce((s, v) => s + v.events.filter((e) => e.type === "dispense").length, 0);
}
export function lotsExpiringSoon(d: Dataset, studyId: string, days = 30): { id: string; lotId: string; expiryDate: string }[] {
  const today = todayISO();
  return studyVials(d, studyId)
    .filter((v) => v.status !== "removed" && v.status !== "returned" && v.expiryDate && dayDiff(today, v.expiryDate) <= days)
    .map((v) => ({ id: v.id, lotId: v.lotId, expiryDate: v.expiryDate }))
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
}
// Nav-badge trigger: any active vial in the study expiring within `days`.
export function hasExpiringVials(d: Dataset, studyId: string, days = 30): boolean {
  return lotsExpiringSoon(d, studyId, days).length > 0;
}

// ─── CA-0801 volume accountability ──────────────────────────────────────────
export interface Discrepancy { expected: number; actual: number; diff: number; pct: number; level: "green" | "amber" | "red"; label: string }
export function discrepancyFor(v: Vial, dispense: VialEvent, ret: VialEvent | undefined): Discrepancy | null {
  if (!v.expectedDailyDose || !ret) return null;
  const days = Math.max(1, dayDiff(dispense.date, ret.date));
  const expected = r1(v.expectedDailyDose * days);
  const actual = r1((dispense.volDispensed ?? 0) - (ret.volReturned ?? 0));
  const diff = r1(actual - expected);
  const pct = expected ? Math.round((diff / expected) * 1000) / 10 : 0;
  const abs = Math.abs(pct);
  const level = abs <= 5 ? "green" : abs <= 15 ? "amber" : "red";
  const label = level === "green" ? "Reconciled" : level === "amber" ? "Minor discrepancy" : "Major discrepancy — investigate";
  return { expected, actual, diff, pct, level, label };
}

// ─── BR-2502 withdrawal link ────────────────────────────────────────────────
export interface Withdrawal { endDate: string; active: boolean; daysLeft: number }
export function withdrawalFor(v: Vial, dispense: VialEvent): Withdrawal | null {
  if (!v.withdrawalDays || !dispense.date) return null;
  const endDate = addDays(dispense.date, v.withdrawalDays);
  const left = dayDiff(todayISO(), endDate);
  return { endDate, active: left >= 0, daysLeft: left };
}

// ─── Dispensing log rows — derived from Treatment Administration / dispensation /
//     feed-delivery FORM INSTANCES (PART 3), not vial events. One completed form =
//     one row; missing CRF values are derived so no row is all-null. ──────────────
export interface DispensingRow {
  id: string;
  subjectId?: string;
  subjectCode?: string;
  penId?: string;
  penCode?: string;
  visitLabel: string;
  date: string;
  drug?: string; // BR (blinding-aware)
  arm?: string; // CA arm (only set for privileged viewers)
  kit?: string; // CA
  lot?: string; // BR
  unitId?: string; // BR
  dose?: number; // BR (mL)
  volume?: number; // CA (mL)
  kgDelivered?: number; // PH
  batch?: string; // PH
  week?: string; // PH
  administeredBy?: string;
  formInstanceId?: string; // the instance (row identity)
  formDefId?: string; // the FORM DEFINITION id — what ?form= on the Subject Record selects
  formName?: string;
  studyId: string;
}

export function buildDispenseRows(dataset: Dataset, studyId: string, siteFilter?: string | null, role?: Role): DispensingRow[] {
  const study = dataset.studies.find((s) => s.id === studyId);
  const code = study?.code ?? "";
  const subjById = new Map(dataset.subjects.map((s) => [s.id, s]));
  const barnSite = new Map(dataset.barns.map((b) => [b.id, b.site_id]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  // form_id → (code → field_id); instance value lookups go through this.
  const codeIdByForm = new Map<string, Map<string, string>>();
  for (const f of dataset.formFields) { let m = codeIdByForm.get(f.form_id); if (!m) { m = new Map(); codeIdByForm.set(f.form_id, m); } m.set(f.code, f.id); }
  const valByCode = (inst: Dataset["formInstances"][number], ...codes: string[]): string | undefined => {
    const m = codeIdByForm.get(inst.form_id); if (!m) return undefined;
    for (const c of codes) { const fid = m.get(c); if (!fid) continue; const v = dataset.fieldValues.find((x) => x.form_instance_id === inst.id && x.form_field_id === fid)?.value; if (v != null && v !== "") return v; }
    return undefined;
  };
  // forms in this study whose field set includes any of the given codes.
  const studyFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  const formsWith = (...codes: string[]) => new Set(Array.from(studyFormIds).filter((fid) => { const m = codeIdByForm.get(fid); return !!m && codes.some((c) => m.has(c)); }));
  const instancesOf = (formIds: Set<string>) => dataset.formInstances.filter((i) => formIds.has(i.form_id) && i.status !== "empty");
  // subject's randomization / enrolment date, for a Treatment-Admin date fallback.
  const subjDate = (subjId: string): string | undefined => {
    const ids = new Set(dataset.formFields.filter((f) => ["randomization_date", "enrollment_date", "screening_date", "arrival_date"].includes(f.code)).map((f) => f.id));
    const insts = new Set(dataset.formInstances.filter((i) => i.subject_id === subjId).map((i) => i.id));
    let best: string | undefined;
    for (const v of dataset.fieldValues) if (insts.has(v.form_instance_id) && ids.has(v.form_field_id) && v.value && /^\d{4}-\d{2}-\d{2}/.test(v.value)) { if (!best || v.value < best) best = v.value; }
    return best;
  };
  const siteOk = (subjId: string | null, barnId: string | null | undefined): boolean => {
    if (!siteFilter) return true;
    const sub = subjId ? subjById.get(subjId) : undefined;
    const site = sub?.site_id ?? (barnId ? barnSite.get(barnId) : null) ?? null;
    return site === siteFilter;
  };
  const rows: DispensingRow[] = [];

  if (code === "BR-2502") {
    // BR is open-label so shouldHideArms() is false — but the dispensing log still
    // masks the drug name for the entry roles (CRC/CRA): they see "Study drug".
    const hideDrug = role === "CRC" || role === "CRA";
    const taForms = formsWith("date_administered");
    const rtForms = formsWith("retreatment_date");
    for (const inst of [...instancesOf(taForms), ...instancesOf(rtForms)]) {
      const sub = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
      if (!sub || !siteOk(inst.subject_id, inst.barn_id)) continue;
      const isRetreat = (codeIdByForm.get(inst.form_id)?.has("retreatment_date")) ?? false;
      const arm = armCode(valByCode(inst, "test_article") || sub.randomization_arm);
      const weightRaw = valByCode(inst, isRetreat ? "body_weight_retreatment" : "body_weight_dosing");
      const weight = weightRaw ? Number(weightRaw) : subjectWeightKg(dataset, sub.id);
      const dose = weight ? Math.round((weight * (BR_ARM_MGKG[arm] ?? 2.5) / 100) * 10) / 10 : undefined;
      const date = valByCode(inst, isRetreat ? "retreatment_date" : "date_administered") || subjDate(sub.id) || "—";
      // Lot is always LOT-BR-<arm>: F005's lot_number reuses the old lot_expiry field
      // (stale "T01-4400/…" value), so only trust a stored value if it's the LOT-BR- form.
      const lotVal = valByCode(inst, "lot_number");
      rows.push({
        id: inst.id, subjectId: sub.id, subjectCode: sub.subject_code, studyId,
        visitLabel: isRetreat ? "Re-treatment" : "Day 0",
        date,
        drug: hideDrug ? "Study drug" : (BR_ARM_TO_DRUG[arm] ?? "—"),
        lot: lotVal && lotVal.startsWith("LOT-BR-") ? lotVal : `LOT-BR-${arm || "T01"}`,
        unitId: valByCode(inst, "unit_id", "vial_unit_id"),
        dose,
        administeredBy: valByCode(inst, "administered_by"),
        formInstanceId: inst.id, formDefId: inst.form_id, formName: formById.get(inst.form_id)?.name,
      });
    }
  } else if (code === "CA-0801") {
    const hide = role ? shouldHideArms(dataset, studyId, role) : true; // blinded → hide for CRC/CRA
    for (const inst of instancesOf(formsWith("drug_kit_number", "kit_number"))) {
      const sub = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
      if (!sub || !siteOk(inst.subject_id, inst.barn_id)) continue;
      const vol = Number(valByCode(inst, "quantity_dispensed", "vol_dispensed"));
      rows.push({
        id: inst.id, subjectId: sub.id, subjectCode: sub.subject_code, studyId,
        visitLabel: valByCode(inst, "visit_label") || formById.get(inst.form_id)?.name || "Visit",
        date: valByCode(inst, "dispensation_date", "visit_date") || "—",
        kit: valByCode(inst, "drug_kit_number", "kit_number") || "—",
        arm: hide ? undefined : (sub.randomization_arm ?? undefined),
        volume: Number.isNaN(vol) || !vol ? 60 : vol,
        administeredBy: valByCode(inst, "administered_by", "dispensed_by"),
        formInstanceId: inst.id, formDefId: inst.form_id, formName: formById.get(inst.form_id)?.name,
      });
    }
  } else if (code === "PH-2401") {
    for (const inst of instancesOf(formsWith("quantity_kg", "kg_delivered"))) {
      const sub = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
      const penCode = sub?.subject_code ?? (inst.barn_id ? dataset.barns.find((b) => b.id === inst.barn_id)?.name : undefined) ?? "House";
      if (!siteOk(inst.subject_id ?? null, inst.barn_id)) continue;
      const date = valByCode(inst, "delivery_date", "visit_date") || "—";
      rows.push({
        id: inst.id, subjectId: sub?.id, penId: inst.barn_id ?? undefined, penCode, studyId,
        visitLabel: valByCode(inst, "feed_phase") || "Delivery",
        date,
        kgDelivered: Number(valByCode(inst, "quantity_kg", "kg_delivered")) || undefined,
        batch: valByCode(inst, "feed_lot_number", "batch_number"),
        week: valByCode(inst, "feed_phase") || (date !== "—" ? date : undefined),
        administeredBy: valByCode(inst, "delivered_by", "administered_by"),
        formInstanceId: inst.id, formDefId: inst.form_id, formName: formById.get(inst.form_id)?.name,
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date) || (a.subjectCode ?? a.penCode ?? "").localeCompare(b.subjectCode ?? b.penCode ?? ""));
}

// ─── Reconciliation rows (ported from renderReconciliation) ─────────────────
export interface ReconRow {
  group: string;
  received: number;
  usable: number;
  removed: number;
  dispensed: number;
  returned: number;
  variance: number;
  status: "Balanced" | "Outstanding" | "Over-counted";
  balanced: boolean;
}
export function buildReconRows(vials: Vial[]): ReconRow[] {
  const groups = Array.from(new Set(vials.map((v) => v.treatmentGroup || "Unknown"))).sort();
  return groups.map((grp) => {
    const gv = vials.filter((v) => (v.treatmentGroup || "Unknown") === grp);
    const received = gv.length;
    // Mutually exclusive accounting buckets so each unit is counted once.
    const removed = gv.filter((v) => v.status === "removed").length;
    const returned = gv.filter((v) => v.status === "returned").length;
    const dispensed = gv.filter((v) => v.status !== "removed" && v.status !== "returned" && v.events.some((e) => e.type === "dispense")).length;
    const usable = received - removed;
    // Variance = units neither dispensed, returned-to-sponsor, nor removed — i.e.
    // still unaccounted on the shelf. Balanced (0) when everything is accounted for.
    const variance = received - dispensed - returned - removed;
    const balanced = variance === 0;
    const status: ReconRow["status"] = balanced ? "Balanced" : variance > 0 ? "Outstanding" : "Over-counted";
    return { group: grp, received, usable, removed, dispensed, returned, variance, status, balanced };
  });
}
