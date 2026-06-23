"use client";

import { useMemo, useState } from "react";
import type { Vial } from "@/lib/session-store/types";
import { buildReconRows, type InvConfig } from "@/lib/inventory-data";

type Confirm = "pending" | "confirmed" | "discrepancy";
interface ReconState { status: Confirm; notes: string }

// Tab 5 — reconciliation (ported from renderReconciliation). Confirm state is held
// in the view (UI-level coordinator overlay, not written back to the store).
export function ReconciliationTab({ cfg, vials }: { cfg: InvConfig; vials: Vial[] }) {
  const rows = useMemo(() => buildReconRows(vials), [vials]);
  const [state, setState] = useState<Record<string, ReconState>>({});

  const get = (g: string): ReconState => state[g] ?? { status: "pending", notes: "" };
  const set = (g: string, patch: Partial<ReconState>) => setState((s) => ({ ...s, [g]: { ...get(g), ...patch } }));
  const acceptAllBalanced = () => setState((s) => {
    const next = { ...s };
    rows.filter((r) => r.balanced).forEach((r) => { next[r.group] = { status: "confirmed", notes: next[r.group]?.notes ?? "" }; });
    return next;
  });

  const confirmed = rows.filter((r) => get(r.group).status === "confirmed").length;

  return (
    <>
      <div className="inv-infobar">
        <span>Auto-calculated status vs coordinator-confirmed · Variance = received − returned − removed</span>
        <button className="inv-btn-primary" style={{ marginLeft: "auto" }} onClick={acceptAllBalanced}><i className="ti ti-check"></i> Accept all balanced</button>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>
            <th>Treatment group</th><th># Received</th><th># Usable</th><th># Removed</th>
            <th># {cfg.feed ? "Delivered" : "Dispensed"}</th><th># Returned</th><th>Variance</th><th>Auto status</th><th>Confirmation</th><th>Notes</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = get(r.group);
              const varColor = r.balanced ? "var(--green-600)" : r.variance > 0 ? "var(--amber-700)" : "var(--red-600)";
              const badge = r.balanced ? "inv-badge-available" : r.variance > 0 ? "inv-badge-removed" : "inv-badge-unusable";
              return (
                <tr key={r.group}>
                  <td style={{ fontWeight: "var(--weight-medium)" }}>{r.group}</td>
                  <td className="inv-mono">{r.received}</td>
                  <td className="inv-mono">{r.usable}</td>
                  <td className="inv-mono" style={{ color: r.removed > 0 ? "var(--amber-700)" : "var(--color-text-secondary)" }}>{r.removed}</td>
                  <td className="inv-mono">{r.dispensed}</td>
                  <td className="inv-mono">{r.returned}</td>
                  <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)", color: varColor }}>{r.balanced ? "✓ 0" : `${r.variance > 0 ? "⚠ +" : "⚠ "}${r.variance}`}</td>
                  <td><span className={`inv-badge ${badge}`}>{r.status}</span></td>
                  <td>
                    <select className="inv-recon-select" value={st.status} onChange={(e) => set(r.group, { status: e.target.value as Confirm })}>
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed ✓</option>
                      <option value="discrepancy">Flag discrepancy</option>
                    </select>
                  </td>
                  <td><input className="inv-recon-note" placeholder="Notes…" value={st.notes} onChange={(e) => set(r.group, { notes: e.target.value })} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Groups: <span className="inv-sv">{rows.length}</span></div>
        <div>Confirmed: <span className="inv-sv ok">{confirmed}</span></div>
        <div style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>Last reconciled: 2026-05-30</div>
      </div>
    </>
  );
}
