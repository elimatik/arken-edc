"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { TIME_ZONES } from "./constants";
import "./sites.css";

// study_status → badge class + label
const STATUS_META: Record<string, { cls: string; label: string }> = {
  active: { cls: "st-badge-active", label: "Active" },
  setup: { cls: "st-badge-setup", label: "Setup" },
  paused: { cls: "st-badge-setup", label: "Paused" },
  closed: { cls: "st-badge-closed", label: "Closed" },
};

interface SiteRow {
  id: string;
  code: string;
  name: string;
  pi: string;
  location: string;
  status: string;
  enrolled: number;
  target: number;
  openQueries: number;
}

export default function SitesPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const { study, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  const isAdmin = activeRole === "Admin";
  const [addOpen, setAddOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fNumber, setFNumber] = useState("");
  const [fTz, setFTz] = useState("UTC−6 · Central");
  const [fPiName, setFPiName] = useState("");
  const [fPiPhone, setFPiPhone] = useState("");
  const [fPiEmail, setFPiEmail] = useState("");

  // ─── Per-site rows from the session store ───────────────────────────────────
  const rows = useMemo<SiteRow[]>(() => {
    if (!ready) return [];
    const sites = dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code));
    const studyRow = dataset.studies.find((s) => s.id === studyId);
    const targetPerSite = sites.length ? Math.round((studyRow?.enrollment_target ?? 0) / sites.length) : 0;
    return sites.map((site) => {
      const subjs = dataset.subjects.filter((s) => s.study_id === studyId && s.site_id === site.id);
      const subjIds = new Set(subjs.map((s) => s.id));
      const instIds = new Set(dataset.formInstances.filter((i) => subjIds.has(i.subject_id)).map((i) => i.id));
      const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved").length;
      return {
        id: site.id,
        code: site.code,
        name: site.name,
        pi: site.principal_investigator ?? "—",
        location: site.location ?? "—",
        status: site.status,
        enrolled: subjs.length,
        target: targetPerSite,
        openQueries,
      };
    });
  }, [ready, dataset, studyId]);

  function createSite() {
    if (!fName.trim() || !fNumber.trim() || !fPiName.trim()) return;
    update((d) => {
      d.sites.push({
        id: crypto.randomUUID(), study_id: studyId, code: fNumber.trim(), name: fName.trim(),
        status: "active", location: null, principal_investigator: fPiName.trim(),
        time_zone: fTz, investigator_phone: fPiPhone.trim() || null, investigator_email: fPiEmail.trim() || null,
      });
    });
    setAddOpen(false);
    setFName(""); setFNumber(""); setFTz("UTC−6 · Central"); setFPiName(""); setFPiPhone(""); setFPiEmail("");
  }

  if (!ready) {
    return (
      <div className="sites-screen">
        <div className="sites-loading"><i className="ti ti-loader-2"></i><span>Loading sites…</span></div>
      </div>
    );
  }

  return (
    <div className="sites-screen">
      <div className="sites-header">
        <div>
          <h1 className="sites-title">Sites</h1>
          <div className="sites-sub">{study.code} · {rows.length} site{rows.length === 1 ? "" : "s"}</div>
        </div>
        {isAdmin && (
          <button className="st-btn-primary" type="button" onClick={() => setAddOpen(true)}>
            <i className="ti ti-plus"></i> Add site
          </button>
        )}
      </div>

      <div className="sites-table-wrap">
        <table className="sites-table">
          <thead>
            <tr>
              <th>Site #</th>
              <th>Site name</th>
              <th>Principal investigator</th>
              <th>Location</th>
              <th>Status</th>
              <th>Enrollment</th>
              <th>Open queries</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7}><div className="sites-empty"><i className="ti ti-building-hospital"></i> No sites yet.</div></td></tr>
            ) : (
              rows.map((r) => {
                const sm = STATUS_META[r.status] || { cls: "st-badge-setup", label: r.status };
                const pct = r.target > 0 ? Math.min(100, Math.round((r.enrolled / r.target) * 100)) : 0;
                return (
                  <tr key={r.id} className="clickable" onClick={() => router.push(`/study/${studyId}/sites/${r.id}`)}>
                    <td><span className="st-mono st-link">{r.code}</span></td>
                    <td><span className="st-link">{r.name}</span></td>
                    <td className="st-muted">{r.pi}</td>
                    <td className="st-muted">{r.location}</td>
                    <td><span className={`st-badge ${sm.cls}`}>{sm.label}</span></td>
                    <td>
                      <div className="st-enroll">
                        <span className="st-mono">{r.enrolled}/{r.target}</span>
                        <div className="st-track"><div className="st-fill" style={{ width: `${pct}%` }}></div></div>
                      </div>
                    </td>
                    <td><span className={`st-mono${r.openQueries > 0 ? " st-warn" : " st-muted"}`}>{r.openQueries > 0 ? r.openQueries : "—"}</span></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Site modal (Admin) — same fields as the drill-down shortcut */}
      {addOpen && (
        <div className="st-modal-overlay" onClick={() => setAddOpen(false)}>
          <div className="st-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add site">
            <div className="st-modal-title"><i className="ti ti-building-hospital"></i> Add site</div>
            <label className="st-modal-field"><span>Site name <span className="req">*</span></span>
              <input className="st-modal-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Lakeside Veterinary Specialists" autoFocus /></label>
            <label className="st-modal-field"><span>Site ID / number <span className="req">*</span></span>
              <input className="st-modal-input" value={fNumber} onChange={(e) => setFNumber(e.target.value)} placeholder="e.g. 104" /></label>
            <label className="st-modal-field"><span>Time zone</span>
              <select className="st-modal-input" value={fTz} onChange={(e) => setFTz(e.target.value)}>
                {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select></label>
            <label className="st-modal-field"><span>Investigator name <span className="req">*</span></span>
              <input className="st-modal-input" value={fPiName} onChange={(e) => setFPiName(e.target.value)} placeholder="e.g. Dr. Jane Doe, DVM" /></label>
            <label className="st-modal-field"><span>Investigator phone</span>
              <input className="st-modal-input" value={fPiPhone} onChange={(e) => setFPiPhone(e.target.value)} placeholder="e.g. 512-555-0100" /></label>
            <label className="st-modal-field"><span>Investigator email</span>
              <input className="st-modal-input" value={fPiEmail} onChange={(e) => setFPiEmail(e.target.value)} placeholder="e.g. j.doe@site.org" /></label>
            <div className="st-modal-actions">
              <button className="st-btn-secondary" type="button" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="st-btn-primary" type="button" disabled={!fName.trim() || !fNumber.trim() || !fPiName.trim()} onClick={createSite}>Add site</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
