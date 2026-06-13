// ════════════════════════════════════════════════════════════════════════════
// Role-aware navigation + query permissions — single source of truth.
// The sidenav reads NAV_ITEMS and hides (never reorders) items the active role
// is not allowed to see. Do NOT hardcode role checks in components — change
// access here only.
// ════════════════════════════════════════════════════════════════════════════

export type Role = "CRC" | "CRA" | "DM" | "PI" | "Sponsor" | "Admin";

export const ROLES: Role[] = ["CRC", "CRA", "DM", "PI", "Sponsor", "Admin"];

// Optional per-role access flags carried alongside a nav permission.
export interface NavAccess {
  // Sponsor blinding (Reports + Inventory): show AGGREGATE TOTALS only — never
  // broken down by treatment arm / randomization group. This is arm-level
  // blinding, NOT a value mask: sponsor-visible widgets and tables omit any
  // per-arm rows or columns entirely; the sponsor still sees real study totals.
  blinded?: boolean;
  readonly?: boolean; // view-only (Settings for DM); false = full edit (Admin)
}

export interface NavItem {
  key: string;
  label: string; // shown in the sidenav (kept short to fit the 74px rail)
  title?: string; // fuller name for the tooltip; defaults to label
  icon: string; // Tabler icon name without the `ti ti-` prefix
  bottom?: boolean; // pinned to the bottom of the sidenav
  badge?: number; // optional notification badge
  // role → access. A role present here may see the item; the value carries flags.
  access: Partial<Record<Role, NavAccess>>;
}

const open: NavAccess = {}; // plain access, no flags

// Global order is stable; each role sees only its permitted subset, never reordered.
export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: "layout-dashboard",
    access: { CRC: open, CRA: open, DM: open, PI: open, Sponsor: open, Admin: open } },
  // Data entry is a clinical-role task — Admin is intentionally NOT here (Admin
  // manages study structure via the Sites section, not the clinical data flow).
  { key: "data-entry", label: "Data Entry", icon: "forms",
    access: { CRC: open, CRA: open, DM: open, PI: open } },
  { key: "animals", label: "Animals", icon: "list",
    access: { CRC: open, CRA: open, DM: open, PI: open, Sponsor: open } },
  // Sites — Admin-only study-structure management (site list + per-site records).
  // The Site → Barn → Pen drill-down for clinical roles lives inside Data Entry.
  { key: "sites", label: "Sites", icon: "building-hospital",
    access: { Admin: open } },
  { key: "queries", label: "Queries", icon: "help-circle", badge: 4,
    access: { CRC: open, CRA: open, DM: open, PI: open } },
  { key: "visits", label: "Visits", icon: "calendar-event",
    access: { CRC: open, CRA: open, DM: open, PI: open } },
  { key: "sdv", label: "SDV", title: "Source Data Verification", icon: "circle-check",
    access: { CRA: open } },
  { key: "coding", label: "Coding", title: "Medical Coding", icon: "code",
    access: { DM: open } },
  { key: "calendar", label: "Calendar", icon: "calendar",
    access: { CRC: open, CRA: open, DM: open, PI: open, Sponsor: open } },
  { key: "reports", label: "Reports", icon: "chart-bar",
    access: { CRC: open, CRA: open, DM: open, PI: open, Sponsor: { blinded: true }, Admin: open } },
  { key: "inventory", label: "Inventory", icon: "package",
    access: { CRA: open, DM: open, Sponsor: { blinded: true }, Admin: open } },
  { key: "audit", label: "Audit Trail", title: "Audit Trail", icon: "clipboard-list",
    access: { CRC: open, CRA: open, DM: open, PI: open, Admin: open } },
  { key: "invoices", label: "Invoices", icon: "receipt",
    access: { Admin: open } },
  // Pinned to the bottom of the sidenav.
  { key: "settings", label: "Settings", icon: "settings", bottom: true,
    access: { DM: { readonly: true }, Admin: { readonly: false } } },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => role in item.access);
}

// Sub-routes under /study/[studyId] for nav items that have a built screen.
// "" = the study base (dashboard). Items absent here have no destination yet —
// clicking them is a no-op until their screen is built.
export const NAV_ROUTES: Partial<Record<string, string>> = {
  dashboard: "",
  "data-entry": "data-entry",
  animals: "animals",
  sites: "sites",
  settings: "settings",
};

export function navAccess(item: NavItem, role: Role): NavAccess | undefined {
  return item.access[role];
}

// ─── Query action permissions ───────────────────────────────────────────────
// Resolved is the terminal query state — there is NO Closed state.
export const QUERY_STATES = ["open", "responded", "resolved"] as const;
export type QueryState = (typeof QUERY_STATES)[number];

export type QueryAction = "raise" | "respond" | "resolve" | "manage";

export const QUERY_PERMISSIONS: Record<Role, QueryAction[]> = {
  CRC: ["respond"],
  CRA: ["raise", "resolve"],
  DM: ["raise", "resolve", "manage"], // full management
  PI: ["respond"],
  Sponsor: [], // no access
  Admin: [], // no access
};

export function canQuery(role: Role, action: QueryAction): boolean {
  return QUERY_PERMISSIONS[role].includes(action);
}

// Source-data verification is a CRA-only responsibility (mirrors the SDV nav item).
// Used to gate per-field verify, Verify all, and the "SDV mode" remarks option.
export function canSDV(role: Role): boolean {
  return role === "CRA";
}
