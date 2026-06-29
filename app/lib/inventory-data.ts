// ════════════════════════════════════════════════════════════════════════════
// Inventory derivations — ported from the 24-inventory.html prototype's helpers,
// wired to the session store. Pure functions over Dataset; no writes here (the
// components mutate via useStudySession().update). Study-specific behaviour
// (BR withdrawal link, CA volume accountability, PH batch/kg) lives here too.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, Vial, VialEvent, VialStatus } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { shouldHideArms } from "@/lib/study-config";
import { getStudyTypeConfig } from "@/lib/study-type-config";
import { subjectWeightKg } from "@/lib/randomization";

// BR-2502 arm → drug / mg-per-kg (mirrors SubjectRecord; small enough to duplicate).
export const BR_ARM_TO_DRUG: Record<string, string> = { T01: "Tulathromycin 2.5 mg/kg SC", T02: "Tulathromycin 5.0 mg/kg SC", T03: "Saline placebo SC (volume-matched)" };
export const BR_ARM_MGKG: Record<string, number> = { T01: 2.5, T02: 5.0, T03: 2.5 };
// Withdrawal period (days) by arm: T01 49 (label), T02 84 (FARAD extra-label), T03 none.
export const BR_WITHDRAWAL_DAYS: Record<string, number | null> = { T01: 49, T02: 84, T03: null };
const armCode = (arm: string | null | undefined) => (arm ?? "").match(/T0\d/)?.[0] ?? "";

