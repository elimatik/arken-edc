// ════════════════════════════════════════════════════════════════════════════
// Per-role form-permission DEFAULTS — a small shared external store so the
// Settings → Roles "Form permissions" pills and the Settings → Form permissions
// matrix read/write the same role defaults. Toggling a role's default in Roles is
// reflected when the Form permissions matrix re-seeds (it applies the default
// across every form for that role). Module-level state survives client-side
// navigation within a session; resets to seed on a full reload (display-only).
// Mirrors lib/inventory-permissions.ts.
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";

export type FPerm = "view" | "edit" | "sign" | "review" | "query" | "finalize";
export const FP_PERM_KEYS: FPerm[] = ["view", "edit", "sign", "review", "query", "finalize"];

// Seed defaults per role, applied across all subject-scoped forms.
const SEED: Record<string, FPerm[]> = {
  CRC: ["view", "edit", "query"],
  CRA: ["view", "review", "query"],
  PI: ["view", "edit", "sign", "query"],
  DM: ["view", "review", "query", "finalize"],
  Admin: ["view", "edit", "sign", "review", "query", "finalize"],
};
const build = (list: FPerm[]): Record<FPerm, boolean> =>
  Object.fromEntries(FP_PERM_KEYS.map((p) => [p, list.includes(p)])) as Record<FPerm, boolean>;

let defaults: Record<string, Record<FPerm, boolean>> =
  Object.fromEntries(Object.entries(SEED).map(([r, l]) => [r, build(l)]));
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getFormPermDefaults(): Record<string, Record<FPerm, boolean>> { return defaults; }
// The original seed perms for a preset (used by the Roles "Reset" button).
export function rolePresetPerms(preset: string): FPerm[] { return SEED[preset] ?? []; }

export function setFormPermDefault(roleKey: string, perm: FPerm, on: boolean): void {
  const cur = defaults[roleKey] ?? build([]);
  defaults = { ...defaults, [roleKey]: { ...cur, [perm]: on } };
  emit();
}
// Replace a role's whole default set (Reset to preset, or seed a new custom role).
export function setFormPermDefaultsFor(roleKey: string, list: FPerm[]): void {
  defaults = { ...defaults, [roleKey]: build(list) };
  emit();
}

function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function useFormPermDefaults(): Record<string, Record<FPerm, boolean>> {
  return useSyncExternalStore(subscribe, getFormPermDefaults, getFormPermDefaults);
}
