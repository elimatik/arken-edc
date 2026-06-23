"use client";

import { useState } from "react";
import type { Dataset } from "@/lib/session-store/types";
import { type DispenseRow } from "@/lib/inventory-data";

const TODAY = new Date().toISOString().slice(0, 10);

// Ported from the prototype's return modal (confirmReturn + updateReturnModalPreview).
export function ReturnModal({ row, readOnly, onClose, update }: {
  row: DispenseRow;
  readOnly: boolean; // viewing an already-returned dispense
  onClose: () => void;
  update: (m: (d: Dataset) => void) => void;
}) {
  const [date, setDate] = useState(row.retDate ?? TODAY);
  const [vol, setVol] = useState<string>(row.retVol != null ? String(row.retVol) : "");
  const [condition, setCondition] = useState(row.retCondition ? mapCondition(row.retCondition) : "good");
  const [manualRemove, setManualRemove] = useState(false);
  const [sponsorDate, setSponsorDate] = useState("");

  const v = parseFloat(vol) || 0;
  const badCondition = condition === "compromised" || condition === "damaged";
  const isEmpty = v <= 0 && vol !== "";
  const showSponsor = isEmpty || badCondition || manualRemove;
  const unit = row.vial.unit;

  let outcome: string, outcomeColor: string;
  if (manualRemove) { outcome = "Manual removal — unit will be marked as removed from inventory regardless of volume."; outcomeColor = "var(--amber-700)"; }
  else if (isEmpty) { outcome = `Volume is 0 ${unit} — vial will be marked depleted and removed from inventory.`; outcomeColor = "var(--red-600)"; }
  else if (badCondition) { outcome = `Condition: ${condition} — vial will be removed from available inventory and flagged for sponsor return.`; outcomeColor = "var(--amber-700)"; }
  else if (vol === "") { outcome = "Enter the volume remaining to preview the outcome."; outcomeColor = "var(--color-text-tertiary)"; }
  else { outcome = `${v} ${unit} confirmed remaining — vial returns to available inventory, ready for next use.`; outcomeColor = "var(--green-600)"; }

  function confirm() {
    update((d) => {
      const vial = d.vials.find((x) => x.id === row.vialId);
      if (!vial) return;
      vial.events.push({ type: "return", date, volReturned: v, condition });
      if (manualRemove) {
        vial.status = "removed";
        vial.events.push({ type: "removed", date, note: "Manual removal by coordinator" });
      } else if (v <= 0 || badCondition) {
        vial.status = badCondition ? "removed" : "depleted";
        if (sponsorDate) vial.events.push({ type: "returned", date: sponsorDate, note: "Returned to sponsor" });
      } else {
        vial.status = "available";
      }
    });
    onClose();
  }

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-header">
          <div>
            <div className="inv-sp-title">{readOnly ? "Return details" : "Log return"}</div>
            <div className="inv-sp-meta">{row.vialId} · {row.subject} · {row.visit} · {row.volDispensed} {unit} dispensed</div>
          </div>
          <button className="inv-sp-close" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>
        <div className="inv-modal-body">
          <div className="inv-form-row-2">
            <div className="inv-form-row"><span className="inv-label">Return date</span>
              <input className="inv-input inv-mono" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} /></div>
            <div className="inv-form-row"><span className="inv-label">Volume remaining ({unit})</span>
              <input className="inv-input inv-mono" type="number" step="0.1" placeholder="0.0" value={vol} onChange={(e) => setVol(e.target.value)} disabled={readOnly} /></div>
          </div>
          <div className="inv-form-row"><span className="inv-label">Condition</span>
            <select className="inv-form-select" value={condition} onChange={(e) => setCondition(e.target.value)} disabled={readOnly}>
              <option value="good">Good — seal intact · back to inventory</option>
              <option value="acceptable">Acceptable — minor wear · back to inventory</option>
              <option value="compromised">Compromised — investigate · removed from inventory</option>
              <option value="damaged">Damaged — quarantine · removed from inventory</option>
            </select>
          </div>
          {showSponsor && (
            <div className="inv-form-row"><span className="inv-label">Return to sponsor date</span>
              <input className="inv-input inv-mono" placeholder="2026-06-30" value={sponsorDate} onChange={(e) => setSponsorDate(e.target.value)} disabled={readOnly} />
              <span className="inv-hint">Empty or unusable vials must be returned to sponsor per protocol.</span></div>
          )}
          <div className="inv-preview">
            <div className="inv-preview-label">Outcome</div>
            <div className="inv-preview-text" style={{ color: outcomeColor }}>{outcome}</div>
          </div>
          {!readOnly && (
            <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)", cursor: "pointer", borderTop: "1px solid var(--color-border-subtle)", paddingTop: "var(--space-3)" }}>
              <input type="checkbox" className="inv-check" style={{ accentColor: "var(--amber-700)", marginTop: 2 }} checked={manualRemove} onChange={(e) => setManualRemove(e.target.checked)} />
              <div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)", color: "var(--amber-700)" }}>Manual removal override</div>
                <div className="inv-hint" style={{ marginTop: 1 }}>Force-remove this unit from inventory regardless of volume. Use if lost, damaged beyond use, or protocol requires removal.</div>
              </div>
            </label>
          )}
          {readOnly && row.retCondition && <div className="inv-hint">Recorded condition: {row.retCondition}</div>}
        </div>
        <div className="inv-modal-footer">
          <button className="inv-btn-secondary" onClick={onClose}>{readOnly ? "Close" : "Cancel"}</button>
          {!readOnly && <button className="inv-btn-primary" onClick={confirm}><i className="ti ti-circle-check"></i> Confirm return</button>}
        </div>
      </div>
    </div>
  );
}

function mapCondition(c: string): string {
  const l = c.toLowerCase();
  if (l.startsWith("acceptable")) return "acceptable";
  if (l.startsWith("compromised")) return "compromised";
  if (l.startsWith("damaged")) return "damaged";
  return "good";
}
