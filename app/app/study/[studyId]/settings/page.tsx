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

import { useEffect, useMemo, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { Dataset } from "@/lib/session-store/types";
import type { Role } from "@/lib/permissions";
import { INV_ACTIONS, INV_ROLES, useInventoryPermissions, setInvPermission } from "@/lib/inventory-permissions";
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
  { title: "Protocol", items: [{ key: "randomization", label: "Randomization", icon: "arrows-shuffle" }] },
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

// ─── Inventory section config (ported from 25-settings.html section-inventory) ──
const NOTIFY_ROLES: Role[] = ["CRC", "CRA", "DM", "PI", "Admin"];
// Condition options + default stock-outcome mapping (CA-0801 return form).
const CONDITION_OPTIONS = ["Intact / sealed", "Partially used — good condition", "Partially used — compromised", "Damaged", "Expired", "Unknown"];
const OUTCOME_OPTIONS: { value: string; label: string; cls: string }[] = [
  { value: "restock_full", label: "Restock (full)", cls: "set-badge-green" },
  { value: "restock_partial", label: "Restock (partial)", cls: "set-badge-blue" },
  { value: "destroy", label: "Destroy", cls: "set-badge-red" },
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

function InventorySection({ studyCode, studyId, studyForms, dataset, onToast }: { studyCode: string; studyId: string; studyForms: { id: string; name: string }[]; dataset: Dataset; onToast: (m: string) => void }) {
  const trig = useMemo(() => dispenseTrigger(studyCode, dataset, studyId), [studyCode, dataset, studyId]);
  const rtrig = useMemo(() => returnTrigger(studyCode), [studyCode]);
  const showReturn = studyCode === "CA-0801"; // Return trigger only applies to CA-0801

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

  // Reset every study-scoped control when the active study changes.
  useEffect(() => { setDispForm(trig.form); setUnitField(trig.unit); setVolField(trig.vol); setDateField(trig.date); }, [trig]);
  useEffect(() => { setRetForm(rtrig.form); setRetUnit(rtrig.unit); setRetDate(rtrig.date); setRetCond(rtrig.condition); setCondMap({ ...DEFAULT_COND_MAP }); }, [rtrig]);

  // Permissions (shared store — edits here drive the live Inventory module).
  const perms = useInventoryPermissions();
  const formNames = studyForms.map((f) => f.name);

  // The linked condition-field chip (Return trigger card).
  const conditionChip = retCond !== "—" ? (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
      <span className="set-badge set-badge-blue" style={{ fontFamily: "var(--font-mono)" }}>{rtrig.conditionLabel}</span>
      <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>linked from Return trigger → Condition field</span>
      <button className="set-btn-icon" style={{ width: 22, height: 22 }} title="Unlink" type="button" onClick={() => onToast("Condition field unlinked (demo)")}><i className="ti ti-unlink" style={{ fontSize: 12 }}></i></button>
    </div>
  ) : <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-placeholder)" }}>No condition field linked for this study.</span>;

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

      {/* ── Card 2: Return trigger ── */}
      {showReturn && (
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Return trigger</div><div className="settings-card-desc">Which form fields log a drug return event</div></div></div>
        <div className="settings-card-body">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Return form</div><Sel value={retForm} opts={[...formNames, "—"]} onChange={(v) => { setRetForm(v); onToast("Return form updated"); }} /></div>
            <div className="set-field"><div className="set-field-label">Unit ID field</div><Sel value={retUnit} opts={["returned_kit_number", "unit_id", "vial_unit_id", "—"]} onChange={(v) => { setRetUnit(v); onToast("Return unit ID field updated"); }} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
            <div className="set-field"><div className="set-field-label">Return date field</div><Sel value={retDate} opts={["visit_date", "date_of_return", "collection_date", "—"]} onChange={(v) => { setRetDate(v); onToast("Return date field updated"); }} /></div>
            <div className="set-field"><div className="set-field-label">Condition field</div><Sel value={retCond} opts={["unit_condition_on_return", "physical_condition", "integrity_status", "—"]} onChange={(v) => { setRetCond(v); onToast("Condition field updated"); }} /><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 4 }}>Used to determine if returned units re-enter stock</div></div>
          </div>
          <div style={{ marginTop: "var(--space-4)", paddingTop: "var(--space-4)", borderTop: "1px solid var(--color-border-subtle)" }}>
            <div className="set-field-label" style={{ marginBottom: "var(--space-2)" }}>Condition field on return form</div>
            {conditionChip}
          </div>
          {retCond !== "—" && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "var(--tracking-caps)", color: "var(--color-text-tertiary)", marginBottom: "var(--space-2)" }}>Condition options → stock outcome</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {CONDITION_OPTIONS.map((opt) => (
                  <div key={opt} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                    <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{opt}</span>
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
        </div>
      </div>
      )}

      {/* ── Card 3: Inventory rules — low stock alerts ── */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Inventory rules</div><div className="settings-card-desc">Stock-alert behaviour</div></div></div>
        <div className="settings-card-body">
          <div className="settings-row-label" style={{ textAlign: "center" }}>Low stock alerts</div>
          <div className="settings-row-desc" style={{ marginBottom: "var(--space-4)", textAlign: "center" }}>Notify the roles below when available units fall under the threshold</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-4)" }}>
            <div className="set-field" style={{ alignItems: "center" }}><div className="set-field-label">Threshold</div><input className="set-input" type="number" min={1} value={lowThreshold} style={{ width: 72, fontFamily: "var(--font-mono)", textAlign: "center" }} onChange={(e) => setLowThreshold(e.target.value)} onBlur={() => onToast("Low stock threshold saved")} /></div>
            <div className="set-field" style={{ alignItems: "center" }}><div className="set-field-label">Notify roles</div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-4)", marginTop: 2 }}>
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

export default function StudySettingsPage() {
  const { study } = useShell();
  const { dataset } = useStudySession();
  const cfg = useMemo(() => randConfig(study.code), [study.code]);

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
    setMethod(cfg.method); setBlockSize(cfg.blockSize); setBlinding(cfg.blinding);
    setStratScope(cfg.stratScope); setFactors(cfg.stratFactors); setSection("randomization");
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
                    <span>Simple randomization is not recommended for studies with fewer than 100 subjects.</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Card 2: Treatment groups ── */}
            <div className="settings-card">
              <div className="settings-card-header">
                <div><div className="settings-card-title">Treatment groups</div><div className="settings-card-desc">Groups, allocation ratio, enrolment, and the inventory lot each is linked to</div></div>
                <button className="set-btn-secondary" type="button" onClick={() => setToast("Group management locked after first enrollment.")}><i className="ti ti-plus"></i> Add group</button>
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
                {method !== "minimization" && <button className="set-btn-primary" type="button" onClick={() => setToast("Randomization list locked. Assignments cannot be changed without a protocol amendment.")}><i className="ti ti-lock"></i> Lock randomization</button>}
              </div>
              <div className="settings-card-body">
                {method === "minimization" ? (
                  <div className="set-note"><i className="ti ti-info-circle" style={{ fontSize: 13, marginRight: 4 }}></i> Minimization uses real-time dynamic assignment — no randomization list is needed.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
                      <button className="set-btn-secondary" type="button" onClick={() => setToast("CSV upload is disabled in the demo.")}><i className="ti ti-file-type-csv"></i> Upload list (CSV)</button>
                      <button className="set-btn-secondary" type="button" onClick={() => setToast("Randomization list generated (demo).")}><i className="ti ti-refresh"></i> Generate list</button>
                    </div>
                    <div className="set-note"><i className="ti ti-info-circle" style={{ fontSize: 12, marginRight: 4 }}></i> Randomization list will be locked before first enrollment. Once locked, assignments cannot be changed without a protocol amendment.</div>
                  </>
                )}
              </div>
            </div>
          </>
        ) : section === "inventory" ? (
          <InventorySection studyCode={study.code} studyId={study.id} studyForms={studyForms} dataset={dataset} onToast={setToast} />
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
