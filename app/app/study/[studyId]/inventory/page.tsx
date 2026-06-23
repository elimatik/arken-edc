"use client";

// Inventory — drug-supply tracking (ported from 24-inventory.html). CRC / CRA / DM
// / Admin only; PI + Sponsor redirect to the dashboard. Tabs: Shipments (default),
// Inventory, Dispense log, Reconciliation. The vial lifecycle and per-unit edit
// open as right-hand slide-in panels (no separate tab).
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { shouldHideArms } from "@/lib/study-config";
import {
  invConfig, studyVials, studyShipments, vialsForSite, buildDispenseRows, buildReconRows,
  type DispenseRow,
} from "@/lib/inventory-data";
import { InventoryTab } from "@/components/inventory/InventoryTab";
import { ReceiveTab } from "@/components/inventory/ReceiveTab";
import { DispenseTab } from "@/components/inventory/DispenseTab";
import { VialDetail } from "@/components/inventory/VialDetail";
import { VialEditPanel } from "@/components/inventory/VialEditPanel";
import { ReconciliationTab } from "@/components/inventory/ReconciliationTab";
import { ReturnModal } from "@/components/inventory/ReturnModal";
import "@/components/inventory/inventory.css";

type Tab = "receive" | "inventory" | "dispense" | "recon";

export default function InventoryPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { study, sites, selectedSiteId, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  const allowed = ["CRC", "CRA", "DM", "Admin"].includes(activeRole);
  useEffect(() => { if (ready && !allowed) router.replace(`/study/${studyId}`); }, [ready, allowed, router, studyId]);

  const [tab, setTab] = useState<Tab>("receive");
  const [detailVialId, setDetailVialId] = useState<string | null>(null);
  const [editVialId, setEditVialId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [returnState, setReturnState] = useState<{ row: DispenseRow; readOnly: boolean } | null>(null);

  const cfg = useMemo(() => invConfig(study.code), [study.code]);
  const hideArms = shouldHideArms(dataset, studyId, activeRole);
  const isAdmin = activeRole === "Admin";

  // CRC is scoped to a single site; others honour the topbar site filter.
  const effectiveSite = activeRole === "CRC" ? (selectedSiteId ?? sites[0]?.id ?? null) : selectedSiteId;
  const allVials = useMemo(() => studyVials(dataset, studyId), [dataset, studyId]);
  const vials = useMemo(() => vialsForSite(allVials, effectiveSite), [allVials, effectiveSite]);
  const shipments = useMemo(() => studyShipments(dataset, studyId), [dataset, studyId]);

  const counts = useMemo(() => ({
    receive: shipments.length,
    inventory: vials.length,
    dispense: buildDispenseRows(vials).length,
    recon: buildReconRows(vials).length,
  }), [vials, shipments]);

  const detailVial = detailVialId ? allVials.find((v) => v.id === detailVialId) ?? null : null;
  const editVial = editVialId ? allVials.find((v) => v.id === editVialId) ?? null : null;

  if (!ready) return <div className="inv-screen"><div className="inv-redirect"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="inv-screen"><div className="inv-redirect">Redirecting…</div></div>;

  const TABS: { key: Tab; label: string; icon: string; count: number }[] = [
    { key: "receive", label: "Shipments", icon: "truck-delivery", count: counts.receive },
    { key: "inventory", label: cfg.feed ? "Batches" : "Inventory", icon: "flask", count: counts.inventory },
    { key: "dispense", label: cfg.feed ? "Delivery log" : "Dispensing log", icon: "droplet", count: counts.dispense },
    { key: "recon", label: "Reconciliation", icon: "clipboard-check", count: counts.recon },
  ];

  return (
    <div className="inv-screen">
      <div className="inv-header">
        <div>
          <h1 className="inv-title">{cfg.feed ? "Feed inventory" : "Drug inventory"}</h1>
          <div className="inv-subtitle">{cfg.drugLabel}</div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button className="inv-btn-secondary"><i className="ti ti-download"></i> Export log</button>
          {tab === "receive" && isAdmin && <button className="inv-btn-primary" onClick={() => setIntakeOpen(true)}><i className="ti ti-truck-delivery"></i> Receive shipment</button>}
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

      {tab === "receive" && <ReceiveTab cfg={cfg} studyId={studyId} shipments={shipments} vials={allVials} isAdmin={isAdmin} update={update} intakeOpen={intakeOpen} setIntakeOpen={setIntakeOpen} />}
      {tab === "inventory" && <InventoryTab cfg={cfg} hideArms={hideArms} vials={vials} openDetail={setDetailVialId} onEdit={setEditVialId} />}
      {tab === "dispense" && <DispenseTab cfg={cfg} vials={vials} onReturn={(row, readOnly) => setReturnState({ row, readOnly })} />}
      {tab === "recon" && <ReconciliationTab cfg={cfg} vials={vials} />}

      {detailVial && <VialDetail cfg={cfg} hideArms={hideArms} vial={detailVial} onClose={() => setDetailVialId(null)} />}
      {editVial && <VialEditPanel cfg={cfg} hideArms={hideArms} vial={editVial} isAdmin={isAdmin} onClose={() => setEditVialId(null)} update={update} />}
      {returnState && <ReturnModal row={returnState.row} readOnly={returnState.readOnly} onClose={() => setReturnState(null)} update={update} />}
    </div>
  );
}
