// ════════════════════════════════════════════════════════════════════════════
// Inventory role permissions — the single source of truth for who can perform
// each inventory action. A small shared external store so the Settings → Inventory
// permission matrix can edit it live and the Inventory module reflects the change.
// Module-level state survives client-side navigation (Settings → Inventory) within
// a session; it resets to the defaults on a full reload (display-only for the
// portfolio — no session-store shape change).
//
// Roles here are plain strings, not the app's Role union: the matrix includes a
// PM (project manager) column that isn't a login role. canInv() is only ever
// called with a real Role (a subset of these columns), so that's safe.
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/permissions";

export type InvAction =
  | "view" | "log_shipment" | "confirm_units" | "dispense"
  | "log_return" | "confirm_return" | "reconcile" | "destroy";

// Matrix rows (in display order) — label + description.
export const INV_ACTIONS: { key: InvAction; label: string; desc: string }[] = [
  { key: "view", label: "View stock levels", desc: "See current inventory, lot numbers and expiry dates" },
  { key: "log_shipment", label: "Log incoming shipment", desc: "Record a new shipment arrival and unit manifest" },
  { key: "confirm_units", label: "Confirm & activate units", desc: "Verify shipment and make units available for dispensing" },
  { key: "dispense", label: "Record dispensing", desc: "Log a dispensing event against a subject visit" },
  { key: "log_return", label: "Log drug return", desc: "Record returned units from a subject" },
  { key: "confirm_return", label: "Confirm return & restock", desc: "Verify returned unit condition and update stock" },
  { key: "reconcile", label: "Reconcile inventory", desc: "Perform end-of-study or periodic reconciliation" },
  { key: "destroy", label: "Destroy / write off units", desc: "Mark units as destroyed or unusable" },
];

// Matrix columns.
export const INV_ROLES = ["CRC", "CRA", "PI", "DM", "PM", "Admin"] as const;

const DEFAULTS: Record<InvAction, string[]> = {
  view: ["CRC", "CRA", "PI", "DM", "PM", "Admin"],
  log_shipment: ["PM", "Admin"],
  confirm_units: ["PM", "Admin"],
  dispense: ["CRC", "PI", "Admin"],
  log_return: ["CRC", "Admin"],
  confirm_return: ["PI", "PM", "Admin"],
  reconcile: ["CRA", "DM", "PM", "Admin"],
  destroy: ["DM", "Admin"],
};

let perms: Record<InvAction, string[]> = JSON.parse(JSON.stringify(DEFAULTS));
const listeners = new Set<() => void>();

export function getInventoryPermissions(): Record<InvAction, string[]> { return perms; }

// Non-hook read used by the Inventory module's existing call sites.
export function canInv(action: InvAction, role: Role): boolean {
  return perms[action]?.includes(role) ?? false;
}

export function setInvPermission(action: InvAction, role: string, allowed: boolean): void {
  const cur = perms[action] ?? [];
  const next = allowed ? (cur.includes(role) ? cur : [...cur, role]) : cur.filter((r) => r !== role);
  perms = { ...perms, [action]: next };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

// Reactive snapshot for the Settings matrix (re-renders when a cell is toggled).
export function useInventoryPermissions(): Record<InvAction, string[]> {
  return useSyncExternalStore(subscribe, getInventoryPermissions, getInventoryPermissions);
}
