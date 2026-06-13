"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import "../sites.css";

const STATUS_META: Record<string, { cls: string; label: string }> = {
  active: { cls: "st-badge-active", label: "Active" },
  setup: { cls: "st-badge-setup", label: "Setup" },
  paused: { cls: "st-badge-setup", label: "Paused" },
  closed: { cls: "st-badge-closed", label: "Closed" },
};
const STATUS_OPTIONS = ["active", "setup", "paused", "closed"];

export default function SiteRecordPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const siteId = String(params.siteId);
  const { study, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const isAdmin = activeRole === "Admin";

  const site = dataset.sites.find((s) => s.id === siteId);

  // ─── Enrollment metrics for this site ───────────────────────────────────────
  const metrics = useMemo(() => {
    const subjs = dataset.subjects.filter((s) => s.study_id === studyId && s.site_id === siteId);
    const cnt = (st: string) => subjs.filter((s) => s.status === st).length;
    const subjIds = new Set(subjs.map((s) => s.id));
    const instIds = new Set(dataset.formInstances.filter((i) => subjIds.has(i.subject_id)).map((i) => i.id));
    const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved").length;
    const studyRow = dataset.studies.find((s) => s.id === studyId);
    const nSites = dataset.sites.filter((s) => s.study_id === studyId).length || 1;
    return {
      enrolled: subjs.length,
      target: Math.round((studyRow?.enrollment_target ?? 0) / nSites),
      active: cnt("active"),
      completed: cnt("completed"),
      withdrawn: cnt("withdrawn"),
      screening: cnt("screening"),
      openQueries,
    };
  }, [dataset, studyId, siteId]);

  const [editOpen, setEditOpen] = useState(false);
  const [eName, setEName] = useState("");
  const [eNumber, setENumber] = useState("");
  const [ePi, setEPi] = useState("");
  const [eLocation, setELocation] = useState("");
  const [eStatus, setEStatus] = useState("active");

  function openEdit() {
    if (!site) return;
    setEName(site.name);
    setENumber(site.code);
    setEPi(site.principal_investigator ?? "");
    setELocation(site.location ?? "");
    setEStatus(site.status);
    setEditOpen(true);
  }
  function saveEdit() {
    if (!eName.trim() || !eNumber.trim()) return;
    update((d) => {
      const s = d.sites.find((x) => x.id === siteId);
      if (s) {
        s.name = eName.trim();
        s.code = eNumber.trim();
        s.principal_investigator = ePi.trim() || null;
        s.location = eLocation.trim() || null;
        s.status = eStatus;
      }
    });
    setEditOpen(false);
  }

  if (!ready) {
    return <div className="sites-screen"><div className="sites-loading"><i className="ti ti-loader-2"></i><span>Loading…</span></div></div>;
  }
  if (!site) {
    return (
      <div className="sites-screen">
        <div className="sites-empty" style={{ margin: "var(--space-8)" }}><i className="ti ti-alert-triangle"></i> Site not found.</div>
      </div>
    );
  }

  const sm = STATUS_META[site.status] || { cls: "st-badge-setup", label: site.status };
  const pct = metrics.target > 0 ? Math.min(100, Math.round((metrics.enrolled / metrics.target) * 100)) : 0;

  return (
    <div className="sites-screen">
      <div className="sites-header sr-header">
        <div>
          <nav className="sites-bc" aria-label="Breadcrumb">
            <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/sites`)}><span>Sites</span></button>
            <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
            <span className="st-bc-cur">{site.code}</span>
          </nav>
          <h1 className="sites-title">{site.name} <span className={`st-badge ${sm.cls}`}>{sm.label}</span></h1>
          <div className="sites-sub">Site {site.code} · {study.code}</div>
        </div>
        {isAdmin && (
          <button className="st-btn-secondary" type="button" onClick={openEdit}>
            <i className="ti ti-edit"></i> Edit
          </button>
        )}
      </div>

      <div className="site-record-body">
        {/* Site details */}
        <div className="st-card">
          <div className="st-card-title"><i className="ti ti-building-hospital"></i> Site details</div>
          <div className="st-detail-grid">
            <div className="st-detail"><span className="st-detail-lbl">Site number</span><span className="st-detail-val st-mono">{site.code}</span></div>
            <div className="st-detail"><span className="st-detail-lbl">Site name</span><span className="st-detail-val">{site.name}</span></div>
            <div className="st-detail"><span className="st-detail-lbl">Principal investigator</span><span className="st-detail-val">{site.principal_investigator ?? "—"}</span></div>
            <div className="st-detail"><span className="st-detail-lbl">Location</span><span className="st-detail-val">{site.location ?? "—"}</span></div>
            <div className="st-detail"><span className="st-detail-lbl">Contact</span><span className="st-detail-val st-muted">—</span></div>
            <div className="st-detail"><span className="st-detail-lbl">Status</span><span className="st-detail-val"><span className={`st-badge ${sm.cls}`}>{sm.label}</span></span></div>
          </div>
        </div>

        {/* Enrollment metrics */}
        <div className="st-card">
          <div className="st-card-title"><i className="ti ti-users"></i> Enrollment</div>
          <div className="st-enroll-big">
            <span className="st-enroll-num st-mono">{metrics.enrolled}</span>
            <span className="st-enroll-tgt">/ {metrics.target} target</span>
          </div>
          <div className="st-track lg"><div className="st-fill" style={{ width: `${pct}%` }}></div></div>
          <div className="st-metric-grid">
            <div className="st-metric"><span className="st-metric-v">{metrics.active}</span><span className="st-metric-l">Active</span></div>
            <div className="st-metric"><span className="st-metric-v">{metrics.completed}</span><span className="st-metric-l">Completed</span></div>
            <div className="st-metric"><span className="st-metric-v">{metrics.withdrawn}</span><span className="st-metric-l">Withdrawn</span></div>
            <div className="st-metric"><span className="st-metric-v">{metrics.screening}</span><span className="st-metric-l">Screening</span></div>
            <div className="st-metric"><span className={`st-metric-v${metrics.openQueries > 0 ? " st-warn" : ""}`}>{metrics.openQueries}</span><span className="st-metric-l">Open queries</span></div>
          </div>
        </div>

        {/* Staff / roles — placeholder */}
        <div className="st-card">
          <div className="st-card-title"><i className="ti ti-id-badge-2"></i> Site staff &amp; roles</div>
          <div className="st-staff-note">
            <i className="ti ti-info-circle"></i>
            Staff assignment and role-based site access arrive with the team module. Below is a placeholder roster.
          </div>
          <div className="st-staff-list">
            {[
              { name: "Site coordinator", role: "CRC" },
              { name: "Clinical monitor", role: "CRA" },
              { name: "Principal investigator", role: "PI" },
            ].map((m, i) => (
              <div className="st-staff-row" key={i}>
                <div className="st-staff-avatar">{m.role}</div>
                <span className="st-staff-name">{m.name}</span>
                <span className="st-muted">Unassigned</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Edit site modal (Admin) */}
      {editOpen && (
        <div className="st-modal-overlay" onClick={() => setEditOpen(false)}>
          <div className="st-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Edit site">
            <div className="st-modal-title"><i className="ti ti-edit"></i> Edit site</div>
            <label className="st-modal-field"><span>Site name <span className="req">*</span></span>
              <input className="st-modal-input" value={eName} onChange={(e) => setEName(e.target.value)} autoFocus /></label>
            <label className="st-modal-field"><span>Site number <span className="req">*</span></span>
              <input className="st-modal-input" value={eNumber} onChange={(e) => setENumber(e.target.value)} /></label>
            <label className="st-modal-field"><span>Principal investigator</span>
              <input className="st-modal-input" value={ePi} onChange={(e) => setEPi(e.target.value)} /></label>
            <label className="st-modal-field"><span>Location</span>
              <input className="st-modal-input" value={eLocation} onChange={(e) => setELocation(e.target.value)} /></label>
            <label className="st-modal-field"><span>Status</span>
              <select className="st-modal-input" value={eStatus} onChange={(e) => setEStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select></label>
            <div className="st-modal-actions">
              <button className="st-btn-secondary" type="button" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="st-btn-primary" type="button" disabled={!eName.trim() || !eNumber.trim()} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
