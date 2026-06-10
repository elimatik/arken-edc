"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { getPinnedStudy, setPinnedStudy } from "@/lib/pinned-study";
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

const ROLE_CLS: Record<string, string> = {
  CRC: "rc-crc",
  CRA: "rc-cra",
  DM: "rc-dm",
  PI: "rc-pi",
  Sponsor: "rc-sponsor",
  Admin: "rc-admin",
};

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

export default function StudiesPage() {
  const router = useRouter();
  const { dataset, ready, update, setActiveRole } = useStudySession();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [view, setView] = useState<"cards" | "table">("table"); // table is default
  const [pinnedId, setPinnedId] = useState<string | null>(() => getPinnedStudy());
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
          // Default landing role is CRC for every study.
          role: "CRC",
          roleCls: "rc-crc",
          enrolled: dataset.subjects.filter((x) => x.study_id === s.id).length,
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

  // Pinned / active study (session-scoped, persisted in sessionStorage). No
  // implicit default — pinned only when the user explicitly pins.
  const pinned = pinnedId;
  // Clicking the pin toggles: pin an unpinned study, unpin the pinned one.
  function togglePin(id: string) {
    const next = pinnedId === id ? null : id;
    setPinnedId(next);
    setPinnedStudy(next);
  }

  // Pinned study always renders first in the table, regardless of sort.
  const ordered = pinned
    ? [...filtered].sort((a, b) => (a.id === pinned ? -1 : b.id === pinned ? 1 : 0))
    : filtered;

  function enterStudy(s: Study) {
    router.push(`/study/${s.id}`);
  }

  function signOut() {
    router.push("/login");
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
          <div className="studies-user">
            <div className="studies-user-avatar">ET</div>
            <span>Elisa Tron</span>
          </div>
          <button className="studies-signout" onClick={signOut} type="button">
            Sign out
          </button>
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
            <div className="studies-view-toggle" role="group" aria-label="View">
              <button
                className={`view-btn${view === "cards" ? " active" : ""}`}
                onClick={() => setView("cards")}
                title="Card view"
                aria-pressed={view === "cards"}
                type="button"
              >
                <i className="ti ti-layout-grid"></i>
              </button>
              <button
                className={`view-btn${view === "table" ? " active" : ""}`}
                onClick={() => setView("table")}
                title="Table view"
                aria-pressed={view === "table"}
                type="button"
              >
                <i className="ti ti-list"></i>
              </button>
            </div>
            <span className="studies-count">
              {filtered.length} {filtered.length === 1 ? "study" : "studies"}
            </span>
          </div>

          {/* Content — card view (default) or interim table view */}
          {loading ? (
            <div className="studies-grid">
              <div className="studies-empty" style={{ gridColumn: "1/-1" }}>
                <i
                  className="ti ti-loader-2"
                  style={{ animation: "spin 1s linear infinite" }}
                ></i>
                <div className="studies-empty-title">Loading studies…</div>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="studies-grid">
              <div className="studies-empty" style={{ gridColumn: "1/-1" }}>
                <i className="ti ti-microscope"></i>
                <div className="studies-empty-title">
                  No studies match your filters
                </div>
                <div>Try adjusting the search or status filter</div>
              </div>
            </div>
          ) : view === "table" ? (
            <div>
              <div className="studies-table-wrap">
                <table className="studies-table">
                  <thead>
                    <tr>
                      <th aria-label="Pinned"></th>
                      <th>Study</th>
                      <th>Name</th>
                      <th>Sponsor</th>
                      <th>Species</th>
                      <th>Status</th>
                      <th>Role</th>
                      <th>Subjects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordered.map((s) => {
                      const statusCls = STATUS_CLS[s.status] || "sb-setup";
                      const isPinned = s.id === pinned;
                      return (
                        <tr key={s.id} onClick={() => enterStudy(s)} className={isPinned ? "st-pinned" : undefined}>
                          <td className="st-pin-cell">
                            <button
                              className={`st-pin${isPinned ? " pinned" : ""}`}
                              title={isPinned ? "Pinned — click to unpin" : "Pin as active study"}
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
                          </td>
                          <td>
                            <span className={`study-role-chip ${s.roleCls}`}>
                              <i className="ti ti-user-circle" style={{ fontSize: "11px" }}></i> {s.role}
                            </span>
                          </td>
                          <td className="st-mono">
                            {s.enrolled} / {s.target}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="studies-table-note">
                <i className="ti ti-info-circle"></i>
                Table view is interim — the full list experience comes from
                14-list-pages.html.
              </div>
            </div>
          ) : (
            <div className="studies-grid">
              {filtered.map((s) => {
                const pct =
                  s.target > 0 ? Math.round((s.enrolled / s.target) * 100) : 0;
                const statusCls = STATUS_CLS[s.status] || "sb-setup";
                return (
                  <div
                    key={s.id}
                    className={`study-card${s.status === "closed" ? " inactive" : ""}`}
                    onClick={() => enterStudy(s)}
                  >
                    {/* Top */}
                    <div className="study-card-top">
                      <div className={`study-card-icon ${s.iconCls}`}>
                        {s.icon}
                      </div>
                      <div className="study-card-main">
                        <div className="study-card-id">
                          {s.code} · {s.phase} · {s.species}
                        </div>
                        <div className="study-card-name">{s.name}</div>
                        <div className="study-card-sponsor">{s.sponsor}</div>
                      </div>
                      <div className="study-card-status">
                        <span className={`status-badge ${statusCls}`}>
                          {s.statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="study-card-body">
                      <div className="study-card-meta">
                        <div className="study-meta-item">
                          <div className="study-meta-val">
                            {s.enrolled}{" "}
                            <span
                              style={{
                                fontSize: "var(--text-xs)",
                                color: "var(--color-text-tertiary)",
                                fontFamily: "var(--font-sans)",
                              }}
                            >
                              / {s.target}
                            </span>
                          </div>
                          <div className="study-meta-lbl">Subjects enrolled</div>
                        </div>
                        <div className="study-meta-item">
                          <div className="study-meta-val">{s.sites}</div>
                          <div className="study-meta-lbl">Sites</div>
                        </div>
                        <div className="study-meta-item">
                          <div
                            className={`study-meta-val${s.openQueries > 0 ? " warn" : ""}`}
                          >
                            {s.openQueries > 0 ? s.openQueries : "—"}
                          </div>
                          <div className="study-meta-lbl">Open queries</div>
                        </div>
                        <div className="study-meta-item">
                          <div
                            className="study-meta-val"
                            style={{ fontSize: "var(--text-sm)" }}
                          >
                            {s.lastEntry}
                          </div>
                          <div className="study-meta-lbl">Last entry</div>
                        </div>
                      </div>
                      {s.target > 0 && (
                        <div className="study-enroll-bar">
                          <div className="study-enroll-track">
                            <div
                              className="study-enroll-fill"
                              style={{ width: `${pct}%` }}
                            ></div>
                          </div>
                          <div className="study-enroll-label">
                            <span>Enrollment</span>
                            <span>{pct}% complete</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="study-card-footer">
                      <span className={`study-role-chip ${s.roleCls}`}>
                        <i
                          className="ti ti-user-circle"
                          style={{ fontSize: "11px" }}
                        ></i>{" "}
                        {s.role}
                      </span>
                      <span className="study-card-enter">
                        Open study <i className="ti ti-arrow-right"></i>
                      </span>
                    </div>
                  </div>
                );
              })}
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
    </div>
  );
}
