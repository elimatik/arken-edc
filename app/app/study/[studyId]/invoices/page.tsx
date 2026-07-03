"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import {
  type FeeEvent, type Invoice, type InvStatus, type InvSite,
  feeEventsForStudy, sitesForStudy, siteByName, seedInvoices, pendingForStudy, eventCount,
  gross, holdback, net, fmt, FEE_SECTIONS,
  STATUS_LABEL, STATUS_DESC, STATUS_BADGE, NEXT_STATUS, STATUS_ACTION,
} from "@/lib/invoices-data";
import "./invoices.css";

type Tab = "fee" | "invoices" | "preview";
// Study-wide fee-schedule currency. Amounts are stored in USD and converted for
// display; switching back to USD restores the exact originals.
const CUR_SYM: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", CHF: "CHF " };
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "CHF"];
const RATES: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, CHF: 0.90 };
const toCur = (usd: number, cur: string) => Math.round(usd * (RATES[cur] ?? 1));
const toUsd = (val: number, cur: string) => Math.round(val / (RATES[cur] ?? 1));
const money = (usd: number, cur: string) => (CUR_SYM[cur] ?? "$") + toCur(usd, cur).toLocaleString("en-US");

export default function InvoicesPage() {
  const { study, activeRole } = useShell();
  const { dataset } = useStudySession();

  const [tab, setTab] = useState<Tab>("fee");
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2800); };

  // Role capabilities. Admin = full; DM = view all + submit drafts (no approve/pay/edit).
  const canEdit = activeRole === "Admin"; // fee edits, generate, approve, mark-paid
  const canSubmit = activeRole === "Admin" || activeRole === "DM";

  // ── Fee schedule (per current study) ──
  const sites = useMemo(() => sitesForStudy(study.code), [study.code]);
  const [fees, setFees] = useState<FeeEvent[]>(() => feeEventsForStudy(study.code));
  const [siteCurrency, setSiteCurrency] = useState<Record<string, string>>(() => Object.fromEntries(sitesForStudy(study.code).map((s) => [s.name, "USD"]))); // independent per-site currency
  useEffect(() => { setFees(feeEventsForStudy(study.code)); setSiteCurrency(Object.fromEntries(sitesForStudy(study.code).map((s) => [s.name, "USD"]))); }, [study.code]);
  const [sortAsc, setSortAsc] = useState<boolean | null>(null); // null unsorted · true asc · false desc (by name)
  const [editCell, setEditCell] = useState<{ id: string; site: string } | null>(null);
  const [editBuf, setEditBuf] = useState("");

  const sortedFees = useMemo(() => {
    if (sortAsc === null) return fees;
    const arr = fees.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return sortAsc ? arr : arr.reverse();
  }, [fees, sortAsc]);
  const feeSort = () => setSortAsc((v) => (v === null ? true : v ? false : null));
  const feeSections = useMemo(() => {
    const known = FEE_SECTIONS.map((sec) => ({ sec, items: sortedFees.filter((f) => f.section === sec) })).filter((g) => g.items.length);
    const extra = Array.from(new Set(sortedFees.map((f) => f.section))).filter((s) => !FEE_SECTIONS.includes(s));
    return [...known, ...extra.map((sec) => ({ sec, items: sortedFees.filter((f) => f.section === sec) }))];
  }, [sortedFees]);

  // Inline override editing — click a cell to edit; blur saves; 0/empty clears it.
  const commitCell = () => {
    if (!editCell) return;
    const num = parseInt(editBuf.replace(/[^0-9]/g, ""), 10);
    setFees((prev) => prev.map((f) => {
      if (f.id !== editCell.id) return f;
      const ov = { ...f.overrides };
      // The input is in the site's display currency — store the USD equivalent.
      if (Number.isNaN(num) || num <= 0) delete ov[editCell.site];
      else ov[editCell.site] = toUsd(num, siteCurrency[editCell.site] ?? "USD");
      return { ...f, overrides: ov };
    }));
    setEditCell(null);
    notify("Site rate updated");
  };
  const startEdit = (id: string, site: string, currentUsd: number | null) => {
    if (!canEdit) return;
    setEditCell({ id, site }); setEditBuf(currentUsd != null ? String(toCur(currentUsd, siteCurrency[site] ?? "USD")) : "");
  };
  const overrideCount = fees.reduce((s, e) => s + Object.keys(e.overrides).length, 0);
  const feeTotal = fees.reduce((s, e) => s + e.rate, 0); // sum of study default rates (USD base)
  const feeCurrencies = Array.from(new Set(sites.map((s) => siteCurrency[s.name] ?? "USD"))); // distinct currencies in use

  // ── Invoices (cross-study) ──
  const [invoices, setInvoices] = useState<Invoice[]>(() => seedInvoices());
  const [pending, setPending] = useState<Invoice[]>(() => pendingForStudy(study.code));
  useEffect(() => { setPending(pendingForStudy(study.code)); }, [study.code]);
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [today, setToday] = useState<Date | null>(null);
  useEffect(() => { setToday(new Date()); }, []);
  const allSiteNames = useMemo(() => Array.from(new Set(invoices.map((i) => i.site))), [invoices]);
  const shownInvoices = useMemo(() => invoices.filter((i) =>
    (siteFilter === "all" || i.site === siteFilter) && (statusFilter === "all" || i.status === statusFilter)), [invoices, siteFilter, statusFilter]);

  // KPI strip reacts to the site filter: "All sites" → study totals; a specific
  // site → that site's totals only.
  const kpiInvoices = useMemo(() => siteFilter === "all" ? invoices : invoices.filter((i) => i.site === siteFilter), [invoices, siteFilter]);
  const totalGross = kpiInvoices.reduce((s, i) => s + gross(i), 0);
  const totalNet = kpiInvoices.reduce((s, i) => s + net(i), 0);
  const totalHold = kpiInvoices.reduce((s, i) => s + holdback(i), 0);
  const paid = kpiInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + net(i), 0);
  const outstanding = totalNet - paid;
  const overdue = today ? kpiInvoices.filter((i) => i.status !== "paid" && new Date(i.dueDate) < today).reduce((s, i) => s + net(i), 0) : 0;

  // ── Detail panel ──
  const [openId, setOpenId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const openInv = openId ? invoices.find((i) => i.id === openId) ?? null : null;
  function openDetail(id: string) { setOpenId(id); setNotes(""); }
  function advance(id: string) {
    setInvoices((prev) => prev.map((i) => i.id === id && NEXT_STATUS[i.status] ? { ...i, status: NEXT_STATUS[i.status] as InvStatus } : i));
    const inv = invoices.find((i) => i.id === id);
    if (inv) notify(`${inv.id} → ${STATUS_LABEL[NEXT_STATUS[inv.status] as InvStatus]}`);
  }
  const canDoAction = (status: InvStatus) => status === "draft" ? canSubmit : canEdit; // approve/pay = Admin only

  // ── Generate invoices (checkbox picker of sites with uninvoiced events) ──
  const [genOpen, setGenOpen] = useState(false);
  const [genSel, setGenSel] = useState<Set<string>>(new Set());
  function openGenerate() { setGenSel(new Set(pending.map((p) => p.id))); setGenOpen(true); }
  function generate() {
    const chosen = pending.filter((p) => genSel.has(p.id));
    if (!chosen.length) return;
    setInvoices((prev) => [...chosen.map((p) => ({ ...p, lineItems: p.lineItems.map((l) => ({ ...l })) })), ...prev]);
    setPending((prev) => prev.filter((p) => !genSel.has(p.id)));
    setGenOpen(false);
    notify(`${chosen.length} draft invoice${chosen.length === 1 ? "" : "s"} generated — review in Site invoices tab`);
  }

  // ── Site info modal ──
  const [siteInfo, setSiteInfo] = useState<InvSite | null>(null);

  // ── Preview ──
  const [previewId, setPreviewId] = useState<string>(() => seedInvoices()[0]?.id ?? "");
  const previewInv = invoices.find((i) => i.id === previewId) ?? invoices[0];

  if (activeRole !== "Admin" && activeRole !== "DM") return null;

  const groupBySection = (items: { section: string; name: string; qty: number; rate: number; override: string | null }[]) => {
    const secs: Record<string, typeof items> = {};
    items.forEach((l) => { (secs[l.section] ??= []).push(l); });
    return FEE_SECTIONS.filter((s) => secs[s]).map((s) => ({ sec: s, items: secs[s] })).concat(
      Object.keys(secs).filter((s) => !FEE_SECTIONS.includes(s)).map((s) => ({ sec: s, items: secs[s] })));
  };

  return (
    <div className="invoices-wrap">
      <div className="inv-header">
        <h1 className="inv-title">Invoices</h1>
        <div className="inv-head-actions">
          <button className="inv-btn-secondary" type="button" onClick={() => notify("Export is disabled in the demo")}><i className="ti ti-download"></i> Export</button>
        </div>
      </div>

      <div className="inv-tabs">
        <button className={`inv-tab${tab === "fee" ? " active" : ""}`} type="button" onClick={() => setTab("fee")}><i className="ti ti-table"></i> Fee schedule</button>
        <button className={`inv-tab${tab === "invoices" ? " active" : ""}`} type="button" onClick={() => setTab("invoices")}><i className="ti ti-receipt"></i> Site invoices</button>
        <button className={`inv-tab${tab === "preview" ? " active" : ""}`} type="button" onClick={() => setTab("preview")}><i className="ti ti-file-invoice"></i> Invoice preview</button>
      </div>

      {/* ═══ TAB 1 — FEE SCHEDULE ═══ */}
      {tab === "fee" && (
        <>
          <div className="inv-note-bar">Per-site rates for {study.code} · cells show the study default rate (from Settings → Billing) in grey until a site override is set · overrides shown in <span style={{ color: "var(--purple-600)", fontWeight: 500 }}>purple</span> · click a cell to override, set to 0 to clear{!canEdit && " · read-only (DM)"}</div>
          <div className="inv-table-wrap">
            <table className="inv-table inv-fee-table">
              <thead>
                <tr>
                  <th style={{ cursor: "pointer" }} onClick={feeSort}>Event type {sortAsc === null ? "" : sortAsc ? "▲" : "▼"}</th>
                  <th>Trigger</th>
                  {sites.map((s) => <th key={s.name} className="inv-r">{s.name}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr className="inv-currency-row">
                  <td colSpan={2}>Billing currency per site</td>
                  {sites.map((s) => (
                    <td key={s.name} className="inv-r">
                      <select className="inv-cur-select" value={siteCurrency[s.name] ?? "USD"} disabled={!canEdit}
                        onChange={(e) => setSiteCurrency((p) => ({ ...p, [s.name]: e.target.value }))}>
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
                {feeSections.map((g) => (
                  <FeeSectionRows key={g.sec}
                    sec={g.sec} items={g.items} sites={sites} siteCurrency={siteCurrency} canEdit={canEdit}
                    editCell={editCell} editBuf={editBuf} setEditBuf={setEditBuf}
                    onStartEdit={startEdit} onCommit={commitCell} onCancel={() => setEditCell(null)}
                    colSpan={2 + sites.length} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="inv-summary-bar">
            <span>Event types: <span className="inv-sv">{fees.length}</span></span>
            <span>Site overrides active: <span className="inv-sv warn">{overrideCount}</span></span>
            {feeCurrencies.length === 1
              ? <span>Total fee value: <span className="inv-sv">{money(feeTotal, feeCurrencies[0])}</span></span>
              : <span>Total fee value: <span className="inv-sv warn">multi-currency</span> ({feeCurrencies.map((c) => money(feeTotal, c)).join(" · ")})</span>}
            <span style={{ marginLeft: "auto" }}>Holdback 10% · rates set per site</span>
          </div>
        </>
      )}

      {/* ═══ TAB 2 — SITE INVOICES ═══ */}
      {tab === "invoices" && (
        <>
          <div className="inv-toolbar">
            <select className="inv-select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)} aria-label="Filter by site">
              <option value="all">All sites</option>
              {allSiteNames.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="inv-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option><option value="submitted">Submitted</option><option value="approved">Approved</option><option value="paid">Paid</option>
            </select>
            <span className="inv-toolbar-count">{shownInvoices.length} invoice{shownInvoices.length === 1 ? "" : "s"}</span>
            {canEdit && <button className="inv-btn-primary" type="button" onClick={openGenerate}><i className="ti ti-plus"></i> Generate invoices</button>}
          </div>
          <div className="inv-kpi-row">
            <div className="inv-kpi-card"><div className="inv-kpi-label">Total invoiced</div><div className="inv-kpi-value">{fmt(totalGross)}</div><div className="inv-kpi-sub">{kpiInvoices.length} invoice{kpiInvoices.length === 1 ? "" : "s"}{siteFilter !== "all" ? ` · ${siteFilter}` : ""}</div></div>
            <div className="inv-kpi-card"><div className="inv-kpi-label">Paid</div><div className="inv-kpi-value" style={{ color: "var(--green-600)" }}>{fmt(paid)}</div><div className="inv-kpi-sub">received</div></div>
            <div className="inv-kpi-card"><div className="inv-kpi-label">Outstanding</div><div className="inv-kpi-value">{fmt(outstanding)}</div><div className="inv-kpi-sub">awaiting payment</div></div>
            <div className="inv-kpi-card"><div className="inv-kpi-label">Holdback retained</div><div className="inv-kpi-value" style={{ color: "var(--amber-700)" }}>{fmt(totalHold)}</div><div className="inv-kpi-sub">released at close-out</div></div>
            <div className="inv-kpi-card"><div className="inv-kpi-label">Overdue</div><div className="inv-kpi-value" style={{ color: overdue > 0 ? "var(--red-600)" : "var(--color-text-primary)" }}>{fmt(overdue)}</div><div className="inv-kpi-sub">past due date</div></div>
          </div>
          <div className="inv-table-wrap">
            <table className="inv-table">
              <thead>
                <tr><th>Invoice</th><th>Site</th><th>Period</th><th>Events</th><th>Gross amount</th><th>Holdback (10%)</th><th>Net payable</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {shownInvoices.map((inv) => {
                  const ovCount = inv.lineItems.filter((l) => l.override).length;
                  return (
                    <tr key={inv.id} className="inv-clickable" onClick={() => openDetail(inv.id)}>
                      <td><div style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{inv.id}</div><div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>Issued {inv.issueDate}</div></td>
                      <td><div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><span style={{ fontWeight: 500 }}>{inv.site}</span><button className="inv-btn-icon" style={{ width: 20, height: 20 }} type="button" title="Site info" onClick={(e) => { e.stopPropagation(); const s = siteByName(inv.site); if (s) setSiteInfo(s); }}><i className="ti ti-info-circle" style={{ fontSize: 13 }}></i></button></div></td>
                      <td className="inv-cell-muted">{inv.period}</td>
                      <td><span className="inv-cell-mono">{inv.lineItems.length}</span>{ovCount > 0 && <span className="inv-override-pill">{ovCount} override{ovCount > 1 ? "s" : ""}</span>}</td>
                      <td className="inv-cell-money">{fmt(gross(inv))}</td>
                      <td className="inv-cell-money" style={{ color: "var(--amber-700)" }}>−{fmt(holdback(inv))}</td>
                      <td className="inv-cell-money" style={{ color: "var(--green-600)" }}>{fmt(net(inv))}</td>
                      <td><span className={`inv-badge ${STATUS_BADGE[inv.status]}`}>{inv.status === "paid" && <i className="ti ti-check" style={{ fontSize: 10 }}></i>}{STATUS_LABEL[inv.status]}</span></td>
                      <td><button className="inv-btn-icon" type="button" onClick={(e) => { e.stopPropagation(); openDetail(inv.id); }}><i className="ti ti-arrow-right"></i></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="inv-summary-bar">
            <span>Total invoices: <span className="inv-sv">{invoices.length}</span></span>
            <span>Total gross: <span className="inv-sv">{fmt(totalGross)}</span></span>
            <span>Net payable: <span className="inv-sv">{fmt(totalNet)}</span></span>
            <span>Outstanding: <span className="inv-sv bad">{fmt(outstanding)}</span></span>
          </div>
        </>
      )}

      {/* ═══ TAB 3 — INVOICE PREVIEW ═══ */}
      {tab === "preview" && (
        <>
          <div className="inv-toolbar">
            <select className="inv-select" value={previewId} onChange={(e) => setPreviewId(e.target.value)} aria-label="Select invoice to preview">
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.id} — {i.site}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
              <button className="inv-btn-secondary" type="button" onClick={() => notify("PDF download is disabled in the demo")}><i className="ti ti-download"></i> Download PDF</button>
              <button className="inv-btn-secondary" type="button" onClick={() => window.print()}><i className="ti ti-printer"></i> Print</button>
            </div>
          </div>
          <div className="inv-preview-scroll">
            {previewInv && <InvoicePaper inv={previewInv} sponsor={dataset.studies.find((s) => s.code === previewInv.studyCode)?.sponsor ?? "Study Sponsor"} groupBySection={groupBySection} />}
          </div>
        </>
      )}

      {/* ── Detail slide-in ── */}
      {openInv && (
        <>
          <div className="inv-panel-overlay" onClick={() => setOpenId(null)} />
          <aside className="inv-detail open" aria-label={`Invoice ${openInv.id}`}>
            <div className="inv-id-header">
              <div className="inv-id-num">{openInv.id}</div>
              <button className="inv-id-close" type="button" onClick={() => setOpenId(null)}><i className="ti ti-x"></i></button>
            </div>
            <div className="inv-status-bar">
              <span className={`inv-badge ${STATUS_BADGE[openInv.status]}`}>{STATUS_LABEL[openInv.status]}</span>
              <span className="inv-status-desc">{STATUS_DESC[openInv.status]}</span>
              <span className="inv-status-date">Issued {openInv.issueDate}</span>
            </div>
            <div className="inv-site-block">
              <div>
                <div className="inv-site-name">{openInv.site} — {openInv.studyCode} <button className="inv-btn-icon" style={{ width: 20, height: 20, display: "inline-flex", verticalAlign: "middle" }} type="button" title="Site info" onClick={() => { const s = siteByName(openInv.site); if (s) setSiteInfo(s); }}><i className="ti ti-info-circle" style={{ fontSize: 13 }}></i></button></div>
                <div className="inv-site-meta">Billing period: {openInv.period}</div>
              </div>
              <div><div className="inv-total-label">Net payable</div><div className="inv-total-amount">{fmt(net(openInv))}</div></div>
            </div>
            <div className="inv-id-body">
              {openInv.lineItems.map((l, i) => (
                <div className="inv-li" key={i}>
                  <div style={{ minWidth: 0 }}>
                    <div className="inv-li-name">{l.name}</div>
                    {l.override && <div className="inv-li-override">{l.override} site override</div>}
                  </div>
                  <div className="inv-li-right"><div className="inv-li-qty">{l.qty} × {fmt(l.rate)}</div><div className="inv-li-amount">{fmt(l.qty * l.rate)}</div></div>
                </div>
              ))}
              <div className="inv-id-subtotal"><span>Gross total</span><span style={{ fontFamily: "var(--font-mono)" }}>{fmt(gross(openInv))}</span></div>
              <div className="inv-id-holdback"><span>Holdback ({Math.round(openInv.holdbackPct * 100)}%) — released at close-out</span><span style={{ fontFamily: "var(--font-mono)" }}>−{fmt(holdback(openInv))}</span></div>
              <div className="inv-id-net"><span>Net payable</span><span style={{ fontFamily: "var(--font-mono)", color: "var(--green-600)" }}>{fmt(net(openInv))}</span></div>
              <div className="inv-id-notes">
                <div className="inv-id-notes-label">Notes</div>
                <textarea className="inv-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note for this invoice…" />
              </div>
            </div>
            <div className="inv-id-footer">
              <button className="inv-btn-secondary" type="button" onClick={() => setOpenId(null)}>Close</button>
              <button className="inv-btn-secondary" type="button" onClick={() => notify("PDF download is disabled in the demo")}><i className="ti ti-download"></i> Download PDF</button>
              {openInv.status !== "paid" && canDoAction(openInv.status) && (
                <button className="inv-btn-primary" type="button" onClick={() => advance(openInv.id)}>{STATUS_ACTION[openInv.status]}</button>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ── Generate invoices (checkbox picker) ── */}
      {genOpen && (
        <div className="inv-modal-overlay" onClick={() => setGenOpen(false)}>
          <div className="inv-modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="inv-modal-header"><div className="inv-modal-title">Generate draft invoices</div><button className="inv-id-close" type="button" onClick={() => setGenOpen(false)}><i className="ti ti-x"></i></button></div>
            <div className="inv-modal-body">
              {pending.length === 0 ? (
                <div className="inv-dialog-body">No uninvoiced completed events for {study.code}. All billable events are already on an invoice.</div>
              ) : (
                <>
                  <div className="inv-dialog-body">Sites with uninvoiced completed events since the last billing date. Select which to invoice:</div>
                  {pending.map((p) => (
                    <label className="inv-gen-row" key={p.id}>
                      <input type="checkbox" checked={genSel.has(p.id)} onChange={(e) => setGenSel((prev) => { const n = new Set(prev); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })} />
                      <div className="inv-gen-info"><div className="inv-gen-site">{p.site}</div><div className="inv-gen-meta">{p.period} · {eventCount(p)} events</div></div>
                      <div className="inv-gen-amount">{fmt(gross(p))}</div>
                    </label>
                  ))}
                </>
              )}
            </div>
            <div className="inv-modal-footer"><button className="inv-btn-secondary" type="button" onClick={() => setGenOpen(false)}>Cancel</button><button className="inv-btn-primary" type="button" disabled={genSel.size === 0} onClick={generate}>Generate selected{genSel.size ? ` (${genSel.size})` : ""}</button></div>
          </div>
        </div>
      )}

      {/* ── Site info modal ── */}
      {siteInfo && (
        <div className="inv-modal-overlay" onClick={() => setSiteInfo(null)}>
          <div className="inv-modal" style={{ width: 600 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="inv-modal-header"><div className="inv-modal-title">{siteInfo.name} — Site information</div><button className="inv-id-close" type="button" onClick={() => setSiteInfo(null)}><i className="ti ti-x"></i></button></div>
            <div className="inv-modal-body">
              <div className="inv-site-grid">
                <div className="inv-sib-block">
                  <div className="inv-sib-title">Principal investigator</div>
                  <SibField label="Name" value={siteInfo.contact.name} />
                  <SibField label="Title" value={siteInfo.contact.title} />
                  <SibField label="Address" value={siteInfo.contact.address} />
                  <SibField label="City / State / Zip" value={siteInfo.contact.city} />
                  <SibField label="Phone" value={siteInfo.contact.phone} mono />
                  <SibField label="Email" value={siteInfo.contact.email} mono />
                </div>
                <div className="inv-sib-block">
                  <div className="inv-sib-title">Billing contact</div>
                  <SibField label="Contact name" value={siteInfo.billing.name} />
                  <SibField label="Company" value={siteInfo.billing.company} />
                  <SibField label="ATTN" value={siteInfo.billing.attn} />
                  <SibField label="Email" value={siteInfo.billing.email} mono />
                  <SibField label="Phone" value={siteInfo.billing.phone} mono />
                  <SibField label="Address" value={`${siteInfo.billing.address}, ${siteInfo.billing.city}`} />
                </div>
              </div>
            </div>
            <div className="inv-modal-footer"><button className="inv-btn-primary" type="button" onClick={() => setSiteInfo(null)}><i className="ti ti-check"></i> Done</button></div>
          </div>
        </div>
      )}

      {toast && <div className="inv-toast" role="status"><i className="ti ti-check" style={{ fontSize: 16 }}></i> {toast}</div>}
    </div>
  );
}

function SibField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="inv-sib-field"><div className="inv-sib-label">{label}</div><div className={`inv-sib-value${mono ? " mono" : ""}`}>{value || "—"}</div></div>;
}

// One fee section (header row + per-site override cells). Each site cell is
// inline-editable — click to enter an override, blur to save, 0/empty to clear.
function FeeSectionRows({ sec, items, sites, siteCurrency, canEdit, editCell, editBuf, setEditBuf, onStartEdit, onCommit, onCancel, colSpan }: {
  sec: string; items: FeeEvent[]; sites: InvSite[]; siteCurrency: Record<string, string>; canEdit: boolean;
  editCell: { id: string; site: string } | null; editBuf: string; setEditBuf: (v: string) => void;
  onStartEdit: (id: string, site: string, current: number | null) => void; onCommit: () => void; onCancel: () => void;
  colSpan: number;
}) {
  const cell = (ev: FeeEvent, site: string) => {
    const isEditing = editCell?.id === ev.id && editCell?.site === site;
    const ovVal = ev.overrides[site];
    const hasOv = ovVal !== undefined;
    const cur = siteCurrency[site] ?? "USD";
    if (isEditing) {
      return <input className="inv-fee-input" autoFocus value={editBuf}
        onChange={(e) => setEditBuf(e.target.value)} onBlur={onCommit}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") onCancel(); }} />;
    }
    return (
      <button type="button" className={`inv-fee-input${hasOv ? " override" : ""}`} disabled={!canEdit}
        style={{ cursor: canEdit ? "text" : "default", ...(hasOv ? {} : { color: "var(--color-text-tertiary)" }) }}
        title={hasOv ? `${site} override` : "Study default — click to set a site override"}
        onClick={() => onStartEdit(ev.id, site, hasOv ? ovVal : null)}>
        {hasOv ? money(ovVal, cur) : money(ev.rate, cur)}
      </button>
    );
  };
  return (
    <>
      <tr className="inv-section-row"><td colSpan={colSpan}>{sec}</td></tr>
      {items.map((ev) => (
        <tr key={ev.id}>
          <td><div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{ev.name}</div><div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>{ev.id}</div></td>
          <td className="inv-cell-muted">{ev.trigger}</td>
          {sites.map((s) => <td key={s.name} className="inv-r">{cell(ev, s.name)}</td>)}
        </tr>
      ))}
    </>
  );
}

// The paper-style invoice for the Preview tab.
function InvoicePaper({ inv, sponsor, groupBySection }: {
  inv: Invoice; sponsor: string;
  groupBySection: (items: Invoice["lineItems"]) => { sec: string; items: Invoice["lineItems"] }[];
}) {
  const g = gross(inv), h = holdback(inv), n = net(inv);
  const site = siteByName(inv.site);
  const statusColor: Record<InvStatus, string> = { draft: "#6D7480", submitted: "#8A5C00", approved: "#1760A8", paid: "#1A6B47" };
  const th: React.CSSProperties = { padding: "8px 16px", textAlign: "right", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#1A1F2E" };
  const td: React.CSSProperties = { padding: "8px 16px", textAlign: "right", fontSize: 13, color: "#6D7480", fontFamily: "var(--font-mono)" };
  return (
    <div className="inv-paper">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1A1F2E" }}>{sponsor}</div>
          <div style={{ fontSize: 12, color: "#6D7480", marginTop: 4, lineHeight: 1.6 }}>Study sponsor · {inv.studyCode}<br />Clinical trial fee settlement<br />billing via Arken EDC</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", color: "#6D7480" }}>INVOICE</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#1A1F2E", fontFamily: "var(--font-mono)" }}>{inv.id}</div>
          <div style={{ display: "inline-block", marginTop: 6, padding: "3px 12px", borderRadius: 99, fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: statusColor[inv.status], border: `2px solid ${statusColor[inv.status]}` }}>{STATUS_LABEL[inv.status].toUpperCase()}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32, padding: 20, background: "#FBFBFB", borderRadius: 6, border: "1px solid #E8E8E6" }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6D7480", marginBottom: 8 }}>Bill to</div>
          {site ? (
            <><div style={{ fontSize: 14, fontWeight: 500 }}>{site.billing.company}</div>
              <div style={{ fontSize: 12, color: "#6D7480", marginTop: 4, lineHeight: 1.6 }}>ATTN: {site.billing.attn}<br />{site.billing.name}<br />{site.billing.address}<br />{site.billing.city}<br />{site.billing.country}</div></>
          ) : <div style={{ fontSize: 14, fontWeight: 500 }}>{inv.site}</div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6D7480", marginBottom: 8 }}>Invoice details</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px", fontSize: 12 }}>
            <span style={{ color: "#6D7480" }}>Issue date</span><span style={{ fontFamily: "var(--font-mono)" }}>{inv.issueDate}</span>
            <span style={{ color: "#6D7480" }}>Due date</span><span style={{ fontFamily: "var(--font-mono)" }}>{inv.dueDate}</span>
            <span style={{ color: "#6D7480" }}>Payment terms</span><span>Net 30</span>
            <span style={{ color: "#6D7480" }}>Period</span><span>{inv.period}</span>
            <span style={{ color: "#6D7480" }}>Study</span><span>{inv.studyCode}</span>
          </div>
        </div>
      </div>
      <table className="inv-paper-table">
        <thead><tr style={{ borderBottom: "2px solid #1A1F2E" }}><th style={{ ...th, textAlign: "left" }}>Description</th><th style={th}>Qty</th><th style={th}>Unit rate</th><th style={{ ...th, paddingRight: 0 }}>Amount</th></tr></thead>
        <tbody>
          {groupBySection(inv.lineItems).map((grp) => (
            <React.Fragment key={grp.sec}>
              <tr><td colSpan={4} style={{ padding: "12px 0 4px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#6D7480", borderBottom: "1px solid #E8E8E6" }}>{grp.sec}</td></tr>
              {grp.items.map((l, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #F0F0EE" }}>
                  <td style={{ padding: "8px 0", fontSize: 13, color: "#2C2D33" }}>{l.name}{l.override && <span style={{ fontSize: 10, color: "#534AB7", marginLeft: 8, background: "#F0EEFF", border: "1px solid #A9A3EC", borderRadius: 99, padding: "1px 6px" }}>{l.override} rate</span>}</td>
                  <td style={td}>{l.qty}</td>
                  <td style={td}>{fmt(l.rate)}</td>
                  <td style={{ padding: "8px 0", fontSize: 13, fontWeight: 500, textAlign: "right", fontFamily: "var(--font-mono)" }}>{fmt(l.qty * l.rate)}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
      <div style={{ marginLeft: "auto", width: 280 }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #E8E8E6", fontSize: 13 }}><span style={{ color: "#4F535B" }}>Subtotal</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{fmt(g)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13 }}><span style={{ color: "#4F535B" }}>Holdback ({Math.round(inv.holdbackPct * 100)}%) — released at close-out</span><span style={{ fontFamily: "var(--font-mono)", color: "#8A5C00" }}>−{fmt(h)}</span></div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", fontSize: 16, fontWeight: 700, borderTop: "2px solid #1A1F2E", marginTop: 4 }}><span>Net payable</span><span style={{ fontFamily: "var(--font-mono)", color: "#1A6B47" }}>{fmt(n)}</span></div>
      </div>
      <div style={{ marginTop: 40, padding: "16px 20px", background: "#F0F0EE", borderRadius: 6, fontSize: 12, color: "#4F535B", lineHeight: 1.7 }}>
        <strong style={{ color: "#1A1F2E" }}>Payment instructions</strong><br />
        Remit within 30 days of issue. Reference {inv.id} on all payments. Holdback released after database lock and close-out reconciliation.
      </div>
      <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #E8E8E6", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#C4C4C2" }}>
        <span>{inv.id} · Generated by Arken EDC · {inv.studyCode}</span><span>Page 1 of 1</span>
      </div>
    </div>
  );
}
