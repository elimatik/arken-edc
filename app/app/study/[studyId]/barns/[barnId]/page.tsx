"use client";

// ════════════════════════════════════════════════════════════════════════════
// Barn / House Record — two tabs, mirroring the Site Record.
//   Overview — House information + Biosecurity (Admin inline-edit), the Equipment
//     Calibration log (with overdue/due-soon alerts), the Pen summary table, and
//     Environmental Alerts (open edit checks from the Daily Environmental Log plus
//     calibration alerts).
//   Forms — barn-scoped form flow: Daily Environmental Log, Feed Delivery Log,
//     House/Barn Close-out (full validation + slide-in panels).
// Reached via Data Entry → drill into the House → "Open house record".
// ════════════════════════════════════════════════════════════════════════════

import { Fragment, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { evaluateField } from "@/lib/forms/validation";
import { ScopedFormFlow, ScopedRepeatingTable, calibrationStatus } from "@/components/scoped-forms/ScopedForms";
import "../../sites/sites.css";
import "../barns.css";

export default function BarnRecordPage() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const studyId = String(params.studyId);
  const barnId = String(params.barnId);
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const isAdmin = activeRole === "Admin";
  const [editingHouse, setEditingHouse] = useState(false);
  const [editingBio, setEditingBio] = useState(false);

  const tab = sp.get("tab") === "forms" ? "forms" : "overview";
  const setTab = (t: "overview" | "forms") => router.replace(`/study/${studyId}/barns/${barnId}?tab=${t}`);

  const barn = dataset.barns.find((b) => b.id === barnId);
  const site = dataset.sites.find((s) => s.id === barn?.site_id);
  const study = dataset.studies.find((s) => s.id === studyId);
  const species = study?.species ?? "chicken";

  const studyForms = dataset.forms.filter((f) => f.study_id === studyId);
  const formByName = (name: string) => studyForms.find((f) => f.name === name);
  const subjInst = (subjectId: string, formId?: string) => (formId ? dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId) : undefined);
  const subjVal = (subjectId: string, formId: string | undefined, code: string): string => {
    if (!formId) return "";
    const inst = subjInst(subjectId, formId);
    const fld = dataset.formFields.find((f) => f.form_id === formId && f.code === code);
    return inst && fld ? (dataset.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === fld.id)?.value ?? "") : "";
  };
  const instVal = (instId: string, formId: string | undefined, code: string): string => {
    if (!formId) return "";
    const fld = dataset.formFields.find((f) => f.form_id === formId && f.code === code);
    return fld ? (dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fld.id)?.value ?? "") : "";
  };

  // Defaults aggregated from the pens' setup (used until the house config is edited).
  const pens = (barn ? dataset.pens.filter((p) => p.barn_id === barnId) : []).slice().sort((a, b) => a.code.localeCompare(b.code));
  const penSetup = formByName("Pen Demographics & Setup");
  const housing = formByName("Housing & Environment Setup");
  const subjForms = studyForms.filter((f) => f.scope === "subject" && !studyForms.some((g) => g.parent_form_id === f.id));
  const penRows = pens.map((p) => {
    const subj = dataset.subjects.find((s) => s.pen_id === p.id);
    const placed = subj ? subjVal(subj.id, penSetup?.id, "birds_placed") : "";
    const done = subj ? subjForms.filter((f) => { const i = subjInst(subj.id, f.id); return i && i.status !== "empty"; }).length : 0;
    const sIds = subj ? new Set(dataset.formInstances.filter((i) => i.subject_id === subj.id).map((i) => i.id)) : new Set<string>();
    const oq = subj ? dataset.queries.filter((q) => sIds.has(q.form_instance_id) && q.status !== "resolved").length : 0;
    return { pen: p, subj, arm: subj?.randomization_arm ?? "—", placed, status: subj?.status ?? "—", done, total: subjForms.length, oq };
  });
  const firstSubj = penRows.map((r) => r.subj).find(Boolean);
  const floorTotal = penRows.reduce((a, r) => a + (r.subj ? Number(subjVal(r.subj.id, penSetup?.id, "floor_area_m2")) || 0 : 0), 0);
  const defaults = {
    floor_area_m2: floorTotal ? floorTotal.toFixed(1) : "", capacity: pens.length ? String(pens.length * 30) : "",
    house_type: "Controlled Environment",
    feeder_type: firstSubj ? subjVal(firstSubj.id, penSetup?.id, "feeder_type") : "",
    drinker_type: firstSubj ? subjVal(firstSubj.id, penSetup?.id, "drinker_type") : "",
    ventilation_type: firstSubj ? subjVal(firstSubj.id, housing?.id, "ventilation_type") : "Tunnel",
    litter_type: firstSubj ? subjVal(firstSubj.id, penSetup?.id, "litter_type") : "",
    house_status: "Active",
    biosecurity_level: "Enhanced", last_cleanout: "2026-04-10", last_disinfection: "2026-04-15",
    disinfection_product: "Virkon S", downtime_days: "14", visitor_log_required: "Yes",
    flock_placement_date: "2026-04-21", biosecurity_notes: "",
  };
  const cfg = (k: keyof typeof defaults): string => (barn?.[k as keyof typeof barn] as string | null | undefined) ?? defaults[k];

  const [hf, setHf] = useState<Record<string, string>>({});
  const [bf, setBf] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!barn) return;
    const all = Object.keys(defaults).reduce((o, k) => ({ ...o, [k]: cfg(k as keyof typeof defaults) }), {} as Record<string, string>);
    if (!editingHouse) setHf(all);
    if (!editingBio) setBf(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barn?.id, editingHouse, editingBio]);
  function saveCfg(fields: string[], src: Record<string, string>, done: () => void) {
    update((d) => { const b = d.barns.find((x) => x.id === barnId); if (b) for (const k of fields) (b as unknown as Record<string, unknown>)[k] = (src[k] ?? "").trim() || null; });
    done();
  }

  if (!ready) return <div className="sites-screen" style={{ padding: "var(--space-6)" }}>Loading house record…</div>;
  if (!barn) return <div className="sites-screen" style={{ padding: "var(--space-6)" }}>House not found.</div>;

  // ─── Stat strip ─────────────────────────────────────────────────────────────
  const penSubjects = penRows.map((r) => r.subj).filter(Boolean) as NonNullable<(typeof penRows)[number]["subj"]>[];
  const subjIds = new Set(penSubjects.map((s) => s.id));
  const subjInstances = dataset.formInstances.filter((i) => i.subject_id != null && subjIds.has(i.subject_id));
  const openQueries = dataset.queries.filter((q) => new Set(subjInstances.map((i) => i.id)).has(q.form_instance_id) && q.status !== "resolved").length;
  const formsSubmitted = subjInstances.filter((i) => i.status !== "empty").length;
  const totalBirds = penRows.reduce((a, r) => a + (Number(r.placed) || 0), 0);
  const activePens = penRows.filter((r) => r.status === "active").length;

  // ─── Daily-log environmental alerts ─────────────────────────────────────────
  const dailyForm = formByName("Daily Environmental Log");
  const dailyInstances = dailyForm ? dataset.formInstances.filter((i) => i.form_id === dailyForm.id && i.barn_id === barnId) : [];
  const dailyField = (code: string) => dataset.formFields.find((f) => f.form_id === dailyForm?.id && f.code === code);
  const envAlerts: { day: string; label: string; message: string }[] = [];
  for (const i of dailyInstances) {
    const day = instVal(i.id, dailyForm?.id, "log_date") || "—";
    for (const code of ["temp_morning", "temp_evening", "rh_morning", "rh_evening", "co2_ppm", "ammonia_ppm"]) {
      const f = dailyField(code);
      const ec = f ? evaluateField(f, instVal(i.id, dailyForm?.id, code), species, dataset.speciesRanges) : null;
      if (ec) envAlerts.push({ day, label: f!.label, message: ec.message });
    }
  }
  // ─── Equipment calibration alerts ───────────────────────────────────────────
  const equipForm = formByName("Equipment Calibration Log");
  const equipInstances = equipForm ? dataset.formInstances.filter((i) => i.form_id === equipForm.id && i.barn_id === barnId) : [];
  const calAlerts = equipInstances.map((i) => {
    const due = instVal(i.id, equipForm?.id, "next_due");
    const st = calibrationStatus(due);
    return st === "current" ? null : { name: instVal(i.id, equipForm?.id, "equipment_name") || "Equipment", due, st };
  }).filter(Boolean) as { name: string; due: string; st: "due" | "overdue" }[];

  const dash = (v: string) => (v && v !== "" ? v : "—");
  const houseFields = ["floor_area_m2", "capacity", "house_type", "feeder_type", "drinker_type", "ventilation_type", "litter_type", "house_status"];
  const bioFields = ["biosecurity_level", "last_cleanout", "last_disinfection", "disinfection_product", "downtime_days", "visitor_log_required", "flock_placement_date", "biosecurity_notes"];

  return (
    <div className="sites-screen sr-rec">
      {/* Header */}
      <div className="sr-page-header">
        <nav className="sites-bc" aria-label="Breadcrumb">
          <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/data-entry`)}><span>Data Entry</span></button>
          {site && <><span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
            <button className="st-bc-btn" type="button" onClick={() => router.push(`/study/${studyId}/data-entry?site=${site.id}`)}><span>{site.name}</span></button></>}
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">{barn.name}</span>
          <span className="st-bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
          <span className="st-bc-cur">House record</span>
        </nav>
        <div className="sr-title-row">
          <div><div className="sr-title">{barn.name}</div><div className="sr-title-sub">{barn.code} · House record</div></div>
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

      {/* Stat strip — Overview tab only */}
      {tab === "overview" && (
      <div className="sr-stat-strip">
        <div className="sr-stat"><div className="sr-stat-val">{penSubjects.length} <span className="sr-stat-of">/ {pens.length}</span></div><div className="sr-stat-lbl">Pens enrolled</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{totalBirds || "—"}</div><div className="sr-stat-lbl">Total birds</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{activePens}</div><div className="sr-stat-lbl">Active pens</div></div>
        <div className="sr-stat"><div className={`sr-stat-val${openQueries > 0 ? " warn" : ""}`}>{openQueries}</div><div className="sr-stat-lbl">Open queries</div></div>
        <div className="sr-stat"><div className="sr-stat-val">{formsSubmitted}</div><div className="sr-stat-lbl">Forms submitted</div></div>
      </div>
      )}

      <div className="sr-scroll">
        <div className="sr-content-col">
          {tab === "overview" ? (
            <>
              {/* House information */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">House information</div><div className="sr-card-sub">Housing configuration for this house</div></div>
                  {isAdmin && !editingHouse && <button className="st-btn-secondary" type="button" onClick={() => setEditingHouse(true)}><i className="ti ti-pencil"></i> Edit</button>}</div>
                <div className="sr-card-body">
                  <div className="sr-grid-3" style={{ rowGap: "var(--space-5)" }}>
                    <RoField label="House name" value={barn.name} />
                    <RoField label="House ID" value={barn.code.toUpperCase()} mono />
                    <SelField label="Current status" value={hf.house_status} ro={!editingHouse} opts={["In Setup", "Active", "Closed"]} onChange={(v) => setHf({ ...hf, house_status: v })} badge />
                    <NumField label="Floor area" unit="m²" value={hf.floor_area_m2} ro={!editingHouse} onChange={(v) => setHf({ ...hf, floor_area_m2: v })} />
                    <NumField label="Capacity" unit="birds" value={hf.capacity} ro={!editingHouse} onChange={(v) => setHf({ ...hf, capacity: v })} />
                    <SelField label="House type" value={hf.house_type} ro={!editingHouse} opts={["Conventional", "Controlled Environment", "Free Range"]} onChange={(v) => setHf({ ...hf, house_type: v })} />
                    <TxtField label="Feeder type" value={hf.feeder_type} ro={!editingHouse} onChange={(v) => setHf({ ...hf, feeder_type: v })} />
                    <TxtField label="Drinker type" value={hf.drinker_type} ro={!editingHouse} onChange={(v) => setHf({ ...hf, drinker_type: v })} />
                    <TxtField label="Ventilation type" value={hf.ventilation_type} ro={!editingHouse} onChange={(v) => setHf({ ...hf, ventilation_type: v })} />
                    <TxtField label="Litter type" value={hf.litter_type} ro={!editingHouse} onChange={(v) => setHf({ ...hf, litter_type: v })} />
                  </div>
                </div>
                {editingHouse && <div className="sr-card-footer"><button className="st-btn-secondary" type="button" onClick={() => setEditingHouse(false)}>Cancel</button><button className="st-btn-primary" type="button" onClick={() => saveCfg(houseFields, hf, () => setEditingHouse(false))}><i className="ti ti-circle-check"></i> Save changes</button></div>}
              </div>

              {/* Biosecurity */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">Biosecurity status</div><div className="sr-card-sub">Cleanout, disinfection and flock placement</div></div>
                  {(isAdmin || activeRole === "DM") && !editingBio && <button className="st-btn-secondary" type="button" onClick={() => setEditingBio(true)}><i className="ti ti-pencil"></i> Edit</button>}</div>
                <div className="sr-card-body">
                  <div className="sr-grid-3" style={{ rowGap: "var(--space-5)" }}>
                    <SelField label="Biosecurity level" value={bf.biosecurity_level} ro={!editingBio} opts={["Standard", "Enhanced", "Strict"]} onChange={(v) => setBf({ ...bf, biosecurity_level: v })} />
                    <DateField label="Last cleanout date" value={bf.last_cleanout} ro={!editingBio} onChange={(v) => setBf({ ...bf, last_cleanout: v })} />
                    <DateField label="Last disinfection date" value={bf.last_disinfection} ro={!editingBio} onChange={(v) => setBf({ ...bf, last_disinfection: v })} />
                    <TxtField label="Disinfection product" value={bf.disinfection_product} ro={!editingBio} onChange={(v) => setBf({ ...bf, disinfection_product: v })} />
                    <NumField label="Downtime between flocks" unit="days" value={bf.downtime_days} ro={!editingBio} onChange={(v) => setBf({ ...bf, downtime_days: v })} />
                    <SelField label="Visitor log required" value={bf.visitor_log_required} ro={!editingBio} opts={["Yes", "No"]} onChange={(v) => setBf({ ...bf, visitor_log_required: v })} />
                    <DateField label="Current flock placement date" value={bf.flock_placement_date} ro={!editingBio} onChange={(v) => setBf({ ...bf, flock_placement_date: v })} />
                    <div className="sr-field span-2"><label className="sr-label">Notes</label><textarea className="sr-textarea" value={bf.biosecurity_notes} readOnly={!editingBio} onChange={(e) => setBf({ ...bf, biosecurity_notes: e.target.value })} /></div>
                  </div>
                </div>
                {editingBio && <div className="sr-card-footer"><button className="st-btn-secondary" type="button" onClick={() => setEditingBio(false)}>Cancel</button><button className="st-btn-primary" type="button" onClick={() => saveCfg(bioFields, bf, () => setEditingBio(false))}><i className="ti ti-circle-check"></i> Save changes</button></div>}
              </div>

              {/* Equipment calibration */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">Equipment calibration log</div><div className="sr-card-sub">Scales, monitors and meters — recalibration schedule</div></div></div>
                <div className="sr-card-body">
                  {calAlerts.length > 0 && (
                    <div className="sr-alert-banner amber"><i className="ti ti-alert-triangle"></i>
                      Calibration alerts: {calAlerts.map((a) => `${a.name} (${a.st === "overdue" ? "overdue" : "due soon"}, next ${a.due})`).join("; ")}.</div>
                  )}
                  {equipForm && <ScopedRepeatingTable studyId={studyId} scope="barn" scopeId={barnId} form={equipForm} />}
                </div>
              </div>

              {/* Pen summary */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">Pen summary</div><div className="sr-card-sub">Pens housed here — click to open the pen record</div></div></div>
                <div className="sr-card-body">
                  {penRows.length === 0 ? <div className="brn-empty">No pens in this house yet.</div> : (
                    <table className="brn-table">
                      <thead><tr><th>Pen ID</th><th>Arm</th><th>Birds Placed</th><th>Status</th><th>Forms Completed</th><th>Open Queries</th></tr></thead>
                      <tbody>
                        {penRows.map((r) => (
                          <tr key={r.pen.id} className={r.subj ? "clickable" : ""} onClick={() => r.subj && router.push(`/study/${studyId}/data-entry/${r.subj.id}`)}>
                            <td className="mono">{r.pen.code.toUpperCase()}</td><td>{r.arm}</td><td className="mono">{dash(r.placed)}</td>
                            <td><span className={`badge ${r.status === "active" ? "badge-active" : r.status === "completed" ? "badge-success" : "badge-hold"}`}>{r.status}</span></td>
                            <td className="mono">{r.done}/{r.total}</td><td className="mono">{r.oq || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Environmental alerts */}
              <div className="sr-card">
                <div className="sr-card-header"><div><div className="sr-card-title">Environmental alerts</div><div className="sr-card-sub">Open edit checks from the daily log + calibration</div></div></div>
                <div className="sr-card-body">
                  {envAlerts.length === 0 && calAlerts.length === 0 ? (
                    <div className="brn-ok"><i className="ti ti-circle-check"></i> No open environmental alerts.</div>
                  ) : (
                    <>
                      {envAlerts.map((a, i) => <div className="brn-alert" key={`e${i}`}><i className="ti ti-alert-triangle"></i><div><span className="brn-alert-day">{a.day}</span><strong>{a.label}:</strong> {a.message}</div></div>)}
                      {calAlerts.map((a, i) => <div className="brn-alert" key={`c${i}`}><i className="ti ti-tool"></i><div><span className="brn-alert-day">{a.due}</span><strong>{a.name}:</strong> calibration {a.st === "overdue" ? "overdue" : "due soon"}.</div></div>)}
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="sr-card">
              <div className="sr-card-body">
                <ScopedFormFlow studyId={studyId} scope="barn" scopeId={barnId} exclude={["Equipment Calibration Log"]}
                  topNote={{ "Daily Environmental Log": "Single-point environmental monitoring — assumes uniform conditions across all pens in this house." }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Small Overview field helpers ─────────────────────────────────────────────
function RoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div className="sr-field"><label className="sr-label">{label}</label><div className={`brn-val${mono ? " mono" : ""}${value ? "" : " muted"}`}>{value || "—"}</div></div>;
}
function TxtField({ label, value, ro, onChange }: { label: string; value: string; ro: boolean; onChange: (v: string) => void }) {
  return <div className="sr-field"><label className="sr-label">{label}</label>{ro ? <div className={`brn-val${value ? "" : " muted"}`}>{value || "—"}</div> : <input className="sr-input" value={value} onChange={(e) => onChange(e.target.value)} />}</div>;
}
function NumField({ label, value, unit, ro, onChange }: { label: string; value: string; unit?: string; ro: boolean; onChange: (v: string) => void }) {
  return <div className="sr-field"><label className="sr-label">{label}{unit ? ` (${unit})` : ""}</label>{ro ? <div className={`brn-val mono${value ? "" : " muted"}`}>{value || "—"}</div> : <input className="sr-input mono" type="number" value={value} onChange={(e) => onChange(e.target.value)} />}</div>;
}
function DateField({ label, value, ro, onChange }: { label: string; value: string; ro: boolean; onChange: (v: string) => void }) {
  return <div className="sr-field"><label className="sr-label">{label}</label>{ro ? <div className={`brn-val mono${value ? "" : " muted"}`}>{value || "—"}</div> : <input className="sr-input mono" type="date" value={value} onChange={(e) => onChange(e.target.value)} />}</div>;
}
function SelField({ label, value, opts, ro, onChange, badge }: { label: string; value: string; opts: string[]; ro: boolean; onChange: (v: string) => void; badge?: boolean }) {
  return <div className="sr-field"><label className="sr-label">{label}</label>{ro ? (badge ? <span className={`badge ${value === "Active" ? "badge-active" : value === "Closed" ? "badge-hold" : "badge-success"}`}>{value || "—"}</span> : <div className={`brn-val${value ? "" : " muted"}`}>{value || "—"}</div>) : <select className="sr-select" value={value} onChange={(e) => onChange(e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>}</div>;
}
