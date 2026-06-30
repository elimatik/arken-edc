"use client";

// Inventory — drug-supply tracking (ported from 24-inventory.html). CRC / CRA / DM
// roles with View permission (CRC/CRA/PI/DM/Admin); Sponsor redirects. Tabs: Shipments (default),
// Inventory, Dispense log, Reconciliation. The vial lifecycle and per-unit edit
// open as right-hand slide-in panels (no separate tab).
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { shouldHideArms } from "@/lib/study-config";
import {
  invConfig, studyVials, studyShipments, vialsForSite, buildDispenseRows, buildReconRows, canInv,
} from "@/lib/inventory-data";
import { InventoryTab } from "@/components/inventory/InventoryTab";
import { ReceiveTab } from "@/components/inventory/ReceiveTab";
import { DispenseTab } from "@/components/inventory/DispenseTab";
import { VialDetail } from "@/components/inventory/VialDetail";
import { VialEditPanel } from "@/components/inventory/VialEditPanel";
import { ReconciliationTab } from "@/components/inventory/ReconciliationTab";
import "@/components/inventory/inventory.css";

type Tab = "receive" | "inventory" | "dispense" | "recon";

export default function InventoryPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { study, sites, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  // Access is driven by the live permission matrix (Settings → Inventory): any role
  // with "View stock levels" may open the module (CRC/CRA/PI/DM/Admin by default).
  const allowed = canInv("view", activeRole);
  useEffect(() => { if (ready && !allowed) router.replace(`/study/${studyId}`); }, [ready, allowed, router, studyId]);

  const [tab, setTab] = useState<Tab>("receive");
  const [detailVialId, setDetailVialId] = useState<string | null>(null);
  const [editVialId, setEditVialId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  // Module-level site selector (replaces the retired topbar dropdown). Persists
  // across tabs; resets to All Sites on remount (navigating away and back).
  const [moduleSite, setModuleSite] = useState<string | null>(null);

  const cfg = useMemo(() => invConfig(study.code), [study.code]);
  const hideArms = shouldHideArms(dataset, studyId, activeRole);

  // CRC is auto-scoped to their site (no selector); others use the module selector.
  const effectiveSite = activeRole === "CRC" ? (sites[0]?.id ?? null) : moduleSite;
  const allVials = useMemo(() => studyVials(dataset, studyId), [dataset, studyId]);
  const vials = useMemo(() => vialsForSite(allVials, effectiveSite), [allVials, effectiveSite]);
  const shipments = useMemo(() => studyShipments(dataset, studyId), [dataset, studyId]);
  // Dispensing log derives from FORM instances (PART 3), not vial events.
  const dispenseRows = useMemo(() => buildDispenseRows(dataset, studyId, effectiveSite, activeRole), [dataset, studyId, effectiveSite, activeRole]);

  const counts = useMemo(() => ({
    receive: shipments.length,
    inventory: vials.length,
    dispense: dispenseRows.length,
    recon: buildReconRows(vials).length,
  }), [vials, shipments, dispenseRows]);

  const detailVial = detailVialId ? allVials.find((v) => v.id === detailVialId) ?? null : null;
  const editVial = editVialId ? allVials.find((v) => v.id === editVialId) ?? null : null;

  if (!ready) return <div className="inv-screen"><div className="inv-redirect"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="inv-screen"><div className="inv-redirect">Redirecting…</div></div>;

  const TABS: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "receive", label: "Shipments", icon: "truck-delivery", count: counts.receive },
    { key: "inventory", label: "Inventory", icon: "flask", count: counts.inventory },
    { key: "dispense", label: "Dispensing log", icon: "droplet", count: counts.dispense },
    { key: "recon", label: "Reconciliation", icon: "clipboard-check", count: counts.recon },
  ];

  return (
    <div className="inv-screen">
      <div className="inv-header">
        <div>
          <h1 className="inv-title">{cfg.feed ? "Feed inventory" : "Drug inventory"}</h1>
          <div className="inv-subtitle">{cfg.drugLabel}</div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {/* Module-level site filter — visible to all roles; disabled (auto-scoped) for CRC. */}
          <select
            className="inv-select inv-site-selector"
            disabled={activeRole === "CRC"}
            value={activeRole === "CRC" ? (effectiveSite ?? "") : (moduleSite ?? "")}
            onChange={(e) => setModuleSite(e.target.value || null)}
            title={activeRole === "CRC" ? "Scoped to your site" : "Filter all tabs by site"}
            aria-label="Site filter"
          >
            <option value="">All Sites</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button className="inv-btn-secondary"><i className="ti ti-download"></i> Export log</button>
          {tab === "receive" && canInv("log_shipment", activeRole) && <button className="inv-btn-primary" onClick={() => setIntakeOpen(true)}><i className="ti ti-truck-delivery"></i> Receive shipment</button>}
        </div>
      </div>

      <div className="inv-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`inv-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            <i className={`ti ti-${t.icon}`}></i> {t.label}
            <span className="inv-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "receive" && <ReceiveTab cfg={cfg} studyId={studyId} shipments={shipments} vials={allVials} role={activeRole} update={update} intakeOpen={intakeOpen} setIntakeOpen={setIntakeOpen} />}
      {tab === "inventory" && <InventoryTab cfg={cfg} hideArms={hideArms} vials={vials} openDetail={setDetailVialId} onEdit={setEditVialId} />}
      {tab === "dispense" && <DispenseTab studyId={studyId} studyCode={study.code} rows={dispenseRows} siteActive={!!effectiveSite} />}
      {tab === "recon" && <ReconciliationTab cfg={cfg} vials={vials} role={activeRole} />}

      {detailVial && <VialDetail cfg={cfg} hideArms={hideArms} vial={detailVial} onClose={() => setDetailVialId(null)} />}
      {editVial && <VialEditPanel cfg={cfg} hideArms={hideArms} vial={editVial} role={activeRole} onClose={() => setEditVialId(null)} update={update} />}
    </div>
  );
}
