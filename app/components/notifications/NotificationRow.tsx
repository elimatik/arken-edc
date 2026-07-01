"use client";

import { type Notif, KIND_CFG, DELIVERY_CFG, isUnread, isSafetyKind, useDeliveryMap, effectiveDelivery } from "@/lib/notifications-data";

// SAE escalation timeline (Fix 10) — purely visual/seeded, demonstrates the
// regulatory notification → acknowledgment → escalation chain.
function SaeTimeline({ acked }: { acked: boolean }) {
  const chips = acked
    ? [
        { icon: "check", tone: "green", label: "Notified DM + PI — T+0" },
        { icon: "check", tone: "green", label: "Acknowledged by DM — T+2h" },
        { icon: "minus", tone: "grey", label: "Sponsor escalation — not triggered" },
        { icon: "minus", tone: "grey", label: "Compliance flag — not triggered" },
      ]
    : [
        { icon: "check", tone: "green", label: "Notified DM + PI — T+0" },
        { icon: "clock", tone: "amber", label: "Awaiting DM acknowledgment — T+2h" },
        { icon: "clock", tone: "amber", label: "Sponsor notified if unacknowledged — T+4h" },
        { icon: "alert-triangle", tone: "red", label: "Compliance flag — T+24h if unacknowledged" },
      ];
  return (
    <div className="notif-tl">
      {chips.map((c, i) => (
        <span key={i} className={`notif-tl-chip ${c.tone}`}><i className={`ti ti-${c.icon}`}></i>{c.label}</span>
      ))}
    </div>
  );
}

// One notification row — shared by the drawer and the full-page history.
export function NotificationRow({ n, read, ack, onOpen, onAckRequest, onRetry }: {
  n: Notif;
  read: Set<string>;
  ack: Set<string>;
  onOpen: (n: Notif) => void;
  onAckRequest: (n: Notif) => void;
  onRetry: (n: Notif) => void;
}) {
  const deliveryMap = useDeliveryMap();
  const cfg = KIND_CFG[n.kind];
  const delStatus = effectiveDelivery(n, deliveryMap);
  const del = DELIVERY_CFG[delStatus];
  const unread = isUnread(n, read);
  const acked = ack.has(n.id);
  const isSae = n.kind === "safety" && n.title.includes("SAE");
  return (
    <div className={`notif-row${unread ? " unread" : ""}`} onClick={() => onOpen(n)}>
      <span className="notif-row-ic" style={{ background: "var(--color-page-bg)", color: cfg.color }}><i className={`ti ti-${cfg.icon}`}></i></span>
      <div className="notif-row-main">
        <div className="notif-row-title">{n.title}</div>
        <div className="notif-row-body">{n.body}</div>
        {isSae && <SaeTimeline acked={acked} />}
      </div>
      <div className="notif-row-right">
        <div className="notif-row-meta">
          {isSafetyKind(n.kind) && (acked
            ? <span className="notif-ack-chip"><i className="ti ti-check"></i>Acknowledged</span>
            : <button className="notif-ack-btn" type="button" onClick={(e) => { e.stopPropagation(); onAckRequest(n); }}>Acknowledge</button>)}
          {delStatus === "failed" && <button className="notif-retry" type="button" onClick={(e) => { e.stopPropagation(); onRetry(n); }}>Retry</button>}
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
