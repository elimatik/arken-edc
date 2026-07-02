// ════════════════════════════════════════════════════════════════════════════
// Invoices module — seed data (fee schedule, sites/contacts, invoices) + money
// helpers. Standalone module data (same pattern as lib/users-data.ts) — NOT the
// session store, so no DATA_KEY bump. All edits live in page component state.
// Fee schedule + site-override columns are per-study; the Site-invoices and
// Preview tabs show the full cross-study finance view (all seeded invoices).
// ════════════════════════════════════════════════════════════════════════════

export type InvStatus = "draft" | "submitted" | "approved" | "paid";

export interface FeeEvent { id: string; section: string; name: string; trigger: string; rate: number; overrides: Record<string, number> }
export interface LineItem { section: string; name: string; qty: number; rate: number; override: string | null }
export interface Invoice { id: string; studyCode: string; site: string; period: string; status: InvStatus; issueDate: string; dueDate: string; holdbackPct: number; lineItems: LineItem[] }
export interface SiteContact { name: string; title: string; address: string; city: string; country: string; phone: string; email: string }
export interface SiteBilling { name: string; company: string; attn: string; email: string; phone: string; address: string; city: string; country: string }
export interface InvSite { studyCode: string; name: string; contact: SiteContact; billing: SiteBilling }

export const FEE_SECTIONS = ["Enrollment & Screening", "Protocol visits", "Safety events", "Study close-out"];

// Trigger builder modes for the Add/Edit event modal.
export const TRIGGER_MODES = ["form", "milestone", "manual"] as const;
export type TriggerMode = (typeof TRIGGER_MODES)[number];

// ── Sites (contact + billing) per study ─────────────────────────────────────
export const INV_SITES: InvSite[] = [
  { studyCode: "BR-2502", name: "Feedlot CO",
    contact: { name: "Dr. M. Hayes, DVM", title: "Principal Investigator", address: "18400 County Rd 21", city: "Greeley, CO 80631", country: "USA", phone: "+1 (970) 356-4100", email: "m.hayes@feedlotco.com" },
    billing: { name: "Dana Wheeler", company: "Feedlot CO Research LLC", attn: "Accounts Receivable", email: "billing@feedlotco.com", phone: "+1 (970) 356-4110", address: "18400 County Rd 21, Office 2", city: "Greeley, CO 80631", country: "USA" } },
  { studyCode: "BR-2502", name: "Feedlot KS",
    contact: { name: "Dr. R. Alvarez, DVM", title: "Principal Investigator", address: "2255 Highway 50", city: "Garden City, KS 67846", country: "USA", phone: "+1 (620) 275-3300", email: "r.alvarez@feedlotks.com" },
    billing: { name: "Tom Becker", company: "Feedlot KS Cattle Co.", attn: "Clinical Trials Finance", email: "billing@feedlotks.com", phone: "+1 (620) 275-3310", address: "2255 Highway 50, Suite B", city: "Garden City, KS 67846", country: "USA" } },
  { studyCode: "BR-2502", name: "Feedlot NE",
    contact: { name: "Dr. P. Werner, DVM", title: "Principal Investigator", address: "9010 West Dodge Rd", city: "Lexington, NE 68850", country: "USA", phone: "+1 (308) 324-7700", email: "p.werner@feedlotne.com" },
    billing: { name: "Carla Nunes", company: "Feedlot NE Livestock Inc.", attn: "Accounts Receivable", email: "billing@feedlotne.com", phone: "+1 (308) 324-7710", address: "9010 West Dodge Rd, Bldg C", city: "Lexington, NE 68850", country: "USA" } },
  { studyCode: "CA-0801", name: "UC Davis",
    contact: { name: "Dr. S. Kim, DVM", title: "Principal Investigator", address: "1 Garrod Dr", city: "Davis, CA 95616", country: "USA", phone: "+1 (530) 752-1393", email: "s.kim@ucdavis.edu" },
    billing: { name: "Rebecca Toh", company: "UC Davis Veterinary Medicine", attn: "Sponsored Programs — Billing", email: "vetbilling@ucdavis.edu", phone: "+1 (530) 752-1300", address: "1 Garrod Dr, Admin 210", city: "Davis, CA 95616", country: "USA" } },
  { studyCode: "PH-2401", name: "Purdue Farm",
    contact: { name: "Dr. E. Novak, PhD", title: "Principal Investigator", address: "270 S Russell St", city: "West Lafayette, IN 47907", country: "USA", phone: "+1 (765) 494-8000", email: "e.novak@purdue.edu" },
    billing: { name: "Grant Fisher", company: "Purdue Poultry Research Unit", attn: "Research Accounting", email: "poultrybilling@purdue.edu", phone: "+1 (765) 494-8010", address: "270 S Russell St, Rm 105", city: "West Lafayette, IN 47907", country: "USA" } },
];
export function sitesForStudy(studyCode: string): InvSite[] { return INV_SITES.filter((s) => s.studyCode === studyCode); }
export function siteByName(name: string): InvSite | undefined { return INV_SITES.find((s) => s.name === name); }

