"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import {
  notificationsForStudy, notifTargetRoute, useReadSet, useAckSet, markRead, markAllRead, acknowledge,
  idsForMarkAll, setDelivery, isUnread, kindCategory, NOTIF_CATEGORIES, type Notif,
} from "@/lib/notifications-data";
import { NotificationRow, AckDialog, utcStamp } from "@/components/notifications/NotificationRow";
import "@/components/notifications/notifications.css";

const PAGE_SIZE = 25;
const STATUSES = ["All", "Unread", "Read"];

// Best-effort date parse: dated entries ("2026-06-25") filter; relative-time
// entries ("3 days ago") have no comparable date and always pass.
function parseTs(ts: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? new Date(m[1]) : null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { study } = useShell();
  const { dataset } = useStudySession();
  const read = useReadSet();
  const ack = useAckSet();
  const all = useMemo(() => notificationsForStudy(study.code), [study.code]);
  const subjectCodes = useMemo(
    () => dataset.subjects.filter((s) => s.study_id === study.id).map((s) => s.subject_code).sort((a, b) => a.localeCompare(b)),
    [dataset.subjects, study.id],
  );

  const [q, setQ] = useState("");
  const [type, setType] = useState("All");
  const [status, setStatus] = useState("All");
  const [subj, setSubj] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [ackNotif, setAckNotif] = useState<Notif | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { setPage(0); }, [q, type, status, subj, from, to]);

  const filtered = useMemo(() => all.filter((n) => {
    if (q && !`${n.title} ${n.body}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (type !== "All" && kindCategory(n.kind) !== type) return false;
    if (status === "Unread" && !isUnread(n, read)) return false;
    if (status === "Read" && isUnread(n, read)) return false;
    if (subj !== "All" && n.subjectCode !== subj && !n.title.includes(subj) && !n.body.includes(subj)) return false;
    const d = parseTs(n.ts);
    if (d && from && d < new Date(from)) return false;
    if (d && to && d > new Date(to)) return false;
    return true;
  }), [all, q, type, status, subj, from, to, read]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const shown = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function openNotif(n: Notif) { markRead(n.id); router.push(`/study/${study.id}/${notifTargetRoute(dataset, study.id, n)}`); }
  function confirmAck() {
    if (!ackNotif) return;
    acknowledge(ackNotif.id);
    setToast(`SAE notification acknowledged — logged in audit trail at ${utcStamp()} UTC`);
    setAckNotif(null);
  }
  function retry(n: Notif) {
    setDelivery(n.id, "pending");
    setToast("Retrying delivery…");
    setTimeout(() => { setDelivery(n.id, "delivered"); setToast("Delivered"); }, 1500);
  }

  return (
    <div className="notif-page">
      <div className="notif-page-head">
        <div>
          <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: 600, margin: 0 }}>Notifications</h1>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", margin: "4px 0 0" }}>{study.code} · {all.length} notifications</p>
        </div>
        <button className="notif-head-link" type="button" style={{ fontSize: "var(--text-sm)" }} onClick={() => markAllRead(idsForMarkAll(all, ack))}>Mark all as read</button>
      </div>

      <div className="notif-page-toolbar">
        <div className="notif-page-search">
          <i className="ti ti-search"></i>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notifications…" aria-label="Search notifications" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by type">
          <option value="All">All types</option>
          {NOTIF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          {STATUSES.map((s) => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
        </select>
        <select value={subj} onChange={(e) => setSubj(e.target.value)} aria-label="Filter by subject">
          <option value="All">All subjects</option>
          {subjectCodes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" title="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" title="To date" />
      </div>

      {shown.length === 0 ? (
        <div className="notif-page-list"><div className="notif-empty"><i className="ti ti-circle-check"></i><div style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--color-text-secondary)" }}>{filtered.length === 0 && all.length > 0 ? "No notifications match your filters" : "You're all caught up"}</div></div></div>
      ) : (
        <div className="notif-page-list">
          {shown.map((n) => (
            <NotificationRow key={n.id} n={n} read={read} ack={ack} onOpen={openNotif} onAckRequest={setAckNotif} onRetry={retry} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="notif-pager">
          <span>Page {safePage + 1} of {pageCount} · showing {shown.length} of {filtered.length}</span>
          <div className="notif-pager-btns">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</button>
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</button>
          </div>
        </div>
      )}

      {ackNotif && <AckDialog onConfirm={confirmAck} onCancel={() => setAckNotif(null)} />}
      {toast && <div className="notif-toast" role="status">{toast}</div>}
    </div>
  );
}
