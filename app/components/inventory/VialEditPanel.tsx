"use client";

import { useState } from "react";
import type { Dataset, Vial } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { vialDisplayId, canInv, type InvConfig } from "@/lib/inventory-data";

const TODAY = new Date().toISOString().slice(0, 10);

// Pencil-edit slide-in for an existing unit. Volume/conc/expiry are locked once a
// shipment is confirmed — the only actions here are status changes (remove /
// return to sponsor), each of which writes a vial event (the audit-trail source).
// Mark returned: CRC/CRA/Admin. Remove unit: Admin only. Both stay visible even for
// already-removed/returned units (a removed unit can still be returned to sponsor).
export function VialEditPanel({ cfg, hideArms, vial, role, onClose, update }: {
  cfg: InvConfig;
  hideArms: boolean;
  vial: Vial;
  role: Role;
  onClose: () => void;
  update: (m: (d: Dataset) => void) => void;
}) {
  const [mode, setMode] = useState<"menu" | "remove" | "return">("menu");
  const [reason, setReason] = useState("");
  const [retDate, setRetDate] = useState(TODAY);
  const [retNotes, setRetNotes] = useState("");
  const id = vialDisplayId(vial, hideArms);
  // PH-2401 feed is consumed, never returned to sponsor — no return action.
  const canReturn = canInv("return", role) && !cfg.feed;
  const canRemove = canInv("remove", role);

  function removeUnit() {
    if (!reason.trim()) return;
    update((d) => {
      const v = d.vials.find((x) => x.id === vial.id);
      if (!v) return;
      v.status = "removed";
      v.events.push({ type: "removed", date: TODAY, note: reason.trim() });
    });
    onClose();
  }
  function returnToSponsor() {
    update((d) => {
      const v = d.vials.find((x) => x.id === vial.id);
      if (!v) return;
      v.status = "returned";
      v.events.push({ type: "returned", date: retDate, note: retNotes.trim() || "Returned to sponsor" });
    });
    onClose();
  }

  return (
    <div className="inv-panel-overlay" onClick={onClose}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-sp-header">
          <div>
            <div className="inv-sp-title">Edit {cfg.itemNoun} {id}</div>
            <div className="inv-sp-meta">{vial.lotId} · {vial.concentration}% · {vial.initialVol} {vial.unit} initial</div>
          </div>
          <button className="inv-sp-close" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>

        <div className="inv-sp-body">
          <div className="inv-hint">Volume, concentration and expiry are locked after the shipment is confirmed. Available actions:</div>

          <div className="inv-preview"><div className="inv-preview-text" style={{ color: "var(--color-text-tertiary)" }}>Current status: <strong style={{ textTransform: "capitalize" }}>{vial.status}</strong></div></div>

          {mode === "menu" && (
            <>
              {canReturn && <button className="inv-btn-purple" onClick={() => setMode("return")}><i className="ti ti-truck-delivery"></i> Mark as returned to sponsor</button>}
              {canRemove && <button className="inv-btn-danger" onClick={() => setMode("remove")}><i className="ti ti-trash"></i> Remove unit</button>}
              {!canRemove && <div className="inv-hint">Removing a unit is an Administrator action.</div>}
              {!canReturn && !canRemove && <div className="inv-hint">Your role has no edit actions for this unit.</div>}
            </>
          )}

          {mode === "return" && (
            <>
              <div className="inv-form-row"><span className="inv-label">Return to sponsor date</span>
                <input className="inv-input inv-mono" value={retDate} onChange={(e) => setRetDate(e.target.value)} /></div>
              <div className="inv-form-row"><span className="inv-label">Notes</span>
                <input className="inv-input" placeholder="e.g. Returned per protocol" value={retNotes} onChange={(e) => setRetNotes(e.target.value)} /></div>
              <div className="inv-preview"><div className="inv-preview-text" style={{ color: "var(--purple-700)" }}>Unit {id} will be marked returned to sponsor and removed from available inventory.</div></div>
            </>
          )}

          {mode === "remove" && (
            <>
              <div className="inv-form-row"><span className="inv-label">Reason for removal</span>
                <input className="inv-input" placeholder="e.g. Seal compromised — quarantined" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
              <div className="inv-preview"><div className="inv-preview-text" style={{ color: "var(--red-600)" }}>Unit {id} will be marked removed from inventory. This is recorded in the audit trail.</div></div>
            </>
          )}
        </div>

        <div className="inv-sp-footer">
          {mode === "menu"
            ? <button className="inv-btn-secondary" onClick={onClose}>Close</button>
            : <>
                <button className="inv-btn-secondary" onClick={() => setMode("menu")}>Cancel</button>
                {mode === "return"
                  ? <button className="inv-btn-purple" onClick={returnToSponsor}><i className="ti ti-circle-check"></i> Confirm return to sponsor</button>
                  : <button className="inv-btn-danger" onClick={removeUnit} disabled={!reason.trim()} style={{ opacity: reason.trim() ? 1 : 0.5 }}><i className="ti ti-trash"></i> Remove unit</button>}
              </>}
        </div>
      </div>
    </div>
  );
}
