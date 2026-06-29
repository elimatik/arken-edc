"use client";

import { useMemo, useState } from "react";
import type { Vial } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { buildReconRows, canInv, totalDispensed, type InvConfig } from "@/lib/inventory-data";

type Confirm = "pending" | "confirmed" | "discrepancy";
interface ReconState { status: Confirm; notes: string }

// Tab 5 — reconciliation (ported from renderReconciliation). Confirm state is held
// in the view (UI-level coordinator overlay, not written back to the store).
export function ReconciliationTab({ cfg, vials, role }: { cfg: InvConfig; vials: Vial[]; role: Role }) {
  const canReconcile = canInv("reconcile", role);
  const rows = useMemo(() => buildReconRows(vials), [vials]);
  // Reconciliation is keyed by the stored treatment group, shown to ALL roles:
  //   CA-0801 → "Treatment A/B" (already-neutral labels; correct even for DM, since
  //             reconciliation is by group, not by individual-subject unblinding).
  //   BR-2502 → real T01/T02/T03 (open-label — no blinding anywhere).
  // PH-2401 feed: estimated consumed kg per group (delivered − weighback; no weighback
  // tracked yet, so estimate = total delivered) replaces the "Returned" column.
  const consumedKg = useMemo(() => {
    const m: Record<string, number> = {};
    for (const v of vials) { const g = v.treatmentGroup || "Unknown"; m[g] = (m[g] ?? 0) + totalDispensed(v); }
    return m;
  }, [vials]);
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
        <span>Accountability % = (dispensed + returned + destroyed) ÷ received × 100. Balanced at ≥ 99.5%.</span>
        {canReconcile && <button className="inv-btn-primary" style={{ marginLeft: "auto" }} onClick={acceptAllBalanced}><i className="ti ti-check"></i> Accept all balanced</button>}
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>
            <th>Treatment group</th><th># Received</th><th># Usable</th><th># Removed</th>
            <th># {cfg.feed ? "Delivered" : "Dispensed"}</th><th>{cfg.feed ? "Consumed (est.)" : "# Returned"}</th><th>Accountability %</th><th>Auto status</th><th>Confirmation</th><th>Notes</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const st = get(r.group);
              const statusBadge = r.status === "Balanced" ? "inv-badge-available" : r.status === "Outstanding" ? "inv-badge-amber" : "inv-badge-unusable";
              return (
                <tr key={r.group}>
                  <td style={{ fontWeight: "var(--weight-medium)" }}>{r.group}</td>
                  <td className="inv-mono">{r.received}</td>
                  <td className="inv-mono">{r.usable}</td>
                  <td className="inv-mono" style={{ color: r.removed > 0 ? "var(--amber-700)" : "var(--color-text-secondary)" }}>{r.removed}</td>
                  <td className="inv-mono">{r.dispensed}</td>
                  <td className="inv-mono">{cfg.feed ? `${Math.round((consumedKg[r.group] ?? 0) * 10) / 10} kg` : r.returned}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <span className="inv-mono" style={{ fontWeight: "var(--weight-medium)", color: r.accounted ? "var(--green-600)" : "var(--amber-700)", marginRight: 6 }}>{r.accountabilityPct}%</span>
                    <span className={`inv-badge ${r.accounted ? "inv-badge-available" : "inv-badge-amber"}`}>{r.accounted ? "Balanced" : "Outstanding"}</span>
                  </td>
                  <td><span className={`inv-badge ${statusBadge}`}>{r.status}</span></td>
                  <td>
                    {canReconcile ? (
                      <select className="inv-recon-select" value={st.status} onChange={(e) => set(r.group, { status: e.target.value as Confirm })}>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed ✓</option>
                        <option value="discrepancy">Flag discrepancy</option>
                      </select>
                    ) : <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", textTransform: "capitalize" }}>{st.status}</span>}
                  </td>
                  <td><input className="inv-recon-note" placeholder="Notes…" value={st.notes} onChange={(e) => set(r.group, { notes: e.target.value })} disabled={!canReconcile} /></td>
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