// ── Fee schedule per study ──────────────────────────────────────────────────
const BR_FEES: FeeEvent[] = [
  { id: "E01", section: "Enrollment & Screening", name: "Screening visit", trigger: "Subject screened", rate: 450, overrides: {} },
  { id: "E02", section: "Enrollment & Screening", name: "Enrollment", trigger: "Subject enrolled (ICF signed)", rate: 800, overrides: { "Feedlot KS": 850 } },
  { id: "E03", section: "Enrollment & Screening", name: "Screen failure", trigger: "Screen failure recorded", rate: 200, overrides: {} },
  { id: "E04", section: "Protocol visits", name: "Visit Day 0 — Treatment", trigger: "Day 0 forms complete", rate: 950, overrides: {} },
  { id: "E05", section: "Protocol visits", name: "Visit Day 3", trigger: "Day 3 forms complete", rate: 650, overrides: { "Feedlot NE": 600 } },
  { id: "E06", section: "Protocol visits", name: "Visit Day 7", trigger: "Day 7 forms complete", rate: 650, overrides: {} },
  { id: "E07", section: "Protocol visits", name: "Visit Day 14", trigger: "Day 14 forms complete", rate: 650, overrides: {} },
  { id: "E08", section: "Protocol visits", name: "Visit Day 28", trigger: "Day 28 forms complete", rate: 700, overrides: {} },
  { id: "E09", section: "Protocol visits", name: "Unscheduled visit", trigger: "Unscheduled visit completed", rate: 400, overrides: {} },
  { id: "E10", section: "Safety events", name: "SAE report", trigger: "SAE form submitted <24h", rate: 1200, overrides: {} },
  { id: "E11", section: "Safety events", name: "Protocol deviation", trigger: "PD logged and approved", rate: 300, overrides: {} },
  { id: "E12", section: "Safety events", name: "Early termination", trigger: "Subject withdrawn", rate: 500, overrides: { "Feedlot CO": 450 } },
  { id: "E13", section: "Study close-out", name: "Database lock", trigger: "Lock confirmed by DM", rate: 2500, overrides: {} },
  { id: "E14", section: "Study close-out", name: "Final site visit", trigger: "Close-out visit completed", rate: 800, overrides: {} },
];
const CA_FEES: FeeEvent[] = [
  { id: "E01", section: "Enrollment & Screening", name: "Screening visit", trigger: "Subject screened", rate: 400, overrides: {} },
  { id: "E02", section: "Enrollment & Screening", name: "Enrollment", trigger: "Subject enrolled (ICF signed)", rate: 750, overrides: {} },
  { id: "E03", section: "Enrollment & Screening", name: "Screen failure", trigger: "Screen failure recorded", rate: 150, overrides: {} },
  { id: "E04", section: "Protocol visits", name: "Baseline visit", trigger: "Baseline forms complete", rate: 900, overrides: {} },
  { id: "E05", section: "Protocol visits", name: "Follow-up visit", trigger: "Follow-up forms complete", rate: 550, overrides: {} },
  { id: "E06", section: "Protocol visits", name: "EOS visit", trigger: "EOS forms complete", rate: 700, overrides: {} },
  { id: "E07", section: "Safety events", name: "SAE report", trigger: "SAE form submitted <24h", rate: 1200, overrides: {} },
  { id: "E08", section: "Study close-out", name: "Database lock", trigger: "Lock confirmed by DM", rate: 2500, overrides: {} },
];
const PH_FEES: FeeEvent[] = [
  { id: "E01", section: "Enrollment & Screening", name: "Pen setup", trigger: "Pen randomized and confirmed", rate: 300, overrides: {} },
  { id: "E02", section: "Protocol visits", name: "Starter phase complete", trigger: "Starter feed phase complete", rate: 400, overrides: {} },
  { id: "E03", section: "Protocol visits", name: "Grower phase complete", trigger: "Grower feed phase complete", rate: 400, overrides: {} },
  { id: "E04", section: "Protocol visits", name: "Finisher phase complete", trigger: "Finisher feed phase complete", rate: 500, overrides: {} },
  { id: "E05", section: "Study close-out", name: "Database lock", trigger: "Lock confirmed by DM", rate: 2500, overrides: {} },
];
export function feeEventsForStudy(studyCode: string): FeeEvent[] {
  const list = studyCode === "CA-0801" ? CA_FEES : studyCode === "PH-2401" ? PH_FEES : BR_FEES;
  return list.map((e) => ({ ...e, overrides: { ...e.overrides } }));
}

