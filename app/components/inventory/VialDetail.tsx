"use client";

import type { Vial, VialEventType } from "@/lib/session-store/types";
import { currentVol, totalDispensed, vialUses, vialDisplayId, STATUS_LABELS, STATUS_BADGE, type InvConfig } from "@/lib/inventory-data";

const TL_COLOR: Record<VialEventType, string> = { received: "var(--blue-600)", dispense: "var(--red-600)", return: "var(--green-600)", removed: "var(--amber-700)", returned: "var(--purple-700)" };
const TL_ICON: Record<VialEventType, string> = { received: "ti-package", dispense: "ti-droplet", return: "ti-refresh", removed: "ti-x", returned: "ti-truck-delivery" };
const TL_TITLE: Record<VialEventType, string> = { received: "Received", dispense: "Dispensed", return: "Returned", removed: "Removed from inventory", returned: "Returned to sponsor" };

// Vial lifecycle — slide-in panel (480px). Opened by clicking a vial row; closed
// by the × (no tab switching). Timeline ported from the original Tab 4.
export function VialDetail({ cfg, hideArms, vial, onClose }: {
  cfg: InvConfig;
  hideArms: boolean;
  vial: Vial;
  onClose: () => void;
}) {
  const cv = currentVol(vial);
  const pct = vial.initialVol ? Math.round((cv / vial.initialVol) * 100) : 0;
  const volColor = pct > 50 ? "var(--green-600)" : pct > 20 ? "var(--amber-700)" : "var(--red-600)";
  const id = vialDisplayId(vial, hideArms);

  let runVol = vial.initialVol;

  return (
    <div className="inv-panel-overlay" onClick={onClose}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-sp-header">
          <div>
            <div className="inv-sp-title">{cfg.itemNounCap} {id}</div>
            <div className="inv-sp-meta">{vial.lotId} · {vial.concentration}% · {vial.initialVol} {vial.unit} initial{!hideArms ? ` · ${vial.treatmentGroup}` : ""}</div>
          </div>
          <button className="inv-sp-close" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>

        <div className="inv-sp-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
            <div className="inv-kpi-card" style={{ cursor: "default" }}><div className="inv-kpi-label">Current volume</div>
              <div className="inv-kpi-value" style={{ color: volColor }}>{cv} {vial.unit}</div>
              <div className="inv-kpi-sub">{pct}% of initial</div></div>
            <div className="inv-kpi-card" style={{ cursor: "default" }}><div className="inv-kpi-label">Total {cfg.feed ? "delivered" : "dispensed"}</div>
              <div className="inv-kpi-value">{totalDispensed(vial)} {vial.unit}</div>
              <div className="inv-kpi-sub">across {vialUses(vial)} {vialUses(vial) === 1 ? "use" : "uses"}</div></div>
            <div className="inv-kpi-card" style={{ cursor: "default" }}><div className="inv-kpi-label">Status</div>
              <div style={{ marginTop: 4 }}><span className={`inv-badge ${STATUS_BADGE[vial.status]}`}>{STATUS_LABELS[vial.status] ?? vial.status}</span></div></div>
            <div className="inv-kpi-card" style={{ cursor: "default" }}><div className="inv-kpi-label">Lot</div>
              <div className="inv-kpi-value inv-mono" style={{ fontSize: 16 }}>{vial.lotId}</div>
              <div className="inv-kpi-sub">{vial.concentration}% concentration</div></div>
          </div>

          <div className="inv-section-title" style={{ marginTop: "var(--space-3)" }}>Lifecycle timeline</div>
          <div className="inv-timeline">
            {vial.events.map((e, i) => {
              let detail = "";
              let chips: React.ReactNode = null;
              if (e.type === "received") {
                detail = e.note ?? "";
                chips = <span className="inv-chip inv-badge-available">Initial: {vial.initialVol} {vial.unit}</span>;
              } else if (e.type === "dispense") {
                runVol -= e.volDispensed ?? 0;
                detail = `${e.subject ?? "—"} · ${e.visit ?? "—"} · ${e.route ?? ""}${e.location === "home" ? " · sent home" : ""}${e.by ? ` · ${e.by}` : ""}`;
                chips = <>
                  <span className="inv-chip inv-badge-removed">−{e.volDispensed} {vial.unit}</span>
                  <span className="inv-chip inv-badge-available">{Math.round(runVol * 10) / 10} {vial.unit} remaining</span>
                </>;
              } else if (e.type === "return") {
                runVol = e.volReturned ?? 0;
                detail = `Condition: ${e.condition ?? "—"}`;
                chips = (e.volReturned ?? 0) > 0
                  ? <span className="inv-chip inv-badge-available">{e.volReturned} {vial.unit} confirmed remaining</span>
                  : <span className="inv-chip inv-badge-depleted">0 {vial.unit} — fully depleted</span>;
              } else {
                detail = e.note ?? "";
              }
              const isLast = i === vial.events.length - 1;
              return (
                <div key={i} className="inv-tl-event">
                  <div className="inv-tl-line">
                    <div className="inv-tl-dot" style={{ background: TL_COLOR[e.type], borderColor: TL_COLOR[e.type] }} />
                    {!isLast && <div className="inv-tl-connector" />}
                  </div>
                  <div className="inv-tl-content">
                    <div className="inv-tl-date">{e.date}</div>
                    <div className="inv-tl-eventtitle"><i className={`ti ${TL_ICON[e.type]}`}></i>{TL_TITLE[e.type]}</div>
                    {detail && <div className="inv-tl-detail">{detail}</div>}
                    {chips && <div className="inv-tl-chips">{chips}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
