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

import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { STUDY_RULES_SEED } from "@/lib/notifications-data";
import { QUERY_TEMPLATES } from "@/lib/query-templates";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { Dataset, StudyRow } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { INV_ACTIONS, INV_ROLES, useInventoryPermissions, setInvPermission } from "@/lib/inventory-permissions";
import { getStudyTypeConfig } from "@/lib/study-type-config";
import { getFormPermDefaults, setFormPermDefault, setFormPermDefaultsFor, rolePresetPerms, useFormPermDefaults } from "@/lib/form-perm-defaults";
import { type StudyStatus, STATUS_ORDER, STATUS_META, getStudyStatus, isSectionEditable, isSectionLocked, LOCKED_BANNER_TEXT } from "@/lib/study-status";
import { type IPType, type IPProduct, SEEDED_IPS, useIps, updateIp, addIp, removeIp } from "@/lib/ip-registry-store";
import "./settings.css";

type Method = "blocked" | "simple" | "stratified" | "minimization" | "generated";
interface Group { code: string; name: string; description?: string; ratio: number; arm: string; lot: string; blindedLabel?: string; color: string }
interface StratFactor { key: string; name: string; source: "site" | "form"; form?: string; field?: string; levels: string[] }
interface RandConfig { method: Method; blockSizes: number[]; blinding: string; stratScope: "site" | "study"; stratFactors: StratFactor[]; groups: Group[] }

// Grouped nav (ported from 25-settings.html). Only Randomization is live.
interface NavItem { key: string; label: string; icon: string }
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Study setup", items: [
    { key: "study", label: "Study Identity", icon: "id-badge-2" },
    { key: "randomization", label: "Protocol Builder", icon: "list-check" },
  ] },
  { title: "Study management", items: [
    { key: "roles", label: "Roles", icon: "shield-check" },
    { key: "formperm", label: "Form permissions", icon: "forms" },
    { key: "preferences", label: "Study Preferences", icon: "adjustments" },
    { key: "protocol", label: "Protocol & Amendments", icon: "file-certificate" },
    { key: "inventory", label: "Inventory", icon: "flask" },
    { key: "audit", label: "Audit & Signatures", icon: "writing" },
    { key: "billing", label: "Billing", icon: "receipt-2" },
  ] },
];
const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

// Per-study randomization configuration (the real protocol design).
// The three demo studies ship with a full seed; anything else is a NEW study created
// from the studies list (code "NEW-xxxx", status "setup") and gets the empty setup flow.
const SEEDED_STUDY_CODES = new Set(["BR-2502", "CA-0801", "PH-2401"]);
const isSeededStudy = (code: string) => SEEDED_STUDY_CODES.has(code);

function randConfig(code: string): RandConfig {
  if (code === "BR-2502") return {
    method: "blocked", blockSizes: [6, 9], blinding: "Open-label (no blinding)", stratScope: "site",
    stratFactors: [{ key: "sf-site", name: "Site", source: "site", levels: [] }],
    groups: [
      { code: "T01", name: "Tulathromycin 2.5 mg/kg", ratio: 1, arm: "T01", lot: "LOT-BR-T01", color: "#1760A8" },
      { code: "T02", name: "Tulathromycin 5.0 mg/kg", ratio: 1, arm: "T02", lot: "LOT-BR-T02", color: "#1A6B47" },
      { code: "T03", name: "Saline placebo", ratio: 1, arm: "T03", lot: "LOT-BR-T03", color: "#6D7480" },
    ],
  };
  if (code === "CA-0801") return {
    method: "blocked", blockSizes: [4], blinding: "Double-blind", stratScope: "site",
    stratFactors: [
      { key: "sf-site", name: "Site", source: "site", levels: [] },
      { key: "sf-sev", name: "Disease severity", source: "form", form: "Baseline Dermatology Assessment", field: "CADESI-04 score", levels: ["Mild <25", "Moderate 25–60", "Severe >60"] },
    ],
    groups: [
      { code: "T01", name: "Treatment A", description: "DermAlliv™ Active", ratio: 1, arm: "DermAlliv™ Active", lot: "LOT-CA-001", blindedLabel: "Treatment A", color: "#1760A8" },
      { code: "T02", name: "Treatment B", description: "Placebo", ratio: 1, arm: "Placebo", lot: "LOT-CA-001", blindedLabel: "Treatment B", color: "#6D7480" },
    ],
  };
  // PH-2401 — open-label, 2 arms (matches the seeded subjects: all assigned to T01/T02).
  if (code === "PH-2401") return {
    method: "blocked", blockSizes: [4, 8], blinding: "Open-label (no blinding)", stratScope: "study",
    stratFactors: [{ key: "sf-site", name: "Site", source: "site", levels: [] }],
    groups: [
      { code: "T01", name: "Phytogenic feed additive", description: "Phytogenic blend", ratio: 1, arm: "T02 Phytogenic", lot: "BATCH-PH-001", color: "#1A6B47" },
      { code: "T02", name: "Control (basal feed)", description: "Basal feed", ratio: 1, arm: "T01 Control", lot: "BATCH-PH-002", color: "#6D7480" },
    ],
  };
  // New / unseeded study — starts EMPTY: no default treatment groups, no fallback list.
  // The investigator defines every arm; only the built-in Site stratification factor exists.
  return {
    method: "blocked", blockSizes: [], blinding: "Open-label (no blinding)", stratScope: "site",
    stratFactors: [{ key: "sf-site", name: "Site", source: "site", levels: [] }],
    groups: [],
  };
}

// ─── Study settings config (ported from 25-settings.html section-study) ──────
// Per-study metadata for the four Study-settings cards. Display-only for the
// portfolio (edits surface autosave toasts, not persisted).
type StudyTypeKey = "livestock" | "companion" | "aquatic" | "custom";
interface StudyMeta {
  title: string; sponsor: string; ind: string; framework: string[]; species: string; indication: string;
  protoStart: string; protoEnroll: string; protoEnd: string; protoTarget: string; protoVersion: string;
  type: StudyTypeKey;
  drugName: string; drugFormulation: string; drugDoseUnit: string; drugDoseCalc: string; drugRoute: string;
}
const SPECIES_OPTS = ["Cattle", "Canine", "Poultry", "Swine", "Equine", "Feline", "Ovine", "Aquatic", "Other"];
function studyMeta(code: string): StudyMeta {
  if (code === "CA-0801") return {
    title: "DermAlliv™ Canine Atopic Dermatitis Study", sponsor: "DermAlliv Therapeutics",
    ind: "NADA-141-YYY · IND-CA-0801-US", framework: ["21 CFR Part 11", "VICH GL42"],
    species: "Canine", indication: "Canine atopic dermatitis — topical immunomodulator",
    protoStart: "2026-01-15", protoEnroll: "2026-04-01", protoEnd: "2026-10-31", protoTarget: "30", protoVersion: "v2.1 — 2026-01-10",
    type: "companion",
    drugName: "DermAlliv™ (blinded)", drugFormulation: "Topical / oral", drugDoseUnit: "ml", drugDoseCalc: "60 ml per visit", drugRoute: "Topical application",
  };
  if (code === "PH-2401") return {
    title: "Phytogenic Feed Additive Broiler Growth Performance Trial", sponsor: "PhytoVet Nutrition",
    ind: "No IND (feed additive)", framework: ["21 CFR Part 11"],
    species: "Poultry", indication: "Broiler growth performance — phytogenic feed additive",
    protoStart: "2026-04-20", protoEnroll: "N/A (fixed pens)", protoEnd: "2026-07-31", protoTarget: "16 pens", protoVersion: "v1.0 — 2026-04-01",
    type: "livestock",
    drugName: "PhytoGrow™ Phytogenic Blend", drugFormulation: "Feed premix", drugDoseUnit: "kg", drugDoseCalc: "500g/tonne inclusion rate", drugRoute: "In-feed",
  };
  // BR-2502
  return {
    title: "Bovine Respiratory Disease Treatment Trial", sponsor: "BioVet Pharma Inc.",
    ind: "NADA-141-XXX · IND-BR-2502-US", framework: ["21 CFR Part 11", "VICH GL9"],
    species: "Cattle", indication: "Bovine respiratory disease (BRD) treatment — antimicrobial efficacy",
    protoStart: "2026-04-01", protoEnroll: "2026-05-15", protoEnd: "2026-08-31", protoTarget: "36", protoVersion: "v1.0 — 2026-03-01",
    type: "livestock",
    drugName: "Tulathromycin", drugFormulation: "Liquid injection", drugDoseUnit: "ml", drugDoseCalc: "weight × arm_dose_factor ÷ 100 mg/mL", drugRoute: "SC injection",
  };
}
// Regulatory approvals seed (IACUC for all three animal studies).
interface Approval { id: string; type: string; committee: string; number: string; approvalDate: string; expiryDate: string; status: string; notes?: string }
const APPROVAL_TYPES = ["IACUC", "FDA/CVM IND", "FDA/CVM NADA", "USDA/CVB", "EMA/CVMP", "IRB", "Other"];
const APPROVAL_STATUSES = ["Active", "Expired", "Pending", "Withdrawn"];
function approvalsSeed(code: string): Approval[] {
  if (code === "CA-0801") return [{ id: "ap1", type: "IACUC", committee: "UC Davis IACUC", number: "IACUC-2026-CA-0801", approvalDate: "2026-02-20", expiryDate: "2027-02-19", status: "Active" }];
  if (code === "PH-2401") return [{ id: "ap1", type: "IACUC", committee: "Purdue University IACUC", number: "IACUC-2026-PH-2401", approvalDate: "2026-04-01", expiryDate: "2027-03-31", status: "Active" }];
  if (code === "BR-2502") return [{ id: "ap1", type: "IACUC", committee: "Colorado State University IACUC", number: "IACUC-2026-BR-2502", approvalDate: "2026-03-15", expiryDate: "2027-03-14", status: "Active" }];
  return []; // new / non-seeded study — no approval records yet
}
// Explicit status → chip colour (Active green, Expired red, Pending amber, Withdrawn slate).
function approvalStatusChip(status: string): string {
  if (status === "Expired") return "set-badge-red";
  if (status === "Pending") return "set-badge-amber";
  if (status === "Withdrawn") return "set-badge-slate";
  return "set-badge-green"; // Active
}

