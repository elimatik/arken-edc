"use client";

import { useMemo, useState } from "react";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import { buildCodingWorklist, applyCoding, type CodingRow, type CodingPatch } from "@/lib/coding-data";
import { matchTerm } from "@/lib/veddra-dictionary";
import { downloadCsv, csvFilename } from "@/lib/reports-data";
import { CodingPanel } from "./CodingPanel";

// Lifecycle chips (Uncoded → Pending → Coded → Verified), each colour-coded and
// visually distinct. "excluded" is a branch (not codable). Internal status values
// map to the lifecycle labels: pending→Uncoded, review→Pending (auto-coded,
// awaiting DM confirmation), coded→Coded, verified→Verified.
const STATUS_BADGE: Record<string, { label: string; cls: string; icon?: string }> = {
  pending: { label: "Uncoded", cls: "badge-uncoded", icon: "ti-circle-dashed" },
  review: { label: "Pending", cls: "badge-review", icon: "ti-clock-hour-4" },
  coded: { label: "Coded", cls: "badge-coded", icon: "ti-check" },
  verified: { label: "Verified", cls: "badge-verified", icon: "ti-rosette-discount-check" },
  excluded: { label: "Excluded", cls: "badge-excluded", icon: "ti-circle-x" },
};
const sleep = (ms: number) => new Promise<void>((r) => { const t = Date.now(); const tick = () => (Date.now() - t >= ms ? r() : requestAnimationFrame(tick)); requestAnimationFrame(tick); });

