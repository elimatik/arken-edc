// ════════════════════════════════════════════════════════════════════════════
// Notifications module — seeded inbox items + read/ack stores (shared by the bell
// badge, drawer, and full-page history) + preference/event config + study rules.
// Standalone module data (NOT the session store) → no DATA_KEY bump. Read/ack
// state is session-scoped and resets on a full reload.
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";
import type { Dataset } from "@/lib/session-store/types";

export type NotifKind =
  | "query" | "safety" | "visit" | "sdv" | "inventory" | "amendment" | "user" | "randomization"
  | "query_overdue" | "enrollment_reached" | "subject_withdrawn" | "delivery_failed";
export type DeliveryStatus = "delivered" | "pending" | "failed";
export interface Notif { id: string; kind: NotifKind; title: string; body: string; ts: string; bucket: "today" | "yesterday" | "earlier"; route: string; read: boolean; delivery: DeliveryStatus; subjectCode?: string }

// Icon + colour per event kind (matches the preference groups + list rows).
export const KIND_CFG: Record<NotifKind, { icon: string; color: string }> = {
  query: { icon: "message-question", color: "var(--amber-700)" },
  safety: { icon: "alert-triangle", color: "var(--red-600)" },
  visit: { icon: "clock-exclamation", color: "var(--amber-700)" },
  sdv: { icon: "checks", color: "var(--blue-600)" },
  inventory: { icon: "flask", color: "var(--orange-600)" },
  amendment: { icon: "file-certificate", color: "var(--purple-600)" },
  user: { icon: "user-plus", color: "var(--slate-600)" },
  randomization: { icon: "lock", color: "var(--green-600)" },
  query_overdue: { icon: "clock-exclamation", color: "var(--amber-700)" },
  enrollment_reached: { icon: "target", color: "var(--green-600)" },
  subject_withdrawn: { icon: "user-minus", color: "var(--slate-600)" },
  delivery_failed: { icon: "mail-off", color: "var(--red-600)" },
};
export const KIND_LABEL: Record<NotifKind, string> = {
  query: "Query", safety: "Safety", visit: "Visit overdue", sdv: "SDV review", inventory: "Inventory",
  amendment: "Protocol amendment", user: "User", randomization: "Randomization",
  query_overdue: "Query overdue", enrollment_reached: "Enrollment target reached", subject_withdrawn: "Subject withdrawn", delivery_failed: "Notification delivery failed",
};
// Type-filter categories on the full-page history.
export const NOTIF_CATEGORIES = ["Queries", "Safety", "Visits", "Inventory", "Study management"] as const;
export function kindCategory(k: NotifKind): string {
  if (k === "query" || k === "query_overdue") return "Queries";
  if (k === "safety") return "Safety";
  if (k === "visit" || k === "sdv") return "Visits";
  if (k === "inventory") return "Inventory";
  return "Study management";
}
export const DELIVERY_CFG: Record<DeliveryStatus, { icon: string; color: string; label: string }> = {
  delivered: { icon: "mail-check", color: "var(--green-600)", label: "Delivered" },
  pending: { icon: "clock", color: "var(--amber-700)", label: "Pending delivery" },
  failed: { icon: "mail-off", color: "var(--red-600)", label: "Delivery failed" },
};
export function isSafetyKind(k: NotifKind): boolean { return k === "safety"; }

