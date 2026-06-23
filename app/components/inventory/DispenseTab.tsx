"use client";

import { useMemo } from "react";
import type { Vial } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { buildDispenseRows, canInv, type DispenseRow, type InvConfig } from "@/lib/inventory-data";

// Tab — dispensing log (read-only derived data; records come from Treatment Admin
// forms). Returning a unit is the only manual action here (CRC/CRA/Admin).
export function DispenseTab({ cfg, vials, role, siteOf, onReturn }: {
  cfg: InvConfig;
  vials: Vial[];
  role: Role;
  siteOf: (subjectCode: string) => string;
  onReturn: (row: DispenseRow, readOnly: boolean) => void;
}) {
  const rows = useMemo(() => buildDispenseRows(vials), [vials]);
  const pending = rows.filter((r) => !r.returned).length;
  const dispNoun = cfg.feed ? "deliveries" : "dispenses";
  const canReturn = canInv("return", role);

  return (
    <>
      <div className="inv-infobar">
        <span>{cfg.feed ? "Feed deliveries to pens" : "Dispensing records derived from Treatment Admin forms"}{cfg.tracksReturns ? " · Click the ↻ icon on any row to log a return" : ""}</span>
        <span className="inv-count">{rows.length} records{cfg.tracksReturns ? ` · ${pending} pending return` : ""}</span>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>
            <th>{cfg.idLabel}</th><th>{cfg.feed ? "Pen" : "Subject"}</th><th>Site</th><th>Visit</th><th>Date</th>
            <th>{cfg.feed ? "Delivered" : "Dispensed"}</th><th>Remaining after</th><th>Location</th>
            {cfg.tracksReturns && <th></th>}
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{r.vialId}</td>
                <td className="inv-mono">{r.subject}</td>
                <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{siteOf(r.subject)}</td>
                <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.visit}</td>
                <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.date}</td>
                <td className="inv-mono" style={{ color: "var(--red-600)" }}>−{r.volDispensed} {cfg.unit}</td>
                <td className="inv-mono">{r.volAfterDisp} {cfg.unit}</td>
                <td>{locationCell(r)}</td>
                {cfg.tracksReturns && (
                  <td style={{ textAlign: "right" }}>
                    {r.returned
                      ? <button className="inv-btn-icon" title="View return" onClick={() => onReturn(r, true)}><i className="ti ti-eye"></i></button>
                      : canReturn
                        ? <button className="inv-btn-icon" title="Log return" onClick={() => onReturn(r, false)}><i className="ti ti-refresh"></i></button>
                        : <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>—</span>}
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No {dispNoun} recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Total {dispNoun}: <span className="inv-sv">{rows.length}</span></div>
        {cfg.tracksReturns && <>
          <div>Pending return: <span className="inv-sv warn">{pending}</span></div>
          <div>Returned: <span className="inv-sv ok">{rows.length - pending}</span></div>
        </>}
      </div>
    </>
  );
}

function locationCell(r: DispenseRow) {
  if (r.location === "home") return <span className="inv-badge inv-badge-athome"><i className="ti ti-home"></i> Home</span>;
  if (r.location === "farm") return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Farm</span>;
  return <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Clinic</span>;
}
