"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { DEMO_USER_ID } from "@/lib/constants";
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
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards"); // cards is default

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Live studies for the demo user, with cheap aggregates (subject + site counts).
      const { data, error } = await supabase
        .from("studies")
        .select(
          "id, code, name, sponsor, phase, species, status, enrollment_target, description, sites(count), subjects(count), study_memberships!inner(role)",
        )
        .eq("study_memberships.user_id", DEMO_USER_ID)
        .order("code");

      if (cancelled) return;

      if (error || !data) {
        setStudies([]);
        setLoading(false);
        return;
      }

      const mapped: Study[] = (data as any[]).map((row) => {
        const species: string = row.species ?? "";
        const role: string = row.study_memberships?.[0]?.role ?? "";
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          sponsor: row.sponsor ?? "",
          phase: row.phase ?? "",
          species: cap(species),
          icon: SPECIES_ICON[species] ?? "🔬",
          iconCls: species,
          status: row.status,
          statusLabel: STATUS_LABEL[row.status] ?? row.status,
          role,
          roleCls: ROLE_CLS[role] ?? "",
          enrolled: row.subjects?.[0]?.count ?? 0,
          target: row.enrollment_target ?? 0,
          sites: row.sites?.[0]?.count ?? 0,
          // TODO (next session): live open-query count (subjects → form_instances → queries)
          openQueries: 0,
          // TODO (next session): live last data-entry timestamp
          lastEntry: "—",
          desc: row.description ?? "",
        };
      });

      setStudies(mapped);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

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

  function enterStudy(s: Study) {
    router.push(`/study/${s.id}`);
  }

  function signOut() {
    router.push("/login");
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
          <div className="studies-heading">Your studies</div>
          <div className="studies-sub">
            Select a study to continue. Your role and data access are configured
            per study.
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
                    {filtered.map((s) => {
                      const statusCls = STATUS_CLS[s.status] || "sb-setup";
                      return (
                        <tr key={s.id} onClick={() => enterStudy(s)}>
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
    </div>
  );
}