// ── Invoices (cross-study finance view) ─────────────────────────────────────
const ALL_INVOICES: Invoice[] = [
  { id: "INV-BR-001", studyCode: "BR-2502", site: "Feedlot CO", period: "Apr – May 2026", status: "submitted", issueDate: "2026-05-31", dueDate: "2026-06-30", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Screening visit", qty: 4, rate: 450, override: null },
    { section: "Enrollment & Screening", name: "Enrollment", qty: 3, rate: 800, override: null },
    { section: "Protocol visits", name: "Visit Day 0 — Treatment", qty: 3, rate: 950, override: null },
    { section: "Protocol visits", name: "Visit Day 3", qty: 3, rate: 650, override: null },
    { section: "Safety events", name: "SAE report", qty: 1, rate: 1200, override: null },
  ] },
  { id: "INV-BR-002", studyCode: "BR-2502", site: "Feedlot KS", period: "Apr – May 2026", status: "approved", issueDate: "2026-05-30", dueDate: "2026-06-29", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Screening visit", qty: 3, rate: 450, override: null },
    { section: "Enrollment & Screening", name: "Enrollment", qty: 3, rate: 850, override: "Feedlot KS" },
    { section: "Protocol visits", name: "Visit Day 0 — Treatment", qty: 3, rate: 950, override: null },
    { section: "Protocol visits", name: "Visit Day 3", qty: 2, rate: 650, override: null },
  ] },
  { id: "INV-BR-003", studyCode: "BR-2502", site: "Feedlot NE", period: "Apr – May 2026", status: "draft", issueDate: "2026-06-01", dueDate: "2026-07-01", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Screening visit", qty: 3, rate: 450, override: null },
    { section: "Enrollment & Screening", name: "Enrollment", qty: 2, rate: 800, override: null },
    { section: "Protocol visits", name: "Visit Day 0 — Treatment", qty: 2, rate: 950, override: null },
    { section: "Protocol visits", name: "Visit Day 3", qty: 2, rate: 600, override: "Feedlot NE" },
  ] },
  { id: "INV-CA-001", studyCode: "CA-0801", site: "UC Davis", period: "Jan – Mar 2026", status: "paid", issueDate: "2026-03-31", dueDate: "2026-04-30", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Screening visit", qty: 6, rate: 400, override: null },
    { section: "Enrollment & Screening", name: "Enrollment", qty: 5, rate: 750, override: null },
    { section: "Protocol visits", name: "Baseline visit", qty: 5, rate: 900, override: null },
    { section: "Protocol visits", name: "Follow-up visit", qty: 10, rate: 550, override: null },
    { section: "Protocol visits", name: "EOS visit", qty: 2, rate: 700, override: null },
  ] },
  { id: "INV-PH-001", studyCode: "PH-2401", site: "Purdue Farm", period: "Apr – Jun 2026", status: "draft", issueDate: "2026-06-15", dueDate: "2026-07-15", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Pen setup", qty: 4, rate: 300, override: null },
    { section: "Protocol visits", name: "Starter phase complete", qty: 4, rate: 400, override: null },
    { section: "Protocol visits", name: "Grower phase complete", qty: 2, rate: 400, override: null },
  ] },
];
export function seedInvoices(): Invoice[] {
  return ALL_INVOICES.map((inv) => ({ ...inv, lineItems: inv.lineItems.map((l) => ({ ...l })) }));
}

