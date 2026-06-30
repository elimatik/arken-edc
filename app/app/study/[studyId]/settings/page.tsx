"use client";

// ════════════════════════════════════════════════════════════════════════════
// Study Settings — two-column layout (ported from 25-settings.html). Left: a
// 200px settings nav grouped into Study / Access / Protocol / System; right:
// scrollable content. Only the Randomization section is built; the rest show a
// "Coming soon" placeholder. Randomization reads the study's real config
// (method/blocking/blinding/stratification + treatment groups with their
// inventory lot links) and live enrolled counts from the session store.
// Display-only for the portfolio — edits surface autosave toasts, not persisted.
// ════════════════════════════════════════════════════════════════════════════

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { INV_ACTIONS, INV_ROLES, useInventoryPermissions, setInvPermission } from "@/lib/inventory-permissions";
import { getStudyTypeConfig } from "@/lib/study-type-config";
import { getFormPermDefaults, setFormPermDefault, setFormPermDefaultsFor, rolePresetPerms, useFormPermDefaults } from "@/lib/form-perm-defaults";
import "./settings.css";

type Method = "blocked" | "simple" | "stratified" | "minimization";
interface Group { code: string; name: string; detail?: string; ratio: number; arm: string; lot: string; blindedLabel?: string; color: string }
interface StratFactor { key: string; name: string; source: "site" | "form"; form?: string; field?: string; levels: string[] }
interface RandConfig { method: Method; blockSize: string; blinding: string; stratScope: "site" | "study"; stratFactors: StratFactor[]; groups: Group[] }

// Grouped nav (ported from 25-settings.html). Only Randomization is live.
interface NavItem { key: string; label: string; icon: string }
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Study", items: [{ key: "study", label: "Study settings", icon: "clipboard-list" }, { key: "preferences", label: "Study preferences", icon: "adjustments" }] },
  { title: "Access", items: [{ key: "roles", label: "Roles", icon: "shield-check" }, { key: "formperm", label: "Form permissions", icon: "forms" }] },
  { title: "Protocol", items: [{ key: "randomization", label: "Randomization", icon: "arrows-shuffle" }, { key: "protocol", label: "Protocol & Amendments", icon: "file-certificate" }] },
  { title: "System", items: [{ key: "inventory", label: "Inventory", icon: "flask" }, { key: "audit", label: "Audit & Signatures", icon: "writing" }, { key: "billing", label: "Billing", icon: "receipt-2" }] },
];
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Per-study randomization configuration (the real protocol design).
function randConfig(code: string): RandConfig {
  if (code === "BR-2502") return {
    method: "blocked", blockSize: "6", blinding: "Open-label (no blinding)", stratScope: "site",
    stratFactors: [{ key: "sf-site", name: "Site", source: "site", levels: [] }],
    groups: [
      { code: "T01", name: "Tulathromycin 2.5 mg/kg", ratio: 1, arm: "T01", lot: "LOT-BR-T01", color: "#1760A8" },
      { code: "T02", name: "Tulathromycin 5.0 mg/kg", ratio: 1, arm: "T02", lot: "LOT-BR-T02", color: "#1A6B47" },
      { code: "T03", name: "Saline placebo", ratio: 1, arm: "T03", lot: "LOT-BR-T03", color: "#6D7480" },
    ],
  };
  if (code === "CA-0801") return {
    method: "blocked", blockSize: "4", blinding: "Double-blind", stratScope: "site",
    stratFactors: [
      { key: "sf-site", name: "Site", source: "site", levels: [] },
      { key: "sf-sev", name: "Disease severity", source: "form", form: "Baseline Dermatology Assessment", field: "CADESI-04 score", levels: ["Mild <25", "Moderate 25–60", "Severe >60"] },
    ],
    groups: [
      { code: "A", name: "Treatment A", detail: "DermAlliv™ Active", ratio: 1, arm: "DermAlliv™ Active", lot: "LOT-CA-001", blindedLabel: "Treatment A", color: "#1760A8" },
      { code: "B", name: "Treatment B", detail: "Placebo", ratio: 1, arm: "Placebo", lot: "LOT-CA-001", blindedLabel: "Treatment B", color: "#6D7480" },
    ],
  };
  // PH-2401 — simple, open-label, no stratification
  return {
    method: "simple", blockSize: "6", blinding: "Open-label (no blinding)", stratScope: "study", stratFactors: [],
    groups: [
      { code: "T01", name: "T01 Control", detail: "Basal feed", ratio: 1, arm: "T01 Control", lot: "BATCH-PH-002", color: "#6D7480" },
      { code: "T02", name: "T02 Phytogenic additive", detail: "Phytogenic blend", ratio: 1, arm: "T02 Phytogenic", lot: "BATCH-PH-001", color: "#1A6B47" },
    ],
  };
}

// ─── Study settings config (ported from 25-settings.html section-study) ──────
// Per-study metadata for the four Study-settings cards. Display-only for the
// portfolio (edits surface autosave toasts, not persisted).
type StudyTypeKey = "livestock" | "companion" | "aquatic" | "custom";
interface StudyMeta {
  title: string; sponsor: string; ind: string; framework: string[];
  protoStart: string; protoEnroll: string; protoEnd: string; protoTarget: string; protoVersion: string;
  type: StudyTypeKey;
  drugName: string; drugFormulation: string; drugDoseUnit: string; drugDoseCalc: string; drugRoute: string;
}
function studyMeta(code: string): StudyMeta {
  if (code === "CA-0801") return {
    title: "DermAlliv™ Canine Atopic Dermatitis Study", sponsor: "DermAlliv Therapeutics",
    ind: "NADA-141-YYY · IND-CA-0801-US", framework: ["21 CFR Part 11", "VICH GL42"],
    protoStart: "2026-01-15", protoEnroll: "2026-04-01", protoEnd: "2026-10-31", protoTarget: "30", protoVersion: "v2.1 — 2026-01-10",
    type: "companion",
    drugName: "DermAlliv™ (blinded)", drugFormulation: "Topical / oral", drugDoseUnit: "ml", drugDoseCalc: "60 ml per visit", drugRoute: "Topical application",
  };
  if (code === "PH-2401") return {
    title: "Phytogenic Feed Additive Broiler Growth Performance Trial", sponsor: "PhytoVet Nutrition",
    ind: "No IND (feed additive)", framework: ["21 CFR Part 11"],
    protoStart: "2026-04-20", protoEnroll: "N/A (fixed pens)", protoEnd: "2026-07-31", protoTarget: "16 pens", protoVersion: "v1.0 — 2026-04-01",
    type: "livestock",
    drugName: "PhytoGrow™ Phytogenic Blend", drugFormulation: "Feed premix", drugDoseUnit: "kg", drugDoseCalc: "500g/tonne inclusion rate", drugRoute: "In-feed",
  };
  // BR-2502
  return {
    title: "Bovine Respiratory Disease Treatment Trial", sponsor: "BioVet Pharma Inc.",
    ind: "NADA-141-XXX · IND-BR-2502-US", framework: ["21 CFR Part 11", "VICH GL9"],
    protoStart: "2026-04-01", protoEnroll: "2026-05-15", protoEnd: "2026-08-31", protoTarget: "36", protoVersion: "v1.0 — 2026-03-01",
    type: "livestock",
    drugName: "Tulathromycin", drugFormulation: "Liquid injection", drugDoseUnit: "ml", drugDoseCalc: "weight × arm_dose_factor ÷ 100 mg/mL", drugRoute: "SC injection",
  };
}

interface HLevel { fixed: boolean; isSubject: boolean; value: string; options: string[]; optional?: boolean }
const ALL_LEVEL_OPTIONS = ["Site", "Barn", "Shed", "Paddock", "Feedlot", "Pasture", "Pen", "Stall", "Lot", "Group", "Run", "House", "Clinic ward", "Ward", "Unit", "Department", "Cage", "Kennel", "Room", "Crate", "Tank room", "Tank", "Pond", "Raceway", "Aquarium", "Building", "Wing", "Housing unit", "Animal", "Bovine", "Pig", "Sheep", "Horse", "Dog", "Cat", "Rabbit", "Fish", "Primate", "Patient", "Individual", "Subject"];
// Default hierarchy per study type — selecting a type button resets to this.
const HIERARCHY_PRESETS: Record<StudyTypeKey, HLevel[]> = {
  livestock: [
    { fixed: true, isSubject: false, value: "Site", options: ["Site"] },
    { fixed: false, isSubject: false, value: "Barn", options: ["Barn", "Shed", "Paddock", "Feedlot", "Pasture", "Building"] },
    { fixed: false, isSubject: false, value: "Pen", options: ["Pen", "Stall", "Lot", "Group", "Run", "Cage"] },
    { fixed: false, isSubject: true, value: "Animal", options: ["Animal", "Bovine", "Pig", "Sheep", "Horse", "Individual"] },
  ],
  companion: [
    { fixed: true, isSubject: false, value: "Site", options: ["Site"] },
    { fixed: false, isSubject: false, value: "Clinic ward", options: ["Clinic ward", "Ward", "Unit", "Department", "Building"] },
    { fixed: false, isSubject: false, value: "Cage", options: ["Cage", "Kennel", "Run", "Room", "Crate"], optional: true },
    { fixed: false, isSubject: true, value: "Pet", options: ["Pet", "Dog", "Cat", "Rabbit", "Patient", "Animal"] },
  ],
  aquatic: [
    { fixed: true, isSubject: false, value: "Site", options: ["Site"] },
    { fixed: false, isSubject: false, value: "Tank room", options: ["Tank room", "Facility", "Building", "Wing"] },
    { fixed: false, isSubject: false, value: "Tank", options: ["Tank", "Pond", "Raceway", "Aquarium"] },
    { fixed: false, isSubject: true, value: "Fish", options: ["Fish", "Animal", "Individual"] },
  ],
  custom: [
    { fixed: true, isSubject: false, value: "Site", options: ["Site"] },
    { fixed: false, isSubject: false, value: "Building", options: ["Building", "Ward", "Barn", "Room", "Shed", "Tank"] },
    { fixed: false, isSubject: true, value: "Animal", options: ["Animal", "Subject", "Patient", "Individual", "Fish"] },
  ],
};
// The active study's real hierarchy (initial state before any type re-pick).
function studyHierarchy(code: string): HLevel[] {
  if (code === "CA-0801") return [
    { fixed: true, isSubject: false, value: "Site", options: ["Site"] },
    { fixed: false, isSubject: true, value: "Animal", options: ["Animal", "Dog", "Cat", "Pet", "Patient", "Individual"] },
  ];
  if (code === "PH-2401") return [
    { fixed: true, isSubject: false, value: "Site", options: ["Site"] },
    { fixed: false, isSubject: false, value: "House", options: ["House", "Barn", "Shed", "Building"] },
    { fixed: false, isSubject: true, value: "Pen", options: ["Pen", "Stall", "Lot", "Group", "Run", "Cage"] },
  ];
  // BR-2502 — Site → Barn → Pen → Animal (the livestock default)
  return HIERARCHY_PRESETS.livestock.map((l) => ({ ...l }));
}

// ─── Inventory section config (ported from 25-settings.html section-inventory) ──
const NOTIFY_ROLES: Role[] = ["CRC", "CRA", "DM", "PI", "Admin"];
// Condition options + default stock-outcome mapping (CA-0801 return form).
const CONDITION_OPTIONS = ["Intact / sealed", "Partially used — good condition", "Partially used — compromised", "Damaged", "Expired", "Unknown"];
const OUTCOME_OPTIONS: { value: string; label: string; cls: string }[] = [
  { value: "restock_full", label: "Restock (full)", cls: "set-badge-green" },
  { value: "restock_partial", label: "Restock (partial)", cls: "set-badge-blue" },
  { value: "destroy", label: "Remove", cls: "set-badge-red" },
  { value: "quarantine", label: "Quarantine", cls: "set-badge-amber" },
];
const DEFAULT_COND_MAP: Record<string, string> = {
  "Intact / sealed": "restock_full", "Partially used — good condition": "restock_partial",
  "Partially used — compromised": "quarantine", "Damaged": "destroy", "Expired": "destroy", "Unknown": "quarantine",
};

// Per-study dispense-trigger mapping (which form fields log a dispensing event).
function dispenseTrigger(code: string, dataset: Dataset, studyId: string) {
  const studyFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId).map((f) => f.id));
  const formWithField = (fieldCode: string) => {
    const ff = dataset.formFields.find((x) => studyFormIds.has(x.form_id) && x.code === fieldCode);
    return ff ? dataset.forms.find((fm) => fm.id === ff.form_id)?.name : undefined;
  };
  if (code === "CA-0801") return { form: formWithField("dispensed_kit_number") ?? "Study Drug Dispensation", unit: "dispensed_kit_number", vol: "vol_dispensed", date: "visit_date" };
  if (code === "PH-2401") return { form: formWithField("quantity_kg") ?? "Feed Delivery Log", unit: "—", vol: "kg_delivered", date: "delivery_date" };
  return { form: formWithField("date_administered") ?? "Treatment Administration", unit: "unit_id", vol: "calculated_dose", date: "date_administered" };
}

// Per-study return-trigger mapping (which form fields log a drug-return event).
// Only CA-0801 logs returns via a form; BR/PH return cards are not shown.
function returnTrigger(code: string) {
  if (code === "CA-0801") return { form: "Study Drug Accountability", unit: "returned_kit_number", date: "visit_date", condition: "unit_condition_on_return", conditionLabel: "Unit condition on return" };
  return { form: "—", unit: "—", date: "—", condition: "—", conditionLabel: "—" };
}

function Sel({ value, opts, onChange }: { value: string; opts: string[]; onChange: (v: string) => void }) {
  const list = opts.includes(value) ? opts : [value, ...opts];
  return <select className="set-select" style={{ width: "100%" }} value={value} onChange={(e) => onChange(e.target.value)}>{list.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
}
function ToggleRow({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3) 0" }}>
      <label className="set-toggle" style={{ flexShrink: 0, marginTop: 1 }}><input type="checkbox" checked={on} onChange={onToggle} /><span className="set-toggle-slider"></span></label>
      <div style={{ flex: 1 }}><div className="settings-row-label">{label}</div><div className="settings-row-desc">{desc}</div></div>
    </div>
  );
}

