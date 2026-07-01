"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { notificationsForStudy, useReadSet, markRead, markAllRead, isUnread, KIND_CFG } from "@/lib/notifications-data";
import "./notifications.css";

const BUCKETS: { key: "today" | "yesterday" | "earlier"; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "earlier", label: "Earlier" },
];

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { study } = useShell();
  const read = useReadSet();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc); }, [open, onClose]);

  const notifs = notificationsForStudy(study.code);
  const groups = BUCKETS.map((b) => ({ ...b, items: notifs.filter((n) => n.bucket === b.key) })).filter((g) => g.items.length > 0);
  const total = notifs.length;

  function openNotif(id: string, route: string) {
    markRead(id);
    onClose();
    router.push(`/study/${study.id}/${route}`);
  }

  return (
    <>
      {open && <div className="notif-overlay" onClick={onClose} />}
      <aside className={`notif-panel${open ? " open" : ""}`} aria-hidden={!open} aria-label="Notifications">
        <header className="notif-head">
          <div className="notif-head-title">Notifications</div>
          <button className="notif-head-link" type="button" onClick={() => markAllRead(notifs.map((n) => n.id))}>Mark all as read</button>
          <button className="notif-icon-btn" type="button" title="Notification settings" onClick={() => { onClose(); router.push(`/study/${study.id}/settings?section=notifications`); }}><i className="ti ti-settings"></i></button>
          <button className="notif-icon-btn" type="button" title="Close" onClick={onClose}><i className="ti ti-x"></i></button>
        </header>

        <div className="notif-body">
          {total === 0 ? (
            <div className="notif-empty"><i className="ti ti-circle-check"></i><div style={{ fontSize: "var(--text-base)", fontWeight: 500, color: "var(--color-text-secondary)" }}>You&apos;re all caught up</div></div>
          ) : groups.map((g) => (
            <div key={g.key}>
              <div className="notif-group-label">{g.label}</div>
              {g.items.map((n) => {
                const cfg = KIND_CFG[n.kind];
                const unread = isUnread(n, read);
                return (
                  <div key={n.id} className={`notif-row${unread ? " unread" : ""}`} onClick={() => openNotif(n.id, n.route)}>
                    <span className="notif-row-ic" style={{ background: "var(--color-page-bg)", color: cfg.color }}><i className={`ti ti-${cfg.icon}`}></i></span>
                    <div className="notif-row-main">
                      <div className="notif-row-title">{n.title}</div>
                      <div className="notif-row-body">{n.body}</div>
                    </div>
                    <div className="notif-row-ts">{n.ts}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="notif-foot">
          <button type="button" onClick={() => setToast("Full notification history coming soon")}>View all notifications</button>
        </footer>
      </aside>

      {toast && <div className="notif-toast" role="status">{toast}</div>}
    </>
  );
}