// ── Curated (recent) notifications ──
const BR_CURATED: Notif[] = [
  { id: "n-br-1", kind: "query", title: "Query raised on BR-2502-CO-001", body: "Visit Day 3 · Heart rate field · Raised by Sofia Reyes (CRA)", ts: "14 min ago", bucket: "today", route: "queries", read: false, delivery: "delivered" },
  { id: "n-br-2", kind: "safety", title: "SAE submitted on BR-2502-CO-002", body: "Serious Adverse Event · Injection-site abscess · Reported by M. Okafor · Requires acknowledgment within 24h", ts: "1 hr ago", bucket: "today", route: "data-entry", read: false, delivery: "delivered", subjectCode: "BR-2502-CO-002" },
  { id: "n-br-3", kind: "sdv", title: "Forms submitted for SDV review", body: "BR-2502-CO-001 · Visit Day 0 · 6 fields awaiting verification", ts: "2 hr ago", bucket: "today", route: "sdv", read: true, delivery: "delivered" },
  { id: "n-br-4", kind: "visit", title: "Visit overdue — BR-2502-KS-003", body: "Visit Day 7 · 2 days past the visit window", ts: "3 hr ago", bucket: "today", route: "visits", read: false, delivery: "delivered" },
  { id: "n-br-5", kind: "query", title: "Query response — QRY-0042", body: "BR-2502-CO-002 · CRC responded · Awaiting your review", ts: "Yesterday, 16:40", bucket: "yesterday", route: "queries", read: true, delivery: "delivered" },
  { id: "n-br-6", kind: "inventory", title: "Low stock — LOT-BR-T02", body: "3 vials remaining at Feedlot CO · below the low-stock threshold", ts: "Yesterday, 11:05", bucket: "yesterday", route: "inventory", read: false, delivery: "pending" },
  { id: "n-br-qo", kind: "query_overdue", title: "Query overdue — QRY-0038 on BR-2502-KS-002", body: "No response after 6 days — threshold is 5 days · Raised by Sofia Reyes (CRA) · Visit Day 7 · Body weight field", ts: "Yesterday, 08:30", bucket: "yesterday", route: "queries", read: false, delivery: "delivered" },
  { id: "n-br-7", kind: "amendment", title: "Protocol amendment published", body: "Feedlot CO · Site-specific addendum: additional welfare checks", ts: "Yesterday, 09:14", bucket: "yesterday", route: "settings?section=protocol", read: true, delivery: "delivered" },
  { id: "n-br-sw", kind: "subject_withdrawn", title: "Subject withdrawn — BR-2502-NE-003", body: "Withdrawn from the study · Reason: Owner request · Recorded by M. Okafor (CRC)", ts: "2 days ago", bucket: "earlier", route: "data-entry", read: false, delivery: "delivered" },
  { id: "n-br-8", kind: "user", title: "New user invited — James Bell", body: "CRC · Feedlot KS · Invite pending (expires in 72 hours)", ts: "3 days ago", bucket: "earlier", route: "users", read: true, delivery: "failed" },
  { id: "n-br-er", kind: "enrollment_reached", title: "Enrollment target reached — BR-2502", body: "Reached its enrollment target of 36 subjects · All sites contributed · Randomization list is now closed", ts: "3 days ago", bucket: "earlier", route: "animals", read: true, delivery: "delivered" },
  { id: "n-br-9", kind: "randomization", title: "Randomization list locked", body: "BR-2502 · Assignments can no longer be changed without an amendment", ts: "2026-06-25", bucket: "earlier", route: "settings?section=randomization", read: true, delivery: "delivered" },
];
const CA_CURATED: Notif[] = [
  { id: "n-ca-1", kind: "query", title: "Query raised on CA-0801-101-01", body: "Baseline · CADESI-04 score · Raised by DM", ts: "22 min ago", bucket: "today", route: "queries", read: false, delivery: "delivered" },
  { id: "n-ca-2", kind: "inventory", title: "Kit dispensed — A-001-V2", body: "CA-0801-101-01 · Follow-Up 1 · dispensed by Anh Nguyen", ts: "2 hr ago", bucket: "today", route: "inventory", read: true, delivery: "delivered" },
  { id: "n-ca-3", kind: "sdv", title: "Forms submitted for SDV review", body: "CA-0801-101-02 · Baseline Dermatology Assessment", ts: "Yesterday, 14:02", bucket: "yesterday", route: "sdv", read: false, delivery: "delivered" },
  { id: "n-ca-4", kind: "user", title: "New user invited — Dr. S. Kim", body: "PI · UC Davis · Invite accepted", ts: "4 days ago", bucket: "earlier", route: "users", read: true, delivery: "delivered" },
];
const PH_CURATED: Notif[] = [
  { id: "n-ph-1", kind: "visit", title: "Feed phase overdue — PH-2401-P05", body: "Grower phase weighing · 1 day past window", ts: "40 min ago", bucket: "today", route: "visits", read: false, delivery: "delivered" },
  { id: "n-ph-2", kind: "inventory", title: "Low stock — BATCH-PH-001", body: "Phytogenic blend below the low-stock threshold", ts: "Yesterday, 10:12", bucket: "yesterday", route: "inventory", read: false, delivery: "delivered" },
  { id: "n-ph-3", kind: "randomization", title: "Pen arm assignments confirmed", body: "PH-2401 · All pens assigned at study setup", ts: "5 days ago", bucket: "earlier", route: "settings?section=randomization", read: true, delivery: "delivered" },
];

