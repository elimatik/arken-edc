"use client";

// ════════════════════════════════════════════════════════════════════════════
// Canonical Site Record — translated from 27-site-record.html.
// THE one site-record page. Reachable from three entry points:
//   (a) Admin: Sites nav → site table → row
//   (b) CRC/CRA/DM/PI: Data Entry drill-down → "Open site record" at site level
//   (c) Settings (future) — site management surface
// Admin gets full edit capability (Edit toggle → editable site info / regulatory
// + Add amendment / Log visit / Add contact). Clinical roles see read-only.
// Site name / ID / location / PI / status / time zone are wired to the session
// store; amendments, visits, regulatory documents are illustrative (the store
// doesn't model them yet).
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { TIME_ZONES } from "../constants";
import "../sites.css";

const STATUS_META: Record<string, { dot: string; label: string }> = {
  active: { dot: "dot-active", label: "Active" },
  setup: { dot: "dot-pending", label: "Setup" },
  paused: { dot: "dot-hold", label: "Paused" },
  closed: { dot: "dot-closed", label: "Closed" },
};
const STATUS_OPTIONS = ["active", "setup", "paused", "closed"];

// Illustrative monitoring/amendment data (not modelled in the store).
const AMENDMENTS = [
  { id: "v2.1", version: "v2.1", date: "2026-01-10", summary: "Safety monitoring interval reduced from 4 weeks to 2 weeks", current: true, effective: "2026-01-17", approvedBy: "Sponsor Medical Monitor", reason: "Safety — monitoring change", impacted: "Section 6.3 — Safety Monitoring", description: "Safety monitoring interval for Group A (Dose) subjects reduced from 4-week to 2-week follow-up visits following interim safety review. No changes to primary endpoint or dosing regimen.", files: ["Protocol_v2.1_Amendment_2026-01-10.pdf", "IACUC_Approval_Amendment1.pdf"] },
  { id: "v2.0", version: "v2.0", date: "2025-11-03", summary: "Added secondary endpoint — body weight change at week 8", current: false, effective: "2025-11-10", approvedBy: "Sponsor Medical Monitor", reason: "Efficacy — endpoint modification", impacted: "Section 5.2 — Secondary Endpoints", description: "Added body weight change at week 8 as a secondary efficacy endpoint. Week 8 Assessment form updated accordingly.", files: ["Protocol_v2.0_2025-11-03.pdf"] },
  { id: "v1.0", version: "v1.0", date: "2025-08-20", summary: "Original protocol — site activation", current: false, effective: "2025-09-12", approvedBy: "AgriVet Sciences", reason: "Original protocol", impacted: "—", description: "Original protocol issued at site activation.", files: ["Protocol_v1.0_Original_2025-08-20.pdf"] },
];
const VISITS = [
  { id: "v3", date: "2026-05-02", by: "James Hollis", reason: "Routine monitoring visit", affiliation: "AgriVet Sciences (Sponsor)", time: "09:00 — 16:30", notes: "SDV completed for all animals in Barn A, Pen 1 and Pen 2. 3 queries raised on Week 4 Assessment forms — minor data entry discrepancies. Protocol compliance satisfactory. No major findings.", files: ["Monitoring_Report_2026-05-02.pdf"] },
  { id: "v2", date: "2026-01-15", by: "James Hollis", reason: "Amendment review & re-training", affiliation: "AgriVet Sciences (Sponsor)", time: "10:00 — 14:00", notes: "Reviewed v2.1 protocol amendment with site team. Re-training completed for all CRCs on revised monitoring schedule. Delegation log updated. No issues.", files: ["Visit_Report_2026-01-15.pdf"] },
  { id: "v1", date: "2025-09-12", by: "James Hollis · Sarah Kim", reason: "Site initiation visit", affiliation: "AgriVet Sciences + Site", time: "08:30 — 17:00", notes: "Site initiation visit completed. Delegation log signed. Equipment calibrated. All staff GCP-trained. Site ready for first subject screening.", files: ["Site_Initiation_Report_2025-09-12.pdf", "Delegation_Log_Signed.pdf"] },
];

