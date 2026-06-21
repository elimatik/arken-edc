"use client";

// Source Data Verification — worklist (the list). Clicking a row deep-links to the
// Subject Record for that subject + form with SDV mode active (?sdv=true); the field-
// by-field verification lives in the Subject Record, not a separate layout here.
// CRA verifies; DM gets a read-only view. Other roles redirect to the dashboard.
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
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

export default function SdvPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const { activeRole, study } = useShell();
  const { dataset, ready } = useStudySession();

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

  function openForm(r: SdvWorklistRow) {
    router.push(`/study/${studyId}/data-entry/${r.subjectId}?form=${r.formId}&sdv=true`);
  }

  if (!ready) return <div className="sdv-screen"><div className="sdv-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="sdv-screen"><div className="sdv-loading">Redirecting…</div></div>;

  return (
    <div className="sdv-screen">
      <div className="sdv-header">
        <div className="sdv-bc">Source Data Verification</div>
        <div className="sdv-title-row">
          <h1 className="sdv-title">Source Data Verification</h1>
          <button className="sdv-btn-secondary" type="button" onClick={() => exportCsv(filtered, study.code)}><i className="ti ti-download"></i> Export CSV</button>
        </div>
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
                return (
                  <tr key={r.formInstanceId} className="clickable" onClick={() => openForm(r)}>
                    <td><span className="sdv-subj mono" onClick={(e) => { e.stopPropagation(); router.push(`/study/${studyId}/data-entry/${r.subjectId}`); }}>{r.subjectCode}</span></td>
                    <td>{r.visitLabel}</td>
                    <td className="sdv-form">{r.formName}</td>
                    <td className="sdv-site">{r.siteLabel}</td>
                    <td><span className={`sdv-status ${STATUS_META[r.sdvStatus].cls}`}>{STATUS_META[r.sdvStatus].label}</span></td>
                    <td>
                      <div className="sdv-prog-cell">
                        <div className="sdv-prog-track"><div className="sdv-prog-fill" style={{ width: `${pct}%` }}></div></div>
                        <span className="mono sdv-prog-n">{r.verifiedFields}/{r.totalRequiredFields}</span>
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

function exportCsv(rows: SdvWorklistRow[], studyCode: string) {
  const head = ["Subject", "Visit", "Form", "Site", "SDV status", "Verified", "Total", "Open queries", "Last updated"];
  const body = rows.map((r) => [r.subjectCode, r.visitLabel, r.formName, r.siteLabel, r.sdvStatus, r.verifiedFields, r.totalRequiredFields, r.openQueries, r.lastUpdated]);
  const csv = [head, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${studyCode}-sdv-worklist.csv`; a.click();
  URL.revokeObjectURL(url);
}
