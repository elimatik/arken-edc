"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@/lib/permissions";
import { DEMO_USER } from "@/lib/constants";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { getPinnedStudies, togglePinnedStudy } from "@/lib/pinned-study";
import type { ShellSite, ShellStudy } from "./ShellContext";

interface TopbarProps {
  study: ShellStudy;
  sites: ShellSite[];
  selectedSiteId: string | null;
  onSelectSite: (siteId: string | null) => void;
  activeRole: Role;
  onChangeRole: (role: Role) => void;
}

export function Topbar({
  study,
  sites,
  selectedSiteId,
  onSelectSite,
  activeRole,
  onChangeRole,
}: TopbarProps) {
  const router = useRouter();
  const { dataset } = useStudySession();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => getPinnedStudies());

  const selectedSite = sites.find((s) => s.id === selectedSiteId);
  const siteLabel = selectedSite ? selectedSite.name : "All Sites";

  function openPicker() {
    setPinnedIds(getPinnedStudies()); // refresh from storage in case it changed elsewhere
    setPickerOpen((o) => !o);
  }
  function unpin(id: string) {
    setPinnedIds(togglePinnedStudy(id));
  }

  const pinnedSet = new Set(pinnedIds);
  // All pinned studies, sorted by code.
  const pinnedStudies = dataset.studies
    .filter((s) => pinnedSet.has(s.id))
    .slice()
    .sort((a, b) => a.code.localeCompare(b.code));
  // Studies you can switch to: everything except the one you're in and the pinned ones (shown above).
  const switchStudies = dataset.studies.filter((s) => s.id !== study.id && !pinnedSet.has(s.id));

  return (
    <header className="topbar">
      {/* Left: study picker (pinned current study + switch + study list) + site dropdown */}
      <div className="tb-study-wrap">
        <button
          className="tb-study"
          onClick={openPicker}
          title="Current study"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          aria-label={`Current study ${study.name} — open study menu`}
          type="button"
        >
          {study.code} — {study.name}
          <i className="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
        {pickerOpen && <div className="tb-picker-backdrop" onClick={() => setPickerOpen(false)} />}
        <div className={`tb-picker${pickerOpen ? " open" : ""}`} role="menu">
          {pinnedStudies.length > 0 && (
            <div className="tb-picker-section">
              <div className="tb-picker-label">Pinned</div>
              {pinnedStudies.map((p) => (
                <div className="tb-picker-study" key={p.id}>
                  <button
                    className="tb-pin-btn pinned"
                    title="Pinned — click to unpin"
                    aria-label={`Unpin ${p.name}`}
                    onClick={() => unpin(p.id)}
                    type="button"
                  >
                    <i className="ti ti-pin-filled" aria-hidden="true"></i>
                  </button>
                  <button
                    className="tb-picker-study-link"
                    type="button"
                    onClick={() => {
                      setPickerOpen(false);
                      router.push(`/study/${p.id}`);
                    }}
                  >
                    {p.name}
                    <span className="study-id">{p.code}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
          {switchStudies.length > 0 && (
            <div className="tb-picker-section">
              <div className="tb-picker-label">Switch to</div>
              {switchStudies.map((s) => (
                <button
                  key={s.id}
                  className="tb-picker-study"
                  type="button"
                  onClick={() => {
                    setPickerOpen(false);
                    router.push(`/study/${s.id}`);
                  }}
                >
                  {s.name}
                  <span className="study-id">{s.code}</span>
                </button>
              ))}
            </div>
          )}
          <div className="tb-picker-footer">
            <button
              className="tb-picker-link"
              type="button"
              onClick={() => {
                setPickerOpen(false);
                router.push("/studies");
              }}
            >
              Go to study list
            </button>
          </div>
        </div>
      </div>

      <div className="tb-site-wrap">
        <button
          className="tb-site-btn"
          onClick={() => setSiteMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={siteMenuOpen}
          aria-label={`Site: ${siteLabel} — change site`}
          type="button"
        >
          {siteLabel}
          <i className="ti ti-chevron-right" aria-hidden="true"></i>
        </button>
        {siteMenuOpen && <div className="tb-picker-backdrop" onClick={() => setSiteMenuOpen(false)} />}
        <div className={`tb-site-menu${siteMenuOpen ? " open" : ""}`} role="menu">
          <button className={`tb-site-item${selectedSiteId === null ? " active" : ""}`} type="button" onClick={() => { onSelectSite(null); setSiteMenuOpen(false); }}>
            All Sites
          </button>
          {sites.map((site) => (
            <button
              key={site.id}
              className={`tb-site-item${selectedSiteId === site.id ? " active" : ""}`}
              type="button"
              onClick={() => { onSelectSite(site.id); setSiteMenuOpen(false); }}
            >
              {site.name}
            </button>
          ))}
        </div>
      </div>

      {/* Right: utilities + role switcher + avatar */}
      <div className="tb-right">
        <button className="tb-icon" title="Notifications" aria-label="Notifications" type="button">
          <i className="ti ti-bell" aria-hidden="true"></i>
          <span className="notif-dot" aria-hidden="true"></span>
        </button>
        <button className="tb-icon" title="Help" type="button">
          <i className="ti ti-help-circle" aria-hidden="true"></i>
        </button>

        {/* Role switcher — visible to all roles, switches instantly */}
        <select
          className="tb-role-select"
          value={activeRole}
          onChange={(e) => onChangeRole(e.target.value as Role)}
          aria-label={`Current role: ${activeRole} — switch role`}
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>

        <div
          className="tb-avatar"
          title={`${DEMO_USER.fullName} — account menu`}
          role="button"
          tabIndex={0}
          aria-label="Account menu"
        >
          {DEMO_USER.initials}
        </div>
      </div>
    </header>
  );
}
