"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { canQuery, canSDV } from "@/lib/permissions";
import { DEMO_USER_ID } from "@/lib/constants";
import { useNdaName } from "@/lib/use-nda-name";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import { isStudyLocked } from "@/lib/study-lock";
import type { Dataset, FormFieldRow } from "@/lib/session-store/types";
import "./subject-record.css";

interface Props {
  studyId: string;
  subjectId: string;
  initialFormId?: string;
  initialPanelFieldId?: string; // deep-link from the Queries screen: open this field's query/EC panel
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

// Repeating (log) forms — rendered as a table of entries (one form instance each)
// with Add / Edit / Delete, instead of a single field grid. Summary columns per form.
const REPEATING_FORMS = [
  "ConMed", "Adverse Event", "Protocol Deviation", "Mortality & Cull Record",
  // BR-2502 Group G — Safety & Events (as-needed repeating logs).
  "Injection Site Reaction", "Re-treatment / Rescue Therapy", "Sample Collection", "Concomitant Medication Log",
];
const REPEATING_COLUMNS: Record<string, [string, string][]> = {
  ConMed: [["medication_name", "Drug name"], ["dose", "Dose"], ["route", "Route"], ["start_date", "Start date"], ["ongoing", "Ongoing"]],
  "Adverse Event": [["ae_number", "AE #"], ["ae_term", "AE term"], ["severity", "Severity"], ["outcome", "Outcome"], ["sae_flag", "SAE"]],
  "Protocol Deviation": [["deviation_type", "Type"], ["deviation_date", "Date"], ["major_minor", "Major / Minor"], ["description", "Description"]],
  "Mortality & Cull Record": [["event_date", "Date"], ["death_count", "Deaths"], ["cull_count", "Culls"], ["cause_deaths", "Cause"]],
  "Injection Site Reaction": [["observation_date", "Date"], ["injection_site", "Site"], ["grade", "Grade"], ["reaction_present", "Reaction"]],
  "Re-treatment / Rescue Therapy": [["date", "Date"], ["reason", "Reason"], ["rescue_product", "Product"], ["treatment_failure", "Failure"]],
  "Sample Collection": [["collection_date", "Date"], ["sample_type", "Type"], ["sample_ids", "Sample IDs"], ["sent_to_lab", "Sent"]],
  "Concomitant Medication Log": [["start_date", "Start"], ["medication", "Medication"], ["dose_route", "Dose / route"], ["indication", "Indication"]],
};
// Custom "Add" button label per repeating form (defaults to "Add <name>").
const REPEATING_ADD_LABEL: Record<string, string> = {
  "Mortality & Cull Record": "Record mortality",
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
// Weakest-first ranking — a repeating form rolls its status up to its weakest entry.
const STATUS_RANK: Record<string, number> = { empty: 0, in_work: 1, in_review: 2, reviewed: 3, finalized: 4, locked: 5 };
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

// Reviewed status icon — exact SVG from the style guide (docs/index.html), a
// purple partial-fill "half-moon" (distinct from In-Work's blue).
function ReviewedIcon() {
  return (
    <svg className="si-reviewed-icon" width="16" height="16" viewBox="2 2 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M10.3522 16.8489C13.9788 16.6689 16.8641 13.6712 16.8641 10C16.8641 6.32673 13.9756 3.32779 10.3462 3.15084C12.2407 4.826 13.4353 7.27477 13.4353 10.0025C13.4353 12.7274 12.2433 15.1738 10.3522 16.8489ZM7.16743 2.51848C4.14722 3.66218 2 6.58161 2 10.0025C2 14.035 4.9835 17.3706 8.86352 17.9224C9.24018 17.9726 9.62024 18 10.0067 18C14.425 18 18.0067 14.4183 18.0067 10C18.0067 5.58172 14.425 2 10.0067 2C9.00682 2 8.0498 2.18343 7.16743 2.51848Z" fill="#BF65D5" />
    </svg>
  );
}

// Source-data-verifiable: every entered field type (including coded dictionary
// fields) except file uploads, calculated (derived) values, and free-text areas.
function isSdvEligible(field: FormFieldRow): boolean {
  return !["file", "calculated", "textarea"].includes(field.field_type);
}

export function SubjectRecord({ studyId, subjectId, initialFormId, initialPanelFieldId }: Props) {
  const router = useRouter();
  const ndaName = useNdaName(); // visitor name from the access agreement (acting user)
  const { activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(initialFormId);
  // null = not yet initialised → default to "all groups collapsed except the active one".
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string> | null>(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [cadesiOpen, setCadesiOpen] = useState(false); // CADESI-04 lesion-subtotal breakdown (collapsed by default)
  const [modeQueries, setModeQueries] = useState(false); // remarks default OFF
  const [modeSdv, setModeSdv] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null); // field currently being typed (no Δ until blur)
  const [panelField, setPanelField] = useState<FormFieldRow | null>(null); // query/edit-check panel target field
  const [panelKind, setPanelKind] = useState<"query" | "edit_check">("query");
  const [reply, setReply] = useState(""); // query-thread compose box
  const [deltaField, setDeltaField] = useState<FormFieldRow | null>(null);
  // Draft reason text per pending delta record (each transition is reasoned on its own).
  const [recordReasons, setRecordReasons] = useState<Record<string, string>>({});
  // Value of a text field at the moment it was focused — the start of an edit. The
  // transition (focus value → blur value) becomes one pending delta record on blur.
  const editStartRef = useRef<{ fieldId: string; value: string } | null>(null);
  const [lockModalOpen, setLockModalOpen] = useState(false); // e-signature modal
  const [lockPassword, setLockPassword] = useState("");
  const [lookupField, setLookupField] = useState<FormFieldRow | null>(null); // VeDDRA lookup panel target
  const [lookupInstId, setLookupInstId] = useState<string | null>(null); // when looking up from a repeating-form entry, the target instance
  const [lookupSearch, setLookupSearch] = useState("");
  const [manageOpen, setManageOpen] = useState(false); // Manage dropdown
  const [switcherOpen, setSwitcherOpen] = useState(false); // subject switcher popover
  const [switcherSearch, setSwitcherSearch] = useState("");
  const [entryInstanceId, setEntryInstanceId] = useState<string | null>(null); // repeating-form entry being edited
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null); // repeating-form entry pending delete
  const [overrideOpen, setOverrideOpen] = useState(false); // PI override modal
  const [overrideReason, setOverrideReason] = useState("");
  const [unblindOpen, setUnblindOpen] = useState(false); // emergency-unblinding modal (DM/Admin, double-blind only)
  const [unblindReason, setUnblindReason] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false); // collapsible subject timeline (above the form sidebar)
  const [manageOpenQuery, setManageOpenQuery] = useState(false); // DM query Manage dropdown
  const [closeModalOpen, setCloseModalOpen] = useState(false); // "Close without response" modal
  const [closeReason, setCloseReason] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Deep-link from the Queries screen: once hydrated, open the query/EC panel on
  // the linked field (kind = edit_check if it carries an open edit check, else query).
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current || !ready || !initialPanelFieldId) return;
    const f = dataset.formFields.find((x) => x.id === initialPanelFieldId);
    if (!f) return;
    deepLinkedRef.current = true;
    const inst = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === f.form_id);
    const fv = inst ? dataset.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === f.id) : undefined;
    const hasOpenEC = !!fv && dataset.editChecks.some((e) => e.field_value_id === fv.id && e.status === "open");
    setPanelKind(hasOpenEC ? "edit_check" : "query");
    setPanelField(f);
  }, [ready, initialPanelFieldId, dataset, subjectId]);

  const canSdv = canSDV(activeRole);
  // If the role changes to one without SDV permission, leave SDV mode so a non-CRA
  // is never stuck in a mode they can't use (item 4).
  useEffect(() => {
    if (!canSdv) setModeSdv(false);
  }, [canSdv]);
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
  // Clickable breadcrumb segments. The site (and any barn/pen) link back to the
  // Data Entry drill-down with that site pre-filtered (?site=<id>).
  const bcEntry = `/study/${studyId}/data-entry`;
  const bcSegments: { label: string; href: string }[] = [
    bcSite && { label: bcSite.name, href: `${bcEntry}?site=${bcSite.id}` },
    bcBarn && bcSite && { label: bcBarn.name, href: `${bcEntry}?site=${bcSite.id}` },
    bcPen && bcSite && { label: bcPen.name, href: `${bcEntry}?site=${bcSite.id}` },
  ].filter(Boolean) as { label: string; href: string }[];

  // Pen / Lot options for livestock_group studies (the field is a select sourced
  // from the study's seeded pens; other study types keep it as plain text).
  const studyRow = dataset.studies.find((s) => s.id === studyId);
  const isLivestockGroup = studyRow?.type === "livestock_group";
  const studySiteIds = new Set(dataset.sites.filter((s) => s.study_id === studyId).map((s) => s.id));
  const studyBarnIds = new Set(dataset.barns.filter((b) => studySiteIds.has(b.site_id)).map((b) => b.id));
  const penOptions = dataset.pens.filter((p) => studyBarnIds.has(p.barn_id)).map((p) => p.name);

  // ─── Conditional forms (BR-2502 Group G) ───────────────────────────────────
  // Some forms only apply in specific circumstances: Re-treatment / Rescue is
  // shown only when the Treatment form's re-treatment flag is Yes; Necropsy only
  // when the animal died / was euthanized. Derived from this subject's values.
  const valByCode = (code: string): string | undefined => {
    const fieldIds = new Set(dataset.formFields.filter((f) => f.code === code).map((f) => f.id));
    const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
    return dataset.fieldValues.find((v) => instIds.has(v.form_instance_id) && fieldIds.has(v.form_field_id) && v.value)?.value ?? undefined;
  };
  const retreatFlagYes = valByCode("retreatment_flag") === "Yes";
  const animalDied = ["died", "euthanized"].includes(subject.status) ||
    ["Died", "Euthanized"].includes(valByCode("disposition") ?? "") || valByCode("clinical_outcome") === "Death";
  const formHidden = (name: string) =>
    (name === "Re-treatment / Rescue Therapy" && !retreatFlagYes) ||
    (name === "Necropsy / Post-mortem" && !animalDied);

  // ─── Sidebar forms — grouped tree (store-derived) ──────────────────────────
  // Only subject-scoped forms appear in the pen/subject sidebar — barn-scoped
  // (House record) and site-scoped (Site record) forms are rendered elsewhere.
  const studyForms = dataset.forms
    .filter((f) => f.study_id === studyId && (f.scope ?? "subject") === "subject" && !formHidden(f.name))
    .slice().sort((a, b) => a.sequence - b.sequence);
  const groupIds = new Set(studyForms.map((f) => f.parent_form_id).filter(Boolean) as string[]);

  // A single leaf (sub-form or standalone form): its status icon + open-query count.
  // Rolled up across every instance, so a repeating (log) form reflects the whole
  // form — weakest status, summed open queries, all-entries-complete SDV.
  function leafItem(f: { id: string; name: string }) {
    const insts = dataset.formInstances.filter((i) => i.subject_id === subjectId && i.form_id === f.id);
    // Badge = queries that (a) belong to THIS form instance, (b) are open/responded
    // (resolved never counts), and (c) resolve to a field value on the instance — so
    // an orphaned query can never produce a phantom badge with no visible flag.
    const openQ = insts.flatMap((i) => dataset.queries.filter((q) =>
      q.form_instance_id === i.id && (q.status === "open" || q.status === "responded") &&
      dataset.fieldValues.some((v) => v.id === q.field_value_id && v.form_instance_id === i.id)));
    const status = insts.length ? insts.reduce<string>((acc, i) => (STATUS_RANK[i.status] < STATUS_RANK[acc] ? i.status : acc), "locked") : "empty";
    const icon: SidebarIcon = openQ.length ? "queried" : iconForInstance(status);
    // SDV state for the sidebar (item 6): complete > any verified field > none.
    const anyVerified = insts.some((i) => dataset.sdvRecords.some((r) => r.status === "verified" && dataset.fieldValues.some((v) => v.id === r.field_value_id && v.form_instance_id === i.id)));
    const sdv: "complete" | "partial" | "none" = (insts.length > 0 && insts.every((i) => i.sdv_complete)) ? "complete" : anyVerified ? "partial" : "none";
    return { id: f.id, name: f.name, icon, queryCount: openQ.length, status, sdv };
  }

  type LeafItem = ReturnType<typeof leafItem>;
  interface SidebarNode { id: string; name: string; isGroup: boolean; icon: SidebarIcon; queryCount: number; status: string; sdv: "complete" | "partial" | "none"; children: SidebarNode[] }

  // Recursive — groups can nest (Group → Week sub-group → leaf). A group rolls up
  // the worst child icon, the summed open-query count, and an all-complete SDV.
  function buildNode(f: { id: string; name: string }): SidebarNode {
    if (groupIds.has(f.id)) {
      const children = studyForms.filter((c) => c.parent_form_id === f.id).map(buildNode);
      const worst = children.reduce<SidebarIcon>((acc, c) => (ICON_RANK[c.icon] < ICON_RANK[acc] ? c.icon : acc), "final");
      const queryCount = children.reduce((a, c) => a + c.queryCount, 0);
      const groupSdv: "complete" | "partial" | "none" =
        children.length && children.every((c) => c.sdv === "complete") ? "complete" : children.some((c) => c.sdv !== "none") ? "partial" : "none";
      return { id: f.id, name: f.name, isGroup: true, icon: worst, queryCount, status: "", sdv: groupSdv, children };
    }
    const leaf = leafItem(f);
    return { id: f.id, name: f.name, isGroup: false, icon: leaf.icon, queryCount: leaf.queryCount, status: leaf.status, sdv: leaf.sdv, children: [] };
  }
  const sidebarTree: SidebarNode[] = studyForms.filter((f) => !f.parent_form_id).map(buildNode);

  // Flat ordered list of selectable leaves (depth-first) for defaulting.
  function collectLeaves(nodes: SidebarNode[]): LeafItem[] {
    return nodes.flatMap((n) => (n.isGroup ? collectLeaves(n.children) : [{ id: n.id, name: n.name, icon: n.icon, queryCount: n.queryCount, status: n.status, sdv: n.sdv }]));
  }
  const orderedLeaves: LeafItem[] = collectLeaves(sidebarTree);

  const activeFormId = selectedFormId ?? orderedLeaves[0]?.id;
  const selectedForm = studyForms.find((f) => f.id === activeFormId);
  const activeParentId = selectedForm?.parent_form_id ?? null; // immediate group of the active child

  // The full ancestor chain of the active form (immediate parent → … → root group),
  // so nested groups (Group C → Week N) open down to the active form on load.
  const activeAncestorIds = (() => {
    const set = new Set<string>();
    let cur = activeParentId;
    while (cur) { set.add(cur); cur = studyForms.find((f) => f.id === cur)?.parent_form_id ?? null; }
    return set;
  })();

  // Default: every group collapsed except the active form's ancestor chain.
  const defaultCollapsed = new Set(Array.from(groupIds).filter((id) => !activeAncestorIds.has(id)));
  const collapsedSet = collapsedGroups ?? defaultCollapsed;

  function StatusGlyph({ icon, title }: { icon: SidebarIcon; title?: string }) {
    let inner: JSX.Element;
    if (icon === "final") inner = <div className="status-final"><i className="ti ti-check"></i></div>;
    else if (icon === "inwork") inner = <InWorkIcon />;
    else if (icon === "inreview") inner = <InReviewIcon />;
    else if (icon === "reviewed") inner = <ReviewedIcon />;
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
        id={`sb-form-${item.id}`}
        className={`form-item${item.id === activeFormId ? " active" : ""}${item.icon === "final" ? " done" : ""}`}
        onClick={() => setSelectedFormId(item.id)}
        title={item.name}
        type="button"
      >
        <span className="form-item-label">{item.name}</span>
        <div className="form-item-right">
          {item.queryCount > 0 && <span className="issue-badge warning">{item.queryCount}</span>}
          <SidebarSdv sdv={item.sdv} />
          <StatusGlyph icon={item.icon} title={item.icon === "queried" ? "Open query" : STATUS_LABEL[item.status] ?? ICON_LABEL[item.icon]} />
        </div>
      </button>
    );
  }
  // Recursive sidebar node — a leaf renders as a form item; a group renders a
  // collapsible header + (when expanded) its children, which may be sub-groups.
  function renderNode(node: SidebarNode): JSX.Element {
    if (!node.isGroup) {
      return renderLeaf({ id: node.id, name: node.name, icon: node.icon, queryCount: node.queryCount, status: node.status, sdv: node.sdv });
    }
    const collapsed = collapsedSet.has(node.id);
    return (
      <div className="form-group" key={node.id}>
        <button
          className={`form-group-header${activeAncestorIds.has(node.id) ? " active-parent" : ""}`}
          onClick={() => toggleGroup(node.id)}
          aria-expanded={!collapsed}
          title={node.name}
          type="button"
        >
          <i className={`ti ti-chevron-${collapsed ? "right" : "down"} form-group-caret`} aria-hidden="true"></i>
          <span className="form-group-label">{node.name}</span>
          <div className="form-item-right">
            {node.queryCount > 0 && <span className="issue-badge warning">{node.queryCount}</span>}
            <SidebarSdv sdv={node.sdv} />
            <StatusGlyph icon={node.icon} title={ICON_LABEL[node.icon]} />
          </div>
        </button>
        {!collapsed && <div className="form-group-children">{node.children.map(renderNode)}</div>}
      </div>
    );
  }
  // SDV shield slot in the sidebar — only when Remarks SDV is on (item 6).
  function SidebarSdv({ sdv }: { sdv: "complete" | "partial" | "none" }) {
    if (!modeSdv || sdv === "none") return null;
    return (
      <i
        className={`ti ${sdv === "complete" ? "ti-shield-check-filled" : "ti-shield"} sidebar-sdv-icon`}
        title={sdv === "complete" ? "SDV complete" : "Partially verified — SDV not complete"}
        aria-hidden="true"
      ></i>
    );
  }
  const fields = dataset.formFields.filter((f) => f.form_id === activeFormId).slice().sort((a, b) => a.sequence - b.sequence);
  const instance = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === activeFormId);

  const fvFor = (fieldId: string) =>
    instance ? dataset.fieldValues.find((v) => v.form_instance_id === instance.id && v.form_field_id === fieldId) : undefined;
  // Field-level conditional display (validation.showIf): the field shows only when
  // the referenced field's value matches — read from this form first (same-instance
  // dependency, e.g. "verified = Yes"), else any value the subject carries (cross-
  // form, e.g. the pen's treatment_arm). Hidden fields don't render and don't gate.
  function isFieldVisible(field: FormFieldRow): boolean {
    const cond = field.validation?.showIf;
    if (!cond) return true;
    const sameField = fields.find((f) => f.code === cond.code);
    const v = sameField ? (fvFor(sameField.id)?.value ?? "") : (valByCode(cond.code) ?? "");
    return cond.equals != null ? v === cond.equals : v !== "";
  }
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

  // Δ change-reason state, derived entirely from the per-transition delta records.
  // Every value change of an already-saved field pushes one PENDING record; providing
  // its reason moves it to RESPONDED; a DM sign-off moves it to APPROVED.
  //   • any record still pending  → "pending"  (dashed red — a reason is owed)
  //   • every record approved     → "approved" (green)
  //   • otherwise                 → "responded"(solid blue — awaiting DM)
  //   • no records                → null       (original entry, nothing to explain)
  function deltaStateFor(fieldId: string, fvId: string | undefined): "pending" | "responded" | "approved" | null {
    if (editingFieldId === fieldId) return null; // actively typing → settle on blur
    const recs = fvId ? dataset.deltaRecords.filter((r) => r.field_value_id === fvId) : [];
    if (recs.length === 0) return null;
    if (recs.some((r) => r.status === "pending")) return "pending";
    return recs.every((r) => r.status === "approved") ? "approved" : "responded";
  }

  // ─── Form status (empty → in_work → in_review → reviewed → finalized → locked) ─
  // Repeating (log) forms have one instance per entry; the form-level status rolls
  // up to the WEAKEST entry, so Submit / Finalize / Lock advance the whole form
  // together. One-time forms use their single instance.
  const isRepeatingForm = REPEATING_FORMS.includes(selectedForm?.name ?? "");
  const repeatingEntries = isRepeatingForm
    ? dataset.formInstances.filter((i) => i.subject_id === subjectId && i.form_id === activeFormId)
    : [];
  const formInstanceList = isRepeatingForm ? repeatingEntries : (instance ? [instance] : []);
  const currentStatus = isRepeatingForm
    ? (repeatingEntries.length ? repeatingEntries.reduce<string>((acc, i) => (STATUS_RANK[i.status] < STATUS_RANK[acc] ? i.status : acc), "locked") : "empty")
    : (instance?.status ?? "empty");
  const locked = currentStatus === "locked";
  const flow = STATUS_FLOW[currentStatus];
  const canAdvance = !!flow && flow.roles.includes(activeRole);
  const allSdvComplete = formInstanceList.length > 0 && formInstanceList.every((i) => i.sdv_complete);

  // SDV progress (header bar) — counts verified SDV-eligible cells across every
  // instance of the form (so a repeating form sums all its entries).
  const sdvEligibleFields = fields.filter(isSdvEligible);
  const sdvFvIdOf = (instId: string, fieldId: string) => dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.id;
  const sdvCellTotal = sdvEligibleFields.length * (isRepeatingForm ? formInstanceList.length : 1);
  const verifiedCount = formInstanceList.reduce((n, inst) => n + sdvEligibleFields.filter((f) => sdvVerified(sdvFvIdOf(inst.id, f.id))).length, 0);
  const sdvPct = sdvCellTotal ? Math.round((verifiedCount / sdvCellTotal) * 100) : 0;

  // ePRO — Owner Daily Diary is a read-only stub: data flows from the owner
  // portal, so the Subject Record shows an info note and disabled fields.
  const activeForm = dataset.forms.find((f) => f.id === activeFormId);
  const isEproForm = (activeForm?.name ?? "").startsWith("ePRO");

  // Completed / withdrawn subjects are closed: every form is read-only, data-entry
  // actions (Submit/Finalize/Lock, new SDV, new change reasons) are hidden, and a
  // persistent banner explains the state. Existing queries can still be managed
  // (the query panel isn't gated by read-only) so a DM can resolve open items.
  const subjectClosed = subject.status === "completed" || subject.status === "withdrawn";
  // Database Lock — a full-study lock taken prior to statistical analysis makes
  // every form across every subject read-only until an Admin unlocks it.
  const studyLocked = isStudyLocked(dataset, studyId);
  const readOnly = locked || isEproForm || subjectClosed || studyLocked; // fields are non-editable when true

  // ─── Emergency unblinding (double-blind studies only — CA-0801) ─────────────
  // The unblinding record persists in the session (for the audit trail), but the
  // REVEAL is role-scoped: only DM / Admin see the arm after an unblinding. Switch
  // to any other role and the subject re-blinds (no hint an unblinding occurred).
  const isDoubleBlind = studyRow?.code === "CA-0801";
  const isPrivilegedViewer = activeRole === "DM" || activeRole === "Admin";
  const unblindRec = (dataset.unblindings ?? []).find((u) => u.subject_id === subjectId);
  const armRevealed = !isDoubleBlind || (!!unblindRec && isPrivilegedViewer);
  const armUnblinded = isDoubleBlind && !!unblindRec && isPrivilegedViewer; // show the "unblinded" badge only to privileged viewers
  const canUnblind = isDoubleBlind && !unblindRec && isPrivilegedViewer;
  const displayArm = !subject.randomization_arm ? null : armRevealed ? subject.randomization_arm : "Blinded";
  function confirmUnblind() {
    if (!unblindReason.trim()) return;
    update((d) => {
      (d.unblindings ??= []).push({
        id: newId(), subject_id: subjectId, arm: subject?.randomization_arm ?? "—",
        reason: unblindReason.trim(), author_name: ndaName, author_role: activeRole, created_at: new Date().toISOString(),
      });
    });
    setUnblindOpen(false); setUnblindReason("");
  }

  // Withdrawal details for the banner — sourced from any field value the subject
  // carries for these codes (Subject Status / End of Study forms).
  function subjectValueByCode(code: string): string | undefined {
    const fieldIds = new Set(
      dataset.formFields.filter((f) => f.code === code).map((f) => f.id),
    );
    const instIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
    return dataset.fieldValues.find((v) => instIds.has(v.form_instance_id) && fieldIds.has(v.form_field_id) && v.value)?.value ?? undefined;
  }
  const withdrawalDate = subject.status === "withdrawn" ? subjectValueByCode("withdrawal_date") : undefined;
  const withdrawalReason = subject.status === "withdrawn" ? subjectValueByCode("withdrawal_reason") : undefined;
  const completionDate = subject.status === "completed" ? subjectValueByCode("visit_date") : undefined;

  // Animal age in months (for age-class vital validation, e.g. bovine heart rate
  // — calf ≤6mo vs adult). Sourced from a demographics "Estimated age" field.
  const ageRaw = subjectValueByCode("age_months");
  const subjectAgeMonths = ageRaw != null && ageRaw !== "" && !Number.isNaN(Number(ageRaw)) ? Number(ageRaw) : null;

  // Subject switcher — the study's subjects, for quick navigation between records.
  const switcherSubjects = dataset.subjects
    .filter((s) => s.study_id === studyId)
    .slice()
    .sort((a, b) => a.subject_code.localeCompare(b.subject_code));
  const switcherFiltered = switcherSubjects.filter((s) =>
    s.subject_code.toLowerCase().includes(switcherSearch.toLowerCase().trim()),
  );

  // ─── Inclusion / Exclusion — a criterion answered "No" fails ────────────────
  const isIEForm = fields.some((f) => f.validation?.exclusion_criterion);

  // ─── Repeating (log) forms — ConMed / Adverse Event / Protocol Deviation ────
  // Production Summary — a read-only, auto-generated rollup (no fields to edit, no
  // SDV / queries / submit). Its values aggregate across the weekly visit forms.
  const isSummaryForm = selectedForm?.name === "Production Summary";
  const repeatingCols = REPEATING_COLUMNS[selectedForm?.name ?? ""] ?? [];
  const repeatingAddLabel = REPEATING_ADD_LABEL[selectedForm?.name ?? ""] ?? `Add ${selectedForm?.name}`;
  const fieldByCode = (code: string) => fields.find((f) => f.code === code);
  function entryVal(instId: string, fieldId: string): string {
    return dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.value ?? "";
  }
  function setEntryVal(instId: string, field: FormFieldRow, value: string) {
    if (readOnly) return;
    update((d) => {
      const fv = d.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === field.id);
      if (fv) fv.value = value;
      else d.fieldValues.push({ id: newId(), form_instance_id: instId, form_field_id: field.id, value });
      const inst = d.formInstances.find((i) => i.id === instId);
      if (inst && inst.status === "empty") inst.status = "in_work";
    });
  }
  function addEntry() {
    if (readOnly || !activeFormId) return;
    const id = newId();
    update((d) => {
      d.formInstances.push({ id, form_id: activeFormId, subject_id: subjectId, status: "in_work" });
      // Adverse Event: auto-generate the AE number (AE-0001, AE-0002 …) per subject.
      const aeNumField = fields.find((f) => f.code === "ae_number");
      if (aeNumField && selectedForm?.name === "Adverse Event") {
        const seq = d.formInstances.filter((i) => i.subject_id === subjectId && i.form_id === activeFormId).length;
        d.fieldValues.push({ id: newId(), form_instance_id: id, form_field_id: aeNumField.id, value: `AE-${String(seq).padStart(4, "0")}` });
      }
    });
    setEntryInstanceId(id);
  }
  function confirmDeleteEntry() {
    const instId = deleteEntryId;
    if (!instId) return;
    update((d) => {
      d.formInstances = d.formInstances.filter((i) => i.id !== instId);
      d.fieldValues = d.fieldValues.filter((v) => v.form_instance_id !== instId);
      d.queries = d.queries.filter((q) => q.form_instance_id !== instId);
      d.editChecks = d.editChecks.filter((e) => e.form_instance_id !== instId);
      d.sdvRecords = d.sdvRecords.filter((r) => r.form_instance_id !== instId);
    });
    if (entryInstanceId === instId) setEntryInstanceId(null);
    setDeleteEntryId(null);
  }
  function renderEntryControl(field: FormFieldRow, instId: string) {
    const v = entryVal(instId, field.id);
    const t = field.field_type;
    // Auto-generated AE number — read-only display.
    if (field.code === "ae_number") return <input className="field-input" type="text" value={v} disabled readOnly placeholder="Auto-generated" />;
    // Coded (VeDDRA) field — text input + a Look up button (opens the dictionary panel).
    if (field.validation?.coded) {
      return (
        <div className="coded-field">
          <input className="field-input" type="text" value={v} disabled={readOnly} onChange={(e) => setEntryVal(instId, field, e.target.value)} />
          <button className="lookup-btn" type="button" title="Look up coded term (VeDDRA)" onClick={() => { setLookupSearch(""); setLookupField(field); setLookupInstId(instId); }}>
            <i className="ti ti-search"></i> Look up
          </button>
        </div>
      );
    }
    if (t === "textarea") return <textarea className="field-input" style={{ height: 60, fontFamily: "var(--font-sans)" }} value={v} disabled={readOnly} onChange={(e) => setEntryVal(instId, field, e.target.value)} />;
    if (t === "date" || t === "datetime") return <input className="field-input field-date" type="date" value={v} disabled={readOnly} onChange={(e) => setEntryVal(instId, field, e.target.value)} />;
    if (t === "select" || t === "radio") {
      const opts = field.options ?? (t === "radio" ? ["Yes", "No"] : []);
      return (
        <select className="field-select" value={v} disabled={readOnly} onChange={(e) => setEntryVal(instId, field, e.target.value)}>
          <option value="">—</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (t === "number" || t === "integer") return <input className="field-input" type="number" value={v} disabled={readOnly} onChange={(e) => setEntryVal(instId, field, e.target.value)} />;
    return <input className="field-input" type="text" value={v} disabled={readOnly} onChange={(e) => setEntryVal(instId, field, e.target.value)} />;
  }

  // Visual section dividers (item 10). Forms can declare explicit per-field
  // sections (validation.section) — those win. Otherwise forms with vital fields
  // fall back to a logical Examination / Vital Signs / Assessment split; forms
  // without either render flat (no headers).
  const hasExplicitSections = fields.some((f) => f.validation?.section);
  const firstVitalIdx = fields.findIndex((f) => f.validation?.vital);
  const sectioned = firstVitalIdx >= 0;
  const sectionForIdx = (idx: number): string | null => {
    if (idx < 0 || idx >= fields.length) return null;
    if (hasExplicitSections) return fields[idx].validation?.section ?? null;
    if (!sectioned) return null;
    if (fields[idx].validation?.vital) return "Vital Signs";
    return idx < firstVitalIdx ? "Examination" : "Assessment";
  };

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
    // Protocol version in effect — fixed per study, traceable on every visit form.
    if (field.code === "protocol_version") {
      const code = studyRow?.code;
      return code === "PH-2401" ? "v1.0" : code === "BR-2502" ? "v1.0" : code === "CA-0801" ? "v2.1 — DERM-2026-104" : "—";
    }
    // GCP feed-additive counter-signature — auto-populated once the verify flag is
    // Yes (the showIf already hides these unless verified): who verified + when.
    if (field.code === "verifier_name") return ndaName;
    if (field.code === "verification_timestamp") return todayISO();
    // Recommended action derived from a same-form DART clinical illness score.
    if (field.code === "dart_recommended_action") {
      const srcCode = field.validation?.dartSource;
      const src = srcCode ? fields.find((x) => x.code === srcCode) : undefined;
      const v = src ? (fvFor(src.id)?.value ?? "") : "";
      const map: Record<string, string> = {
        "0": "No action required — continue routine monitoring",
        "1": "Mild signs — increase observation frequency",
        "2": "Enrollment criterion met — proceed to randomization and treatment",
        "3": "Severe — immediate treatment required, notify PI",
      };
      return map[v] ?? "—";
    }
    // Overall eligibility verdict over this form's I/E criteria. Any failing
    // criterion (exclusion=Yes / inclusion=No) → Screen Failure; pending until all
    // criteria are answered (so it never reads "Eligible" prematurely).
    if (field.code === "overall_eligibility") {
      const critF = fields.filter((x) => x.validation?.exclusion_criterion);
      if (!critF.length) return "—";
      const failed = critF.find((cf) => (fvFor(cf.id)?.value ?? "") === (cf.validation?.exclusion_if ?? "No"));
      if (failed) return `Screen Failure — ${failed.label}`;
      const allAnswered = critF.every((cf) => (fvFor(cf.id)?.value ?? "") !== "");
      return allAnswered ? "Eligible" : "—";
    }
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
    // PH-2401 performance metrics. FCR is cross-visit (not wired here) → "N/A"
    // until both feed-consumed and weight-gain are available — so a baseline /
    // first-visit FCR reads N/A, never a misleading number.
    if (field.code.includes("fcr")) return "N/A";
    // Single-form derived metrics (same instance) — compute when inputs are present.
    const sameNum = (code: string): number | undefined => {
      const f = fields.find((x) => x.code === code);
      const v = f ? fvFor(f.id)?.value : undefined;
      const n = Number(v);
      return v != null && v !== "" && !Number.isNaN(n) ? n : undefined;
    };
    if (field.code === "avg_body_weight") {
      const w = sameNum("total_pen_weight");
      const b = sameNum("birds_alive");
      if (w == null || !b) return "—";
      return `${Math.round((w / b) * 1000)}`;
    }
    if (field.code === "stocking_density") {
      const b = sameNum("birds_placed");
      const a = sameNum("floor_area_m2");
      if (b == null || !a) return "—";
      return `${(b / a).toFixed(1)}`;
    }
    if (field.code === "fec_reduction") {
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
    setFieldValue(field, JSON.stringify(next), true); // discrete commit → record transition
  }

  // Push one PENDING delta record for a value change. Skips first entries (prev === "")
  // and no-op changes (prev === next), so the very first value never raises a Δ and a
  // same-value "change" is never recorded. Each call captures its own old→new pair, so
  // A→B→C without reasons yields two records (A→B, B→C) — multi-transition tracking.
  function recordTransition(d: Dataset, fvId: string, prev: string, next: string) {
    if (prev === "" || prev === next) return;
    d.deltaRecords.push({
      id: newId(),
      field_value_id: fvId,
      old_value: prev,
      new_value: next,
      reason: "",
      author_name: ndaName,
      author_role: activeRole,
      created_at: new Date().toISOString(),
      status: "pending",
    });
  }

  // ─── Write actions (all via update() — session only) ───────────────────────
  // `recordChange` is set only by discrete controls (select / yes-no / multiselect /
  // date / file), whose every change is an atomic commit → record the transition now.
  // Text inputs pass false (they would record a half-typed entry) and instead record
  // one transition per focus→blur edit via recordTextEdit().
  function setFieldValue(field: FormFieldRow, value: string, recordChange = false, skipCheck = false) {
    if (readOnly) return; // locked forms + the ePRO stub are read-only
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
      // Δ (discrete controls only): every change of an already-saved field records its
      // own pending transition (prev → value). First entry / no-op changes are skipped.
      if (recordChange) recordTransition(d, fv.id, prev, value);

      // Live EDIT CHECK (not a query): out of range → raise/keep an open edit check;
      // back in range → resolve it. Discrete controls evaluate on change; free-text /
      // numeric inputs pass skipCheck while typing and evaluate on BLUR (so the amber
      // state doesn't flicker mid-keystroke). Converting to a query is a separate action.
      if (!skipCheck) evalEditCheckInline(d, inst, fv, field, value);
      // Inclusion/Exclusion: recompute eligibility from all criterion fields in
      // this form. Each criterion declares the answer that FAILS it via
      // exclusion_if (default "No" — a positively-phrased inclusion criterion);
      // "exclusion if Yes" criteria set exclusion_if: "Yes".
      if (field.validation?.exclusion_criterion) {
        const critF = d.formFields.filter((x) => x.form_id === field.form_id && x.validation?.exclusion_criterion);
        const fail = critF.some((cf) => {
          const cv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === cf.id);
          return cv?.value === (cf.validation?.exclusion_if ?? "No");
        });
        const subj = d.subjects.find((s) => s.id === subjectId);
        if (subj) subj.ineligible = fail;
      }
    });
  }

  // Out-of-range → raise/keep an open edit check; back in range → resolve it. Never
  // raises a new check if the field already has a (converted) live query.
  function evalEditCheckInline(d: Dataset, inst: { id: string }, fv: { id: string }, field: FormFieldRow, value: string) {
    const check = evaluateField(field, value, species, d.speciesRanges, subjectAgeMonths);
    const ec = d.editChecks.find((e) => e.field_value_id === fv.id && e.status === "open");
    const hasConvertedQ = d.queries.some((q) => q.field_value_id === fv.id && (q.status === "open" || q.status === "responded"));
    if (check) {
      if (!ec && !hasConvertedQ) d.editChecks.push({ id: newId(), form_instance_id: inst.id, field_value_id: fv.id, message: check.message, status: "open", created_at: new Date().toISOString() });
      else if (ec) ec.message = check.message;
    } else if (ec) {
      ec.status = "resolved"; // value corrected
    }
  }
  // Blur-time edit-check evaluation for free-text / numeric inputs (Path A: a
  // corrected value clears the check; an out-of-range one raises it on blur only).
  function evalEditCheck(field: FormFieldRow) {
    if (readOnly) return;
    update((d: Dataset) => {
      const inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === field.form_id);
      if (!inst) return;
      const fv = d.fieldValues.find((v) => v.form_instance_id === inst.id && v.form_field_id === field.id);
      if (!fv) return;
      evalEditCheckInline(d, inst, fv, field, fv.value ?? "");
    });
  }

  // Text fields: snapshot the saved value when focused (the start of an edit); on blur,
  // record the focus→blur transition as one pending delta. Typing the first value into
  // an empty field starts from "" → recordTransition skips it (no Δ on first entry).
  function snapshotTextFocus(field: FormFieldRow) {
    editStartRef.current = { fieldId: field.id, value: fvFor(field.id)?.value ?? "" };
  }
  function recordTextEdit(field: FormFieldRow) {
    const snap = editStartRef.current;
    editStartRef.current = null;
    if (!snap || snap.fieldId !== field.id) return;
    const fv = fvFor(field.id);
    if (!fv) return;
    const cur = fv.value ?? "";
    if (cur === snap.value) return; // no net change this edit
    update((d: Dataset) => {
      const f = d.fieldValues.find((v) => v.id === fv.id);
      if (f) recordTransition(d, f.id, snap.value, cur);
    });
  }

  // ─── Change reason (Δ) ──────────────────────────────────────────────────────
  // Provide the reason for ONE pending transition: pending → responded.
  function submitReasonForRecord(recordId: string) {
    const text = (recordReasons[recordId] ?? "").trim();
    if (!text) return;
    update((d: Dataset) => {
      const r = d.deltaRecords.find((x) => x.id === recordId);
      if (r && r.status === "pending") {
        r.reason = text;
        r.author_name = ndaName;
        r.author_role = activeRole;
        r.status = "responded";
      }
    });
    setRecordReasons((prev) => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
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
    // Repeating forms advance every entry together; one-time forms, the single instance.
    const ids = new Set(formInstanceList.map((i) => i.id));
    update((d: Dataset) => {
      for (const inst of d.formInstances) if (ids.has(inst.id)) inst.status = next;
    });
  }
  function confirmLock() {
    if (!lockPassword.trim()) return; // e-signature required
    const ids = new Set(formInstanceList.map((i) => i.id));
    update((d: Dataset) => {
      for (const inst of d.formInstances) if (ids.has(inst.id)) inst.status = "locked";
    });
    setLockPassword("");
    setLockModalOpen(false);
  }

  // A field must be clean to verify: no open edit check, no pending change reason,
  // no open (raised/responded) query. Returns the blocking reason or null.
  function sdvBlockReason(field: FormFieldRow, fvId: string | undefined): string | null {
    if (editCheckFor(fvId)) return "Resolve the edit check before verifying";
    if (deltaStateFor(field.id, fvId) === "pending") return "Provide the change reason before verifying";
    const q = fieldQueryFor(fvId);
    if (q && q.status !== "resolved") return "Resolve the open query before verifying";
    return null;
  }
  function toggleSdv(field: FormFieldRow) {
    if (!canSdv || locked) return;
    const fv0 = fvFor(field.id);
    // A field must carry a saved, non-empty value before it can be verified (items
    // 5/6) — SDV confirms entered data against source, so there is nothing to verify
    // on an empty field. Never create a field value on verify.
    if (!fv0 || (fv0.value ?? "") === "") return;
    if (sdvBlockReason(field, fv0.id)) return; // field not clean
    update((d: Dataset) => {
      const fv = d.fieldValues.find((v) => v.id === fv0.id);
      if (!fv) return;
      const rec = d.sdvRecords.find((r) => r.field_value_id === fv.id);
      if (rec) {
        const nowVerified = rec.status !== "verified";
        rec.status = nowVerified ? "verified" : "pending";
        rec.verified_by_name = nowVerified ? ndaName : null;
        rec.verified_at = nowVerified ? todayISO() : null;
      } else {
        d.sdvRecords.push({ id: newId(), form_instance_id: fv.form_instance_id, field_value_id: fv.id, status: "verified", verified_by_name: ndaName, verified_at: todayISO() });
      }
    });
  }
  // Bulk-verify every clean SDV-eligible field that HAS a saved value on the active
  // form (CRA). Empty/never-entered fields and un-clean fields are skipped (item 5).
  function verifyAll() {
    if (!canSdv || locked) return;
    // Repeating forms verify every entry's fields; one-time forms, the single instance.
    const ids = formInstanceList.map((i) => i.id);
    if (ids.length === 0) return; // nothing entered → nothing to verify
    update((d: Dataset) => {
      for (const instId of ids) {
        for (const f of fields.filter(isSdvEligible)) {
          const fv = d.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === f.id);
          if (!fv || (fv.value ?? "") === "") continue; // only fields with a saved value
          if (sdvBlockReason(f, fv.id)) continue; // skip un-clean fields
          const rec = d.sdvRecords.find((r) => r.field_value_id === fv.id);
          if (rec) { rec.status = "verified"; rec.verified_by_name = ndaName; rec.verified_at = todayISO(); }
          else d.sdvRecords.push({ id: newId(), form_instance_id: fv.form_instance_id, field_value_id: fv.id, status: "verified", verified_by_name: ndaName, verified_at: todayISO() });
        }
      }
    });
  }
  // Mark this form's source-data verification complete (item 6) — every entry for a
  // repeating form, the single instance otherwise.
  function markSdvComplete() {
    if (!canSdv || locked) return;
    const ids = new Set(formInstanceList.map((i) => i.id));
    update((d: Dataset) => {
      if (ids.size === 0 && activeFormId) { d.formInstances.push({ id: newId(), form_id: activeFormId, subject_id: subjectId, status: "in_work", sdv_complete: true }); return; }
      for (const inst of d.formInstances) if (ids.has(inst.id)) inst.sdv_complete = true;
    });
  }

  function pushMsg(d: Dataset, queryId: string, body: string) {
    d.queryMessages.push({
      id: newId(), query_id: queryId, author_id: DEMO_USER_ID,
      author_name: ndaName, author_role: activeRole, body,
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
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: body, from_edit_check: false, created_at: new Date().toISOString() });
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
      d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: ec.message, from_edit_check: true, created_at: new Date().toISOString() });
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
        subj.override_by = ndaName;
        subj.override_at = todayISO();
      }
    });
    setOverrideReason("");
    setOverrideOpen(false);
  }

  // DM: close a query without a response — requires a documented, auditable reason
  // (stored as a system message on the thread).
  function confirmCloseWithoutResponse(queryId: string) {
    if (!closeReason.trim()) return;
    update((d: Dataset) => {
      const q = d.queries.find((x) => x.id === queryId);
      if (!q) return;
      d.queryMessages.push({
        id: newId(), query_id: queryId, author_id: DEMO_USER_ID,
        author_name: ndaName, author_role: `${activeRole} · System`,
        body: `Closed without response — ${closeReason.trim()}`,
        created_at: new Date().toISOString(),
      });
      q.status = "resolved";
    });
    setCloseReason("");
    setCloseModalOpen(false);
    setManageOpenQuery(false);
    setPanelField(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const statusInfo = STATUS_MAP[subject.status] || { cls: "status-screened", label: subject.status };
  const panelFv = panelField ? fvFor(panelField.id) : undefined;
  // ALL queries on the field, chronological — every one stays visible (item 5).
  const panelQueries = panelFv
    ? dataset.queries.filter((q) => q.field_value_id === panelFv.id).slice().sort((a, b) => (a.created_at ?? "") < (b.created_at ?? "") ? -1 : 1)
    : [];
  const panelQuery = fieldQueryFor(panelFv?.id); // the active one (open/responded, else latest resolved)
  const panelEC = editCheckFor(panelFv?.id);
  const isECPanel = panelKind === "edit_check" && !!panelEC; // edit-check panel (not yet converted)
  const panelResolved = panelQuery?.status === "resolved";
  const msgsForQuery = (qid: string) => dataset.queryMessages.filter((m) => m.query_id === qid).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  const panelHasResponse = panelQuery ? msgsForQuery(panelQuery.id).some((m) => m.author_role && !m.author_role.includes("System")) : false;

  // Submit gating. One-time forms test the single active instance; repeating forms
  // test EVERY entry (the form advances as a whole). Submit for Review is blocked by
  // unresolved edit checks, pending change reasons, or empty required fields — but
  // NOT by open manual queries (those don't block).
  const instFvId = (instId: string, fieldId: string) => dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.id;
  const instHasData = (instId: string) => fields.some((f) => entryVal(instId, f.id).trim() !== "");
  const instOpenEC = (instId: string) => fields.some((f) => { const id = instFvId(instId, f.id); return !!id && !!dataset.editChecks.find((e) => e.field_value_id === id && e.status === "open"); });
  const instPendingDelta = (instId: string) => fields.some((f) => { const id = instFvId(instId, f.id); return !!id && dataset.deltaRecords.some((r) => r.field_value_id === id && r.status === "pending"); });
  const instEmptyRequired = (instId: string) => fields.some((f) => f.is_required && isFieldVisible(f) && entryVal(instId, f.id).trim() === "");

  const formHasData = isRepeatingForm
    ? repeatingEntries.some((i) => instHasData(i.id))
    : fields.some((f) => (fvFor(f.id)?.value ?? "") !== "");
  const hasOpenEditCheck = isRepeatingForm
    ? repeatingEntries.some((i) => instOpenEC(i.id))
    : fields.some((f) => !!editCheckFor(fvFor(f.id)?.id));
  const hasPendingDelta = isRepeatingForm
    ? repeatingEntries.some((i) => instPendingDelta(i.id))
    : fields.some((f) => deltaStateFor(f.id, fvFor(f.id)?.id) === "pending");
  const hasEmptyRequired = isRepeatingForm
    ? repeatingEntries.some((i) => instEmptyRequired(i.id))
    : fields.some((f) => f.is_required && isFieldVisible(f) && (fvFor(f.id)?.value ?? "") === "");
  // ─── Withdrawal-period food-safety HARD block (BR-2502) ─────────────────────
  // An animal still inside its drug withdrawal period must NOT be marked Shipped
  // (cleared for slaughter). Hard block — the CRC cannot override; only a DM can,
  // by recording a protocol deviation. The withdrawal end is read from the subject
  // (Withdrawal Period Confirmation form: last treatment + withdrawal-period days).
  const addDaysISO = (iso: string, days: number) => { const d = new Date(iso); if (Number.isNaN(d.getTime())) return null; d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
  const wdLastTx = subjectValueByCode("last_treatment_date");
  const wdDays = subjectValueByCode("withdrawal_period_days");
  const withdrawalEnd = subjectValueByCode("withdrawal_end_date") || (wdLastTx && wdDays && !Number.isNaN(Number(wdDays)) ? addDaysISO(wdLastTx, Number(wdDays)) : null);
  const periodActive = !!withdrawalEnd && todayISO() < withdrawalEnd;
  const dispField = fields.find((f) => f.code === "disposition");
  const dispositionVal = dispField ? (fvFor(dispField.id)?.value ?? "") : "";
  const isEosDispositionForm = selectedForm?.name === "End of Study / Final Disposition";
  const isWithdrawalConfirmForm = selectedForm?.name === "Withdrawal Period Confirmation";
  const shipHardBlock = isEosDispositionForm && dispositionVal === "Shipped" && periodActive;
  const withdrawalBlockBanner = shipHardBlock || (isWithdrawalConfirmForm && periodActive)
    ? `Cannot mark as Shipped — withdrawal period ends on ${withdrawalEnd}. This animal is not cleared for slaughter.`
    : null;

  // Treatment Administration (BR-2502 F4) cannot be submitted until the animal is
  // randomized — the test article is auto-populated from the assigned arm.
  const isTreatmentForm = fields.some((f) => f.validation?.autoFromArm);
  const treatmentArmMissing = isTreatmentForm && !valByCode("assigned_arm");

  const submitBlocked = hasOpenEditCheck || hasPendingDelta || hasEmptyRequired || shipHardBlock || treatmentArmMissing;
  const submitBlockReason = treatmentArmMissing ? "Complete randomization before treatment" : shipHardBlock ? "Withdrawal period active — cannot ship for slaughter" : hasEmptyRequired ? "Complete all required fields first" : hasOpenEditCheck ? "Resolve all edit checks first" : hasPendingDelta ? "Provide all change reasons first" : undefined;

  // Δ change-reason panel — all records for the field, chronological. Each pending
  // record is reasoned on its own; the top context shows the most recent transition.
  const deltaFv = deltaField ? fvFor(deltaField.id) : undefined;
  const deltaHistory = deltaFv
    ? dataset.deltaRecords.filter((r) => r.field_value_id === deltaFv.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    : [];
  const deltaPendingCount = deltaHistory.filter((r) => r.status === "pending").length;
  const deltaLatest = deltaHistory[deltaHistory.length - 1];
  const deltaOld = deltaLatest?.old_value ?? "";
  const deltaNew = deltaLatest?.new_value ?? (deltaFv?.value ?? "");
  const deltaCurState = deltaField ? deltaStateFor(deltaField.id, deltaFv?.id) : null;

  // CADESI-04 breakdown — write one lesion subtotal, then recompute the total as the
  // sum of all subtotals (using the new value for the edited one). When every subtotal
  // is cleared the total is left blank again, restoring manual entry.
  function commitCadesiSub(subField: FormFieldRow, totalField: FormFieldRow, subs: FormFieldRow[], value: string) {
    if (readOnly) return;
    setFieldValue(subField, value, true);
    const rawOf = (s: FormFieldRow) => (s.id === subField.id ? value : (fvFor(s.id)?.value ?? ""));
    const anyHasVal = subs.some((s) => rawOf(s).trim() !== "");
    const sum = subs.reduce((acc, s) => {
      const n = Number(rawOf(s));
      return acc + (rawOf(s).trim() !== "" && !Number.isNaN(n) ? n : 0);
    }, 0);
    setFieldValue(totalField, anyHasVal ? String(sum) : "", true);
  }

  function renderControl(field: FormFieldRow, value: string, queried: boolean, editcheck = false) {
    // Discrete controls write directly and settle on change → record the transition
    // atomically (pre-edit → new) and evaluate the edit check. Text/number inputs write
    // per keystroke (skipping the check), record one transition per focus→blur edit, and
    // evaluate the edit check on BLUR only (so the amber state never flickers mid-typing).
    const commit = (v: string) => setFieldValue(field, v, true);
    const typeChange = (v: string) => setFieldValue(field, v, false, true);
    const onFocus = () => { setEditingFieldId(field.id); snapshotTextFocus(field); };
    const onBlur = () => { setEditingFieldId(null); recordTextEdit(field); evalEditCheck(field); };
    // Edit check turns the input amber (amber-200 border + amber-50 bg); an open query
    // uses the deeper-amber .query. Edit check takes precedence (mutually exclusive).
    const stateCls = editcheck ? " editcheck" : queried ? " query" : "";
    const ro = readOnly;
    const type = field.field_type;
    const isCoded = !!field.validation?.coded;

    // Pen / Lot ID — a select sourced from the study's pens (livestock_group only).
    if (field.code === "pen_lot_id" && isLivestockGroup) {
      return (
        <select className={`field-select${stateCls}`} value={value} disabled={ro} onChange={(e) => commit(e.target.value)}>
          <option value="">—</option>
          {penOptions.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    // Test article (BR-2502 F4) — auto-populated from the subject's randomization
    // assigned_arm and locked read-only (prevents dispensing errors). If no
    // randomization form exists yet, prompt to complete it first (submit is blocked).
    if (field.validation?.autoFromArm) {
      const arm = valByCode("assigned_arm");
      return arm ? (
        <div className="field-calc auto-field">
          <span>{arm}</span>
          <span className="field-calc-tag">AUTO</span>
        </div>
      ) : (
        <div className="field-calc auto-field missing">
          <span>Complete randomization first</span>
          <span className="field-calc-tag warn">AUTO</span>
        </div>
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
        <div className={`yn-toggle${stateCls}`} role="group">
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
        <div className={`check-group${stateCls}`}>
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
        <select className={`field-select${stateCls}`} value={value} disabled={ro} onChange={(e) => commit(e.target.value)}>
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
          <input className={`field-input${stateCls}`} style={{ fontFamily: "var(--font-sans)" }} value={value} disabled={ro} onChange={(e) => typeChange(e.target.value)} onFocus={onFocus} onBlur={onBlur} />
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
          className={`field-input field-date${stateCls}`}
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
        className={`field-input${stateCls}`}
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

  // ─── Subject timeline (collapsible, above the form sidebar) ─────────────────
  const TL_DATE_CODES = ["visit_date", "screening_date", "consent_date", "randomization_date", "observation_date", "weighing_date", "dispensation_date", "completion_date", "date"];
  const instanceForForm = (formId: string) => dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId);
  const formDateValue = (formId: string): string | undefined => {
    const inst = instanceForForm(formId);
    if (!inst) return undefined;
    for (const code of TL_DATE_CODES) {
      const field = dataset.formFields.find((f) => f.form_id === formId && f.code === code);
      if (!field) continue;
      const v = dataset.fieldValues.find((x) => x.form_instance_id === inst.id && x.form_field_id === field.id)?.value;
      if (v) return v;
    }
    return undefined;
  };
  // Milestone forms = leaf forms that CAN carry a date (visit/screening/randomization/
  // EOS/…). Shown in protocol (sidebar) order whether or not they've been started, so
  // the timeline is never empty and reads as the full visit schedule, not just the
  // completed bits.
  const isMilestoneForm = (formId: string) => dataset.formFields.some((f) => f.form_id === formId && TL_DATE_CODES.includes(f.code));
  const timelineForms = orderedLeaves
    .filter((l) => isMilestoneForm(l.id))
    .map((l) => ({ id: l.id, name: l.name, icon: l.icon, queryCount: l.queryCount, date: formDateValue(l.id), started: !!instanceForForm(l.id), isRand: /randomization/i.test(l.name) }));
  // Enrolment is ALWAYS shown — fall back through any available date, else "—".
  const enrolledDate = timelineForms.find((l) => l.date)?.date
    ?? valByCode("enrollment_date") ?? valByCode("screening_date") ?? valByCode("randomization_date") ?? valByCode("placement_date");
  const subjInstIds = new Set(dataset.formInstances.filter((i) => i.subject_id === subjectId).map((i) => i.id));
  const subjOpenQueries = dataset.queries.filter((q) => subjInstIds.has(q.form_instance_id) && q.status !== "resolved").length;
  const aeFormIds = new Set(dataset.forms.filter((f) => f.study_id === studyId && /adverse event/i.test(f.name)).map((f) => f.id));
  const aeCount = dataset.formInstances.filter((i) => i.subject_id === subjectId && aeFormIds.has(i.form_id) && dataset.fieldValues.some((v) => v.form_instance_id === i.id && v.value)).length;
  const goToForm = (id: string) => { setSelectedFormId(id); setTimelineOpen(false); };

  return (
    <div className="sr-screen">
      {/* Form sidebar (timeline panel collapses in above the form tree) */}
      <nav className="form-sidebar" aria-label="Forms">
        {timelineOpen && (
          <div className="subject-timeline">
            <div className="tl-title"><i className="ti ti-timeline"></i> Timeline</div>
            <ul className="tl-list">
              {/* Enrolled — always shown (date or "—"), even for a brand-new subject. */}
              <li className="tl-item"><span className="tl-dot enrolled"></span><div className="tl-body"><span className="tl-label">Enrolled</span><span className="tl-date">{enrolledDate ?? "—"}</span></div></li>
              {timelineForms.map((f) => (
                <li className="tl-item clickable" key={f.id} onClick={() => goToForm(f.id)} title={f.started ? "Go to form" : "Not started — open to begin"}>
                  {f.started ? <StatusGlyph icon={f.icon} /> : <span className="tl-dot none" aria-label="Not started"></span>}
                  <div className="tl-body">
                    <span className={`tl-label${f.started ? "" : " muted"}`}>{f.name}</span>
                    <span className="tl-date">
                      {f.started
                        ? `${f.date ?? "—"}${f.isRand && displayArm ? ` · ${displayArm}` : ""}${f.queryCount > 0 ? ` · ${f.queryCount} quer${f.queryCount === 1 ? "y" : "ies"}` : ""}`
                        : "Not started"}
                    </span>
                  </div>
                </li>
              ))}
              {aeCount > 0 && <li className="tl-item"><span className="tl-dot ae"></span><div className="tl-body"><span className="tl-label">Adverse events</span><span className="tl-date">{aeCount} recorded</span></div></li>}
              {subjOpenQueries > 0 && <li className="tl-item"><span className="tl-dot query"></span><div className="tl-body"><span className="tl-label">Open queries</span><span className="tl-date">{subjOpenQueries}</span></div></li>}
              {withdrawalDate && <li className="tl-item"><span className="tl-dot withdrawn"></span><div className="tl-body"><span className="tl-label">Withdrawn</span><span className="tl-date">{withdrawalDate}{withdrawalReason ? ` · ${withdrawalReason}` : ""}</span></div></li>}
              {completionDate && <li className="tl-item"><span className="tl-dot completed"></span><div className="tl-body"><span className="tl-label">Completed</span><span className="tl-date">{completionDate}</span></div></li>}
            </ul>
          </div>
        )}
        <div className="sidebar-label">Forms</div>
        {sidebarTree.map(renderNode)}
      </nav>

      {/* Form content */}
      <div className="form-content">
        <div className="form-sticky-header">
          <nav className="sr-bc" aria-label="Breadcrumb">
            <button className="bc-btn" onClick={() => router.push(bcEntry)} type="button"><span>Data Entry</span></button>
            {bcSegments.map((seg) => (
              <Fragment key={seg.label}>
                <span className="bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
                <button className="bc-btn" onClick={() => router.push(seg.href)} type="button"><span>{seg.label}</span></button>
              </Fragment>
            ))}
            <span className="bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
            <span className="bc-cur">{subject.subject_code}</span>
          </nav>

          <div className="subject-header">
            <div className="species-icon">{SPECIES_ICON[species] || "🔬"}</div>
            <div className="subject-id-row">
              <span className="subject-id">{subject.subject_code}</span>
              <button className="subject-switch" onClick={() => setSwitcherOpen((o) => !o)} title="Switch subject" type="button">
                <i className="ti ti-arrows-exchange"></i>
              </button>
              {switcherOpen && (
                <>
                  <div className="switcher-backdrop" onClick={() => setSwitcherOpen(false)} />
                  <div className="subject-switcher" role="menu">
                    <div className="switcher-header">
                      <span className="switcher-label">Switch subject</span>
                      <input
                        className="switcher-search"
                        type="search"
                        placeholder="Search ID…"
                        value={switcherSearch}
                        onChange={(e) => setSwitcherSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="switcher-list">
                      {switcherFiltered.map((s) => {
                        const si = STATUS_MAP[s.status] || { cls: "status-screened", label: s.status };
                        const isActive = s.id === subjectId;
                        return (
                          <button
                            key={s.id}
                            className={`switcher-item${isActive ? " active-item" : ""}`}
                            type="button"
                            onClick={() => { setSwitcherOpen(false); router.push(`/study/${studyId}/data-entry/${s.id}`); }}
                          >
                            <span className="switcher-id">{s.subject_code}</span>
                            <span className="switcher-meta">{s.randomization_arm || (s.species ?? "")}</span>
                            <span className={`switcher-status ${si.cls}`}>{si.label}</span>
                            {isActive && <i className="ti ti-check" style={{ fontSize: 12, color: "var(--blue-600)", marginLeft: "auto" }}></i>}
                          </button>
                        );
                      })}
                      {switcherFiltered.length === 0 && <div className="switcher-empty">No matching subjects</div>}
                    </div>
                  </div>
                </>
              )}
            </div>
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
              {displayArm && (
                <>
                  <span className="meta-sep">·</span>
                  <span className={`subject-arm${displayArm === "Blinded" ? " blinded" : ""}${armUnblinded ? " revealed" : ""}`}>
                    {displayArm === "Blinded" && <i className="ti ti-eye-off" style={{ fontSize: "11px", marginRight: 3 }}></i>}
                    {armUnblinded && <i className="ti ti-eye-exclamation" style={{ fontSize: "11px", marginRight: 3 }}></i>}
                    {displayArm}{armUnblinded && " · unblinded"}
                  </span>
                </>
              )}
            </div>
            <div className="subject-actions">
              <button className={`btn-secondary${timelineOpen ? " active" : ""}`} type="button" onClick={() => setTimelineOpen((o) => !o)} title="Subject timeline" aria-pressed={timelineOpen}>
                <i className="ti ti-timeline" style={{ fontSize: "13px" }}></i> Timeline
              </button>
              {canUnblind && (
                <button className="btn-unblind" type="button" onClick={() => { setUnblindReason(""); setUnblindOpen(true); }} title="Emergency unblinding — reveal the treatment arm (DM / Admin)">
                  <i className="ti ti-eye-exclamation" style={{ fontSize: "13px" }}></i> Emergency Unblinding
                </button>
              )}
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
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-medium)" }}>{verifiedCount}/{sdvCellTotal} verified</span>
          </div>

          <div className="form-header">
            <h1 className="form-title">{selectedForm?.name || "Form"}</h1>
            {/* The Remarks dropdown + status CTA apply to the whole form — including
                repeating (log) forms, whose status/SDV roll up across every entry.
                Only the auto-generated Production Summary (read-only) has no toolbar. */}
            <div className="form-actions" style={isSummaryForm ? { display: "none" } : undefined}>
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
                  {/* SDV mode is a CRA-only responsibility — hidden for every other role (item 4) */}
                  {canSdv && (
                    <button className={`remarks-item${modeSdv ? " active-mode" : ""}`} onClick={() => setModeSdv((m) => !m)} type="button">
                      <span>SDV mode</span>{modeSdv && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                    </button>
                  )}
                </div>
              </div>

              {/* SDV toolbar — only in SDV mode, hidden for closed (completed/withdrawn) subjects */}
              {modeSdv && !subjectClosed && (
                <>
                  <button className="btn-secondary" type="button" disabled={!canSdv} onClick={verifyAll} title={canSdv ? "Verify all entered fields" : "SDV verify — CRA only"}>
                    Verify all
                  </button>
                  <button className="btn-primary" type="button" disabled={!canSdv} onClick={markSdvComplete} title={allSdvComplete ? "SDV marked complete" : "Mark source-data verification complete for this form"}>
                    {allSdvComplete ? <><i className="ti ti-shield-check-filled"></i> SDV complete</> : "Mark SDV complete"}
                  </button>
                </>
              )}

              {/* Status advance — hidden in SDV mode (the SDV buttons take its place)
                  and for closed (completed/withdrawn) subjects (no Submit/Finalize/Lock).
                  Submit for Review is otherwise always present (disabled when empty). */}
              {subjectClosed || modeSdv ? null : currentStatus === "empty" || currentStatus === "in_work" ? (
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
          {studyLocked && (
            <div className="ie-banner db-locked" role="status">
              <i className="ti ti-lock"></i>
              Database is locked — all forms are read-only pending statistical analysis. An administrator must unlock the study to resume data entry.
            </div>
          )}
          {subject.status === "withdrawn" && (
            <div className="ie-banner withdrawn" role="status">
              <i className="ti ti-user-x"></i>
              Subject withdrawn{withdrawalDate ? ` on ${withdrawalDate}` : ""}
              {withdrawalReason ? ` — ${withdrawalReason}` : ""}. Data collected prior to withdrawal is preserved for analysis.
            </div>
          )}
          {subject.status === "completed" && (
            <div className="ie-banner override" role="status">
              <i className="ti ti-circle-check"></i>
              Subject completed the study{completionDate ? ` (last visit ${completionDate})` : ""}. All forms are read-only.
            </div>
          )}
          {isEproForm && (
            <div className="ie-banner override" role="status">
              <i className="ti ti-device-mobile"></i>
              ePRO data is collected via the owner portal. Daily diary entries are transcribed by the
              investigator or uploaded from the owner-portal integration — these fields are read-only here.
            </div>
          )}
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
          {/* Withdrawal-period food-safety HARD block (BR-2502 EOS / Withdrawal Confirmation). */}
          {withdrawalBlockBanner && (
            <div className="ie-banner withdrawal-block" role="alert">
              <i className="ti ti-alert-octagon"></i>
              <div>
                <strong>{withdrawalBlockBanner}</strong>
                <div style={{ fontWeight: "var(--weight-regular,400)", marginTop: 2 }}>Food-safety hard stop — the CRC cannot override. A Data Manager must record a protocol deviation to release this animal.</div>
              </div>
            </div>
          )}
          {/* Assessment-day display (read-only) for recurring per-visit forms — the
              visit day is embedded in the form name; never editable, no Δ fires. */}
          {(() => {
            const m = selectedForm?.name?.match(/—\s*Day\s*(\d+)/);
            if (!m) return null;
            return (
              <div className="field" style={{ marginBottom: "var(--space-3,12px)" }}>
                <label className="field-label">Assessment day</label>
                <div style={{ fontWeight: "var(--weight-medium,600)", fontFamily: "var(--font-mono,monospace)" }}>Day {m[1]}</div>
              </div>
            );
          })()}
          {isSummaryForm ? (() => {
            // Aggregate across the weekly visit forms (read-only, auto-generated).
            const subjInst = (formId?: string) => (formId ? dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === formId) : undefined);
            const formByName = (name: string) => studyForms.find((f) => f.name === name);
            const vOf = (formId: string | undefined, instId: string | undefined, code: string): number | undefined => {
              if (!formId || !instId) return undefined;
              const fld = dataset.formFields.find((f) => f.form_id === formId && f.code === code);
              if (!fld) return undefined;
              const raw = dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fld.id)?.value;
              const nn = Number(raw);
              return raw != null && raw !== "" && !Number.isNaN(nn) ? nn : undefined;
            };
            const sOf = (formId: string | undefined, instId: string | undefined, code: string): string => {
              if (!formId || !instId) return "";
              const fld = dataset.formFields.find((f) => f.form_id === formId && f.code === code);
              return fld ? (dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fld.id)?.value ?? "") : "";
            };
            const penSetup = formByName("Pen Demographics & Setup");
            const baseline = formByName("Day 0 Baseline Weights & Feed");
            const birdsPlaced = vOf(penSetup?.id, subjInst(penSetup?.id)?.id, "birds_placed");
            const baseInst = subjInst(baseline?.id);
            const basePenW = vOf(baseline?.id, baseInst?.id, "total_pen_weight");
            const baseBirds = vOf(baseline?.id, baseInst?.id, "birds_alive");
            const placementAvg = basePenW != null && baseBirds ? (basePenW / baseBirds) * 1000 : 42;
            // Walk the scheduled weekly visits, building per-week rows + the rollup.
            const fmt = (v: number | undefined, dp = 0) => (v == null || Number.isNaN(v) || !Number.isFinite(v) ? "—" : v.toFixed(dp));
            let latestDay: number | undefined, latestPenW: number | undefined, latestAlive: number | undefined, feedTotal = 0, anyVisit = false;
            let prevPenW = basePenW;
            const weekRows = [7, 14, 21, 28, 35, 42].map((d, i) => {
              const bwForm = formByName(`Body Weight & Feed — Day ${d}`);
              const fhForm = formByName(`Flock Health & Litter — Day ${d}`);
              const bwInst = subjInst(bwForm?.id);
              const fhInst = subjInst(fhForm?.id);
              const penW = vOf(bwForm?.id, bwInst?.id, "total_pen_weight");
              const alive = vOf(bwForm?.id, bwInst?.id, "birds_alive");
              const has = penW != null;
              const avgBW = penW != null && alive ? Math.round((penW / alive) * 1000) : undefined;
              const beg = vOf(bwForm?.id, bwInst?.id, "beginning_feed_inventory");
              const add = vOf(bwForm?.id, bwInst?.id, "feed_added");
              const wbk = vOf(bwForm?.id, bwInst?.id, "feed_weighback");
              const consumed = beg != null && add != null && wbk != null ? beg + add - wbk : undefined;
              const gain = penW != null && prevPenW != null ? penW - prevPenW : undefined;
              const fcr = consumed != null && gain != null && gain > 0 ? consumed / gain : undefined;
              const row = {
                week: i + 1, day: d, has,
                date: sOf(bwForm?.id, bwInst?.id, "weighing_date"),
                avgBW, consumed, fcr,
                mort: sOf(bwForm?.id, bwInst?.id, "cumulative_mortality"),
                litter: sOf(fhForm?.id, fhInst?.id, "litter_condition_score"),
              };
              if (has) { anyVisit = true; latestDay = d; latestPenW = penW; latestAlive = alive; feedTotal += consumed ?? 0; prevPenW = penW; }
              return row;
            });
            // Total mortality from the Mortality & Cull repeating form (deaths + culls).
            const mortForm = formByName("Mortality & Cull Record");
            let cumMort = 0;
            if (mortForm) {
              for (const mi of dataset.formInstances.filter((x) => x.subject_id === subjectId && x.form_id === mortForm.id)) {
                cumMort += (vOf(mortForm.id, mi.id, "death_count") ?? 0) + (vOf(mortForm.id, mi.id, "cull_count") ?? 0);
              }
            }
            const currentAvg = latestPenW != null && latestAlive ? (latestPenW / latestAlive) * 1000 : undefined;
            const gainKg = latestPenW != null && basePenW != null ? latestPenW - basePenW : undefined;
            const overallFcr = feedTotal && gainKg ? feedTotal / gainKg : undefined;
            const livability = birdsPlaced ? ((birdsPlaced - cumMort) / birdsPlaced) * 100 : undefined;
            const epef = livability != null && currentAvg != null && overallFcr && latestDay ? (livability * (currentAvg / 1000) * 100) / (overallFcr * latestDay) : undefined;
            const vals: Record<string, string> = {
              birds_placed: birdsPlaced != null ? String(birdsPlaced) : "—",
              current_birds_alive: latestAlive != null ? String(latestAlive) : "—",
              total_mortality: anyVisit || cumMort ? String(cumMort) : "—",
              cumulative_mortality_pct: birdsPlaced ? fmt((cumMort / birdsPlaced) * 100, 1) : "—",
              total_feed_consumed: anyVisit ? fmt(feedTotal, 1) : "—",
              overall_fcr: fmt(overallFcr, 2),
              overall_adg: currentAvg != null && latestDay ? fmt((currentAvg - placementAvg) / latestDay, 1) : "—",
              livability_pct: fmt(livability, 1),
              epef: fmt(epef, 0),
            };
            const cellStyle: React.CSSProperties = { padding: "6px 10px", borderBottom: "1px solid var(--color-border,#eef2f7)", textAlign: "left", whiteSpace: "nowrap" };
            return (
              <>
                <div className="ie-banner override" role="status">
                  <i className="ti ti-sparkles"></i>
                  Auto-generated summary — updates as weekly data is entered. Read-only (no SDV, queries, or sign-off).
                </div>
                {/* Per-week table */}
                <div style={{ marginBottom: "var(--space-4,16px)", border: "1px solid var(--color-border,#e5e7eb)", borderRadius: "var(--radius-md,8px)", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs,0.8rem)" }}>
                    <thead>
                      <tr style={{ color: "var(--color-text-muted,#6b7280)" }}>
                        {["Week", "Day", "Date", "Avg BW g/bird", "Feed Consumed kg", "FCR", "Mortality", "Litter Score"].map((h, hi) => (
                          <th key={hi} style={{ ...cellStyle, fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {weekRows.map((r) => (
                        <tr key={r.day} style={{ color: r.has ? undefined : "var(--color-text-muted,#9ca3af)" }}>
                          <td style={{ ...cellStyle, fontWeight: 600 }}>{r.week}</td>
                          <td style={cellStyle}>D{r.day}</td>
                          <td style={cellStyle}>{r.date || "—"}</td>
                          <td style={cellStyle}>{r.avgBW != null ? r.avgBW : "—"}</td>
                          <td style={cellStyle}>{r.consumed != null ? r.consumed.toFixed(1) : "—"}</td>
                          <td style={cellStyle}>{r.fcr != null ? r.fcr.toFixed(2) : (r.has ? "N/A" : "—")}</td>
                          <td style={cellStyle}>{r.mort || "—"}</td>
                          <td style={cellStyle}>{r.litter || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Overall summary footer — same pattern as the mortality summary strip */}
                <div className="repeat-summary" style={{ display: "flex", gap: "var(--space-4,16px)", flexWrap: "wrap", padding: "var(--space-3,12px)", background: "var(--color-surface-alt,#f8fafc)", border: "1px solid var(--color-border,#e5e7eb)", borderRadius: "var(--radius-md,8px)", fontSize: "var(--text-sm,0.875rem)" }}>
                  {fields.map((field) => (
                    <span key={field.id}><span className="muted">{field.label}{field.unit ? ` (${field.unit})` : ""}:</span> <strong>{vals[field.code] ?? "—"}</strong></span>
                  ))}
                </div>
              </>
            );
          })() : isRepeatingForm ? (
            <div className="repeat-form">
              <div className="repeat-toolbar">
                <span className="repeat-count">
                  {repeatingEntries.length} {selectedForm?.name} {repeatingEntries.length === 1 ? "entry" : "entries"}
                </span>
                {!readOnly && (
                  <button className="btn-secondary" type="button" onClick={addEntry}>
                    <i className="ti ti-plus"></i> {repeatingAddLabel}
                  </button>
                )}
              </div>
              {repeatingEntries.length === 0 ? (
                <div className="repeat-empty">
                  <i className="ti ti-table"></i>
                  No {selectedForm?.name} entries yet.{!readOnly && " Use “Add” to create one."}
                </div>
              ) : (
                <table className="repeat-table">
                  <thead>
                    <tr>
                      {repeatingCols.map(([code, label]) => <th key={code}>{label}</th>)}
                      <th aria-label="Actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {repeatingEntries.map((inst) => (
                      <tr key={inst.id} onClick={() => setEntryInstanceId(inst.id)}>
                        {repeatingCols.map(([code]) => {
                          const f = fieldByCode(code);
                          const val = f ? entryVal(inst.id, f.id) : "";
                          return <td key={code}>{val ? <span className="repeat-val">{val}</span> : <span className="muted">—</span>}</td>;
                        })}
                        <td className="repeat-actions" onClick={(e) => e.stopPropagation()}>
                          <button className="repeat-btn" title="Edit entry" type="button" onClick={() => setEntryInstanceId(inst.id)}>
                            <i className="ti ti-pencil"></i>
                          </button>
                          {!readOnly && (
                            <button className="repeat-btn" title="Delete entry" type="button" onClick={() => setDeleteEntryId(inst.id)}>
                              <i className="ti ti-trash"></i>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {selectedForm?.name === "Mortality & Cull Record" && (() => {
                let deaths = 0, culls = 0;
                for (const inst of repeatingEntries) {
                  deaths += Number(entryVal(inst.id, fieldByCode("death_count")?.id ?? "")) || 0;
                  culls += Number(entryVal(inst.id, fieldByCode("cull_count")?.id ?? "")) || 0;
                }
                const penSetup = studyForms.find((f) => f.name === "Pen Demographics & Setup");
                const placed = penSetup ? numValFor(penSetup.id, "birds_placed") : undefined;
                const pct = placed ? (((deaths + culls) / placed) * 100).toFixed(1) : null;
                return (
                  <div className="repeat-summary" style={{ marginTop: "var(--space-3,12px)", display: "flex", gap: "var(--space-4,16px)", flexWrap: "wrap", padding: "var(--space-3,12px)", background: "var(--color-surface-alt,#f8fafc)", border: "1px solid var(--color-border,#e5e7eb)", borderRadius: "var(--radius-md,8px)", fontSize: "var(--text-sm,0.875rem)" }}>
                    <span><span className="muted">Cumulative deaths:</span> <strong>{deaths}</strong></span>
                    <span><span className="muted">Cumulative culls:</span> <strong>{culls}</strong></span>
                    <span><span className="muted">Birds placed:</span> <strong>{placed ?? "—"}</strong></span>
                    <span><span className="muted">Cumulative mortality:</span> <strong>{pct != null ? `${pct}%` : "—"}</strong></span>
                  </div>
                );
              })()}
            </div>
          ) : (
          <div className="field-grid-2">
            {fields.map((field, fIdx) => {
              if (!isFieldVisible(field)) return null; // conditional field (validation.showIf) not met
              // CADESI-04 lesion subtotals render inside the breakdown panel below the total.
              if (field.validation?.cadesiSub) return null;
              // DART "Recommended action" — coloured info banner (blue 0–1, amber 2, red 3).
              if (field.code === "dart_recommended_action") {
                const txt = calcValue(field);
                if (txt === "—") return null; // no score entered yet
                const src = field.validation?.dartSource ? fields.find((x) => x.code === field.validation?.dartSource) : undefined;
                const score = src ? (fvFor(src.id)?.value ?? "") : "";
                const tone = score === "3" ? "red" : score === "2" ? "amber" : "blue";
                return (
                  <div key={field.id} className={`dart-action ${tone}`} role="status">
                    <i className="ti ti-stethoscope" aria-hidden="true"></i>
                    <div className="dart-action-body">
                      <span className="dart-action-label">Recommended action</span>
                      <span className="dart-action-text">{txt}</span>
                    </div>
                  </div>
                );
              }
              // Overall eligibility verdict — three-state, computed live from the I/E
              // criteria: Incomplete (any unanswered) → Eligible (all answered + all pass)
              // → Ineligible (all answered, ≥1 fails). "Eligible" can never show on an
              // unfinished form, and "Ineligible" never masquerades for "not finished".
              if (field.code === "overall_eligibility") {
                const critF = fields.filter((x) => x.validation?.exclusion_criterion);
                if (!critF.length) return null;
                const pending = critF.filter((cf) => (fvFor(cf.id)?.value ?? "") === "");
                const failing = critF.filter((cf) => (fvFor(cf.id)?.value ?? "") === (cf.validation?.exclusion_if ?? "No"));
                const state = pending.length ? "incomplete" : failing.length ? "ineligible" : "eligible";
                const failNames = failing.map((f) => f.label).join(", ");
                return (
                  <div key={field.id} className={`elig-banner ${state}`} role="status">
                    <i className={`ti ${state === "eligible" ? "ti-circle-check" : state === "ineligible" ? "ti-circle-x" : "ti-clock"}`} aria-hidden="true"></i>
                    <div className="elig-banner-body">
                      <span>
                        {state === "incomplete"
                          ? `Eligibility pending — ${pending.length} ${pending.length === 1 ? "criterion" : "criteria"} not yet answered`
                          : state === "eligible"
                          ? "✓ Subject is eligible — proceed to randomization"
                          : `✗ Screen Failure — ${failNames} ${failing.length === 1 ? "does" : "do"} not meet criteria`}
                      </span>
                      {state === "incomplete" && (
                        <span className="elig-pending-list">Pending: {pending.map((p) => p.label).join(" · ")}</span>
                      )}
                    </div>
                  </div>
                );
              }
              // CADESI-04 total with a collapsible lesion-type breakdown (item 1). When any
              // subtotal is entered the total is the auto-sum; otherwise it stays a manual entry.
              if (field.validation?.cadesiTotal) {
                const csec = sectionForIdx(fIdx);
                const showCsec = !!csec && csec !== sectionForIdx(fIdx - 1);
                const subs = fields.filter((x) => x.validation?.cadesiSub);
                const totalFv = fvFor(field.id);
                const anySub = subs.some((s) => (fvFor(s.id)?.value ?? "").trim() !== "");
                const sum = subs.reduce((acc, s) => { const raw = fvFor(s.id)?.value ?? ""; const n = Number(raw); return acc + (raw.trim() !== "" && !Number.isNaN(n) ? n : 0); }, 0);
                // Severity band from the effective total (validated ICADA benchmarks).
                const effTotal = anySub ? sum : Number(totalFv?.value);
                const hasTotal = anySub || (totalFv?.value ?? "").trim() !== "";
                const band = !hasTotal || Number.isNaN(effTotal) ? null
                  : effTotal < 10 ? { label: "Normal / remission", cls: "green" }
                  : effTotal < 35 ? { label: "Mild", cls: "green" }
                  : effTotal < 60 ? { label: "Moderate", cls: "amber" }
                  : { label: "Severe", cls: "red" };
                return (
                  <Fragment key={field.id}>
                    {showCsec && <div className="form-section-title">{csec}</div>}
                    <div className={`field cadesi-field${readOnly ? " state-locked" : ""}`}>
                      <label className="field-label">{field.label}{field.is_required && <span className="field-req"> *</span>}</label>
                      <div className="field-row">
                        {anySub ? (
                          <div className="field-calc"><span>{sum}</span><span className="field-calc-tag">sum</span></div>
                        ) : (
                          renderControl(field, totalFv?.value ?? "", false, !!editCheckFor(totalFv?.id))
                        )}
                        {band && <span className={`cadesi-band ${band.cls}`}>{band.label}</span>}
                        <button type="button" className="cadesi-toggle" onClick={() => setCadesiOpen((o) => !o)} aria-expanded={cadesiOpen}>
                          {cadesiOpen ? "Hide breakdown ▴" : "Show breakdown ▾"}
                        </button>
                      </div>
                      <span className="field-hint">{field.validation?.hint}</span>
                      {cadesiOpen && (
                        <div className="cadesi-breakdown">
                          {subs.map((s) => {
                            const sv = fvFor(s.id)?.value ?? "";
                            const subEc = editCheckFor(fvFor(s.id)?.id);
                            return (
                              <div className="cadesi-sub" key={s.id}>
                                <label className="cadesi-sub-label">{s.label}</label>
                                <input
                                  className={`field-input${subEc ? " editcheck" : ""}`}
                                  inputMode="decimal"
                                  value={sv}
                                  disabled={readOnly}
                                  onChange={(e) => commitCadesiSub(s, field, subs, e.target.value)}
                                />
                                {subEc && (
                                  <span className="cadesi-sub-ec"><i className="ti ti-alert-circle"></i> {subEc.message || "Subtotal exceeds the maximum for this lesion type (0–60) — verify."}</span>
                                )}
                              </div>
                            );
                          })}
                          <div className="cadesi-sum-row"><span>Total (auto)</span><strong>{sum}</strong></div>
                        </div>
                      )}
                    </div>
                  </Fragment>
                );
              }
              const section = sectionForIdx(fIdx);
              const showSection = !!section && section !== sectionForIdx(fIdx - 1);
              const fv = fvFor(field.id);
              const value = fv?.value ?? "";
              const ec = editCheckFor(fv?.id); // open auto edit-check (orange alert)
              const dispQ = fieldQueryFor(fv?.id); // any query: open | responded | resolved
              const raised = dispQ?.status === "open"; // an open query tints the field amber (edit checks use the orange indicator)
              const sdvRec = sdvRecordFor(fv?.id);
              const verified = !!sdvRec;
              const dState = deltaStateFor(field.id, fv?.id);
              const showInteractiveSdv = isSdvEligible(field) && !readOnly && modeSdv;
              const showStaticSdv = isSdvEligible(field) && verified && !showInteractiveSdv;
              const sdvBlock = sdvBlockReason(field, fv?.id); // null if clean
              const numeric = field.field_type === "number" || field.field_type === "integer";
              const hint = rangeLabel(field, species, dataset.speciesRanges, subjectAgeMonths) ?? (numeric && field.unit ? field.unit : null);
              const helpHint = field.validation?.hint ?? null; // persistent help text (score-scale legend, etc.)
              const isWide = field.field_type === "textarea" || field.field_type === "multiselect";
              const deltaTitle = dState === "approved" ? "Change approved by DM" : dState === "responded" ? "Change reason submitted — awaiting DM review" : "Change reason required";
              return (
                <Fragment key={field.id}>
                  {showSection && <div className="form-section-title">{section}</div>}
                <div className={`field${isWide ? " full" : ""}${readOnly ? " state-locked" : ""}`}>
                  <label className="field-label">
                    {field.label}
                    {field.is_required && <span className="field-req"> *</span>}
                  </label>
                  <div className="field-row">
                    {renderControl(field, value, raised, !!ec)}
                    {showInteractiveSdv && (
                      <button
                        className={`sdv-btn visible${verified ? " verified" : ""}${(sdvBlock || value.trim() === "") && !verified ? " blocked" : ""}`}
                        onClick={() => toggleSdv(field)}
                        disabled={!canSdv || (!verified && (value.trim() === "" || !!sdvBlock))}
                        title={!canSdv ? "SDV verify — CRA only" : verified ? "SDV verified — click to undo" : value.trim() === "" ? "Enter a value before verifying" : sdvBlock ?? "SDV: click to verify"}
                        type="button"
                      >
                        <i className={`ti ${verified ? "ti-shield-check-filled" : "ti-shield"}`}></i>
                      </button>
                    )}
                    {showStaticSdv && (
                      <span className="sdv-static" title="SDV verified"><i className="ti ti-shield-check-filled"></i></span>
                    )}
                    {!readOnly && dState && (
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
                        [{ecCodeFor(ec.id)}] {ec.message || `Value outside expected range${hint ? ` (${hint})` : ""}`}
                      </span>
                    </div>
                  ) : dispQ && dispQ.status !== "resolved" ? (
                    <div className="field-state state-query">
                      <i className="ti ti-info-circle"></i>
                      <span className="query-link" onClick={() => { setPanelField(field); setPanelKind("query"); }}>
                        {dispQ.status === "open" ? `[${qCodeFor(dispQ.id)}] ${dispQ.title}` : `[${qCodeFor(dispQ.id)}] open — view thread`}
                      </span>
                    </div>
                  ) : helpHint ? (
                    <span className="field-hint">{helpHint}</span>
                  ) : (
                    hint && <span className="field-hint">{hint}</span>
                  )}
                  {modeSdv && verified && (
                    <span className="sdv-verified-note">
                      Verified by {sdvRec?.verified_by_name ?? ndaName} · {sdvRec?.verified_at ?? todayISO()}
                    </span>
                  )}
                </div>
                </Fragment>
              );
            })}
          </div>
          )}
        </div>
      </div>

      {/* Repeating-form entry panel (420px slide-in — full field set for one entry) */}
      <div className={`panel-overlay${entryInstanceId ? " open" : ""}`} onClick={() => setEntryInstanceId(null)}></div>
      <div className={`slide-panel entry-panel${entryInstanceId ? " open" : ""}`}>
        {entryInstanceId && (
          <>
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-title">{selectedForm?.name} entry</div>
              </div>
              <button className="panel-close" onClick={() => setEntryInstanceId(null)} type="button"><i className="ti ti-x"></i></button>
            </div>
            <div className="entry-panel-body">
              {fields.map((field) => (
                <div className="entry-field" key={field.id}>
                  <label className="field-label">
                    {field.label}
                    {field.is_required && <span className="field-req"> *</span>}
                  </label>
                  {renderEntryControl(field, entryInstanceId)}
                </div>
              ))}
            </div>
            <div className="entry-panel-footer">
              <button className="btn-primary" type="button" onClick={() => setEntryInstanceId(null)}>Done</button>
            </div>
          </>
        )}
      </div>

      {/* Delete-entry confirmation */}
      {deleteEntryId && (
        <div className="sr-modal-overlay" onClick={() => setDeleteEntryId(null)}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Delete entry">
            <div className="sr-modal-title"><i className="ti ti-trash"></i> Delete {selectedForm?.name} entry?</div>
            <div className="sr-modal-body">
              This removes the entry and its data from the session. This can’t be undone.
            </div>
            <div className="sr-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setDeleteEntryId(null)}>Cancel</button>
              <button className="btn-primary danger" type="button" onClick={confirmDeleteEntry}><i className="ti ti-trash"></i> Delete</button>
            </div>
          </div>
        </div>
      )}

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
          ) : panelQueries.length > 0 ? (
            // Every query on the field, oldest → newest, each with its full thread.
            panelQueries.map((q) => (
              <div className="query-block" key={q.id}>
                <div className="query-block-head">
                  <span className="query-id">{qCodeFor(q.id)}</span>
                  <span className={`query-status ${QS_CLS[q.status] || "qs-open"}`}>{STATUS_CAP(q.status)}</span>
                </div>
                {msgsForQuery(q.id).map((m) => {
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
                })}
              </div>
            ))
          ) : (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No query has been raised on this field yet.</p>
          )}
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
          ) : activeRole === "DM" ? (
            // DM: every action is explicit — a Manage dropdown, never auto-resolve.
            <>
              <div className="compose-context"><i className="ti ti-user-circle"></i> Managing as DM</div>
              <textarea className="compose-textarea" placeholder="Add a comment…" value={reply} onChange={(e) => setReply(e.target.value)}></textarea>
              <div className="compose-btns">
                <span className="compose-sub">Shift+Enter for new line</span>
                <div className="manage-q-wrap">
                  <button className="btn-respond" type="button" onClick={() => setManageOpenQuery((o) => !o)}>Manage <i className="ti ti-chevron-down" style={{ fontSize: "11px" }}></i></button>
                  {manageOpenQuery && <div className="manage-q-backdrop" onClick={() => setManageOpenQuery(false)} />}
                  <div className={`manage-q-menu${manageOpenQuery ? " open" : ""}`} role="menu">
                    <button className="manage-item" type="button" onClick={() => { respondQuery(panelQuery.id); setManageOpenQuery(false); }}><i className="ti ti-message"></i> Respond</button>
                    <button className="manage-item" type="button" disabled={!panelHasResponse} title={panelHasResponse ? undefined : "A response is required before resolving"} onClick={() => { if (panelHasResponse) { resolveQuery(panelQuery.id); setManageOpenQuery(false); } }}><i className="ti ti-flag-check"></i> Resolve</button>
                    <button className="manage-item" type="button" onClick={() => { setManageOpenQuery(false); setCloseReason(""); setCloseModalOpen(true); }}><i className="ti ti-square-x"></i> Close without response</button>
                    <div className="manage-sep"></div>
                    <button className="manage-item" type="button" onClick={() => { setManageOpenQuery(false); setToast("Reassign — coming soon"); }}><i className="ti ti-user-share"></i> Reassign</button>
                    <button className="manage-item" type="button" onClick={() => { setManageOpenQuery(false); setToast("Escalate to PI — coming soon"); }}><i className="ti ti-arrow-up-circle"></i> Escalate to PI</button>
                  </div>
                </div>
              </div>
            </>
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
                </div>
              </div>
            </>
          ) : (
            <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>
          )}
        </div>
      </div>

      {/* Change-reason (Δ) panel — one card per transition, each reasoned on its own */}
      <div className={`panel-overlay${deltaField ? " open" : ""}`} onClick={() => setDeltaField(null)}></div>
      <div className={`delta-panel${deltaField ? " open" : ""}`}>
        <div className="delta-panel-header">
          <span className="delta-panel-name">Change reason</span>
          <span className="delta-id">Δ-{(deltaField?.code ?? "").toUpperCase()}</span>
          <button className="panel-close-btn" onClick={() => setDeltaField(null)} type="button"><i className="ti ti-x"></i></button>
        </div>
        <div className="delta-status-bar">
          <span className={`delta-status-badge ${deltaCurState === "approved" ? "ds-approved" : deltaCurState === "responded" ? "ds-answered" : "ds-change-required"}`}>
            {deltaCurState === "approved" ? "Approved" : deltaCurState === "responded" ? "Answered" : "Change reason"}
          </span>
          <span className="delta-status-desc">
            {deltaCurState === "approved"
              ? "All changes approved by the data manager"
              : deltaPendingCount > 0
                ? `${deltaPendingCount} change${deltaPendingCount > 1 ? "s" : ""} need${deltaPendingCount > 1 ? "" : "s"} a reason from ${activeRole}`
                : "Awaiting DM review"}
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
          {deltaHistory.length === 0 && (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No change reason for this field.</p>
          )}
          {deltaHistory.map((r) => {
            // Every pending transition renders as its own dashed-red card — one
            // consistent format regardless of how many changes are pending (mirrors
            // the paper-CRF correction convention; rationale in CASE_STUDY.md).
            if (r.status === "pending") {
              return (
                <div className="delta-entry pending" key={r.id}>
                  <div className="delta-entry-change">
                    <span className="delta-entry-old">{r.old_value || "—"}</span>
                    <span className="delta-entry-arrow">→</span>
                    <span className="delta-entry-new">{r.new_value || "—"}</span>
                  </div>
                  <div className="delta-compose-hint">Reason for this change — {activeRole} · {ndaName}</div>
                  <textarea
                    className="delta-textarea"
                    placeholder="Enter reason for this change…"
                    value={recordReasons[r.id] ?? ""}
                    onChange={(e) => setRecordReasons((prev) => ({ ...prev, [r.id]: e.target.value }))}
                  ></textarea>
                  <div className="delta-compose-actions">
                    <span className="delta-status-badge ds-change-required">Reason required</span>
                    <button className="delta-btn-submit" type="button" disabled={!(recordReasons[r.id] ?? "").trim()} onClick={() => submitReasonForRecord(r.id)}>Submit reason</button>
                  </div>
                </div>
              );
            }
            // Responded / approved → always a card.
            return (
              <div className="delta-entry" key={r.id}>
                <div className="delta-entry-change">
                  <span className="delta-entry-old">{r.old_value || "—"}</span>
                  <span className="delta-entry-arrow">→</span>
                  <span className="delta-entry-new">{r.new_value || "—"}</span>
                </div>
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
            );
          })}
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
      <div className={`panel-overlay${lookupField ? " open" : ""}`} onClick={() => { setLookupField(null); setLookupInstId(null); }}></div>
      <div className={`slide-panel lookup-panel${lookupField ? " open" : ""}`} style={lookupInstId ? { zIndex: 217 } : undefined}>
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="panel-title">VeDDRA lookup</div>
            <div className="panel-title-meta"><span className="fc-code">{(lookupField?.code ?? "").toUpperCase()}</span></div>
          </div>
          <button className="panel-close" onClick={() => { setLookupField(null); setLookupInstId(null); }} type="button"><i className="ti ti-x"></i></button>
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
              onClick={() => {
                if (!lookupField) return;
                if (lookupInstId) setEntryVal(lookupInstId, lookupField, t);
                else setFieldValue(lookupField, t);
                setLookupField(null);
                setLookupInstId(null);
              }}
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

      {/* Emergency unblinding — DM/Admin only, double-blind study only */}
      {unblindOpen && (
        <div className="sr-modal-overlay" onClick={() => { setUnblindOpen(false); setUnblindReason(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Emergency unblinding">
            <div className="sr-modal-title" style={{ color: "var(--red-600)" }}><i className="ti ti-eye-exclamation"></i> Emergency Unblinding</div>
            <div className="sr-modal-body">
              This action will reveal the treatment arm for <strong>{subject.subject_code}</strong> and create a permanent audit entry. <strong>This action cannot be undone.</strong>
              <div style={{ marginTop: "var(--space-2)", color: "var(--color-text-tertiary)", fontSize: "var(--text-xs)" }}>
                <i className="ti ti-eye-off" style={{ fontSize: "12px", marginRight: 4 }}></i>
                The treatment arm will only be visible to DM and Admin roles. Other roles will continue to see the blinded view.
              </div>
            </div>
            <textarea
              className="compose-textarea"
              placeholder="Reason for unblinding (required)…"
              value={unblindReason}
              onChange={(e) => setUnblindReason(e.target.value)}
              autoFocus
            ></textarea>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="btn-secondary" type="button" onClick={() => { setUnblindOpen(false); setUnblindReason(""); }}>Cancel</button>
              <button className="btn-unblind solid" type="button" disabled={!unblindReason.trim()} onClick={confirmUnblind}><i className="ti ti-eye-exclamation" style={{ fontSize: "13px" }}></i> Confirm unblinding</button>
            </div>
          </div>
        </div>
      )}

      {/* DM: Close query without response — requires an auditable reason */}
      {closeModalOpen && panelQuery && (
        <div className="sr-modal-overlay" onClick={() => { setCloseModalOpen(false); setCloseReason(""); }}>
          <div className="sr-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Close query without response">
            <div className="sr-modal-title"><i className="ti ti-square-x"></i> Close without response</div>
            <div className="sr-modal-body">
              Closing <strong>{qCodeFor(panelQuery.id)}</strong> without a response is exceptional. A documented reason is required and stored on the query thread for audit.
            </div>
            <textarea
              className="compose-textarea"
              placeholder="Document the reason for closing without a response…"
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
              autoFocus
            ></textarea>
            <div className="sr-modal-actions" style={{ marginTop: "var(--space-4)" }}>
              <button className="btn-secondary" type="button" onClick={() => { setCloseModalOpen(false); setCloseReason(""); }}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!closeReason.trim()} onClick={() => confirmCloseWithoutResponse(panelQuery.id)}>Close query</button>
            </div>
          </div>
        </div>
      )}

      {/* Transient toast (stubs) */}
      {toast && <div className="sr-toast" role="status">{toast}</div>}
    </div>
  );
}
