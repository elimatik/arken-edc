"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { hierarchyLevels } from "@/lib/terminology";
import "./data-entry.css";

// ─── Types ───────────────────────────────────────────────────────────────────
type FormStatus = "complete" | "incomplete" | "not-started";
interface FormItem {
  id: string;
  name: string;
  status: FormStatus;
}
interface Node {
  id: string;
  code: string;
  label: string;
  level: number;
  status: string;
  childCount?: number; // immediate children (barns / pens / subjects)
  subjectCount?: number; // subjects beneath this node
  subjectId?: string;
  arm?: string | null;
  forms?: FormItem[];
  ineligible?: boolean;
}

// ─── Status mapping (instance_status → prototype's 3 buckets) ────────────────
function mapInstanceStatus(s?: string): FormStatus {
  if (!s || s === "empty") return "not-started";
  if (s === "in_work") return "incomplete";
  return "complete"; // reviewed / finalized / locked
}
const BADGE_CLS: Record<string, string> = {
  active: "badge-active",
  enrolled: "badge-active",
  randomized: "badge-active",
  screening: "badge-pending",
  pending: "badge-pending",
  completed: "badge-success",
  withdrawn: "badge-closed",
  "on-hold": "badge-hold",
};
function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
}

export default function DataEntryPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const { study, selectedSiteId, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const siteParam = useSearchParams().get("site"); // ?site=<id> pre-filters a site (e.g. from the Subject Record breadcrumb)

  const [nav, setNav] = useState<{ key: string; label: string }[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Add-record modal: "site" (Admin) or "container" (barn/pen/stable/stall, CRC/DM/Admin).
  const [addOpen, setAddOpen] = useState<"site" | "container" | null>(null);
  const [fName, setFName] = useState("");
  const [fNumber, setFNumber] = useState("");
  const [fPi, setFPi] = useState("");
  const [fLocation, setFLocation] = useState("");

  const loading = !ready;

  // Drill straight into a site when one is pre-selected — either pinned in the
  // topbar or passed via ?site=<id> (the breadcrumb link). Otherwise start at the
  // site-level root.
  useEffect(() => {
    if (!ready) return;
    const targetSiteId = siteParam || selectedSiteId;
    if (targetSiteId) {
      const site = dataset.sites.find((s) => s.id === targetSiteId && s.study_id === studyId);
      setNav(site ? [{ key: site.id, label: site.name }] : []);
    } else {
      setNav([]);
    }
    setSearch("");
    setStatusFilter("");
    // Intentionally NOT depending on dataset.sites: update() re-clones the dataset
    // (new array reference) on every edit, and re-running this would reset the
    // drill-down nav to root after adding a barn/pen/subject. Only the topbar
    // site / ?site param / hydration (ready) should reset the nav.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteParam, selectedSiteId, ready, studyId]);

  // ─── Build the hierarchy for this study from the session store ──────────────
  const { type, nodesByParent } = useMemo((): {
    type: "livestock" | "companion";
    nodesByParent: Record<string, Node[]>;
  } => {
    if (!ready) return { type: "livestock", nodesByParent: {} };

    const studyRow = dataset.studies.find((s) => s.id === studyId);
    const studyType: "livestock" | "companion" =
      studyRow?.type === "companion" ? "companion" : "livestock";
    // livestock_group: the PEN is the subject (experimental unit). The hierarchy
    // ends at Pen — a pen row opens the Subject Record directly, no nested table.
    const isGroup = studyRow?.type === "livestock_group";

    const sites = dataset.sites
      .filter((s) => s.study_id === studyId)
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code));
    const subjects = dataset.subjects
      .filter((s) => s.study_id === studyId)
      .slice()
      .sort((a, b) => a.subject_code.localeCompare(b.subject_code));
    const allForms = dataset.forms
      .filter((f) => f.study_id === studyId && (f.scope ?? "subject") === "subject") // only subject forms count toward pen progress
      .slice()
      .sort((a, b) => a.sequence - b.sequence);
    // Group containers have no fields/instances — count only leaf (sub-)forms.
    const groupIds = new Set(allForms.map((f) => f.parent_form_id).filter(Boolean) as string[]);
    const forms = allForms.filter((f) => !groupIds.has(f.id));

    const siteIds = new Set(sites.map((s) => s.id));
    const barns =
      studyType === "livestock" ? dataset.barns.filter((b) => siteIds.has(b.site_id)) : [];
    const barnIds = new Set(barns.map((b) => b.id));
    const pens =
      studyType === "livestock" ? dataset.pens.filter((p) => barnIds.has(p.barn_id)) : [];
    const subjectIdSet = new Set(subjects.map((s) => s.id));
    const instances = dataset.formInstances.filter((i) => i.subject_id != null && subjectIdSet.has(i.subject_id));

    // Per-subject form list = every study form, with status from its instance.
    const subjectForms = (subjId: string): FormItem[] =>
      forms.map((f) => {
        const inst = instances.find((i) => i.subject_id === subjId && i.form_id === f.id);
        return { id: f.id, name: f.name, status: mapInstanceStatus(inst?.status) };
      });

    const subjectIdx = studyType === "companion" ? 1 : isGroup ? 2 : 3;
    const subjectNode = (s: (typeof subjects)[number]): Node => ({
      id: s.id,
      code: s.subject_code,
      label: s.subject_code,
      level: subjectIdx,
      status: s.status,
      subjectId: s.subject_code,
      arm: s.randomization_arm,
      forms: subjectForms(s.id),
      ineligible: s.ineligible,
    });

    const map: Record<string, Node[]> = {};

    if (studyType === "livestock") {
      map["root"] = sites.map((site) => ({
        id: site.id,
        code: site.code,
        label: site.name,
        level: 0,
        status: site.status,
        childCount: barns.filter((b) => b.site_id === site.id).length,
        subjectCount: subjects.filter((x) => x.site_id === site.id).length,
      }));
      barns.forEach((b) => {
        (map[b.site_id] = map[b.site_id] || []).push({
          id: b.id,
          code: b.code,
          label: b.name,
          level: 1,
          status: "active",
          childCount: pens.filter((p) => p.barn_id === b.id).length,
          subjectCount: subjects.filter((x) => x.barn_id === b.id).length,
        });
      });
      if (isGroup) {
        // The pen IS the subject — render each pen-subject directly under its
        // barn (no intermediate pen-container level). Clicking opens the record.
        subjects.forEach((s) => {
          if (!s.barn_id) return;
          const pen = pens.find((p) => p.id === s.pen_id);
          (map[s.barn_id] = map[s.barn_id] || []).push({
            ...subjectNode(s),
            label: pen?.name ?? s.subject_code,
          });
        });
      } else {
        pens.forEach((p) => {
          (map[p.barn_id] = map[p.barn_id] || []).push({
            id: p.id,
            code: p.code,
            label: p.name,
            level: 2,
            status: "active",
            childCount: subjects.filter((x) => x.pen_id === p.id).length,
          });
        });
        subjects.forEach((s) => {
          if (!s.pen_id) return;
          (map[s.pen_id] = map[s.pen_id] || []).push(subjectNode(s));
        });
      }
    } else {
      map["root"] = sites.map((site) => {
        const n = subjects.filter((x) => x.site_id === site.id).length;
        return {
          id: site.id,
          code: site.code,
          label: site.name,
          level: 0,
          status: site.status,
          childCount: n,
          subjectCount: n,
        };
      });
      subjects.forEach((s) => {
        if (!s.site_id) return;
        (map[s.site_id] = map[s.site_id] || []).push(subjectNode(s));
      });
    }

    return { type: studyType, nodesByParent: map };
  }, [dataset, ready, studyId]);

  // Level labels are terminology-driven (equine → Site/Stable/Stall/Animal).
  const studyRow = ready ? dataset.studies.find((s) => s.id === studyId) : undefined;
  const isGroup = studyRow?.type === "livestock_group";
  const levels = hierarchyLevels(studyRow);
  const subjectIdx = levels.length - 1;
  const currentKey = nav.length ? nav[nav.length - 1].key : "root";

  function findNode(id: string): Node | null {
    for (const k of Object.keys(nodesByParent)) {
      const n = nodesByParent[k].find((x) => x.id === id);
      if (n) return n;
    }
    return null;
  }

  const parentNode = nav.length ? findNode(nav[nav.length - 1].key) : null;

  // Enrollment gate — at the site level, warn when the Site Initiation Visit is
  // not complete (no SIV instance, or "Site approved to enroll" ≠ Yes).
  const sivIncomplete = (() => {
    if (!ready || !parentNode || parentNode.level !== 0) return false;
    const sivForm = dataset.forms.find((f) => f.study_id === studyId && f.scope === "site" && f.name === "Site Initiation Visit (SIV) Checklist");
    if (!sivForm) return false;
    const inst = dataset.formInstances.find((i) => i.form_id === sivForm.id && i.site_id === parentNode.id);
    if (!inst) return true;
    const fld = dataset.formFields.find((f) => f.form_id === sivForm.id && f.code === "site_approved_to_enroll");
    const v = fld ? dataset.fieldValues.find((x) => x.form_instance_id === inst.id && x.form_field_id === fld.id)?.value : undefined;
    return v !== "Yes";
  })();

  function drillInto(node: Node) {
    // Subjects open their full Subject Record; containers drill in place.
    if (node.level === subjectIdx) {
      router.push(`/study/${studyId}/data-entry/${node.id}`);
      return;
    }
    setNav([...nav, { key: node.id, label: node.label }]);
    setSearch("");
    setStatusFilter("");
  }
  function goRoot() {
    setNav([]);
    setSearch("");
    setStatusFilter("");
  }
  function goDepth(i: number) {
    setNav(nav.slice(0, i + 1));
    setSearch("");
    setStatusFilter("");
  }

  // Items at the current level (filtered).
  let items = nodesByParent[currentKey] || [];
  const q = search.toLowerCase().trim();
  items = items.filter((n) => {
    const labelMatch = !q || n.label.toLowerCase().includes(q) || (n.subjectId || "").toLowerCase().includes(q);
    const statusMatch = !statusFilter || n.status === statusFilter;
    return labelMatch && statusMatch;
  });

  const listLevelName = parentNode ? levels[parentNode.level + 1] || levels[subjectIdx] : levels[0];
  const childLevel = parentNode ? parentNode.level + 1 : 0;

  // ─── Add-record permissions (per level) ─────────────────────────────────────
  const addLevel: "site" | "container" | "subject" =
    childLevel === 0 ? "site" : childLevel === subjectIdx ? "subject" : "container";
  const canAdd =
    addLevel === "site"
      ? activeRole === "Admin" // Add Site — Admin only
      : addLevel === "subject"
      ? ["CRC", "CRA", "Admin"].includes(activeRole) // Add Animal / Subject
      : ["CRC", "DM", "Admin"].includes(activeRole); // Add Barn / Pen / Stable / Stall

  function onAddClick() {
    if (addLevel === "subject") {
      // New empty subject — created in session, opens its Subject Record (like "Add Study").
      const id = crypto.randomUUID();
      const studySubjects = dataset.subjects.filter((s) => s.study_id === studyId);
      const code = `${study.code}-${String(studySubjects.length + 1).padStart(3, "0")}`;
      let site_id: string | null = null;
      let barn_id: string | null = null;
      let pen_id: string | null = null;
      const newPenId = crypto.randomUUID();
      if (type === "companion") {
        site_id = parentNode?.id ?? null;
      } else if (isGroup) {
        // The "subject" is a pen — parentNode is the barn. Create a fresh pen
        // under it and attach the pen-subject to that pen.
        barn_id = parentNode?.id ?? null;
        site_id = dataset.barns.find((b) => b.id === barn_id)?.site_id ?? null;
        pen_id = newPenId;
      } else {
        pen_id = parentNode?.id ?? null;
        const pen = dataset.pens.find((p) => p.id === pen_id);
        barn_id = pen?.barn_id ?? null;
        site_id = dataset.barns.find((b) => b.id === barn_id)?.site_id ?? null;
      }
      update((d) => {
        if (isGroup && barn_id) {
          const penCode = `P${String(d.pens.filter((p) => p.barn_id === barn_id).length + 1).padStart(2, "0")}`;
          d.pens.push({ id: newPenId, barn_id, code: penCode, name: `Pen ${penCode.slice(1)}` });
        }
        d.subjects.push({
          id, study_id: studyId, site_id, barn_id, pen_id, owner_id: null,
          subject_code: code, species: studyRow?.species ?? null, status: "screening", randomization_arm: null,
        });
      });
      router.push(`/study/${studyId}/data-entry/${id}`);
      return;
    }
    setFName(""); setFNumber(""); setFPi(""); setFLocation("");
    setAddOpen(addLevel);
  }

  // NOTE: Full site management (staff, activation, configuration) lives in the
  // Admin-only Sites section (/sites). This site-level add path only renders for
  // Admin, who manages structure there — clinical roles can't add sites here.
  function createSite() {
    if (!fName.trim() || !fNumber.trim()) return;
    update((d) => {
      d.sites.push({
        id: crypto.randomUUID(), study_id: studyId, code: fNumber.trim(), name: fName.trim(),
        status: "active", location: fLocation.trim() || null, principal_investigator: fPi.trim() || null,
      });
    });
    setAddOpen(null);
  }

  function createContainer() {
    if (!fName.trim() || !parentNode) return;
    update((d) => {
      if (childLevel === 1) {
        const code = `B${d.barns.filter((b) => b.site_id === parentNode.id).length + 1}`;
        d.barns.push({ id: crypto.randomUUID(), site_id: parentNode.id, code, name: fName.trim() });
      } else {
        const code = `P${d.pens.filter((p) => p.barn_id === parentNode.id).length + 1}`;
        d.pens.push({ id: crypto.randomUUID(), barn_id: parentNode.id, code, name: fName.trim() });
      }
    });
    setAddOpen(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="de-screen">
        <div className="de-loading">
          <i className="ti ti-loader-2"></i>
          <span>Loading hierarchy…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="de-screen">
      {/* Header */}
      <div className="de-header">
        <nav className="de-bc" aria-label="Breadcrumb">
          <button className="bc-btn" onClick={goRoot} type="button">
            <span>Data Entry</span>
          </button>
          {nav.map((item, i) => (
            <Fragment key={item.key}>
              <span className="bc-sep">
                <i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i>
              </span>
              {i < nav.length - 1 ? (
                <button className="bc-btn" onClick={() => goDepth(i)} type="button">
                  <span>{item.label}</span>
                </button>
              ) : (
                <span className="bc-cur">{item.label}</span>
              )}
            </Fragment>
          ))}
        </nav>

        <div className="de-title-row">
          <div>
            <div className="de-title">{parentNode ? parentNode.label : study.name}</div>
            {parentNode?.subjectId && <div className="de-title-sub">{parentNode.subjectId}</div>}
          </div>
          <div className="de-actions">
            <button className="btn-secondary" type="button">
              <i className="ti ti-download"></i> Export
            </button>
            {/* "Open [level] record" — site level opens the canonical Site Record
                (/sites/[id]); barn/house level opens the Barn Record (/barns/[id]),
                which carries house-scoped forms like the Daily Environmental Log. */}
            {parentNode && (parentNode.level === 0 || parentNode.level === 1) && (
              <button
                className="btn-secondary"
                type="button"
                onClick={
                  parentNode.level === 0
                    ? () => router.push(`/study/${studyId}/sites/${parentNode.id}`)
                    : () => router.push(`/study/${studyId}/barns/${parentNode.id}`)
                }
              >
                <i className="ti ti-file-description"></i> Open {levels[parentNode.level].toLowerCase()} record
              </button>
            )}
            {canAdd && (
              <button className="btn-primary" type="button" onClick={onAddClick}>
                <i className="ti ti-plus"></i> Add {listLevelName.toLowerCase()}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Children table (subjects open their full record on click) */}
      <>
          {sivIncomplete && (
            <div role="status" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", padding: "var(--space-3) var(--space-4)", margin: "0 0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-800)", fontSize: "var(--text-sm)" }}>
              <i className="ti ti-alert-triangle"></i>
              <span>Site initiation visit not complete — contact the study coordinator before enrolling subjects.</span>
              <button className="btn-secondary" type="button" style={{ marginLeft: "auto" }} onClick={() => router.push(`/study/${studyId}/sites/${parentNode!.id}?tab=forms`)}>Open SIV checklist</button>
            </div>
          )}
          {/* Filter bar */}
          <div className="de-filter">
            <input
              className="de-search"
              type="search"
              placeholder={`Search ${listLevelName.toLowerCase()}s…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="de-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {Array.from(new Set((nodesByParent[currentKey] || []).map((n) => n.status))).map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
            <span className="de-count">
              {items.length} {listLevelName.toLowerCase()}
              {items.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Table */}
          <div className="de-table-wrap">
            <table className="de-table">
              <thead>
                <tr>
                  <th>{listLevelName} ID</th>
                  {childLevel < subjectIdx ? (
                    <>
                      <th>{listLevelName} name</th>
                      <th>{levels[childLevel + 1] ? `${levels[childLevel + 1]}s` : "Animals"}</th>
                      <th>Subjects</th>
                      <th>Status</th>
                    </>
                  ) : (
                    <>
                      <th>Status</th>
                      {type === "livestock" && <th>Group / Arm</th>}
                      <th>Forms</th>
                      <th>Queries</th>
                    </>
                  )}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="de-empty">
                        <i className="ti ti-database"></i>
                        Nothing here yet
                      </div>
                    </td>
                  </tr>
                ) : (
                  items.map((n) => {
                    const isSubjectRow = n.level === subjectIdx;
                    const done = n.forms ? n.forms.filter((f) => f.status === "complete").length : 0;
                    const total = n.forms ? n.forms.length : 0;
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <tr
                        key={n.id}
                        className="clickable"
                        onClick={() => drillInto(n)}
                      >
                        <td>
                          <span className="mono cell-link">{isSubjectRow ? n.subjectId : n.code.toUpperCase()}</span>
                        </td>
                        {!isSubjectRow ? (
                          <>
                            <td>
                              <span className="cell-link">{n.label}</span>
                            </td>
                            <td>
                              <span className="mono">{n.childCount ?? 0}</span>
                            </td>
                            <td>
                              <span className="mono">{n.subjectCount ?? n.childCount ?? 0}</span>
                            </td>
                            <td>
                              <span className={`badge ${BADGE_CLS[n.status] || "badge-pending"}`}>{statusLabel(n.status)}</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", flexWrap: "wrap" }}>
                                <span className={`badge ${BADGE_CLS[n.status] || "badge-pending"}`}>{statusLabel(n.status)}</span>
                                {n.ineligible && (
                                  <span className="badge badge-ineligible" title="Does not meet inclusion criteria — PI review required">
                                    <i className="ti ti-alert-triangle" style={{ fontSize: "11px" }}></i> Ineligible
                                  </span>
                                )}
                              </span>
                            </td>
                            {type === "livestock" && (
                              <td>
                                <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{n.arm || "—"}</span>
                              </td>
                            )}
                            <td>
                              <div className="progress-cell">
                                <div className="progress-track">
                                  <div className={`progress-fill${pct < 40 ? " low" : ""}`} style={{ width: `${pct}%` }}></div>
                                </div>
                                <span className="progress-label">
                                  {done}/{total}
                                </span>
                              </div>
                            </td>
                            {/* Live open-query counts not yet wired (pending the query layer). */}
                            <td>
                              <span className="mono muted">—</span>
                            </td>
                          </>
                        )}
                        <td>
                          {/* Container rows get an open-record action; subject/animal rows have none. */}
                          {!isSubjectRow && (
                            <div className="row-actions">
                              <button
                                className="btn-icon"
                                title={`Open ${levels[n.level].toLowerCase()} record`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Site row → Site Record; barn/house row → Barn Record;
                                  // deeper container rows just drill in (no record page).
                                  if (n.level === 0) router.push(`/study/${studyId}/sites/${n.id}`);
                                  else if (n.level === 1) router.push(`/study/${studyId}/barns/${n.id}`);
                                  else drillInto(n);
                                }}
                                type="button"
                              >
                                <i className="ti ti-file-description"></i>
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Summary bar */}
          <div className="de-summary">
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
              <span>{listLevelName}s:</span>
              <span className="sv">{items.length}</span>
            </div>
            {!parentNode && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
                <span>Subjects enrolled:</span>
                <span className="sv">{items.reduce((a, n) => a + (n.subjectCount || 0), 0)}</span>
              </div>
            )}
            <span className="de-note" style={{ marginLeft: "auto" }}>
              <i className="ti ti-info-circle"></i>
              Open-query / SDV / overdue counts arrive with the form-entry layer
            </span>
          </div>
        </>

      {/* Add Site modal (Admin) */}
      {addOpen === "site" && (
        <div className="de-modal-overlay" onClick={() => setAddOpen(null)}>
          <div className="de-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add site">
            <div className="de-modal-title"><i className="ti ti-building-hospital"></i> Add site</div>
            <label className="de-modal-field">
              <span>Site name <span className="req">*</span></span>
              <input className="de-modal-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Lakeside Veterinary Specialists" autoFocus />
            </label>
            <label className="de-modal-field">
              <span>Site number <span className="req">*</span></span>
              <input className="de-modal-input" value={fNumber} onChange={(e) => setFNumber(e.target.value)} placeholder="e.g. 104" />
            </label>
            <label className="de-modal-field">
              <span>Principal investigator</span>
              <input className="de-modal-input" value={fPi} onChange={(e) => setFPi(e.target.value)} placeholder="e.g. Dr. Jane Doe, DVM" />
            </label>
            <label className="de-modal-field">
              <span>Location</span>
              <input className="de-modal-input" value={fLocation} onChange={(e) => setFLocation(e.target.value)} placeholder="e.g. Austin, TX" />
            </label>
            <div className="de-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setAddOpen(null)}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!fName.trim() || !fNumber.trim()} onClick={createSite}>Add site</button>
            </div>
          </div>
        </div>
      )}

      {/* Add container modal (barn / pen / stable / stall — CRC / DM / Admin) */}
      {addOpen === "container" && (
        <div className="de-modal-overlay" onClick={() => setAddOpen(null)}>
          <div className="de-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`Add ${listLevelName.toLowerCase()}`}>
            <div className="de-modal-title"><i className="ti ti-plus"></i> Add {listLevelName.toLowerCase()}</div>
            <label className="de-modal-field">
              <span>{listLevelName} name <span className="req">*</span></span>
              <input className="de-modal-input" value={fName} onChange={(e) => setFName(e.target.value)} placeholder={`e.g. ${listLevelName} 1`} autoFocus />
            </label>
            <div className="de-modal-actions">
              <button className="btn-secondary" type="button" onClick={() => setAddOpen(null)}>Cancel</button>
              <button className="btn-primary" type="button" disabled={!fName.trim()} onClick={createContainer}>Add {listLevelName.toLowerCase()}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
