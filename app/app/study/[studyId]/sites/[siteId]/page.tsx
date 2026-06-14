"use client";

// ════════════════════════════════════════════════════════════════════════════
// Canonical Site Record — two tabs.
//   Overview — static configuration (Site Information + Regulatory & Ethics with
//     the Continuing Review log and IEC-expiry alerts). Admin inline-edit, saved
//     directly to the session (no Submit-for-review).
//   Forms — site-scoped form flow (SIV checklist, Staff & Delegation Log,
//     Monitoring Visit Reports, Protocol Amendments, Site Close-out) with edit
//     checks, required-field gating and Submit-for-review.
// Reachable from the Sites nav (Admin) and the Data Entry "Open site record".
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { ScopedFormFlow, ScopedRepeatingTable } from "@/components/scoped-forms/ScopedForms";
import { TIME_ZONES } from "../constants";
import "../sites.css";

const STATUS_META: Record<string, { dot: string; label: string }> = {
  active: { dot: "dot-active", label: "Active" },
  setup: { dot: "dot-pending", label: "In Setup" },
  paused: { dot: "dot-hold", label: "Suspended" },
  closed: { dot: "dot-closed", label: "Closed" },
};
const STATUS_OPTIONS = ["active", "setup", "paused", "closed"];

const daysUntil = (iso?: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - new Date().getTime()) / 86400000);
};
function expiryChip(iso?: string | null) {
  const d = daysUntil(iso);
  if (d == null) return null;
  if (d < 0) return { cls: "red", text: "Expired", icon: "ti-alert-octagon" };
  if (d <= 60) return { cls: "amber", text: `${d}d to expiry`, icon: "ti-alert-triangle" };
  return { cls: "green", text: "Current", icon: "ti-circle-check" };
}

