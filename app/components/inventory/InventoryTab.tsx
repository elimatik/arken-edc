"use client";

import { useMemo, useState } from "react";
import type { Vial } from "@/lib/session-store/types";
import {
  currentVol, vialUses, volFill, expiryColor, vialDisplayId, STATUS_LABELS, STATUS_BADGE,
  type InvConfig,
} from "@/lib/inventory-data";

const KPI_META: { key: string; label: string; color: string; sub: string }[] = [
  { key: "available", label: "Available", color: "var(--green-600)", sub: "ready to dispense" },
  { key: "athome", label: "At home", color: "var(--blue-600)", sub: "with subject" },
  { key: "depleted", label: "Depleted", color: "var(--slate-600)", sub: "fully used" },
  { key: "removed", label: "Removed", color: "var(--amber-700)", sub: "quarantined / lost" },
  { key: "returned", label: "Returned", color: "var(--blue-600)", sub: "to sponsor" },
];

// Tab 1 — vial/batch list (ported from renderInventory + KPI cards).
export function InventoryTab({ cfg, hideArms, vials, openDetail }: {
  cfg: InvConfig;
  hideArms: boolean;
  vials: Vial[];
  openDetail: (vialId: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [group, setGroup] = useState("");
  const [lot, setLot] = useState("");
  const [search, setSearch] = useState("");

  const lots = useMemo(() => Array.from(new Set(vials.map((v) => v.lotId))).sort(), [vials]);
  const groups = useMemo(() => Array.from(new Set(vials.map((v) => v.treatmentGroup).filter(Boolean))).sort(), [vials]);

  const rows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return vials.filter((v) => {
      if (status && v.status !== status) return false;
      if (group && v.treatmentGroup !== group) return false;
      if (lot && v.lotId !== lot) return false;
      if (q && !v.id.toLowerCase().includes(q) && !v.lotId.toLowerCase().includes(q) && !(v.kitNumber ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [vials, status, group, lot, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { available: 0, athome: 0, depleted: 0, removed: 0, returned: 0 };
    vials.forEach((v) => { c[v.status] = (c[v.status] ?? 0) + 1; });
    return c;
  }, [vials]);
  const volAvail = useMemo(() => Math.round(vials.filter((v) => v.status === "available").reduce((s, v) => s + currentVol(v), 0) * 10) / 10, [vials]);
  const drug = vials[0]?.drugName ?? "—";

  return (
    <>
      <div className="inv-kpi-row">
        {KPI_META.map((k) => {
          const active = status === k.key;
          const sub = k.key === "available" ? `${volAvail} ${cfg.unit} total` : k.sub;
          return (
            <button key={k.key} className={`inv-kpi-card${active ? " active" : ""}`} style={{ color: active ? k.color : undefined }} onClick={() => setStatus(active ? "" : k.key)}>
              <div className="inv-kpi-label">{k.label}{active && <span className="inv-kpi-clear"> (clear)</span>}</div>
              <div className="inv-kpi-value" style={{ color: k.color }}>{counts[k.key] ?? 0}</div>
              <div className="inv-kpi-sub">{sub}</div>
            </button>
          );
        })}
      </div>

      <div className="inv-filter-bar">
        <input className="inv-search" type="search" placeholder={`Search ${cfg.itemNoun} ID or lot…`} value={search} onChange={(e) => setSearch(e.target.value)} />
        {!hideArms && (
          <select className="inv-select" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All treatment groups</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <select className="inv-select" value={lot} onChange={(e) => setLot(e.target.value)}>
          <option value="">All lots</option>
          {lots.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <span className="inv-count" style={{ marginLeft: "auto" }}>{rows.length} {cfg.itemNoun}s</span>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>
            <th>{cfg.idLabel}</th><th>Lot</th>{!hideArms && <th>Treatment group</th>}
            <th>Initial vol.</th><th>Conc.</th><th>Current vol.</th><th>Uses</th><th>Expiry date</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>
            {rows.map((v) => {
              const cv = currentVol(v);
              const fill = volFill(cv, v.initialVol, v.status);
              const uc = vialUses(v);
              return (
                <tr key={v.id} className="clickable" onClick={() => openDetail(v.id)}>
                  <td><span className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{vialDisplayId(v, hideArms)}</span></td>
                  <td><span className="inv-mono inv-muted">{v.lotId}</span></td>
                  {!hideArms && <td><span className="inv-muted">{v.treatmentGroup || "—"}</span></td>}
                  <td><span className="inv-mono">{v.initialVol} {v.unit}</span></td>
                  <td><span className="inv-mono">{v.concentration}%</span></td>
                  <td>
                    <div className="inv-vol-wrap">
                      <div className="inv-vol-track"><div className="inv-vol-fill" style={{ width: `${fill.pct}%`, background: fill.color }} /></div>
                      <span className="inv-vol-label">{cv} / {v.initialVol} {v.unit}</span>
                    </div>
                  </td>
                  <td><span className="inv-mono">{uc > 0 ? `${uc}×` : "—"}</span></td>
                  <td><span className="inv-mono" style={{ fontSize: 11, color: expiryColor(v.expiryDate) }}>{v.expiryDate || "—"}</span></td>
                  <td><span className={`inv-badge ${STATUS_BADGE[v.status]}`}>{STATUS_LABELS[v.status] ?? v.status}</span></td>
                  <td><div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button className="inv-btn-icon" title="View lifecycle" onClick={(e) => { e.stopPropagation(); openDetail(v.id); }}><i className="ti ti-timeline"></i></button>
                  </div></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={hideArms ? 9 : 10} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No {cfg.itemNoun}s match the current filters.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Total {cfg.itemNoun}s: <span className="inv-sv">{vials.length}</span></div>
        <div>Vol. available: <span className="inv-sv ok">{volAvail} {cfg.unit}</span></div>
        <div style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>{hideArms ? "Blinded — kit-level tracking" : `Drug: ${drug}`}</div>
      </div>
    </>
  );
}
