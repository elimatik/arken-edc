"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useStudyLocked, LOCK_TOOLTIP } from "@/lib/use-study-locked";
import { housingTerms, animalsLabel } from "@/lib/terminology";
import { canQuery } from "@/lib/permissions";
import { studyHasBatch } from "@/lib/batch-entry";
import { shouldHideArmForSubject } from "@/lib/study-config";
import { getStudyTypeConfig } from "@/lib/study-type-config";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import "./animals.css";

// ─── Status → shared badge class (mirrors the Data Entry drill-down) ─────────
const BADGE_CLS: Record<string, string> = {
  active: "badge-active",
  enrolled: "badge-active",
  randomized: "badge-active",
  screening: "badge-pending",
  screened: "badge-pending",
  completed: "badge-success",
  withdrawn: "badge-closed",
  "on-hold": "badge-hold",
  onhold: "badge-hold",
};
function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " ");
}
// "complete" buckets for the forms progress bar (reviewed / finalized / locked).
function isComplete(s?: string): boolean {
  return !!s && s !== "empty" && s !== "in_work";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = d.slice(0, 10).split("-");
  if (p.length !== 3) return d;
  return `${m[parseInt(p[1], 10) - 1]} ${parseInt(p[2], 10)} ${p[0]}`;
}

// Whole-year age from a date of birth (the Age column where age is a calculated,
// unstored field — e.g. companion demographics). Returns "" if no valid DOB.
function ageFromDob(dob: string | undefined): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a >= 0 ? `${a}y` : "";
}

// A row in the table — live values resolved from the session store.
interface AnimalRow {
  subjectId: string; // uuid (for navigation)
  code: string; // subject_code shown as Animal ID
  status: string;
  arm: string;
  siteName: string;
  barnName: string;
  penName: string;
  siteId: string | null;
  barnId: string | null;
  penId: string | null;
  sex: string;
  age: string;
  breed: string;
  weight: string;
  formsDone: number;
  formsTotal: number;
  queries: number; // open (unresolved) queries
  lastVisit: string | null;
  ineligible: boolean;
}

interface ColumnDef {
  key: string;
  label: string;
  sortable: boolean;
  required?: boolean;
}

