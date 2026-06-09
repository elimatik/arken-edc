"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./studies.css";

type Study = {
  id: string;
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

const STUDIES: Study[] = [
  {
    id: "AK-2401",
    name: "BRD Cattle Phase II Efficacy Trial",
    sponsor: "AgriVet Sciences",
    phase: "Phase II",
    species: "Cattle",
    icon: "🐄",
    iconCls: "cattle",
    status: "active",
    statusLabel: "Active",
    role: "CRC",
    roleCls: "rc-crc",
    enrolled: 89,
    target: 120,
    sites: 3,
    openQueries: 11,
    lastEntry: "Today",
    desc: "Bovine respiratory disease — efficacy and safety of AV-2201",
  },
  {
    id: "AK-2209",
    name: "PRRS Swine USDA Vaccine Efficacy Study",
    sponsor: "AgriVet Sciences",
    phase: "Phase III",
    species: "Swine",
    icon: "🐷",
    iconCls: "swine",
    status: "active",
    statusLabel: "Active",
    role: "CRC",
    roleCls: "rc-crc",
    enrolled: 156,
    target: 200,
    sites: 4,
    openQueries: 6,
    lastEntry: "Jun 06",
    desc: "Porcine reproductive and respiratory syndrome — USDA conditional license study",
  },
  {
    id: "AK-2312",
    name: "Canine Analgesia Study — Velafen",
    sponsor: "PharmaVet Inc.",
    phase: "Phase II",
    species: "Canine",
    icon: "🐕",
    iconCls: "canine",
    status: "setup",
    statusLabel: "In setup",
    role: "CRC",
    roleCls: "rc-crc",
    enrolled: 0,
    target: 80,
    sites: 2,
    openQueries: 0,
    lastEntry: "—",
    desc: "Pain management efficacy — post-operative canine analgesia",
  },
  {
    id: "AK-2318",
    name: "Aquatic Species NADA Residue Study",
    sponsor: "AquaPharm LLC",
    phase: "Phase I",
    species: "Aquatic",
    icon: "🐟",
    iconCls: "aquatic",
    status: "active",
    statusLabel: "Active",
    role: "PI",
    roleCls: "rc-pi",
    enrolled: 240,
    target: 300,
    sites: 2,
    openQueries: 3,
    lastEntry: "Jun 07",
    desc: "Tissue residue depletion study in rainbow trout — NADA submission",
  },
  {
    id: "AK-2205",
    name: "Feline Hypertension Long-Term Safety",
    sponsor: "VetPharm Europe",
    phase: "Phase III",
    species: "Feline",
    icon: "🐈",
    iconCls: "feline",
    status: "closed",
    statusLabel: "Closed",
    role: "CRC",
    roleCls: "rc-crc",
    enrolled: 120,
    target: 120,
    sites: 3,
    openQueries: 0,
    lastEntry: "Dec 2025",
    desc: "Long-term safety of FH-301 in hypertensive cats — study completed",
  },
  {
    id: "AK-2407",
    name: "BRD Cattle Phase III — Multi-region",
    sponsor: "AgriVet Sciences",
    phase: "Phase III",
    species: "Cattle",
    icon: "🐄",
    iconCls: "cattle",
    status: "setup",
    statusLabel: "In setup",
    role: "Admin",
    roleCls: "rc-admin",
    enrolled: 0,
    target: 360,
    sites: 8,
    openQueries: 0,
    lastEntry: "—",
    desc: "Phase III efficacy — 8-site expansion across US and Canada",
  },
];

const STATUS_CLS: Record<string, string> = {
  active: "sb-active",
  setup: "sb-setup",
  closed: "sb-closed",
  paused: "sb-paused",
};

export default function StudiesPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [speciesFilter, setSpeciesFilter] = useState("");

  const q = search.toLowerCase().trim();
  const filtered = STUDIES.filter((s) => {
    const matchQ =
      !q ||
      s.name.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.sponsor.toLowerCase().includes(q);
    const matchStatus = !statusFilter || s.status === statusFilter;
    const matchSpecies = !speciesFilter || s.species === speciesFilter;
    return matchQ && matchStatus && matchSpecies;
  });

  function enterStudy(s: Study) {
    // In production: navigate to app. For prototype: show confirmation.
    alert(
      `Entering ${s.id} — ${s.name}\n\nIn production this would load the full EDC shell for this study with role: ${s.role}`,
    );
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
            <span className="studies-count">
              {filtered.length} {filtered.length === 1 ? "study" : "studies"}
            </span>
          </div>

          {/* Grid */}
          <div className="studies-grid">
            {filtered.length === 0 ? (
              <div className="studies-empty" style={{ gridColumn: "1/-1" }}>
                <i className="ti ti-microscope"></i>
                <div className="studies-empty-title">
                  No studies match your filters
                </div>
                <div>Try adjusting the search or status filter</div>
              </div>
            ) : (
              filtered.map((s) => {
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
                          {s.id} · {s.phase} · {s.species}
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
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