function InventorySection({ studyCode, studyId, studyForms, dataset, onToast }: { studyCode: string; studyId: string; studyForms: { id: string; name: string }[]; dataset: Dataset; onToast: (m: string) => void }) {
  const trig = useMemo(() => dispenseTrigger(studyCode, dataset, studyId), [studyCode, dataset, studyId]);
  const rtrig = useMemo(() => returnTrigger(studyCode), [studyCode]);
  const showAtHome = getStudyTypeConfig(studyCode).hasAtHomeStatus; // At-home status (kit-per-visit)
  const showReturnSponsor = studyCode === "CA-0801" || studyCode === "BR-2502"; // CA + BR (PH feed is consumed)

  const [dispForm, setDispForm] = useState(trig.form);
  const [unitField, setUnitField] = useState(trig.unit);
  const [volField, setVolField] = useState(trig.vol);
  const [dateField, setDateField] = useState(trig.date);

  // Return trigger selects
  const [retForm, setRetForm] = useState(rtrig.form);
  const [retUnit, setRetUnit] = useState(rtrig.unit);
  const [retDate, setRetDate] = useState(rtrig.date);
  const [retCond, setRetCond] = useState(rtrig.condition);

  // Rules
  const [lowThreshold, setLowThreshold] = useState("3");
  const [notify, setNotify] = useState<Set<Role>>(new Set(NOTIFY_ROLES));
  const [condMap, setCondMap] = useState<Record<string, string>>({ ...DEFAULT_COND_MAP });
  const [minReturnVol, setMinReturnVol] = useState("0.5");
  const [atHome, setAtHome] = useState(true);
  const [returnSponsor, setReturnSponsor] = useState(true);
  // Log returns via a CRF form — default ON for CA, OFF for BR/PH (calc-based).
  const [logViaForm, setLogViaForm] = useState(studyCode === "CA-0801");

  // Reset every study-scoped control when the active study changes.
  useEffect(() => { setDispForm(trig.form); setUnitField(trig.unit); setVolField(trig.vol); setDateField(trig.date); }, [trig]);
  useEffect(() => { setRetForm(rtrig.form); setRetUnit(rtrig.unit); setRetDate(rtrig.date); setRetCond(rtrig.condition); setCondMap({ ...DEFAULT_COND_MAP }); }, [rtrig]);
  useEffect(() => { setAtHome(true); setReturnSponsor(true); setLogViaForm(studyCode === "CA-0801"); }, [studyCode]);

  // Permissions (shared store — edits here drive the live Inventory module).
  const perms = useInventoryPermissions();
  const formNames = studyForms.map((f) => f.name);

  // The linked condition-field chip (Return trigger card). Unlink clears the field
  // selection back to "—", which hides the chip + mapping table and shows an empty
  // state; re-selecting a Condition field restores them.
  const condLabel = ({ unit_condition_on_return: "Unit condition on return", physical_condition: "Physical condition", integrity_status: "Integrity status" } as Record<string, string>)[retCond] ?? retCond;
  const conditionChip = retCond !== "—" ? (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
      <span className="set-badge set-badge-blue" style={{ fontFamily: "var(--font-mono)" }}>{condLabel}</span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>linked from Return trigger → Condition field</span>
      <button className="set-btn-icon" style={{ width: 22, height: 22 }} title="Unlink" type="button" onClick={() => { setRetCond("—"); onToast("Condition field unlinked"); }}><i className="ti ti-unlink" style={{ fontSize: 12 }}></i></button>
    </div>
  ) : <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>Not linked — go to Return trigger to set a condition field.</span>;

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Inventory</h1>
        <p className="section-desc">Connect study forms to inventory events, configure rules and access permissions for {studyCode}</p>
      </div>

      {/* ── Card 1: Dispense trigger ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Dispense trigger</div><div className="settings-card-desc">Which form fields log a dispensing event</div></div></div>
        <div className="settings-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Dispensing form</div><Sel value={dispForm} opts={formNames} onChange={(v) => { setDispForm(v); onToast("Dispensing form updated"); }} /></div>
            <div className="set-field"><div className="set-field-label">Unit ID field</div><Sel value={unitField} opts={["unit_id", "kit_number", "vial_unit_id", "—"]} onChange={(v) => { setUnitField(v); onToast("Unit ID field updated"); }} /><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 4 }}>When linked, the inventory will track each unit individually by its ID.</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Volume field</div><Sel value={volField} opts={["calculated_dose", "vol_dispensed", "kg_delivered", "quantity_dispensed"]} onChange={(v) => { setVolField(v); onToast("Volume field updated"); }} /></div>
            <div className="set-field"><div className="set-field-label">Dispensing date field</div><Sel value={dateField} opts={["date_administered", "visit_date", "delivery_date", "dispensation_date"]} onChange={(v) => { setDateField(v); onToast("Dispensing date field updated"); }} /></div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Return trigger — toggle lives in the header (toggle-header pattern) ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
            <label className="set-toggle" style={{ flexShrink: 0, marginTop: 1 }}><input type="checkbox" checked={logViaForm} onChange={() => { setLogViaForm(!logViaForm); onToast("Setting saved"); }} /><span className="set-toggle-slider"></span></label>
            <div>
              <div className="settings-card-title">Log return via form</div>
              <div className="settings-card-desc" style={{ marginTop: 2 }}>When enabled, unit returns are recorded through form entries. When disabled, returns are calculated automatically using volume tracking.</div>
            </div>
          </div>
        </div>
        <div className="settings-card-body">
          {logViaForm && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
                <div className="set-field"><div className="set-field-label">Return form</div><Sel value={retForm} opts={[...formNames, "—"]} onChange={(v) => { setRetForm(v); onToast("Return form updated"); }} /></div>
                <div className="set-field"><div className="set-field-label">Unit ID field</div><Sel value={retUnit} opts={["returned_kit_number", "unit_id", "vial_unit_id", "—"]} onChange={(v) => { setRetUnit(v); onToast("Return unit ID field updated"); }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
                <div className="set-field"><div className="set-field-label">Return date field</div><Sel value={retDate} opts={["visit_date", "date_of_return", "collection_date", "—"]} onChange={(v) => { setRetDate(v); onToast("Return date field updated"); }} /></div>
                <div className="set-field"><div className="set-field-label">Condition field</div><Sel value={retCond} opts={["unit_condition_on_return", "physical_condition", "integrity_status", "—"]} onChange={(v) => { setRetCond(v); onToast("Condition field updated"); }} /><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 4 }}>Used to determine if returned units re-enter stock</div></div>
              </div>
              <div style={{ marginTop: "var(--space-4)" }}>
                <div className="set-field-label" style={{ marginBottom: "var(--space-2)" }}>Condition field on return form</div>
                {conditionChip}
              </div>
              {retCond !== "—" && (
                <div style={{ marginTop: "var(--space-4)" }}>
                  <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-2)" }}>Condition options → stock outcome</div>
                  {/* Compact rows: label has a fixed narrow width so the arrow + buttons sit
                      close and align across rows; the bottom border is on the row container
                      so it spans the full width as one continuous line. */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {CONDITION_OPTIONS.map((opt, ri) => (
                      <div key={opt} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: ri < CONDITION_OPTIONS.length - 1 ? "1px solid var(--color-border-subtle)" : "none" }}>
                        <span style={{ width: 210, flexShrink: 0, fontSize: "var(--text-sm)" }}>{opt}</span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>→</span>
                        <div style={{ display: "flex", gap: 4 }}>
                          {OUTCOME_OPTIONS.map((o) => (
                            <button key={o.value} type="button" className={`set-outcome-btn${condMap[opt] === o.value ? ` active ${o.cls}` : ""}`} onClick={() => { setCondMap({ ...condMap, [opt]: o.value }); onToast("Condition mapping updated"); }}>{o.label}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {/* Minimum returnable volume — always shown (applies to calc-based returns too). */}
          <div style={{ marginTop: logViaForm ? "var(--space-4)" : 0 }}>
            <div className="set-field-label" style={{ marginBottom: "var(--space-1)" }}>Minimum returnable volume</div>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input className="set-input" type="number" min={0} step={0.1} value={minReturnVol} style={{ width: 72, fontFamily: "var(--font-mono)" }} onChange={(e) => setMinReturnVol(e.target.value)} onBlur={() => onToast("Min returnable volume saved")} />
              <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>ml — below this the unit is marked depleted regardless of condition</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 3: Inventory rules ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Inventory rules</div><div className="settings-card-desc">Return mechanics and stock-alert behaviour</div></div></div>
        <div className="settings-card-body">
          {showAtHome && (
            <ToggleRow on={atHome} onToggle={() => { setAtHome(!atHome); onToast("Setting saved"); }} label="At home status" desc="Unit dispensed but not yet returned — tracked as 'At home' until next visit return" />
          )}
          {showReturnSponsor && (
            <ToggleRow on={returnSponsor} onToggle={() => { setReturnSponsor(!returnSponsor); onToast("Setting saved"); }} label="Return to sponsor" desc="Record units shipped back to sponsor at study close" />
          )}
          {/* Low stock alerts — a sub-section, not a toggle */}
          <div style={{ marginTop: (showAtHome || showReturnSponsor) ? "var(--space-3)" : 0, paddingTop: (showAtHome || showReturnSponsor) ? "var(--space-4)" : 0, borderTop: (showAtHome || showReturnSponsor) ? "1px solid var(--color-border-subtle)" : "none" }}>
            <div className="settings-row-label">Low stock alerts</div>
            <div className="settings-row-desc" style={{ marginBottom: "var(--space-3)" }}>Notify the roles below when available units fall under the threshold</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-5)", alignItems: "start" }}>
              <div className="set-field"><div className="set-field-label">Threshold</div><input className="set-input" type="number" min={1} value={lowThreshold} style={{ width: 72, fontFamily: "var(--font-mono)" }} onChange={(e) => setLowThreshold(e.target.value)} onBlur={() => onToast("Low stock threshold saved")} /></div>
              <div className="set-field"><div className="set-field-label">Notify roles</div>
                {/* min-height matches the 36px input so the checkbox row centres against it */}
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-4)", minHeight: 36 }}>
                  {NOTIFY_ROLES.map((r) => (
                    <label key={r} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "var(--text-sm)", cursor: "pointer" }}>
                      <input type="checkbox" className="set-cb" checked={notify.has(r)} onChange={(e) => { const next = new Set(notify); if (e.target.checked) next.add(r); else next.delete(r); setNotify(next); onToast("Notify roles updated"); }} /> {r}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Card 4: Inventory permissions ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Inventory permissions</div><div className="settings-card-desc">Which roles may perform each inventory action — the live source of truth for the Inventory module</div></div></div>
        <div className="settings-card-body" style={{ overflowX: "auto" }}>
          <table className="perm-matrix" style={{ minWidth: 560, width: "100%" }}>
            <thead><tr><th>Action</th>{INV_ROLES.map((r) => <th key={r}>{r}</th>)}</tr></thead>
            <tbody>
              {INV_ACTIONS.map((a) => (
                <tr key={a.key}>
                  <td><div style={{ fontSize: "var(--text-sm)" }}>{a.label}</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", fontWeight: 400 }}>{a.desc}</div></td>
                  {INV_ROLES.map((r) => (
                    <td key={r}>
                      <input type="checkbox" className="perm-cb" checked={perms[a.key].includes(r)} onChange={(e) => { setInvPermission(a.key, r, e.target.checked); onToast(`${r} ${e.target.checked ? "granted" : "removed"}: ${a.label}`); }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ─── Study settings section (4 cards, ported from 25-settings.html) ──────────
// Remounted via key={studyCode} by the parent, so all state + uncontrolled
// inputs reset to the active study when the topbar study switches.
function StudySettingsSection({ studyCode, onToast }: { studyCode: string; onToast: (m: string) => void }) {
  const meta = studyMeta(studyCode);
  const cfg = getStudyTypeConfig(studyCode);
  // Card 1 — Study information: committed values + edit drafts (Cancel reverts).
  const [editInfo, setEditInfo] = useState(false);
  const [title, setTitle] = useState(meta.title);
  const [sponsor, setSponsor] = useState(meta.sponsor);
  const [ind, setInd] = useState(meta.ind);
  const [dTitle, setDTitle] = useState(meta.title);
  const [dSponsor, setDSponsor] = useState(meta.sponsor);
  const [dInd, setDInd] = useState(meta.ind);
  function startEdit() { setDTitle(title); setDSponsor(sponsor); setDInd(ind); setEditInfo(true); }
  function saveInfo() { setTitle(dTitle); setSponsor(dSponsor); setInd(dInd); setEditInfo(false); onToast("Study information saved"); }

  // Card 3a/3b — Study type, design fields (editable, initialized from the study-type
  // config defaults; overrides are component-local / display-only), and hierarchy.
  const [activeType, setActiveType] = useState<StudyTypeKey>(meta.type);
  const [enrollModel, setEnrollModel] = useState<string>(cfg.enrollmentModel);
  const [subjectUnit, setSubjectUnit] = useState<string>(cfg.subjectUnit);
  const [structureLockedAt, setStructureLockedAt] = useState<string>(cfg.structureLockedAt);
  const [allowAdditions, setAllowAdditions] = useState(cfg.allowMidStudyAdditions);
  const [hierarchy, setHierarchy] = useState<HLevel[]>(() => studyHierarchy(studyCode));
  // Sensible design defaults per study type — applied when a type is (re)selected.
  const TYPE_DESIGN_DEFAULTS: Record<StudyTypeKey, { enrollModel: string; subjectUnit: string; structureLockedAt: string; allow: boolean }> = {
    livestock: { enrollModel: "rolling", subjectUnit: "animal", structureLockedAt: "first_enrollment", allow: true },
    companion: { enrollModel: "rolling", subjectUnit: "animal", structureLockedAt: "first_enrollment", allow: true },
    aquatic: { enrollModel: "rolling", subjectUnit: "tank", structureLockedAt: "first_enrollment", allow: true },
    custom: { enrollModel: "rolling", subjectUnit: "animal", structureLockedAt: "manual", allow: true },
  };
  function pickType(t: StudyTypeKey) {
    setActiveType(t);
    const d = TYPE_DESIGN_DEFAULTS[t];
    setEnrollModel(d.enrollModel); setSubjectUnit(d.subjectUnit); setStructureLockedAt(d.structureLockedAt); setAllowAdditions(d.allow);
    setHierarchy(HIERARCHY_PRESETS[t].map((l) => ({ ...l })));
    onToast("Study type updated — design & hierarchy pre-filled");
  }
  // Additions ⇄ structure-lock invariant: OFF locks the structure "at study
  // initiation" (and the select is read-only); ON defaults the lock to "at first
  // enrollment" (then editable between first-enrollment / manual).
  function applyAdditions(on: boolean) {
    setAllowAdditions(on);
    setStructureLockedAt(on ? "first_enrollment" : "initiation");
  }
  // Enrollment model auto-sets mid-study additions (Fixed group / Single cohort → OFF,
  // Rolling → ON); still manually overridable via the toggle.
  function changeEnrollModel(v: string) {
    setEnrollModel(v);
    applyAdditions(v === "rolling");
    onToast("Enrollment model updated");
  }
  function setLevelName(i: number, val: string) { setHierarchy((h) => h.map((l, j) => (j === i ? { ...l, value: val } : l))); onToast("Hierarchy updated"); }
  function removeLevel(i: number) { setHierarchy((h) => (h[i].fixed || h[i].isSubject ? h : h.filter((_, j) => j !== i))); onToast("Level removed"); }
  function addLevel() {
    setHierarchy((h) => {
      const idx = h.findIndex((l) => l.isSubject);
      const nl: HLevel = { fixed: false, isSubject: false, value: "Room", options: ALL_LEVEL_OPTIONS };
      if (idx > -1) { const copy = h.slice(); copy.splice(idx, 0, nl); return copy; }
      return [...h, nl];
    });
    onToast("Level added");
  }

  const TYPES: { key: StudyTypeKey; label: string; icon: string }[] = [
    { key: "livestock", label: "Livestock", icon: "cow" },
    { key: "companion", label: "Companion animal", icon: "paw" },
    { key: "aquatic", label: "Aquatic", icon: "fish" },
    { key: "custom", label: "Custom", icon: "settings" },
  ];

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Study settings</h1>
        <p className="section-desc">Core protocol configuration for {studyCode}</p>
      </div>

      {/* ── Card 1: Study information ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Study information</div></div>
          {!editInfo && <button className="set-btn-secondary" type="button" onClick={startEdit}><i className="ti ti-pencil"></i> Edit</button>}
        </div>
        <div className="settings-card-body">
          <div className="settings-row"><div><div className="settings-row-label">Study ID</div></div><div className="settings-row-value"><span style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{studyCode}</span></div></div>
          <div className="settings-row"><div><div className="settings-row-label">Study title</div></div><div className="settings-row-value">{title}</div></div>
          <div className="settings-row"><div><div className="settings-row-label">Sponsor</div></div><div className="settings-row-value">{sponsor}</div></div>
          <div className="settings-row"><div><div className="settings-row-label">IND / NADA number</div></div><div className="settings-row-value"><span style={{ fontFamily: "var(--font-mono)" }}>{ind}</span></div></div>
          <div className="settings-row"><div><div className="settings-row-label">Regulatory framework</div></div><div className="settings-row-value">{meta.framework.map((f, i) => <span key={f} className="set-badge set-badge-blue" style={i > 0 ? { marginLeft: 4 } : undefined}>{f}</span>)}</div></div>
          {editInfo && (
            <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
                <div className="set-field"><div className="set-field-label">Study title</div><input className="set-input" value={dTitle} onChange={(e) => setDTitle(e.target.value)} /></div>
                <div className="set-field"><div className="set-field-label">Sponsor</div><input className="set-input" value={dSponsor} onChange={(e) => setDSponsor(e.target.value)} /></div>
              </div>
              <div className="set-field" style={{ marginBottom: "var(--space-3)" }}><div className="set-field-label">IND / NADA number</div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} value={dInd} onChange={(e) => setDInd(e.target.value)} /></div>
              <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                <button className="set-btn-secondary" type="button" onClick={() => setEditInfo(false)}>Cancel</button>
                <button className="set-btn-primary" type="button" onClick={saveInfo}><i className="ti ti-check"></i> Save</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Card 2: Protocol & timeline ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Protocol &amp; timeline</div></div></div>
        <div className="settings-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Study start</div><input className="set-input" defaultValue={meta.protoStart} onBlur={() => onToast("Study start saved")} /></div>
            <div className="set-field"><div className="set-field-label">{cfg.enrollmentCloseLabel}</div><input className="set-input" defaultValue={meta.protoEnroll} onBlur={() => onToast(`${cfg.enrollmentCloseLabel} saved`)} /></div>
            <div className="set-field"><div className="set-field-label">Study end (planned)</div><input className="set-input" defaultValue={meta.protoEnd} onBlur={() => onToast("Study end saved")} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">{cfg.enrollmentLabel}</div><input className="set-input" type="number" defaultValue={meta.protoTarget.replace(/\D.*$/, "") || meta.protoTarget} onBlur={() => onToast(`${cfg.enrollmentLabel} saved`)} /></div>
            <div className="set-field"><div className="set-field-label">Protocol version</div><div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><input className="set-input" defaultValue={meta.protoVersion} onBlur={() => onToast("Protocol version saved")} /><button className="set-btn-icon" type="button" title="Download protocol document" style={{ flexShrink: 0, width: 32, height: 36, border: "1px solid var(--color-border)" }}><i className="ti ti-download" style={{ fontSize: 15 }}></i></button></div></div>
          </div>
        </div>
      </div>

      {/* ── Card 3a: Study type & design ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Study type &amp; design</div><div className="settings-card-desc">Study type pre-fills sensible defaults — all fields are overridable</div></div></div>
        <div className="settings-card-body">
          <div className="settings-row">
            <div><div className="settings-row-label">Study type</div><div className="settings-row-desc">Pre-fills the design + hierarchy below</div></div>
            <div className="settings-row-value">
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                {TYPES.map((t) => (
                  <button key={t.key} type="button" className={`study-type-btn${activeType === t.key ? " active" : ""}`} onClick={() => pickType(t.key)}><i className={`ti ti-${t.icon}`} style={{ fontSize: 16 }}></i> {t.label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div><div className="settings-row-label">Enrollment model</div><div className="settings-row-desc">How subjects join the study</div></div>
            <div className="settings-row-value">
              <select className="set-select" style={{ maxWidth: 260 }} value={enrollModel} onChange={(e) => changeEnrollModel(e.target.value)}>
                <option value="rolling">Rolling individual enrollment</option>
                <option value="fixed_group">Fixed group setup</option>
                <option value="single_cohort">Single cohort placement</option>
              </select>
            </div>
          </div>
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div><div className="settings-row-label">Subject unit</div><div className="settings-row-desc">The experimental unit of analysis</div></div>
            <div className="settings-row-value">
              <select className="set-select" style={{ maxWidth: 200 }} value={subjectUnit} onChange={(e) => { setSubjectUnit(e.target.value); onToast("Subject unit updated"); }}>
                <option value="animal">Animal</option>
                <option value="pen">Pen</option>
                <option value="tank">Tank</option>
                <option value="cage">Cage</option>
                <option value="hive">Hive</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", paddingBottom: "var(--space-3)", borderBottom: "1px solid var(--color-border-subtle)" }}>If your randomization unit differs from your subject unit (e.g. cluster randomization), configure it separately in Randomization settings.</div>
          <ToggleRow
            on={allowAdditions}
            onToggle={() => { applyAdditions(!allowAdditions); onToast("Setting saved"); }}
            label="Allow mid-study additions"
            desc="When enabled, new subjects or units can be added after the study has started. When disabled, the study structure is locked once the study is initiated."
          />
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div><div className="settings-row-label">Structure locked at</div><div className="settings-row-desc">When the subject structure becomes read-only</div></div>
            <div className="settings-row-value">
              {allowAdditions
                ? <select className="set-select" style={{ maxWidth: 200 }} value={structureLockedAt} onChange={(e) => { setStructureLockedAt(e.target.value); onToast("Structure lock updated"); }}>
                    <option value="first_enrollment">At first enrollment</option>
                    <option value="manual">Manual lock</option>
                  </select>
                : <select className="set-select" style={{ maxWidth: 200 }} value="initiation" disabled>
                    <option value="initiation">At study initiation</option>
                  </select>}
            </div>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", paddingTop: "var(--space-1)" }}>A protocol amendment can unlock structure changes — see Audit &amp; Signatures for amendment history.</div>
        </div>
      </div>

      {/* ── Card 3b: Subject hierarchy ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Subject hierarchy</div><div className="settings-card-desc">Study type pre-fills the hierarchy — you can rename each level</div></div></div>
        <div className="settings-card-body">
          <div>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)", marginTop: "var(--space-3)", marginBottom: "var(--space-3)" }}>Hierarchy levels <span style={{ fontWeight: 400, textTransform: "none", color: "var(--color-text-placeholder)" }}>(top = study, fixed)</span></div>
            {hierarchy.map((level, i) => {
              const opts = Array.from(new Set([...level.options, ...ALL_LEVEL_OPTIONS]));
              return (
                <div key={i} className="hierarchy-level">
                  <div className="hier-num">{i + 1}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", minWidth: 56 }}>{level.fixed ? "Fixed" : level.isSubject ? "Subject" : `Level ${i + 1}`}</div>
                  {level.fixed
                    ? <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{level.value}</span>
                    : <select className="set-select" style={{ minWidth: 160 }} value={level.value} onChange={(e) => setLevelName(i, e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
                  {level.isSubject && <span className="set-badge set-badge-green">Subject level</span>}
                  {level.optional && <span style={{ fontSize: 10, color: "var(--color-text-placeholder)", fontStyle: "italic" }}>optional</span>}
                  {!level.fixed && <button className="set-btn-icon" style={{ marginLeft: "auto" }} type="button" title="Remove level" onClick={() => removeLevel(i)}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>}
                </div>
              );
            })}
            {allowAdditions
              ? <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)", marginTop: "var(--space-3)" }} type="button" onClick={addLevel}><i className="ti ti-plus"></i> Add level</button>
              : <div className="set-note" style={{ marginTop: "var(--space-3)" }}><i className="ti ti-lock" style={{ fontSize: 12, marginRight: 4 }}></i> Structure is locked. Hierarchy levels cannot be modified once the study is active.</div>}
          </div>
        </div>
      </div>

      {/* ── Card 4: Drug & investigational product ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Drug &amp; investigational product</div></div></div>
        <div className="settings-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Drug name</div><input className="set-input" defaultValue={meta.drugName} onBlur={() => onToast("Drug name saved")} /></div>
            <div className="set-field"><div className="set-field-label">Formulation</div><input className="set-input" defaultValue={meta.drugFormulation} onBlur={() => onToast("Formulation saved")} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Dose unit</div><input className="set-input" defaultValue={meta.drugDoseUnit} onBlur={() => onToast("Dose unit saved")} /></div>
            <div className="set-field"><div className="set-field-label">Dose calculation</div><input className="set-input" defaultValue={meta.drugDoseCalc} onBlur={() => onToast("Dose calculation saved")} /></div>
            <div className="set-field"><div className="set-field-label">Route</div><input className="set-input" defaultValue={meta.drugRoute} onBlur={() => onToast("Route saved")} /></div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Protocol & Amendments section (ported from 25-settings.html) ────────────
interface Amend { id: string; version: string; date: string; summary: string; impact: string; structureChange?: boolean }
// One seeded study-level amendment per study (per-study data, keyed by code).
function seedStudyAmendments(code: string): Amend[] {
  if (code === "CA-0801") return [{ id: "A01", version: "v2.1", date: "2026-01-10", summary: "Added CADESI-04 scoring requirement at all visits", impact: "No impact — ongoing subjects unaffected" }];
  if (code === "PH-2401") return [{ id: "A01", version: "v1.0", date: "2026-04-01", summary: "Initial protocol approval", impact: "No impact — study initiation" }];
  return [{ id: "A01", version: "v1.0", date: "2026-03-01", summary: "Initial protocol approval", impact: "No impact — study initiation" }]; // BR-2502
}
// A single amendment / addendum row.
function AmendRow({ a }: { a: Amend }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
      <span className="set-badge set-badge-purple" style={{ fontFamily: "var(--font-mono)", flexShrink: 0, marginTop: 1 }}>{a.version}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)", marginBottom: 2 }}>{a.date}</div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-primary)" }}>{a.summary}{a.structureChange && <span className="set-badge set-badge-amber" style={{ marginLeft: 6 }}>Structure change</span>}</div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}><i className="ti ti-info-circle" style={{ fontSize: 11 }}></i>{a.impact}</div>
      </div>
    </div>
  );
}

function ProtocolAmendmentsSection({ studyCode, studyId, dataset, onToast }: { studyCode: string; studyId: string; dataset: Dataset; onToast: (m: string) => void }) {
  const router = useRouter();
  const meta = studyMeta(studyCode);
  // Current protocol — read version + effective date from the SAME source as Study
  // Settings Card 2 (studyMeta.protoVersion, format "v1.0 — 2026-03-01") so they stay in sync.
  const [vPart, dPart] = meta.protoVersion.split("—").map((s) => s.trim());
  const protoVersion = vPart || meta.protoVersion;
  const effectiveDate = dPart || "—";

  const sites = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code)), [dataset.sites, studyId]);
  const subjectsBySite = useMemo(() => {
    const m: Record<string, number> = {};
    dataset.subjects.filter((s) => s.study_id === studyId).forEach((s) => { if (s.site_id) m[s.site_id] = (m[s.site_id] ?? 0) + 1; });
    return m;
  }, [dataset.subjects, studyId]);

  // Site-level addenda are a ROLLUP of the site-scoped "Protocol Amendments" CRF —
  // each form instance at a site is one addendum. Settings is a read-only view of the
  // real form data (the single source of truth lives on the site record's form).
  const paForm = useMemo(() => dataset.forms.find((f) => f.study_id === studyId && f.name === "Protocol Amendments"), [dataset.forms, studyId]);
  const siteAddenda = useMemo(() => {
    const out: Record<string, Amend[]> = {};
    if (!paForm) return out;
    const codeById = new Map(dataset.formFields.filter((f) => f.form_id === paForm.id).map((f) => [f.id, f.code]));
    const impactOf = (v?: string) => v === "None" ? "No impact — ongoing subjects unaffected" : v === "Newly enrolled only" ? "Affects newly enrolled subjects only" : v === "All" ? "Affects all enrolled subjects" : "—";
    for (const site of sites) {
      const rows: Amend[] = [];
      for (const inst of dataset.formInstances.filter((i) => i.form_id === paForm.id && i.site_id === site.id)) {
        const byCode: Record<string, string> = {};
        for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id) { const c = codeById.get(v.form_field_id); if (c) byCode[c] = v.value ?? ""; }
        if (!byCode.protocol_version && !byCode.amendment_summary) continue; // skip blank instances
        rows.push({ id: inst.id, version: byCode.protocol_version || "—", date: byCode.amendment_date || "—", summary: byCode.amendment_summary || "—", impact: impactOf(byCode.subjects_affected) });
      }
      out[site.id] = rows;
    }
    return out;
  }, [paForm, sites, dataset.formInstances, dataset.fieldValues, dataset.formFields]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(Object.entries(siteAddenda).filter(([, v]) => v.length).map(([k]) => [k, true])));
  // "+ Add addendum" deep-links to the site's real Protocol Amendments CRF (entries are
  // created there via the repeating-table "Add entry" flow, not a parallel store).
  function addAddendum(siteId: string) {
    if (paForm) router.push(`/study/${studyId}/sites/${siteId}?form=${paForm.id}`);
    else onToast("No Protocol Amendments form configured for this study.");
  }

  // Study-level amendments stay component-state seeded with their own add modal.
  const [amendments, setAmendments] = useState<Amend[]>(() => seedStudyAmendments(studyCode));
  const [modalOpen, setModalOpen] = useState(false);
  const [mVer, setMVer] = useState(""); const [mDate, setMDate] = useState(""); const [mSum, setMSum] = useState(""); const [mImpact, setMImpact] = useState(""); const [mStruct, setMStruct] = useState(false);
  function openModal() { setMVer(""); setMDate(""); setMSum(""); setMImpact(""); setMStruct(false); setModalOpen(true); }
  function saveAmend() {
    if (!mVer.trim() || !mSum.trim()) { onToast("Version and summary are required"); return; }
    setAmendments((p) => [...p, { id: `am-${crypto.randomUUID()}`, version: mVer.trim(), date: mDate.trim() || "—", summary: mSum.trim(), impact: mImpact.trim() || "—", structureChange: mStruct }]);
    setModalOpen(false);
    onToast("Amendment saved");
  }

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Protocol &amp; Amendments</h1>
        <p className="section-desc">Protocol version, study-level amendments, and site-level addenda for {studyCode}</p>
      </div>

      {/* ── Card 1: Current protocol ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Current protocol</div></div></div>
        <div className="settings-card-body">
          <div className="settings-row"><div><div className="settings-row-label">Protocol version</div></div><div className="settings-row-value"><span className="set-badge set-badge-slate" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{protoVersion}</span></div></div>
          <div className="settings-row"><div><div className="settings-row-label">Effective date</div></div><div className="settings-row-value"><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>{effectiveDate}</span></div></div>
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div><div className="settings-row-label">Protocol document</div><div className="settings-row-desc">Current approved protocol (PDF)</div></div>
            <div className="settings-row-value"><button className="set-btn-secondary" type="button" onClick={() => onToast("Protocol document download is disabled in the demo.")}><i className="ti ti-download"></i> Download</button></div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Study-level amendments ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Study-level amendments</div><div className="settings-card-desc">Protocol amendments applied across the whole study</div></div>
          <button className="set-btn-secondary" type="button" onClick={openModal}><i className="ti ti-plus"></i> Add amendment</button>
        </div>
        <div className="settings-card-body">
          {amendments.length === 0
            ? <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No amendments recorded.</div>
            : amendments.map((a) => <AmendRow key={a.id} a={a} />)}
        </div>
      </div>

      {/* ── Card 3: Site-level addenda ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Site-level addenda</div><div className="settings-card-desc">Amendments scoped to a single site</div></div></div>
        <div className="settings-card-body">
          {sites.length === 0
            ? <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No sites configured.</div>
            : sites.map((s) => {
              const open = !!expanded[s.id];
              const list = siteAddenda[s.id] ?? [];
              return (
                <div key={s.id} className="settings-card" style={{ marginBottom: "var(--space-3)" }}>
                  <div className="settings-card-header">
                    <div><div className="settings-card-title">{s.name}</div><div className="settings-card-desc">{s.principal_investigator ?? "—"} · {subjectsBySite[s.id] ?? 0} enrolled</div></div>
                    <button className="set-btn-icon" type="button" title={open ? "Collapse" : "Expand"} onClick={() => setExpanded((e) => ({ ...e, [s.id]: !open }))}><i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 14 }}></i></button>
                  </div>
                  {open && (
                    <div style={{ borderTop: "1px solid var(--color-border)", padding: "var(--space-4)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
                        <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)" }}>Addenda for {s.name}</div>
                        <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={() => addAddendum(s.id)}><i className="ti ti-plus"></i> Add addendum</button>
                      </div>
                      {list.length === 0
                        ? <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No site-specific amendments.</div>
                        : list.map((a) => <AmendRow key={a.id} a={a} />)}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Add amendment / addendum modal ── */}
      {modalOpen && (
        <div className="set-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="set-modal" role="dialog" aria-modal="true">
            <div className="set-modal-header">
              <div><div className="set-modal-title">Add protocol amendment</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Applied across the whole study</div></div>
              <button className="set-modal-close" type="button" onClick={() => setModalOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="set-modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className="set-field"><div className="set-field-label">Version</div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} placeholder="e.g. v2.2" value={mVer} onChange={(e) => setMVer(e.target.value)} /></div>
                <div className="set-field"><div className="set-field-label">Date</div><input className="set-input" placeholder="YYYY-MM-DD" value={mDate} onChange={(e) => setMDate(e.target.value)} /></div>
              </div>
              <div className="set-field"><div className="set-field-label">Summary</div><textarea className="set-input" style={{ height: 72, padding: "var(--space-2) var(--space-3)", resize: "vertical" }} placeholder="What changed and why" value={mSum} onChange={(e) => setMSum(e.target.value)} /></div>
              <div className="set-field"><div className="set-field-label">Impact</div><input className="set-input" placeholder="e.g. No impact — ongoing subjects unaffected" value={mImpact} onChange={(e) => setMImpact(e.target.value)} /></div>
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}><input type="checkbox" className="set-cb" checked={mStruct} onChange={(e) => setMStruct(e.target.checked)} /> Relates to a hierarchy / structure change</label>
            </div>
            <div className="set-modal-footer">
              <button className="set-btn-secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={saveAmend}><i className="ti ti-check"></i> Save amendment</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Form permissions section (ported from 25-settings.html) ─────────────────
type FormRowT = Dataset["forms"][number];
type Perm = "view" | "edit" | "sign" | "review" | "query" | "finalize";
const FORM_PERMS: Perm[] = ["view", "edit", "sign", "review", "query", "finalize"];
const PERM_LABEL: Record<Perm, string> = { view: "Can view", edit: "Can edit", sign: "Can sign", review: "Can review", query: "Can query", finalize: "Can finalize" };
const PERM_SHORT: Record<Perm, string> = { view: "View", edit: "Edit", sign: "Sign", review: "Review", query: "Query", finalize: "Finalize" };
const PERM_DESC: Record<Perm, string> = {
  view: "Read form data and field values", edit: "Enter and modify field values", sign: "Apply electronic signature (PI level)",
  review: "Mark records as reviewed (CRA/DM)", query: "Raise, respond to, and close queries", finalize: "Mark form as final — triggers lock workflow",
};
const FP_ROLES: Role[] = ["CRC", "CRA", "PI", "DM", "Admin"];
// Subject-form per-role defaults live in the shared store (lib/form-perm-defaults),
// edited from Settings → Roles. Site-scoped forms are monitoring/site-management
// owned — their own default ownership, local to this section.
const SITE_ROLE_DEFAULTS: Record<string, Perm[]> = {
  CRC: ["view"],
  CRA: ["view", "edit", "review", "query"],
  PI: ["view", "sign"],
  DM: ["view", "review", "finalize"],
  Admin: ["view", "edit", "sign", "review", "query", "finalize"],
};
const SITE_SECTION = "Site forms";

function FormPermissionsSection({ studyId, dataset }: { studyId: string; dataset: Dataset }) {
  // Leaf forms (real CRFs) grouped by their real builder group: a subject form's
  // section is its top-level group-form name (walk parent_form_id); standalone
  // site-scoped forms group under a single "Site forms" section.
  const { leaves, sections } = useMemo(() => {
    const all = dataset.forms.filter((f) => f.study_id === studyId && f.scope !== "barn");
    const byId = new Map(all.map((f) => [f.id, f]));
    const parentIds = new Set(all.map((f) => f.parent_form_id).filter(Boolean) as string[]);
    const rootName = (f: FormRowT) => { let cur = f; while (cur.parent_form_id && byId.get(cur.parent_form_id)) cur = byId.get(cur.parent_form_id)!; return cur.name; };
    const sectionOf = (f: FormRowT) => (f.scope === "site" && !f.parent_form_id ? SITE_SECTION : rootName(f));
    const lv = all.filter((f) => !parentIds.has(f.id) && !f.is_summary).slice().sort((a, b) => a.sequence - b.sequence);
    const order: string[] = []; const map = new Map<string, FormRowT[]>();
    for (const f of lv) { const sec = sectionOf(f); if (!map.has(sec)) { map.set(sec, []); order.push(sec); } map.get(sec)!.push(f); }
    return { leaves: lv, sections: order.map((name) => ({ name, forms: map.get(name)! })) };
  }, [dataset.forms, studyId]);

  const key = (fid: string, role: string, p: Perm) => `${fid}|${role}|${p}`;
  // Seed the per-form matrix from each role's DEFAULTS: subject forms from the
  // shared store (editable in Roles → Form permissions), site forms from the
  // local site-ownership defaults. Re-seeds on each mount, so changes made in the
  // Roles section are reflected the next time this section is opened.
  const [perms, setPerms] = useState<Set<string>>(() => {
    const s = new Set<string>();
    const rd = getFormPermDefaults();
    for (const f of leaves) for (const role of FP_ROLES) {
      const list: Perm[] = f.scope === "site" ? (SITE_ROLE_DEFAULTS[role] ?? []) : FORM_PERMS.filter((p) => rd[role]?.[p]);
      for (const p of list) s.add(key(f.id, role, p));
    }
    return s;
  });
  const has = (fid: string, role: string, p: Perm) => perms.has(key(fid, role, p));
  const toggleOne = (fid: string, role: string, p: Perm) => setPerms((s) => { const n = new Set(s); const k = key(fid, role, p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setColForm = (fid: string, p: Perm, on: boolean) => setPerms((s) => { const n = new Set(s); FP_ROLES.forEach((r) => (on ? n.add(key(fid, r, p)) : n.delete(key(fid, r, p)))); return n; });
  const setColRole = (role: string, p: Perm, on: boolean) => setPerms((s) => { const n = new Set(s); leaves.forEach((f) => (on ? n.add(key(f.id, role, p)) : n.delete(key(f.id, role, p)))); return n; });

  const [fpView, setFpView] = useState<"form" | "role">("form");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const switchView = (v: "form" | "role") => { setFpView(v); setExpanded(new Set()); };
  const toggleRow = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rowIds = fpView === "form" ? leaves.map((f) => f.id) : (FP_ROLES as string[]);
  const allExpanded = rowIds.length > 0 && rowIds.every((id) => expanded.has(id));
  const toggleExpandAll = () => setExpanded(allExpanded ? new Set() : new Set(rowIds));

  // Column header select-all checkbox (by-form: across roles · by-role: across forms).
  const colCb = (checked: boolean, onChange: (on: boolean) => void, label: string, desc: string) => (
    <th key={label} title={desc}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
        <span>{label}</span>
        <input type="checkbox" className="perm-cb" checked={checked} onChange={(e) => onChange(e.target.checked)} title={`Toggle ${label} for all`} />
      </div>
    </th>
  );

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Form permissions</h1>
        <p className="section-desc">Control what each role can do on each form</p>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", overflow: "hidden", flexShrink: 0 }}>
          {([["form", "By form", "file-text"], ["role", "By role", "users"]] as const).map(([v, label, icon]) => (
            <button key={v} type="button" onClick={() => switchView(v)}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 var(--space-3)", fontSize: "var(--text-xs)", fontWeight: 500, fontFamily: "var(--font-sans)", border: "none", cursor: "pointer", background: fpView === v ? "var(--color-cta-bg)" : "var(--color-surface)", color: fpView === v ? "#fff" : "var(--color-text-secondary)" }}>
              <i className={`ti ti-${icon}`} style={{ fontSize: 12 }}></i> {label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{fpView === "form" ? "Expand a form to see which roles have access" : "Expand a role to see its permissions across all forms"}</div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-2)" }}>
          <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={toggleExpandAll}><i className={`ti ti-arrows-${allExpanded ? "minimize" : "maximize"}`}></i> {allExpanded ? "Collapse all" : "Expand all"}</button>
        </div>
      </div>

      {/* By form */}
      {fpView === "form" ? (
        sections.map((sec) => (
          <div key={sec.name} style={{ marginBottom: "var(--space-4)" }}>
            <div className="fp-section-divider">{sec.name}</div>
            {sec.forms.map((f) => {
              const open = expanded.has(f.id);
              const anyPerms = FORM_PERMS.filter((p) => FP_ROLES.some((r) => has(f.id, r, p)));
              return (
                <div key={f.id} className="settings-card" style={{ marginBottom: "var(--space-2)" }}>
                  <button type="button" className="fp-row-head" onClick={() => toggleRow(f.id)}>
                    <i className={`ti ti-chevron-${open ? "down" : "right"}`} style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}></i>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{f.name}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{sec.name}</div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {anyPerms.length === 0 ? <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-placeholder)" }}>No access</span>
                        : anyPerms.map((p) => <span key={p} className="set-badge set-badge-slate">{PERM_SHORT[p]}</span>)}
                    </div>
                  </button>
                  {open && (
                    <div style={{ borderTop: "1px solid var(--color-border)", overflowX: "auto" }}>
                      <table className="perm-matrix">
                        <thead><tr><th>Role</th>{FORM_PERMS.map((p) => colCb(FP_ROLES.every((r) => has(f.id, r, p)), (on) => setColForm(f.id, p, on), PERM_LABEL[p], PERM_DESC[p]))}</tr></thead>
                        <tbody>{FP_ROLES.map((r) => (
                          <tr key={r}><td>{r}</td>{FORM_PERMS.map((p) => <td key={p}><input type="checkbox" className="perm-cb" checked={has(f.id, r, p)} onChange={() => toggleOne(f.id, r, p)} /></td>)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      ) : (
        /* By role */
        FP_ROLES.map((role) => {
          const open = expanded.has(role);
          const accessible = leaves.filter((f) => FORM_PERMS.some((p) => has(f.id, role, p))).length;
          const rolePerms = FORM_PERMS.filter((p) => leaves.some((f) => has(f.id, role, p)));
          return (
            <div key={role} className="settings-card" style={{ marginBottom: "var(--space-2)" }}>
              <button type="button" className="fp-row-head" onClick={() => toggleRow(role)}>
                <i className={`ti ti-chevron-${open ? "down" : "right"}`} style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}></i>
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{role}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{accessible} of {leaves.length} forms accessible</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {rolePerms.length === 0 ? <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-placeholder)" }}>No access</span>
                    : rolePerms.map((p) => <span key={p} className="set-badge set-badge-slate">{PERM_SHORT[p]}</span>)}
                </div>
              </button>
              {open && (
                <div style={{ borderTop: "1px solid var(--color-border)", overflowX: "auto" }}>
                  <table className="perm-matrix">
                    <thead><tr><th>Form</th>{FORM_PERMS.map((p) => colCb(leaves.every((f) => has(f.id, role, p)), (on) => setColRole(role, p, on), PERM_LABEL[p], PERM_DESC[p]))}</tr></thead>
                    <tbody>{sections.map((sec) => (
                      <Fragment key={sec.name}>
                        <tr><td colSpan={FORM_PERMS.length + 1} className="fp-matrix-section">{sec.name}</td></tr>
                        {sec.forms.map((f) => (
                          <tr key={f.id}><td>{f.name}</td>{FORM_PERMS.map((p) => <td key={p}><input type="checkbox" className="perm-cb" checked={has(f.id, role, p)} onChange={() => toggleOne(f.id, role, p)} /></td>)}</tr>
                        ))}
                      </Fragment>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}

// ─── Roles section (ported from 25-settings.html) ────────────────────────────
interface RoleState { key: string; preset: string; name: string; code: string; desc: string; color: string; bg: string; tasks: string[]; study: string[]; allSites: boolean; readOnly: boolean; canManage: string[] | null }
const ROLE_TASKS: { key: string; label: string }[] = [
  { key: "data_entry", label: "Data entry" }, { key: "monitoring", label: "Monitoring" },
  { key: "study_management", label: "Study management" }, { key: "reporting", label: "Reporting" },
];
const STUDY_ACCESS: { key: string; label: string; desc: string }[] = [
  { key: "export_data", label: "Export data", desc: "Download study data and reports" },
  { key: "manage_sites", label: "Manage sites", desc: "Add, edit, or deactivate sites" },
  { key: "manage_users", label: "Manage users", desc: "Invite and manage user accounts" },
  { key: "lock_unlock_study", label: "Lock/unlock study", desc: "Database lock authority" },
];
const ROLE_SEED: RoleState[] = [
  { key: "CRC", preset: "CRC", name: "CRC", code: "C", desc: "Clinical Research Coordinator — data entry and subject management", color: "var(--blue-600)", bg: "var(--blue-50)", tasks: ["data_entry"], study: [], allSites: false, readOnly: false, canManage: [] },
  { key: "CRA", preset: "CRA", name: "CRA", code: "A", desc: "Clinical Research Associate — monitoring and review", color: "var(--purple-600)", bg: "var(--purple-50)", tasks: ["monitoring"], study: ["export_data"], allSites: false, readOnly: false, canManage: [] },
  { key: "PI", preset: "PI", name: "PI", code: "P", desc: "Principal Investigator — full clinical authority", color: "var(--green-600)", bg: "var(--green-50)", tasks: ["data_entry", "monitoring"], study: ["export_data"], allSites: false, readOnly: false, canManage: [] },
  { key: "DM", preset: "DM", name: "DM", code: "D", desc: "Data Manager — data quality and lock authority", color: "var(--amber-700)", bg: "var(--amber-50)", tasks: ["study_management", "reporting"], study: ["export_data", "lock_unlock_study"], allSites: false, readOnly: false, canManage: ["CRC", "CRA"] },
  { key: "Admin", preset: "Admin", name: "Admin", code: "AD", desc: "Administrator — full system access", color: "var(--slate-600)", bg: "var(--slate-50)", tasks: ["data_entry", "monitoring", "study_management", "reporting"], study: ["export_data", "manage_sites", "manage_users", "lock_unlock_study"], allSites: true, readOnly: false, canManage: ["CRC", "CRA", "PI", "DM"] },
];
const toggleArr = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
// Task → permission cascade (ported from 25-settings.html onTaskChange/buildRoleFromTasks).
// Checking a task recomputes the role's form-permission defaults + study access as the
// UNION across all currently-checked tasks (full overwrite, not a partial merge).
const TASK_FORM_PERMS: Record<string, Partial<Record<Perm, boolean>>> = {
  data_entry: { view: true, edit: true, query: true },
  monitoring: { view: true, review: true, query: true },
  study_management: { view: true, review: true, finalize: true },
  reporting: { view: true },
};
const TASK_STUDY_PERMS: Record<string, Record<string, boolean>> = {
  data_entry: {},
  monitoring: { export_data: true },
  study_management: { export_data: true, manage_sites: true, lock_unlock_study: true },
  reporting: { export_data: true },
};

function RolesSection({ onToast }: { onToast: (m: string) => void }) {
  const [roles, setRoles] = useState<RoleState[]>(() => ROLE_SEED.map((r) => ({ ...r })));
  const roleDefaults = useFormPermDefaults(); // shared per-role form-permission defaults
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPreset, setNewPreset] = useState("Custom");

  const toggleRow = (k: string) => setExpanded((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const patchRole = (key: string, fn: (r: RoleState) => RoleState) => setRoles((rs) => rs.map((r) => (r.key === key ? fn(r) : r)));
  // Toggling a task cascades to Form permissions (shared store) + Study access — full
  // recompute as the union of all currently-checked tasks.
  function onTaskChange(r: RoleState, taskKey: string) {
    const tasks = toggleArr(r.tasks, taskKey);
    const formPerms = FORM_PERMS.filter((p) => tasks.some((t) => TASK_FORM_PERMS[t]?.[p]));
    const study = STUDY_ACCESS.map((s) => s.key).filter((k) => tasks.some((t) => TASK_STUDY_PERMS[t]?.[k]));
    patchRole(r.key, (x) => ({ ...x, tasks, study }));
    setFormPermDefaultsFor(r.key, formPerms);
  }
  const Toggle = ({ on, onChange }: { on: boolean; onChange: () => void }) => (
    <label className="set-toggle" style={{ flexShrink: 0 }}><input type="checkbox" checked={on} onChange={onChange} /><span className="set-toggle-slider"></span></label>
  );

  function createRole() {
    if (!newName.trim()) { onToast("Role name is required"); return; }
    const key = `role-${newName.trim().toLowerCase().replace(/\s+/g, "-")}-${roles.length}`;
    if (newPreset === "Custom") {
      setRoles((rs) => [...rs, { key, preset: "Custom", name: newName.trim(), code: newName.trim().slice(0, 2).toUpperCase(), desc: "Custom role", color: "var(--slate-600)", bg: "var(--slate-50)", tasks: [], study: [], allSites: false, readOnly: false, canManage: null }]);
      setFormPermDefaultsFor(key, []); // start blank
    } else {
      const base = ROLE_SEED.find((r) => r.preset === newPreset) ?? ROLE_SEED[0];
      setRoles((rs) => [...rs, { ...base, key, preset: base.preset, name: newName.trim(), code: newName.trim().slice(0, 2).toUpperCase(), desc: `Custom role based on ${base.name}`, canManage: null, tasks: [...base.tasks], study: [...base.study] }]);
      setFormPermDefaultsFor(key, rolePresetPerms(base.preset)); // clone preset defaults
    }
    setModalOpen(false); setNewName(""); setNewPreset("Custom");
    onToast("Role created");
  }

  return (
    <>
      <div className="section-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 className="set-section-title">Roles</h1>
          <p className="section-desc">Define roles and their system-level permissions for this study</p>
        </div>
        <button className="set-btn-primary" type="button" onClick={() => setModalOpen(true)}><i className="ti ti-plus"></i> Create role</button>
      </div>

      {roles.map((r) => {
        const open = expanded.has(r.key);
        return (
          <div key={r.key} className="settings-card" style={{ marginBottom: "var(--space-3)" }}>
            <button type="button" className="role-card-head" onClick={() => toggleRow(r.key)}>
              <div className="role-icon" style={{ background: r.bg }}><i className="ti ti-user-shield" style={{ color: r.color }}></i></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="role-name">{r.name}</div>
                <div className="role-desc">{r.desc}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>{r.tasks.map((t) => <span key={t} className="set-badge set-badge-blue">{ROLE_TASKS.find((x) => x.key === t)?.label}</span>)}</div>
                <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}></i>
              </div>
            </button>

            {open && (
              <div className="rcs-body">
                {/* Section 1 — Role info */}
                <div className="rcs-section-title">Role info</div>
                <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div className="set-field"><div className="set-field-label">Role name</div><input className="set-input" style={{ width: 200 }} value={r.name} onChange={(e) => patchRole(r.key, (x) => ({ ...x, name: e.target.value }))} /></div>
                  <div className="set-field"><div className="set-field-label">Role code</div><input className="set-input" style={{ width: 80, textAlign: "center", fontFamily: "var(--font-mono)" }} maxLength={2} value={r.code} onChange={(e) => patchRole(r.key, (x) => ({ ...x, code: e.target.value }))} /></div>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", paddingBottom: 8 }}><Toggle on={r.allSites} onChange={() => patchRole(r.key, (x) => ({ ...x, allSites: !x.allSites }))} /> Add to all sites</label>
                  <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", paddingBottom: 8 }}><Toggle on={r.readOnly} onChange={() => patchRole(r.key, (x) => ({ ...x, readOnly: !x.readOnly }))} /> Read-only permissions</label>
                </div>

                {/* Section 2 — Main tasks (hidden when read-only) */}
                {!r.readOnly && (
                  <>
                    <hr className="rcs-divider" />
                    <div className="rcs-section-title">Main tasks <span className="rcs-section-hint">Checking a task auto-sets form and study permissions below</span></div>
                    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      {ROLE_TASKS.map((t) => {
                        const on = r.tasks.includes(t.key);
                        return (
                          <label key={t.key} className={`rcs-pill${on ? " checked" : ""}`} style={{ flex: "0 0 auto" }}>
                            <input type="checkbox" className="perm-cb" checked={on} onChange={() => onTaskChange(r, t.key)} />
                            <div className="rcs-pill-title">{t.label}</div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Section 3 — Form permissions (full inline default grid; hidden when read-only) */}
                {!r.readOnly && (
                  <>
                    <hr className="rcs-divider" />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
                      <div className="rcs-section-title" style={{ marginBottom: 0 }}>Form permissions <span className="rcs-section-hint">Applied to all forms by default · customise per-form in Form permissions</span></div>
                      <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={() => setFormPermDefaultsFor(r.key, rolePresetPerms(r.preset))}><i className="ti ti-refresh" style={{ fontSize: 11 }}></i> Reset</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-2)" }}>
                      {FORM_PERMS.map((p) => {
                        const on = !!roleDefaults[r.key]?.[p];
                        return (
                          <label key={p} className={`rcs-pill${on ? " checked" : ""}`}>
                            <input type="checkbox" className="perm-cb" checked={on} onChange={() => setFormPermDefault(r.key, p, !on)} />
                            <div><div className="rcs-pill-title">{PERM_LABEL[p]}</div><div className="rcs-pill-desc">{PERM_DESC[p]}</div></div>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Section 4 — Study access */}
                <hr className="rcs-divider" />
                <div className="rcs-section-title">Study access</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-2)" }}>
                  {STUDY_ACCESS.map((p) => {
                    const on = r.study.includes(p.key);
                    return (
                      <label key={p.key} className={`rcs-pill${on ? " checked" : ""}`}>
                        <input type="checkbox" className="perm-cb" checked={on} onChange={() => patchRole(r.key, (x) => ({ ...x, study: toggleArr(x.study, p.key) }))} />
                        <div><div className="rcs-pill-title">{p.label}</div><div className="rcs-pill-desc">{p.desc}</div></div>
                      </label>
                    );
                  })}
                </div>

                {/* Section 5 — User management (all roles; hidden when read-only) */}
                {!r.readOnly && (
                  <>
                    <hr className="rcs-divider" />
                    <div className="rcs-section-title">User management <span className="rcs-section-hint">Which roles this role can add/edit users for</span></div>
                    <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap" }}>
                      {roles.filter((x) => x.key !== r.key).map((x) => {
                        const on = (r.canManage ?? []).includes(x.name);
                        return <label key={x.key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", cursor: "pointer" }}><input type="checkbox" className="perm-cb" checked={on} onChange={() => patchRole(r.key, (cur) => ({ ...cur, canManage: toggleArr(cur.canManage ?? [], x.name) }))} /> {x.name}</label>;
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Create role modal (stub) */}
      {modalOpen && (
        <div className="set-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="set-modal" role="dialog" aria-modal="true">
            <div className="set-modal-header">
              <div><div className="set-modal-title">Create role</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Start from an existing role&apos;s permission preset</div></div>
              <button className="set-modal-close" type="button" onClick={() => setModalOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="set-modal-body">
              <div className="set-field"><div className="set-field-label">Role name</div><input className="set-input" placeholder="e.g. Sub-Investigator" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus /></div>
              <div className="set-field"><div className="set-field-label">Based on</div>
                <select className="set-select" value={newPreset} onChange={(e) => setNewPreset(e.target.value)}><option value="Custom">Custom (start blank)</option>{ROLE_SEED.map((r) => <option key={r.preset} value={r.preset}>{r.name}</option>)}</select>
              </div>
            </div>
            <div className="set-modal-footer">
              <button className="set-btn-secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={createRole}><i className="ti ti-check"></i> Create role</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Study preferences section (ported from 25-settings.html, minus Protocol) ─
interface SubjectCol { id: string; label: string; show: boolean; removable: boolean; hiddenRoles: string[] }
const PREF_CHANGE_REASONS = [
  "Data entry error", "Transcription error from source document", "Protocol deviation correction",
  "Clarification from investigator", "Lab result correction", "Unit of measure error", "Date/time correction",
];
const PREF_QUERY_TEMPLATES = [
  "Please clarify this value — it appears inconsistent with other records for this subject.",
  "This value is outside the protocol-defined range. Please confirm or correct.",
  "Missing data: this field is required for this visit. Please complete.",
  "Please confirm the date — it appears to conflict with the visit schedule.",
  "Adverse event severity does not match the narrative description. Please reconcile.",
];
const PREF_SUBJECT_COLS: { id: string; label: string; show: boolean; removable: boolean }[] = [
  { id: "subject_id", label: "Subject ID", show: true, removable: false },
  { id: "age", label: "Age", show: true, removable: true },
  { id: "weight", label: "Weight", show: true, removable: true },
  { id: "status", label: "Status", show: true, removable: true },
  { id: "group", label: "Group / Arm", show: true, removable: true },
  { id: "last_visit", label: "Last visit", show: true, removable: true },
  { id: "forms", label: "Forms", show: false, removable: true },
  { id: "queries", label: "Queries", show: false, removable: true },
  { id: "overdue", label: "Overdue", show: false, removable: true },
];
const SAVE_MODES: { key: "field" | "form"; title: string; desc: string }[] = [
  { key: "field", title: "Field-level autosave", desc: "Saves on blur or change. No submit button. Immediate feedback. Reason for change triggered per field." },
  { key: "form", title: "Form-level submit", desc: "All fields saved together on submit. CRC reviews before committing. Best for longer visit forms." },
];

function StudyPreferencesSection({ studyId, dataset, onToast }: { studyId: string; dataset: Dataset; onToast: (m: string) => void }) {
  const [saveMode, setSaveMode] = useState<"field" | "form">("field");
  const [reasons, setReasons] = useState<string[]>(() => [...PREF_CHANGE_REASONS]);
  const [templates, setTemplates] = useState<string[]>(() => [...PREF_QUERY_TEMPLATES]);
  const [cols, setCols] = useState<SubjectCol[]>(() => PREF_SUBJECT_COLS.map((c) => ({ ...c, hiddenRoles: [] })));

  // Card 4 "Add column from form field" — real forms (that carry fields) + their fields.
  const prefForms = useMemo(() => {
    const withFields = new Set(dataset.formFields.map((f) => f.form_id));
    return dataset.forms.filter((f) => f.study_id === studyId && f.scope !== "barn" && withFields.has(f.id)).slice().sort((a, b) => a.sequence - b.sequence);
  }, [dataset.forms, dataset.formFields, studyId]);
  const [addLabel, setAddLabel] = useState("");
  const [addFormId, setAddFormId] = useState(() => prefForms[0]?.id ?? "");
  const addFields = useMemo(() => dataset.formFields.filter((f) => f.form_id === addFormId).slice().sort((a, b) => a.sequence - b.sequence), [dataset.formFields, addFormId]);
  const [addFieldId, setAddFieldId] = useState(() => addFields[0]?.id ?? "");
  function changeForm(fid: string) {
    setAddFormId(fid);
    const ff = dataset.formFields.filter((f) => f.form_id === fid).slice().sort((a, b) => a.sequence - b.sequence);
    setAddFieldId(ff[0]?.id ?? "");
  }
  function addColumn() {
    const form = prefForms.find((f) => f.id === addFormId);
    const field = addFields.find((f) => f.id === addFieldId);
    if (!form || !field) { onToast("Select a form and a field"); return; }
    const label = addLabel.trim() || `${field.label || field.code} (${form.name})`;
    setCols((c) => [...c, { id: `col-${crypto.randomUUID()}`, label, show: true, removable: true, hiddenRoles: [] }]);
    setAddLabel("");
    onToast("Column added");
  }

  const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border-subtle)" };
  const th: CSSProperties = { padding: "var(--space-2) var(--space-3)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)" };
  const td: CSSProperties = { padding: "var(--space-2) var(--space-3)", borderBottom: "1px solid var(--color-border-subtle)" };

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Study preferences</h1>
        <p className="section-desc">Behaviour and display preferences for this study</p>
      </div>

      {/* ── Card 1: Data save mode ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Data save mode</div><div className="settings-card-desc">How form data is saved by coordinators</div></div></div>
        <div className="settings-card-body">
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {SAVE_MODES.map((m) => (
              <div key={m.key} className={`pref-save-card${saveMode === m.key ? " selected" : ""}`} onClick={() => { setSaveMode(m.key); onToast("Data save mode updated"); }} role="radio" aria-checked={saveMode === m.key} tabIndex={0}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 4 }}>
                  <i className={`ti ti-${saveMode === m.key ? "circle-check-filled" : "circle"}`} style={{ fontSize: 16, color: saveMode === m.key ? "var(--blue-600)" : "var(--color-text-placeholder)" }}></i>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{m.title}</span>
                </div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", lineHeight: 1.5 }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Card 2: Predefined change reasons ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Predefined change reasons</div><div className="settings-card-desc">Coordinators pick from this list when editing previously saved data</div></div>
          <button className="set-btn-secondary" type="button" onClick={() => setReasons((r) => [...r, "New change reason"])}><i className="ti ti-plus"></i> Add</button>
        </div>
        <div className="settings-card-body">
          {reasons.length === 0 ? <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No change reasons defined.</div>
            : reasons.map((r, i) => (
              <div key={i} style={rowStyle}>
                <i className="ti ti-grip-vertical" style={{ fontSize: 14, color: "var(--color-text-placeholder)", cursor: "grab", flexShrink: 0 }}></i>
                <input className="set-input" style={{ height: 32 }} value={r} onChange={(e) => setReasons((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => onToast("Change reason saved")} />
                <button className="set-btn-icon" type="button" title="Remove" onClick={() => setReasons((arr) => arr.filter((_, j) => j !== i))}><i className="ti ti-trash" style={{ fontSize: 14 }}></i></button>
              </div>
            ))}
        </div>
      </div>

      {/* ── Card 3: Predefined query templates ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Predefined query templates</div><div className="settings-card-desc">Standard query text CRAs and DMs can select when raising queries</div></div>
          <button className="set-btn-secondary" type="button" onClick={() => setTemplates((t) => [...t, "New query template"])}><i className="ti ti-plus"></i> Add</button>
        </div>
        <div className="settings-card-body">
          {templates.length === 0 ? <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No query templates defined.</div>
            : templates.map((t, i) => (
              <div key={i} style={rowStyle}>
                <input className="set-input" style={{ height: 32 }} value={t} onChange={(e) => setTemplates((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} onBlur={() => onToast("Query template saved")} />
                <button className="set-btn-icon" type="button" title="Remove" onClick={() => setTemplates((arr) => arr.filter((_, j) => j !== i))}><i className="ti ti-trash" style={{ fontSize: 14 }}></i></button>
              </div>
            ))}
        </div>
      </div>

      {/* ── Card 4: Subject list columns ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Subject list columns</div><div className="settings-card-desc">Choose which columns appear in the subject list table</div></div></div>
        <div className="settings-card-body">
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-3)" }}>Subject ID is always shown. Toggle other columns, set role visibility, or add custom columns from form fields.</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead><tr>
              <th style={{ ...th, textAlign: "left" }}>Column</th>
              <th style={{ ...th, textAlign: "center" }}>Show</th>
              <th style={{ ...th, textAlign: "left" }}>Hidden from roles</th>
              <th style={th}></th>
            </tr></thead>
            <tbody>
              {cols.map((col) => (
                <tr key={col.id}>
                  <td style={td}><span style={{ fontWeight: 500 }}>{col.label}</span>{!col.removable && <span style={{ fontSize: 10, color: "var(--color-text-placeholder)", marginLeft: 6 }}>Required</span>}</td>
                  <td style={{ ...td, textAlign: "center" }}><input type="checkbox" style={{ accentColor: "var(--blue-600)" }} checked={col.show} disabled={!col.removable} onChange={() => setCols((c) => c.map((x) => (x.id === col.id ? { ...x, show: !x.show } : x)))} /></td>
                  <td style={td}>
                    {col.removable ? (
                      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                        {FP_ROLES.map((role) => {
                          const on = col.hiddenRoles.includes(role);
                          return (
                            <label key={role} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", cursor: "pointer" }}>
                              <input type="checkbox" style={{ accentColor: "var(--orange-600)" }} checked={on} onChange={() => setCols((c) => c.map((x) => (x.id === col.id ? { ...x, hiddenRoles: toggleArr(x.hiddenRoles, role) } : x)))} /> {role}
                            </label>
                          );
                        })}
                      </div>
                    ) : <span style={{ color: "var(--color-text-placeholder)", fontSize: "var(--text-xs)" }}>—</span>}
                  </td>
                  <td style={{ ...td, textAlign: "right" }}>{col.removable && <button className="set-btn-icon" type="button" title="Remove" onClick={() => setCols((c) => c.filter((x) => x.id !== col.id))}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--color-border-subtle)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-3)" }}>Add column from form field</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "var(--space-3)", alignItems: "end" }}>
              <div className="set-field"><div className="set-field-label">Column label</div><input className="set-input" placeholder="e.g. Weight" value={addLabel} onChange={(e) => setAddLabel(e.target.value)} /></div>
              <div className="set-field"><div className="set-field-label">Form</div><select className="set-select" value={addFormId} onChange={(e) => changeForm(e.target.value)}>{prefForms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
              <div className="set-field"><div className="set-field-label">Field</div><select className="set-select" value={addFieldId} onChange={(e) => setAddFieldId(e.target.value)}>{addFields.map((f) => <option key={f.id} value={f.id}>{f.label || f.code}</option>)}</select></div>
              <button className="set-btn-secondary" type="button" onClick={addColumn}><i className="ti ti-plus"></i> Add</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Audit & Signatures section (ported from 25-settings.html + audit-trail card) ─
// Default e-signature requirement heuristic (no per-form flag exists in the seed):
// ON for safety (AE/SAE/necropsy), randomization/allocation, dosing/treatment admin,
// consent, withdrawal, and close-out / disposition forms; OFF for routine assessments.
const SIG_DEFAULT_RE = /adverse|\bsae\b|serious|randomi[sz]ation|allocation|treatment admin|administration|dosing|drug admin|re-?treatment|consent|\bicf\b|close[- ]?out|end of study|final disposition|withdrawal|necropsy/i;
const defaultRequiresSig = (name: string) => SIG_DEFAULT_RE.test(name);

function AuditSignaturesSection({ studyId, dataset, onToast }: { studyId: string; dataset: Dataset; onToast: (m: string) => void }) {
  // Card 1 — Electronic signatures.
  const [sigMethod, setSigMethod] = useState("Username + password (biometric equivalent)");
  const [requireMeaning, setRequireMeaning] = useState(true);
  const [coSignature, setCoSignature] = useState(false);

  // Card 2 — leaf forms grouped by builder section (same as Form permissions).
  const sections = useMemo(() => {
    const all = dataset.forms.filter((f) => f.study_id === studyId && f.scope !== "barn");
    const byId = new Map(all.map((f) => [f.id, f]));
    const parentIds = new Set(all.map((f) => f.parent_form_id).filter(Boolean) as string[]);
    const rootName = (f: FormRowT) => { let cur = f; while (cur.parent_form_id && byId.get(cur.parent_form_id)) cur = byId.get(cur.parent_form_id)!; return cur.name; };
    const sectionOf = (f: FormRowT) => (f.scope === "site" && !f.parent_form_id ? SITE_SECTION : rootName(f));
    const lv = all.filter((f) => !parentIds.has(f.id) && !f.is_summary).slice().sort((a, b) => a.sequence - b.sequence);
    const order: string[] = []; const map = new Map<string, FormRowT[]>();
    for (const f of lv) { const sec = sectionOf(f); if (!map.has(sec)) { map.set(sec, []); order.push(sec); } map.get(sec)!.push(f); }
    return order.map((name) => ({ name, forms: map.get(name)! }));
  }, [dataset.forms, studyId]);
  const [sigForms, setSigForms] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const sec of sections) for (const f of sec.forms) if (defaultRequiresSig(f.name)) s.add(f.id);
    return s;
  });
  const toggleSig = (id: string) => setSigForms((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Card 3 — Audit trail behaviour.
  const [reasonSignedLocked, setReasonSignedLocked] = useState(true);
  const [reasonAllEdits, setReasonAllEdits] = useState(false);

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Audit &amp; Signatures</h1>
        <p className="section-desc">Configure audit trail behaviour and electronic signature requirements</p>
      </div>

      {/* ── Card 1: Electronic signatures ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Electronic signatures (21 CFR Part 11)</div></div></div>
        <div className="settings-card-body">
          <div className="settings-row">
            <div><div className="settings-row-label">Signature method</div></div>
            <div className="settings-row-value">
              <select className="set-select" style={{ maxWidth: 280 }} value={sigMethod} onChange={(e) => { setSigMethod(e.target.value); onToast("Signature method updated"); }}>
                <option>Username + password (biometric equivalent)</option>
                <option>Password re-entry</option>
                <option>PIN</option>
              </select>
            </div>
          </div>
          <ToggleRow on={requireMeaning} onToggle={() => { setRequireMeaning(!requireMeaning); onToast("Setting saved"); }} label="Require meaning statement" desc={"Signer must select the meaning of their signature (e.g. “I have reviewed and approved”)"} />
          <ToggleRow on={coSignature} onToggle={() => { setCoSignature(!coSignature); onToast("Setting saved"); }} label="Co-signature" desc="Require a second signer for specific forms" />
        </div>
      </div>

      {/* ── Card 2: Signature requirements per form ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Signature requirements per form</div><div className="settings-card-desc">Which forms require electronic signature before submission</div></div></div>
        <div className="settings-card-body">
          {sections.map((sec) => (
            <div key={sec.name} style={{ marginBottom: "var(--space-3)" }}>
              <div className="fp-section-divider">{sec.name}</div>
              {sec.forms.map((f) => (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <label className="set-toggle" style={{ flexShrink: 0 }}><input type="checkbox" checked={sigForms.has(f.id)} onChange={() => { toggleSig(f.id); onToast("Signature requirement updated"); }} /><span className="set-toggle-slider"></span></label>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{f.name}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Card 3: Audit trail ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Audit trail</div><div className="settings-card-desc">21 CFR Part 11 audit trail configuration</div></div></div>
        <div className="settings-card-body">
          {/* Row 1 — always on, locked */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
            <label className="set-toggle" style={{ flexShrink: 0, marginTop: 1, opacity: 0.65, cursor: "not-allowed" }} title="Regulatory requirement — cannot be disabled"><input type="checkbox" checked disabled readOnly /><span className="set-toggle-slider"></span></label>
            <div style={{ flex: 1 }}>
              <div className="settings-row-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>Audit trail enabled <i className="ti ti-lock" style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}></i></div>
              <div className="settings-row-desc">Every field change is logged with timestamp, user, and reason for change. Cannot be disabled.</div>
            </div>
          </div>
          <ToggleRow on={reasonSignedLocked} onToggle={() => { setReasonSignedLocked(!reasonSignedLocked); onToast("Setting saved"); }} label="Reason for change required on edits to signed/locked records" desc="A change reason is captured for any edit after a record is signed or locked." />
          {/* Row 3 — read-only timestamp format */}
          <div className="settings-row">
            <div><div className="settings-row-label">Timestamp format</div><div className="settings-row-desc">Regulatory requirement — not editable</div></div>
            <div className="settings-row-value"><span className="set-badge set-badge-blue">UTC (Coordinated Universal Time)</span></div>
          </div>
          <ToggleRow on={reasonAllEdits} onToggle={() => { setReasonAllEdits(!reasonAllEdits); onToast("Setting saved"); }} label="Require reason for change on all field edits (not just post-signature)" desc="When OFF, reason is only required on edits after signature/lock." />
        </div>
      </div>
    </>
  );
}

// ─── Billing section (ported from 25-settings.html) ─────────────────────────
interface FeeEvent { id: string; section: string; name: string; trigger: string; rate: number }
const BILLING_STD_SECTIONS = ["Enrollment & Screening", "Protocol visits", "Safety events", "Study close-out"];
const BILLING_COUNTRIES = ["— select country —", "United States", "Canada", "United Kingdom", "Australia", "Germany", "France", "Italy", "Spain", "Netherlands", "Other"];
function billingSeed(code: string): FeeEvent[] {
  const raw: [string, string, string, number][] =
    code === "CA-0801" ? [
      ["Enrollment & Screening", "Screening visit", "Subject screened", 400],
      ["Enrollment & Screening", "Enrollment", "Subject enrolled (ICF signed)", 750],
      ["Enrollment & Screening", "Screen failure", "Screen failure recorded", 150],
      ["Protocol visits", "Baseline visit", "Baseline forms complete", 900],
      ["Protocol visits", "Follow-up visit 1", "Follow-up forms complete", 550],
      ["Protocol visits", "Follow-up visit 2", "Follow-up forms complete", 550],
      ["Protocol visits", "Follow-up visit 3", "Follow-up forms complete", 550],
      ["Protocol visits", "Follow-up visit 4", "Follow-up forms complete", 550],
      ["Protocol visits", "EOS visit", "EOS forms complete", 700],
      ["Safety events", "SAE report", "SAE form submitted <24h", 1200],
      ["Study close-out", "Database lock", "Lock confirmed by DM", 2500],
    ] : code === "PH-2401" ? [
      ["Enrollment & Screening", "Pen setup", "Pen randomized and confirmed", 300],
      ["Protocol visits", "Starter phase complete", "Starter feed phase complete", 400],
      ["Protocol visits", "Grower phase complete", "Grower feed phase complete", 400],
      ["Protocol visits", "Finisher phase complete", "Finisher feed phase complete", 500],
      ["Study close-out", "Database lock", "Lock confirmed by DM", 2500],
    ] : [ // BR-2502
      ["Enrollment & Screening", "Screening visit", "Subject screened", 450],
      ["Enrollment & Screening", "Enrollment", "Subject enrolled (ICF signed)", 800],
      ["Enrollment & Screening", "Screen failure", "Screen failure recorded", 200],
      ["Protocol visits", "Day 0 — Treatment", "Day 0 forms complete", 950],
      ["Protocol visits", "Day 28 — Visit", "Day 28 forms complete", 600],
      ["Protocol visits", "Day 49/84 — Closeout", "Final visit complete", 750],
      ["Safety events", "SAE report", "SAE form submitted <24h", 1200],
      ["Study close-out", "Database lock", "Lock confirmed by DM", 2500],
    ];
  return raw.map(([section, name, trigger, rate], i) => ({ id: `fee-${i}`, section, name, trigger, rate }));
}

function BillingSection({ studyCode, onToast }: { studyCode: string; onToast: (m: string) => void }) {
  const Req = () => <span style={{ color: "var(--red-600)" }}> *</span>;
  const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" };

  // Card 2 — payment terms.
  const [editTerms, setEditTerms] = useState(false);
  const [holdback, setHoldback] = useState("10");
  const [terms, setTerms] = useState("Net 30");
  const [currency, setCurrency] = useState("USD");

  // Card 3 — fee schedule.
  const [fees, setFees] = useState<FeeEvent[]>(() => billingSeed(studyCode));
  const feeSections = useMemo(() => {
    const order: string[] = []; const map = new Map<string, FeeEvent[]>();
    for (const e of fees) { if (!map.has(e.section)) { map.set(e.section, []); order.push(e.section); } map.get(e.section)!.push(e); }
    return order.map((s) => ({ name: s, events: map.get(s)! }));
  }, [fees]);
  const updateRate = (id: string, val: string) => setFees((f) => f.map((x) => (x.id === id ? { ...x, rate: Number(val) || 0 } : x)));
  const sectionOpts = useMemo(() => Array.from(new Set([...BILLING_STD_SECTIONS, ...fees.map((f) => f.section)])), [fees]);

  // Fee modal.
  const [feeOpen, setFeeOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [fName, setFName] = useState(""); const [fSection, setFSection] = useState(BILLING_STD_SECTIONS[0]); const [fNewSection, setFNewSection] = useState(""); const [fTrigger, setFTrigger] = useState(""); const [fRate, setFRate] = useState("0");
  function openFee(idx: number | null) {
    setEditIdx(idx); setFNewSection("");
    if (idx == null) { setFName(""); setFSection(sectionOpts[0]); setFTrigger(""); setFRate("0"); }
    else { const e = fees[idx]; setFName(e.name); setFSection(e.section); setFTrigger(e.trigger); setFRate(String(e.rate)); }
    setFeeOpen(true);
  }
  function saveFee() {
    const section = fSection === "__new__" ? fNewSection.trim() : fSection;
    if (!fName.trim() || !section) { onToast("Event name and section are required"); return; }
    const ev: FeeEvent = { id: editIdx != null ? fees[editIdx].id : `fee-${crypto.randomUUID()}`, section, name: fName.trim(), trigger: fTrigger.trim(), rate: Number(fRate) || 0 };
    setFees((f) => (editIdx != null ? f.map((x, i) => (i === editIdx ? ev : x)) : [...f, ev]));
    setFeeOpen(false); onToast("Fee event saved");
  }
  function deleteFee() { if (editIdx == null) return; setFees((f) => f.filter((_, i) => i !== editIdx)); setFeeOpen(false); onToast("Fee event deleted"); }

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Billing</h1>
        <p className="section-desc">Fee schedule and payment configuration for this study</p>
      </div>

      {/* ── Card 1: Billing information ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Billing information</div><div className="settings-card-desc">Invoice recipient details for this study</div></div></div>
        <div className="settings-card-body">
          <div style={grid2}>
            <div className="set-field"><div className="set-field-label">Contact name<Req /></div><input className="set-input" onBlur={() => onToast("Billing information saved")} /></div>
            <div className="set-field"><div className="set-field-label">Company<Req /></div><input className="set-input" onBlur={() => onToast("Billing information saved")} /></div>
          </div>
          <div style={grid2}>
            <div className="set-field"><div className="set-field-label">ATTN</div><input className="set-input" placeholder="Optional" onBlur={() => onToast("Billing information saved")} /></div>
            <div className="set-field"><div className="set-field-label">Email<Req /></div><input className="set-input" type="email" onBlur={() => onToast("Billing information saved")} /></div>
          </div>
          <div style={grid2}>
            <div className="set-field"><div className="set-field-label">Phone</div><input className="set-input" type="tel" onBlur={() => onToast("Billing information saved")} /></div>
            <div className="set-field"><div className="set-field-label">Address<Req /></div><input className="set-input" onBlur={() => onToast("Billing information saved")} /></div>
          </div>
          <div style={grid2}>
            <div className="set-field"><div className="set-field-label">City<Req /></div><input className="set-input" onBlur={() => onToast("Billing information saved")} /></div>
            <div className="set-field"><div className="set-field-label">State / Province / Region</div><input className="set-input" onBlur={() => onToast("Billing information saved")} /></div>
          </div>
          <div style={{ ...grid2, marginBottom: 0 }}>
            <div className="set-field"><div className="set-field-label">Postal / ZIP code<Req /></div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} onBlur={() => onToast("Billing information saved")} /></div>
            <div className="set-field"><div className="set-field-label">Country<Req /></div><select className="set-select" defaultValue={BILLING_COUNTRIES[0]} onChange={() => onToast("Billing information saved")}>{BILLING_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          </div>
        </div>
      </div>

      {/* ── Card 2: Payment terms ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Payment terms</div></div>
          <button className="set-btn-secondary" type="button" onClick={() => { if (editTerms) onToast("Payment terms saved"); setEditTerms((e) => !e); }}><i className={`ti ti-${editTerms ? "check" : "pencil"}`}></i> {editTerms ? "Done" : "Edit"}</button>
        </div>
        <div className="settings-card-body">
          <div className="settings-row">
            <div><div className="settings-row-label">Holdback percentage</div><div className="settings-row-desc">Withheld until database lock</div></div>
            <div className="settings-row-value">{editTerms
              ? <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><input className="set-input" type="number" min={0} value={holdback} style={{ width: 80, fontFamily: "var(--font-mono)" }} onChange={(e) => setHoldback(e.target.value)} /> %</div>
              : <span style={{ fontFamily: "var(--font-mono)" }}>{holdback}%</span>}</div>
          </div>
          <div className="settings-row">
            <div><div className="settings-row-label">Payment terms</div></div>
            <div className="settings-row-value">{editTerms
              ? <select className="set-select" style={{ maxWidth: 160 }} value={terms} onChange={(e) => setTerms(e.target.value)}><option>Net 30</option><option>Net 45</option><option>Net 60</option></select>
              : <span>{terms}</span>}</div>
          </div>
          <div className="settings-row">
            <div><div className="settings-row-label">Study default currency</div></div>
            <div className="settings-row-value">{editTerms
              ? <select className="set-select" style={{ maxWidth: 160 }} value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select>
              : <span>{currency}</span>}</div>
          </div>
        </div>
      </div>

      {/* ── Card 3: Fee schedule ── */}
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Fee schedule</div><div className="settings-card-desc">Billable events and rates — applies to all site invoices</div></div>
          <button className="set-btn-secondary" type="button" onClick={() => openFee(null)}><i className="ti ti-plus"></i> Add event</button>
        </div>
        <div className="settings-card-body" style={{ overflowX: "auto" }}>
          <table className="fee-table">
            <thead><tr><th>Event type</th><th>Trigger</th><th style={{ textAlign: "right" }}>Default rate (USD)</th><th></th></tr></thead>
            <tbody>
              {feeSections.map((sec) => (
                <Fragment key={sec.name}>
                  <tr className="fee-section"><td colSpan={4}>{sec.name}</td></tr>
                  {sec.events.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontWeight: 500 }}>{e.name}</td>
                      <td style={{ color: "var(--color-text-secondary)" }}>{e.trigger}</td>
                      <td style={{ textAlign: "right" }}><input className="set-input" type="number" value={e.rate} style={{ width: 100, textAlign: "right", fontFamily: "var(--font-mono)", display: "inline-block" }} onChange={(ev) => updateRate(e.id, ev.target.value)} onBlur={() => onToast("Rate saved")} /></td>
                      <td style={{ textAlign: "right" }}><button className="set-btn-icon" type="button" title="Edit event" onClick={() => openFee(fees.indexOf(e))}><i className="ti ti-pencil" style={{ fontSize: 13 }}></i></button></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Fee event modal ── */}
      {feeOpen && (
        <div className="set-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setFeeOpen(false); }}>
          <div className="set-modal" role="dialog" aria-modal="true">
            <div className="set-modal-header">
              <div><div className="set-modal-title">{editIdx == null ? "Add fee event" : "Edit fee event"}</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Define a billable event and its default rate</div></div>
              <button className="set-modal-close" type="button" onClick={() => setFeeOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="set-modal-body">
              <div className="set-field"><div className="set-field-label">Event name</div><input className="set-input" placeholder="e.g. Visit 3 — Day 28" value={fName} onChange={(e) => setFName(e.target.value)} autoFocus /></div>
              <div className="set-field"><div className="set-field-label">Section</div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <select className="set-select" style={{ flex: 1 }} value={fSection} onChange={(e) => setFSection(e.target.value)}>{sectionOpts.map((s) => <option key={s} value={s}>{s}</option>)}<option value="__new__">+ New section…</option></select>
                  {fSection === "__new__" && <input className="set-input" style={{ flex: 1 }} placeholder="Section name" value={fNewSection} onChange={(e) => setFNewSection(e.target.value)} />}
                </div>
              </div>
              <div className="set-field"><div className="set-field-label">Trigger</div><input className="set-input" placeholder="e.g. V3 all forms complete" value={fTrigger} onChange={(e) => setFTrigger(e.target.value)} /></div>
              <div className="set-field"><div className="set-field-label">Default rate</div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>$ <input className="set-input" type="number" min={0} step={50} value={fRate} style={{ width: 140, fontFamily: "var(--font-mono)" }} onChange={(e) => setFRate(e.target.value)} /> USD</div>
              </div>
            </div>
            <div className="set-modal-footer" style={{ justifyContent: editIdx == null ? "flex-end" : "space-between" }}>
              {editIdx != null && <button className="set-btn-secondary" type="button" style={{ color: "var(--red-600)", borderColor: "var(--red-200)" }} onClick={deleteFee}><i className="ti ti-trash"></i> Delete event</button>}
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button className="set-btn-secondary" type="button" onClick={() => setFeeOpen(false)}>Cancel</button>
                <button className="set-btn-primary" type="button" onClick={saveFee}><i className="ti ti-check"></i> Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function StudySettingsPage() {
  const { study } = useShell();
  const { dataset } = useStudySession();
  const cfg = useMemo(() => randConfig(study.code), [study.code]);
  const typeCfg = getStudyTypeConfig(study.code); // study-type design flags (rand unit, timing)
  const isGroupRand = typeCfg.randomizationUnit === "group";
  const atSetup = typeCfg.groupAssignmentTiming === "at_setup";

  const [section, setSection] = useState<string>("randomization");
  const [method, setMethod] = useState<Method>(cfg.method);
  const [blockSize, setBlockSize] = useState(cfg.blockSize);
  const [blinding, setBlinding] = useState(cfg.blinding);
  const [stratScope, setStratScope] = useState<"site" | "study">(cfg.stratScope);
  const [factors, setFactors] = useState<StratFactor[]>(cfg.stratFactors);
  const [toast, setToast] = useState<string | null>(null);

  // Real forms for the active study, for the Add-factor modal's Form/Field selects.
  const studyForms = useMemo(
    () => dataset.forms.filter((f) => f.study_id === study.id && f.scope !== "barn").slice().sort((a, b) => a.sequence - b.sequence),
    [dataset.forms, study.id],
  );

  // Add/Edit-factor modal state.
  const [modalOpen, setModalOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [sfName, setSfName] = useState("");
  const [sfSource, setSfSource] = useState<"site" | "form">("site");
  const [sfForm, setSfForm] = useState("");
  const [sfField, setSfField] = useState("");
  const [sfLevels, setSfLevels] = useState<string[]>([]);
  const selForm = studyForms.find((f) => f.name === sfForm);
  const fieldOpts = selForm ? dataset.formFields.filter((f) => f.form_id === selForm.id) : [];

  // Reset to the active study's config when the study changes.
  useEffect(() => {
    // Reset randomization state on study switch; keep the user on their current
    // settings section (all sections now repopulate from the active study config).
    setMethod(cfg.method); setBlockSize(cfg.blockSize); setBlinding(cfg.blinding);
    setStratScope(cfg.stratScope); setFactors(cfg.stratFactors);
  }, [cfg]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const enrolled = (g: Group) => dataset.subjects.filter((s) => s.study_id === study.id && s.randomization_arm === g.arm).length;
  const ratioTotal = cfg.groups.reduce((s, g) => s + g.ratio, 0);
  const showBlock = method === "blocked" || method === "stratified";
  const blockWarn = showBlock && blockSize !== "variable" && Number(blockSize) % ratioTotal !== 0;

  function openAddModal() {
    setEditKey(null); setSfName(""); setSfSource("site");
    setSfForm(studyForms[0]?.name ?? ""); setSfField(""); setSfLevels([]);
    setModalOpen(true);
  }
  function openEditModal(f: StratFactor) {
    setEditKey(f.key); setSfName(f.name); setSfSource(f.source);
    setSfForm(f.form ?? studyForms[0]?.name ?? ""); setSfField(f.field ?? ""); setSfLevels(f.levels.slice());
    setModalOpen(true);
  }
  function saveFactor() {
    if (!sfName.trim()) { setToast("Factor name is required"); return; }
    if (sfSource === "form" && !sfField) { setToast("Please select a field"); return; }
    const levels = sfSource === "site" ? [] : sfLevels.filter((l) => l.trim() !== "");
    const next: StratFactor = { key: editKey ?? `sf-${Date.now()}`, name: sfName.trim(), source: sfSource, form: sfSource === "form" ? sfForm : undefined, field: sfSource === "form" ? sfField : undefined, levels };
    setFactors((prev) => editKey ? prev.map((f) => (f.key === editKey ? next : f)) : [...prev, next]);
    setToast(editKey ? "Factor updated" : "Factor added");
    setModalOpen(false);
  }
  const factorDetail = (f: StratFactor) => f.source === "site"
    ? "Built-in — uses the study's site list"
    : `${f.form} → ${f.field || "—"}${f.levels.length ? ` (${f.levels.join(" / ")})` : ""}`;

  return (
    <div className="settings-wrap">
      {/* Nav sidebar — grouped */}
      <nav className="settings-nav" aria-label="Settings sections">
        {NAV_GROUPS.map((grp, gi) => (
          <div key={grp.title}>
            <div className="settings-nav-title" style={gi > 0 ? { marginTop: "var(--space-4)" } : undefined}>{grp.title}</div>
            {grp.items.map((n) => (
              <button key={n.key} className={`settings-nav-item${section === n.key ? " active" : ""}`} onClick={() => setSection(n.key)} type="button">
                <i className={`ti ti-${n.icon}`} aria-hidden="true"></i> {n.label}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div className="settings-content">
        {section === "randomization" ? (
          <>
            <div className="section-header">
              <h1 className="set-section-title">Randomization</h1>
              <p className="section-desc">Treatment group configuration, blinding, and assignment rules for {study.code}</p>
            </div>

            {/* ── Card 1: Randomization settings ── */}
            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">Randomization settings</div></div></div>
              <div className="settings-card-body">
                <div className="settings-row">
                  <div><div className="settings-row-label">Randomization method</div><div className="settings-row-desc">How subjects are assigned to treatment groups</div></div>
                  <div className="settings-row-value">
                    <select className="set-select" style={{ maxWidth: 280 }} value={method} onChange={(e) => { setMethod(e.target.value as Method); setToast("Method updated"); }}>
                      <option value="blocked">Blocked randomization</option>
                      <option value="simple">Simple randomization</option>
                      <option value="stratified">Stratified randomization</option>
                      <option value="minimization">Minimization</option>
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <div><div className="settings-row-label">Randomization unit</div><div className="settings-row-desc">The unit assigned to a treatment group</div></div>
                  <div className="settings-row-value">
                    <select className="set-select" style={{ maxWidth: 200 }} value={isGroupRand ? "group" : "individual"} onChange={() => setToast("Randomization unit updated")}>
                      <option value="individual">Individual subject</option>
                      <option value="group">Group / pen</option>
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <div><div className="settings-row-label">Group assignment timing</div><div className="settings-row-desc">When treatment arms are assigned</div></div>
                  <div className="settings-row-value">
                    <select className="set-select" style={{ maxWidth: 200 }} value={typeCfg.groupAssignmentTiming} onChange={() => setToast("Group assignment timing updated")}>
                      <option value="at_enrollment">At enrollment</option>
                      <option value="at_setup">At study setup</option>
                      <option value="predetermined">Predetermined</option>
                    </select>
                  </div>
                </div>

                {showBlock && (
                  <div className="settings-row">
                    <div><div className="settings-row-label">Block size</div><div className="settings-row-desc">Number of subjects per randomization block</div></div>
                    <div className="settings-row-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <select className="set-select" style={{ maxWidth: 120 }} value={blockSize} onChange={(e) => { setBlockSize(e.target.value); setToast("Block size updated"); }}>
                        <option value="4">4</option><option value="6">6</option><option value="8">8</option><option value="variable">Variable</option>
                      </select>
                      {blockWarn && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", color: "var(--amber-700)" }}>
                          <i className="ti ti-alert-triangle" style={{ fontSize: 13 }}></i>
                          Block size {blockSize} is not a multiple of ratio total {ratioTotal}.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="settings-row">
                  <div><div className="settings-row-label">Blinding</div><div className="settings-row-desc">Who knows the treatment assignment</div></div>
                  <div className="settings-row-value">
                    <select className="set-select" style={{ maxWidth: 200 }} value={blinding} onChange={(e) => { setBlinding(e.target.value); setToast("Blinding updated"); }}>
                      <option>Open-label (no blinding)</option><option>Single-blind</option><option>Double-blind</option>
                    </select>
                  </div>
                </div>

                {/* Stratification factors */}
                <div style={{ padding: "var(--space-3) 0" }}>
                  <div style={{ marginBottom: "var(--space-3)" }}>
                    <div className="settings-row-label">Stratification factors</div>
                    <div className="settings-row-desc">{method === "stratified" ? "Required — define the variables used to form strata." : "Variables used to balance groups at randomization"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                    <button className={`strat-scope-btn${stratScope === "site" ? " active" : ""}`} type="button" onClick={() => { setStratScope("site"); setToast("Stratification scope updated"); }}><i className="ti ti-building-hospital" style={{ fontSize: 13 }}></i> Per site</button>
                    <button className={`strat-scope-btn${stratScope === "study" ? " active" : ""}`} type="button" onClick={() => { setStratScope("study"); setToast("Stratification scope updated"); }}><i className="ti ti-flask" style={{ fontSize: 13 }}></i> Across study</button>
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginLeft: 4 }}>{stratScope === "site" ? "Randomization balanced separately within each site" : "Randomization balanced across the whole study"}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
                    {factors.map((f) => (
                      <div className="strat-factor-card" key={f.key}>
                        <i className="ti ti-grip-vertical" style={{ fontSize: 14, color: "var(--color-text-placeholder)", cursor: "grab", flexShrink: 0 }}></i>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 3 }}>
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{f.name}</span>
                            <span className={`set-badge ${f.source === "site" ? "set-badge-slate" : "set-badge-blue"}`}>{f.source === "site" ? "Site" : "Form field"}</span>
                          </div>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{factorDetail(f)}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                          <button className="set-btn-icon" title="Edit factor" type="button" onClick={() => openEditModal(f)}><i className="ti ti-pencil" style={{ fontSize: 13 }}></i></button>
                          <button className="set-btn-icon" title="Remove factor" type="button" onClick={() => { setFactors(factors.filter((x) => x.key !== f.key)); setToast("Factor removed"); }}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>
                        </div>
                      </div>
                    ))}
                    {factors.length === 0 && (method === "stratified" || method === "minimization") && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--amber-700)" }}><i className="ti ti-alert-triangle" style={{ fontSize: 11 }}></i> At least one stratification factor is required for this method.</div>
                    )}
                    {factors.length === 0 && method !== "stratified" && method !== "minimization" && (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No stratification factors defined.</div>
                    )}
                  </div>
                  <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={openAddModal}><i className="ti ti-plus"></i> Add factor</button>
                </div>

                {method === "minimization" && (
                  <div className="set-info-banner" style={{ marginTop: "var(--space-2)" }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 16, color: "var(--slate-600)", flexShrink: 0, marginTop: 1 }}></i>
                    <div><div style={{ fontWeight: 500, marginBottom: 2 }}>Dynamic assignment — no randomization list required</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Minimization assigns each new subject to the group that minimises imbalance across stratification factors at that moment.</div></div>
                  </div>
                )}
                {method === "simple" && (
                  <div className="set-amber-banner" style={{ marginTop: "var(--space-2)" }}>
                    <i className="ti ti-alert-triangle" style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}></i>
                    <span>{isGroupRand
                      ? "Simple randomization with fewer than 20 experimental units may result in imbalance. Consider stratifying by house/barn."
                      : "Simple randomization is not recommended for studies with fewer than 100 subjects."}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Card 2: Treatment groups ── */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div><div className="settings-card-title">Treatment groups</div><div className="settings-card-desc">Groups, allocation ratio, enrolment, and the inventory lot each is linked to</div></div>
                <button className="set-btn-secondary" type="button" disabled={atSetup} onClick={() => setToast(atSetup ? "Treatment groups are fixed at study initiation." : "Group management locked after first enrollment.")}><i className="ti ti-plus"></i> Add group</button>
              </div>
              <div className="settings-card-body">
                {/* Allocation ratio bar */}
                <div style={{ marginBottom: "var(--space-4)" }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Allocation ratio · {cfg.groups.map((g) => g.ratio).join(":")}</div>
                  <div className="ratio-bar">{cfg.groups.map((g) => <div key={g.code} className="ratio-fill" style={{ width: `${Math.round((g.ratio / ratioTotal) * 100)}%`, background: g.color, opacity: 0.85 }} />)}</div>
                </div>
                {/* Group rows */}
                {cfg.groups.map((g) => (
                  <div className="group-row" key={g.code}>
                    <div className="group-color-dot" style={{ background: g.color }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{g.name}{g.detail ? <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}> · {g.detail}</span> : null}</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", fontFamily: "var(--font-mono)" }}>{g.code}{g.blindedLabel ? ` · Blinded label: ${g.blindedLabel}` : ""}</div>
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", textAlign: "center", minWidth: 70 }}>Ratio<br /><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>{g.ratio}</span></div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)", textAlign: "center", minWidth: 70 }}>Enrolled<br /><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}>{enrolled(g)}</span></div>
                    <div style={{ minWidth: 130, textAlign: "right" }}><span className="group-lot" title="Linked inventory lot">{g.lot}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Card 3: Randomization list ── */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div><div className="settings-card-title">Randomization list</div><div className="settings-card-desc">Upload or generate the randomization schedule</div></div>
                {method !== "minimization" && !atSetup && <button className="set-btn-primary" type="button" onClick={() => setToast("Randomization list locked. Assignments cannot be changed without a protocol amendment.")}><i className="ti ti-lock"></i> Lock randomization</button>}
              </div>
              <div className="settings-card-body">
                {atSetup ? (
                  <div className="set-info-banner">
                    <i className="ti ti-info-circle" style={{ fontSize: 16, color: "var(--slate-600)", flexShrink: 0, marginTop: 1 }}></i>
                    <div><div style={{ fontWeight: 500, marginBottom: 2 }}>Arm assignment is configured at study setup</div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Pens are assigned to treatment groups when the pen structure is established.</div></div>
                  </div>
                ) : method === "minimization" ? (
                  <div className="set-note"><i className="ti ti-info-circle" style={{ fontSize: 13, marginRight: 4 }}></i> Minimization uses real-time dynamic assignment — no randomization list is needed.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                      <button className="set-btn-secondary" type="button" onClick={() => setToast("CSV upload is disabled in the demo.")}><i className="ti ti-file-type-csv"></i> Upload list (CSV)</button>
                      {typeCfg.groupAssignmentTiming !== "predetermined" && <button className="set-btn-secondary" type="button" onClick={() => setToast("Randomization list generated (demo).")}><i className="ti ti-refresh"></i> Generate list</button>}
                    </div>
                    <div className="set-note"><i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 4 }}></i> Randomization list will be locked before first enrollment. Once locked, assignments cannot be changed without a protocol amendment.</div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : section === "inventory" ? (
          <InventorySection studyCode={study.code} studyId={study.id} studyForms={studyForms} dataset={dataset} onToast={setToast} />
        ) : section === "study" ? (
          <StudySettingsSection key={study.code} studyCode={study.code} onToast={setToast} />
        ) : section === "protocol" ? (
          <ProtocolAmendmentsSection key={study.code} studyCode={study.code} studyId={study.id} dataset={dataset} onToast={setToast} />
        ) : section === "formperm" ? (
          <FormPermissionsSection key={study.code} studyId={study.id} dataset={dataset} />
        ) : section === "roles" ? (
          <RolesSection key={study.code} onToast={setToast} />
        ) : section === "preferences" ? (
          <StudyPreferencesSection key={study.code} studyId={study.id} dataset={dataset} onToast={setToast} />
        ) : section === "audit" ? (
          <AuditSignaturesSection key={study.code} studyId={study.id} dataset={dataset} onToast={setToast} />
        ) : section === "billing" ? (
          <BillingSection key={study.code} studyCode={study.code} onToast={setToast} />
        ) : (
          <>
            <div className="section-header">
              <h1 className="set-section-title">{NAV_ITEMS.find((n) => n.key === section)?.label}</h1>
              <p className="section-desc">Study configuration for {study.code}</p>
            </div>
            <div className="set-coming-soon">
              <i className={`ti ti-${NAV_ITEMS.find((n) => n.key === section)?.icon ?? "settings"}`} style={{ fontSize: 32, color: "var(--color-text-placeholder)" }} aria-hidden="true"></i>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 500, color: "var(--color-text-secondary)" }}>Coming soon</div>
              <div style={{ fontSize: "var(--text-sm)", maxWidth: 440, lineHeight: 1.5 }}>This settings section isn’t built yet. The Randomization section is the first live area.</div>
            </div>
          </>
        )}
      </div>

      {/* ── Add / Edit stratification factor modal ── */}
      {modalOpen && (
        <div className="set-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="set-modal" role="dialog" aria-modal="true">
            <div className="set-modal-header">
              <div><div className="set-modal-title">{editKey ? "Edit stratification factor" : "Add stratification factor"}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Define a variable used to balance treatment groups</div></div>
              <button className="set-modal-close" type="button" onClick={() => setModalOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="set-modal-body">
              <div className="set-field">
                <div className="set-field-label">Factor name</div>
                <input className="set-input" placeholder="e.g. Sex, Age class, Breed, Disease severity" value={sfName} onChange={(e) => setSfName(e.target.value)} />
              </div>
              <div className="set-field">
                <div className="set-field-label">Source</div>
                <select className="set-select" value={sfSource} onChange={(e) => { const v = e.target.value as "site" | "form"; setSfSource(v); if (v === "form" && !sfForm) setSfForm(studyForms[0]?.name ?? ""); }}>
                  <option value="site">Site — balance by site</option>
                  <option value="form">Form field — pull value from a CRF field</option>
                </select>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 4 }}>{sfSource === "site" ? "Site is always available — no form mapping needed." : "Select the form and field that holds this value."}</div>
              </div>

              {sfSource === "form" && (
                <>
                  <div className="set-field">
                    <div className="set-field-label">Form</div>
                    <select className="set-select" value={sfForm} onChange={(e) => { setSfForm(e.target.value); setSfField(""); }}>
                      {studyForms.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                    </select>
                  </div>
                  <div className="set-field">
                    <div className="set-field-label">Field</div>
                    <select className="set-select" value={sfField} onChange={(e) => setSfField(e.target.value)}>
                      <option value="">— select a field —</option>
                      {fieldOpts.map((f) => { const lbl = f.label || f.code; return <option key={f.id} value={lbl}>{lbl}</option>; })}
                    </select>
                  </div>
                  <div style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: "var(--space-4)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                      <div><div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>Levels</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Define the categories subjects are sorted into</div></div>
                      <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={() => setSfLevels([...sfLevels, ""])}><i className="ti ti-plus"></i> Add level</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                      {sfLevels.length === 0 ? (
                        <div className="set-level-empty">No levels yet</div>
                      ) : sfLevels.map((lv, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <i className="ti ti-grip-vertical" style={{ fontSize: 13, color: "var(--color-text-placeholder)", cursor: "grab", flexShrink: 0 }}></i>
                          <input className="set-input" style={{ height: 32 }} value={lv} placeholder="e.g. <200 kg" onChange={(e) => setSfLevels(sfLevels.map((x, j) => (j === i ? e.target.value : x)))} />
                          <button className="set-btn-icon" type="button" onClick={() => setSfLevels(sfLevels.filter((_, j) => j !== i))}><i className="ti ti-x" style={{ fontSize: 13 }}></i></button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="set-modal-footer">
              <button className="set-btn-secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={saveFactor}><i className="ti ti-check"></i> {editKey ? "Save factor" : "Add factor"}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="set-toast" role="status">{toast}</div>}
    </div>
  );
}