// Sites with uninvoiced completed events — offered in the "Generate invoices"
// modal. Selecting a site materialises it into a fresh draft invoice.
const PENDING_GEN: Invoice[] = [
  { id: "INV-BR-004", studyCode: "BR-2502", site: "Feedlot CO", period: "Jun 2026", status: "draft", issueDate: "2026-06-30", dueDate: "2026-07-30", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Screening visit", qty: 3, rate: 450, override: null },
    { section: "Protocol visits", name: "Visit Day 7", qty: 3, rate: 650, override: null },
    { section: "Protocol visits", name: "Visit Day 14", qty: 3, rate: 650, override: null },
  ] },
  { id: "INV-BR-005", studyCode: "BR-2502", site: "Feedlot KS", period: "Jun 2026", status: "draft", issueDate: "2026-06-30", dueDate: "2026-07-30", holdbackPct: 0.1, lineItems: [
    { section: "Enrollment & Screening", name: "Screening visit", qty: 2, rate: 450, override: null },
    { section: "Protocol visits", name: "Visit Day 7", qty: 2, rate: 650, override: null },
  ] },
  { id: "INV-BR-006", studyCode: "BR-2502", site: "Feedlot NE", period: "Jun 2026", status: "draft", issueDate: "2026-06-30", dueDate: "2026-07-30", holdbackPct: 0.1, lineItems: [
    { section: "Protocol visits", name: "Visit Day 0 — Treatment", qty: 2, rate: 950, override: null },
    { section: "Protocol visits", name: "Visit Day 7", qty: 2, rate: 650, override: null },
  ] },
  { id: "INV-CA-002", studyCode: "CA-0801", site: "UC Davis", period: "Apr – Jun 2026", status: "draft", issueDate: "2026-06-30", dueDate: "2026-07-30", holdbackPct: 0.1, lineItems: [
    { section: "Protocol visits", name: "Follow-up visit", qty: 6, rate: 550, override: null },
    { section: "Protocol visits", name: "EOS visit", qty: 3, rate: 700, override: null },
  ] },
  { id: "INV-PH-002", studyCode: "PH-2401", site: "Purdue Farm", period: "Jul 2026", status: "draft", issueDate: "2026-07-15", dueDate: "2026-08-14", holdbackPct: 0.1, lineItems: [
    { section: "Protocol visits", name: "Grower phase complete", qty: 2, rate: 400, override: null },
    { section: "Protocol visits", name: "Finisher phase complete", qty: 2, rate: 500, override: null },
  ] },
];
export function pendingForStudy(studyCode: string): Invoice[] {
  return PENDING_GEN.filter((p) => p.studyCode === studyCode).map((p) => ({ ...p, lineItems: p.lineItems.map((l) => ({ ...l })) }));
}
export function eventCount(inv: Invoice): number { return inv.lineItems.reduce((s, l) => s + l.qty, 0); }

// ── Money helpers ───────────────────────────────────────────────────────────
export function gross(inv: Invoice): number { return inv.lineItems.reduce((s, l) => s + l.qty * l.rate, 0); }
export function holdback(inv: Invoice): number { return Math.round(gross(inv) * inv.holdbackPct); }
export function net(inv: Invoice): number { return gross(inv) - holdback(inv); }
export function fmt(n: number): string { return "$" + n.toLocaleString("en-US"); }

// ── Status metadata ─────────────────────────────────────────────────────────
export const STATUS_LABEL: Record<InvStatus, string> = { draft: "Draft", submitted: "Submitted", approved: "Approved", paid: "Paid" };
export const STATUS_DESC: Record<InvStatus, string> = { draft: "Awaiting submission", submitted: "Awaiting approval", approved: "Awaiting payment", paid: "Payment received" };
export const STATUS_BADGE: Record<InvStatus, string> = { draft: "inv-badge-draft", submitted: "inv-badge-submitted", approved: "inv-badge-approved", paid: "inv-badge-paid" };
export const NEXT_STATUS: Partial<Record<InvStatus, InvStatus>> = { draft: "submitted", submitted: "approved", approved: "paid" };
// The action that transitions each status, and who may perform it.
export const STATUS_ACTION: Record<InvStatus, string> = { draft: "Submit invoice", submitted: "Approve invoice", approved: "Mark as paid", paid: "" };
