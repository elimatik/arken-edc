"use client";

import { useMemo } from "react";
import type { Vial } from "@/lib/session-store/types";
import { buildDispenseRows, type DispenseRow, type InvConfig } from "@/lib/inventory-data";

const DISC_COLOR = { green: "var(--green-600)", amber: "var(--amber-700)", red: "var(--red-600)" } as const;
const DISC_BADGE = { green: "inv-badge-available", amber: "inv-badge-removed", red: "inv-badge-unusable" } as const;

// Tab 3 — dispensing log (ported from renderDispenseLog). Adds CA-0801 volume
// accountability and BR-2502 withdrawal chips per row.
export function DispenseTab({ cfg, vials, canDispense, onReturn, onNewDispense }: {
  cfg: InvConfig;
  vials: Vial[];
  canDispense: boolean;
  onReturn: (row: DispenseRow, readOnly: boolean) => void;
  onNewDispense: () => void;
}) {
  const rows = useMemo(() => buildDispenseRows(vials), [vials]);
  const pending = rows.filter((r) => !r.returned).length;
  const dispNoun = cfg.feed ? "deliveries" : "dispenses";

  return (
    <>
      <div className="inv-infobar">
        <span>{cfg.feed ? "Feed deliveries to pens" : "Dispensing records pulled from subject forms"}{cfg.tracksReturns ? " · Click the ↻ icon on any row to log a return" : ""}</span>
        <span className="inv-count">{rows.length} records{cfg.tracksReturns ? ` · ${pending} pending return` : ""}</span>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>
            <th>{cfg.idLabel}</th><th>{cfg.feed ? "Pen" : "Subject"}</th><th>Visit</th><th>Date</th>
            <th>{cfg.feed ? "Delivered" : "Dispensed"}</th><th>Remaining after</th><th>Location</th>
            {cfg.accountability && <th>Volume accountability</th>}
            {cfg.withdrawal && <th>Withdrawal</th>}
            {cfg.tracksReturns && <><th>Status</th><th>Return date</th><th></th></>}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{r.vialId}</td>
                <td className="inv-mono">{r.subject}</td>
                <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.visit}</td>
                <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.date}</td>
                <td className="inv-mono" style={{ color: "var(--red-600)" }}>−{r.volDispensed} {cfg.unit}</td>
                <td className="inv-mono">{r.volAfterDisp} {cfg.unit}</td>
                <td>{locationCell(r)}</td>
                {cfg.accountability && <td>{discrepancyCell(r)}</td>}
                {cfg.withdrawal && <td>{withdrawalCell(r)}</td>}
                {cfg.tracksReturns && <>
                  <td>{statusCell(r)}</td>
                  <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.returned ? r.retDate ?? "—" : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="inv-btn-icon" title={r.returned ? "View return" : "Log return"} onClick={() => onReturn(r, r.returned)}>
                      <i className={`ti ti-${r.returned ? "eye" : "refresh"}`}></i>
                    </button>
                  </td>
                </>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No {dispNoun} recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Total {dispNoun}: <span className="inv-sv">{rows.length}</span></div>
        {cfg.tracksReturns && <>
          <div>Pending return: <span className="inv-sv warn">{pending}</span></div>
          <div>Returned: <span className="inv-sv ok">{rows.length - pending}</span></div>
        </>}
        {canDispense && (
          <button className="inv-btn-primary" style={{ marginLeft: "auto" }} onClick={onNewDispense}>
            <i className="ti ti-plus"></i> New {cfg.feed ? "delivery" : "dispensing"}
          </button>
        )}
      </div>
    </>
  );
}

function locationCell(r: DispenseRow) {
  if (r.location === "home") return <span className="inv-badge inv-badge-athome"><i className="ti ti-home"></i> Home</span>;
  if (r.location === "farm") return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Farm</span>;
  return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Clinic</span>;
}

function statusCell(r: DispenseRow) {
  const s = r.vial.status;
  if (r.returned && s === "returned") return <span className="inv-badge inv-badge-returned"><i className="ti ti-check"></i> Returned to sponsor</span>;
  if (r.returned) return <span className="inv-badge inv-badge-available"><i className="ti ti-check"></i> Back in storage</span>;
  if (s === "removed") return <span className="inv-badge inv-badge-unusable"><i className="ti ti-x"></i> Removed</span>;
  if (r.location === "home") return <span className="inv-badge inv-badge-athome"><i className="ti ti-home"></i> At home</span>;
  return <span className="inv-badge inv-badge-muted">Pending return</span>;
}

function discrepancyCell(r: DispenseRow) {
  const d = r.discrepancy;
  if (!d) return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>—</span>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className={`inv-badge ${DISC_BADGE[d.level]}`} style={{ width: "fit-content" }}>{d.diff >= 0 ? "+" : ""}{d.diff} {r.vial.unit} · {d.pct >= 0 ? "+" : ""}{d.pct}%</span>
      <span style={{ fontSize: 10, color: DISC_COLOR[d.level] }}>{d.label} (exp. {d.expected} {r.vial.unit})</span>
    </div>
  );
}

function withdrawalCell(r: DispenseRow) {
  const w = r.withdrawal;
  if (!w) return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>—</span>;
  return w.active
    ? <span className="inv-badge inv-badge-removed" title={`Withdrawal ends ${w.endDate}`}><i className="ti ti-clock"></i> Active withdrawal — ends {w.endDate}</span>
    : <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Cleared {w.endDate}</span>;
}
