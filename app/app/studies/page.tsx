"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { getPinnedStudies, togglePinnedStudy } from "@/lib/pinned-study";
import { isStudyLocked } from "@/lib/study-lock";
import { capLevel, capChipClass } from "@/lib/enrollment";
import { useNdaName, useNdaInitials } from "@/lib/use-nda-name";
import { useAvatarColor } from "@/lib/avatar-color";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import "./studies.css";

type Study = {
  id: string; // uuid (used for routing)
  code: string; // human study code, e.g. "AK-2401"
  name: string;
  sponsor: string;
  phase: string;
  species: string;
  icon: string;
  iconCls: string;
  status: string;
  statusLabel: string;
  locked: boolean;
  role: string;
  roleCls: string;
  enrolled: number;
  target: number;
  sites: number;
  openQueries: number;
  lastEntry: string;
  desc: string;
};

const STATUS_CLS: Record<string, string> = {
  active: "sb-active",
  setup: "sb-setup",
  closed: "sb-closed",
  paused: "sb-paused",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  setup: "In setup",
  paused: "Paused",
  closed: "Closed",
};

const SPECIES_ICON: Record<string, string> = {
  cattle: "🐄",
  swine: "🐷",
  canine: "🐕",
  aquatic: "🐟",
  feline: "🐈",
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export default function StudiesPage() {
  const router = useRouter();
  const { dataset, ready, update, setActiveRole } = useStudySession();
  const userName = useNdaName();
  const userInitials = useNdaInitials();
  const avatarColor = useAvatarColor();
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => getPinnedStudies());
  const { sort, toggle } = useTableSort(null);
  // Add-study modal
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClient, setNewClient] = useState("");
  const [newClientText, setNewClientText] = useState("");
  const loading = !ready;

  // Studies the demo user belongs to, derived from the session store
  // (hydrated from the Supabase seed once per tab; counts computed in session).
  const studies: Study[] = useMemo(() => {
    if (!ready) return [];
    return dataset.studies
      .filter((s) => dataset.memberships.some((m) => m.study_id === s.id))
      .slice()
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((s) => {
        const species = s.species ?? "";
        return {
          id: s.id,
          code: s.code,
          name: s.name,
          sponsor: s.sponsor ?? "",
          phase: s.phase ?? "",
          species: cap(species),
          icon: SPECIES_ICON[species] ?? "🔬",
          iconCls: species,
          status: s.status,
          statusLabel: STATUS_LABEL[s.status] ?? s.status,
          locked: isStudyLocked(dataset, s.id),
          // Default landing role is CRC for every study.
          role: "CRC",
          roleCls: "rc-crc",
          // Enrolled against target = ACTIVE subjects only (completed / withdrawn /
          // screening are excluded — they no longer occupy an enrolment slot here).
          enrolled: dataset.subjects.filter((x) => x.study_id === s.id && x.status === "active").length,
          target: s.enrollment_target ?? 0,
          sites: dataset.sites.filter((x) => x.study_id === s.id).length,
          openQueries: 0,
          lastEntry: "—",
          desc: s.description ?? "",
        };
      });
  }, [dataset, ready]);

  const q = search.toLowerCase().trim();
  const filtered = studies.filter((s) => {
    const matchQ =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      s.sponsor.toLowerCase().includes(q);
    const matchStatus = !statusFilter || s.status === statusFilter;
    const matchSpecies = !speciesFilter || s.species === speciesFilter;
    return matchQ && matchStatus && matchSpecies;
  });

  // Pinned studies (session-scoped, persisted in sessionStorage). Multiple may be
  // pinned; no implicit default — pinned only when the user explicitly pins.
  const pinnedSet = new Set(pinnedIds);
  function togglePin(id: string) {
    setPinnedIds(togglePinnedStudy(id));
  }

  // Default order: pinned studies render first (sorted among themselves by code),
  // then the rest. When a column sort is active, sort all rows by that column
  // (ignoring pinned-first); numbers numerically, strings via localeCompare.
  const ordered = [...filtered].sort((a, b) => {
    if (sort) {
      const mul = sort.dir === "asc" ? 1 : -1;
      if (sort.col === "subjects") return (a.enrolled - b.enrolled) * mul;
      const av = String(a[sort.col as keyof Study] ?? "");
      const bv = String(b[sort.col as keyof Study] ?? "");
      return av.localeCompare(bv) * mul;
    }
    const ap = pinnedSet.has(a.id);
    const bp = pinnedSet.has(b.id);
    if (ap !== bp) return ap ? -1 : 1;
    return a.code.localeCompare(b.code);
  });

  function enterStudy(s: Study) {
    router.push(`/study/${s.id}`);
  }

  // Log out — clear all session/role state (session store, active role, NDA name,
  // pins) and hard-navigate to /login so the app loads fresh, as if first opened.
  function doLogout() {
    try {
      Object.keys(sessionStorage).filter((k) => k.startsWith("arken_")).forEach((k) => sessionStorage.removeItem(k));
    } catch { /* storage unavailable */ }
    window.location.href = "/login";
  }

  // Distinct existing clients (sponsors) for the Add-study dropdown.
  const clients = Array.from(new Set(dataset.studies.map((s) => s.sponsor).filter(Boolean))) as string[];
  const resolvedClient = newClient === "__other" ? newClientText.trim() : newClient;
  const canCreate = newName.trim().length > 0 && resolvedClient.length > 0;

  function closeAdd() {
    setAddOpen(false);
    setNewName("");
    setNewClient("");
    setNewClientText("");
  }

  // Create a new, empty session-based study and go to its settings to configure
  // it. No sites/barns/pens/subjects/forms yet — Admin sets all that up.
  function confirmAdd() {
    if (!canCreate) return;
    const id = crypto.randomUUID();
    const code = "NEW-" + id.slice(0, 4).toUpperCase();
    const name = newName.trim();
    const client = resolvedClient;
    update((d) => {
      d.studies.push({
        id, code, name, sponsor: client, phase: null,
        type: "companion", species: null, status: "setup",
        enrollment_target: null, description: null,
      });
      // Admin-only membership — configuring a new study is an Admin task.
      d.memberships.push({ study_id: id, role: "Admin" });
    });
    setActiveRole("Admin"); // enter the study as Admin
    closeAdd();
    router.push(`/study/${id}/settings`);
  }

  return (
    <div className="screen-studies">
      {/* Topbar */}
      <header className="studies-topbar">
        <div className="studies-logo">
          <div className="studies-logo-mark">
            <span>Ar</span>
          </div>
          <span className="studies-logo-name">Arken EDC</span>
        </div>
        <div className="studies-topbar-right">
          <div className="studies-avatar-wrap">
            <div
              className="studies-user-avatar"
              style={{ background: avatarColor, cursor: "pointer" }}
              title={`${userName} — account menu`}
              role="button"
              tabIndex={0}
              aria-haspopup="menu"
              aria-expanded={avatarMenuOpen}
              aria-label="Account menu"
              onClick={() => setAvatarMenuOpen((o) => !o)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAvatarMenuOpen((o) => !o); } }}
            >
              {userInitials}
            </div>
            {avatarMenuOpen && (
              <>
                <div className="studies-avatar-backdrop" onClick={() => setAvatarMenuOpen(false)} />
                <div className="studies-avatar-menu" role="menu">
                  <button className="studies-avatar-menu-item" role="menuitem" type="button" onClick={() => { setAvatarMenuOpen(false); setLogoutOpen(true); }}>
                    <i className="ti ti-logout" aria-hidden="true"></i> Log out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="studies-body">
        <div className="studies-content">
          <div className="studies-headrow">
            <div>
              <div className="studies-heading">Your studies</div>
              <div className="studies-sub">
                Select a study to continue. Your role and data access are configured
                per study.
              </div>
            </div>
            <button className="studies-add-btn" onClick={() => setAddOpen(true)} type="button">
              <i className="ti ti-plus"></i> Add Study
            </button>
          </div>

          {/* Toolbar */}
          <div className="studies-toolbar">
            <div className="studies-search">
              <i className="ti ti-search"></i>
              <input
                type="search"
                placeholder="Search studies…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="studies-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="setup">In setup</option>
              <option value="paused">Paused</option>
              <option value="closed">Closed</option>
            </select>
            <select
              className="studies-filter"
              value={speciesFilter}
              onChange={(e) => setSpeciesFilter(e.target.value)}
            >
              <option value="">All species</option>
              <option value="Cattle">Cattle</option>
              <option value="Swine">Swine</option>
              <option value="Canine">Canine</option>
              <option value="Aquatic">Aquatic</option>
              <option value="Feline">Feline</option>
            </select>
            <span className="studies-count">
              {filtered.length} {filtered.length === 1 ? "study" : "studies"}
            </span>
          </div>

          {/* Content — table only */}
          {loading ? (
            <div className="studies-empty">
              <i className="ti ti-loader-2" style={{ animation: "spin 1s linear infinite" }}></i>
              <div className="studies-empty-title">Loading studies…</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="studies-empty">
              <i className="ti ti-microscope"></i>
              <div className="studies-empty-title">No studies match your filters</div>
              <div>Try adjusting the search or status filter</div>
            </div>
          ) : (
            <div className="studies-table-wrap">
              <table className="studies-table">
                <thead>
                  <tr>
                    <th aria-label="Pinned"></th>
                    <SortTh label="Study" sortKey="code" sort={sort} onSort={toggle} />
                    <SortTh label="Name" sortKey="name" sort={sort} onSort={toggle} />
                    <SortTh label="Sponsor" sortKey="sponsor" sort={sort} onSort={toggle} />
                    <SortTh label="Species" sortKey="species" sort={sort} onSort={toggle} />
                    <SortTh label="Status" sortKey="status" sort={sort} onSort={toggle} />
                    <th>Role</th>
                    <SortTh label="Subjects" sortKey="subjects" sort={sort} onSort={toggle} />
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((s) => {
                    const statusCls = STATUS_CLS[s.status] || "sb-setup";
                    const isPinned = pinnedSet.has(s.id);
                    return (
                      <tr key={s.id} onClick={() => enterStudy(s)} className={isPinned ? "st-pinned" : undefined}>
                        <td className="st-pin-cell">
                          <button
                            className={`st-pin${isPinned ? " pinned" : ""}`}
                            title={isPinned ? "Pinned — click to unpin" : "Pin study"}
                            aria-pressed={isPinned}
                            onClick={(e) => { e.stopPropagation(); togglePin(s.id); }}
                            type="button"
                          >
                            <i className={`ti ${isPinned ? "ti-pin-filled" : "ti-pin"}`}></i>
                          </button>
                        </td>
                        <td className="st-code">{s.code}</td>
                        <td>{s.name}</td>
                        <td>{s.sponsor}</td>
                        <td>{s.species}</td>
                        <td>
                          <span className={`status-badge ${statusCls}`}>{s.statusLabel}</span>
                          {s.locked && (
                            <span className="status-badge sb-locked" title="Database locked — read-only pending statistical analysis">
                              <i className="ti ti-lock" style={{ fontSize: "11px" }}></i> Locked
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`study-role-chip ${s.roleCls}`}>
                            <i className="ti ti-user-circle" style={{ fontSize: "11px" }}></i> {s.role}
                          </span>
                        </td>
                        <td className="st-mono">
                          <span className={`cap-chip ${capChipClass(capLevel(s.enrolled, s.target))}`}>{s.enrolled} / {s.target}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add-study modal — session-based create */}
      {addOpen && (
        <div className="modal-overlay" onClick={closeAdd}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Add study">
            <div className="modal-head">
              <div className="modal-title">Add study</div>
              <button className="modal-close" onClick={closeAdd} aria-label="Close" type="button"><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body">
              <label className="modal-label" htmlFor="add-name">Study name</label>
              <input
                id="add-name"
                className="modal-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Feline Diabetes Pilot"
                autoFocus
              />
              <label className="modal-label" htmlFor="add-client">Client</label>
              <select id="add-client" className="modal-select" value={newClient} onChange={(e) => setNewClient(e.target.value)}>
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__other">+ New client…</option>
              </select>
              {newClient === "__other" && (
                <input
                  className="modal-input"
                  style={{ marginTop: "var(--space-2)" }}
                  value={newClientText}
                  onChange={(e) => setNewClientText(e.target.value)}
                  placeholder="New client name"
                />
              )}
            </div>
            <div className="modal-foot">
              <button className="modal-btn-secondary" onClick={closeAdd} type="button">Cancel</button>
              <button className="modal-btn-primary" onClick={confirmAdd} disabled={!canCreate} type="button">Create study</button>
            </div>
          </div>
        </div>
      )}

      {/* Log-out confirmation */}
      {logoutOpen && (
        <div className="modal-overlay" onClick={() => setLogoutOpen(false)}>
          <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="studies-logout-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title" id="studies-logout-title">Log out?</div>
              <button className="modal-close" type="button" aria-label="Close" onClick={() => setLogoutOpen(false)}><i className="ti ti-x"></i></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.5 }}>You&apos;ll be signed out of Arken EDC. Any unsaved changes will be lost.</p>
            </div>
            <div className="modal-foot">
              <button className="modal-btn-secondary" type="button" onClick={() => setLogoutOpen(false)}>Cancel</button>
              <button className="modal-btn-primary" type="button" onClick={doLogout}>Log out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
