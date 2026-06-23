"use client";

import { useEffect, useState } from "react";
import type { Dataset, Shipment, Vial } from "@/lib/session-store/types";
import { type InvConfig } from "@/lib/inventory-data";

const TODAY = new Date().toISOString().slice(0, 10);

interface DraftRow { id: string; vol: number; conc: number; expiry: string; group: string; condition: string; received: boolean; usable: boolean; notes: string }
type Review = { shipmentId: string; readOnly: boolean; isNew: boolean; rows: DraftRow[]; lot: string };

// Tab — receive shipment. The intake modal is driven from the page header (Admin
// only); CRC/CRA/DM see the list read-only.
export function ReceiveTab({ cfg, studyId, shipments, vials, isAdmin, update, intakeOpen, setIntakeOpen }: {
  cfg: InvConfig;
  studyId: string;
  shipments: Shipment[];
  vials: Vial[];
  isAdmin: boolean;
  update: (m: (d: Dataset) => void) => void;
  intakeOpen: boolean;
  setIntakeOpen: (v: boolean) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [shipDate, setShipDate] = useState("");
  const [recvDate, setRecvDate] = useState("");
  const [csvName, setCsvName] = useState<string | null>(null);

  useEffect(() => { if (intakeOpen) { setShipDate(""); setRecvDate(""); setCsvName(null); } }, [intakeOpen]);

  // Pending review starts every checkbox UNCHECKED (the reviewer must confirm each
  // unit); the read-only confirmed view shows the real received/usable state.
  function draftsFromLot(lot: string, readOnly: boolean): DraftRow[] {
    return vials.filter((v) => lot.includes(v.lotId) || v.lotId === lot).map((v) => {
      const recEvent = v.events.find((e) => e.type === "received");
      return {
        id: v.id, vol: v.initialVol, conc: v.concentration, expiry: v.expiryDate, group: v.treatmentGroup,
        condition: recEvent?.note ?? (v.status === "removed" ? "Quarantine" : "Good"),
        received: readOnly ? v.status !== "removed" || v.events.some((e) => e.type === "received") : false,
        usable: readOnly ? v.status !== "removed" : false,
        notes: "",
      };
    });
  }

  function openReview(s: Shipment, readOnly: boolean) {
    setReview({ shipmentId: s.id, readOnly, isNew: false, lot: s.lot, rows: draftsFromLot(s.lot, readOnly) });
  }
  function closeReview() { setReview(null); }
  function setRow(i: number, patch: Partial<DraftRow>) {
    setReview((r) => r ? { ...r, rows: r.rows.map((row, j) => (j === i ? { ...row, ...patch } : row)) } : r);
  }
  function markAllUsable() { setReview((r) => r ? { ...r, rows: r.rows.map((row) => ({ ...row, received: true, usable: true })) } : r); }

  function confirmShipment() {
    if (!review) return;
    const usable = review.rows.filter((r) => r.received && r.usable).length;
    update((d) => {
      const s = d.shipments.find((x) => x.id === review.shipmentId);
      if (s) { s.confirmed = true; s.usableCount = usable; }
      for (const row of review.rows) {
        const note = `${row.condition}${row.notes ? ` — ${row.notes}` : ""}`;
        if (review.isNew) {
          if (!row.received) continue; // not received → not added (missing)
          if (d.vials.some((v) => v.id === row.id)) continue;
          d.vials.push({
            id: row.id, studyId, lotId: review.lot, drugName: vials[0]?.drugName ?? "—", treatmentGroup: row.group,
            initialVol: row.vol, concentration: row.conc, unit: cfg.unit, expiryDate: row.expiry, receivedDate: recvDate || TODAY,
            status: row.usable ? "available" : "removed", siteId: null,
            events: [{ type: "received", date: recvDate || TODAY, note }, ...(row.usable ? [] : [{ type: "removed" as const, date: recvDate || TODAY, note: row.notes || "Not usable on receipt" }])],
          });
        } else {
          const v = d.vials.find((x) => x.id === row.id);
          if (!v) continue;
          const rec = v.events.find((e) => e.type === "received");
          if (rec) rec.note = note;
          if (row.received && !row.usable && v.status !== "removed") { v.status = "removed"; v.events.push({ type: "removed", date: recvDate || TODAY, note: row.notes || "Failed inspection on receipt" }); }
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
      condition: "Good", received: false, usable: false, notes: "",
    }));
    update((d) => { d.shipments.push({ id, studyId, lot, shipDate: shipDate || TODAY, receiveDate: recvDate || TODAY, vialCount: count, usableCount: 0, confirmed: false }); });
    setIntakeOpen(false);
    setReview({ shipmentId: id, readOnly: false, isNew: true, lot, rows });
  }

  // ── Confirmed shipment — read-only plain-text view (no form styling) ──
  if (review?.readOnly) {
    return (
      <>
        <div className="inv-infobar">
          <button className="inv-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} onClick={closeReview}><i className="ti ti-arrow-left"></i> Back</button>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>{review.shipmentId} — {review.lot} · Confirmed · view only</span>
        </div>
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead><tr>
              <th>{cfg.idLabel}</th><th>Vol ({cfg.unit})</th><th>Conc (%)</th><th>Expiry</th><th>Group</th><th>Condition</th><th>Notes</th><th>Usable</th>
            </tr></thead>
            <tbody>
              {review.rows.map((row) => (
                <tr key={row.id}>
                  <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{row.id}</td>
                  <td className="inv-mono">{row.vol}</td>
                  <td className="inv-mono">{row.conc}</td>
                  <td className="inv-mono" style={{ fontSize: 11 }}>{row.expiry}</td>
                  <td>{row.group}</td>
                  <td>{row.condition || "—"}</td>
                  <td className="inv-muted">{row.notes || "—"}</td>
                  <td>{row.usable ? <span style={{ color: "var(--green-600)" }}>Yes</span> : <span style={{ color: "var(--amber-700)" }}>No</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // ── Pending shipment — editable review grid ──
  if (review) {
    return (
      <>
        <div className="inv-infobar">
          <button className="inv-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} onClick={closeReview}><i className="ti ti-arrow-left"></i> Back to shipments</button>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-medium)" }}>{review.shipmentId} — {review.lot} · {review.rows.length} {cfg.itemNoun}s</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
            <button className="inv-btn-secondary" onClick={markAllUsable}><i className="ti ti-check"></i> Mark all usable</button>
            <button className="inv-btn-primary" onClick={confirmShipment}><i className="ti ti-circle-check"></i> Confirm shipment</button>
          </span>
        </div>
        <div className="inv-table-wrap">
          <table className="inv-table">
            <thead><tr>
              <th>{cfg.idLabel}</th><th>Volume ({cfg.unit})</th><th>Conc. (%)</th><th>Expiry date</th><th>Treatment group</th><th>Condition</th><th>Notes</th><th>Received</th><th>Usable</th>
            </tr></thead>
            <tbody>
              {review.rows.map((row, i) => (
                <tr key={row.id}>
                  <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{row.id}</td>
                  <td><input className="inv-grid-input inv-mono" style={{ width: 70 }} type="number" step="0.1" value={row.vol} onChange={(e) => setRow(i, { vol: parseFloat(e.target.value) || 0 })} /></td>
                  <td><input className="inv-grid-input inv-mono" style={{ width: 56 }} type="number" step="0.1" value={row.conc} onChange={(e) => setRow(i, { conc: parseFloat(e.target.value) || 0 })} /></td>
                  <td><input className="inv-grid-input inv-mono" style={{ width: 110 }} type="date" value={row.expiry} onChange={(e) => setRow(i, { expiry: e.target.value })} /></td>
                  <td>
                    <select className="inv-grid-input" style={{ width: 120 }} value={row.group} onChange={(e) => setRow(i, { group: e.target.value })}>
                      {[row.group, "Treatment A", "Treatment B", "Control"].filter((g, idx, a) => a.indexOf(g) === idx).map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td><input className="inv-grid-input" style={{ width: 110 }} value={row.condition} onChange={(e) => setRow(i, { condition: e.target.value })} placeholder="Good" /></td>
                  <td><input className="inv-grid-input" style={{ width: 140 }} value={row.notes} onChange={(e) => setRow(i, { notes: e.target.value })} placeholder="Optional notes…" /></td>
                  <td><input type="checkbox" className="inv-check" checked={row.received} onChange={(e) => setRow(i, { received: e.target.checked })} /></td>
                  <td><input type="checkbox" className="inv-check-green" checked={row.usable} disabled={!row.received} onChange={(e) => setRow(i, { usable: e.target.checked })} /></td>
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
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>{isAdmin ? "Use “Receive shipment” in the header to record your first shipment." : "No shipments have been recorded for this study."}</div>
          </div>
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
                  const canReview = isAdmin && !s.confirmed;
                  return (
                    <tr key={s.id} style={{ cursor: canReview ? "pointer" : "default" }} onClick={canReview ? () => openReview(s, false) : undefined}>
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
                            : isAdmin
                              ? <button className="inv-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} onClick={() => openReview(s, false)}><i className="ti ti-pencil"></i> Log &amp; confirm</button>
                              : <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Awaiting confirmation</span>}
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
          </div>
        </>
      )}

      {intakeOpen && (
        <div className="inv-modal-overlay" onClick={() => setIntakeOpen(false)}>
          <div className="inv-modal wide" onClick={(e) => e.stopPropagation()}>
            <div className="inv-modal-header">
              <div className="inv-sp-title">Receive shipment</div>
              <button className="inv-sp-close" onClick={() => setIntakeOpen(false)} aria-label="Close"><i className="ti ti-x"></i></button>
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
              <button className="inv-btn-secondary" onClick={() => setIntakeOpen(false)}>Cancel</button>
              <button className="inv-btn-primary" onClick={importCSV} disabled={!csvName} style={{ opacity: csvName ? 1 : 0.4, cursor: csvName ? "pointer" : "not-allowed" }}><i className="ti ti-file-import"></i> Import CSV</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
