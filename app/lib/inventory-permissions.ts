// ════════════════════════════════════════════════════════════════════════════
// Inventory role permissions — the single source of truth for who can perform
// each inventory action. Previously a hardcoded const in inventory-data.ts; now
// a small shared external store so the Settings → Inventory permission matrix can
// edit it live and the Inventory module reflects the change. Module-level state
// survives client-side navigation (Settings → Inventory) within a session; it
// resets to the defaults on a full reload (display-only for the portfolio — no
// session-store shape change).
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/permissions";

export type InvAction = "receive" | "confirm" | "dispense" | "return" | "remove" | "reconcile";

// Rows (in display order) and columns for the permission matrix.
export const INV_ACTIONS: { key: InvAction; label: string }[] = [
  { key: "receive", label: "Receive shipment" },
  { key: "confirm", label: "Confirm receipt" },
  { key: "dispense", label: "Dispense" },
  { key: "return", label: "Return" },
  { key: "remove", label: "Remove / adjust" },
  { key: "reconcile", label: "Reconcile" },
];
export const INV_ROLES: Role[] = ["CRC", "CRA", "DM", "PI", "Admin", "Sponsor"];

// Segregation of duties: the role that physically receives a shipment does not
// confirm its own receipt.
const DEFAULTS: Record<InvAction, Role[]> = {
  receive: ["CRC", "Admin"],
  confirm: ["CRA", "DM", "Admin"],
  dispense: ["CRC", "Admin"],
  return: ["CRC", "CRA", "Admin"],
  remove: ["Admin"],
  reconcile: ["CRA", "DM", "Admin"],
};

let perms: Record<InvAction, Role[]> = JSON.parse(JSON.stringify(DEFAULTS));
const listeners = new Set<() => void>();

export function getInventoryPermissions(): Record<InvAction, Role[]> { return perms; }

// Non-hook read used by the Inventory module's existing call sites.
export function canInv(action: InvAction, role: Role): boolean {
  return perms[action]?.includes(role) ?? false;
}

export function setInvPermission(action: InvAction, role: Role, allowed: boolean): void {
  const cur = perms[action] ?? [];
  const next = allowed ? (cur.includes(role) ? cur : [...cur, role]) : cur.filter((r) => r !== role);
  perms = { ...perms, [action]: next };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }

// Reactive snapshot for the Settings matrix (re-renders when a cell is toggled).
export function useInventoryPermissions(): Record<InvAction, Role[]> {
  return useSyncExternalStore(subscribe, getInventoryPermissions, getInventoryPermissions);
}
