"use client";

// Source Data Verification — CRA verifies entered values against source documents
// field-by-field; DM gets a read-only view (can still raise queries). Writes to the
// session-only sdvRecords; the dashboard SDV bars + lock-readiness read it live.
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import { buildSdvWorklist, getFormSdvFields, type SdvWorklistRow, type FormSdvStatus, type SdvFieldRow } from "@/lib/sdv-data";
import type { Dataset } from "@/lib/session-store/types";
import "./sdv.css";

const newId = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);

const STATUS_META: Record<FormSdvStatus, { label: string; cls: string }> = {
  pending: { label: "Pending", cls: "ss-pending" },
  partial: { label: "In progress", cls: "ss-partial" },
  complete: { label: "Complete", cls: "ss-complete" },
  queried: { label: "Queried", cls: "ss-queried" },
};
const FIELD_META: Record<string, { label: string; cls: string }> = {
  verified: { label: "Verified", cls: "fs-verified" },
  queried: { label: "Queried", cls: "fs-queried" },
  unverified: { label: "Unverified", cls: "fs-unverified" },
  "not-req": { label: "Not required", cls: "fs-notreq" },
};
const STATUS_RANK: Record<FormSdvStatus, number> = { queried: 0, pending: 1, partial: 2, complete: 3 };

