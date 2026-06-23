// ════════════════════════════════════════════════════════════════════════════
// Inventory derivations — ported from the 24-inventory.html prototype's helpers,
// wired to the session store. Pure functions over Dataset; no writes here (the
// components mutate via useStudySession().update). Study-specific behaviour
// (BR withdrawal link, CA volume accountability, PH batch/kg) lives here too.
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, Vial, VialEvent, VialStatus } from "@/lib/session-store/types";

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
    return { itemNoun: "vial", itemNounCap: "Vial", idLabel: "Vial ID", unit: "ml", tracksReturns: true, feed: false, blinded: true, accountability: true, withdrawal: false, drugLabel: "Topical / oral · Kit-level + volume accountability · Blinded" };
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
  return hideArms && v.kitNumber ? v.kitNumber : v.id;
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

// ─── Dispense log rows (ported from renderDispenseLog) ──────────────────────
export interface DispenseRow {
  key: string;
  vial: Vial;
  vialId: string;
  lot: string;
  subject: string;
  visit: string;
  date: string;
  volDispensed: number;
  volAfterDisp: number;
  location?: "clinic" | "home" | "farm";
  returned: boolean;
  retVol?: number;
  retDate?: string;
  retCondition?: string;
  discrepancy: Discrepancy | null;
  withdrawal: Withdrawal | null;
}
export function buildDispenseRows(vials: Vial[]): DispenseRow[] {
  const rows: DispenseRow[] = [];
  for (const v of vials) {
    v.events.forEach((e, i) => {
      if (e.type !== "dispense") return;
      const ret = v.events.slice(i + 1).find((x) => x.type === "return");
      const dispensedSoFar = v.events.slice(0, i + 1).filter((x) => x.type === "dispense").reduce((s, x) => s + (x.volDispensed ?? 0), 0);
      rows.push({
        key: `${v.id}-${i}`,
        vial: v,
        vialId: v.id,
        lot: v.lotId,
        subject: e.subject ?? "—",
        visit: e.visit ?? "—",
        date: e.date,
        volDispensed: r1(e.volDispensed ?? 0),
        volAfterDisp: r1(v.initialVol - dispensedSoFar),
        location: e.location,
        returned: !!ret,
        retVol: ret?.volReturned,
        retDate: ret?.date,
        retCondition: ret?.condition,
        discrepancy: discrepancyFor(v, e, ret),
        withdrawal: withdrawalFor(v, e),
      });
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
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
    const removed = gv.filter((v) => v.events.some((e) => e.type === "removed") && !v.events.some((e) => e.type === "dispense")).length;
    const usable = received - removed;
    const dispensed = Math.min(gv.reduce((s, v) => s + v.events.filter((e) => e.type === "dispense").length, 0), usable);
    const returned = gv.filter((v) => v.status === "returned" || v.status === "depleted").length;
    const variance = received - returned - removed;
    const balanced = variance === 0;
    const status: ReconRow["status"] = balanced ? "Balanced" : variance > 0 ? "Outstanding" : "Over-counted";
    return { group: grp, received, usable, removed, dispensed, returned, variance, status, balanced };
  });
}