export function CodingWorklist({ studyId, canCode }: { studyId: string; canCode: boolean }) {
  const { dataset, update } = useStudySession();
  const { study } = useShell();
  const { sort, toggle } = useTableSort(null);
  const [tab, setTab] = useState<"all" | "pending" | "review" | "coded" | "verified">("all");
  const [search, setSearch] = useState("");
  const [panelRow, setPanelRow] = useState<CodingRow | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [msg, setMsg] = useState("");

  const rows = useMemo(() => buildCodingWorklist(dataset, studyId), [dataset, studyId]);
  const counts = useMemo(() => ({
    all: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    review: rows.filter((r) => r.status === "review").length,
    coded: rows.filter((r) => r.status === "coded").length,
    verified: rows.filter((r) => r.status === "verified").length,
  }), [rows]);

  // Deep-link to the source AE/ConMed form. Uses the form DEFINITION id
  // (inst.form_id) — the Subject Record's ?form= selects by definition id, so the
  // instance id would break the link. Seeded rows (no instance) have no source.
  const sourceHref = (r: CodingRow): string | null => {
    if (!r.formInstanceId) return null;
    const inst = dataset.formInstances.find((i) => i.id === r.formInstanceId);
    if (!inst) return null;
    const field = dataset.formFields.find((f) => f.form_id === inst.form_id && f.code === r.fieldCode);
    return `/study/${studyId}/data-entry/${r.subjectId}?form=${inst.form_id}${field ? `&field=${field.id}` : ""}`;
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const arr = rows.filter((r) => {
      if (tab !== "all" && r.status !== tab) return false;
      if (q && ![r.verbatimTerm, r.subjectCode, r.pt ?? "", r.code ?? ""].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    if (!sort) return arr;
    const dir = sort.dir === "asc" ? 1 : -1;
    const by: Record<string, (x: CodingRow) => string> = {
      verbatim: (x) => x.verbatimTerm, subject: (x) => x.subjectCode, species: (x) => x.species,
      llt: (x) => x.llt ?? "", pt: (x) => x.pt ?? "", hlt: (x) => x.hlt ?? "", soc: (x) => x.soc ?? "", code: (x) => x.code ?? "", status: (x) => x.status,
    };
    const f = by[sort.col];
    return f ? arr.slice().sort((a, b) => f(a).localeCompare(f(b), undefined, { numeric: true }) * dir) : arr;
  }, [rows, tab, search, sort]);

  function applyPatch(row: CodingRow, patch: CodingPatch) {
    update((d) => applyCoding(d, row, patch, new Date().toISOString()));
    setPanelRow(null);
  }

  async function autoCodeAll() {
    const pending = rows.filter((r) => r.status === "pending");
    if (!pending.length) { setMsg("No pending terms to auto-code."); return; }
    setAutoRunning(true); setMsg("");
    let coded = 0, review = 0, unmatched = 0;
    for (const row of pending) {
      await sleep(180);
      const m = matchTerm(row.verbatimTerm);
      if (m) {
        const status = m.conf >= 0.8 ? "coded" : "review";
        update((d) => applyCoding(d, row, { status, llt: m.llt, pt: m.pt, hlt: m.hlt, soc: m.soc, code: m.code, codedBy: "Auto", autoConf: m.conf, conflict: m.conf < 0.8 }, new Date().toISOString()));
        if (m.conf >= 0.8) coded++; else review++;
      } else unmatched++;
    }
    setAutoRunning(false);
    setMsg(`Auto-coding complete · ✓ ${coded} coded (≥80%) · ⚠ ${review} flagged for review (<80%) · — ${unmatched} unmatched`);
  }

  function exportCsv() {
    downloadCsv(csvFilename(study.code, "coding"), ["Verbatim", "Subject", "Species", "LLT", "PT", "HLT", "SOC", "Code", "Status", "Coded by"],
      rows.map((r) => [r.verbatimTerm, r.subjectCode, r.species, r.llt ?? "", r.pt ?? "", r.hlt ?? "", r.soc ?? "", r.code ?? "", r.status, r.codedBy ?? ""]));
  }

  const em = (s?: string) => (s ? <span className="cell-mono">{s}</span> : <span className="cell-dash">—</span>);
  const dim = (s?: string) => (s ? <span className="cell-muted">{s}</span> : <span className="cell-dash">—</span>);

  return (
    <div className="cod-screen">
      <div className="cod-header">
        <div>
          <h1 className="cod-title">VeDDRA Coding</h1>
          <div className="cod-sub">Adverse-event and concomitant-medication term coding · VeDDRA v3.1 · MedDRA v26.1</div>
        </div>
        <div className="cod-header-actions">
          {!canCode && <span className="cod-readonly-chip"><i className="ti ti-eye"></i> Read-only</span>}
          <button className="cod-btn-secondary" type="button" onClick={exportCsv}><i className="ti ti-download"></i> Export CSV</button>
          {canCode && (
            <button className="cod-btn-secondary" type="button" onClick={autoCodeAll} disabled={autoRunning}>
              <i className={`ti ti-${autoRunning ? "loader-2 cod-spin" : "refresh"}`}></i> {autoRunning ? "Auto-coding…" : "Auto-code all"}
            </button>
          )}
        </div>
      </div>

      <div className="cod-tabs">
        {([["all", "All terms"], ["pending", "Uncoded"], ["review", "Pending"], ["coded", "Coded"], ["verified", "Verified"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`cod-tab${tab === k ? " active" : ""}`} onClick={() => setTab(k)}>{label} <span className="cod-tab-count">{counts[k]}</span></button>
        ))}
      </div>

      <div className="cod-filter">
        <div className="cod-search"><i className="ti ti-search"></i><input type="search" placeholder="Search verbatim term…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {msg && <span className="cod-msg" onClick={() => setMsg("")}><i className="ti ti-info-circle"></i> {msg}</span>}
        <span className="cod-count">{filtered.length} {filtered.length === 1 ? "term" : "terms"}</span>
      </div>

      <div className="cod-table-wrap">
        <table className="cod-table">
          <thead><tr>
            <SortTh label="Verbatim term" sortKey="verbatim" sort={sort} onSort={toggle} />
            <SortTh label="Subject" sortKey="subject" sort={sort} onSort={toggle} />
            <SortTh label="LLT" sortKey="llt" sort={sort} onSort={toggle} />
            <SortTh label="PT (Preferred term)" sortKey="pt" sort={sort} onSort={toggle} />
            <SortTh label="HLT" sortKey="hlt" sort={sort} onSort={toggle} />
            <SortTh label="SOC" sortKey="soc" sort={sort} onSort={toggle} />
            <SortTh label="Code" sortKey="code" sort={sort} onSort={toggle} />
            <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
            <th>Coded by</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((r) => {
              const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.pending;
              // Action label is role-aware: DM/Admin code/verify/edit; read-only
              // roles (CRC/Sponsor) only view.
              const actLabel = !canCode ? "View" : r.status === "pending" || r.status === "review" ? "Code" : r.status === "coded" ? "Verify" : "Edit";
              const actIcon = !canCode ? "eye" : r.status === "pending" || r.status === "review" ? "tag" : r.status === "coded" ? "rosette-discount-check" : "edit";
              return (
                <tr key={r.id} onClick={() => setPanelRow(r)}>
                  <td><span className="verbatim-term">{r.verbatimTerm}</span></td>
                  <td><div className="cell-mono">{r.subjectCode}</div><div className="cell-sub">{r.formLabel}</div></td>
                  <td>{em(r.llt)}{r.conflict && <div className="conflict-note"><i className="ti ti-alert-triangle"></i> Low confidence</div>}</td>
                  <td className={r.pt ? "cell-pt" : ""}>{em(r.pt)}</td>
                  <td>{dim(r.hlt)}</td>
                  <td>{dim(r.soc)}</td>
                  <td>{r.code ? <span className="cell-mono cell-xs">{r.code}</span> : <span className="cell-dash">—</span>}</td>
                  <td><span className={`badge ${badge.cls}`}>{badge.icon && <i className={`ti ${badge.icon}`}></i>}{badge.label}</span></td>
                  <td>{r.codedBy ? <span className="cell-muted">{r.codedBy === "Auto" ? <><i className="ti ti-sparkles cod-auto-icon"></i> Auto {r.autoConf ? Math.round(r.autoConf * 100) + "%" : ""}</> : r.codedBy}</span> : <span className="cell-dash">—</span>}</td>
                  <td className="cod-action-cell"><button className={`cod-row-action${canCode ? "" : " view"}`} type="button" onClick={(e) => { e.stopPropagation(); setPanelRow(r); }}><i className={`ti ti-${actIcon}`}></i> {actLabel}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cod-summary">
        <span>Total: <strong className="sv">{counts.all}</strong></span>
        <span>Verified: <strong className="sv ok">{counts.verified}</strong></span>
        <span>Coded: <strong className="sv">{counts.coded}</strong></span>
        <span>Pending: <strong className="sv warn">{counts.review}</strong></span>
        <span>Uncoded: <strong className="sv crit">{counts.pending}</strong></span>
        <span className="cod-version">VeDDRA v3.1 · MedDRA v26.1</span>
      </div>

      <CodingPanel row={panelRow} canCode={canCode} sourceHref={panelRow ? sourceHref(panelRow) : null} onClose={() => setPanelRow(null)} onApply={(patch) => panelRow && applyPatch(panelRow, patch)} />
    </div>
  );
}