// Fill each study to ~30 / 12 / 8 (50 total) with older generated entries so the
// full-page history paginates. Deterministic (index-based, no randomness).
const GEN_KINDS: NotifKind[] = ["query", "sdv", "visit", "query_overdue", "inventory", "amendment", "user", "subject_withdrawn", "safety"];
const GEN_ROUTES: Record<string, string> = { query: "queries", sdv: "sdv", visit: "visits", query_overdue: "queries", inventory: "inventory", amendment: "settings?section=protocol", user: "users", subject_withdrawn: "data-entry", safety: "data-entry" };
function generate(prefix: string, code: string, sites: string[], count: number): Notif[] {
  const out: Notif[] = [];
  for (let i = 0; i < count; i++) {
    const k = GEN_KINDS[i % GEN_KINDS.length];
    const site = sites[i % sites.length];
    const num = String((i % 8) + 1).padStart(3, "0");
    const subjectCode = `${code}-${site}-${num}`;
    out.push({ id: `${prefix}-g${i}`, kind: k, title: `${KIND_LABEL[k]} — ${subjectCode}`, body: `${KIND_LABEL[k]} event · ${code} · Feedlot ${site}`, ts: `${i + 6} days ago`, bucket: "earlier", route: GEN_ROUTES[k] ?? "queries", read: i % 4 !== 0, delivery: "delivered", ...(k === "safety" ? { subjectCode } : {}) });
  }
  return out;
}
const BR_ALL = [...BR_CURATED, ...generate("br", "BR-2502", ["CO", "KS", "NE", "TX"], 18)];
const CA_ALL = [...CA_CURATED, ...generate("ca", "CA-0801", ["101", "102", "103"], 8)];
const PH_ALL = [...PH_CURATED, ...generate("ph", "PH-2401", ["RUA"], 5)];

export function notificationsForStudy(studyCode: string): Notif[] {
  const list = studyCode === "CA-0801" ? CA_ALL : studyCode === "PH-2401" ? PH_ALL : BR_ALL;
  return list.map((n) => ({ ...n }));
}
// The drawer shows only the most recent items.
export function drawerNotifications(studyCode: string): Notif[] {
  return notificationsForStudy(studyCode).slice(0, 12);
}

// Resolve the click target (a `/study/<id>/…` suffix) for a notification.
// SAE/safety notifications deep-link to the subject's AE/SAE form via the ?form=
// definition-id pattern; if the subject or AE form can't be resolved, fall back
// to the Queries worklist (where AE-related queries live). Other kinds use their
// own seeded route.
export function notifTargetRoute(dataset: Dataset, studyId: string, n: Notif): string {
  if (n.kind === "safety") {
    const subj = n.subjectCode ? dataset.subjects.find((s) => s.study_id === studyId && s.subject_code === n.subjectCode) : undefined;
    // Prefer the canonical repeating "Adverse Event" form over visit-level
    // "Adverse Events Review" / "Final Adverse Event Assessment" variants.
    const aeForm = dataset.forms.find((f) => f.study_id === studyId && f.name.toLowerCase() === "adverse event")
      ?? dataset.forms.find((f) => f.study_id === studyId && /adverse event/i.test(f.name));
    if (subj && aeForm) return `data-entry/${subj.id}?form=${aeForm.id}`;
    return "queries";
  }
  return n.route;
}

// ── Read + acknowledge stores (shared by badge / drawer / full page) ──
let readSet = new Set<string>();
let ackSet = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function markRead(id: string): void { if (readSet.has(id)) return; readSet = new Set(readSet); readSet.add(id); emit(); }
export function markAllRead(ids: string[]): void { readSet = new Set(readSet); ids.forEach((i) => readSet.add(i)); emit(); }
export function acknowledge(id: string): void { if (ackSet.has(id)) return; ackSet = new Set(ackSet); ackSet.add(id); emit(); }
function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function useReadSet(): Set<string> { return useSyncExternalStore(subscribe, () => readSet, () => readSet); }
export function useAckSet(): Set<string> { return useSyncExternalStore(subscribe, () => ackSet, () => ackSet); }
export function isUnread(n: Notif, read: Set<string>): boolean { return !n.read && !read.has(n.id); }
export function unreadCount(studyCode: string, read: Set<string>): number { return notificationsForStudy(studyCode).filter((n) => isUnread(n, read)).length; }