export default function AnimalsPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const { study, selectedSiteId, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();
  const locked = useStudyLocked(studyId);

  // Create a new empty subject (session-only) and open its record. The new code
  // follows the site's existing pattern (e.g. BR-2502-CO-004); falls back to a
  // study-site-001 code if the site has no subjects yet.
  function addSubject() {
    if (locked) return;
    const siteId = siteFilter || selectedSiteId || dataset.sites.find((s) => s.study_id === studyId)?.id || null;
    const siteCode = dataset.sites.find((s) => s.id === siteId)?.code ?? "001";
    const siteSubs = dataset.subjects.filter((s) => s.study_id === studyId && (!siteId || s.site_id === siteId));
    const parsed = siteSubs.map((s) => s.subject_code.match(/^(.*?)(\d+)$/)).filter((m): m is RegExpMatchArray => !!m);
    const code = parsed.length
      ? `${parsed[0][1]}${String(Math.max(...parsed.map((m) => Number(m[2]))) + 1).padStart(parsed[0][2].length, "0")}`
      : `${study.code}-${siteCode}-001`;
    const id = crypto.randomUUID();
    update((d) => {
      d.subjects.push({ id, study_id: studyId, site_id: siteId, barn_id: null, pen_id: null, owner_id: null, subject_code: code, species: studyRow?.species ?? null, status: "screening", randomization_arm: null });
    });
    router.push(`/study/${studyId}/data-entry/${id}`);
  }

  const studyRow = ready ? dataset.studies.find((s) => s.id === studyId) : undefined;
  const studyType = studyRow?.type ?? "livestock_group";
  const isCompanion = studyType === "companion";
  const terms = housingTerms(studyRow);
  const subjLabel = animalsLabel(studyRow); // "Pens" for livestock_group, else "Animals"
  const subjSingular = subjLabel === "Pens" ? "pen" : "animal";
  // Fixed-group studies (e.g. PH-2401) lock their pen/house structure at study
  // initiation — derived from the study-type config, not a hardcoded study code.
  const structureLocked = !getStudyTypeConfig(studyRow?.code ?? "").allowMidStudyAdditions;
  const canRaise = canQuery(activeRole, "raise");
  // Batch Entry — only studies with batch_eligible forms (BR-2502).
  const hasBatch = ready && studyHasBatch(dataset, studyId);

  // ─── Filters / sort / selection state ──────────────────────────────────────
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [armFilter, setArmFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState<string>("");
  const [barnFilter, setBarnFilter] = useState("");
  const [penFilter, setPenFilter] = useState("");
  const { sort, toggle: toggleSort } = useTableSort(null); // null → default order (by ID)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [colOpen, setColOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(new Set());
  const [queryPanelFor, setQueryPanelFor] = useState<AnimalRow | null>(null);
  const colWrapRef = useRef<HTMLDivElement>(null);

  // The topbar site picker drives the site filter (and resets barn/pen).
  useEffect(() => {
    setSiteFilter(selectedSiteId ?? "");
    setBarnFilter("");
    setPenFilter("");
  }, [selectedSiteId]);

  // Close the column chooser on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (colWrapRef.current && !colWrapRef.current.contains(e.target as Element)) setColOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // ─── Build live animal rows from the session store ─────────────────────────
  const rows = useMemo<AnimalRow[]>(() => {
    if (!ready || !studyRow) return [];

    const sites = dataset.sites.filter((s) => s.study_id === studyId);
    const siteById = new Map(sites.map((s) => [s.id, s]));
    const barnById = new Map(dataset.barns.map((b) => [b.id, b]));
    const penById = new Map(dataset.pens.map((p) => [p.id, p]));

    // Leaf forms only (group containers carry no fields/instances).
    const studyForms = dataset.forms.filter((f) => f.study_id === studyId);
    const groupIds = new Set(studyForms.map((f) => f.parent_form_id).filter(Boolean) as string[]);
    const leafFormCount = studyForms.filter((f) => !groupIds.has(f.id)).length;

    // form_field_id → code, for resolving demographic / visit values.
    const codeByField = new Map(dataset.formFields.map((f) => [f.id, f.code]));

    const subjects = dataset.subjects
      .filter((s) => s.study_id === studyId)
      .slice()
      .sort((a, b) => a.subject_code.localeCompare(b.subject_code));

    return subjects.map((s) => {
      const instances = dataset.formInstances.filter((i) => i.subject_id === s.id);
      const instanceIds = new Set(instances.map((i) => i.id));
      const formsDone = instances.filter((i) => isComplete(i.status)).length;

      // Field values for this subject, keyed by the field's code.
      const byCode: Record<string, string> = {};
      dataset.fieldValues.forEach((v) => {
        if (!instanceIds.has(v.form_instance_id) || !v.value) return;
        const code = codeByField.get(v.form_field_id);
        if (code && !byCode[code]) byCode[code] = v.value;
      });

      // Open (unresolved) queries on this subject's instances.
      const queries = dataset.queries.filter(
        (q) => instanceIds.has(q.form_instance_id) && q.status !== "resolved",
      ).length;

      // Demographic columns resolve from the first matching field code present
      // in the subject's values (codes differ across study protocols).
      const weightVal =
        byCode["weight_kg"] ?? byCode["body_weight"] ?? byCode["screening_weight"] ?? byCode["individual_scale_weight"];
      const weight = weightVal ? `${weightVal} kg` : "";
      const site = s.site_id ? siteById.get(s.site_id) : undefined;
      const barn = s.barn_id ? barnById.get(s.barn_id) : undefined;
      const pen = s.pen_id ? penById.get(s.pen_id) : undefined;

      return {
        subjectId: s.id,
        code: s.subject_code,
        status: s.status,
        // Blinded studies: hide the real arm per the viewer's role + this subject's
        // unblinding state (CRC/CRA/PI/Sponsor always; DM/Admin until unblinded).
        arm: shouldHideArmForSubject(dataset, studyId, activeRole, s.id) ? "Blinded" : (s.randomization_arm ?? ""),
        siteName: site?.name ?? "—",
        barnName: barn?.name ?? "",
        penName: pen?.name ?? "",
        siteId: s.site_id,
        barnId: s.barn_id,
        penId: s.pen_id,
        sex: byCode["sex"] ?? byCode["sex_neuter_status"] ?? "",
        age: byCode["age"] || byCode["age_auto_calc"] || ageFromDob(byCode["dob"]),
        breed: byCode["breed"] ?? byCode["breed_type"] ?? byCode["breed_strain"] ?? "",
        weight,
        formsDone,
        formsTotal: leafFormCount,
        queries,
        lastVisit: byCode["visit_date"] ?? null,
        ineligible: !!s.ineligible,
      };
    });
  }, [ready, studyRow, dataset, studyId, activeRole]);

  // ─── Adaptive columns (per study type) ─────────────────────────────────────
  const columns = useMemo<ColumnDef[]>(() => {
    const demographics: ColumnDef[] = [
      { key: "sex", label: "Sex", sortable: true },
      { key: "age", label: "Age", sortable: true },
      { key: "breed", label: "Breed", sortable: true },
      { key: "weight", label: "Weight", sortable: true },
    ];
    // Identifier column relabels with the study's terminology: a group-housed
    // study tracks the pen ("Pen ID"); everything else tracks the animal.
    const idLabel = studyType === "livestock_group" ? `${terms.pen} ID` : "Animal ID";
    const cols: ColumnDef[] = [{ key: "id", label: idLabel, sortable: true, required: true }];
    // Per-animal demographics only apply where animals are tracked individually.
    if (studyType !== "livestock_group") cols.push(...demographics);
    cols.push(
      { key: "status", label: "Status", sortable: true },
      { key: "arm", label: "Group / Arm", sortable: true },
      { key: "location", label: isCompanion ? "Site" : "Location", sortable: false },
      { key: "forms", label: "Forms", sortable: true },
      { key: "lastVisit", label: "Last visit", sortable: true },
      { key: "queries", label: "Queries", sortable: true },
    );
    return cols;
  }, [studyType, isCompanion, terms.pen]);

  const visibleColumns = columns.filter((c) => !hiddenCols.has(c.key));

  // ─── Field-reference options for the Raise-query panel ─────────────────────
  // The study's leaf forms (group containers excluded) and each one's fields,
  // labelled "[group / sub-form]" so the option reads "[Form] — [Field]".
  const fieldRefGroups = useMemo<{ formId: string; formLabel: string; fields: { id: string; label: string }[] }[]>(() => {
    if (!ready) return [];
    const studyForms = dataset.forms.filter((f) => f.study_id === studyId);
    const formById = new Map(studyForms.map((f) => [f.id, f]));
    const groupIds = new Set(studyForms.map((f) => f.parent_form_id).filter(Boolean) as string[]);
    return studyForms
      .filter((f) => !groupIds.has(f.id)) // leaf forms only
      .slice()
      .sort((a, b) => a.sequence - b.sequence)
      .map((leaf) => {
        const parent = leaf.parent_form_id ? formById.get(leaf.parent_form_id) : undefined;
        return {
          formId: leaf.id,
          formLabel: parent ? `${parent.name} / ${leaf.name}` : leaf.name,
          fields: dataset.formFields
            .filter((ff) => ff.form_id === leaf.id)
            .slice()
            .sort((a, b) => a.sequence - b.sequence)
            .map((ff) => ({ id: ff.id, label: ff.label })),
        };
      })
      .filter((g) => g.fields.length > 0);
  }, [ready, dataset.forms, dataset.formFields, studyId]);

  // Distinct filter options (live).
  const statusOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.status))).sort(),
    [rows],
  );
  const armOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.arm).filter(Boolean))).sort(),
    [rows],
  );
  const siteOptions = useMemo(
    () => dataset.sites.filter((s) => s.study_id === studyId).sort((a, b) => a.code.localeCompare(b.code)),
    [dataset.sites, studyId],
  );
  const barnOptions = useMemo(() => {
    const rel = dataset.barns.filter((b) => {
      const site = dataset.sites.find((s) => s.id === b.site_id);
      return site?.study_id === studyId && (!siteFilter || b.site_id === siteFilter);
    });
    return rel.sort((a, b) => a.code.localeCompare(b.code));
  }, [dataset.barns, dataset.sites, studyId, siteFilter]);
  const penOptions = useMemo(() => {
    const barnIds = new Set(
      barnFilter ? [barnFilter] : barnOptions.map((b) => b.id),
    );
    return dataset.pens
      .filter((p) => barnIds.has(p.barn_id))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [dataset.pens, barnFilter, barnOptions]);

  // ─── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    const out = rows.filter((r) => {
      const matchQ =
        !q ||
        r.code.toLowerCase().includes(q) ||
        r.breed.toLowerCase().includes(q) ||
        r.arm.toLowerCase().includes(q) ||
        r.siteName.toLowerCase().includes(q) ||
        r.barnName.toLowerCase().includes(q) ||
        r.penName.toLowerCase().includes(q);
      const matchStatus = !statusFilter || r.status === statusFilter;
      const matchArm = !armFilter || r.arm === armFilter;
      const matchSite = !siteFilter || r.siteId === siteFilter;
      const matchBarn = !barnFilter || r.barnId === barnFilter;
      const matchPen = !penFilter || r.penId === penFilter;
      return matchQ && matchStatus && matchArm && matchSite && matchBarn && matchPen;
    });

    // No active column sort → default order (by ID / code, ascending).
    const dir = sort?.dir === "desc" ? -1 : 1;
    const sortCol = sort?.col ?? "id";
    return out.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortCol) {
        case "weight": av = parseFloat(a.weight) || 0; bv = parseFloat(b.weight) || 0; break;
        case "forms": av = a.formsDone; bv = b.formsDone; break;
        case "queries": av = a.queries; bv = b.queries; break;
        case "sex": av = a.sex; bv = b.sex; break;
        case "age": av = parseFloat(a.age) || a.age; bv = parseFloat(b.age) || b.age; break;
        case "breed": av = a.breed; bv = b.breed; break;
        case "status": av = a.status; bv = b.status; break;
        case "arm": av = a.arm; bv = b.arm; break;
        case "lastVisit": av = a.lastVisit ?? ""; bv = b.lastVisit ?? ""; break;
        default: av = a.code; bv = b.code;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [rows, search, statusFilter, armFilter, siteFilter, barnFilter, penFilter, sort]);

  // ─── Stats / summary (live) ────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = filtered.length;
    const activeCount = filtered.filter((r) =>
      ["active", "enrolled", "randomized"].includes(r.status),
    ).length;
    const completed = filtered.filter((r) => r.status === "completed").length;
    const openQ = filtered.reduce((a, r) => a + r.queries, 0);
    const ineligible = filtered.filter((r) => r.ineligible).length;
    const formsPct =
      total > 0
        ? Math.round(
            (filtered.reduce((a, r) => a + (r.formsTotal ? r.formsDone / r.formsTotal : 0), 0) / total) * 100,
          )
        : 0;
    return { total, activeCount, completed, openQ, ineligible, formsPct };
  }, [filtered]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  function openSubject(r: AnimalRow) {
    router.push(`/study/${studyId}/data-entry/${r.subjectId}`);
  }
  function toggleRow(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map((r) => r.subjectId)) : new Set());
  }
  function toggleCol(key: string, checked: boolean) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const siteLabel = siteFilter ? siteOptions.find((s) => s.id === siteFilter)?.name ?? "All sites" : "All sites";
  const allChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.subjectId));
  const someChecked = filtered.some((r) => selected.has(r.subjectId));

  // Existing queries for the open query panel (live).
  const panelQueries = useMemo(() => {
    if (!queryPanelFor) return [];
    const instanceIds = new Set(
      dataset.formInstances.filter((i) => i.subject_id === queryPanelFor.subjectId).map((i) => i.id),
    );
    return dataset.queries
      .filter((q) => instanceIds.has(q.form_instance_id))
      .map((q) => {
        const firstMsg = dataset.queryMessages
          .filter((m) => m.query_id === q.id)
          .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
        return { q, body: firstMsg?.body ?? q.title, author: firstMsg?.author_name ?? null };
      })
      .sort((a, b) => (a.q.created_at ?? "") < (b.q.created_at ?? "") ? 1 : -1);
  }, [queryPanelFor, dataset.formInstances, dataset.queries, dataset.queryMessages]);

  // ─── Render ────────────────────────────────────────────────────────────────
  if (!ready) {
    return (
      <div className="an-screen">
        <div className="an-loading">
          <i className="ti ti-loader-2"></i>
          <span>Loading animals…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="an-screen">
      {/* Page header */}
      <div className="an-header">
        <div className="an-title-row">
          <div>
            <h1 className="an-title">{subjLabel}</h1>
            <div className="an-title-sub">
              {study.code} · {siteLabel} · {rows.length} {subjSingular}{rows.length === 1 ? "" : "s"} enrolled
            </div>
          </div>
          <div className="an-actions">
            <button className="btn-secondary" type="button">
              <i className="ti ti-download"></i> Export
            </button>
            <button className="btn-secondary" type="button">
              <i className="ti ti-table-export"></i> SEND export
            </button>
            {hasBatch && (
              <button className="btn-secondary" type="button" disabled={locked} title={locked ? LOCK_TOOLTIP : undefined} onClick={() => !locked && router.push(`/study/${studyId}/batch-entry?from=animals`)}>
                <i className="ti ti-table"></i> Batch entry
              </button>
            )}
            {!structureLocked && (
              <button className="btn-primary" type="button" disabled={locked} title={locked ? LOCK_TOOLTIP : undefined} onClick={addSubject}>
                <i className="ti ti-plus"></i> Add {subjSingular}
              </button>
            )}
          </div>
        </div>
      </div>

      {structureLocked && (
        <div role="status" style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", padding: "var(--space-3) var(--space-4)", margin: "0 0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--blue-200)", background: "var(--blue-50)", color: "var(--blue-600)", fontSize: "var(--text-xs)" }}>
          <i className="ti ti-lock"></i>
          <span>Pen structure is locked after study initiation. To modify the pen setup, contact your Data Manager to request a protocol amendment.</span>
        </div>
      )}

      {/* Stat strip */}
      <div className="an-stat-strip">
        <div className="an-stat-item">
          <div className="an-stat-val">{stats.total}</div>
          <div className="an-stat-lbl">{subjLabel}</div>
        </div>
        <div className="an-stat-item">
          <div className="an-stat-val good">{stats.activeCount}</div>
          <div className="an-stat-lbl">Active / randomized</div>
        </div>
        <div className="an-stat-item">
          <div className="an-stat-val">{stats.completed}</div>
          <div className="an-stat-lbl">Completed</div>
        </div>
        <div className="an-stat-item">
          <div className={`an-stat-val${stats.openQ > 0 ? " warn" : ""}`}>{stats.openQ}</div>
          <div className="an-stat-lbl">Open queries</div>
        </div>
        <div className="an-stat-item">
          <div className={`an-stat-val${stats.ineligible > 0 ? " alert" : ""}`}>{stats.ineligible}</div>
          <div className="an-stat-lbl">Ineligible</div>
        </div>
        <div className="an-stat-item">
          <div className="an-stat-val">{stats.formsPct}%</div>
          <div className="an-stat-lbl">Avg forms complete</div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="an-bulk-bar">
          <span className="an-bulk-msg">
            {selected.size} animal{selected.size === 1 ? "" : "s"} selected
          </span>
          {canRaise && (
            <button className="an-bulk-btn" type="button">
              <i className="ti ti-message-report"></i> Raise query
            </button>
          )}
          <button className="an-bulk-btn" type="button">
            <i className="ti ti-lock"></i> Lock records
          </button>
          <button className="an-bulk-btn" type="button">
            <i className="ti ti-writing-sign"></i> Bulk sign-off
          </button>
          <button className="an-bulk-btn" type="button">
            <i className="ti ti-download"></i> Export selected
          </button>
          <button className="an-bulk-btn" style={{ marginLeft: "auto" }} type="button" onClick={() => setSelected(new Set())}>
            <i className="ti ti-x"></i> Clear
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="an-toolbar">
        <input
          className="an-search"
          type="search"
          placeholder="Search by ID, breed, group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="an-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        {armOptions.length > 0 && (
          <select className="an-select" value={armFilter} onChange={(e) => setArmFilter(e.target.value)}>
            <option value="">All groups</option>
            {armOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <select
          className="an-select"
          value={siteFilter}
          onChange={(e) => {
            setSiteFilter(e.target.value);
            setBarnFilter("");
            setPenFilter("");
          }}
        >
          <option value="">All sites</option>
          {siteOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {!isCompanion && (
          <>
            <select
              className="an-select"
              value={barnFilter}
              onChange={(e) => {
                setBarnFilter(e.target.value);
                setPenFilter("");
              }}
            >
              <option value="">All {terms.barn.toLowerCase()}s</option>
              {barnOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select className="an-select" value={penFilter} onChange={(e) => setPenFilter(e.target.value)}>
              <option value="">All {terms.pen.toLowerCase()}s</option>
              {penOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="an-toolbar-sep"></div>
        <div style={{ position: "relative" }} ref={colWrapRef}>
          <button className="an-col-chip" type="button" onClick={() => setColOpen((o) => !o)}>
            <i className="ti ti-columns"></i> Columns{" "}
            <i className="ti ti-chevron-down" style={{ fontSize: "11px", opacity: 0.6 }}></i>
          </button>
          {colOpen && (
            <div className="an-col-panel">
              <div className="an-col-panel-header">
                <span>Visible columns</span>
                <button type="button" onClick={() => setHiddenCols(new Set())}>
                  Reset
                </button>
              </div>
              <div className="an-col-panel-body">
                {columns.map((c) => (
                  <label className="an-col-row" key={c.key}>
                    <input
                      type="checkbox"
                      checked={!hiddenCols.has(c.key)}
                      disabled={c.required}
                      onChange={(e) => toggleCol(c.key, e.target.checked)}
                    />
                    <span className="an-col-row-label">
                      {c.label}
                      {c.required && <span className="an-col-req"> (required)</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <span className="an-toolbar-count">
          {filtered.length} animal{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Table */}
      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th style={{ width: "32px" }}>
                <input
                  type="checkbox"
                  className="row-check"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked && !allChecked;
                  }}
                  onChange={(e) => toggleAll(e.target.checked)}
                />
              </th>
              {visibleColumns.map((c) => (
                <SortTh key={c.key} label={c.label} sortKey={c.sortable ? c.key : undefined} sort={sort} onSort={toggleSort} />
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 2}>
                  <div className="an-empty">
                    <i className="ti ti-paw"></i>
                    No animals match the current filters
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r) => {
                const pct = r.formsTotal > 0 ? Math.round((r.formsDone / r.formsTotal) * 100) : 0;
                const isSel = selected.has(r.subjectId);
                return (
                  <tr
                    key={r.subjectId}
                    className={r.ineligible ? "row-critical" : ""}
                    onClick={() => openSubject(r)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="row-check"
                        checked={isSel}
                        onChange={(e) => toggleRow(r.subjectId, e.target.checked)}
                      />
                    </td>
                    {visibleColumns.map((c) => (
                      <td key={c.key}>{renderCell(c.key, r, pct, isCompanion)}</td>
                    ))}
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn-icon"
                          title="Open subject record"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openSubject(r);
                          }}
                        >
                          <i className="ti ti-clipboard-list"></i>
                        </button>
                        {canRaise && (
                          <button
                            className="btn-icon"
                            title="Raise query"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQueryPanelFor(r);
                            }}
                          >
                            <i className="ti ti-message-report"></i>
                          </button>
                        )}
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
      <div className="an-summary">
        <div className="an-summary-stat">
          <span>{subjLabel}:</span>
          <span className="an-summary-val">{filtered.length}</span>
        </div>
        <div className="an-summary-sep"></div>
        <div className="an-summary-stat">
          <span>Completed:</span>
          <span className="an-summary-val good">{stats.completed}</span>
        </div>
        <div className="an-summary-sep"></div>
        <div className="an-summary-stat">
          <span>Open queries:</span>
          <span className={`an-summary-val${stats.openQ > 0 ? " warn" : ""}`}>{stats.openQ}</span>
        </div>
        <div className="an-summary-sep"></div>
        <div className="an-summary-stat">
          <span>Ineligible:</span>
          <span className={`an-summary-val${stats.ineligible > 0 ? " alert" : ""}`}>{stats.ineligible}</span>
        </div>
        <span className="an-summary-val" style={{ marginLeft: "auto", color: "var(--color-text-tertiary)", fontFamily: "var(--font-sans)", fontWeight: 400 }}>
          Avg forms complete: {stats.formsPct}%
        </span>
      </div>

      {/* Query raise panel (slide-in) */}
      {queryPanelFor && (
        <QueryPanel
          row={queryPanelFor}
          studyCode={study.code}
          isCompanion={isCompanion}
          queries={panelQueries}
          fieldRefGroups={fieldRefGroups}
          onClose={() => setQueryPanelFor(null)}
        />
      )}
    </div>
  );
}

// ─── Cell renderer ─────────────────────────────────────────────────────────────
function renderCell(
  key: string,
  r: AnimalRow,
  pct: number,
  isCompanion: boolean,
) {
  switch (key) {
    case "id":
      return <span className="mono cell-link">{r.code}</span>;
    case "sex":
      return <span className="mono">{r.sex || "—"}</span>;
    case "age":
      return <span className="mono">{r.age || "—"}</span>;
    case "breed":
      return <span className="muted">{r.breed || "—"}</span>;
    case "weight":
      return <span className="mono">{r.weight || "—"}</span>;
    case "status":
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-1)", flexWrap: "wrap" }}>
          <span className={`badge ${BADGE_CLS[r.status] || "badge-pending"}`}>{statusLabel(r.status)}</span>
          {r.ineligible && (
            <span className="badge badge-ineligible" title="Does not meet inclusion criteria — PI review required">
              <i className="ti ti-alert-triangle" style={{ fontSize: "11px" }}></i> Ineligible
            </span>
          )}
        </span>
      );
    case "arm":
      return <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{r.arm || "—"}</span>;
    case "location":
      if (isCompanion) return <span className="muted" style={{ fontSize: "var(--text-xs)" }}>{r.siteName}</span>;
      return (
        <div className="loc-cell">
          <span>{r.siteName}</span>
          {r.barnName && (
            <>
              <span className="loc-sep">›</span>
              <span>{r.barnName}</span>
            </>
          )}
          {r.penName && (
            <>
              <span className="loc-sep">›</span>
              <span>{r.penName}</span>
            </>
          )}
        </div>
      );
    case "forms":
      return (
        <div className="progress-cell">
          <div className="progress-track">
            <div className={`progress-fill${pct < 40 ? " low" : ""}`} style={{ width: `${pct}%` }}></div>
          </div>
          <span className="progress-label">
            {r.formsDone}/{r.formsTotal}
          </span>
        </div>
      );
    case "lastVisit":
      return <span className="mono" style={{ fontSize: "var(--text-xs)" }}>{fmtDate(r.lastVisit)}</span>;
    case "queries":
      return (
        <span className={`cell-num${r.queries > 0 ? " warn" : ""}`}>{r.queries > 0 ? r.queries : "—"}</span>
      );
    default:
      return "—";
  }
}

// ─── Query raise panel ─────────────────────────────────────────────────────────
interface PanelQuery {
  q: { id: string; status: string; title: string; created_at?: string };
  body: string;
  author: string | null;
}
function QueryPanel({
  row,
  studyCode,
  isCompanion,
  queries,
  fieldRefGroups,
  onClose,
}: {
  row: AnimalRow;
  studyCode: string;
  isCompanion: boolean;
  queries: PanelQuery[];
  fieldRefGroups: { formId: string; formLabel: string; fields: { id: string; label: string }[] }[];
  onClose: () => void;
}) {
  const loc = isCompanion
    ? row.siteName
    : [row.siteName, row.barnName, row.penName].filter(Boolean).join(" › ");
  const meta = [row.breed, row.sex, row.age, loc].filter(Boolean).join(" · ");
  const qBadge: Record<string, string> = {
    open: "badge-q-open",
    responded: "badge-q-responded",
    resolved: "badge-q-resolved",
  };
  const open = queries.filter((p) => p.q.status !== "resolved");

  return (
    <>
      <div className="an-q-overlay" onClick={onClose}></div>
      <div className="an-q-panel">
        <div className="an-qp-header">
          <div className="an-qp-header-text">
            <div className="an-qp-title">Raise query</div>
            <div className="an-qp-sub">{studyCode} · {row.code}</div>
          </div>
          <button className="an-qp-close" type="button" onClick={onClose}>
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="an-qp-body">
          <div className="an-qp-context">
            <i className="ti ti-paw" style={{ fontSize: "16px", color: "var(--color-text-tertiary)" }}></i>
            <div>
              <div className="an-qp-context-id">{row.code}</div>
              <div className="an-qp-context-meta">{meta || "—"}</div>
            </div>
          </div>

          <div className="an-qp-section-title">New query</div>

          <div className="an-qp-field">
            <label className="an-qp-label">
              Category <span className="req">*</span>
            </label>
            <select className="an-qp-select" defaultValue="">
              <option value="">Select category…</option>
              <option>Data entry error</option>
              <option>Missing data</option>
              <option>Out of range value</option>
              <option>Protocol deviation</option>
              <option>Source data discrepancy</option>
              <option>Adverse event</option>
              <option>Other</option>
            </select>
          </div>

          <div className="an-qp-field">
            <label className="an-qp-label">Field reference</label>
            <select className="an-qp-select" defaultValue="">
              <option value="">Select form &amp; field…</option>
              {fieldRefGroups.map((g) => (
                <optgroup key={g.formId} label={g.formLabel}>
                  {g.fields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {g.formLabel} — {f.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="an-qp-hint">Optional — identify the specific form and field</span>
          </div>

          <div className="an-qp-field">
            <label className="an-qp-label">
              Query text <span className="req">*</span>
            </label>
            <textarea className="an-qp-textarea" placeholder="Describe the issue clearly. Include expected value or correction needed…"></textarea>
          </div>

          <div className="an-qp-field">
            <label className="an-qp-label">Priority</label>
            <select className="an-qp-select" defaultValue="Normal">
              <option>Normal</option>
              <option>High — resolve within 48h</option>
              <option>Critical — resolve immediately</option>
            </select>
          </div>

          {queries.length > 0 && (
            <>
              <div className="an-qp-sep"></div>
              <div className="an-qp-section-title">
                Queries on this animal ({open.length} open)
              </div>
              {queries.map((p) => (
                <div
                  key={p.q.id}
                  className={`an-qp-query-item ${p.q.status === "resolved" ? "resolved-q" : "open-q"}`}
                >
                  <div className="an-qp-query-top">
                    <span className={`badge ${qBadge[p.q.status] || "badge-q-open"}`} style={{ fontSize: "10px" }}>
                      {statusLabel(p.q.status)}
                    </span>
                    {p.q.created_at && <span className="an-qp-query-date">{fmtDate(p.q.created_at)}</span>}
                  </div>
                  <div className="an-qp-query-text">{p.body}</div>
                  {p.author && <div className="an-qp-query-by">Raised by {p.author}</div>}
                </div>
              ))}
            </>
          )}
        </div>
        <div className="an-qp-footer">
          <button className="btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" type="button" onClick={onClose}>
            <i className="ti ti-send"></i> Send query
          </button>
        </div>
      </div>
    </>
  );
}
