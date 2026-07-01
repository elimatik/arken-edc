"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { drawerNotifications, notificationsForStudy, notifTargetRoute, isUnread, useReadSet, useAckSet, markRead, markAllRead, acknowledge, type Notif } from "@/lib/notifications-data";
import { NotificationRow, AckDialog, utcStamp } from "./NotificationRow";
import "./notifications.css";

const BUCKETS: { key: "today" | "yesterday" | "earlier"; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "earlier", label: "Earlier" },
];

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { study } = useShell();
  const { dataset } = useStudySession();
  const read = useReadSet();
  const ack = useAckSet();
  const [toast, setToast] = useState<string | null>(null);
  const [ackNotif, setAckNotif] = useState<Notif | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [open, onClose]);

  // The drawer is the unread inbox — read items drop out (full history lives on
  // the /notifications page), so "Mark all as read" empties it to the empty state.
  const notifs = drawerNotifications(study.code).filter((n) => isUnread(n, read));
  const groups = BUCKETS.map((b) => ({ ...b, items: notifs.filter((n) => n.bucket === b.key) })).filter((g) => g.items.length > 0);
  const total = notifs.length;

  function openNotif(n: Notif) {
    markRead(n.id);
    onClose();
    router.push(`/study/${study.id}/${notifTargetRoute(dataset, study.id, n)}`);
  }
  function confirmAck() {
    if (!ackNotif) return;
    acknowledge(ackNotif.id);
    setToast(`SAE notification acknowledged — logged in audit trail at ${utcStamp()} UTC`);
    setAckNotif(null);
  }

  return (
    <>
      {open && <div className="notif-overlay" onClick={onClose} />}
      <aside className={`notif-panel${open ? " open" : ""}`} aria-hidden={!open} aria-label="Notifications">
        <header className="notif-head">
          <div className="notif-head-title">Notifications</div>
          <button className="notif-head-link" type="button" onClick={() => markAllRead(notificationsForStudy(study.code).map((n) => n.id))}>Mark all as read</button>
          <button className="notif-icon-btn" type="button" title="Notification settings" onClick={() => { onClose(); router.push(`/study/${study.id}/profile?section=notifications`); }}><i className="ti ti-settings"></i></button>
          <button className="notif-icon-btn" type="button" title="Close" onClick={onClose}><i className="ti ti-x"></i></button>
        </header>

        <div className="notif-body">
          {total === 0 ? (
            <div className="notif-empty">
              <i className="ti ti-checks"></i>
              <div style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--color-text-secondary)" }}>You&apos;re all caught up</div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginTop: -8 }}>No new notifications</div>
            </div>
          ) : groups.map((g) => (
            <div key={g.key}>
              <div className="notif-group-label">{g.label}</div>
              {g.items.map((n) => (
                <NotificationRow key={n.id} n={n} read={read} ack={ack} onOpen={openNotif} onAckRequest={setAckNotif} />
              ))}
            </div>
          ))}
        </div>

        <footer className="notif-foot">
          <button type="button" onClick={() => { onClose(); router.push(`/study/${study.id}/notifications`); }}>View all notifications</button>
        </footer>
      </aside>

      {ackNotif && <AckDialog onConfirm={confirmAck} onCancel={() => setAckNotif(null)} />}
      {toast && <div className="notif-toast" role="status">{toast}</div>}
    </>
  );
}
