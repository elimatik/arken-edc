"use client";

// Inventory — drug-supply tracking (ported from 24-inventory.html). CRC / CRA / DM
// / Admin only; PI + Sponsor redirect to the dashboard. Five tabs: Inventory,
// Receive, Dispense, Vial detail, Reconciliation — wired to the session store.
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
import { ReconciliationTab } from "@/components/inventory/ReconciliationTab";
import { DispensePanel } from "@/components/inventory/DispensePanel";
import { ReturnModal } from "@/components/inventory/ReturnModal";
import "@/components/inventory/inventory.css";

type Tab = "inventory" | "receive" | "dispense" | "detail" | "recon";

export default function InventoryPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { study, sites, selectedSiteId, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  const allowed = ["CRC", "CRA", "DM", "Admin"].includes(activeRole);
  useEffect(() => { if (ready && !allowed) router.replace(`/study/${studyId}`); }, [ready, allowed, router, studyId]);

  const [tab, setTab] = useState<Tab>("inventory");
  const [selectedVialId, setSelectedVialId] = useState<string | null>(null);
  const [dispensePanel, setDispensePanel] = useState(false);
  const [returnState, setReturnState] = useState<{ row: DispenseRow; readOnly: boolean } | null>(null);

  const cfg = useMemo(() => invConfig(study.code), [study.code]);
  const hideArms = shouldHideArms(dataset, studyId, activeRole);

  // CRC is scoped to a single site; others honour the topbar site filter.
  const effectiveSite = activeRole === "CRC" ? (selectedSiteId ?? sites[0]?.id ?? null) : selectedSiteId;
  const allVials = useMemo(() => studyVials(dataset, studyId), [dataset, studyId]);
  const vials = useMemo(() => vialsForSite(allVials, effectiveSite), [allVials, effectiveSite]);
  const shipments = useMemo(() => studyShipments(dataset, studyId), [dataset, studyId]);

  const counts = useMemo(() => ({
    inventory: vials.length,
    receive: shipments.length,
    dispense: buildDispenseRows(vials).length,
    recon: buildReconRows(vials).length,
  }), [vials, shipments]);

  const selectedVial = selectedVialId ? allVials.find((v) => v.id === selectedVialId) ?? null : null;

  function openDetail(id: string) { setSelectedVialId(id); setTab("detail"); }

  if (!ready) return <div className="inv-screen"><div className="inv-redirect"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="inv-screen"><div className="inv-redirect">Redirecting…</div></div>;

  const TABS: { key: Tab; label: string; icon: string; count?: number }[] = [
    { key: "inventory", label: cfg.feed ? "Batches" : "Inventory", icon: "flask", count: counts.inventory },
    { key: "receive", label: "Shipments", icon: "truck-delivery", count: counts.receive },
    { key: "dispense", label: cfg.feed ? "Delivery log" : "Dispensing log", icon: "droplet", count: counts.dispense },
    ...(selectedVial ? [{ key: "detail" as Tab, label: `${cfg.itemNounCap} detail`, icon: "timeline" }] : []),
    { key: "recon", label: "Reconciliation", icon: "clipboard-check", count: counts.recon },
  ];

  return (
    <div className="inv-screen">
      <div className="inv-header">
        <div>
          <h1 className="inv-title">{cfg.feed ? "Feed inventory" : "Drug inventory"}</h1>
          <div className="inv-subtitle">{cfg.drugLabel}</div>
        </div>
        <button className="inv-btn-secondary"><i className="ti ti-download"></i> Export log</button>
      </div>

      <div className="inv-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`inv-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>
            <i className={`ti ti-${t.icon}`}></i> {t.label}
            {t.count != null && <span className="inv-tab-count">{t.count}</span>}
          </button>
        ))}
      </div>

      {tab === "inventory" && <InventoryTab cfg={cfg} hideArms={hideArms} vials={vials} openDetail={openDetail} />}
      {tab === "receive" && <ReceiveTab cfg={cfg} studyId={studyId} shipments={shipments} vials={allVials} isAdmin={activeRole === "Admin"} update={update} />}
      {tab === "dispense" && <DispenseTab cfg={cfg} vials={vials} canDispense={activeRole === "CRC" || activeRole === "Admin"} onReturn={(row, readOnly) => setReturnState({ row, readOnly })} onNewDispense={() => setDispensePanel(true)} />}
      {tab === "detail" && selectedVial && <VialDetail cfg={cfg} hideArms={hideArms} vial={selectedVial} onBack={() => setTab("inventory")} />}
      {tab === "recon" && <ReconciliationTab cfg={cfg} vials={vials} />}

      {dispensePanel && (
        <DispensePanel studyId={studyId} studyCode={study.code} cfg={cfg} hideArms={hideArms} dataset={dataset} activeSiteId={effectiveSite} vials={vials} onClose={() => setDispensePanel(false)} update={update} />
      )}
      {returnState && (
        <ReturnModal row={returnState.row} readOnly={returnState.readOnly} onClose={() => setReturnState(null)} update={update} />
      )}
    </div>
  );
}
