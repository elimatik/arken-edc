"use client";

import { useState } from "react";
import type { Dataset, Shipment, Vial } from "@/lib/session-store/types";
import { type InvConfig } from "@/lib/inventory-data";

const TODAY = new Date().toISOString().slice(0, 10);

interface DraftRow { id: string; vol: number; conc: number; expiry: string; group: string; condition: string; received: boolean; usable: boolean; notes: string }
type Review = { shipmentId: string; readOnly: boolean; isNew: boolean; rows: DraftRow[]; lot: string };

// Tab 2 — receive shipment (ported from the shipments list + review + intake modal).
export function ReceiveTab({ cfg, studyId, shipments, vials, isAdmin, update }: {
  cfg: InvConfig;
  studyId: string;
  shipments: Shipment[];
  vials: Vial[];
  isAdmin: boolean;
  update: (m: (d: Dataset) => void) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [intake, setIntake] = useState(false);
  const [shipDate, setShipDate] = useState("");
  const [recvDate, setRecvDate] = useState("");
  const [csvName, setCsvName] = useState<string | null>(null);

  function draftsFromLot(lot: string): DraftRow[] {
    return vials.filter((v) => lot.includes(v.lotId) || v.lotId === lot).map((v) => ({
      id: v.id, vol: v.initialVol, conc: v.concentration, expiry: v.expiryDate, group: v.treatmentGroup,
      condition: v.status === "removed" ? "Quarantine" : "Good", received: v.status !== "removed", usable: v.status !== "removed", notes: "",
    }));
  }

  function openReview(s: Shipment, readOnly: boolean) {
    setReview({ shipmentId: s.id, readOnly, isNew: false, lot: s.lot, rows: draftsFromLot(s.lot) });
  }
  function closeReview() { setReview(null); }

  function setRow(i: number, patch: Partial<DraftRow>) {
    setReview((r) => r ? { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) } : r);
  }
  function markAllUsable() { setReview((r) => r ? { ...r, rows: r.rows.map((row) => ({ ...row, usable: true })) } : r); }

  function confirmShipment() {
    if (!review) return;
    const usable = review.rows.filter((r) => r.usable).length;
    update((d) => {
      const s = d.shipments.find((x) => x.id === review.shipmentId);
      if (s) { s.confirmed = true; s.usableCount = usable; }
      if (review.isNew) {
        for (const row of review.rows.filter((r) => r.received)) {
          if (d.vials.some((v) => v.id === row.id)) continue;
          d.vials.push({
            id: row.id, studyId, lotId: review.lot, drugName: vials[0]?.drugName ?? "—", treatmentGroup: row.group,
            initialVol: row.vol, concentration: row.conc, unit: cfg.unit, expiryDate: row.expiry, receivedDate: recvDate || TODAY,
            status: row.usable ? "available" : "removed", siteId: null,
            events: [{ type: "received", date: recvDate || TODAY, note: `Shipment ${review.shipmentId} received` }, ...(row.usable ? [] : [{ type: "removed" as const, date: recvDate || TODAY, note: row.notes || "Not usable on receipt" }])],
          });
        }
      }
    });
    closeReview();
  }

  function importCSV() {
    const n = shipments.length + 1;
    const id = `SHP-${studyId.slice(0, 2).toUpperCase()}-IMP${n}`;
    const lot = `LOT-IMP-${String(n).padStart(3, "0")}`;
    const count = cfg.feed ? 2 : 6;
    const rows: DraftRow[] = Array.from({ length: count }, (_, i) => ({
      id: `${id}-${String(i + 1).padStart(2, "0")}`, vol: cfg.feed ? 500 : 12, conc: vials[0]?.concentration ?? 5,
      expiry: "2027-06-30", group: i % 3 === 2 ? "Control" : i % 2 === 0 ? "Treatment A" : "Treatment B",
      condition: "Good", received: true, usable: true, notes: "",
    }));
    update((d) => { d.shipments.push({ id, studyId, lot, shipDate: shipDate || TODAY, receiveDate: recvDate || TODAY, vialCount: count, usableCount: count, confirmed: false }); });
    setIntake(false);
    setReview({ shipmentId: id, readOnly: false, isNew: true, lot, rows });
  }

  // ── Review (expanded) ──
  if (review) {
    return (
      <>
        <div className="inv-infobar">
          <button className="inv-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} onClick={closeReview}><i className="ti ti-arrow-left"></i> Back to shipments</button>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>{review.shipmentId} — {review.lot}{review.readOnly ? " · Confirmed · view only" : ` · ${review.rows.length} ${cfg.itemNoun}s`}</span>
          {!review.readOnly && <span style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
            <button className="inv-btn-secondary" onClick={markAllUsable}><i className="ti ti-check"></i> Mark all usable</button>
            <button className="inv-btn-primary" onClick={confirmShipment}><i className="ti ti-circle-check"></i> Confirm shipment</button>
          </span>}
        </div>
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead><tr>
              <th>{cfg.idLabel}</th><th>Volume ({cfg.unit})</th><th>Conc. (%)</th><th>Expiry date</th><th>Treatment group</th><th>Condition</th><th>Received</th><th>Usable</th><th>Notes</th>
            </tr></thead>
            <tbody>
              {review.rows.map((row, i) => (
                <tr key={row.id}>
                  <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{row.id}</td>
                  <td><input className="inv-grid-input inv-mono" style={{ width: 70 }} type="number" step="0.1" value={row.vol} onChange={(e) => setRow(i, { vol: parseFloat(e.target.value) || 0 })} disabled={review.readOnly} /></td>
                  <td><input className="inv-grid-input inv-mono" style={{ width: 56 }} type="number" step="0.1" value={row.conc} onChange={(e) => setRow(i, { conc: parseFloat(e.target.value) || 0 })} disabled={review.readOnly} /></td>
                  <td><input className="inv-grid-input inv-mono" style={{ width: 100 }} value={row.expiry} onChange={(e) => setRow(i, { expiry: e.target.value })} disabled={review.readOnly} /></td>
                  <td><input className="inv-grid-input" style={{ width: 110 }} value={row.group} onChange={(e) => setRow(i, { group: e.target.value })} disabled={review.readOnly} /></td>
                  <td><input className="inv-grid-input" style={{ width: 110 }} value={row.condition} onChange={(e) => setRow(i, { condition: e.target.value })} disabled={review.readOnly} /></td>
                  <td><input type="checkbox" className="inv-check" checked={row.received} onChange={(e) => setRow(i, { received: e.target.checked })} disabled={review.readOnly} /></td>
                  <td><input type="checkbox" className="inv-check-green" checked={row.usable} onChange={(e) => setRow(i, { usable: e.target.checked })} disabled={review.readOnly} /></td>
                  <td><input className="inv-grid-input" style={{ width: 140 }} placeholder="Optional notes…" value={row.notes} onChange={(e) => setRow(i, { notes: e.target.value })} disabled={review.readOnly} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ── Shipments list ──
  return (
    <>
      {shipments.length === 0 ? (
        <div className="inv-empty">
          <div className="inv-empty-icon"><i className="ti ti-truck-delivery"></i></div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "var(--text-base)", fontWeight: "var(--weight-medium)" }}>No shipments yet</div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>Record your first shipment to start tracking inventory.</div>
          </div>
          {isAdmin && <button className="inv-btn-primary" onClick={() => setIntake(true)}><i className="ti ti-truck-delivery"></i> Receive first shipment</button>}
        </div>
      ) : (
        <>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead><tr>
                <th>Shipment ID</th><th>Lot</th><th>Ship date</th><th>Receive date</th><th>Total units</th><th>Usable</th><th>Quarantined</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {shipments.map((s) => {
                  const quarantined = s.vialCount - s.usableCount;
                  return (
                    <tr key={s.id} style={{ cursor: s.confirmed ? "default" : "pointer" }} onClick={s.confirmed ? undefined : () => openReview(s, false)}>
                      <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{s.id}</td>
                      <td className="inv-mono inv-muted">{s.lot}</td>
                      <td className="inv-mono inv-muted" style={{ fontSize: 11 }}>{s.shipDate}</td>
                      <td className="inv-mono inv-muted" style={{ fontSize: 11 }}>{s.receiveDate}</td>
                      <td className="inv-mono">{s.vialCount}</td>
                      <td className="inv-mono" style={{ color: "var(--green-600)" }}>{s.usableCount}</td>
                      <td className="inv-mono" style={{ color: quarantined > 0 ? "var(--amber-700)" : "var(--color-text-tertiary)" }}>{quarantined}</td>
                      <td>{s.confirmed
                        ? <span className="inv-badge inv-badge-available"><i className="ti ti-circle-check"></i> Confirmed</span>
                        : <span className="inv-badge inv-badge-pending"><i className="ti ti-clock"></i> Pending review</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                          {s.confirmed
                            ? <><button className="inv-btn-icon" title="View" onClick={() => openReview(s, true)}><i className="ti ti-eye"></i></button>
                                <button className="inv-btn-icon" title="Download CSV"><i className="ti ti-download"></i></button></>
                            : <button className="inv-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} onClick={() => openReview(s, false)}><i className="ti ti-pencil"></i> Log &amp; confirm</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inv-summary">
            <div>Shipments: <span className="inv-sv">{shipments.length}</span></div>
            <div>Total units: <span className="inv-sv">{shipments.reduce((s, sh) => s + sh.vialCount, 0)}</span></div>
            <div>Usable: <span className="inv-sv ok">{shipments.reduce((s, sh) => s + sh.usableCount, 0)}</span></div>
            {isAdmin && <button className="inv-btn-primary" style={{ marginLeft: "auto" }} onClick={() => setIntake(true)}><i className="ti ti-truck-delivery"></i> Receive shipment</button>}
          </div>
        </>
      )}

      {intake && (
        <div className="inv-modal-overlay" onClick={() => setIntake(false)}>
          <div className="inv-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-header">
              <div className="inv-sp-title">Receive shipment</div>
              <button className="inv-sp-close" onClick={() => setIntake(false)} aria-label="Close"><i className="ti ti-x"></i></button>
            </div>
            <div className="inv-modal-body">
              <div className="inv-form-row-2">
                <div className="inv-form-row"><span className="inv-label">Shipment date</span><input className="inv-input inv-mono" placeholder={TODAY} value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
                <div className="inv-form-row"><span className="inv-label">Receive date</span><input className="inv-input inv-mono" placeholder={TODAY} value={recvDate} onChange={(e) => setRecvDate(e.target.value)} /></div>
              </div>
              <div className="inv-upload" onClick={() => setCsvName(["manifest_LOT-IMP.csv", "shipment_intake.csv", "vials_2026.csv"][shipments.length % 3])}>
                <i className="ti ti-file-type-csv"></i>
                <div style={{ fontSize: "var(--text-sm)", color: csvName ? "var(--color-text-primary)" : "var(--color-text-placeholder)" }}>{csvName ?? "Drop CSV file here or click to upload"}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-placeholder)" }}>{cfg.idLabel.toLowerCase().replace(" ", "_")}, volume, concentration, expiry_date, treatment_group</div>
              </div>
            </div>
            <div className="inv-modal-footer">
              <button className="inv-btn-secondary" onClick={() => setIntake(false)}>Cancel</button>
              <button className="inv-btn-primary" onClick={importCSV} disabled={!csvName} style={{ opacity: csvName ? 1 : 0.4, cursor: csvName ? "pointer" : "not-allowed" }}><i className="ti ti-file-import"></i> Import CSV</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
