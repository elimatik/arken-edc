"use client";

import { useMemo, useState } from "react";
import type { Dataset, Vial } from "@/lib/session-store/types";
import { currentVol, vialDisplayId, type InvConfig } from "@/lib/inventory-data";

const TODAY = new Date().toISOString().slice(0, 10);

// + New dispensing slide-in. Vial dropdown is filtered to the subject's randomized
// arm (open-label shows drug/lot; blinded CRC sees kit numbers only — the system
// still enforces the correct kit for the arm without revealing it).
export function DispensePanel({ studyId, studyCode, cfg, hideArms, dataset, activeSiteId, vials, onClose, update }: {
  studyId: string;
  studyCode: string;
  cfg: InvConfig;
  hideArms: boolean;
  dataset: Dataset;
  activeSiteId: string | null;
  vials: Vial[];
  onClose: () => void;
  update: (m: (d: Dataset) => void) => void;
}) {
  const subjects = useMemo(() =>
    dataset.subjects
      .filter((s) => s.study_id === studyId && (!activeSiteId || s.site_id === activeSiteId))
      .slice().sort((a, b) => (a.subject_code < b.subject_code ? -1 : 1)),
  [dataset.subjects, studyId, activeSiteId]);

  const [subjectId, setSubjectId] = useState("");
  const [visit, setVisit] = useState("");
  const [vialId, setVialId] = useState("");
  const [vol, setVol] = useState("");
  const [route, setRoute] = useState(cfg.feed ? "In-feed" : "SC injection");
  const [location, setLocation] = useState<"clinic" | "home" | "farm">(cfg.feed ? "farm" : "clinic");
  const [date, setDate] = useState(TODAY);
  const [by, setBy] = useState("");

  const subject = subjects.find((s) => s.id === subjectId);
  const arm = subject?.randomization_arm ?? null;

  // Available vials, filtered to the subject's arm where the treatment group can be
  // matched (keeps blinded CRC from picking the wrong kit without naming the arm).
  const armVials = useMemo(() => {
    const avail = vials.filter((v) => v.status === "available" || v.status === "athome");
    if (!arm) return avail;
    const matched = avail.filter((v) => groupMatchesArm(v.treatmentGroup, arm));
    return matched.length ? matched : avail;
  }, [vials, arm]);

  const selectedVial = armVials.find((v) => v.id === vialId);
  const remainingAfter = selectedVial ? Math.round((currentVol(selectedVial) - (parseFloat(vol) || 0)) * 10) / 10 : null;
  const canSave = !!subjectId && !!vialId && (parseFloat(vol) || 0) > 0;

  function save() {
    if (!canSave || !subject) return;
    // Best-effort link to the subject's Treatment Admin / Feed setup instance.
    const formInstanceId = findTreatmentInstance(dataset, subject.id, cfg.feed);
    update((d) => {
      const v = d.vials.find((x) => x.id === vialId);
      if (!v) return;
      v.events.push({
        type: "dispense", date, subject: subject.subject_code, visit: visit || "—",
        volDispensed: parseFloat(vol) || 0, route, location, by: by || undefined,
        ...(formInstanceId ? { formInstanceId } : {}),
      });
      if (location === "home") v.status = "athome";
    });
    onClose();
  }

  return (
    <div className="inv-panel-overlay" onClick={onClose}>
      <div className="inv-panel" onClick={(e) => e.stopPropagation()}>
        <div className="inv-sp-header">
          <div>
            <div className="inv-sp-title">New {cfg.feed ? "feed delivery" : "dispensing"}</div>
            <div className="inv-sp-meta">{studyCode} · {cfg.feed ? "delivery to pen" : "drug dispensed to subject"}</div>
          </div>
          <button className="inv-sp-close" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>
        <div className="inv-sp-body">
          <div className="inv-form-row"><span className="inv-label">{cfg.feed ? "Pen" : "Subject"}</span>
            <select className="inv-form-select" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setVialId(""); }}>
              <option value="">Select {cfg.feed ? "pen" : "subject"}…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.subject_code}</option>)}
            </select>
            {arm && !hideArms && <span className="inv-hint">Randomized arm: {arm}</span>}
            {arm && hideArms && <span className="inv-hint">Arm-matched kits only (blinded)</span>}
          </div>
          <div className="inv-form-row"><span className="inv-label">Visit</span>
            <input className="inv-input" placeholder={cfg.feed ? "Week 1" : "Day 0"} value={visit} onChange={(e) => setVisit(e.target.value)} /></div>
          <div className="inv-form-row"><span className="inv-label">{cfg.itemNounCap}</span>
            <select className="inv-form-select" value={vialId} onChange={(e) => setVialId(e.target.value)} disabled={!subjectId}>
              <option value="">Select available {cfg.itemNoun}…</option>
              {armVials.map((v) => <option key={v.id} value={v.id}>{vialDisplayId(v, hideArms)} — {currentVol(v)} {v.unit} remaining</option>)}
            </select>
          </div>
          <div className="inv-form-row-2">
            <div className="inv-form-row"><span className="inv-label">Volume ({cfg.unit})</span>
              <input className="inv-input inv-mono" type="number" step="0.1" value={vol} onChange={(e) => setVol(e.target.value)} /></div>
            <div className="inv-form-row"><span className="inv-label">Route</span>
              <input className="inv-input" value={route} onChange={(e) => setRoute(e.target.value)} /></div>
          </div>
          {remainingAfter != null && (
            <div className="inv-preview">
              <div className="inv-preview-label">Remaining after</div>
              <div className="inv-preview-text inv-mono" style={{ color: remainingAfter <= 0 ? "var(--red-600)" : remainingAfter < 2 ? "var(--amber-700)" : "var(--blue-600)" }}>
                {remainingAfter <= 0 ? `0 ${cfg.unit} — ${cfg.itemNoun} will be depleted` : `${remainingAfter} ${cfg.unit}`}
              </div>
            </div>
          )}
          <div className="inv-form-row-2">
            <div className="inv-form-row"><span className="inv-label">Location</span>
              <select className="inv-form-select" value={location} onChange={(e) => setLocation(e.target.value as "clinic" | "home" | "farm")}>
                {cfg.feed ? <option value="farm">Farm / pen</option> : <><option value="clinic">Clinic</option><option value="home">At home</option><option value="farm">Farm</option></>}
              </select></div>
            <div className="inv-form-row"><span className="inv-label">Date</span>
              <input className="inv-input inv-mono" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="inv-form-row"><span className="inv-label">{cfg.feed ? "Delivered by" : "Dispensed by"}</span>
            <input className="inv-input" placeholder="Name" value={by} onChange={(e) => setBy(e.target.value)} /></div>
        </div>
        <div className="inv-sp-footer">
          <button className="inv-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="inv-btn-primary" onClick={save} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.4, cursor: canSave ? "pointer" : "not-allowed" }}>
            <i className="ti ti-circle-check"></i> Record {cfg.feed ? "delivery" : "dispense"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Loose arm↔group match: a vial group "Treatment A" matches an arm string that
// shares the trailing token (A / T01 / Control), so the right kit surfaces.
function groupMatchesArm(group: string, arm: string): boolean {
  const g = group.toLowerCase(), a = arm.toLowerCase();
  if (g.includes("control") && a.includes("control")) return true;
  const gTok = g.replace(/treatment\s*/, "").trim();
  return !!gTok && (a.includes(gTok) || g.includes(a));
}

function findTreatmentInstance(dataset: Dataset, subjectId: string, feed: boolean): string | undefined {
  const re = feed ? /Feed\s*&?\s*Ration|Feed Setup/i : /Treatment Admin/i;
  const formIds = new Set(dataset.forms.filter((f) => re.test(f.name)).map((f) => f.id));
  return dataset.formInstances.find((i) => i.subject_id === subjectId && formIds.has(i.form_id))?.id;
}