export default function SdvPage() {
  const params = useParams();
  const studyId = String(params.studyId);
  const router = useRouter();
  const sp = useSearchParams();
  const formParam = sp.get("form");
  const { activeRole, study } = useShell();
  const { dataset, ready, update } = useStudySession();
  const ndaName = useNdaName();

  const canVerify = activeRole === "CRA"; // CRA verifies; DM is read-only (queries OK)
  const allowed = activeRole === "CRA" || activeRole === "DM";

  // Role gate — CRC / PI / Sponsor / Admin redirect to the dashboard.
  useEffect(() => {
    if (ready && !allowed) router.replace(`/study/${studyId}`);
  }, [ready, allowed, router, studyId]);

  // ─── Worklist state ─────────────────────────────────────────────────────────
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

  // Summary bar (live)
  const summary = useMemo(() => {
    const fieldsTotal = worklist.reduce((n, r) => n + r.totalRequiredFields, 0);
    const fieldsVerified = worklist.reduce((n, r) => n + r.verifiedFields, 0);
    const openQ = worklist.reduce((n, r) => n + r.openQueries, 0);
    return { fieldsTotal, fieldsVerified, openQ };
  }, [worklist]);

  // ─── Store writes ───────────────────────────────────────────────────────────
  function setVerified(fvId: string, formInstanceId: string, on: boolean) {
    update((d: Dataset) => {
      const rec = d.sdvRecords.find((r) => r.field_value_id === fvId);
      if (rec) { rec.status = on ? "verified" : "pending"; rec.verified_by_name = on ? ndaName : null; rec.verified_at = on ? todayISO() : null; }
      else if (on) d.sdvRecords.push({ id: newId(), form_instance_id: formInstanceId, field_value_id: fvId, status: "verified", verified_by_name: ndaName, verified_at: todayISO() });
    });
  }
  function verifyAllFields(rows: SdvFieldRow[], formInstanceId: string) {
    update((d: Dataset) => {
      for (const f of rows) {
        if (f.sdvStatus !== "unverified") continue; // skip verified / queried / not-req
        const rec = d.sdvRecords.find((r) => r.field_value_id === f.fieldValueId);
        if (rec) { rec.status = "verified"; rec.verified_by_name = ndaName; rec.verified_at = todayISO(); }
        else d.sdvRecords.push({ id: newId(), form_instance_id: formInstanceId, field_value_id: f.fieldValueId, status: "verified", verified_by_name: ndaName, verified_at: todayISO() });
      }
    });
  }
  function markComplete(rows: SdvFieldRow[], formInstanceId: string) {
    verifyAllFields(rows, formInstanceId);
    update((d: Dataset) => { const inst = d.formInstances.find((i) => i.id === formInstanceId); if (inst) inst.sdv_complete = true; });
  }

  if (!ready) return <div className="sdv-screen"><div className="sdv-loading"><i className="ti ti-loader-2"></i> Loading…</div></div>;
  if (!allowed) return <div className="sdv-screen"><div className="sdv-loading">Redirecting…</div></div>;

  // ═══ View 2 — Form SDV view ═════════════════════════════════════════════════
  if (formParam) {
    const row = worklist.find((r) => r.formInstanceId === formParam);
    const fields = getFormSdvFields(dataset, formParam);
    const required = fields.filter((f) => f.sdvStatus !== "not-req");
    const verified = required.filter((f) => f.sdvStatus === "verified").length;
    const anyQueried = required.some((f) => f.sdvStatus === "queried");
    const pct = required.length ? Math.round((verified / required.length) * 100) : 0;
    // group by section, preserving field order
    const sections: { name: string; rows: SdvFieldRow[] }[] = [];
    for (const f of fields) {
      let sec = sections.find((s) => s.name === f.section);
      if (!sec) { sec = { name: f.section, rows: [] }; sections.push(sec); }
      sec.rows.push(f);
    }
    const back = () => router.push(`/study/${studyId}/sdv`);
    return (
      <div className="sdv-screen">
        <div className="sdv-form-header">
          <button className="sdv-back" type="button" onClick={back}><i className="ti ti-arrow-left"></i> Back to SDV worklist</button>
          <div className="sdv-fh-row">
            <div>
              <h1 className="sdv-fh-title">{row?.formName ?? "Form"}</h1>
              <div className="sdv-fh-sub">
                <span className="sdv-link mono" onClick={() => row && router.push(`/study/${studyId}/data-entry/${row.subjectId}`)}>{row?.subjectCode ?? "—"}</span>
                {row?.visitLabel ? <> · {row.visitLabel}</> : null}{row?.siteLabel && row.siteLabel !== "—" ? <> · {row.siteLabel}</> : null}
              </div>
            </div>
            {canVerify && (
              <div className="sdv-fh-actions">
                <button className="sdv-btn-secondary" type="button" onClick={() => verifyAllFields(fields, formParam)}>Verify all</button>
                <button className="sdv-btn-primary" type="button" disabled={anyQueried} title={anyQueried ? "Resolve open queries before completing SDV" : undefined} onClick={() => markComplete(fields, formParam)}>
                  <i className="ti ti-shield-check"></i> Mark SDV complete
                </button>
              </div>
            )}
          </div>
          <div className="sdv-progress">
            <span className="sdv-progress-lbl">SDV progress</span>
            <div className="sdv-progress-track"><div className="sdv-progress-fill" style={{ width: `${pct}%` }}></div></div>
            <span className="sdv-progress-count mono">{verified}/{required.length} fields verified</span>
          </div>
          <div className="sdv-legend">
            <span><span className="sdv-dot fs-verified"></span>Verified</span>
            <span><span className="sdv-dot fs-queried"></span>Queried</span>
            <span><span className="sdv-dot fs-unverified"></span>Unverified</span>
            <span><span className="sdv-dot fs-notreq"></span>Not required</span>
          </div>
        </div>

        <div className="sdv-fields">
          {sections.map((sec) => (
            <div key={sec.name}>
              <div className="sdv-section-title">{sec.name}</div>
              {sec.rows.map((f) => (
                <div key={f.fieldValueId} className={`sdv-field ${f.sdvStatus}`}>
                  <div className="sdv-field-main">
                    <span className="sdv-field-name">{f.fieldName}</span>
                    <span className="sdv-field-code mono">{f.fieldCode}</span>
                    <span className="sdv-field-value mono">{f.fieldValue}</span>
                    {f.flagged && <i className="ti ti-alert-triangle sdv-flag" title="Open edit check"></i>}
                    {f.sdvStatus === "verified" && f.enteredBy !== "—" && <span className="sdv-field-by">Verified by {f.enteredBy}</span>}
                  </div>
                  <span className={`sdv-field-badge ${FIELD_META[f.sdvStatus].cls}`}>{FIELD_META[f.sdvStatus].label}</span>
                  <div className="sdv-field-actions">
                    {f.sdvStatus === "not-req" ? (
                      <span className="sdv-notreq-txt">Derived</span>
                    ) : f.sdvStatus === "queried" ? (
                      <button className="sdv-act queried" type="button" onClick={() => router.push(`/study/${studyId}/queries`)}><i className="ti ti-flag"></i> Queried — view thread</button>
                    ) : f.sdvStatus === "verified" ? (
                      canVerify
                        ? <button className="sdv-act verified" type="button" onClick={() => { if (confirm("Un-verify this field?")) setVerified(f.fieldValueId, formParam, false); }}><i className="ti ti-shield-check-filled"></i> Verified</button>
                        : <span className="sdv-notreq-txt">Verified</span>
                    ) : (
                      <>
                        {canVerify && <button className="sdv-act verify" type="button" onClick={() => setVerified(f.fieldValueId, formParam, true)}><i className="ti ti-check"></i> Verify</button>}
                        <button className="sdv-act query" type="button" onClick={() => row && router.push(`/study/${studyId}/data-entry/${row.subjectId}`)}><i className="ti ti-flag"></i> Query</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ═══ View 1 — Worklist ══════════════════════════════════════════════════════
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
                  <tr key={r.formInstanceId} className="clickable" onClick={() => router.push(`/study/${studyId}/sdv?form=${r.formInstanceId}`)}>
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
                    <td>{r.openQueries > 0 ? <span className="sdv-q"><i className="ti ti-flag-filled"></i> {r.openQueries}</span> : <span className="muted">—</span>}</td>
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
