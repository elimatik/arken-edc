// ════════════════════════════════════════════════════════════════════════════
// Notifications module — seeded inbox items + a small read-state store (shared by
// the topbar bell badge and the drawer) + notification-preference event config.
// Standalone module data (NOT the session store) → no DATA_KEY bump. Read state
// and preferences are session-scoped and reset on a full reload.
// ════════════════════════════════════════════════════════════════════════════
import { useSyncExternalStore } from "react";

export type NotifKind = "query" | "safety" | "visit" | "sdv" | "inventory" | "amendment" | "user" | "randomization";
export interface Notif { id: string; kind: NotifKind; title: string; body: string; ts: string; bucket: "today" | "yesterday" | "earlier"; route: string; read: boolean }

// Icon + colour per event kind (matches the preference groups + list rows).
export const KIND_CFG: Record<NotifKind, { icon: string; color: string }> = {
  query: { icon: "message-question", color: "var(--amber-700)" },
  safety: { icon: "alert-triangle", color: "var(--red-600)" },
  visit: { icon: "clock-exclamation", color: "var(--amber-700)" },
  sdv: { icon: "check-lines", color: "var(--blue-600)" },
  inventory: { icon: "flask", color: "var(--orange-600)" },
  amendment: { icon: "file-certificate", color: "var(--purple-600)" },
  user: { icon: "user-plus", color: "var(--slate-600)" },
  randomization: { icon: "lock", color: "var(--green-600)" },
};

const BR_NOTIFS: Notif[] = [
  { id: "n-br-1", kind: "query", title: "Query raised on BR-2502-CO-001", body: "Visit Day 3 · Heart rate field · Raised by Sofia Reyes (CRA)", ts: "14 min ago", bucket: "today", route: "queries", read: false },
  { id: "n-br-2", kind: "safety", title: "AE submitted on BR-2502-CO-002", body: "Adverse Event · Moderate · Injection-site swelling · Reported by M. Okafor", ts: "1 hr ago", bucket: "today", route: "data-entry", read: false },
  { id: "n-br-3", kind: "sdv", title: "Forms submitted for SDV review", body: "BR-2502-CO-001 · Visit Day 0 · 6 fields awaiting verification", ts: "2 hr ago", bucket: "today", route: "sdv", read: true },
  { id: "n-br-4", kind: "visit", title: "Visit overdue — BR-2502-KS-003", body: "Visit Day 7 · 2 days past the visit window", ts: "3 hr ago", bucket: "today", route: "visits", read: false },
  { id: "n-br-5", kind: "query", title: "Query response — QRY-0042", body: "BR-2502-CO-002 · CRC responded · Awaiting your review", ts: "Yesterday, 16:40", bucket: "yesterday", route: "queries", read: true },
  { id: "n-br-6", kind: "inventory", title: "Low stock — LOT-BR-T02", body: "3 vials remaining at Feedlot CO · below the low-stock threshold", ts: "Yesterday, 11:05", bucket: "yesterday", route: "inventory", read: false },
  { id: "n-br-7", kind: "amendment", title: "Protocol amendment published", body: "Feedlot CO · Site-specific addendum: additional welfare checks", ts: "Yesterday, 09:14", bucket: "yesterday", route: "settings?section=protocol", read: true },
  { id: "n-br-8", kind: "user", title: "New user invited — James Bell", body: "CRC · Feedlot KS · Invite pending (expires in 72 hours)", ts: "3 days ago", bucket: "earlier", route: "users", read: true },
  { id: "n-br-9", kind: "randomization", title: "Randomization list locked", body: "BR-2502 · Assignments can no longer be changed without an amendment", ts: "2026-06-25", bucket: "earlier", route: "settings?section=randomization", read: true },
];
const CA_NOTIFS: Notif[] = [
  { id: "n-ca-1", kind: "query", title: "Query raised on CA-0801-101-01", body: "Baseline · CADESI-04 score · Raised by DM", ts: "22 min ago", bucket: "today", route: "queries", read: false },
  { id: "n-ca-2", kind: "inventory", title: "Kit dispensed — A-001-V2", body: "CA-0801-101-01 · Follow-Up 1 · dispensed by Anh Nguyen", ts: "2 hr ago", bucket: "today", route: "inventory", read: true },
  { id: "n-ca-3", kind: "sdv", title: "Forms submitted for SDV review", body: "CA-0801-101-02 · Baseline Dermatology Assessment", ts: "Yesterday, 14:02", bucket: "yesterday", route: "sdv", read: false },
  { id: "n-ca-4", kind: "user", title: "New user invited — Dr. S. Kim", body: "PI · UC Davis · Invite accepted", ts: "4 days ago", bucket: "earlier", route: "users", read: true },
];
const PH_NOTIFS: Notif[] = [
  { id: "n-ph-1", kind: "visit", title: "Feed phase overdue — PH-2401-P05", body: "Grower phase weighing · 1 day past window", ts: "40 min ago", bucket: "today", route: "visits", read: false },
  { id: "n-ph-2", kind: "inventory", title: "Low stock — BATCH-PH-001", body: "Phytogenic blend below the low-stock threshold", ts: "Yesterday, 10:12", bucket: "yesterday", route: "inventory", read: false },
  { id: "n-ph-3", kind: "randomization", title: "Pen arm assignments confirmed", body: "PH-2401 · All pens assigned at study setup", ts: "5 days ago", bucket: "earlier", route: "settings?section=randomization", read: true },
];

export function notificationsForStudy(studyCode: string): Notif[] {
  const list = studyCode === "CA-0801" ? CA_NOTIFS : studyCode === "PH-2401" ? PH_NOTIFS : BR_NOTIFS;
  return list.map((n) => ({ ...n }));
}

// ── Read-state store (shared by the bell badge + the drawer) ──
let readSet = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function markRead(id: string): void { if (readSet.has(id)) return; readSet = new Set(readSet); readSet.add(id); emit(); }
export function markAllRead(ids: string[]): void { readSet = new Set(readSet); ids.forEach((i) => readSet.add(i)); emit(); }
function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function useReadSet(): Set<string> { return useSyncExternalStore(subscribe, () => readSet, () => readSet); }
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
