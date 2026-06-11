"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { canQuery } from "@/lib/permissions";
import { DEMO_USER_ID, DEMO_USER } from "@/lib/constants";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import type { Dataset, FormFieldRow } from "@/lib/session-store/types";
import "./subject-record.css";

interface Props {
  studyId: string;
  subjectId: string;
  initialFormId?: string;
}

const SPECIES_ICON: Record<string, string> = {
  cattle: "🐄",
  swine: "🐷",
  canine: "🐕",
  feline: "🐈",
  aquatic: "🐟",
  equine: "🐎",
};
const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  active: { cls: "status-randomized", label: "Active" },
  randomized: { cls: "status-randomized", label: "Randomized" },
  enrolled: { cls: "status-randomized", label: "Enrolled" },
  screening: { cls: "status-screened", label: "Screening" },
  completed: { cls: "status-completed", label: "Completed" },
  withdrawn: { cls: "status-screened", label: "Withdrawn" },
};

type SidebarIcon = "final" | "reviewed" | "inreview" | "inwork" | "empty" | "queried";
function iconForInstance(s: string | undefined): SidebarIcon {
  if (s === "finalized" || s === "locked") return "final";
  if (s === "reviewed") return "reviewed";
  if (s === "in_review") return "inreview";
  if (s === "in_work") return "inwork";
  return "empty";
}
const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };
// Worst → best, for rolling a group's status up from its children (queried = most
// attention-needing, final = done).
const ICON_RANK: Record<SidebarIcon, number> = { queried: 0, empty: 1, inwork: 2, inreview: 3, reviewed: 4, final: 5 };
const newId = () => crypto.randomUUID();
const todayISO = () => new Date().toISOString().slice(0, 10);
const STATUS_CAP = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const qCodeFor = (id: string) => `Q-${id.slice(0, 4).toUpperCase()}`;
const ecCodeFor = (id: string) => `EC-${id.slice(0, 4).toUpperCase()}`;

// Form status progression: current status → the single advance action, gated by role.
const STATUS_FLOW: Record<string, { next: string; label: string; roles: string[]; esign?: boolean }> = {
  in_work: { next: "in_review", label: "Submit for Review", roles: ["CRC", "CRA"] },
  in_review: { next: "reviewed", label: "Mark Reviewed", roles: ["CRA", "DM", "PI"] },
  reviewed: { next: "finalized", label: "Finalize", roles: ["PI", "DM"] },
  finalized: { next: "locked", label: "Lock", roles: ["DM"], esign: true },
};
// Human label for a sidebar status icon (tooltip).
const ICON_LABEL: Record<SidebarIcon, string> = {
  empty: "Empty", inwork: "In-Work", inreview: "In-Review", reviewed: "Reviewed", final: "Finalized", queried: "Open query",
};
const STATUS_LABEL: Record<string, string> = {
  empty: "Empty", in_work: "In-Work", in_review: "In-Review", reviewed: "Reviewed", finalized: "Finalized", locked: "Locked",
};

// Stub VeDDRA dictionary for the coded-field "Look up" (DM coding).
const VEDDRA_TERMS = [
  "Pyrexia NOS", "Lethargy", "Inappetence / anorexia", "Vomiting", "Diarrhoea",
  "Injection site reaction", "Lameness", "Coughing", "Nasal discharge", "Dyspnoea",
];

// In-Review status icon — amber right-half "half-moon" from the style guide.
function InReviewIcon() {
  return (
    <svg className="si-inwork" width="16" height="16" viewBox="2 2 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 16.8574C13.7871 16.8574 16.8574 13.7871 16.8574 10C16.8574 6.2129 13.7871 3.14258 10 3.14258V10.0022V16.8574ZM7.60632 17.6357C8.37406 17.8765 9.18055 18.0022 10 18.0022V18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 10.0004 2 10.0007 2 10.0011C2 10.0015 2 10.0019 2 10.0022C2 10.083 2.00122 10.1637 2.00366 10.2442C2.04632 11.6675 2.46075 12.9973 3.15316 14.14C3.48435 14.6881 3.8828 15.1987 4.34315 15.6591C5.07028 16.3862 5.92297 16.9589 6.85027 17.3561C7.09618 17.4615 7.34844 17.555 7.60632 17.6357Z" fill="#CF811E" />
    </svg>
  );
}

// In-Work status icon — exact SVG from the style guide (docs/index.html), a blue
// left-half "half-moon". Not a CSS conic-gradient.
function InWorkIcon() {
  return (
    <svg className="si-inwork" width="16" height="16" viewBox="2 2 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M11.1423 17.9188C15.0196 17.3647 18.0003 14.0303 18.0003 9.99983C18.0003 5.58165 14.4186 2 10.0004 2C6.30023 2 3.18677 4.51215 2.27257 7.92394C2.0948 8.58662 2 9.28327 2 10.0021C2 14.4202 5.58165 18.0019 9.99983 18.0019C10.3887 18.0019 10.7712 17.9741 11.1452 17.9205L11.1423 17.9188ZM16.8574 9.99983C16.8574 6.21282 13.7874 3.14283 10.0004 3.14283C9.88547 3.14283 9.77117 3.14566 9.6576 3.15125C7.76505 4.82631 6.57193 7.27373 6.57193 9.99983C6.57193 12.7259 7.76505 15.1734 9.65759 16.8484C9.77117 16.854 9.88547 16.8568 10.0004 16.8568C13.7874 16.8568 16.8574 13.7868 16.8574 9.99983Z" fill="#4492CB" />
    </svg>
  );
}

// Source-data-verifiable: every entered field type (including coded dictionary
// fields) except file uploads, calculated (derived) values, and free-text areas.
function isSdvEligible(field: FormFieldRow): boolean {
  return !["file", "calculated", "textarea"].includes(field.field_type);
}

