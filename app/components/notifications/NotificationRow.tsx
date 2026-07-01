"use client";

import { type Notif, KIND_CFG, DELIVERY_CFG, isUnread, isSafetyKind } from "@/lib/notifications-data";

// One notification row — shared by the drawer and the full-page history.
export function NotificationRow({ n, read, ack, onOpen, onAckRequest }: {
  n: Notif;
  read: Set<string>;
  ack: Set<string>;
  onOpen: (n: Notif) => void;
  onAckRequest: (n: Notif) => void;
}) {
  const cfg = KIND_CFG[n.kind];
  const del = DELIVERY_CFG[n.delivery];
  const unread = isUnread(n, read);
  const acked = ack.has(n.id);
  return (
    <div className={`notif-row${unread ? " unread" : ""}`} onClick={() => onOpen(n)}>
      <span className="notif-row-ic" style={{ background: "var(--color-page-bg)", color: cfg.color }}><i className={`ti ti-${cfg.icon}`}></i></span>
      <div className="notif-row-main">
        <div className="notif-row-title">{n.title}</div>
        <div className="notif-row-body">{n.body}</div>
      </div>
      <div className="notif-row-right">
        <div className="notif-row-meta">
          {isSafetyKind(n.kind) && (acked
            ? <span className="notif-ack-chip"><i className="ti ti-check"></i>Acknowledged</span>
            : <button className="notif-ack-btn" type="button" onClick={(e) => { e.stopPropagation(); onAckRequest(n); }}>Acknowledge</button>)}
          <span className="notif-delivery" style={{ color: del.color }} title={del.label} aria-label={del.label}><i className={`ti ti-${del.icon}`}></i></span>
        </div>
        <div className="notif-row-ts">{n.ts}</div>
      </div>
    </div>
  );
}

// Confirmation dialog for acknowledging an SAE notification (21 CFR Part 11).
export function AckDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="notif-dialog-overlay" onClick={onCancel}>
      <div className="notif-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="notif-dialog-title"><i className="ti ti-alert-triangle"></i>Acknowledge SAE notification</div>
        <div className="notif-dialog-body">Acknowledge receipt of this SAE notification? This will be logged in the audit trail.</div>
        <div className="notif-dialog-actions">
          <button className="notif-dialog-btn" type="button" onClick={onCancel}>Cancel</button>
          <button className="notif-dialog-btn primary" type="button" onClick={onConfirm}>Acknowledge</button>
        </div>
      </div>
    </div>
  );
}

// "2026-07-01 14:32:08" style UTC stamp for the acknowledgment audit toast.
export function utcStamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