export default function SiteRecordPage() {
  const router = useRouter();
  const params = useParams();
  const sp = useSearchParams();
  const studyId = String(params.studyId);
  const siteId = String(params.siteId);
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const isAdmin = activeRole === "Admin";

  const tab = sp.get("tab") === "forms" ? "forms" : "overview";
  const setTab = (t: "overview" | "forms") => router.replace(`/study/${studyId}/sites/${siteId}?tab=${t}`);

  const site = dataset.sites.find((s) => s.id === siteId);
  const continuingForm = dataset.forms.find((f) => f.study_id === studyId && f.scope === "site" && f.name === "Continuing Review");

  const metrics = useMemo(() => {
    const subjs = dataset.subjects.filter((s) => s.study_id === studyId && s.site_id === siteId);
    const subjIds = new Set(subjs.map((s) => s.id));
    const insts = dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));
    const instIds = new Set(insts.map((i) => i.id));
    const openQueries = dataset.queries.filter((q) => instIds.has(q.form_instance_id) && q.status !== "resolved").length;
    const studyRow = dataset.studies.find((s) => s.id === studyId);
    const nSites = dataset.sites.filter((s) => s.study_id === studyId).length || 1;
    const target = Math.round((studyRow?.enrollment_target ?? 0) / nSites);
    const active = subjs.filter((s) => s.status === "active").length;
    const completed = subjs.filter((s) => s.status === "completed").length;
    const withdrawn = subjs.filter((s) => s.status === "withdrawn").length;
    const screening = subjs.filter((s) => s.status === "screening").length;
    return { enrolled: subjs.length, target, pct: target ? Math.min(100, Math.round((subjs.length / target) * 100)) : 0, openQueries, active, completed, withdrawn, screening };
  }, [dataset, studyId, siteId]);

  // ─── Editable Overview config (Site Information + Regulatory & Ethics) ───────
  const [editingInfo, setEditingInfo] = useState(false);
  const [editingReg, setEditingReg] = useState(false);
  const initForm = (s: typeof site) => ({
    name: s?.name ?? "", status: s?.status ?? "active", timezone: s?.time_zone ?? "UTC−6 · Central",
    city: s?.city ?? (s?.location || "").split(",")[0]?.trim() ?? "", state_country: s?.state_country ?? (s?.location || "").split(",")[1]?.trim() ?? "",
    iec_name: s?.iec_name ?? "University IACUC", iec_ref: s?.iec_ref ?? "IACUC-2025-0347",
    iec_approval_date: s?.iec_approval_date ?? "2025-08-15", iec_expiry_date: s?.iec_expiry_date ?? "2026-07-25",
    regulatory_authority: s?.regulatory_authority ?? "USDA", import_export_required: s?.import_export_required ?? "No", permit_number: s?.permit_number ?? "",
  });
  const [form, setForm] = useState(() => initForm(site));
  useEffect(() => { if (site && !editingInfo && !editingReg) setForm(initForm(site)); /* eslint-disable-next-line */ }, [site?.id, editingInfo, editingReg]);
  const set = (k: keyof ReturnType<typeof initForm>, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    update((d) => {
      const s = d.sites.find((x) => x.id === siteId);
      if (!s) return;
      s.name = form.name.trim(); s.status = form.status; s.time_zone = form.timezone;
      s.city = form.city.trim() || null; s.state_country = form.state_country.trim() || null;
      s.location = [form.city.trim(), form.state_country.trim()].filter(Boolean).join(", ") || null;
      s.iec_name = form.iec_name.trim() || null; s.iec_ref = form.iec_ref.trim() || null;
      s.iec_approval_date = form.iec_approval_date || null; s.iec_expiry_date = form.iec_expiry_date || null;
      s.regulatory_authority = form.regulatory_authority.trim() || null;
      s.import_export_required = form.import_export_required; s.permit_number = form.permit_number.trim() || null;
    });
    setEditingInfo(false); setEditingReg(false);
  }

  if (!ready) return <div className="sites-screen"><div className="sites-loading"><i className="ti ti-loader-2"></i><span>Loading…</span></div></div>;
  if (!site) return <div className="sites-screen"><div className="sites-empty" style={{ margin: "var(--space-8)" }}><i className="ti ti-alert-triangle"></i> Site not found.</div></div>;

  const sm = STATUS_META[form.status] || STATUS_META.setup;
  const roInfo = !editingInfo, roReg = !editingReg;
  const iecChip = expiryChip(form.iec_expiry_date);

  return (
    <div className="sites-screen sr-rec">
      {/* Header */}
      <div className="sr-page-header">
        <nav className="sites-bc" aria-label="Breadcrumb">
          {isAdmin ? <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/sites`)}><span>Sites</span></button>
            : <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/data-entry`)}><span>Data Entry</span></button>}
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">{site.name}</span>
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">Site record</span>
        </nav>
        <div className="sr-title-row">
          <div><div className="sr-title">{site.name}</div><div className="sr-title-sub">{site.code} · Site record</div></div>
          <div className="sr-actions">
            <button className="st-btn-secondary" type="button"><i className="ti ti-download"></i> Export</button>
            <button className="st-btn-secondary" type="button"><i className="ti ti-clipboard-list"></i> Audit trail</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sr-tabs" role="tablist">
        <button className={`sr-tab${tab === "overview" ? " active" : ""}`} role="tab" type="button" onClick={() => setTab("overview")}><i className="ti ti-layout-grid"></i> Overview</button>
        <button className={`sr-tab${tab === "forms" ? " active" : ""}`} role="tab" type="button" onClick={() => setTab("forms")}><i className="ti ti-forms"></i> Forms</button>
      </div>

      {/* Enrollment metrics stat strip */}
      <div className="sr-stat-strip">
        <div className="sr-stat"><div className="sr-stat-val">{metrics.enrolled} <span className="sr-stat-of">/ {metrics.target}</span></div><div className="sr-stat-lbl">Enrolled</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{metrics.active}</div><div className="sr-stat-lbl">Active</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{metrics.completed}</div><div className="sr-stat-lbl">Completed</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{metrics.withdrawn}</div><div className="sr-stat-lbl">Withdrawn</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{metrics.screening}</div><div className="sr-stat-lbl">Screening</div></div>
        <div className="sr-stat"><div className={`sr-stat-val${metrics.openQueries > 0 ? " warn" : ""}`}>{metrics.openQueries}</div><div className="sr-stat-lbl">Open queries</div></div>
      </div>

      <div className="sr-scroll">
        <div className="sr-content-col">
          {tab === "overview" ? (
            <>
              {/* Site information */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">Site information</div><div className="sr-card-sub">General details and address</div></div>
                  {isAdmin && !editingInfo && <button className="st-btn-secondary" type="button" onClick={() => setEditingInfo(true)}><i className="ti ti-pencil"></i> Edit</button>}</div>
                <div className="sr-card-body">
                  <div className="sr-grid-3" style={{ marginBottom: "var(--space-5)" }}>
                    <Field label="Site name" req><input className="sr-input" value={form.name} readOnly={roInfo} onChange={(e) => set("name", e.target.value)} /></Field>
                    <Field label="Site ID" hint="Assigned at creation"><input className="sr-input mono" value={site.code} readOnly tabIndex={-1} /></Field>
                    <Field label="Status"><select className="sr-select" value={form.status} disabled={roInfo} onChange={(e) => set("status", e.target.value)}>{STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}</select></Field>
                  </div>
                  <div className="sr-grid-3">
                    <Field label="Time zone"><select className="sr-select" value={form.timezone} disabled={roInfo} onChange={(e) => set("timezone", e.target.value)}>{TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}</select></Field>
                    <Field label="City"><input className="sr-input" value={form.city} readOnly={roInfo} onChange={(e) => set("city", e.target.value)} /></Field>
                    <Field label="State / Country"><input className="sr-input" value={form.state_country} readOnly={roInfo} onChange={(e) => set("state_country", e.target.value)} /></Field>
                  </div>
                </div>
                {editingInfo && <div className="sr-card-footer"><button className="st-btn-secondary" type="button" onClick={() => setEditingInfo(false)}>Cancel</button><button className="st-btn-primary" type="button" onClick={save}><i className="ti ti-circle-check"></i> Save changes</button></div>}
              </div>

              {/* Regulatory & ethics */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">Regulatory &amp; ethics</div><div className="sr-card-sub">IEC/IRB approval, continuing review, permits</div></div>
                  {isAdmin && !editingReg && <button className="st-btn-secondary" type="button" onClick={() => setEditingReg(true)}><i className="ti ti-pencil"></i> Edit</button>}</div>
                <div className="sr-card-body">
                  {iecChip && iecChip.cls !== "green" && (
                    <div className={`sr-alert-banner ${iecChip.cls}`}><i className={`ti ${iecChip.icon}`}></i>
                      {iecChip.cls === "red" ? "IEC/IRB approval has expired — renew before enrolling further subjects." : `IEC/IRB approval expires within 60 days (${form.iec_expiry_date}). Schedule continuing review.`}</div>
                  )}
                  <div className="sr-grid-2" style={{ marginBottom: "var(--space-5)" }}>
                    <Field label="IEC / IRB name" req><input className="sr-input" value={form.iec_name} readOnly={roReg} onChange={(e) => set("iec_name", e.target.value)} /></Field>
                    <Field label="IEC reference number"><input className="sr-input mono" value={form.iec_ref} readOnly={roReg} onChange={(e) => set("iec_ref", e.target.value)} /></Field>
                    <Field label="Initial approval date"><input className="sr-input mono" type={roReg ? "text" : "date"} value={form.iec_approval_date} readOnly={roReg} onChange={(e) => set("iec_approval_date", e.target.value)} /></Field>
                    <div className="sr-field">
                      <label className="sr-label">Approval expiration date {iecChip && <span className={`sr-chip ${iecChip.cls}`}><i className={`ti ${iecChip.icon}`} style={{ fontSize: 11 }}></i> {iecChip.text}</span>}</label>
                      <input className="sr-input mono" type={roReg ? "text" : "date"} value={form.iec_expiry_date} readOnly={roReg} onChange={(e) => set("iec_expiry_date", e.target.value)} />
                    </div>
                  </div>
                  <div className="sr-grid-3" style={{ marginBottom: "var(--space-5)" }}>
                    <Field label="Local regulatory authority"><input className="sr-input" value={form.regulatory_authority} readOnly={roReg} onChange={(e) => set("regulatory_authority", e.target.value)} /></Field>
                    <Field label="Import / export permits required"><select className="sr-select" value={form.import_export_required} disabled={roReg} onChange={(e) => set("import_export_required", e.target.value)}><option>No</option><option>Yes</option></select></Field>
                    {form.import_export_required === "Yes" && <Field label="Permit number"><input className="sr-input mono" value={form.permit_number} readOnly={roReg} onChange={(e) => set("permit_number", e.target.value)} /></Field>}
                  </div>
                  <div className="sr-section-title">Continuing review</div>
                  {continuingForm && <ScopedRepeatingTable studyId={studyId} scope="site" scopeId={siteId} form={continuingForm} />}
                </div>
                {editingReg && <div className="sr-card-footer"><button className="st-btn-secondary" type="button" onClick={() => setEditingReg(false)}>Cancel</button><button className="st-btn-primary" type="button" onClick={save}><i className="ti ti-circle-check"></i> Save changes</button></div>}
              </div>
            </>
          ) : (
            <div className="sr-card">
              <div className="sr-card-body">
                <ScopedFormFlow studyId={studyId} scope="site" scopeId={siteId} exclude={["Continuing Review"]} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, req, hint, span2, span3, children }: { label: string; req?: boolean; hint?: string; span2?: boolean; span3?: boolean; children: React.ReactNode }) {
  return (
    <div className={`sr-field${span2 ? " span-2" : ""}${span3 ? " span-3" : ""}`}>
      <label className="sr-label">{label}{req && <span className="req"> *</span>}</label>
      {children}
      {hint && <span className="sr-hint">{hint}</span>}
    </div>
  );
}