export function SubjectRecord({ studyId, subjectId, initialFormId }: Props) {
  const router = useRouter();
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(initialFormId);
  // null = not yet initialised → default to "all groups collapsed except the active one".
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string> | null>(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [modeQueries, setModeQueries] = useState(false); // remarks default OFF
  const [modeSdv, setModeSdv] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null); // field currently being typed (no Δ until blur)
  const [panelField, setPanelField] = useState<FormFieldRow | null>(null); // query/edit-check panel target field
  const [panelKind, setPanelKind] = useState<"query" | "edit_check">("query");
  const [reply, setReply] = useState(""); // query-thread compose box
  const [deltaField, setDeltaField] = useState<FormFieldRow | null>(null);
  const [deltaReason, setDeltaReason] = useState(""); // change-reason compose box
  const [lockModalOpen, setLockModalOpen] = useState(false); // e-signature modal
  const [lockPassword, setLockPassword] = useState("");
  const [lookupField, setLookupField] = useState<FormFieldRow | null>(null); // VeDDRA lookup panel target
  const [lookupSearch, setLookupSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false); // Manage dropdown
  const [overrideOpen, setOverrideOpen] = useState(false); // PI override modal
  const [overrideReason, setOverrideReason] = useState("");

  const canSdv = activeRole === "CRA";
  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");
  const canRaise = canQuery(activeRole, "raise");
  const canCode = activeRole === "DM"; // dictionary coding is a DM task

  if (!ready) {
    return (
      <div className="sr-screen">
        <div className="sr-loading"><i className="ti ti-loader-2"></i><span>Loading subject record…</span></div>
      </div>
    );
  }

  const subject = dataset.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    return (
      <div className="sr-screen">
        <div className="sr-loading"><span>Subject not found in this session.</span></div>
      </div>
    );
  }
  const species = subject.species ?? "";

  // ─── Full-path breadcrumb (Data Entry → site → barn/stable → pen/stall → subject) ─
  const bcSite = subject.site_id ? dataset.sites.find((s) => s.id === subject.site_id) : undefined;
  const bcBarn = subject.barn_id ? dataset.barns.find((b) => b.id === subject.barn_id) : undefined;
  const bcPen = subject.pen_id ? dataset.pens.find((p) => p.id === subject.pen_id) : undefined;
  const bcSegments = [bcSite?.name, bcBarn?.name, bcPen?.name].filter(Boolean) as string[];

  // Pen / Lot options for livestock_group studies (the field is a select sourced
  // from the study's seeded pens; other study types keep it as plain text).
  const studyRow = dataset.studies.find((s) => s.id === studyId);
  const isLivestockGroup = studyRow?.type === "livestock_group";
  const studySiteIds = new Set(dataset.sites.filter((s) => s.study_id === studyId).map((s) => s.id));
  const studyBarnIds = new Set(dataset.barns.filter((b) => studySiteIds.has(b.site_id)).map((b) => b.id));
  const penOptions = dataset.pens.filter((p) => studyBarnIds.has(p.barn_id)).map((p) => p.name);

  // ─── Sidebar forms — grouped tree (store-derived) ──────────────────────────
  const studyForms = dataset.forms.filter((f) => f.study_id === studyId).slice().sort((a, b) => a.sequence - b.sequence);
  const groupIds = new Set(studyForms.map((f) => f.parent_form_id).filter(Boolean) as string[]);

  // A single leaf (sub-form or standalone form): its status icon + open-query count.
  function leafItem(f: { id: string; name: string }) {
    const inst = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === f.id);
    const openQ = inst ? dataset.queries.filter((q) => q.form_instance_id === inst.id && (q.status === "open" || q.status === "responded")) : [];
    const icon: SidebarIcon = openQ.length ? "queried" : iconForInstance(inst?.status);
    return { id: f.id, name: f.name, icon, queryCount: openQ.length, status: inst?.status ?? "empty" };
  }

  type LeafItem = ReturnType<typeof leafItem>;
  interface SidebarNode { id: string; name: string; isGroup: boolean; icon: SidebarIcon; queryCount: number; status: string; children: LeafItem[] }

  // Top-level = groups + standalone forms (those without a parent), in order.
  const sidebarTree: SidebarNode[] = studyForms
    .filter((f) => !f.parent_form_id)
    .map((f) => {
      if (groupIds.has(f.id)) {
        const children = studyForms.filter((c) => c.parent_form_id === f.id).map(leafItem);
        // Group status = worst (lowest-ranked) child status; badge = total open queries.
        const worst = children.reduce<SidebarIcon>(
          (acc, c) => (ICON_RANK[c.icon] < ICON_RANK[acc] ? c.icon : acc),
          "final",
        );
        const queryCount = children.reduce((a, c) => a + c.queryCount, 0);
        return { id: f.id, name: f.name, isGroup: true, icon: worst, queryCount, status: "", children };
      }
      const leaf = leafItem(f);
      return { id: f.id, name: f.name, isGroup: false, icon: leaf.icon, queryCount: leaf.queryCount, status: leaf.status, children: [] };
    });

  // Flat ordered list of selectable leaves (children + standalones) for defaulting.
  const orderedLeaves: LeafItem[] = sidebarTree.flatMap((n) => (n.isGroup ? n.children : [{ id: n.id, name: n.name, icon: n.icon, queryCount: n.queryCount, status: n.status }]));

  const activeFormId = selectedFormId ?? orderedLeaves[0]?.id;
  const selectedForm = studyForms.find((f) => f.id === activeFormId);
  const activeParentId = selectedForm?.parent_form_id ?? null; // group containing the active child

  // Default: every group collapsed except the one holding the active form (the
  // record opens on the first sub-form, so Animal Information is open on load).
  const defaultCollapsed = new Set(Array.from(groupIds).filter((id) => id !== activeParentId));
  const collapsedSet = collapsedGroups ?? defaultCollapsed;

  function StatusGlyph({ icon, title }: { icon: SidebarIcon; title?: string }) {
    let inner: JSX.Element;
    if (icon === "final") inner = <div className="status-final"><i className="ti ti-check"></i></div>;
    else if (icon === "inwork") inner = <InWorkIcon />;
    else if (icon === "inreview") inner = <InReviewIcon />;
    else inner = <div className={`status-${icon}`}></div>;
    return <span className="status-glyph" title={title}>{inner}</span>;
  }
  function toggleGroup(id: string) {
    const next = new Set(collapsedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsedGroups(next);
  }
  function renderLeaf(item: LeafItem) {
    return (
      <button
        key={item.id}
        className={`form-item${item.id === activeFormId ? " active" : ""}${item.icon === "final" ? " done" : ""}`}
        onClick={() => setSelectedFormId(item.id)}
        type="button"
      >
        <span className="form-item-label">{item.name}</span>
        <div className="form-item-right">
          {item.queryCount > 0 && <span className="issue-badge warning">{item.queryCount}</span>}
          <StatusGlyph icon={item.icon} title={item.icon === "queried" ? "Open query" : STATUS_LABEL[item.status] ?? ICON_LABEL[item.icon]} />
        </div>
      </button>
    );
  }
  const fields = dataset.formFields.filter((f) => f.form_id === activeFormId).slice().sort((a, b) => a.sequence - b.sequence);
  const instance = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === activeFormId);

  const fvFor = (fieldId: string) =>
    instance ? dataset.fieldValues.find((v) => v.form_instance_id === instance.id && v.form_field_id === fieldId) : undefined;
  // Any *query* on the field (manual or converted-from-edit-check): open/responded
  // preferred, else the latest resolved (so a resolved query keeps a green flag).
  const fieldQueryFor = (fvId: string | undefined) => {
    if (!fvId) return undefined;
    const qs = dataset.queries.filter((q) => q.field_value_id === fvId);
    const live = qs.find((q) => q.status === "open" || q.status === "responded");
    if (live) return live;
    const resolved = qs.filter((q) => q.status === "resolved");
    return resolved.length ? resolved[resolved.length - 1] : undefined;
  };
  // The open *edit check* (auto validation alert) on a field, if any.
  const editCheckFor = (fvId: string | undefined) =>
    fvId ? dataset.editChecks.find((e) => e.field_value_id === fvId && e.status === "open") : undefined;
  const sdvRecordFor = (fvId: string | undefined) =>
    fvId ? dataset.sdvRecords.find((r) => r.field_value_id === fvId && r.status === "verified") : undefined;
  const sdvVerified = (fvId: string | undefined) => !!sdvRecordFor(fvId);

  // Δ change-reason state. Baseline lives in the store (persists across navigation);
  // the value is "settled" except while the field is actively focused.
  // A submitted reason keeps the Δ visible (blue=responded → green=approved); it
  // only disappears if the value matches baseline with no reason on record.
  // null (no change) | pending | responded | approved.
  function deltaStateFor(fieldId: string, fvId: string | undefined): "pending" | "responded" | "approved" | null {
    if (editingFieldId === fieldId) return null; // actively typing → not settled
    const cur = fvFor(fieldId)?.value ?? "";
    // A reason already submitted for the current value → stay blue (or green) — does
    // not vanish after submit, even though baseline now equals the value.
    const recs = fvId ? dataset.deltaRecords.filter((r) => r.field_value_id === fvId && r.new_value === cur) : [];
    if (recs.length) return recs[recs.length - 1].status === "approved" ? "approved" : "responded";
    const oldVal = fvId ? dataset.fieldBaselines[fvId] : undefined;
    if (oldVal === undefined || oldVal === "" || cur === oldVal) return null;
    return "pending"; // changed from baseline, no reason yet
  }

  const sdvFieldIds = fields.filter(isSdvEligible).map((f) => f.id);
  const verifiedCount = sdvFieldIds.filter((id) => sdvVerified(fvFor(id)?.id)).length;
  const sdvPct = sdvFieldIds.length ? Math.round((verifiedCount / sdvFieldIds.length) * 100) : 0;

  // ─── Form status (empty → in_work → in_review → reviewed → finalized → locked) ─
  const currentStatus = instance?.status ?? "empty";
  const locked = currentStatus === "locked";
  const flow = STATUS_FLOW[currentStatus];
  const canAdvance = !!flow && flow.roles.includes(activeRole);

  // ─── Inclusion / Exclusion — a criterion answered "No" fails ────────────────
  const isIEForm = fields.some((f) => f.validation?.exclusion_criterion);

  // ─── Calculated fields ──────────────────────────────────────────────────────
  function numValFor(formId: string, fieldCode: string): number | undefined {
    const f = dataset.formFields.find((x) => x.form_id === formId && x.code === fieldCode);
    if (!f) return undefined;
    const inst = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId);
    if (!inst) return undefined;
    const v = dataset.fieldValues.find((x) => x.form_instance_id === inst.id && x.form_field_id === f.id)?.value;
    const n = Number(v);
    return v != null && v !== "" && !Number.isNaN(n) ? n : undefined;
  }
  function calcValue(field: FormFieldRow): string {
    if (field.code.includes("age")) {
      const dobField = fields.find((f) => f.code === "dob" || f.code === "date_of_birth");
      const dob = dobField ? fvFor(dobField.id)?.value : undefined;
      if (!dob) return "—";
      const d = new Date(dob);
      if (Number.isNaN(d.getTime())) return "—";
      const now = new Date();
      let age = now.getFullYear() - d.getFullYear();
      const m = now.getMonth() - d.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
      return age >= 0 ? `${age} years` : "—";
    }
    if (field.code.includes("fec_reduction")) {
      const screeningPE = studyForms.find((f) => f.code === "F0201");
      const baseline = screeningPE ? numValFor(screeningPE.id, "fec_epg") : undefined;
      const siblingPE = activeParentId ? studyForms.find((f) => f.parent_form_id === activeParentId && f.code.endsWith("01")) : undefined;
      const current = siblingPE ? numValFor(siblingPE.id, "fec_epg") : undefined;
      if (baseline == null || current == null || baseline === 0) return "—";
      return `${Math.round(((baseline - current) / baseline) * 100)}%`;
    }
    return "—";
  }

  // ─── Multiselect value (stored as a JSON array string) ──────────────────────
  function parseMulti(v: string): string[] {
    try {
      const a = JSON.parse(v || "[]");
      return Array.isArray(a) ? (a as string[]) : [];
    } catch {
      return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
    }
  }
  function toggleMulti(field: FormFieldRow, opt: string, value: string) {
    const cur = parseMulti(value);
    const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
    setFieldValue(field, JSON.stringify(next));
  }

  // ─── Write actions (all via update() — session only) ───────────────────────
  function setFieldValue(field: FormFieldRow, value: string) {
    if (locked) return; // locked forms are read-only
    update((d: Dataset) => {
      let inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === field.form_id);
      if (!inst) {
        inst = { id: newId(), form_id: field.form_id, subject_id: subjectId, status: "in_work" };
        d.formInstances.push(inst);
      } else if (inst.status === "empty") {
        inst.status = "in_work";
      }
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === field.id);
      const prev = fv?.value ?? "";
      if (!fv) {
        fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value };
        d.fieldValues.push(fv);
      } else {
        fv.value = value;
      }
      // Persist the Δ baseline once per field value (a loaded value is the baseline,
      // any edit is a change; an empty field commits its first entry as baseline).
      if (!(fv.id in d.fieldBaselines)) d.fieldBaselines[fv.id] = prev !== "" ? prev : value;

      // Live EDIT CHECK (not a query): out of range → raise/keep an open edit check;
      // back in range → resolve it. (Converting to a query is a separate user action.)
      const check = evaluateField(field, value, species, d.speciesRanges);
      const ec = d.editChecks.find((e) => e.field_value_id === fv!.id && e.status === "open");
      const hasConvertedQ = d.queries.some((q) => q.field_value_id === fv!.id && (q.status === "open" || q.status === "responded"));
      if (check) {
        if (!ec && !hasConvertedQ) {
          d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() });
        } else if (ec) {
          ec.message = check.message;
        }
      } else if (ec) {
        ec.status = "resolved"; // value corrected
      }
      // Inclusion/Exclusion: recompute eligibility from all criterion fields in
      // this form — any "No" flags the subject ineligible (PI review).
      if (field.validation?.exclusion_criterion) {
        const critF = d.formFields.filter((x) => x.form_id === field.form_id && x.validation?.exclusion_criterion);
        const fail = critF.some((cf) => {
          const cv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === cf.id);
          return cv?.value === "No";
        });
        const subj = d.subjects.find((s) => s.id === subjectId);
        if (subj) subj.ineligible = fail;
      }
    });
  }

  // ─── Change reason (Δ) ──────────────────────────────────────────────────────
  function submitDeltaReason() {
    if (!deltaField || !deltaReason.trim()) return;
    const fv = fvFor(deltaField.id);
    if (!fv) return;
    const newVal = fv.value ?? "";
    update((d: Dataset) => {
      d.deltaRecords.push({
        id: newId(),
        field_value_id: fv.id,
        old_value: d.fieldBaselines[fv.id] ?? "",
        new_value: newVal,
        reason: deltaReason.trim(),
        author_name: DEMO_USER.fullName,
        author_role: activeRole,
        created_at: new Date().toISOString(),
        status: "responded",
      });
      // The new value becomes the saved baseline — a later change needs a new reason
      // (Yes → No → Yes each requires justification).
      d.fieldBaselines[fv.id] = newVal;
    });
    setDeltaReason("");
    setDeltaField(null);
  }
  function approveDelta(recordId: string) {
    if (activeRole !== "DM") return;
    update((d: Dataset) => {
      const r = d.deltaRecords.find((x) => x.id === recordId);
      if (r) r.status = "approved";
    });
  }

  // ─── Form status transitions (persist via update()) ─────────────────────────
  function advanceStatus() {
    if (!flow || !canAdvance) return;
    if (flow.esign) {
      setLockModalOpen(true); // Lock requires e-signature confirmation
      return;
    }
    const next = flow.next;
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === activeFormId);
      if (inst) inst.status = next;
    });
  }
  function confirmLock() {
    if (!lockPassword.trim()) return; // e-signature required
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === activeFormId);
      if (inst) inst.status = "locked";
    });
    setLockPassword("");
    setLockModalOpen(false);
  }

  function toggleSdv(field: FormFieldRow) {
    if (!canSdv || locked) return;
    const fv = fvFor(field.id);
    if (!fv) return; // nothing entered to verify
    update((d: Dataset) => {
      const rec = d.sdvRecords.find((r) => r.field_value_id === fv.id);
      if (rec) {
        const nowVerified = rec.status !== "verified";
        rec.status = nowVerified ? "verified" : "pending";
        rec.verified_by_name = nowVerified ? DEMO_USER.fullName : null;
        rec.verified_at = nowVerified ? todayISO() : null;
      } else {
        d.sdvRecords.push({
          id: newId(),
          form_instance_id: fv.form_instance_id,
          field_value_id: fv.id,
          status: "verified",
          verified_by_name: DEMO_USER.fullName,
          verified_at: todayISO(),
        });
      }
    });
  }
  // Bulk-verify every entered, SDV-eligible field on the active form (CRA).
  function verifyAll() {
    if (!canSdv || locked) return;
    update((d: Dataset) => {
      for (const f of fields.filter(isSdvEligible)) {
        const inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === f.form_id);
        const fv = inst ? d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === f.id) : undefined;
        if (!fv || (fv.value ?? "") === "") continue;
        const rec = d.sdvRecords.find((r) => r.field_value_id === fv.id);
        if (rec) { rec.status = "verified"; rec.verified_by_name = DEMO_USER.fullName; rec.verified_at = todayISO(); }
        else d.sdvRecords.push({ id: newId(), form_instance_id: fv.form_instance_id, field_value_id: fv.id, status: "verified", verified_by_name: DEMO_USER.fullName, verified_at: todayISO() });
      }
    });
  }

  function pushMsg(d: Dataset, queryId: string, body: string) {
    d.queryMessages.push({
      id: newId(), query_id: queryId, author_id: DEMO_USER_ID,
      author_name: DEMO_USER.fullName, author_role: activeRole, body,
      created_at: new Date().toISOString(),
    });
  }
  function respondQuery(queryId: string) {
    const body = reply.trim() || `Response acknowledged by ${activeRole}.`;
    update((d: Dataset) => {
      const q = d.queries.find((x) => x.id === queryId);
      if (!q) return;
      q.status = "responded"; // raised → responded
      pushMsg(d, queryId, body);
    });
    setReply("");
  }
  function resolveQuery(queryId: string) {
    const body = reply.trim();
    update((d: Dataset) => {
      const q = d.queries.find((x) => x.id === queryId);
      if (!q) return;
      if (body) pushMsg(d, queryId, body);
      q.status = "resolved";
    });
    setReply("");
    setPanelField(null);
  }
  // Raise a new (manual) query against a field — CRA / DM. Creates the field value
  // if the field hasn't been entered yet.
  function raiseQuery(field: FormFieldRow) {
    if (!canRaise) return;
    const body = reply.trim() || `Manual query raised by ${activeRole}.`;
    update((d: Dataset) => {
      let inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === field.form_id);
      if (!inst) { inst = { id: newId(), form_id: field.form_id, subject_id: subjectId, status: "in_work" }; d.formInstances.push(inst); }
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === field.id);
      if (!fv) { fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value: "" }; d.fieldValues.push(fv); }
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: body, from_edit_check: false });
      pushMsg(d, qid, body);
    });
    setReply("");
  }
  // Convert an edit check to a formal query — the user has explained the anomaly.
  function convertEditCheck(field: FormFieldRow) {
    const explanation = reply.trim();
    if (!explanation) return;
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === field.form_id);
      if (!inst) return;
      const fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id);
      if (!fv) return;
      const ec = d.editChecks.find((e) => e.field_value_id === fv.id && e.status === "open");
      if (!ec) return;
      ec.status = "converted";
      const qid = newId();
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: ec.message, from_edit_check: true });
      d.queryMessages.push({ id: newId(), query_id: qid, author_id: DEMO_USER_ID, body: `Auto edit-check: ${ec.message}`, created_at: ec.created_at });
      pushMsg(d, qid, explanation);
    });
    setReply("");
    setPanelKind("query"); // it is now a formal query
  }

  // PI override — clears an inclusion/exclusion ineligibility back to Active, with
  // a documented reason (stored on the subject).
  function confirmOverride() {
    if (activeRole !== "PI" || !overrideReason.trim()) return;
    update((d: Dataset) => {
      const subj = d.subjects.find((s) => s.id === subjectId);
      if (subj) {
        subj.ineligible = false;
        subj.override_reason = overrideReason.trim();
        subj.override_by = DEMO_USER.fullName;
        subj.override_at = todayISO();
      }
    });
    setOverrideReason("");
    setOverrideOpen(false);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const statusInfo = STATUS_MAP[subject.status] || { cls: "status-screened", label: subject.status };
  const panelFv = panelField ? fvFor(panelField.id) : undefined;
  const panelQuery = fieldQueryFor(panelFv?.id);
  const panelEC = editCheckFor(panelFv?.id);
  const isECPanel = panelKind === "edit_check" && !!panelEC; // edit-check panel (not yet converted)
  const panelResolved = panelQuery?.status === "resolved";
  const panelMsgs = panelQuery ? dataset.queryMessages.filter((m) => m.query_id === panelQuery.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : [];

  const formHasData = fields.some((f) => (fvFor(f.id)?.value ?? "") !== "");
  // Submit for Review is blocked by unresolved edit checks, pending change reasons,
  // or empty required fields — but NOT by open manual queries (those don't block).
  const hasOpenEditCheck = fields.some((f) => !!editCheckFor(fvFor(f.id)?.id));
  const hasPendingDelta = fields.some((f) => deltaStateFor(f.id, fvFor(f.id)?.id) === "pending");
  const hasEmptyRequired = fields.some((f) => f.is_required && (fvFor(f.id)?.value ?? "") === "");
  const submitBlocked = hasOpenEditCheck || hasPendingDelta || hasEmptyRequired;
  const submitBlockReason = hasEmptyRequired ? "Complete all required fields first" : hasOpenEditCheck ? "Resolve all edit checks first" : hasPendingDelta ? "Provide all change reasons first" : undefined;

  // Δ change-reason panel
  const deltaFv = deltaField ? fvFor(deltaField.id) : undefined;
  const deltaOld = deltaFv ? (dataset.fieldBaselines[deltaFv.id] ?? "") : "";
  const deltaNew = deltaFv?.value ?? "";
  const deltaHistory = deltaFv
    ? dataset.deltaRecords.filter((r) => r.field_value_id === deltaFv.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    : [];
  const deltaCurState = deltaField ? deltaStateFor(deltaField.id, deltaFv?.id) : null;

  function renderControl(field: FormFieldRow, value: string, queried: boolean) {
    // Discrete controls write directly (settle on change). Text inputs also write on
    // change but suppress Δ until blur via editingFieldId (onFocus/onBlur).
    const commit = (v: string) => setFieldValue(field, v);
    const typeChange = (v: string) => setFieldValue(field, v);
    const onFocus = () => setEditingFieldId(field.id);
    const onBlur = () => setEditingFieldId(null);
    const ro = locked;
    const type = field.field_type;
    const isCoded = !!field.validation?.coded;

    // Pen / Lot ID — a select sourced from the study's pens (livestock_group only).
    if (field.code === "pen_lot_id" && isLivestockGroup) {
      return (
        <select className={`field-select${queried ? " query" : ""}`} value={value} disabled={ro} onChange={(e) => commit(e.target.value)}>
          <option value="">—</option>
          {penOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    // calculated — read-only computed value
    if (type === "calculated") {
      return (
        <div className="field-calc">
          <span>{calcValue(field)}</span>
          <span className="field-calc-tag">auto</span>
        </div>
      );
    }
    // textarea
    if (type === "textarea") {
      return <textarea className="field-input" style={{ height: 60, fontFamily: "var(--font-sans)" }} value={value} disabled={ro} onChange={(e) => typeChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} />;
    }
    // yes/no radio → two-button toggle
    if (type === "radio") {
      const opts = field.options?.length ? field.options : ["Yes", "No"];
      return (
        <div className={`yn-toggle${queried ? " query" : ""}`} role="group">
          {opts.map((o) => (
            <button key={o} type="button" disabled={ro} className={`yn-btn${value === o ? " active" : ""}`} onClick={() => commit(value === o ? "" : o)}>
              {o}
            </button>
          ))}
        </div>
      );
    }
    // multiselect / checkbox → checkbox group
    if (type === "multiselect" || type === "checkbox") {
      const sel = parseMulti(value);
      return (
        <div className={`check-group${queried ? " query" : ""}`}>
          {(field.options ?? []).map((o) => (
            <label key={o} className="check-item">
              <input type="checkbox" checked={sel.includes(o)} disabled={ro} onChange={() => toggleMulti(field, o, value)} />
              <span>{o}</span>
            </label>
          ))}
        </div>
      );
    }
    // select dropdown
    if (type === "select") {
      return (
        <select className={`field-select${queried ? " query" : ""}`} value={value} disabled={ro} onChange={(e) => commit(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    // file upload (stub — stores the filename)
    if (type === "file") {
      return value ? (
        <div className="file-field">
          <span className="file-name"><i className="ti ti-file"></i> {value}</span>
          {!ro && <button type="button" className="file-clear" title="Remove" onClick={() => commit("")}><i className="ti ti-x"></i></button>}
        </div>
      ) : (
        <label className={`file-btn${ro ? " disabled" : ""}`}>
          <i className="ti ti-upload"></i> Choose file
          <input type="file" hidden disabled={ro} onChange={(e) => { const f = e.target.files?.[0]; if (f) commit(f.name); }} />
        </label>
      );
    }
    // coded text → input + Look up (opens the VeDDRA lookup panel)
    if (isCoded) {
      return (
        <div className="coded-field">
          <input className={`field-input${queried ? " query" : ""}`} style={{ fontFamily: "var(--font-sans)" }} value={value} disabled={ro} onChange={(e) => typeChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
          <button
            type="button"
            className="lookup-btn"
            disabled={ro}
            title="Look up coded term (VeDDRA)"
            onClick={() => { setLookupSearch(""); setLookupField(field); }}
          >
            <i className="ti ti-search"></i> Look up
          </button>
        </div>
      );
    }
    // date / datetime — native picker (opens on click via showPicker)
    if (type === "date" || type === "datetime") {
      return (
        <input
          type={type === "datetime" ? "datetime-local" : "date"}
          className={`field-input field-date${queried ? " query" : ""}`}
          value={value}
          disabled={ro}
          onChange={(e) => commit(e.target.value)}
          onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* not supported */ } }}
        />
      );
    }
    // number / integer / text — settle on blur
    const mono = type === "number" || type === "integer";
    return (
      <input
        className={`field-input${queried ? " query" : ""}`}
        inputMode={mono ? "decimal" : undefined}
        style={mono ? undefined : { fontFamily: "var(--font-sans)" }}
        value={value}
        disabled={ro}
        onChange={(e) => typeChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  }

  return (
    <div className="sr-screen">
      {/* Form sidebar */}
      <nav className="form-sidebar" aria-label="Forms">
        <div className="sidebar-label">Forms</div>
        {sidebarTree.map((node) => {
          if (!node.isGroup) {
            return renderLeaf({ id: node.id, name: node.name, icon: node.icon, queryCount: node.queryCount, status: node.status });
          }
          const collapsed = collapsedSet.has(node.id);
          return (
            <div className="form-group" key={node.id}>
              <button
                className={`form-group-header${node.id === activeParentId ? " active-parent" : ""}`}
                onClick={() => toggleGroup(node.id)}
                aria-expanded={!collapsed}
                type="button"
              >
                <i className={`ti ti-chevron-${collapsed ? "right" : "down"} form-group-caret`} aria-hidden="true"></i>
                <span className="form-group-label">{node.name}</span>
                <div className="form-item-right">
                  {node.queryCount > 0 && <span className="issue-badge warning">{node.queryCount}</span>}
                  <StatusGlyph icon={node.icon} title={ICON_LABEL[node.icon]} />
                </div>
              </button>
              {!collapsed && <div className="form-group-children">{node.children.map(renderLeaf)}</div>}
            </div>
          );
        })}
      </nav>

      {/* Form content */}
      <div className="form-content">
        <div className="form-sticky-header">
          <nav className="sr-bc" aria-label="Breadcrumb">
            <button className="bc-btn" onClick={() => router.push(`/study/${studyId}/data-entry`)} type="button"><span>Data Entry</span></button>
            {bcSegments.map((seg) => (
              <Fragment key={seg}>
                <span className="bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
                <span className="bc-btn"><span>{seg}</span></span>
              </Fragment>
            ))}
            <span className="bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
            <span>{subject.subject_code}</span>
          </nav>

          <div className="subject-header">
            <div className="species-icon">{SPECIES_ICON[species] || "🔬"}</div>
            <span className="subject-id">{subject.subject_code}</span>
            {/* One status chip at a time — Ineligible replaces the normal status */}
            {subject.ineligible ? (
              <span className="subject-ineligible"><i className="ti ti-alert-triangle"></i> Ineligible — PI review</span>
            ) : (
              <span className={`subject-status ${statusInfo.cls}`}>{statusInfo.label}</span>
            )}
            {subject.ineligible && activeRole === "PI" && (
              <button className="btn-secondary" onClick={() => { setOverrideReason(""); setOverrideOpen(true); }} type="button">
                <i className="ti ti-shield-check" style={{ fontSize: "12px" }}></i> Override
              </button>
            )}
            <div className="subject-meta">
              <span className="meta-item">{species.charAt(0).toUpperCase() + species.slice(1)}</span>
              {subject.randomization_arm && (
                <>
                  <span className="meta-sep">·</span>
                  <span className="meta-item group">{subject.randomization_arm}</span>
                </>
              )}
            </div>
            <div className="subject-actions">
              <div className="manage-wrap">
                <button className="btn-secondary" onClick={() => setManageOpen((o) => !o)} type="button">
                  Manage <i className="ti ti-chevron-down" style={{ fontSize: "12px" }}></i>
                </button>
                {manageOpen && <div className="manage-backdrop" onClick={() => setManageOpen(false)} />}
                <div className={`manage-menu${manageOpen ? " open" : ""}`} role="menu">
                  <button className="manage-item" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-link"></i> Copy link</button>
                  <button className="manage-item" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-calendar-plus"></i> Add unscheduled visit</button>
                  <button className="manage-item" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-printer"></i> Print subject summary</button>
                  <button className="manage-item" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-download"></i> Export subject data</button>
                  <div className="manage-sep"></div>
                  <button className="manage-item" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-lock"></i> Lock record</button>
                  <button className="manage-item" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-signature"></i> Sign off record</button>
                  <div className="manage-sep"></div>
                  <button className="manage-item danger" type="button" onClick={() => setManageOpen(false)}><i className="ti ti-user-x"></i> Withdraw subject</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`sdv-progress-row${modeSdv ? " visible" : ""}`}>
            <i className="ti ti-shield-check-filled" style={{ fontSize: "14px", flexShrink: 0 }}></i>
            <span>SDV mode active</span>
            <div className="sdv-progress-bar"><div className="sdv-progress-fill" style={{ width: `${sdvPct}%` }}></div></div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-medium)" }}>{verifiedCount}/{sdvFieldIds.length} verified</span>
          </div>

          <div className="form-header">
            <h1 className="form-title">{selectedForm?.name || "Form"}</h1>
            <div className="form-actions">
              <div className="remarks-wrap">
                <button className="btn-secondary" onClick={() => setRemarksOpen((o) => !o)} type="button">
                  Remarks: {[modeQueries && "Queries", modeSdv && "SDV mode"].filter(Boolean).join(", ") || "Off"}
                  <i className="ti ti-chevron-down" style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}></i>
                </button>
                {remarksOpen && <div className="remarks-backdrop" onClick={() => setRemarksOpen(false)} />}
                <div className={`remarks-menu${remarksOpen ? " open" : ""}`}>
                  <div className="remarks-section-label">Activate mode</div>
                  <button className={`remarks-item${modeQueries ? " active-mode" : ""}`} onClick={() => setModeQueries((m) => !m)} type="button">
                    <span>Queries</span>{modeQueries && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                  </button>
                  <button className={`remarks-item${modeSdv ? " active-mode" : ""}`} onClick={() => setModeSdv((m) => !m)} type="button">
                    <span>SDV mode</span>{modeSdv && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                  </button>
                </div>
              </div>

              {/* SDV toolbar — only in SDV mode */}
              {modeSdv && (
                <>
                  <button className="btn-secondary" type="button" disabled={!canSdv} onClick={verifyAll} title={canSdv ? "Verify all entered fields" : "SDV verify — CRA only"}>
                    Verify all
                  </button>
                  <button className="btn-primary" type="button" title="Mark source-data verification complete for this form">
                    Mark SDV complete
                  </button>
                </>
              )}

              {/* Status advance — hidden in SDV mode (the SDV buttons take its place).
                  Submit for Review is otherwise always present (disabled when empty). */}
              {modeSdv ? null : currentStatus === "empty" || currentStatus === "in_work" ? (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={currentStatus === "empty" || !formHasData || submitBlocked || !STATUS_FLOW.in_work.roles.includes(activeRole)}
                  onClick={advanceStatus}
                  title={
                    currentStatus === "empty" || !formHasData
                      ? "Enter data before submitting for review"
                      : submitBlockReason
                      ?? (STATUS_FLOW.in_work.roles.includes(activeRole) ? undefined : `Submit for Review — not permitted for ${activeRole}`)
                  }
                >
                  Submit for Review
                </button>
              ) : flow ? (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={!canAdvance}
                  onClick={advanceStatus}
                  title={canAdvance ? undefined : `${flow.label} — not permitted for ${activeRole}`}
                >
                  {flow.esign && <i className="ti ti-lock"></i>}
                  {flow.label}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* Form body — real fields from form_fields */}
        <div className="form-body">
          {isIEForm && subject.ineligible && (
            <div className="ie-banner" role="alert">
              <i className="ti ti-alert-triangle"></i>
              Subject does not meet inclusion criteria — PI review required
            </div>
          )}
          {isIEForm && !subject.ineligible && subject.override_reason && (
            <div className="ie-banner override" role="status">
              <i className="ti ti-shield-check"></i>
              Eligibility override — PI {subject.override_by ?? "—"} documented a reason for override on {subject.override_at ?? "—"}. This subject was initially flagged as ineligible.
            </div>
          )}
          <div className="field-grid-2">
            {fields.map((field) => {
              const fv = fvFor(field.id);
              const value = fv?.value ?? "";
              const ec = editCheckFor(fv?.id); // open auto edit-check (orange alert)
              const dispQ = fieldQueryFor(fv?.id); // any query: open | responded | resolved
              const raised = dispQ?.status === "open"; // an open query tints the field amber (edit checks use the orange indicator)
              const sdvRec = sdvRecordFor(fv?.id);
              const verified = !!sdvRec;
              const dState = deltaStateFor(field.id, fv?.id);
              const showInteractiveSdv = isSdvEligible(field) && !locked && modeSdv;
              const showStaticSdv = isSdvEligible(field) && verified && !showInteractiveSdv;
              const numeric = field.field_type === "number" || field.field_type === "integer";
              const hint = rangeLabel(field, species, dataset.speciesRanges) ?? (numeric && field.unit ? field.unit : null);
              const isWide = field.field_type === "textarea" || field.field_type === "multiselect";
              const deltaTitle = dState === "approved" ? "Change approved by DM" : dState === "responded" ? "Change reason submitted — awaiting DM review" : "Change reason required";
              return (
                <div className={`field${isWide ? " full" : ""}${locked ? " state-locked" : ""}`} key={field.id}>
                  <label className="field-label">
                    {field.label}
                    {field.is_required && <span className="field-req"> *</span>}
                  </label>
                  <div className="field-row">
                    {renderControl(field, value, raised)}
                    {showInteractiveSdv && (
                      <button
                        className={`sdv-btn visible${verified ? " verified" : ""}`}
                        onClick={() => toggleSdv(field)}
                        title={canSdv ? (verified ? "SDV verified — click to undo" : "SDV: click to verify") : "SDV verify — CRA only"}
                        type="button"
                      >
                        <i className={`ti ${verified ? "ti-shield-check-filled" : "ti-shield"}`}></i>
                      </button>
                    )}
                    {showStaticSdv && (
                      <span className="sdv-static" title="SDV verified"><i className="ti ti-shield-check-filled"></i></span>
                    )}
                    {!locked && dState && (
                      <button className={`delta-btn ${dState}`} onClick={() => setDeltaField(field)} title={deltaTitle} type="button">
                        Δ
                      </button>
                    )}
                    {/* Edit check indicator — orange alert-circle (auto validation alert). */}
                    {ec && (
                      <button
                        className="ec-btn"
                        onClick={() => { setPanelField(field); setPanelKind("edit_check"); }}
                        title="Edit check — out of range. Click to review."
                        type="button"
                      >
                        <i className="ti ti-alert-circle"></i>
                      </button>
                    )}
                    {/* Manual / converted query flag. Hollow flag (no query) only in Queries mode → Raise Query. */}
                    {!ec && (modeQueries || dispQ) && (
                      <button
                        className={`flag-btn${dispQ ? (dispQ.status === "resolved" ? " resolved" : " flagged") : ""}`}
                        onClick={() => { setPanelField(field); setPanelKind("query"); }}
                        title={dispQ ? (dispQ.status === "resolved" ? "Query resolved — click to view" : "Query — click to view") : "Raise a query"}
                        type="button"
                      >
                        <i className={`ti ${dispQ ? (dispQ.status === "resolved" ? "ti-flag-check" : "ti-flag-filled") : "ti-flag"}`}></i>
                      </button>
                    )}
                  </div>
                  {/* Inline state. Edit check: orange. Query: amber raised/responded, none when resolved. */}
                  {ec ? (
                    <div className="field-state state-editcheck">
                      <i className="ti ti-alert-circle"></i>
                      <span className="ec-link" onClick={() => { setPanelField(field); setPanelKind("edit_check"); }}>
                        [{ecCodeFor(ec.id)}] Value outside expected range
                      </span>
                    </div>
                  ) : dispQ && dispQ.status !== "resolved" ? (
                    <div className="field-state state-query">
                      <i className="ti ti-info-circle"></i>
                      <span className="query-link" onClick={() => { setPanelField(field); setPanelKind("query"); }}>
                        {dispQ.status === "open" ? `[${qCodeFor(dispQ.id)}] ${dispQ.title}` : `[${qCodeFor(dispQ.id)}] open — view thread`}
                      </span>
                    </div>
                  ) : (
                    hint && <span className="field-hint">{hint}</span>
                  )}
                  {modeSdv && verified && (
                    <span className="sdv-verified-note">
                      Verified by {sdvRec?.verified_by_name ?? DEMO_USER.fullName} · {sdvRec?.verified_at ?? todayISO()}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Edit-check / query / raise panel (Component 13, file 30) */}
      <div className={`panel-overlay${panelField ? " open" : ""}`} onClick={() => { setPanelField(null); setReply(""); }}></div>
      <div className={`slide-panel${panelField ? " open" : ""}`}>
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="panel-title">{isECPanel ? "Edit Check" : panelQuery ? "Query thread" : "Raise a query"}</div>
            {/* Only the ID chip — no status badge here (the status row carries it). */}
            <div className="panel-title-meta">
              {isECPanel && panelEC && <span className="query-id">{ecCodeFor(panelEC.id)}</span>}
              {!isECPanel && panelQuery && <span className="query-id">{qCodeFor(panelQuery.id)}</span>}
            </div>
          </div>
          <button className="panel-close" onClick={() => { setPanelField(null); setReply(""); }} type="button"><i className="ti ti-x"></i></button>
        </div>
        {isECPanel ? (
          <div className="status-bar">
            <span className="status-bar-label">Status</span>
            <span className="query-status qs-editcheck">Edit check</span>
            <span className="status-desc">Out of range — correct the value or explain it</span>
          </div>
        ) : panelQuery ? (
          <div className="status-bar">
            <span className="status-bar-label">Status</span>
            <span className={`query-status ${QS_CLS[panelQuery.status] || "qs-open"}`}>{STATUS_CAP(panelQuery.status)}</span>
            <span className="status-desc">
              {panelQuery.status === "open" ? "Awaiting response" : panelQuery.status === "responded" ? "Awaiting CRA review" : "Resolved — no further action"}
            </span>
          </div>
        ) : null}
        <div className="field-context">
          <div className="fc-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "4px" }}>
            <span className="fc-field">{panelField?.label}</span>
            <span className="fc-code">{(panelField?.code ?? "").toUpperCase()}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px", lineHeight: 1.6, color: "var(--color-text-primary)" }}>
            {panelFv?.value ? `${panelFv.value}${panelField?.unit ? ` ${panelField.unit}` : ""}` : "—"}
          </div>
        </div>
        <div className="thread-body">
          {isECPanel && panelEC ? (
            <div className="message">
              <div className="msg-header">
                <div className="msg-avatar av-auto">EC</div>
                <span className="msg-author">Edit check</span>
                <span className="msg-role">· Auto</span>
              </div>
              <div className="msg-bubble">{panelEC.message}</div>
            </div>
          ) : (
            panelMsgs.map((m) => {
              const isHuman = !!m.author_role;
              const name = m.author_name ?? "Edit check";
              const initials = isHuman ? name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase() : "EC";
              return (
                <div className="message" key={m.id}>
                  <div className="msg-header">
                    <div className={`msg-avatar${isHuman ? "" : " av-auto"}`}>{initials}</div>
                    <span className="msg-author">{name}</span>
                    <span className="msg-role">· {isHuman ? m.author_role : "Auto"}</span>
                  </div>
                  <div className="msg-bubble">{m.body}</div>
                </div>
              );
            })
          )}
          {!isECPanel && !panelQuery && <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No query has been raised on this field yet.</p>}
        </div>
        <div className="compose-area">
          {isECPanel ? (
            <>
              <div className="compose-context"><i className="ti ti-user-circle"></i> Explain this value, or correct it in the form to clear the check</div>
              <textarea className="compose-textarea" placeholder="Explain why this value is correct — this escalates to a formal query…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns">
                <span className="compose-sub">Converting raises a formal query</span>
                <button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panelField && convertEditCheck(panelField)}>Convert to query</button>
              </div>
            </>
          ) : panelResolved ? (
            canRaise ? (
              <>
                <div className="compose-context"><i className="ti ti-flag-check"></i> This query is resolved — raise a new query if a fresh issue remains (as {activeRole})</div>
                <textarea className="compose-textarea" placeholder="Describe a new issue with this value…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
                <div className="compose-btns">
                  <span className="compose-sub">Opens a new query</span>
                  <button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panelField && raiseQuery(panelField)}>Raise new query</button>
                </div>
              </>
            ) : (
              <div className="sr-perm-note"><i className="ti ti-flag-check"></i> This query is resolved — no further action.</div>
            )
          ) : !panelQuery ? (
            canRaise ? (
              <>
                <div className="compose-context"><i className="ti ti-user-circle"></i> Raising as {activeRole}</div>
                <textarea className="compose-textarea" placeholder="Describe the issue with this value…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
                <div className="compose-btns">
                  <span className="compose-sub">Shift+Enter for new line</span>
                  <button className="btn-respond" type="button" disabled={!reply.trim()} onClick={() => panelField && raiseQuery(panelField)}>Raise query</button>
                </div>
              </>
            ) : (
              <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) cannot raise queries.</div>
            )
          ) : canRespond || canResolve || activeRole === "CRA" ? (
            <>
              <div className="compose-context"><i className="ti ti-user-circle"></i> Acting as {activeRole}</div>
              <textarea className="compose-textarea" placeholder="Add a response…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns">
                <span className="compose-sub">Shift+Enter for new line</span>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {/* Respond — primary for CRC/PI, secondary when Resolve is also shown (CRA) */}
                  {(canRespond || activeRole === "CRA") && (
                    <button className={canResolve ? "btn-comment" : "btn-respond"} type="button" onClick={() => respondQuery(panelQuery.id)}>Respond</button>
                  )}
                  {canResolve && <button className="btn-respond" type="button" onClick={() => resolveQuery(panelQuery.id)}>Resolve</button>}
                  {activeRole === "DM" && <button className="btn-comment" type="button" onClick={() => resolveQuery(panelQuery.id)} title="DM query management (stub)">Manage</button>}
                </div>
              </div>
            </>
          ) : (
            <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>
          )}
        </div>
      </div>

      {/* Change-reason (Δ) panel — structure from file 30 */}
      <div className={`panel-overlay${deltaField ? " open" : ""}`} onClick={() => { setDeltaField(null); setDeltaReason(""); }}></div>
      <div className={`delta-panel${deltaField ? " open" : ""}`}>
        <div className="delta-panel-header">
          <span className="delta-panel-name">Change reason</span>
          <span className="delta-id">Δ-{(deltaField?.code ?? "").toUpperCase()}</span>
          <button className="panel-close-btn" onClick={() => { setDeltaField(null); setDeltaReason(""); }} type="button"><i className="ti ti-x"></i></button>
        </div>
        <div className="delta-status-bar">
          <span className={`delta-status-badge ${deltaCurState === "approved" ? "ds-approved" : deltaCurState === "responded" ? "ds-answered" : "ds-change-required"}`}>
            {deltaCurState === "approved" ? "Approved" : deltaCurState === "responded" ? "Answered" : "Change reason"}
          </span>
          <span className="delta-status-desc">
            {deltaCurState === "approved" ? "Approved by the data manager" : deltaCurState === "responded" ? "Awaiting DM review" : `${activeRole} must provide a reason for this change`}
          </span>
        </div>
        <div className="delta-context">
          <div className="delta-context-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <span className="delta-field-name">{deltaField?.label}</span>
            <span className="delta-field-code">{(deltaField?.code ?? "").toUpperCase()}</span>
          </div>
          <div className="delta-values">
            <span className="delta-old">{deltaOld || "—"}</span>
            <span className="delta-arrow">→</span>
            <span className="delta-new">{deltaNew || "—"}</span>
          </div>
        </div>
        <div className="delta-thread">
          {deltaHistory.length > 0 ? (
            deltaHistory.map((r) => (
              <div className="delta-entry" key={r.id}>
                <div className="delta-entry-reason">{r.reason}</div>
                <div className="delta-entry-meta">
                  <span>{r.author_name} · {r.author_role}</span>
                  <span className="delta-entry-ts">{r.created_at.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="delta-entry-foot">
                  <span className={`delta-status-badge ${r.status === "approved" ? "ds-approved" : "ds-answered"}`}>
                    {r.status === "approved" ? "DM approved" : "Awaiting DM review"}
                  </span>
                  {activeRole === "DM" && r.status !== "approved" && (
                    <button className="delta-approve" type="button" onClick={() => approveDelta(r.id)}>Approve</button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No prior change reason for this field.</p>
          )}
        </div>
        <div className="delta-compose">
          <div className="delta-compose-hint">Responding as {activeRole} · {DEMO_USER.fullName} — explain the reason for this change</div>
          <textarea className="delta-textarea" placeholder="Enter reason for change…" value={deltaReason} onChange={(e) => setDeltaReason(e.target.value)}></textarea>
          <div className="delta-compose-actions">
            <span className="delta-compose-sub">Shift+Enter for new line</span>
            <button className="delta-btn-submit" type="button" disabled={!deltaReason.trim()} onClick={submitDeltaReason}>Submit reason</button>
          </div>
        </div>
      </div>

      {/* E-signature modal (Finalized → Locked) */}
      {lockModalOpen && (
        <div className="sr-modal-overlay" onClick={() => { setLockModalOpen(false); setLockPassword(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Electronic signature">
            <div className="sr-modal-title"><i className="ti ti-lock"></i> Electronic signature</div>
            <div className="sr-modal-body">
              Locking finalizes this form and makes it read-only. Re-enter your password to sign (21 CFR Part 11).
            </div>
            <input
              type="password"
              className="sr-modal-input"
              placeholder="Password"
              value={lockPassword}
              onChange={(e) => setLockPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmLock(); }}
              autoFocus
            />
            <div className="sr-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => { setLockModalOpen(false); setLockPassword(""); }}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!lockPassword.trim()} onClick={confirmLock}><i className="ti ti-lock"></i> Sign &amp; Lock</button>
            </div>
          </div>
        </div>
      )}

      {/* VeDDRA lookup — slide-in panel (420px). Opens for all roles; selecting a term is DM-only. */}
      <div className={`panel-overlay${lookupField ? " open" : ""}`} onClick={() => setLookupField(null)}></div>
      <div className={`slide-panel lookup-panel${lookupField ? " open" : ""}`}>
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="panel-title">VeDDRA lookup</div>
            <div className="panel-title-meta"><span className="fc-code">{(lookupField?.code ?? "").toUpperCase()}</span></div>
          </div>
          <button className="panel-close" onClick={() => setLookupField(null)} type="button"><i className="ti ti-x"></i></button>
        </div>
        <div className="lookup-search">
          <i className="ti ti-search"></i>
          <input type="search" placeholder="Search coded terms…" value={lookupSearch} onChange={(e) => setLookupSearch(e.target.value)} />
        </div>
        <div className="lookup-panel-list">
          {VEDDRA_TERMS.filter((t) => t.toLowerCase().includes(lookupSearch.toLowerCase())).map((t) => (
            <button
              key={t}
              className="lookup-term"
              type="button"
              disabled={!canCode}
              title={canCode ? undefined : "Coding is a DM task"}
              onClick={() => { if (lookupField) { setFieldValue(lookupField, t); setLookupField(null); } }}
            >
              <i className="ti ti-book-2"></i> {t}
            </button>
          ))}
          {!canCode && <div className="sr-perm-note" style={{ padding: "var(--space-3)" }}><i className="ti ti-info-circle"></i> Coding is a DM task — terms are read-only for {activeRole}.</div>}
        </div>
      </div>

      {/* PI override modal — clears ineligibility back to Active */}
      {overrideOpen && (
        <div className="sr-modal-overlay" onClick={() => { setOverrideOpen(false); setOverrideReason(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="PI Override">
            <div className="sr-modal-title"><i className="ti ti-shield-check"></i> PI Override — document your reason</div>
            <div className="sr-modal-body">
              The subject failed one or more inclusion/exclusion criteria. As Principal Investigator you may override this and restore the subject to <strong>Active</strong>. A documented reason is required.
            </div>
            <textarea
              className="compose-textarea"
              placeholder="Document the clinical justification for this override…"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              autoFocus
            ></textarea>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="btn-secondary" type="button" onClick={() => { setOverrideOpen(false); setOverrideReason(""); }}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!overrideReason.trim()} onClick={confirmOverride}>Confirm override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