// ── Notification-preference event config ──
export interface EventGroup { title: string; icon: string; color: string; events: { key: string; label: string }[] }
export const EVENT_GROUPS: EventGroup[] = [
  { title: "Queries", icon: "message-question", color: "var(--amber-700)", events: [
    { key: "q_own", label: "A query is raised on one of my subjects" },
    { key: "q_response", label: "A query I raised gets a response" },
    { key: "q_all", label: "Any query activity in the study" },
  ] },
  { title: "Safety", icon: "alert-triangle", color: "var(--red-600)", events: [
    { key: "s_ae", label: "An AE or SAE is submitted" },
    { key: "s_ack24", label: "An SAE requires acknowledgment within 24h" },
  ] },
  { title: "Visits & data", icon: "calendar", color: "var(--blue-600)", events: [
    { key: "v_overdue", label: "A visit becomes overdue (past window)" },
    { key: "v_review", label: "A form is submitted for my review" },
    { key: "v_edited", label: "A field is edited on a form I previously reviewed" },
  ] },
  { title: "Inventory", icon: "flask", color: "var(--orange-600)", events: [
    { key: "i_low", label: "Stock falls below the low-stock threshold" },
    { key: "i_shipment", label: "A new shipment is received" },
    { key: "i_dispensed", label: "A unit is dispensed" },
  ] },
  { title: "Study management", icon: "clipboard-list", color: "var(--purple-600)", events: [
    { key: "m_amendment", label: "A new protocol amendment is published" },
    { key: "m_user", label: "A new user is invited to the study" },
    { key: "m_dblock", label: "Database lock is approaching (30 days before)" },
    { key: "m_randlock", label: "Randomization list is locked" },
  ] },
];
const EVENT_KEYS = EVENT_GROUPS.flatMap((g) => g.events.map((e) => e.key));
const allEvents = (v: boolean): Record<string, boolean> => Object.fromEntries(EVENT_KEYS.map((k) => [k, v]));
const BASE: Record<string, boolean> = { q_own: true, q_response: true, q_all: false, s_ae: true, s_ack24: true, v_overdue: true, v_review: false, v_edited: false, i_low: true, i_shipment: false, i_dispensed: false, m_amendment: false, m_user: false, m_dblock: true, m_randlock: false };

// Sensible per-role default event toggles.
export function roleNotifDefaults(role: string): Record<string, boolean> {
  if (role === "DM" || role === "Admin") return allEvents(true);
  if (role === "PI") return { ...allEvents(false), q_own: true, q_response: true, s_ae: true, s_ack24: true, v_overdue: true };
  if (role === "CRA") return { ...BASE, q_all: true, v_review: true, i_shipment: true, m_amendment: true };
  // CRC — no inventory / study-management noise
  return { ...BASE, i_low: false, m_dblock: false };
}

// ── Study-level notification rules (Settings → Study preferences, Admin/DM) ──
export interface StudyRule { key: string; label: string; roles: string[]; threshold?: number; thresholdUnit?: string }
export const STUDY_RULES_SEED: StudyRule[] = [
  { key: "sae", label: "SAE submitted", roles: ["DM", "PI"] },
  { key: "q_overdue", label: "Query overdue", roles: ["DM", "CRA"], threshold: 5, thresholdUnit: "days" },
  { key: "enroll", label: "Enrollment target reached", roles: ["DM", "Admin", "PI"] },
  { key: "withdrawn", label: "Subject withdrawn", roles: ["DM", "PI"] },
  { key: "dblock", label: "Database lock approaching (30 days)", roles: ["DM", "Admin"] },
  { key: "amendment", label: "Protocol amendment published", roles: ["CRC", "CRA", "PI", "DM", "Admin"] },
  { key: "low_inv", label: "Low inventory threshold reached", roles: ["DM", "Admin"] },
  { key: "screen_fail", label: "Screen failure rate >30%", roles: ["DM", "Admin"] },
];
