"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useShell } from "@/components/shell/ShellContext";
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
}

const LIVESTOCK_LEVELS = ["Site", "Barn", "Pen", "Animal"];
const COMPANION_LEVELS = ["Site", "Animal"];

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
function formBtn(s: FormStatus) {
  return {
    complete: { label: "Review", icon: "ti-eye" },
    incomplete: { label: "Continue", icon: "ti-pencil" },
    "not-started": { label: "Start", icon: "ti-pencil" },
  }[s];
}
function formStatusText(s: FormStatus) {
  return { complete: "Complete", incomplete: "In progress", "not-started": "Not started" }[s];
}
function formStatusCls(s: FormStatus) {
  return { complete: "fcs-complete", incomplete: "fcs-incomplete", "not-started": "fcs-notstarted" }[s];
}

export default function DataEntryPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const { study } = useShell();

  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"livestock" | "companion">("livestock");
  const [nodesByParent, setNodesByParent] = useState<Record<string, Node[]>>({});
  const [nav, setNav] = useState<{ key: string; label: string }[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ─── Load the full hierarchy for this study from Supabase ───────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: st } = await supabase.from("studies").select("type").eq("id", studyId).maybeSingle();
      const studyType = ((st?.type as string) === "companion" ? "companion" : "livestock") as
        | "livestock"
        | "companion";

      const [sitesRes, subjectsRes, formsRes] = await Promise.all([
        supabase.from("sites").select("id, code, name, status").eq("study_id", studyId).order("code"),
        supabase
          .from("subjects")
          .select("id, subject_code, species, status, randomization_arm, site_id, barn_id, pen_id")
          .eq("study_id", studyId)
          .order("subject_code"),
        supabase.from("forms").select("id, code, name, sequence").eq("study_id", studyId).order("sequence"),
      ]);

      const sites = sitesRes.data ?? [];
      const subjects = subjectsRes.data ?? [];
      const forms = formsRes.data ?? [];
      const subjectIds = subjects.map((s) => s.id);

      let barns: any[] = [];
      let pens: any[] = [];
      if (studyType === "livestock") {
        const siteIds = sites.map((s) => s.id);
        if (siteIds.length) {
          const { data } = await supabase.from("barns").select("id, code, name, site_id").in("site_id", siteIds).order("code");
          barns = data ?? [];
        }
        const barnIds = barns.map((b) => b.id);
        if (barnIds.length) {
          const { data } = await supabase.from("pens").select("id, code, name, barn_id").in("barn_id", barnIds).order("code");
          pens = data ?? [];
        }
      }

      let instances: any[] = [];
      if (subjectIds.length) {
        const { data } = await supabase.from("form_instances").select("id, status, form_id, subject_id").in("subject_id", subjectIds);
        instances = data ?? [];
      }

      // Per-subject form list = every study form, with status from its instance (or not-started).
      const subjectForms = (subjId: string): FormItem[] =>
        forms.map((f) => {
          const inst = instances.find((i) => i.subject_id === subjId && i.form_id === f.id);
          return { id: f.id, name: f.name, status: mapInstanceStatus(inst?.status) };
        });

      const subjectIdx = studyType === "livestock" ? 3 : 1;
      const subjectNode = (s: any): Node => ({
        id: s.id,
        code: s.subject_code,
        label: s.subject_code,
        level: subjectIdx,
        status: s.status,
        subjectId: s.subject_code,
        arm: s.randomization_arm,
        forms: subjectForms(s.id),
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

      if (cancelled) return;
      setType(studyType);
      setNodesByParent(map);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studyId]);

  const levels = type === "livestock" ? LIVESTOCK_LEVELS : COMPANION_LEVELS;
  const subjectIdx = type === "livestock" ? 3 : 1;
  const currentKey = nav.length ? nav[nav.length - 1].key : "root";

  function findNode(id: string): Node | null {
    for (const k of Object.keys(nodesByParent)) {
      const n = nodesByParent[k].find((x) => x.id === id);
      if (n) return n;
    }
    return null;
  }

  const parentNode = nav.length ? findNode(nav[nav.length - 1].key) : null;
  const isSubjectView = parentNode != null && parentNode.level === subjectIdx;

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
            {/* "Open [level] record" — present at site / barn / pen levels */}
            {parentNode && (
              <button className="btn-secondary" type="button">
                <i className="ti ti-file-description"></i> Open {levels[parentNode.level].toLowerCase()} record
              </button>
            )}
            <button className="btn-primary" type="button">
              <i className="ti ti-plus"></i> Add {listLevelName.toLowerCase()}
            </button>
          </div>
        </div>
      </div>

      {/* Children table (subjects open their full record on click) */}
      <>
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
                              <span className={`badge ${BADGE_CLS[n.status] || "badge-pending"}`}>{statusLabel(n.status)}</span>
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
                          <div className="row-actions">
                            <button
                              className="btn-icon"
                              title="Open"
                              onClick={(e) => {
                                e.stopPropagation();
                                drillInto(n);
                              }}
                              type="button"
                            >
                              <i className="ti ti-pencil"></i>
                            </button>
                          </div>
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
    </div>
  );
}
