"use client";

// Source Data Verification — worklist (the list). Clicking a row deep-links to the
// Subject Record for that subject + form with SDV mode active (?sdv=true); the field-
// by-field verification lives in the Subject Record, not a separate layout here.
// CRA verifies; DM gets a read-only view. Other roles redirect to the dashboard.
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import { buildSdvWorklist, type SdvWorklistRow, type FormSdvStatus } from "@/lib/sdv-data";
import "./sdv.css";

const STATUS_META: Record<FormSdvStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "ss-pending" },
  partial: { label: "In progress", cls: "ss-partial" },
  complete: { label: "Complete", cls: "ss-complete" },
  queried: { label: "Queried", cls: "ss-queried" },
};
const STATUS_RANK: Record<FormSdvStatus, number> = { queried: 0, pending: 1, partial: 2, complete: 3 };
const PROG_TONE: Record<FormSdvStatus, string> = { pending: "slate", partial: "amber", queried: "amber", complete: "green" };

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso: string): number => {
  if (!iso) return 0;
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
};

export default function SdvPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, study } = useShell();
  const { dataset, ready } = useStudySession();
  const ndaName = useNdaName();

  const allowed = activeRole === "CRA" || activeRole === "DM";
  useEffect(() => { if (ready && !allowed) router.replace(`/study/${studyId}`); }, [ready, allowed, router, studyId]);

  const [tab, setTab] = useState<"all" | "pending" | "partial" | "complete">("all");
  const [search, setSearch] = useState("");
  const [siteF, setSiteF] = useState("all");
  const [visitF, setVisitF] = useState("all");
  const { sort, toggle: toggleSort } = useTableSort(null);

  const worklist = useMemo(() => (ready ? buildSdvWorklist(dataset, studyId) : []), [dataset, studyId, ready]);
  const siteOptions = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code)), [dataset.sites, studyId]);
  const visitOptions = useMemo(() => Array.from(new Set(worklist.map((r) => r.visitLabel))).sort(), [worklist]);

  const counts = useMemo(() => ({
    all: worklist.length,
    pending: worklist.filter((r) => r.sdvStatus === "pending").length,
    partial: worklist.filter((r) => r.sdvStatus === "partial" || r.sdvStatus === "queried").length,
    complete: worklist.filter((r) => r.sdvStatus === "complete").length,
  }), [worklist]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = worklist.filter((r) => {
      if (tab === "pending" && r.sdvStatus !== "pending") return false;
      if (tab === "partial" && r.sdvStatus !== "partial" && r.sdvStatus !== "queried") return false;
      if (tab === "complete" && r.sdvStatus !== "complete") return false;
      if (siteF !== "all" && r.siteId !== siteF) return false;
      if (visitF !== "all" && r.visitLabel !== visitF) return false;
      if (q && ![r.subjectCode, r.formName, r.visitLabel, r.siteLabel].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
    return out.sort((a, b) => {
      if (sort) {
        const dir = sort.dir === "asc" ? 1 : -1;
        switch (sort.col) {
          case "subject": return a.subjectCode.localeCompare(b.subjectCode) * dir;
          case "visit": return a.visitLabel.localeCompare(b.visitLabel) * dir;
          case "form": return a.formName.localeCompare(b.formName) * dir;
          case "site": return a.siteLabel.localeCompare(b.siteLabel) * dir;
          case "status": return (STATUS_RANK[a.sdvStatus] - STATUS_RANK[b.sdvStatus]) * dir;
          case "updated": return ((a.lastUpdated || "") < (b.lastUpdated || "") ? -1 : 1) * dir;
          case "queries": return (a.openQueries - b.openQueries) * dir;
        }
      }
      return STATUS_RANK[a.sdvStatus] - STATUS_RANK[b.sdvStatus] || a.subjectCode.localeCompare(b.subjectCode);
    });
  }, [worklist, tab, search, siteF, visitF, sort]);

  const summary = useMemo(() => ({
    fieldsTotal: worklist.reduce((n, r) => n + r.totalRequiredFields, 0),
    fieldsVerified: worklist.reduce((n, r) => n + r.verifiedFields, 0),
    openQ: worklist.reduce((n, r) => n + r.openQueries, 0),
  }), [worklist]);

  // Fix 6 — discrepancies = field-level queries raised during SDV (queried fields).
  // Open = currently queried; resolved = closed out. Scoped to the worklist forms.
  const discrepancies = useMemo(() => {
    const instIds = new Set(worklist.map((r) => r.formInstanceId));
    let open = 0, resolved = 0;
    for (const q of dataset.queries) {
      if (!q.field_value_id || !instIds.has(q.form_instance_id)) continue;
      if (q.status === "resolved" || q.status === "closed") resolved++; else open++;
    }
    return { open, resolved };
  }, [dataset.queries, worklist]);

  function openForm(r: SdvWorklistRow) {
    router.push(`/study/${studyId}/data-entry/${r.subjectId}?form=${r.formId}&sdv=true`);
  }

  // Fix 3 — SDV certificate: a real, self-contained HTML document (PDF-quality
  // print layout; downloaded as .html). Scoped to the selected site when one is set.
  function downloadCertificate() {
    // Scope to the selected site (the whole site worklist, not the tab-filtered view).
    const rows = siteF === "all" ? worklist : worklist.filter((r) => r.siteId === siteF);
    const site = siteF === "all" ? null : siteOptions.find((s) => s.id === siteF);
    const siteCode = site?.code ?? "ALL";
    const disc = (() => {
      const instIds = new Set(rows.map((r) => r.formInstanceId));
      let open = 0, resolved = 0;
      for (const q of dataset.queries) { if (!q.field_value_id || !instIds.has(q.form_instance_id)) continue; if (q.status === "resolved" || q.status === "closed") resolved++; else open++; }
      return { open, resolved };
    })();
    const html = buildCertificateHtml({
      studyName: study.name, studyCode: study.code, siteLabel: site ? `${site.code} · ${site.name}` : "All sites",
      date: todayISO(), craName: ndaName, role: activeRole, rows,
      totalFieldsVerified: rows.reduce((n, r) => n + r.verifiedFields, 0),
      discrepancies: disc.open + disc.resolved, openQueries: rows.reduce((n, r) => n + r.openQueries, 0),
    });
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `arken-sdv-certificate-${siteCode}-${todayISO()}.html`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  if (!ready) return <div className="sdv-screen"><div className="sdv-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="sdv-screen"><div className="sdv-loading">Redirecting…</div></div>;

  return (
    <div className="sdv-screen">
      <div className="sdv-header">
        <div className="sdv-title-row">
          <h1 className="sdv-title">Source Data Verification</h1>
          <div className="sdv-header-actions">
            <button className="sdv-btn-secondary" type="button" onClick={() => exportCsv(filtered, study.code)}><i className="ti ti-download"></i> Export CSV</button>
            <button className="sdv-btn-primary" type="button" onClick={downloadCertificate} disabled={worklist.length === 0} title="Download the SDV certificate (selected site, or all sites)"><i className="ti ti-certificate"></i> Download SDV Certificate</button>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="sdv-stat-strip">
        <div className="sdv-stat"><div className="sdv-stat-val">{worklist.length}</div><div className="sdv-stat-lbl">Forms in scope</div></div>
        <div className="sdv-stat"><div className="sdv-stat-val green">{summary.fieldsVerified}<span className="sdv-stat-of">/{summary.fieldsTotal}</span></div><div className="sdv-stat-lbl">Fields verified</div></div>
        <div className="sdv-stat"><div className={`sdv-stat-val${discrepancies.open > 0 ? " amber" : " green"}`}>{discrepancies.open}</div><div className="sdv-stat-lbl">Discrepancies<span className="sdv-stat-sub"> · {discrepancies.resolved} resolved · {discrepancies.open} open</span></div></div>
        <div className="sdv-stat"><div className="sdv-stat-val green">{counts.complete}</div><div className="sdv-stat-lbl">Complete</div></div>
        <div className="sdv-stat"><div className="sdv-stat-val">{counts.pending}</div><div className="sdv-stat-lbl">Pending</div></div>
      </div>

      <div className="sdv-tabs">
        {([["all", "All"], ["pending", "Pending"], ["partial", "In progress"], ["complete", "Complete"]] as const).map(([k, label]) => (
          <button key={k} className={`sdv-tab${tab === k ? " active" : ""}`} type="button" onClick={() => setTab(k)}>
            {label} <span className={`sdv-tab-count tc-${k}`}>{counts[k]}</span>
          </button>
        ))}
      </div>

      <div className="sdv-toolbar">
        <div className="sdv-search"><i className="ti ti-search"></i><input type="search" placeholder="Search subject, form, visit, site…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <select className="sdv-select" value={siteF} onChange={(e) => setSiteF(e.target.value)}>
          <option value="all">All sites</option>{siteOptions.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}
        </select>
        <select className="sdv-select" value={visitF} onChange={(e) => setVisitF(e.target.value)}>
          <option value="all">All visits</option>{visitOptions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <span className="sdv-count">{filtered.length} {filtered.length === 1 ? "form" : "forms"}</span>
      </div>

      <div className="sdv-table-wrap">
        {filtered.length === 0 ? (
          <div className="sdv-empty"><i className="ti ti-shield-check"></i> No forms match these filters.</div>
        ) : (
          <table className="sdv-table">
            <thead>
              <tr>
                <SortTh label="Subject" sortKey="subject" sort={sort} onSort={toggleSort} />
                <SortTh label="Visit" sortKey="visit" sort={sort} onSort={toggleSort} />
                <SortTh label="Form" sortKey="form" sort={sort} onSort={toggleSort} />
                <SortTh label="Site" sortKey="site" sort={sort} onSort={toggleSort} />
                <SortTh label="SDV status" sortKey="status" sort={sort} onSort={toggleSort} />
                <th>Progress</th>
                <SortTh label="Last updated" sortKey="updated" sort={sort} onSort={toggleSort} />
                <SortTh label="Queries" sortKey="queries" sort={sort} onSort={toggleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const pct = r.totalRequiredFields ? Math.round((r.verifiedFields / r.totalRequiredFields) * 100) : 0;
                const idle = daysSince(r.lastActivity);
                const aging = !r.lastActivity ? null : idle > 14 ? "red" : idle >= 7 ? "amber" : null;
                return (
                  <tr key={r.formInstanceId} className="clickable" onClick={() => openForm(r)}>
                    <td><span className="sdv-subj mono" onClick={(e) => { e.stopPropagation(); router.push(`/study/${studyId}/data-entry/${r.subjectId}`); }}>{r.subjectCode}</span></td>
                    <td>{r.visitLabel}</td>
                    <td className="sdv-form">
                      {r.formName}
                      {aging && <i className={`ti ti-clock-exclamation sdv-aging sdv-aging-${aging}`} title={`No SDV activity for ${idle} days${aging === "red" ? " — follow up recommended" : ""}`}></i>}
                    </td>
                    <td className="sdv-site">{r.siteLabel}</td>
                    <td><span className={`sdv-status ${STATUS_META[r.sdvStatus].cls}`}>{STATUS_META[r.sdvStatus].label}</span></td>
                    <td>
                      <div className="sdv-prog-cell">
                        <div className="sdv-prog-track"><div className={`sdv-prog-fill tone-${PROG_TONE[r.sdvStatus]}`} style={{ width: `${pct}%` }}></div></div>
                        <span className="mono sdv-prog-n">{r.verifiedFields} / {r.totalRequiredFields} fields</span>
                      </div>
                    </td>
                    <td className="mono sdv-upd">{r.lastUpdated || "—"}</td>
                    <td>{r.openQueries > 0
                      ? <span style={{ color: "var(--red-600)", fontWeight: 500 }}>{r.openQueries}</span>
                      : <span style={{ color: "var(--color-text-placeholder)" }}>—</span>}</td>
                    <td><i className="ti ti-chevron-right sdv-chev"></i></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="sdv-summary">
        <span>Forms: <strong>{worklist.length}</strong></span>
        <span className="sdv-sum-green">Complete: <strong>{counts.complete}</strong></span>
        <span className="sdv-sum-amber">In progress: <strong>{counts.partial}</strong></span>
        <span>Pending: <strong>{counts.pending}</strong></span>
        <span className="sdv-sum-green">Fields verified: <strong>{summary.fieldsVerified}/{summary.fieldsTotal}</strong></span>
        <span className="sdv-sum-red">Open field queries: <strong>{summary.openQ}</strong></span>
      </div>
    </div>
  );
}

interface CertMeta {
  studyName: string; studyCode: string; siteLabel: string; date: string; craName: string; role: string;
  rows: SdvWorklistRow[]; totalFieldsVerified: number; discrepancies: number; openQueries: number;
}
function buildCertificateHtml(m: CertMeta): string {
  const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const statusLabel = (s: FormSdvStatus) => STATUS_META[s].label;
  const rowsHtml = m.rows.map((r) => `<tr>
    <td>${esc(r.formName)}</td><td class="mono">${esc(r.subjectCode)}</td><td>${esc(r.visitLabel)}</td>
    <td class="num">${r.verifiedFields} / ${r.totalRequiredFields}</td><td>${statusLabel(r.sdvStatus)}</td><td class="mono">${esc(r.lastUpdated || "—")}</td>
  </tr>`).join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>SDV Certificate — ${esc(m.studyCode)}</title>
<style>
  :root { --ink:#1f2933; --muted:#6d7480; --line:#d9dee5; --accent:#0f4c8a; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); margin: 0; padding: 48px; max-width: 900px; margin: 0 auto; }
  h1 { font-size: 24px; margin: 0 0 4px; color: var(--accent); }
  .sub { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; padding: 16px; background: #f7f9fc; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 28px; font-size: 13px; }
  .meta b { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: .04em; display: block; }
  h2 { font-size: 15px; margin: 28px 0 10px; border-bottom: 2px solid var(--accent); padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
  th { background: #f0f3f8; font-size: 11px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); }
  td.num, td.mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, "SF Mono", Menlo, monospace; }
  .summary td { font-size: 13px; }
  .summary td:first-child { color: var(--muted); }
  .summary td:last-child { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--line); font-size: 12.5px; color: var(--ink); }
  .cert-stmt { font-style: italic; color: var(--muted); margin-bottom: 28px; }
  .sig { display: flex; justify-content: space-between; align-items: flex-end; }
  .sig .line { border-top: 1px solid var(--ink); padding-top: 6px; min-width: 260px; font-size: 12px; }
  @media print { body { padding: 0; } }
</style></head><body>
  <h1>Source Data Verification Certificate</h1>
  <div class="sub">Generated ${esc(m.date)}</div>
  <div class="meta">
    <div><b>Study</b>${esc(m.studyName)} · ${esc(m.studyCode)}</div>
    <div><b>Site</b>${esc(m.siteLabel)}</div>
    <div><b>Date of verification</b>${esc(m.date)}</div>
    <div><b>CRA</b>${esc(m.craName)} · ${esc(m.role)}</div>
  </div>
  <h2>Summary</h2>
  <table class="summary"><tbody>
    <tr><td>Total forms reviewed</td><td>${m.rows.length}</td></tr>
    <tr><td>Total fields verified</td><td>${m.totalFieldsVerified}</td></tr>
    <tr><td>Discrepancies found</td><td>${m.discrepancies}</td></tr>
    <tr><td>Queries raised</td><td>${m.discrepancies}</td></tr>
    <tr><td>Open queries remaining</td><td>${m.openQueries}</td></tr>
  </tbody></table>
  <h2>Per-form breakdown</h2>
  <table><thead><tr><th>Form</th><th>Subject</th><th>Visit</th><th>Fields verified</th><th>Status</th><th>Date verified</th></tr></thead>
  <tbody>${rowsHtml || '<tr><td colspan="6">No forms in scope.</td></tr>'}</tbody></table>
  <div class="footer">
    <p class="cert-stmt">I certify that the above data has been verified against source documents in accordance with ICH E6 (R2) Good Clinical Practice guidelines.</p>
    <div class="sig">
      <div class="line">${esc(m.craName)} — CRA</div>
      <div class="line">Date: ${esc(m.date)}</div>
    </div>
  </div>
</body></html>`;
}

function exportCsv(rows: SdvWorklistRow[], studyCode: string) {
  const head = ["Subject", "Visit", "Form", "Site", "SDV status", "Verified", "Total", "Open queries", "Last updated"];
  const body = rows.map((r) => [r.subjectCode, r.visitLabel, r.formName, r.siteLabel, r.sdvStatus, r.verifiedFields, r.totalRequiredFields, r.openQueries, r.lastUpdated]);
  const csv = [head, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${studyCode}-sdv-worklist.csv`; a.click();
  URL.revokeObjectURL(url);
}