export default function SiteRecordPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const siteId = String(params.siteId);
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const isAdmin = activeRole === "Admin";

  const site = dataset.sites.find((s) => s.id === siteId);

  // ─── Live metrics for this site ─────────────────────────────────────────────
  const metrics = useMemo(() => {
    const subjs = dataset.subjects.filter((s) => s.study_id === studyId && s.site_id === siteId);
    const subjIds = new Set(subjs.map((s) => s.id));
    const insts = dataset.formInstances.filter((i) => subjIds.has(i.subject_id));
    const instIds = new Set(insts.map((i) => i.id));
    const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved").length;
    const studyRow = dataset.studies.find((s) => s.id === studyId);
    const nSites = dataset.sites.filter((s) => s.study_id === studyId).length || 1;
    const target = Math.round((studyRow?.enrollment_target ?? 0) / nSites);
    const formsSubmitted = insts.filter((i) => i.status !== "empty").length;
    return { enrolled: subjs.length, target, pct: target ? Math.min(100, Math.round((subjs.length / target) * 100)) : 0, openQueries, formsSubmitted };
  }, [dataset, studyId, siteId]);

  // ─── Editable form (real fields wired to the store + illustrative defaults) ──
  const [editing, setEditing] = useState(false);
  const initForm = (s: typeof site) => ({
    name: s?.name ?? "",
    status: s?.status ?? "active",
    timezone: s?.time_zone ?? "UTC−6 · Central",
    piName: s?.principal_investigator ?? "",
    piPhone: s?.investigator_phone ?? "",
    piEmail: s?.investigator_email ?? "",
    location: s?.location ?? "",
  });
  const [form, setForm] = useState(() => initForm(site));
  useEffect(() => {
    if (site && !editing) setForm(initForm(site));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.id, site?.name, site?.status, editing]);
  const set = (k: keyof ReturnType<typeof initForm>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const [openAmend, setOpenAmend] = useState<Set<string>>(new Set(["v2.1"]));
  const [openVisit, setOpenVisit] = useState<Set<string>>(new Set(["v3"]));
  const [newAmend, setNewAmend] = useState(false);
  const [newVisit, setNewVisit] = useState(false);
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function saveSiteInfo() {
    update((d) => {
      const s = d.sites.find((x) => x.id === siteId);
      if (s) {
        s.name = form.name.trim();
        s.status = form.status;
        s.time_zone = form.timezone;
        s.principal_investigator = form.piName.trim() || null;
        s.investigator_phone = form.piPhone.trim() || null;
        s.investigator_email = form.piEmail.trim() || null;
        s.location = form.location.trim() || null;
      }
    });
    setEditing(false);
  }

  if (!ready) return <div className="sites-screen"><div className="sites-loading"><i className="ti ti-loader-2"></i><span>Loading…</span></div></div>;
  if (!site) return <div className="sites-screen"><div className="sites-empty" style={{ margin: "var(--space-8)" }}><i className="ti ti-alert-triangle"></i> Site not found.</div></div>;

  const sm = STATUS_META[form.status] || STATUS_META.setup;
  const ro = !editing; // read-only when not in edit mode
  const [city, state] = (form.location || "").split(",").map((x) => x.trim());

  return (
    <div className="sites-screen sr-rec">
      {/* Header */}
      <div className="sr-page-header">
        <nav className="sites-bc" aria-label="Breadcrumb">
          {isAdmin ? (
            <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/sites`)}><span>Sites</span></button>
          ) : (
            <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/data-entry`)}><span>Data Entry</span></button>
          )}
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">{site.name}</span>
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">Site record</span>
        </nav>
        <div className="sr-title-row">
          <div>
            <div className="sr-title">{site.name}</div>
            <div className="sr-title-sub">{site.code} · Site record</div>
          </div>
          <div className="sr-actions">
            <button className="st-btn-secondary" type="button"><i className="ti ti-download"></i> Export</button>
            <button className="st-btn-secondary" type="button"><i className="ti ti-clipboard-list"></i> Audit trail</button>
            {isAdmin && !editing && (
              <button className="st-btn-primary" type="button" onClick={() => setEditing(true)}><i className="ti ti-pencil"></i> Edit</button>
            )}
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="sr-stat-strip">
        <div className="sr-stat">
          <div className="sr-stat-val">{metrics.enrolled} <span className="sr-stat-of">/ {metrics.target}</span></div>
          <div className="sr-stat-lbl">Subjects enrolled</div>
          <div className="sr-progress"><div className="sr-progress-track"><div className="sr-progress-fill" style={{ width: `${metrics.pct}%` }}></div></div><span className="st-mono sr-pct">{metrics.pct}%</span></div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-status"><span className={`status-dot ${sm.dot}`}></span><span className="sr-stat-val sm">{sm.label}</span></div>
          <div className="sr-stat-lbl">Site status</div>
          <div className="sr-stat-sub">Activated 2025-09-12</div>
        </div>
        <div className="sr-stat">
          <div className={`sr-stat-val${metrics.openQueries > 0 ? " warn" : ""}`}>{metrics.openQueries}</div>
          <div className="sr-stat-lbl">Open queries</div>
          <div className="sr-stat-sub">{metrics.openQueries > 0 ? "needs review" : "all clear"}</div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-val">{metrics.formsSubmitted}</div>
          <div className="sr-stat-lbl">Forms submitted</div>
          <div className="sr-stat-sub">Across all subjects</div>
        </div>
        <div className="sr-stat">
          <div className="sr-stat-val sm">v2.1</div>
          <div className="sr-stat-lbl">Current protocol</div>
          <div className="sr-stat-sub">Est. close 2026-12-31</div>
        </div>
      </div>

      <div className="sr-scroll">
        <div className="sr-content-col">

          {/* ══ CARD 1: Site information ══ */}
          <div className="sr-card">
            <div className="sr-card-header"><div><div className="sr-card-title">Site information</div><div className="sr-card-sub">General details and address</div></div></div>
            <div className="sr-card-body">
              <div className="sr-section-title">Identification</div>
              <div className="sr-grid-3" style={{ marginBottom: "var(--space-5)" }}>
                <Field label="Site name" req><input className="sr-input" value={form.name} readOnly={ro} onChange={(e) => set("name", e.target.value)} /></Field>
                <Field label="Site ID" hint="Assigned by system at creation"><input className="sr-input mono" value={site.code} readOnly tabIndex={-1} /></Field>
                <Field label="Site type"><select className="sr-select" defaultValue="Research facility" disabled={ro}><option>Research facility</option><option>Veterinary clinic</option><option>University farm</option><option>Commercial farm</option><option>Field site</option></select></Field>
              </div>
              <div className="sr-section-title">Address</div>
              <div className="sr-grid-2" style={{ marginBottom: "var(--space-5)" }}>
                <Field label="City"><input className="sr-input" value={city ?? ""} readOnly={ro} onChange={(e) => set("location", `${e.target.value}${state ? `, ${state}` : ""}`)} /></Field>
                <Field label="State / Province"><input className="sr-input" value={state ?? ""} readOnly={ro} onChange={(e) => set("location", `${city ?? ""}, ${e.target.value}`)} /></Field>
                <Field label="Postal / ZIP"><input className="sr-input mono" defaultValue="" placeholder="—" readOnly={ro} /></Field>
                <Field label="Country"><select className="sr-select" defaultValue="United States" disabled={ro}><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Australia</option><option>Germany</option></select></Field>
              </div>
              <div className="sr-section-title">Operational</div>
              <div className="sr-grid-3">
                <Field label="Time zone"><select className="sr-select" value={form.timezone} disabled={ro} onChange={(e) => set("timezone", e.target.value)}>{TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}</select></Field>
                <Field label="Status"><select className="sr-select" value={form.status} disabled={ro} onChange={(e) => set("status", e.target.value)}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select></Field>
                <Field label="Language"><select className="sr-select" defaultValue="English" disabled={ro}><option>English</option><option>Spanish</option><option>French</option></select></Field>
              </div>
            </div>
            {editing && (
              <div className="sr-card-footer">
                <button className="st-btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
                <button className="st-btn-primary" type="button" onClick={saveSiteInfo}><i className="ti ti-circle-check"></i> Save changes</button>
              </div>
            )}
          </div>

          {/* ══ CARD 2: Site contacts ══ */}
          <div className="sr-card">
            <div className="sr-card-header">
              <div><div className="sr-card-title">Site contacts</div><div className="sr-card-sub">Principal investigator, coordinators, and monitor</div></div>
              {isAdmin && <button className="st-btn-secondary" type="button"><i className="ti ti-user-plus"></i> Add contact</button>}
            </div>
            <div>
              <Contact initials={initialsOf(form.piName) || "PI"} name={form.piName || "—"} role="Principal Investigator" email={form.piEmail || "—"} badge="PI" badgeCls="badge-active" admin={isAdmin} />
              <Contact initials="SK" name="Sarah Kim" role="Clinical Research Coordinator" email="s.kim@site.org" badge="CRC" badgeCls="badge-active" admin={isAdmin} />
              <Contact initials="JH" name="James Hollis" role="CRA / Site Monitor" email="j.hollis@sponsor.com" badge="CRA" badgeCls="badge-hold" admin={isAdmin} />
            </div>
          </div>

          {/* ══ CARD 3: Protocol & amendments ══ */}
          <div className="sr-card">
            <div className="sr-card-header">
              <div><div className="sr-card-title">Protocol &amp; amendments</div><div className="sr-card-sub">Version history, approval dates, and change summaries</div></div>
              {isAdmin && <button className="st-btn-secondary" type="button" onClick={() => setNewAmend(true)}><i className="ti ti-plus"></i> Add amendment</button>}
            </div>
            <div className="sr-list">
              {AMENDMENTS.map((a) => {
                const isOpen = openAmend.has(a.id);
                return (
                  <div className={`sr-row${isOpen ? " open" : ""}`} key={a.id}>
                    <div className="sr-row-header" onClick={() => toggle(setOpenAmend, a.id)}>
                      <i className="ti ti-chevron-right sr-chevron"></i>
                      <span className="sr-row-v">{a.version}</span>
                      <span className="sr-row-date">{a.date}</span>
                      <span className="sr-row-summary">{a.summary}</span>
                      {a.current && <span className="badge badge-current">Current</span>}
                    </div>
                    {isOpen && (
                      <div className="sr-row-body">
                        <div className="sr-grid-4" style={{ marginBottom: "var(--space-4)" }}>
                          <Field label="Protocol version"><input className="sr-input mono" defaultValue={a.version} readOnly /></Field>
                          <Field label="Amendment date"><input className="sr-input mono" defaultValue={a.date} readOnly /></Field>
                          <Field label="Effective date"><input className="sr-input mono" defaultValue={a.effective} readOnly /></Field>
                          <Field label="Approved by"><input className="sr-input" defaultValue={a.approvedBy} readOnly /></Field>
                        </div>
                        <div className="sr-grid-2" style={{ marginBottom: "var(--space-4)" }}>
                          <Field label="Amendment reason"><input className="sr-input" defaultValue={a.reason} readOnly /></Field>
                          <Field label="Impacted sections"><input className="sr-input" defaultValue={a.impacted} readOnly /></Field>
                          <Field label="Description of changes" span2><textarea className="sr-textarea" defaultValue={a.description} readOnly /></Field>
                        </div>
                        <div className="sr-section-title">Documents</div>
                        {a.files.map((f) => <FileRow key={f} name={f} admin={isAdmin} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {newAmend && isAdmin && (
              <div className="sr-new">
                <div className="sr-new-header"><i className="ti ti-plus"></i><span>New amendment</span><button className="btn-x" onClick={() => setNewAmend(false)}><i className="ti ti-x"></i></button></div>
                <div className="sr-new-body">
                  <div className="sr-grid-4" style={{ marginBottom: "var(--space-4)" }}>
                    <Field label="Protocol version" req><input className="sr-input mono" placeholder="v2.2" /></Field>
                    <Field label="Amendment date" req><input className="sr-input mono" placeholder="2026-MM-DD" /></Field>
                    <Field label="Effective date"><input className="sr-input mono" placeholder="2026-MM-DD" /></Field>
                    <Field label="Approved by"><input className="sr-input" placeholder="Name or organisation" /></Field>
                  </div>
                  <Field label="Description of changes" req><textarea className="sr-textarea" placeholder="Describe what changed and why…" /></Field>
                  <div className="sr-new-actions">
                    <button className="st-btn-secondary" type="button" onClick={() => setNewAmend(false)}>Cancel</button>
                    <button className="st-btn-primary" type="button" onClick={() => setNewAmend(false)}><i className="ti ti-circle-check"></i> Save amendment</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══ CARD 4: Regulatory & ethics ══ */}
          <div className="sr-card">
            <div className="sr-card-header"><div><div className="sr-card-title">Regulatory &amp; ethics</div><div className="sr-card-sub">IACUC approval, compliance references</div></div></div>
            <div className="sr-card-body">
              <div className="sr-grid-2" style={{ marginBottom: "var(--space-5)" }}>
                <Field label="IACUC / ethics number" req><input className="sr-input mono" defaultValue="IACUC-2025-0347" readOnly={ro} /></Field>
                <Field label="Issuing body"><input className="sr-input" defaultValue="University IACUC" readOnly={ro} /></Field>
                <Field label="Approval date"><input className="sr-input mono" defaultValue="2025-08-15" readOnly={ro} /></Field>
                <Field label="Expiry date" hint="Current — 14 months remaining"><input className="sr-input mono" defaultValue="2027-08-14" readOnly={ro} /></Field>
              </div>
              <div className="sr-section-title">Additional references</div>
              <div className="sr-grid-2">
                <Field label="FDA / authority ref."><input className="sr-input mono" defaultValue="IND-122884" readOnly={ro} /></Field>
                <Field label="Sponsor contract ref."><input className="sr-input mono" defaultValue="AGV-2025-001" readOnly={ro} /></Field>
                <Field label="Regulatory notes" span2><textarea className="sr-textarea" defaultValue="Annual renewal required. Site staff must complete GCP refresher by October 2026." readOnly={ro} /></Field>
              </div>
            </div>
            {editing && (
              <div className="sr-card-footer">
                <button className="st-btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
                <button className="st-btn-primary" type="button" onClick={() => setEditing(false)}><i className="ti ti-circle-check"></i> Save changes</button>
              </div>
            )}
          </div>

          {/* ══ CARD 5: Site visits ══ */}
          <div className="sr-card">
            <div className="sr-card-header">
              <div><div className="sr-card-title">Site visits</div><div className="sr-card-sub">Monitoring, initiation, and inspection visits</div></div>
              {isAdmin && <button className="st-btn-secondary" type="button" onClick={() => setNewVisit(true)}><i className="ti ti-plus"></i> Log visit</button>}
            </div>
            <div className="sr-list">
              {VISITS.map((v) => {
                const isOpen = openVisit.has(v.id);
                return (
                  <div className={`sr-row${isOpen ? " open" : ""}`} key={v.id}>
                    <div className="sr-row-header" onClick={() => toggle(setOpenVisit, v.id)}>
                      <i className="ti ti-chevron-right sr-chevron"></i>
                      <span className="sr-row-date">{v.date}</span>
                      <span className="sr-row-by">{v.by}</span>
                      <span className="sr-row-reason">{v.reason}</span>
                      <span className="badge badge-success" style={{ marginLeft: "auto" }}>Complete</span>
                    </div>
                    {isOpen && (
                      <div className="sr-row-body">
                        <div className="sr-grid-3" style={{ marginBottom: "var(--space-4)" }}>
                          <Field label="Visit date & time"><input className="sr-input mono" defaultValue={`${v.date} · ${v.time}`} readOnly /></Field>
                          <Field label="Completed by"><input className="sr-input" defaultValue={v.by} readOnly /></Field>
                          <Field label="Visitor affiliation"><input className="sr-input" defaultValue={v.affiliation} readOnly /></Field>
                          <Field label="Visit findings & notes" span3><textarea className="sr-textarea" defaultValue={v.notes} readOnly /></Field>
                        </div>
                        <div className="sr-section-title">Documents</div>
                        {v.files.map((f) => <FileRow key={f} name={f} admin={isAdmin} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {newVisit && isAdmin && (
              <div className="sr-new">
                <div className="sr-new-header"><i className="ti ti-plus"></i><span>Log new visit</span><button className="btn-x" onClick={() => setNewVisit(false)}><i className="ti ti-x"></i></button></div>
                <div className="sr-new-body">
                  <div className="sr-grid-3" style={{ marginBottom: "var(--space-4)" }}>
                    <Field label="Visit date & time" req><input className="sr-input mono" placeholder="2026-MM-DD · HH:MM" /></Field>
                    <Field label="Completed by" req><input className="sr-input" placeholder="Name(s) of visitor(s)" /></Field>
                    <Field label="Visitor affiliation"><input className="sr-input" placeholder="Sponsor, CRO, agency…" /></Field>
                    <Field label="Visit findings & notes" span3><textarea className="sr-textarea" placeholder="Findings, observations, follow-up actions…" /></Field>
                  </div>
                  <div className="sr-new-actions">
                    <button className="st-btn-secondary" type="button" onClick={() => setNewVisit(false)}>Cancel</button>
                    <button className="st-btn-primary" type="button" onClick={() => setNewVisit(false)}><i className="ti ti-circle-check"></i> Save visit</button>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Small presentational helpers ──────────────────────────────────────────────
function Field({ label, req, hint, span2, span3, children }: { label: string; req?: boolean; hint?: string; span2?: boolean; span3?: boolean; children: React.ReactNode }) {
  return (
    <div className={`sr-field${span2 ? " span-2" : ""}${span3 ? " span-3" : ""}`}>
      <label className="sr-label">{label}{req && <span className="req"> *</span>}</label>
      {children}
      {hint && <span className="sr-hint">{hint}</span>}
    </div>
  );
}
function Contact({ initials, name, role, email, badge, badgeCls, admin }: { initials: string; name: string; role: string; email: string; badge: string; badgeCls: string; admin: boolean }) {
  return (
    <div className="sr-contact">
      <div className="sr-contact-avatar">{initials}</div>
      <div className="sr-contact-body">
        <div className="sr-contact-name">{name}</div>
        <div className="sr-contact-role">{role}</div>
        <div className="sr-contact-email">{email}</div>
      </div>
      <span className={`badge ${badgeCls}`} style={{ fontSize: "10px" }}>{badge}</span>
      {admin && <><button className="st-icon-btn" title="Edit"><i className="ti ti-pencil"></i></button><button className="st-icon-btn" title="Remove"><i className="ti ti-trash"></i></button></>}
    </div>
  );
}
function FileRow({ name, admin }: { name: string; admin: boolean }) {
  return (
    <div className="sr-file">
      <div className="sr-file-icon"><i className="ti ti-file-type-pdf"></i></div>
      <span className="sr-file-name">{name}</span>
      <button className="st-icon-btn" title="Download"><i className="ti ti-download"></i></button>
      {admin && <button className="st-icon-btn" title="Remove"><i className="ti ti-trash"></i></button>}
    </div>
  );
}
function initialsOf(name: string): string {
  const parts = name.replace(/^(Dr\.?|Prof\.?)\s+/i, "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase();
}