// ─── Role permissions ───────────────────────────────────────────────────────
// The permission matrix now lives in the shared store (lib/inventory-permissions),
// editable from Settings → Inventory; re-exported here so existing call sites
// (`import { canInv } from "@/lib/inventory-data"`) keep working.
export type { InvAction } from "@/lib/inventory-permissions";
export { canInv } from "@/lib/inventory-permissions";

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
  hasAtHomeStatus: boolean; // CA-0801 — "At home" (dispensed, not yet returned); from study-type config
  drugLabel: string; // header subtitle
}
export function invConfig(studyCode: string): InvConfig {
  // "At home" status is a study-type property (kit-per-visit dispensing) — read it
  // from the shared study-type config rather than proxying off itemNoun === "kit".
  const hasAtHomeStatus = getStudyTypeConfig(studyCode).hasAtHomeStatus;
  if (studyCode === "PH-2401")
    return { itemNoun: "batch", itemNounCap: "Batch", idLabel: "Batch ID", unit: "kg", tracksReturns: false, feed: true, blinded: false, accountability: false, withdrawal: false, hasAtHomeStatus, drugLabel: "Feed additive · Batch / kg tracking · Linked to F3 Feed & Ration Setup" };
  if (studyCode === "CA-0801")
    return { itemNoun: "kit", itemNounCap: "Kit", idLabel: "Kit ID", unit: "ml", tracksReturns: true, feed: false, blinded: true, accountability: true, withdrawal: false, hasAtHomeStatus, drugLabel: "Topical / oral · Kit-level + volume accountability · Blinded" };
  // BR-2502 default
  return { itemNoun: "vial", itemNounCap: "Vial", idLabel: "Vial ID", unit: "ml", tracksReturns: true, feed: false, blinded: false, accountability: false, withdrawal: true, hasAtHomeStatus, drugLabel: "Injectable antimicrobial · Vial-level tracking · Withdrawal-linked" };
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
  withdrawalEnd?: string | null; // BR — withdrawal-period end date (null = no withdrawal, e.g. T03)
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

// CA-0801 kit-per-visit suffix: each visit dispenses a fresh unit within the kit
// (Baseline→V1, Follow-Up 1→V2, …, Follow-Up 4 / End of Study→V5). Derived from the
// visit name (the accountability forms are all "Study Drug Accountability", so the
// visit comes from the parent visit form). Returns undefined for an unknown visit.
export function caVisitSuffix(visitName: string | undefined): string | undefined {
  const v = (visitName ?? "").toLowerCase();
  if (v.includes("baseline")) return "V1";
  const m = v.match(/follow[\s-]*up\s*(\d)/);
  if (m) return `V${Number(m[1]) + 1}`;
  if (v.includes("end of study") || v.includes("eos")) return "V5";
  return undefined;
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
    // BR-2502 is open-label — every role sees the real drug name. (No blinding mask.)
    void role;
    const taForms = formsWith("date_administered");
    const rtForms = formsWith("retreatment_date");
    // The VIAL ID is the system-of-record inventory id, NOT the form's unit_id value:
    // each arm's dispensing instances map, in a stable order (Day 0 before re-treatment,
    // by subject), onto that arm's inventory vial ids (VL-BR-T0x-NN). Computed over ALL
    // instances so a given animal's vial id is stable regardless of the site filter.
    const vialsByArm = new Map<string, string[]>();
    for (const v of dataset.vials) {
      if (v.studyId !== studyId) continue;
      const a = armCode(v.treatmentGroup ?? "");
      if (!a) continue;
      const list = vialsByArm.get(a) ?? []; list.push(v.id); vialsByArm.set(a, list);
    }
    vialsByArm.forEach((list) => list.sort());
    const brItems: { inst: Dataset["formInstances"][number]; sub: Dataset["subjects"][number]; isRetreat: boolean; arm: string }[] = [];
    for (const inst of [...instancesOf(taForms), ...instancesOf(rtForms)]) {
      const sub = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
      if (!sub) continue;
      const isRetreat = (codeIdByForm.get(inst.form_id)?.has("retreatment_date")) ?? false;
      const arm = armCode(valByCode(inst, "test_article") || sub.randomization_arm);
      brItems.push({ inst, sub, isRetreat, arm });
    }
    brItems.sort((a, b) => a.arm.localeCompare(b.arm) || (Number(a.isRetreat) - Number(b.isRetreat)) || a.sub.subject_code.localeCompare(b.sub.subject_code));
    const vialIdByInst = new Map<string, string>();
    const armUsed: Record<string, number> = {};
    for (const x of brItems) {
      const list = vialsByArm.get(x.arm) ?? [];
      const i = armUsed[x.arm] ?? 0; armUsed[x.arm] = i + 1;
      if (list[i]) vialIdByInst.set(x.inst.id, list[i]);
    }
    for (const { inst, sub, isRetreat, arm } of brItems) {
      if (!siteOk(inst.subject_id, inst.barn_id)) continue;
      const weightRaw = valByCode(inst, isRetreat ? "body_weight_retreatment" : "body_weight_dosing");
      const weight = weightRaw ? Number(weightRaw) : subjectWeightKg(dataset, sub.id);
      const dose = weight ? Math.abs(Math.round((weight * (BR_ARM_MGKG[arm] ?? 2.5) / 100) * 10) / 10) : undefined;
      const date = valByCode(inst, isRetreat ? "retreatment_date" : "date_administered") || subjDate(sub.id) || "—";
      // Lot is always LOT-BR-<arm>: F005's lot_number reuses the old lot_expiry field
      // (stale "T01-4400/…" value), so only trust a stored value if it's the LOT-BR- form.
      const lotVal = valByCode(inst, "lot_number");
      const wdDays = BR_WITHDRAWAL_DAYS[arm];
      const withdrawalEnd = wdDays != null && /^\d{4}-\d{2}-\d{2}/.test(date) ? addDays(date, wdDays) : null;
      rows.push({
        id: inst.id, subjectId: sub.id, subjectCode: sub.subject_code, studyId,
        visitLabel: isRetreat ? "Re-treatment" : "Day 0",
        date,
        drug: BR_ARM_TO_DRUG[arm] ?? "—",
        lot: lotVal && lotVal.startsWith("LOT-BR-") ? lotVal : `LOT-BR-${arm || "T01"}`,
        unitId: vialIdByInst.get(inst.id) ?? valByCode(inst, "unit_id", "vial_unit_id"),
        dose,
        withdrawalEnd,
        administeredBy: valByCode(inst, "administered_by"),
        formInstanceId: inst.id, formDefId: inst.form_id, formName: formById.get(inst.form_id)?.name,
      });
    }
  } else if (code === "CA-0801") {
    const hide = role ? shouldHideArms(dataset, studyId, role) : true; // blinded → hide for CRC/CRA
    // The KIT ID derives from the inventory seed (system of record), not the form's
    // drug_kit_number value: the inventory base kits (A-001 … B-005), assigned to
    // subjects in subject-code order — mirrors the seed's positional kit assignment.
    // The per-visit unit suffix (V1…V5) then comes from the visit.
    const caBaseKits = Array.from(new Set(
      dataset.vials.filter((v) => v.studyId === studyId)
        .map((v) => (v.kitNumber ?? "").replace(/^Kit\s*/i, "").replace(/-V\d+$/i, ""))
        .filter(Boolean),
    )).sort();
    const caKitBySubject = new Map<string, string>();
    dataset.subjects.filter((s) => s.study_id === studyId)
      .slice().sort((a, b) => a.subject_code.localeCompare(b.subject_code))
      .forEach((s, i) => { if (caBaseKits[i]) caKitBySubject.set(s.id, caBaseKits[i]); });
    for (const inst of instancesOf(formsWith("dispensed_kit_number", "drug_kit_number", "kit_number"))) {
      const sub = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
      if (!sub || !siteOk(inst.subject_id, inst.barn_id)) continue;
      const vol = Number(valByCode(inst, "vol_dispensed", "quantity_dispensed"));
      // Visit comes from the parent visit form (the accountability forms share one
      // generic name); the kit number then gets that visit's unit suffix (V1…V5).
      const form = formById.get(inst.form_id);
      const parentName = form?.parent_form_id ? formById.get(form.parent_form_id)?.name : undefined;
      const visitLabel = valByCode(inst, "visit_label") || parentName || form?.name || "Visit";
      const suffix = caVisitSuffix(visitLabel);
      const baseKit = caKitBySubject.get(sub.id);
      // No fallback to the form's KIT-NNNN value — the inventory seed assigns a kit to
      // every CA subject, so an unmapped subject shows "—" rather than a mismatched id.
      const kit = baseKit ? (suffix ? `${baseKit}-${suffix}` : baseKit) : "—";
      rows.push({
        id: inst.id, subjectId: sub.id, subjectCode: sub.subject_code, studyId,
        visitLabel,
        date: valByCode(inst, "visit_date", "dispensation_date") || "—",
        kit,
        arm: hide ? undefined : (sub.randomization_arm ?? undefined),
        volume: Number.isNaN(vol) || !vol ? 60 : vol,
        administeredBy: valByCode(inst, "administered_by", "dispensed_by"),
        formInstanceId: inst.id, formDefId: inst.form_id, formName: form?.name,
      });
    }
  } else if (code === "PH-2401") {
    // The BATCH column shows the inventory batch id (BATCH-PH-00x), not the feed lot
    // number from the delivery form. The Feed Delivery Log is barn-scoped (no pen/arm
    // link), so map it via the inventory batch's dispense events (subject = pen code)
    // → the pen arm → batch treatment group → and finally a stable feed-lot→batch
    // mapping (distinct lots in sorted order onto the sorted inventory batch ids), so
    // every row resolves to a system-of-record batch id.
    const phBatchIds = dataset.vials.filter((v) => v.studyId === studyId).map((v) => v.id).sort();
    const batchByPen = new Map<string, string>();
    const batchByGroup = new Map<string, string>();
    for (const v of dataset.vials) {
      if (v.studyId !== studyId) continue;
      if (v.treatmentGroup) batchByGroup.set(v.treatmentGroup, v.id);
      for (const e of v.events) if (e.type === "dispense" && e.subject) batchByPen.set(e.subject, v.id);
    }
    const phInsts = instancesOf(formsWith("quantity_kg", "kg_delivered"));
    const lots = Array.from(new Set(phInsts.map((i) => valByCode(i, "feed_lot_number", "batch_number")).filter((l): l is string => !!l))).sort();
    const lotToBatch = new Map<string, string>();
    lots.forEach((lot, i) => { if (phBatchIds.length) lotToBatch.set(lot, phBatchIds[i % phBatchIds.length]); });
    for (const inst of phInsts) {
      const sub = inst.subject_id ? subjById.get(inst.subject_id) : undefined;
      const penCode = sub?.subject_code ?? (inst.barn_id ? dataset.barns.find((b) => b.id === inst.barn_id)?.name : undefined) ?? "House";
      if (!siteOk(inst.subject_id ?? null, inst.barn_id)) continue;
      const date = valByCode(inst, "delivery_date", "visit_date") || "—";
      const lot = valByCode(inst, "feed_lot_number", "batch_number");
      const batch = batchByPen.get(penCode)
        ?? (sub?.randomization_arm ? batchByGroup.get(sub.randomization_arm) : undefined)
        ?? (lot ? lotToBatch.get(lot) : undefined)
        ?? phBatchIds[0]
        ?? lot;
      rows.push({
        id: inst.id, subjectId: sub?.id, penId: inst.barn_id ?? undefined, penCode, studyId,
        visitLabel: valByCode(inst, "feed_phase") || "Delivery",
        date,
        kgDelivered: Number(valByCode(inst, "quantity_kg", "kg_delivered")) || undefined,
        batch,
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
  accountabilityPct: number; // (dispensed + returned + removed) / received × 100
  accounted: boolean; // accountabilityPct >= 99.5 (0.5% rounding tolerance)
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
    // Drug accountability: share of received units accounted for (dispensed + returned
    // + destroyed/removed). Balanced within a 0.5% rounding tolerance.
    const accountabilityPct = received ? Math.round(((dispensed + returned + removed) / received) * 1000) / 10 : 0;
    const accounted = accountabilityPct >= 99.5;
    return { group: grp, received, usable, removed, dispensed, returned, variance, status, balanced, accountabilityPct, accounted };
  });
}