interface HLevel { fixed: boolean; isSubject: boolean; value: string; options: string[]; optional?: boolean; strictOptions?: boolean }
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
function ToggleRow({ on, onToggle, label, desc, disabled = false }: { on: boolean; onToggle: () => void; label: string; desc: string; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)", padding: "var(--space-3) 0" }}>
      <label className="set-toggle" style={{ flexShrink: 0, marginTop: 1, ...(disabled ? { pointerEvents: "none", opacity: 0.6, cursor: "not-allowed" } : null) }}><input type="checkbox" checked={on} disabled={disabled} onChange={onToggle} /><span className="set-toggle-slider"></span></label>
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
// Hard-lock wrapper — disables every control inside via a disabled <fieldset>.
function LockFieldset({ locked, children }: { locked: boolean; children: ReactNode }) {
  return locked ? <fieldset disabled className="settings-locked-fieldset">{children}</fieldset> : <>{children}</>;
}

// Regulatory & Approvals card (IACUC / FDA-CVM / ethics records) + its add/edit
// modal. Shared by the seeded and new-study Study Identity flows so both render the
// same card; seeded per study code (a non-seeded / new study starts empty).
function RegulatoryApprovalsCard({ studyCode, editable, onToast }: { studyCode: string; editable: boolean; onToast: (m: string) => void }) {
  const [approvals, setApprovals] = useState<Approval[]>(() => approvalsSeed(studyCode));
  const [apOpen, setApOpen] = useState(false);
  const [apEdit, setApEdit] = useState<number | null>(null);
  const [apType, setApType] = useState("IACUC"); const [apCommittee, setApCommittee] = useState(""); const [apNumber, setApNumber] = useState(""); const [apApproval, setApApproval] = useState(""); const [apExpiry, setApExpiry] = useState(""); const [apStatus, setApStatus] = useState("Active"); const [apNotes, setApNotes] = useState("");
  function openApproval(idx: number | null) {
    setApEdit(idx);
    if (idx == null) { setApType("IACUC"); setApCommittee(""); setApNumber(""); setApApproval(""); setApExpiry(""); setApStatus("Active"); setApNotes(""); }
    else { const a = approvals[idx]; setApType(a.type); setApCommittee(a.committee); setApNumber(a.number); setApApproval(a.approvalDate); setApExpiry(a.expiryDate); setApStatus(a.status); setApNotes(a.notes ?? ""); }
    setApOpen(true);
  }
  function saveApproval() {
    if (!apCommittee.trim() || !apNumber.trim()) { onToast("Committee name and approval number are required"); return; }
    const a: Approval = { id: apEdit != null ? approvals[apEdit].id : `ap-${crypto.randomUUID()}`, type: apType, committee: apCommittee.trim(), number: apNumber.trim(), approvalDate: apApproval.trim(), expiryDate: apExpiry.trim(), status: apStatus, notes: apNotes.trim() || undefined };
    setApprovals((p) => (apEdit != null ? p.map((x, i) => (i === apEdit ? a : x)) : [...p, a]));
    setApOpen(false); onToast("Regulatory approval saved");
  }
  return (
    <>
      <div className="settings-card">
        <div className="settings-card-header">
          <div><div className="settings-card-title">Regulatory &amp; Approvals</div><div className="settings-card-desc">IACUC protocols, FDA/CVM submissions, and ethics committee approvals for this study.</div></div>
          {editable && <button className="set-btn-secondary" type="button" onClick={() => openApproval(null)}><i className="ti ti-plus"></i> Add approval</button>}
        </div>
        <div className="settings-card-body" style={{ overflowX: "auto" }}>
          {approvals.length === 0 ? <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No approval records.</div> : (
            <table className="fee-table">
              <thead><tr><th>Type</th><th>Committee</th><th>Approval no.</th><th>Approved</th><th>Expires</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {approvals.map((a, i) => (
                  <tr key={a.id}>
                    <td><span className="set-badge set-badge-blue">{a.type}</span></td>
                    <td>{a.committee}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{a.number}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{a.approvalDate || "—"}</td>
                    <td style={{ fontFamily: "var(--font-mono)", color: a.status === "Expired" ? "var(--red-600)" : undefined, fontWeight: a.status === "Expired" ? 600 : undefined }}>{a.expiryDate || "—"}</td>
                    <td><span className={`set-badge ${approvalStatusChip(a.status)}`}>{a.status}</span></td>
                    <td style={{ textAlign: "right" }}>{editable && <button className="set-btn-icon" type="button" title="Edit approval" onClick={() => openApproval(i)}><i className="ti ti-pencil" style={{ fontSize: 13 }}></i></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {apOpen && (
        <div className="set-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setApOpen(false); }}>
          <div className="set-modal" role="dialog" aria-modal="true">
            <div className="set-modal-header">
              <div><div className="set-modal-title">{apEdit == null ? "Add regulatory approval" : "Edit regulatory approval"}</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Ethics / animal-use committee approval record</div></div>
              <button className="set-modal-close" type="button" onClick={() => setApOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="set-modal-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className="set-field"><div className="set-field-label">Type</div><select className="set-select" value={apType} onChange={(e) => setApType(e.target.value)}>{APPROVAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="set-field"><div className="set-field-label">Approval number</div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} value={apNumber} onChange={(e) => setApNumber(e.target.value)} /></div>
              </div>
              <div className="set-field"><div className="set-field-label">Committee / authority</div><input className="set-input" value={apCommittee} onChange={(e) => setApCommittee(e.target.value)} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                <div className="set-field"><div className="set-field-label">Approval date</div><input type="date" className="set-input" value={apApproval} onChange={(e) => setApApproval(e.target.value)} /></div>
                <div className="set-field"><div className="set-field-label">Expiry date <span style={{ color: "var(--color-text-placeholder)", fontWeight: 400 }}>(optional)</span></div><input type="date" className="set-input" value={apExpiry} onChange={(e) => setApExpiry(e.target.value)} /></div>
              </div>
              <div className="set-field"><div className="set-field-label">Status</div><select className="set-select" value={apStatus} onChange={(e) => setApStatus(e.target.value)}>{APPROVAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
              <div className="set-field"><div className="set-field-label">Notes <span style={{ color: "var(--color-text-placeholder)", fontWeight: 400 }}>(optional)</span></div><textarea className="set-input" rows={3} style={{ resize: "vertical" }} value={apNotes} onChange={(e) => setApNotes(e.target.value)} /></div>
            </div>
            <div className="set-modal-footer">
              <button className="set-btn-secondary" type="button" onClick={() => setApOpen(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={saveApproval}><i className="ti ti-check"></i> Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StudySettingsSection({ studyCode, onToast, onNavigate, locked = false, setup = false }: { studyCode: string; onToast: (m: string) => void; onNavigate?: (s: string) => void; locked?: boolean; setup?: boolean }) {
  const meta = studyMeta(studyCode);
  const cfg = getStudyTypeConfig(studyCode);
  // Two-axis study configuration (Study category × Study type × Species × Enrollment).
  // Seeded from config (SEEDED_TWO_AXIS); local-state + toast, matching this section's
  // display-only pattern. DM/Admin editable; CRC/CRA/PI read-only.
  const { activeRole } = useShell();
  // Editable ONLY in setup (Study Identity locks entirely once the study leaves
  // setup) and only for DM/Admin roles.
  const canEditConfig = (activeRole === "DM" || activeRole === "Admin") && setup;
  const twoAxis = SEEDED_TWO_AXIS[studyCode] ?? { speciesCategory: "livestock" as SpeciesCat, studyType: "efficacy" as StudyTypeK, species: "", enrollmentModel: "individual" as EnrollModel };
  const [cfgCat, setCfgCat] = useState<SpeciesCat>(twoAxis.speciesCategory);
  const [cfgType, setCfgType] = useState<StudyTypeK>(twoAxis.studyType);
  const [cfgSpeciesSel, setCfgSpeciesSel] = useState<string>(NS_STANDARD_SPECIES.has(twoAxis.species) ? twoAxis.species : twoAxis.species ? "Other" : "");
  const [cfgCustomSpecies, setCfgCustomSpecies] = useState<string>(twoAxis.species && !NS_STANDARD_SPECIES.has(twoAxis.species) ? twoAxis.species : "");
  const [cfgEnroll, setCfgEnroll] = useState<EnrollModel>(twoAxis.enrollmentModel);
  const [cfgBlinding, setCfgBlinding] = useState<string>(SEEDED_BLINDING[studyCode] ?? "open");
  const cfgEffSpecies = cfgSpeciesSel === "Other" ? cfgCustomSpecies : cfgSpeciesSel;
  const cfgTypeOpts = STUDY_TYPE_OPTS.filter((o) => cfgCat === "livestock" || !o.livestockOnly);
  const cfgSpeciesOpts = NS_SPECIES_OPTS[cfgCat];
  const cfgEnrollOpts = nsEnrollOptions(cfgCat, cfgType);
  const cfgIsPoultry = cfgEffSpecies === "Poultry";
  const cfgSubjLabel = nsSpeciesSubjectLabel(cfgEffSpecies, cfgEnroll);
  const cfgShowTAS = nsShowTAS(cfgType);
  const cfgShowWithdrawal = nsShowWithdrawal(cfgCat, cfgType);
  const cfgShowCrossover = nsShowCrossover(cfgType);
  function changeCfgCat(c: SpeciesCat) { if (!canEditConfig) return; setCfgCat(c); setCfgSpeciesSel(""); setCfgCustomSpecies(""); const t: StudyTypeK = c === "companion" && cfgType === "residue" ? "efficacy" : cfgType; setCfgType(t); setCfgEnroll(nsDefaultEnroll(c, t)); onToast(`Study category: ${c === "companion" ? "Companion animal" : "Livestock"}`); }
  function changeCfgType(t: StudyTypeK) { if (!canEditConfig) return; setCfgType(t); setCfgEnroll(nsDefaultEnroll(cfgCat, t)); onToast("Study type updated"); }
  function changeCfgSpecies(v: string) { if (!canEditConfig) return; setCfgSpeciesSel(v); if (v !== "Other") onToast(v ? `Species: ${v}` : "Species cleared"); }
  function changeCfgEnroll(m: EnrollModel) { if (!canEditConfig) return; setCfgEnroll(m); onToast("Enrollment model updated"); }
  // Card 1 — Study information: committed values + edit drafts (Cancel reverts).
  const infoSeed = SEEDED_INFO[studyCode];
  const seedSponsor = infoSeed?.sponsor ?? meta.sponsor;
  const seedIndication = infoSeed?.indication ?? meta.indication;
  const [editInfo, setEditInfo] = useState(false);
  const [title, setTitle] = useState(meta.title);
  const [sponsor, setSponsor] = useState(seedSponsor);
  const [ind, setInd] = useState(meta.ind);
  const [species, setSpecies] = useState(meta.species);
  const [indication, setIndication] = useState(seedIndication);
  const [dTitle, setDTitle] = useState(meta.title);
  const [dSponsor, setDSponsor] = useState(seedSponsor);
  const [dInd, setDInd] = useState(meta.ind);
  const [dSpecies, setDSpecies] = useState(meta.species);
  const [dIndication, setDIndication] = useState(seedIndication);
  // Protocol number + version are DERIVED read-only from Protocol & Amendments —
  // never editable here. No amendments on record → em-dash.
  const protoSeed = SEEDED_PROTOCOL[studyCode] ?? EMPTY_PROTOCOL;
  const hasPA = seedStudyAmendments(studyCode).length > 0;
  const derivedProtoNumber = hasPA ? (protoSeed.protocolNumber || "—") : "—";
  const derivedProtoVersion = hasPA ? (protoSeed.protocolVersion || "—") : "—";
  function startEdit() { setDTitle(title); setDSponsor(sponsor); setDSpecies(species); setDIndication(indication); setEditInfo(true); }
  function saveInfo() { setTitle(dTitle); setSponsor(dSponsor); setSpecies(dSpecies); setIndication(dIndication); setEditInfo(false); onToast("Study information saved"); }


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
        <h1 className="set-section-title">Study Identity</h1>
        <p className="section-desc">These decisions lock in regulatory requirements, mandatory roles, and audit event types for the entire study.</p>
      </div>
      {locked && <div className="settings-locked-banner"><i className="ti ti-lock"></i> {LOCKED_BANNER_TEXT}</div>}
      <LockFieldset locked={locked}>

      {/* ── Card 1: Study information ──
          In setup, every field renders directly in edit mode (inputs bound to the
          committed values, autosaved on blur) — no Edit/Save button pattern. The
          edit/save flow only applies to active studies where fields are locked and
          a change requires a formal amendment. */}
      <div className="settings-card">
        <div className="card-header">
          <div>
            <div className="card-header-title">Study information</div>
            <div className="card-header-desc">Core identifiers — cannot be changed after activation without a protocol amendment</div>
          </div>
          {!editInfo && !setup && !locked && <button className="set-btn-secondary" type="button" onClick={startEdit}><i className="ti ti-pencil"></i> Edit</button>}
        </div>
        <div className="card-body">
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Study name</div></div>
            <div className="settings-row-value">{editInfo || setup ? <input className="field-input" value={setup ? title : dTitle} onChange={(e) => (setup ? setTitle : setDTitle)(e.target.value)} onBlur={setup ? () => onToast("Study information saved") : undefined} /> : title}</div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Study ID</div></div>
            <div className="settings-row-value"><input className="field-input readonly" value={studyCode} readOnly tabIndex={-1} style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Protocol number</div>
              <div className="settings-row-label-desc">Pulled from Protocol &amp; Amendments</div>
            </div>
            <div className="settings-row-value"><span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: derivedProtoNumber === "—" ? "var(--color-text-placeholder)" : "var(--color-text-secondary)" }}>{derivedProtoNumber}</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Protocol version</div>
              <div className="settings-row-label-desc">Pulled from Protocol &amp; Amendments</div>
            </div>
            <div className="settings-row-value">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: derivedProtoVersion === "—" ? "var(--color-text-placeholder)" : "var(--color-text-secondary)" }}>{derivedProtoVersion}</span>
                {hasPA && <button type="button" onClick={() => onNavigate?.("protocol")} className="set-inline-link" style={{ flexShrink: 0 }}>Go to P&amp;A →</button>}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Sponsor</div></div>
            <div className="settings-row-value">{editInfo || setup ? <input className="field-input" value={setup ? sponsor : dSponsor} onChange={(e) => (setup ? setSponsor : setDSponsor)(e.target.value)} onBlur={setup ? () => onToast("Study information saved") : undefined} /> : sponsor}</div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Indication</div></div>
            <div className="settings-row-value">{editInfo || setup ? <input className="field-input" value={setup ? indication : dIndication} onChange={(e) => (setup ? setIndication : setDIndication)(e.target.value)} onBlur={setup ? () => onToast("Study information saved") : undefined} /> : indication}</div>
          </div>
          {editInfo && !setup && (
            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
              <button className="set-btn-secondary" type="button" onClick={() => setEditInfo(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={saveInfo}><i className="ti ti-check"></i> Save</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Card: Study configuration (shared) ── */}
      <StudyConfigCard category={cfgCat} type={cfgType} speciesSel={cfgSpeciesSel} customSpecies={cfgCustomSpecies} enroll={cfgEnroll} blinding={cfgBlinding} editable={canEditConfig} locked={locked} onCategory={changeCfgCat} onType={changeCfgType} onSpecies={changeCfgSpecies} onCustomSpecies={setCfgCustomSpecies} onCustomSpeciesBlur={() => onToast(cfgCustomSpecies ? `Species: ${cfgCustomSpecies}` : "Species saved")} onEnroll={changeCfgEnroll} onBlinding={(b) => { setCfgBlinding(b); onToast("Blinding design updated"); }} />
      {cfgShowTAS && <TASBannerCard />}
      {cfgShowWithdrawal && <WithdrawalPeriodCard species={cfgEffSpecies} onToast={onToast} />}
      {cfgShowCrossover && <CrossoverNoteCard />}

      {/* ── Card: Subject hierarchy ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Subject hierarchy</div><div className="settings-card-desc">Driven by the enrollment model — you can rename each level</div></div></div>
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
                    : <select className="set-select" style={{ minWidth: 160 }} value={level.value} disabled={!canEditConfig} onChange={(e) => setLevelName(i, e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
                  {level.isSubject && <span className="set-badge set-badge-green">Subject level</span>}
                  {level.optional && <span style={{ fontSize: 10, color: "var(--color-text-placeholder)", fontStyle: "italic" }}>optional</span>}
                  {/* The subject level is a fixed structural element — only its label can
                      be renamed, never deleted. Intermediate levels keep their delete button. */}
                  {!level.fixed && !level.isSubject && canEditConfig && <button className="set-btn-icon" style={{ marginLeft: "auto" }} type="button" title="Remove level" onClick={() => removeLevel(i)}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>}
                </div>
              );
            })}
            {allowAdditions && !locked
              ? canEditConfig && <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)", marginTop: "var(--space-3)" }} type="button" onClick={addLevel}><i className="ti ti-plus"></i> Add level</button>
              : <div className="set-note" style={{ marginTop: "var(--space-3)" }}><i className="ti ti-lock" style={{ fontSize: 12, marginRight: 4 }}></i> Structure is locked. Hierarchy levels cannot be modified once the study is active.</div>}
            <div className="set-note" style={{ marginTop: "var(--space-3)" }}><i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 4 }}></i> The subject level is fixed and determines what appears on subject records. Only the label can be renamed.</div>
          </div>
        </div>
      </div>

      {/* ── Section: Study timeline ── */}
      <StudyTimelineSection seed={protoSeed} editable={canEditConfig} onToast={onToast} targetLabel={locked && cfgEnroll === "cohort_pen" ? "Target groups / pens" : locked && cfgEnroll === "dynamic_herd" ? "Target lots" : "Target enrollment"} />

      {/* ── Section: Drug & Investigational Product ── */}
      <DrugIPSection studyCode={studyCode} seed={SEEDED_IPS[studyCode] ?? []} editable={canEditConfig} blinding={cfgBlinding} locked={locked} onToast={onToast} />

      </LockFieldset>

      {/* ── Card: Regulatory approvals (editable exception — stays active on a locked study) ── */}
      <RegulatoryApprovalsCard studyCode={studyCode} editable={canEditConfig} onToast={onToast} />

      {/* ── Card: Consent & Production (editable exception — stays active on a locked study) ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Consent &amp; Production</div></div></div>
        <div className="settings-card-body">
          <ToggleRow on={true} onToggle={() => onToast("Setting saved")} disabled={locked} label={cfgCat === "companion" ? "Owner informed consent required" : "Farm manager / producer consent required"} desc="A signed consent record is required before a subject can be enrolled." />
          {cfgCat === "livestock" && (
            <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
              <div><div className="settings-row-label">Production phase tracking <i className="ti ti-info-circle" style={{ fontSize: 12, color: "var(--color-text-placeholder)" }} title="Multi-phase production tracking (e.g. Nursery → Finisher transitions) will be available in a future release."></i></div><div className="settings-row-desc">Multi-phase production tracking (e.g. Nursery → Finisher)</div></div>
              <div className="settings-row-value" style={{ color: "var(--color-text-placeholder)", fontStyle: "italic" }}>Not configured — coming soon</div>
            </div>
          )}
        </div>
      </div>

    </>
  );
}

// ─── New-study setup flow (two-axis: Species category × Study type) ───────────
// Empty, progressive setup for a study created from the studies list (no seed).
// Both axes (speciesCategory + studyType) are persisted on the study record and
// drive the enrollment-model default, the subject hierarchy, and the conditional
// configuration sections below. Seeded studies keep the classic StudySettingsSection.
type SpeciesCat = "companion" | "livestock";
type StudyTypeK = "tas" | "efficacy" | "residue" | "bioequivalence" | "observational";
type EnrollModel = "individual" | "cohort_pen" | "dam_litter" | "dynamic_herd";
const NS_BARN_OPTS = ["Barn", "Shed", "Paddock", "Feedlot", "Pasture", "Building"];
const NS_PEN_OPTS = ["Pen", "Stall", "Lot", "Group", "Run", "Cage"];
const NS_SUBJECT_INDIVIDUAL = ["Animal", "Bovine", "Pig", "Sheep", "Goat", "Individual"];
const NS_SUBJECT_COMPANION = ["Dog", "Cat", "Horse", "Rabbit", "Other"];
const STUDY_TYPE_OPTS: { key: StudyTypeK; label: string; desc: string; livestockOnly?: boolean }[] = [
  { key: "tas", label: "Target Animal Safety (TAS)", desc: "Toxicological limits and drug tolerance. High-frequency rigid temporal data capture." },
  { key: "efficacy", label: "Efficacy / Field Trial", desc: "Real-world condition efficacy. Complex randomization, blinding, and multi-role access." },
  { key: "residue", label: "Tissue Residue / Depletion", desc: "Withdrawal period determination. Livestock only. Exact time-of-collection tracking.", livestockOnly: true },
  { key: "bioequivalence", label: "Bioequivalence", desc: "Generic vs pioneer drug comparison. Crossover design with washout phase configuration." },
  { key: "observational", label: "Observational / Post-marketing", desc: "Post-marketing surveillance and real-world performance tracking." },
];
const ENROLL_LABELS: Record<EnrollModel, string> = { individual: "Individual", cohort_pen: "Cohort / Pen", dam_litter: "Dam / Litter", dynamic_herd: "Dynamic Herd / Flock" };
const BLINDING_OPTS: { key: string; label: string }[] = [{ key: "open", label: "Open-label" }, { key: "single", label: "Single-blind" }, { key: "double", label: "Double-blind" }];
const SEEDED_BLINDING: Record<string, string> = { "BR-2502": "open", "CA-0801": "double", "PH-2401": "open" };
const ENROLL_DESC: Record<EnrollModel, string> = {
  individual: "Each animal is enrolled and tracked as an independent subject.",
  cohort_pen: "Animals are managed and dosed as a pen or cohort — the pen is the subject.",
  dam_litter: "Hierarchical reproductive model. Dam → Litter → Offspring. Used for reproductive toxicity and production studies.",
  dynamic_herd: "An open population (herd / flock) tracked as a lot; mortality is logged against the lot.",
};
function nsEnrollOptions(species: SpeciesCat, t: StudyTypeK): EnrollModel[] {
  // Companion studies are individual by default but support Dam / Litter breeding
  // designs (kennel whelping, feline reproductive toxicity).
  if (species === "companion") return ["individual", "dam_litter"];
  if (t === "residue") return ["individual", "cohort_pen", "dam_litter"];
  // Bioequivalence defaults to Individual but allows all models (pen-level crossover
  // trials exist in livestock BE); tas / efficacy / observational likewise.
  return ["individual", "cohort_pen", "dam_litter", "dynamic_herd"];
}
const nsDefaultEnroll = (species: SpeciesCat, t: StudyTypeK): EnrollModel => nsEnrollOptions(species, t)[0];
function nsHierarchy(species: SpeciesCat, m: EnrollModel): HLevel[] {
  const site: HLevel = { fixed: true, isSubject: false, value: "Site", options: ["Site"] };
  // Dam / Litter reproductive scaffold (both species): Site → Barn (optional) → Dam (subject).
  if (m === "dam_litter") return [site, { fixed: false, isSubject: false, value: "Barn", options: NS_BARN_OPTS, optional: true }, { fixed: false, isSubject: true, value: "Dam", options: ["Dam", "Sow", "Doe", "Ewe"], strictOptions: true }];
  if (species === "companion") return [site, { fixed: false, isSubject: true, value: "Animal", options: NS_SUBJECT_COMPANION }];
  if (m === "cohort_pen") return [site, { fixed: false, isSubject: false, value: "Barn", options: NS_BARN_OPTS, optional: true }, { fixed: false, isSubject: true, value: "Pen", options: ["Pen", "Room", "Tank", "Kennel"] }];
  if (m === "dynamic_herd") return [site, { fixed: false, isSubject: true, value: "Lot", options: ["Lot", "Flock", "Batch"] }];
  return [site, { fixed: false, isSubject: false, value: "Barn", options: NS_BARN_OPTS, optional: true }, { fixed: false, isSubject: false, value: "Pen", options: NS_PEN_OPTS, optional: true }, { fixed: false, isSubject: true, value: "Animal", options: NS_SUBJECT_INDIVIDUAL }];
}
// Species dropdown driven by the study category. "Other" reveals a free-text field.
const NS_SPECIES_OPTS: Record<SpeciesCat, string[]> = {
  companion: ["Dog", "Cat", "Horse", "Rabbit", "Other"],
  livestock: ["Cattle", "Swine", "Poultry", "Sheep", "Goat", "Other"],
};
const NS_STANDARD_SPECIES = new Set([...NS_SPECIES_OPTS.companion, ...NS_SPECIES_OPTS.livestock]);
// Subject-level label a chosen species implies (null = leave the model's default).
// The label depends on the enrollment model: Poultry is a "Bird" individually but a
// "Flock" under dynamic-herd enrollment; cohort/pen (Pen) and dam/litter (Dam) keep
// their structural subject label regardless of species.
function nsSpeciesSubjectLabel(species: string, model: EnrollModel | null): string | null {
  if (!species || species === "Other") return null;
  if (model === "dynamic_herd") return species === "Poultry" ? "Flock" : null;
  if (model === "cohort_pen" || model === "dam_litter") return null;
  const map: Record<string, string> = { Cattle: "Animal", Swine: "Pig", Poultry: "Bird" };
  return map[species] ?? species; // Dog/Cat/Horse/Rabbit/Sheep/Goat and custom names → themselves
}

// ─── Shared two-axis rules + conditional-config cards ────────────────────────
// One source of truth for the conditional sections so the new-study flow
// (NewStudySetup) and the seeded StudySettingsSection stay in lockstep.
const nsShowWithdrawal = (sc: SpeciesCat | null, st: StudyTypeK | null) => sc === "livestock" && (st === "efficacy" || st === "residue");
const nsShowCrossover = (st: StudyTypeK | null) => st === "bioequivalence";
const nsShowTAS = (st: StudyTypeK | null) => st === "tas";
const nsConsentLabel = (sc: SpeciesCat | null) => (sc === "companion" ? "Owner informed consent" : "Producer / farm manager consent");
// Seeded two-axis config for the three portfolio studies (from study config, not a
// schema change) — pre-populates the Study configuration section in StudySettingsSection.
const SEEDED_TWO_AXIS: Record<string, { speciesCategory: SpeciesCat; studyType: StudyTypeK; species: string; enrollmentModel: EnrollModel }> = {
  "BR-2502": { speciesCategory: "livestock", studyType: "efficacy", species: "Cattle", enrollmentModel: "individual" },
  "CA-0801": { speciesCategory: "companion", studyType: "efficacy", species: "Dog", enrollmentModel: "individual" },
  "PH-2401": { speciesCategory: "livestock", studyType: "efficacy", species: "Poultry", enrollmentModel: "cohort_pen" },
};

function TASBannerCard() {
  return <div className="settings-card"><div className="settings-card-body"><div className="set-info-banner"><i className="ti ti-clock-hour-4" style={{ fontSize: 16, color: "var(--slate-600)", flexShrink: 0, marginTop: 1 }}></i><div><div style={{ fontWeight: 500, marginBottom: 2 }}>High-frequency data capture</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>TAS studies may require high-frequency vitals collection (e.g. every 30 minutes post-dose). Configure visit frequency in the Schedule of Events.</div></div></div></div></div>;
}

function WithdrawalPeriodCard({ species, onToast }: { species: string; onToast: (m: string) => void }) {
  return (
    <div className="settings-card">
      <div className="settings-card-header"><div><div className="settings-card-title">Withdrawal period</div><div className="settings-card-desc">Days from last dose before the animal is eligible for shipment — set per treatment arm in Randomization</div></div></div>
      <div className="settings-card-body">
        {(species === "Cattle" || species === "Swine") && (
          <div className="set-info-banner" style={{ marginBottom: "var(--space-3)" }}>
            <i className="ti ti-alert-triangle" style={{ fontSize: 16, color: "var(--amber-600)", flexShrink: 0, marginTop: 1 }}></i>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Withdrawal periods are typically required for {species} studies involving antimicrobials or growth promotants.</div>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="set-field"><div className="set-field-label">Default withdrawal period (days)</div><input className="set-input" type="number" placeholder="e.g. 49" onBlur={() => onToast("Withdrawal period saved")} /></div>
          <div className="set-field"><div className="set-field-label">Measured from</div><select className="set-select"><option>Last dose administered</option><option>Last treatment visit</option></select></div>
        </div>
        <div style={{ marginTop: "var(--space-3)" }}><ToggleRow on={true} onToggle={() => onToast("Setting saved")} label="Block shipment until withdrawal elapsed" desc="An animal cannot be marked eligible for slaughter/shipment until its withdrawal period has elapsed (food-safety hard block)." /></div>
      </div>
    </div>
  );
}

// Brief crossover note for the Study Identity page — full crossover/washout design
// lives in Protocol Builder.
function CrossoverNoteCard() {
  return (
    <div className="settings-card"><div className="settings-card-body">
      <div className="set-info-banner">
        <i className="ti ti-arrows-exchange" style={{ fontSize: 16, color: "var(--slate-600)", flexShrink: 0, marginTop: 1 }}></i>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Bioequivalence studies require crossover configuration. Set up in Protocol Builder.</div>
      </div>
    </div></div>
  );
}

function CrossoverWashoutCard({ onToast }: { onToast: (m: string) => void }) {
  const [bePeriods, setBePeriods] = useState(2);
  const [beGroups, setBeGroups] = useState<string[]>(["T01", "T02"]);
  const [beMatrix, setBeMatrix] = useState<number[][]>([]);
  const nGroups = beGroups.length;
  const drugLabel = (i: number) => `Drug ${String.fromCharCode(65 + i)}`;
  useEffect(() => {
    // Rebuild the default Latin square whenever the period count or group COUNT changes.
    setBeMatrix(Array.from({ length: bePeriods }, (_, p) => Array.from({ length: nGroups }, (_, g) => (nGroups ? (p + g) % nGroups : 0))));
  }, [bePeriods, nGroups]);
  const renameBeGroup = (i: number, v: string) => setBeGroups((g) => g.map((x, j) => (j === i ? v : x)));
  const addBeGroup = () => setBeGroups((g) => [...g, `T${String(g.length + 1).padStart(2, "0")}`]);
  const removeBeGroup = (i: number) => setBeGroups((g) => (g.length <= 1 ? g : g.filter((_, j) => j !== i)));
  const setBeCell = (p: number, g: number, v: number) => setBeMatrix((m) => m.map((row, pi) => (pi === p ? row.map((c, gi) => (gi === g ? v : c)) : row)));
  return (
    <div className="settings-card">
      <div className="settings-card-header"><div><div className="settings-card-title">Crossover &amp; washout</div><div className="settings-card-desc">Each subject receives multiple treatments across periods <span className="set-badge set-badge-slate">Coming soon</span></div></div></div>
      <div className="settings-card-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          <div className="set-field"><div className="set-field-label">Number of periods</div><input className="set-input" type="number" min={1} max={8} value={bePeriods} onChange={(e) => setBePeriods(Math.max(1, Math.min(8, Math.floor(Number(e.target.value) || 1))))} /></div>
          <div className="set-field"><div className="set-field-label">Washout duration (days)</div><input className="set-input" type="number" placeholder="e.g. 14" onBlur={() => onToast("Washout saved")} /></div>
        </div>
        <div style={{ marginTop: "var(--space-3)" }}><ToggleRow on={true} onToggle={() => onToast("Setting saved")} label="Data entry locked during washout" desc="Clinical data entry is disabled during the washout phase between treatment periods." /></div>
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
            <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)" }}>Period sequence <span style={{ fontWeight: 400, textTransform: "none", color: "var(--color-text-placeholder)" }}>· rows = periods · columns = treatment groups</span></div>
            <button className="set-btn-secondary" style={{ height: 26, fontSize: "var(--text-xs)" }} type="button" onClick={addBeGroup}><i className="ti ti-plus"></i> Add group</button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="rand-group-table">
              <thead>
                <tr>
                  <th>Period</th>
                  {beGroups.map((g, i) => (
                    <th key={i}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input className="set-input" style={{ height: 28, width: 72, fontFamily: "var(--font-mono)" }} value={g} onChange={(e) => renameBeGroup(i, e.target.value)} />
                        {beGroups.length > 1 && <button className="set-btn-icon" style={{ width: 20, height: 20 }} type="button" title="Remove group" onClick={() => removeBeGroup(i)}><i className="ti ti-x" style={{ fontSize: 12 }}></i></button>}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {beMatrix.map((rowCells, p) => (
                  <tr key={p}>
                    <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>Period {p + 1}</td>
                    {rowCells.map((cell, g) => (
                      <td key={g}><select className="set-select" style={{ height: 30, minWidth: 92 }} value={cell} onChange={(e) => setBeCell(p, g, Number(e.target.value))}>{beGroups.map((_, di) => <option key={di} value={di}>{drugLabel(di)}</option>)}</select></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-2)" }}><i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 4 }}></i> Resets to a Latin square when periods or groups change; override any cell manually.</div>
        </div>
      </div>
    </div>
  );
}

// ─── Protocol & Timeline + Drug & IP — shared sections (both flows) ──────────
// Settings-local (local state + toast), matching the display-only settings pattern
// — no session-store shape change, so no DATA_KEY bump. Seed values come from config.
interface ProtocolTimeline { protocolNumber: string; protocolVersion: string; protocolDate: string; studyStart: string; estimatedEnd: string; enrollmentOpen: string; enrollmentClose: string; targetN: string }
const EMPTY_PROTOCOL: ProtocolTimeline = { protocolNumber: "", protocolVersion: "", protocolDate: "", studyStart: "", estimatedEnd: "", enrollmentOpen: "", enrollmentClose: "", targetN: "" };
const SEEDED_PROTOCOL: Record<string, ProtocolTimeline> = {
  "BR-2502": { protocolNumber: "BR-2502-PROT-001", protocolVersion: "v2.1", protocolDate: "2025-11-14", studyStart: "2026-07-08", estimatedEnd: "2026-12-31", enrollmentOpen: "2026-06-15", enrollmentClose: "2026-07-15", targetN: "12" },
  "CA-0801": { protocolNumber: "CA-0801-PROT-001", protocolVersion: "v1.3", protocolDate: "2025-09-02", studyStart: "2026-06-01", estimatedEnd: "2026-11-30", enrollmentOpen: "2026-05-15", enrollmentClose: "2026-06-30", targetN: "8" },
  "PH-2401": { protocolNumber: "PH-2401-PROT-001", protocolVersion: "v1.0", protocolDate: "2026-01-10", studyStart: "2026-07-01", estimatedEnd: "2026-10-31", enrollmentOpen: "2026-06-20", enrollmentClose: "2026-07-10", targetN: "4" },
};
// Study information seed overrides (sponsor = manufacturer, cleaned-up indication).
const SEEDED_INFO: Record<string, { sponsor: string; indication: string }> = {
  "BR-2502": { sponsor: "Elanco Animal Health", indication: "Bovine Respiratory Disease (BRD)" },
  "CA-0801": { sponsor: "VetDerm Therapeutics", indication: "Canine Atopic Dermatitis" },
  "PH-2401": { sponsor: "PhytoNutra Animal Health", indication: "Broiler Growth Performance" },
};

function StudyTimelineSection({ seed, editable, onToast, targetLabel = "Target enrollment", onPersist }: { seed: ProtocolTimeline; editable: boolean; onToast: (m: string) => void; targetLabel?: string; onPersist?: (p: Partial<StudyRow>) => void }) {
  const [sstart, setSstart] = useState(seed.studyStart);
  const [send, setSend] = useState(seed.estimatedEnd);
  const [eopen, setEopen] = useState(seed.enrollmentOpen);
  const [eclose, setEclose] = useState(seed.enrollmentClose);
  const [target, setTarget] = useState(seed.targetN);
  const ro = !editable;
  return (
    <div className="settings-card">
      <div className="settings-card-header"><div><div className="settings-card-title">Study timeline</div></div></div>
      <div className="settings-card-body">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
          <div className="set-field"><div className="set-field-label">Study start</div><input type="date" className="set-input" value={sstart} disabled={ro} onChange={(e) => setSstart(e.target.value)} onBlur={() => { onPersist?.({ study_start: sstart }); onToast("Study start saved"); }} /></div>
          <div className="set-field"><div className="set-field-label">Study end (planned)</div><input type="date" className="set-input" value={send} disabled={ro} onChange={(e) => setSend(e.target.value)} onBlur={() => onToast("Study end saved")} /></div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-4)" }}>
          <div className="set-field"><div className="set-field-label">Enrollment start</div><input type="date" className="set-input" value={eopen} disabled={ro} onChange={(e) => setEopen(e.target.value)} onBlur={() => onToast("Enrollment start saved")} /></div>
          <div className="set-field"><div className="set-field-label">Enrollment close</div><input type="date" className="set-input" value={eclose} disabled={ro} onChange={(e) => setEclose(e.target.value)} onBlur={() => onToast("Enrollment close saved")} /></div>
          <div className="set-field"><div className="set-field-label">{targetLabel}</div><input type="number" className="set-input" value={target} disabled={ro} onChange={(e) => setTarget(e.target.value)} onBlur={() => { onPersist?.({ enrollment_target: Number(target) || null }); onToast(`${targetLabel} saved`); }} /></div>
        </div>
      </div>
    </div>
  );
}

// IP data model + per-arm seeds + shared store live in @/lib/ip-registry-store.
const IP_ROUTES = ["Oral", "Injectable (SC)", "Injectable (IM)", "Injectable (IV)", "Topical", "Transdermal", "Intranasal", "Intramammary", "In-feed", "Other"];
const IP_TYPES: { key: IPType; label: string; badge: string; help: string }[] = [
  { key: "drug", label: "Drug", badge: "set-badge-blue", help: "Small-molecule pharmaceutical product." },
  { key: "biologic", label: "Biologic", badge: "set-badge-green", help: "Vaccine, antibody, or other biologically-derived product." },
  { key: "device", label: "Device", badge: "set-badge-slate", help: "Medical device or delivery apparatus." },
  { key: "supplement", label: "Dietary supplement", badge: "set-badge-amber", help: "Feed additive or nutritional supplement." },
  { key: "placebo", label: "Placebo", badge: "set-badge-slate", help: "Placebo or vehicle control — no active ingredient." },
];
const IP_CONTROLLED_HELP = "DEA Schedule registration required at the site level.";
// IND/NADA label + placeholder (regulatory number for the product).
const ipNadaLabel = () => "IND / NADA number";
const ipNadaPlaceholder = () => "e.g. IND 012-788 or NADA 141-244";
function DrugIPSection({ studyCode, seed, editable, blinding, locked = false, onToast }: { studyCode: string; seed: IPProduct[]; editable: boolean; blinding: string; locked?: boolean; onToast: (m: string) => void }) {
  const ips = useIps(studyCode, seed);
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  // The Product type seg-control is <div>-based, so a parent disabled <fieldset>
  // won't block it — fold the section lock into `ro` and guard onClick.
  const ro = !editable || locked;
  const isOpenLabel = blinding === "open";
  const upd = (i: number, patch: Partial<IPProduct>) => updateIp(studyCode, i, patch);
  const add = () => { addIp(studyCode); onToast("Investigational product added"); };
  const del = (i: number) => { removeIp(studyCode, i); onToast("Investigational product removed"); };
  const toggle = (i: number) => setCollapsed((c) => ({ ...c, [i]: !c[i] }));
  return (
    <div className="settings-card" id="ip-registry">
      <div className="settings-card-header"><div><div className="settings-card-title">Drug &amp; Investigational Product</div><div className="settings-card-desc">Define the investigational products used in this study.</div></div>{editable && <button className="set-btn-secondary" type="button" onClick={add}><i className="ti ti-plus"></i> Add investigational product</button>}</div>
      <div className="settings-card-body">
        {ips.map((ip, i) => {
          const tm = IP_TYPES.find((x) => x.key === ip.type) ?? IP_TYPES[0];
          const isOpen = !collapsed[i];
          return (
            <div key={i} style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", marginBottom: i < ips.length - 1 ? "var(--space-3)" : 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", padding: "var(--space-3)", cursor: "pointer", background: "var(--slate-50)" }} onClick={() => toggle(i)}>
                <i className={`ti ti-chevron-${isOpen ? "down" : "right"}`} style={{ fontSize: 15, color: "var(--color-text-tertiary)" }}></i>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{ip.name || "New investigational product"}</span>
                <span className={`set-badge ${tm.badge}`} style={{ marginLeft: 4 }}>{tm.label}</span>
                {editable && i > 0 && <button className="set-btn-icon" style={{ marginLeft: "auto" }} type="button" title="Remove product" onClick={(e) => { e.stopPropagation(); del(i); }}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>}
              </div>
              {isOpen && (
                <div style={{ padding: "var(--space-4)", borderTop: "1px solid var(--color-border-subtle)" }}>
                  {/* Product type — single-select segmented control (seg-control pattern) */}
                  <div className="set-field">
                    <div className="set-field-label">Product type</div>
                    <div className="seg-control" style={{ width: "fit-content" }}>
                      {IP_TYPES.map((t) => <div key={t.key} className={`seg-option${ip.type === t.key ? " active" : ""}${ro ? " disabled" : ""}`} onClick={() => { if (!ro) { upd(i, { type: t.key }); onToast("Product type updated"); } }}>{t.label}</div>)}
                    </div>
                    <div className="settings-row-desc" style={{ marginTop: "var(--space-2)" }}>{tm.help}</div>
                  </div>
                  {/* Controlled substance */}
                  <div className="set-field" style={{ marginTop: "var(--space-4)" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: ro ? "default" : "pointer" }}>
                      <input type="checkbox" checked={ip.controlledSubstance} disabled={ro} onChange={(e) => { upd(i, { controlledSubstance: e.target.checked }); onToast(e.target.checked ? "Marked controlled substance" : "Controlled substance cleared"); }} />
                      Controlled substance (DEA Schedule II–V)
                    </label>
                    {ip.controlledSubstance && (
                      <div style={{ marginTop: "var(--space-2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>DEA Schedule</span>
                          <select className="set-select" style={{ maxWidth: 160 }} value={ip.deaSchedule} disabled={ro} onChange={(e) => { upd(i, { deaSchedule: e.target.value }); onToast("DEA Schedule updated"); }}>
                            <option value="II">Schedule II</option><option value="III">Schedule III</option><option value="IV">Schedule IV</option><option value="V">Schedule V</option>
                          </select>
                        </div>
                        <div className="settings-row-desc" style={{ marginTop: 4 }}>{IP_CONTROLLED_HELP}</div>
                      </div>
                    )}
                  </div>
                  {/* Remaining fields */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
                    <div className="set-field"><div className="set-field-label">Product name</div><input className="set-input" value={ip.name} disabled={ro} onChange={(e) => upd(i, { name: e.target.value })} onBlur={() => onToast("Product name saved")} /></div>
                    <div className="set-field"><div className="set-field-label">{ipNadaLabel()}</div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} placeholder={ipNadaPlaceholder()} value={ip.indNada} disabled={ro} onChange={(e) => upd(i, { indNada: e.target.value })} onBlur={() => onToast(`${ipNadaLabel()} saved`)} /></div>
                    <div className="set-field"><div className="set-field-label">Drug class / formulation</div><input className="set-input" placeholder="e.g. Antimicrobial · Injectable solution" value={ip.drugClass} disabled={ro} onChange={(e) => upd(i, { drugClass: e.target.value })} onBlur={() => onToast("Drug class saved")} /></div>
                    <div className="set-field"><div className="set-field-label">Route of administration</div><select className="set-select" value={ip.route} disabled={ro} onChange={(e) => { upd(i, { route: e.target.value }); onToast("Route saved"); }}>{IP_ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                    <div className="set-field"><div className="set-field-label">Dose unit</div><input className="set-input" placeholder="e.g. mg/kg · mL · mg/head" value={ip.doseUnit} disabled={ro} onChange={(e) => upd(i, { doseUnit: e.target.value })} onBlur={() => onToast("Dose unit saved")} /></div>
                    <div className="set-field"><div className="set-field-label">Sponsor / manufacturer</div><input className="set-input" value={ip.sponsor} disabled={ro} onChange={(e) => upd(i, { sponsor: e.target.value })} onBlur={() => onToast("Sponsor saved")} /></div>
                    {/* Treatment code + Blinded label — drive the treatment-group row in
                        Protocol Builder (Randomization) reactively (1 IP card ↔ 1 group). */}
                    <div className="set-field"><div className="set-field-label">Treatment code</div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} placeholder="e.g. T01, T02, ARM-A" value={ip.code} disabled={ro} onChange={(e) => upd(i, { code: e.target.value })} onBlur={() => onToast("Treatment code saved")} /><div className="settings-row-desc" style={{ marginTop: 4 }}>Appears in the treatment group row, Animals list, Audit Trail and Reports.</div></div>
                    <div className="set-field"><div className="set-field-label">Blinded label <span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}>(optional)</span></div><input className="set-input" placeholder="e.g. Group 1, Group A" value={ip.blindedLabel} disabled={ro || isOpenLabel} onChange={(e) => upd(i, { blindedLabel: e.target.value })} onBlur={() => onToast("Blinded label saved")} /><div className="settings-row-desc" style={{ marginTop: 4 }}>{isOpenLabel ? "Not required — study is open-label" : "Shown instead of the treatment name when blinding is active"}</div></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shared Study configuration card (category × type × species × enrollment) ──
// Used by both the seeded StudySettingsSection and the new-study flow. Rows reveal
// progressively: study type appears once a category is chosen, species + enrollment
// once a type is chosen — so existing studies (all set) show everything, new studies
// disclose step by step.
function StudyConfigCard({ category, type, speciesSel, customSpecies, enroll, blinding, editable, locked = false, onCategory, onType, onSpecies, onCustomSpecies, onCustomSpeciesBlur, onEnroll, onBlinding }: {
  category: SpeciesCat | null; type: StudyTypeK | null; speciesSel: string; customSpecies: string; enroll: EnrollModel | null; blinding: string; editable: boolean; locked?: boolean;
  onCategory: (c: SpeciesCat) => void; onType: (t: StudyTypeK) => void; onSpecies: (v: string) => void; onCustomSpecies: (v: string) => void; onCustomSpeciesBlur?: () => void; onEnroll: (m: EnrollModel) => void; onBlinding: (b: string) => void;
}) {
  // Effective read-only = role can't edit OR the section is status-locked. The
  // seg-controls are <div>s (not form controls), so a parent disabled <fieldset>
  // won't catch them — guard onClick + apply the .disabled class explicitly.
  const ro = !editable || locked;
  const typeOpts = STUDY_TYPE_OPTS.filter((o) => category === "livestock" || !o.livestockOnly);
  const speciesOpts = category ? NS_SPECIES_OPTS[category] : [];
  const enrollOpts = category && type ? nsEnrollOptions(category, type) : [];
  const segCls = (active: boolean) => `seg-option${active ? " active" : ""}${ro ? " disabled" : ""}`;
  return (
    <div className="settings-card" id="study-configuration">
      <div className="card-header">
        <div>
          <div className="card-header-title">Study configuration</div>
          <div className="card-header-desc">Determines available study types, enrollment models, and conditional sections{!editable ? " — read-only for your role" : ""}</div>
        </div>
      </div>
      <div className="card-body">
        <div className="settings-row" style={!category ? { borderBottom: "none", paddingBottom: 0 } : undefined}>
          <div className="settings-row-label"><div className="settings-row-label-text">Study category</div></div>
          <div className="settings-row-value">
            <div className="seg-control">
              <div className={segCls(category === "companion")} onClick={() => { if (!ro) onCategory("companion"); }}>Companion animal</div>
              <div className={segCls(category === "livestock")} onClick={() => { if (!ro) onCategory("livestock"); }}>Livestock</div>
            </div>
          </div>
        </div>
        {category && (
          <div className="settings-row" style={!type ? { borderBottom: "none", paddingBottom: 0 } : undefined}>
            <div className="settings-row-label"><div className="settings-row-label-text">Study type</div></div>
            <div className="settings-row-value"><select className="field-select" value={type ?? ""} disabled={ro} onChange={(e) => onType(e.target.value as StudyTypeK)}><option value="" disabled>Select study type…</option>{typeOpts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></div>
          </div>
        )}
        {category && type && (
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Species</div></div>
            <div className="settings-row-value">
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
                <select className="field-select" style={{ maxWidth: 200 }} value={speciesSel} disabled={ro} onChange={(e) => onSpecies(e.target.value)}><option value="">Select species…</option>{speciesOpts.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                {speciesSel === "Other" && <input className="field-input" style={{ maxWidth: 200 }} placeholder="Custom species name" value={customSpecies} disabled={ro} onChange={(e) => onCustomSpecies(e.target.value)} onBlur={onCustomSpeciesBlur} />}
              </div>
            </div>
          </div>
        )}
        {category && type && enrollOpts.length > 0 && (
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Enrollment model</div></div>
            <div className="settings-row-value">
              <div className="seg-control">
                {enrollOpts.map((m) => <div key={m} className={segCls(enroll === m)} onClick={() => { if (!ro) onEnroll(m); }}>{ENROLL_LABELS[m]}</div>)}
              </div>
            </div>
          </div>
        )}
        {category && type && (
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div className="settings-row-label"><div className="settings-row-label-text">Blinding design</div></div>
            <div className="settings-row-value">
              <div className="seg-control">
                {BLINDING_OPTS.map((b) => <div key={b.key} className={segCls(blinding === b.key)} onClick={() => { if (!ro) onBlinding(b.key); }}>{b.label}</div>)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewStudySetup({ study, onToast, onNavigate }: { study: { id: string; code: string; name: string }; onToast: (m: string) => void; onNavigate?: (s: string) => void }) {
  const { dataset, update } = useStudySession();
  const row = dataset.studies.find((s) => s.id === study.id);
  const speciesCategory = (row?.speciesCategory ?? null) as SpeciesCat | null;
  const studyType = (row?.studyType ?? null) as StudyTypeK | null;
  const enrollmentModel = (row?.enrollmentModel ?? null) as EnrollModel | null;
  const name = row?.name ?? study.name ?? "";
  const patch = (p: Partial<StudyRow>) => update((d) => { const s = d.studies.find((x) => x.id === study.id); if (s) Object.assign(s, p); });

  const [hierarchy, setHierarchy] = useState<HLevel[]>(() => (speciesCategory && enrollmentModel ? nsHierarchy(speciesCategory, enrollmentModel) : []));
  // Species: category-driven dropdown + free-text for "Other". Persisted species is the
  // effective name (the custom text when "Other" is chosen, else the selected option).
  const initSpecies = row?.species ?? "";
  const [speciesSel, setSpeciesSel] = useState<string>(() => (initSpecies ? (NS_STANDARD_SPECIES.has(initSpecies) ? initSpecies : "Other") : ""));
  const [customSpecies, setCustomSpecies] = useState<string>(() => (initSpecies && !NS_STANDARD_SPECIES.has(initSpecies) ? initSpecies : ""));
  const effectiveSpecies = speciesSel === "Other" ? customSpecies : speciesSel;
  const speciesOpts = speciesCategory ? NS_SPECIES_OPTS[speciesCategory] : [];
  const isPoultry = effectiveSpecies === "Poultry";
  // Apply the species-implied subject label to the subject level (adding it to the level's
  // options if absent so the <select> shows it). No-op when the species implies no change.
  const applyLabel = (h: HLevel[], model: EnrollModel | null, eff: string): HLevel[] => {
    const label = nsSpeciesSubjectLabel(eff, model);
    return label ? h.map((l) => (l.isSubject ? { ...l, value: label, options: l.options.includes(label) ? l.options : [label, ...l.options] } : l)) : h;
  };
  const [sponsor, setSponsor] = useState(row?.sponsor ?? "");
  // Protocol number + version are DERIVED read-only from Protocol & Amendments —
  // a brand-new study has none yet, so both show an em-dash until an amendment exists.
  const hasPA = seedStudyAmendments(study.code).length > 0;
  const [blinding, setBlinding] = useState("open");
  const [indication, setIndication] = useState(row?.description ?? "");

  const typeOpts = STUDY_TYPE_OPTS.filter((o) => speciesCategory === "livestock" || !o.livestockOnly);
  const enrollOpts = speciesCategory && studyType ? nsEnrollOptions(speciesCategory, studyType) : [];
  const isLivestock = speciesCategory === "livestock";
  const showWithdrawal = nsShowWithdrawal(speciesCategory, studyType);
  const showCrossover = nsShowCrossover(studyType);
  const showTasBanner = nsShowTAS(studyType);
  const maxInter = enrollmentModel === "individual" ? 4 : 2;
  const interCount = hierarchy.filter((l) => !l.fixed && !l.isSubject).length;

  function pickSpecies(s: SpeciesCat) { patch({ speciesCategory: s, studyType: undefined, enrollmentModel: undefined, species: "" }); setHierarchy([]); setSpeciesSel(""); setCustomSpecies(""); onToast(`Study category: ${s === "companion" ? "Companion animal" : "Livestock"}`); }
  function pickType(t: StudyTypeK) { if (!speciesCategory) return; const em = nsDefaultEnroll(speciesCategory, t); patch({ studyType: t, enrollmentModel: em }); setHierarchy(applyLabel(nsHierarchy(speciesCategory, em), em, effectiveSpecies)); onToast("Study type set"); }
  function changeEnroll(m: EnrollModel) { if (!speciesCategory) return; patch({ enrollmentModel: m }); setHierarchy(applyLabel(nsHierarchy(speciesCategory, m), m, effectiveSpecies)); onToast("Enrollment model updated — hierarchy reset"); }
  function pickSpeciesValue(v: string) { setSpeciesSel(v); const eff = v === "Other" ? customSpecies : v; patch({ species: eff }); setHierarchy((h) => applyLabel(h, enrollmentModel, eff)); if (v !== "Other") onToast(v ? `Species: ${v}` : "Species cleared"); }
  function commitCustomSpecies() { patch({ species: customSpecies }); setHierarchy((h) => applyLabel(h, enrollmentModel, customSpecies)); onToast(customSpecies ? `Species: ${customSpecies}` : "Species saved"); }
  function setLevelName(i: number, val: string) { setHierarchy((h) => h.map((l, j) => (j === i ? { ...l, value: val } : l))); }
  function removeLevel(i: number) { setHierarchy((h) => (h[i].fixed || h[i].isSubject ? h : h.filter((_, j) => j !== i))); onToast("Level removed"); }
  function addLevel() { if (interCount >= maxInter) return; setHierarchy((h) => { const idx = h.findIndex((l) => l.isSubject); const nl: HLevel = { fixed: false, isSubject: false, value: "Room", options: ALL_LEVEL_OPTIONS, optional: true }; const copy = h.slice(); copy.splice(idx > -1 ? idx : copy.length, 0, nl); return copy; }); onToast("Level added"); }

  return (
    <>
      <div className="section-header">
        <h1 className="set-section-title">Study Identity &amp; Regulatory Frame</h1>
        <p className="section-desc">{!speciesCategory ? "Start by entering a study name and selecting a study category." : !studyType ? "Now choose a study type." : `Configure ${name.trim() || "your new study"} — all defaults are overridable.`}</p>
      </div>

      {/* 1 — Study information — structurally identical to the existing-study card
          (same card-header/card-body/field-input rows), but every field is
          editable (new studies are in setup, so nothing is locked). */}
      <div className="settings-card">
        <div className="card-header">
          <div>
            <div className="card-header-title">Study information</div>
            <div className="card-header-desc">Core identifiers — cannot be changed after activation without a protocol amendment</div>
          </div>
        </div>
        <div className="card-body">
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Study name</div></div>
            <div className="settings-row-value"><input className="field-input" placeholder="e.g. Bovine Respiratory Disease Trial" value={name} onChange={(e) => patch({ name: e.target.value })} onBlur={() => onToast("Study name saved")} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Study ID</div></div>
            <div className="settings-row-value"><input className="field-input readonly" value={study.code} readOnly tabIndex={-1} style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Protocol number</div>
              <div className="settings-row-label-desc">Pulled from Protocol &amp; Amendments</div>
            </div>
            <div className="settings-row-value"><span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--color-text-placeholder)" }}>—</span></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label">
              <div className="settings-row-label-text">Protocol version</div>
              <div className="settings-row-label-desc">Pulled from Protocol &amp; Amendments</div>
            </div>
            <div className="settings-row-value">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 400, color: "var(--color-text-placeholder)" }}>—</span>
                {hasPA && <button type="button" onClick={() => onNavigate?.("protocol")} className="set-inline-link" style={{ flexShrink: 0 }}>Go to P&amp;A →</button>}
              </div>
            </div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Sponsor</div></div>
            <div className="settings-row-value"><input className="field-input" value={sponsor} onChange={(e) => setSponsor(e.target.value)} onBlur={() => { patch({ sponsor }); onToast("Sponsor saved"); }} /></div>
          </div>
          <div className="settings-row">
            <div className="settings-row-label"><div className="settings-row-label-text">Indication</div></div>
            <div className="settings-row-value"><input className="field-input" value={indication} onChange={(e) => setIndication(e.target.value)} onBlur={() => { patch({ description: indication }); onToast("Indication saved"); }} /></div>
          </div>
        </div>
      </div>

      {/* 2 — Study configuration (shared card; reveals type → species → enrollment progressively) */}
      <StudyConfigCard category={speciesCategory} type={studyType} speciesSel={speciesSel} customSpecies={customSpecies} enroll={enrollmentModel} blinding={blinding} editable={true} onCategory={pickSpecies} onType={pickType} onSpecies={pickSpeciesValue} onCustomSpecies={setCustomSpecies} onCustomSpeciesBlur={commitCustomSpecies} onEnroll={changeEnroll} onBlinding={(b) => { setBlinding(b); onToast("Blinding design updated"); }} />

      {/* All cards below always render (blank in setup) — structurally identical to an
          existing study; no progressive/reduced layout. */}
      {(
        <>
          {showTasBanner && <TASBannerCard />}
          {showWithdrawal && <WithdrawalPeriodCard species={effectiveSpecies} onToast={onToast} />}
          {showCrossover && <CrossoverNoteCard />}

          {/* 3 — Subject hierarchy — driven by enrollment model */}
          <div className="settings-card">
            <div className="settings-card-header"><div><div className="settings-card-title">Subject hierarchy</div><div className="settings-card-desc">Rename each level; Site and the subject level are fixed by the enrollment model</div></div></div>
            <div className="settings-card-body">
              {hierarchy.map((level, i) => {
                const opts = level.strictOptions ? level.options : Array.from(new Set([...level.options, ...ALL_LEVEL_OPTIONS]));
                return (
                  <div key={i} className="hierarchy-level">
                    <div className="hier-num">{i + 1}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", minWidth: 56 }}>{level.fixed ? "Fixed" : level.isSubject ? "Subject" : `Level ${i + 1}`}</div>
                    {level.fixed ? <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{level.value}</span> : <select className="set-select" style={{ minWidth: 160 }} value={level.value} onChange={(e) => setLevelName(i, e.target.value)}>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>}
                    {level.isSubject && <span className="set-badge set-badge-green">Subject level</span>}
                    {level.optional && <span style={{ fontSize: 10, color: "var(--color-text-placeholder)", fontStyle: "italic" }}>optional</span>}
                    {!level.fixed && !level.isSubject && <button className="set-btn-icon" style={{ marginLeft: "auto" }} type="button" title="Remove level" onClick={() => removeLevel(i)}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>}
                  </div>
                );
              })}
              {enrollmentModel !== "dynamic_herd" && enrollmentModel !== "dam_litter" && interCount < maxInter && <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)", marginTop: "var(--space-3)" }} type="button" onClick={addLevel}><i className="ti ti-plus"></i> Add level</button>}
              {enrollmentModel === "dam_litter" && (
                <div className="set-info-banner" style={{ marginTop: "var(--space-4)" }}>
                  <i className="ti ti-sitemap" style={{ fontSize: 16, color: "var(--slate-600)", flexShrink: 0, marginTop: 1 }}></i>
                  <div>
                    <div style={{ fontWeight: 500, marginBottom: 2, display: "flex", alignItems: "center", gap: "var(--space-2)" }}>Litter &amp; offspring tracking <span className="set-badge set-badge-slate">Coming soon</span></div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Each Dam record links to Litter records → Offspring records. Litter and offspring tracking within Dam records will be available in a future release.</div>
                  </div>
                </div>
              )}
              {enrollmentModel === "dynamic_herd" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
                  <div className="set-field"><div className="set-field-label">Initial stock count</div><input className="set-input" type="number" placeholder="e.g. 5000" onBlur={() => onToast("Initial stock count saved")} /></div>
                  <div className="set-field"><div className="set-field-label">Lot number</div><input className="set-input" style={{ fontFamily: "var(--font-mono)" }} placeholder="e.g. LOT-001" onBlur={() => onToast("Lot number saved")} /></div>
                  <div style={{ gridColumn: "1 / -1", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}><i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 4 }}></i> Depletion tracking: mortality is logged against the lot.</div>
                </div>
              )}
            </div>
          </div>

          {/* 4 — Study timeline · 5 — Drug & IP (all editable for a new study) */}
          <StudyTimelineSection seed={EMPTY_PROTOCOL} editable={true} onToast={onToast} onPersist={patch} />
          <DrugIPSection studyCode={study.code} seed={[]} editable={true} blinding={blinding} onToast={onToast} />

          {/* Regulatory & Approvals — same shared card as an existing study (starts empty) */}
          <RegulatoryApprovalsCard studyCode={study.code} editable={true} onToast={onToast} />

          {/* Consent (label adapts) + production phase placeholder (livestock) */}
          <div className="settings-card">
            <div className="settings-card-header"><div><div className="settings-card-title">Consent &amp; production</div></div></div>
            <div className="settings-card-body">
              <ToggleRow on={true} onToggle={() => onToast("Setting saved")} label={speciesCategory === "companion" ? "Owner informed consent required" : "Farm manager / producer consent required"} desc="A signed consent record is required before a subject can be enrolled." />
              {isLivestock && (
                <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  <div><div className="settings-row-label">Production phase tracking <i className="ti ti-info-circle" style={{ fontSize: 12, color: "var(--color-text-placeholder)" }} title="Multi-phase production tracking (e.g. Nursery → Finisher transitions) will be available in a future release."></i></div><div className="settings-row-desc">Multi-phase production tracking (e.g. Nursery → Finisher)</div></div>
                  <div className="settings-row-value" style={{ color: "var(--color-text-placeholder)", fontStyle: "italic" }}>Not configured — coming soon</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ─── Protocol & Amendments section (ported from 25-settings.html) ────────────
interface Amend { id: string; version: string; date: string; summary: string; impact: string; structureChange?: boolean }
// One seeded study-level amendment per study (per-study data, keyed by code).
function seedStudyAmendments(code: string): Amend[] {
  if (code === "CA-0801") return [{ id: "A01", version: "v2.1", date: "2026-01-10", summary: "Added CADESI-04 scoring requirement at all visits", impact: "No impact — ongoing subjects unaffected" }];
  if (code === "PH-2401") return [{ id: "A01", version: "v1.0", date: "2026-04-01", summary: "Initial protocol approval", impact: "No impact — study initiation" }];
  if (code === "BR-2502") return [{ id: "A01", version: "v1.0", date: "2026-03-01", summary: "Initial protocol approval", impact: "No impact — study initiation" }];
  // New / non-seeded study: no amendments on record — render an empty section, no stub.
  return [];
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
  // Current protocol version + effective date are DERIVED from the latest amendment —
  // no amendments on record → em-dash (new studies show nothing until one exists).
  const currentAmend = amendments.length ? amendments[amendments.length - 1] : null;
  const protoVersion = currentAmend?.version ?? "—";
  const effectiveDate = currentAmend?.date ?? "—";
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
                  <div className="settings-card-header" style={{ borderBottom: "none" }}>
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
const PREF_QUERY_TEMPLATES = QUERY_TEMPLATES;
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

function StudyPreferencesSection({ studyId, dataset, activeRole, onToast }: { studyId: string; dataset: Dataset; activeRole: Role; onToast: (m: string) => void }) {
  const [saveMode, setSaveMode] = useState<"field" | "form">("field");
  // Study-level notification rules (Admin/DM) — system events that always fire.
  const canEditRules = activeRole === "Admin" || activeRole === "DM";
  const [rules, setRules] = useState(() => STUDY_RULES_SEED.map((r) => ({ ...r, roles: [...r.roles] })));
  const [qThreshold, setQThreshold] = useState(String(STUDY_RULES_SEED.find((r) => r.key === "q_overdue")?.threshold ?? 5));
  const toggleRuleRole = (key: string, role: Role) => setRules((rs) => rs.map((r) => r.key === key ? { ...r, roles: r.roles.includes(role) ? r.roles.filter((x) => x !== role) : [...r.roles, role] } : r));
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

      {/* ── Card 5: Study notification rules (Admin/DM) ── */}
      {canEditRules && (
        <div className="settings-card">
          <div className="settings-card-header"><div><div className="settings-card-title">Study notification rules</div><div className="settings-card-desc">System-level events that always trigger notifications, regardless of user preferences</div></div></div>
          <div className="settings-card-body">
            {rules.map((rule) => (
              <div key={rule.key} style={{ padding: "var(--space-3) 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{rule.label}</span>
                    {rule.key === "q_overdue" && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
                        threshold <input className="set-input" type="number" min={1} value={qThreshold} onChange={(e) => setQThreshold(e.target.value)} onBlur={() => onToast("Query overdue threshold saved")} style={{ width: 56, fontFamily: "var(--font-mono)" }} /> days
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }} role="group" aria-label={`Notify roles for ${rule.label}`}>
                    {NOTIFY_ROLES.map((r) => {
                      const on = rule.roles.includes(r);
                      return <button key={r} type="button" className={`set-badge ${on ? "set-badge-blue" : "set-badge-slate"}`} style={{ cursor: "pointer", border: "none", opacity: on ? 1 : 0.55 }} aria-pressed={on} onClick={() => { toggleRuleRole(rule.key, r); onToast("Notify roles updated"); }}>{r}</button>;
                    })}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-3)" }}>Individual delivery preferences (email, in-app) are configured in each user&apos;s profile.</div>
          </div>
        </div>
      )}
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
  const router = useRouter();
  // Card 1 — Electronic signatures.
  const [sigMethod, setSigMethod] = useState("Username + password (biometric equivalent)");
  const [requireMeaning, setRequireMeaning] = useState(true);
  const [coSignature, setCoSignature] = useState(false);

  // Signature delegation log — read-only rollup from the real Site Staff & Delegation
  // Log CRF instances (same pattern as Protocol & Amendments → site addenda).
  const delegationRows = useMemo(() => {
    const staffForm = dataset.forms.find((f) => f.study_id === studyId && f.name === "Site Staff & Delegation Log");
    if (!staffForm) return [];
    const codeById = new Map(dataset.formFields.filter((f) => f.form_id === staffForm.id).map((f) => [f.id, f.code]));
    const siteName = new Map(dataset.sites.filter((s) => s.study_id === studyId).map((s) => [s.id, s.name]));
    const parseMulti = (raw: string) => { try { const a = JSON.parse(raw); return Array.isArray(a) ? a.join(", ") : raw; } catch { return raw; } };
    const rows: { id: string; staff: string; role: string; authority: string; effective: string; site: string }[] = [];
    for (const inst of dataset.formInstances.filter((i) => i.form_id === staffForm.id && i.site_id)) {
      const byCode: Record<string, string> = {};
      for (const v of dataset.fieldValues) if (v.form_instance_id === inst.id) { const c = codeById.get(v.form_field_id); if (c) byCode[c] = v.value ?? ""; }
      if (!byCode.staff_name) continue;
      const authority = byCode.delegated_tasks ? parseMulti(byCode.delegated_tasks) : (byCode.signature_authority === "Yes" ? "Signature authority" : "—");
      rows.push({ id: inst.id, staff: byCode.staff_name, role: byCode.role || "—", authority, effective: byCode.protocol_training_date || byCode.gcp_training_date || "—", site: siteName.get(inst.site_id ?? "") || "—" });
    }
    return rows;
  }, [dataset.forms, dataset.formFields, dataset.formInstances, dataset.fieldValues, dataset.sites, studyId]);

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
          {/* Row 3 — read-only timestamp format */}
          <div className="settings-row">
            <div><div className="settings-row-label">Timestamp format</div><div className="settings-row-desc">Regulatory requirement — not editable</div></div>
            <div className="settings-row-value"><span className="set-badge set-badge-blue">UTC (Coordinated Universal Time)</span></div>
          </div>
        </div>
      </div>

      {/* ── Card 4: Signature delegation log (read-only rollup from the site CRF) ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Signature delegation log</div><div className="settings-card-desc">Track who has been delegated signature authority — required for 21 CFR Part 11 compliance</div></div></div>
        <div className="settings-card-body" style={{ overflowX: "auto" }}>
          {delegationRows.length === 0 ? (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-3)" }}>No delegation records found. Complete the Site Staff &amp; Delegation Log on each site record to track signature delegation.</div>
          ) : (
            <table className="fee-table" style={{ marginBottom: "var(--space-3)" }}>
              <thead><tr><th>Staff member</th><th>Role</th><th>Delegated authority</th><th>Effective date</th><th>Site</th></tr></thead>
              <tbody>{delegationRows.map((r) => (
                <tr key={r.id}><td style={{ fontWeight: 500 }}>{r.staff}</td><td>{r.role}</td><td>{r.authority}</td><td style={{ fontFamily: "var(--font-mono)" }}>{r.effective}</td><td>{r.site}</td></tr>
              ))}</tbody>
            </table>
          )}
          <button className="set-btn-secondary" type="button" onClick={() => router.push(`/study/${studyId}/sites`)}>Go to site records <i className="ti ti-arrow-right"></i></button>
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

  // Card 2 — payment terms: committed values + edit drafts (Cancel reverts),
  // mirroring the Study information card's edit pattern.
  const [editTerms, setEditTerms] = useState(false);
  const [holdback, setHoldback] = useState("10");
  const [terms, setTerms] = useState("Net 30");
  const [currency, setCurrency] = useState("USD");
  const [dHoldback, setDHoldback] = useState("10");
  const [dTerms, setDTerms] = useState("Net 30");
  const [dCurrency, setDCurrency] = useState("USD");
  function startEditTerms() { setDHoldback(holdback); setDTerms(terms); setDCurrency(currency); setEditTerms(true); }
  function saveTerms() { setHoldback(dHoldback); setTerms(dTerms); setCurrency(dCurrency); setEditTerms(false); onToast("Payment terms saved"); }

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
          {!editTerms && <button className="set-btn-secondary" type="button" onClick={startEditTerms}><i className="ti ti-pencil"></i> Edit</button>}
        </div>
        <div className="settings-card-body">
          <div className="settings-row">
            <div><div className="settings-row-label">Holdback percentage</div><div className="settings-row-desc">Withheld until database lock</div></div>
            <div className="settings-row-value">{editTerms
              ? <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><input className="set-input" type="number" min={0} value={dHoldback} style={{ width: 90, fontFamily: "var(--font-mono)" }} onChange={(e) => setDHoldback(e.target.value)} /> %</div>
              : <span style={{ fontFamily: "var(--font-mono)" }}>{holdback}%</span>}</div>
          </div>
          <div className="settings-row">
            <div><div className="settings-row-label">Payment terms</div></div>
            <div className="settings-row-value">{editTerms
              ? <select className="set-select" style={{ maxWidth: 160 }} value={dTerms} onChange={(e) => setDTerms(e.target.value)}><option>Net 30</option><option>Net 45</option><option>Net 60</option></select>
              : terms}</div>
          </div>
          <div className="settings-row">
            <div><div className="settings-row-label">Study default currency</div></div>
            <div className="settings-row-value">{editTerms
              ? <select className="set-select" style={{ maxWidth: 160 }} value={dCurrency} onChange={(e) => setDCurrency(e.target.value)}><option>USD</option><option>CAD</option><option>EUR</option><option>GBP</option></select>
              : currency}</div>
          </div>
          {editTerms && (
            <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-4)" }}>
              <button className="set-btn-secondary" type="button" onClick={() => setEditTerms(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={saveTerms}><i className="ti ti-check"></i> Save</button>
            </div>
          )}
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

// Study-status badge + status changer + activation gate (top of the Settings nav).
// Only Admin/DM (canManage) can change status. A setup study can only be activated
// once Study Identity + Protocol Builder are complete (canActivate).
function StatusControl({ studyCode, status, onChange, canManage, canActivate, onToast }: { studyCode: string; status: StudyStatus; onChange: (s: StudyStatus) => void; canManage: boolean; canActivate: boolean; onToast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const meta = STATUS_META[status];
  const activateTip = "Complete Study Identity and Protocol Builder before activating.";
  return (
    <div style={{ padding: "0 var(--space-4) var(--space-3)", marginBottom: "var(--space-3)", borderBottom: "1px solid var(--color-border-subtle)", position: "relative" }}>
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>{studyCode}</div>
      <button type="button" disabled={!canManage} onClick={() => setOpen((o) => !o)} title={canManage ? "Change study status" : "Study status"} style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "none", padding: 0, cursor: canManage ? "pointer" : "default" }}>
        <span className={`set-badge ${meta.badge}`}>{meta.icon && <i className={`ti ti-${meta.icon}`} style={{ fontSize: 10, marginRight: 3 }}></i>}{meta.label}</span>
        {canManage && <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}></i>}
      </button>
      {open && canManage && (
        <div className="settings-status-dropdown">
          {STATUS_ORDER.map((s) => {
            const blocked = s === "active" && status === "setup" && !canActivate;
            return (
              <button key={s} type="button" disabled={blocked} title={blocked ? activateTip : undefined} onClick={() => { if (blocked) return; onChange(s); setOpen(false); onToast(`Study status changed to ${STATUS_META[s].label}`); }} style={{ ...(s === status ? { fontWeight: 600 } : undefined), ...(blocked ? { opacity: 0.5, cursor: "not-allowed" } : undefined) }}>
                <span className={`set-badge ${STATUS_META[s].badge}`} style={{ marginRight: 6 }}>{STATUS_META[s].label}</span>
              </button>
            );
          })}
        </div>
      )}
      {status === "setup" && canManage && (
        <button type="button" className="set-btn-primary" disabled={!canActivate} title={canActivate ? "Activate this study" : activateTip} onClick={() => { onChange("active"); onToast("Study activated"); }} style={{ marginTop: "var(--space-2)", width: "100%", height: 30, fontSize: "var(--text-xs)", justifyContent: "center", ...(canActivate ? undefined : { opacity: 0.5, cursor: "not-allowed" }) }}>
          <i className="ti ti-rocket" style={{ fontSize: 13 }}></i> Activate study
        </button>
      )}
    </div>
  );
}

export default function StudySettingsPage() {
  const { study, activeRole } = useShell();
  const { dataset } = useStudySession();
  const cfg = useMemo(() => randConfig(study.code), [study.code]);
  // Study status lifecycle — seeded per study; the demo control (Admin) overrides
  // it in component state to demonstrate the read-only gating on locked studies.
  // New studies start in Setup (seeded studies keep their lifecycle status).
  const [status, setStatus] = useState<StudyStatus>(() => (isSeededStudy(study.code) ? getStudyStatus(study.code) : "setup"));
  useEffect(() => { setStatus(isSeededStudy(study.code) ? getStudyStatus(study.code) : "setup"); }, [study.code]);
  const isAdmin = activeRole === "Admin";
  const typeCfg = getStudyTypeConfig(study.code); // study-type design flags (rand unit, timing)
  const isGroupRand = typeCfg.randomizationUnit === "group";

  const sp = useSearchParams();
  const [section, setSection] = useState<string>(() => { const s = sp.get("section"); return s && NAV_ITEMS.some((n) => n.key === s) ? s : "study"; });
  // Honour ?section= even when already on Settings (e.g. the notifications gear).
  useEffect(() => { const s = sp.get("section"); if (s && NAV_ITEMS.some((n) => n.key === s)) setSection(s); }, [sp]);
  const [method, setMethod] = useState<Method>(cfg.method);
  const [blockSizes, setBlockSizes] = useState<number[]>(cfg.blockSizes); // selected valid block sizes
  // Treatment groups: ratio + color are randomization-local; Code, Blinded label and
  // Name are derived (by index) from the study's IP cards in Study Identity, so edits
  // there reflect here reactively (1 IP card ↔ 1 group).
  // `groups` holds only the randomization-local ratio + color per arm (seeded). The
  // treatment groups shown are DERIVED from the Investigational Products (1 IP ↔ 1
  // group): adding an IP in Study Identity → Drug & Investigational Product adds a
  // group here; removing one removes it. Ratio/color come from `groups` by index
  // (defaulted for IPs added after the seed). A blank IP (no name + no code) doesn't
  // form a group yet.
  const [groups, setGroups] = useState<Group[]>(cfg.groups);
  const ips = useIps(study.code, SEEDED_IPS[study.code] ?? []);
  const GROUP_COLORS = ["#1760A8", "#1A6B47", "#6D7480", "#534AB7", "#B85C35", "#A33A08"];
  const displayGroups = ips
    .map((ip, i) => ({
      idx: i,
      ip,
      code: ip.code || groups[i]?.code || `T${String(i + 1).padStart(2, "0")}`,
      name: ip.name || groups[i]?.name || "",
      blindedLabel: (ip.blindedLabel || "").trim() || undefined,
      ratio: groups[i]?.ratio ?? 1,
      color: groups[i]?.color ?? GROUP_COLORS[i % GROUP_COLORS.length],
    }))
    .filter((g) => g.name.trim() !== "" || (g.ip.code || "").trim() !== "");
  const [blinding, setBlinding] = useState(cfg.blinding);
  const [assignmentTiming, setAssignmentTiming] = useState<string>(typeCfg.groupAssignmentTiming);
  // Treatment-group edit modal — ratio only (Name is read-only, from the IP card;
  // Code + Blinded label are edited on the IP card in Study Identity). Groups can't
  // be created or deleted here — they're derived from the IP registry.
  const [gOpen, setGOpen] = useState(false);
  const [gEditIdx, setGEditIdx] = useState<number | null>(null); // index of the group being edited
  const [gRatio, setGRatio] = useState("1");
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
    setMethod(cfg.method); setBlockSizes(cfg.blockSizes); setBlinding(cfg.blinding);
    setGroups(cfg.groups); setGOpen(false); setAssignmentTiming(typeCfg.groupAssignmentTiming);
    setStratScope(cfg.stratScope); setFactors(cfg.stratFactors);
  }, [cfg]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Reactive randomization derivations (recompute when IPs or ratios change) ──
  const ratioTotal = displayGroups.reduce((s, g) => s + g.ratio, 0);
  const showBlock = method === "blocked"; // block sizes only apply to blocked randomization
  const showGenerated = method === "generated";
  // Valid block sizes = multiples of the ratio total, ratioTotal×1 … ratioTotal×6.
  const validBlockSizes = ratioTotal > 0 ? [1, 2, 3, 4, 5, 6].map((k) => ratioTotal * k) : [];
  const ratiosEqual = displayGroups.length > 0 && displayGroups.every((g) => g.ratio === displayGroups[0].ratio);
  const ratioString = displayGroups.map((g) => `${g.code} ${g.ratio}`).join(" : ") + (ratiosEqual && displayGroups.length > 0 ? " (equal allocation)" : "");
  // Config edits are DM/Admin-only, and only while the study is setup/active (the
  // section is otherwise wrapped in a disabled fieldset).
  const canEditRand = (activeRole === "DM" || activeRole === "Admin") && isSectionEditable(status, "randomization");
  // Protocol Builder is locked (read-only) in every status except setup.
  const randLocked = status !== "setup";
  // ── Activation gate ── Only Admin/DM can change status. A setup study can activate
  // only when Study Identity + Protocol Builder are complete. (Completeness checks the
  // fields accessible here: persisted study-identity fields + the live randomization
  // design. Study start / target N / SoE live in child-local state and aren't gated —
  // see the note in the PR; extending them would require a DATA_KEY bump.)
  const studyRow = dataset.studies.find((s) => s.id === study.id);
  const canManageStatus = activeRole === "Admin" || activeRole === "DM";
  // protocol_number is no longer captured here (derived read-only from P&A), so it
  // isn't part of the identity-complete gate.
  const identityComplete = !!(studyRow?.name && studyRow?.sponsor && studyRow?.speciesCategory && studyRow?.studyType && studyRow?.species && studyRow?.enrollmentModel && studyRow?.study_start && studyRow?.enrollment_target);
  const protocolComplete = displayGroups.length >= 1 && !!method && !!blinding;
  const canActivate = identityComplete && protocolComplete;
  const sectionComplete = (key: string) => (key === "study" ? identityComplete : key === "randomization" ? protocolComplete : false);
  // When the ratio total changes (groups edited), deselect any block size no longer valid.
  useEffect(() => {
    setBlockSizes((prev) => {
      const next = prev.filter((b) => ratioTotal > 0 && b % ratioTotal === 0 && b <= ratioTotal * 6);
      return next.length === prev.length ? prev : next;
    });
  }, [ratioTotal]);

  const toggleBlockSize = (b: number) => setBlockSizes((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b].sort((x, y) => x - y)));

  // Treatment-group modal handlers — edit ratio only (by index).
  function openEditGroup(i: number) { setGEditIdx(i); setGRatio(String(groups[i]?.ratio ?? 1)); setGOpen(true); }
  function saveGroup() {
    if (gEditIdx == null) { setGOpen(false); return; }
    const ratio = Math.max(1, Math.floor(Number(gRatio) || 1));
    setGroups((prev) => {
      // Ensure a ratio/color slot exists at this index — IPs added after the seed
      // have no `groups` entry yet.
      const next = prev.slice();
      while (next.length <= gEditIdx!) {
        const j = next.length;
        next.push({ code: "", name: "", ratio: 1, arm: "", lot: "—", color: GROUP_COLORS[j % GROUP_COLORS.length] });
      }
      next[gEditIdx!] = { ...next[gEditIdx!], ratio };
      return next;
    });
    setToast("Ratio updated");
    setGOpen(false);
  }

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
        <StatusControl studyCode={study.code} status={status} onChange={setStatus} canManage={canManageStatus} canActivate={canActivate} onToast={setToast} />
        {NAV_GROUPS.map((grp, gi) => (
          <div key={grp.title}>
            <div className="settings-nav-title" style={gi > 0 ? { marginTop: "var(--space-4)" } : undefined}>{grp.title}</div>
            {grp.items.map((n) => {
              const navLocked = isSectionLocked(n.key, status);
              const navComplete = status === "setup" && sectionComplete(n.key);
              return (
                <button key={n.key} className={`settings-nav-item${section === n.key ? " active" : ""}`} onClick={() => setSection(n.key)} type="button">
                  <i className={`ti ti-${n.icon}`} aria-hidden="true"></i>
                  {n.label}
                  {navComplete && <i className="ti ti-circle-check" title="Complete" style={{ marginLeft: "auto", color: "var(--green-600)", fontSize: 15 }}></i>}
                  {navLocked && <i className="ti ti-lock" title="Locked — study is active" style={{ marginLeft: navComplete ? 6 : "auto", color: "var(--color-text-tertiary)", fontSize: 14 }}></i>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Content */}
      <div className="settings-content">
        {(() => { const sectionEl = section === "randomization" ? (
          <>
            <div className="section-header">
              <h1 className="set-section-title">Protocol Builder</h1>
            </div>
            {/* ══ SECTION 1 — Treatment groups ══ */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div><div className="settings-card-title">Treatment groups</div><div className="settings-card-desc">Derived from your Investigational Products — set each group&apos;s allocation ratio</div></div>
              </div>
              <div className="settings-card-body">
                {displayGroups.length > 0 && (
                  // Groups can't be created/removed here — they mirror the IP registry.
                  <div className="set-info-banner" style={{ marginBottom: "var(--space-4)" }}>
                    <i className="ti ti-info-circle" style={{ fontSize: 16, color: "var(--slate-600)", flexShrink: 0, marginTop: 1 }}></i>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Treatment groups are derived from your Investigational Products configuration. To add or remove a group, update the IP Registry in Study Identity. {!randLocked && <button type="button" className="set-inline-link" onClick={() => { setSection("study"); setTimeout(() => document.getElementById("ip-registry")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>Go to Study Identity →</button>}</div>
                  </div>
                )}
                {displayGroups.length === 0 ? (
                  // Groups are derived from the study's Investigational Products — they
                  // can't be created directly here. Point the user to the IP Registry in
                  // Study Identity instead of offering an "Add group" button.
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "var(--space-3)", padding: "var(--space-7) var(--space-5)" }}>
                    <i className="ti ti-pill" style={{ fontSize: 32, color: "var(--color-text-placeholder)" }} aria-hidden="true"></i>
                    <div style={{ fontSize: "var(--text-lg)", fontWeight: 500, color: "var(--color-text-secondary)" }}>No treatment groups yet</div>
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)", maxWidth: 460, lineHeight: 1.5 }}>Treatment groups are created automatically from your Investigational Products. Add your IPs in Study Identity first, then return here to configure ratios and randomization.</div>
                    <button type="button" className="set-inline-link" onClick={() => window.location.reload()}>Already added IPs? Refresh to see your groups.</button>
                  </div>
                ) : (
                  <table className="rand-group-table">
                    <thead><tr><th>Group</th><th>Ratio</th><th>Blinded label</th><th>Code</th>{canEditRand && <th style={{ textAlign: "right" }}></th>}</tr></thead>
                    <tbody>
                      {displayGroups.map((g) => {
                        const tm = IP_TYPES.find((x) => x.key === g.ip.type);
                        return (
                        <tr key={g.idx}>
                          <td>
                            <span className="group-color-dot" style={{ background: g.color, display: "inline-block", marginRight: 6, verticalAlign: "middle" }} />
                            <span style={{ fontWeight: 500 }}>{g.name}</span>
                            {tm && <span className={`set-badge ${tm.badge}`} style={{ marginLeft: 6 }}>{tm.label}</span>}
                          </td>
                          <td style={{ fontFamily: "var(--font-mono)" }}>{g.ratio}</td>
                          <td style={{ color: g.blindedLabel ? undefined : "var(--color-text-placeholder)" }}>{g.blindedLabel || "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>{g.code || "—"}</td>
                          {canEditRand && (
                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                              <button className="set-btn-icon" title="Edit ratio" type="button" onClick={() => openEditGroup(g.idx)}><i className="ti ti-pencil" style={{ fontSize: 13 }}></i></button>
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ══ SECTION 2 — Randomization ══ */}
            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">Randomization</div></div></div>
              <div className="settings-card-body">
                {/* ROW 1 — Randomization method */}
                <div className="settings-row">
                  <div><div className="settings-row-label">Randomization method</div><div className="settings-row-desc">How subjects are assigned to treatment groups</div></div>
                  <div className="settings-row-value">
                    <select className="set-select" style={{ maxWidth: 280 }} value={method} onChange={(e) => { setMethod(e.target.value as Method); setToast("Method updated"); }}>
                      <option value="blocked">Blocked</option>
                      <option value="simple">Simple</option>
                      <option value="stratified">Stratified</option>
                      <option value="minimization">Minimization</option>
                      <option value="generated">Generated list</option>
                    </select>
                  </div>
                </div>

                {/* ROW 2 — Block sizes (Blocked only) — valid multiples of the ratio total, selectable */}
                {showBlock && (
                  <div className="settings-row">
                    <div><div className="settings-row-label">Block sizes</div><div className="settings-row-desc">Select valid block sizes based on your allocation ratio</div></div>
                    <div className="settings-row-value" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                      {validBlockSizes.length === 0
                        ? <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>Define treatment groups to see valid block sizes.</span>
                        : validBlockSizes.map((b) => (
                          <button key={b} type="button" className={`rand-size-chip${blockSizes.includes(b) ? " selected" : ""}`} disabled={!canEditRand} onClick={() => toggleBlockSize(b)}>{b}</button>
                        ))}
                    </div>
                  </div>
                )}

                {/* ROW 3 — Allocation ratio (display only, derived from group ratios) */}
                <div className="settings-row">
                  <div><div className="settings-row-label">Allocation ratio</div><div className="settings-row-desc">Derived from treatment group ratios</div></div>
                  <div className="settings-row-value" style={{ fontSize: "var(--text-sm)", fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>{displayGroups.length ? ratioString : "—"}</div>
                </div>

                {/* ROW 4 — Group assignment timing */}
                <div className="settings-row">
                  <div><div className="settings-row-label">Group assignment timing</div><div className="settings-row-desc">When treatment arms are assigned</div></div>
                  <div className="settings-row-value">
                    <select className="set-select" style={{ maxWidth: 200 }} value={assignmentTiming} onChange={(e) => { setAssignmentTiming(e.target.value); setToast("Group assignment timing updated"); }}>
                      <option value="at_enrollment">At enrollment</option>
                      <option value="at_setup">At study setup</option>
                      <option value="predetermined">Predetermined</option>
                    </select>
                  </div>
                </div>

                {/* ROW 5 — Blinding design (read-only) — configured in Study Identity →
                    Study configuration; shown here for reference only. */}
                <div className="settings-row">
                  <div><div className="settings-row-label">Blinding design</div><div className="settings-row-desc">Set in Study Identity → Study configuration</div></div>
                  <div className="settings-row-value">
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{BLINDING_OPTS.find((b) => b.key === (SEEDED_BLINDING[study.code] ?? "open"))?.label ?? "Open-label"}</span>
                      {!randLocked && <button type="button" className="set-inline-link" onClick={() => { setSection("study"); setTimeout(() => document.getElementById("study-configuration")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80); }}>Change in Study Identity →</button>}
                    </div>
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
                        {/* Read-only (locked) hides the drag handle + edit/remove controls;
                            the card content stays visible. */}
                        {!randLocked && <i className="ti ti-grip-vertical" style={{ fontSize: 14, color: "var(--color-text-placeholder)", cursor: "grab", flexShrink: 0 }}></i>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: 3 }}>
                            <span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{f.name}</span>
                            <span className={`set-badge ${f.source === "site" ? "set-badge-slate" : "set-badge-blue"}`}>{f.source === "site" ? "Site" : "Form field"}</span>
                          </div>
                          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{factorDetail(f)}</div>
                        </div>
                        {!randLocked && (
                          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                            <button className="set-btn-icon" title="Edit factor" type="button" onClick={() => openEditModal(f)}><i className="ti ti-pencil" style={{ fontSize: 13 }}></i></button>
                            {/* The built-in Site factor is always present and cannot be removed. */}
                            {f.source !== "site" && <button className="set-btn-icon" title="Remove factor" type="button" onClick={() => { setFactors(factors.filter((x) => x.key !== f.key)); setToast("Factor removed"); }}><i className="ti ti-trash" style={{ fontSize: 13 }}></i></button>}
                          </div>
                        )}
                      </div>
                    ))}
                    {factors.length === 0 && (method === "stratified" || method === "minimization") && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--amber-700)" }}><i className="ti ti-alert-triangle" style={{ fontSize: 11 }}></i> At least one stratification factor is required for this method.</div>
                    )}
                    {factors.length === 0 && method !== "stratified" && method !== "minimization" && (
                      <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-placeholder)" }}>No stratification factors defined.</div>
                    )}
                  </div>
                  {!randLocked && <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={openAddModal}><i className="ti ti-plus"></i> Add factor</button>}
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
                {/* ROW 7 — Generated list (only when method = Generated list) */}
                {showGenerated && (
                  <div style={{ padding: "var(--space-3) 0" }}>
                    <div style={{ marginBottom: "var(--space-3)" }}>
                      <div className="settings-row-label">Randomization list</div>
                      <div className="settings-row-desc">Upload or generate the randomization schedule</div>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                      <button className="set-btn-secondary" type="button" onClick={() => setToast("CSV upload is disabled in the demo.")}><i className="ti ti-file-type-csv"></i> Upload list (CSV)</button>
                      <button className="set-btn-secondary" type="button" onClick={() => setToast("Randomization list generated (demo).")}><i className="ti ti-refresh"></i> Generate list</button>
                    </div>
                    <div className="set-note"><i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 4 }}></i> Once generated, the list is locked before first enrollment — assignments cannot be changed without a protocol amendment.</div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : section === "inventory" ? (
          <InventorySection studyCode={study.code} studyId={study.id} studyForms={studyForms} dataset={dataset} onToast={setToast} />
        ) : section === "study" ? (
          isSeededStudy(study.code)
            ? <StudySettingsSection key={study.code} studyCode={study.code} onToast={setToast} onNavigate={setSection} locked={isSectionLocked("study", status)} setup={status === "setup"} />
            : <NewStudySetup key={study.code} study={study} onToast={setToast} onNavigate={setSection} />
        ) : section === "protocol" ? (
          <ProtocolAmendmentsSection key={study.code} studyCode={study.code} studyId={study.id} dataset={dataset} onToast={setToast} />
        ) : section === "formperm" ? (
          <FormPermissionsSection key={study.code} studyId={study.id} dataset={dataset} />
        ) : section === "roles" ? (
          <RolesSection key={study.code} onToast={setToast} />
        ) : section === "preferences" ? (
          <StudyPreferencesSection key={study.code} studyId={study.id} dataset={dataset} activeRole={activeRole} onToast={setToast} />
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
        );
        // Status gate — when the study status locks this section, disable every
        // control (fieldset) and show a read-only banner. The Study Identity ("study")
        // section manages its own lock internally so Regulatory & Approvals stays
        // editable (passed the `locked` prop), so it's excluded here.
        if (section === "study" || !isSectionLocked(section, status)) return sectionEl;
        return (
          <>
            <div className="settings-locked-banner"><i className="ti ti-lock"></i> {LOCKED_BANNER_TEXT}</div>
            <fieldset disabled className="settings-locked-fieldset">{sectionEl}</fieldset>
          </>
        );
        })()}
      </div>

      {/* ── Edit treatment-group ratio modal ── Name is read-only (from the IP card);
          Code + Blinded label are edited on the IP card in Study Identity. */}
      {gOpen && (() => {
        const gName = (gEditIdx != null ? displayGroups.find((g) => g.idx === gEditIdx)?.name : "") || "";
        return (
        <div className="set-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setGOpen(false); }}>
          <div className="set-modal" role="dialog" aria-modal="true">
            <div className="set-modal-header">
              <div><div className="set-modal-title">Edit ratio — {gName}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>Set this group&apos;s allocation ratio</div></div>
              <button className="set-modal-close" type="button" onClick={() => setGOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="set-modal-body">
              <div className="set-field">
                <div className="set-field-label">Name</div>
                <div className="set-input set-input-ro" style={{ display: "flex", alignItems: "center" }}>{gName}</div>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 4 }}>Set on the IP card in Study Identity.</div>
              </div>
              <div className="set-field">
                <div className="set-field-label">Ratio</div>
                <input type="number" min={1} className="set-input" value={gRatio} onChange={(e) => setGRatio(e.target.value)} />
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 4 }}>Relative number of subjects allocated to this group (min 1).</div>
              </div>
            </div>
            <div className="set-modal-footer">
              <button className="set-btn-secondary" type="button" onClick={() => setGOpen(false)}>Cancel</button>
              <button className="set-btn-primary" type="button" onClick={saveGroup}><i className="ti ti-check"></i> Save ratio</button>
            </div>
          </div>
        </div>
        );
      })()}

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
