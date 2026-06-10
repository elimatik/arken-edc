"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@/lib/permissions";
import { DEMO_USER } from "@/lib/constants";
import { useStudySession } from "@/lib/session-store/SessionStore";
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

  const otherStudies = dataset.studies.filter((s) => s.id !== study.id);

  return (
    <header className="topbar">
      {/* Left: study picker (pinned current study + switch + study list) + site dropdown */}
      <div className="tb-study-wrap">
        <button
          className="tb-study"
          onClick={() => setPickerOpen((o) => !o)}
          title="Current study"
          aria-haspopup="menu"
          aria-expanded={pickerOpen}
          aria-label={`Current study ${study.name} — open study menu`}
          type="button"
        >
          {study.code} — {study.name}
          <i className="ti ti-chevron-down" aria-hidden="true"></i>
        </button>
        {pickerOpen && <div className="tb-picker-backdrop" onClick={() => setPickerOpen(false)} />}
        <div className={`tb-picker${pickerOpen ? " open" : ""}`} role="menu">
          <div className="tb-picker-section">
            <div className="tb-picker-label">Current study</div>
            <button className="tb-picker-study current" type="button" disabled>
              <i className="ti ti-pin-filled" style={{ fontSize: "12px", color: "var(--blue-600)" }} aria-hidden="true"></i>
              {study.name}
              <span className="study-id">{study.code}</span>
            </button>
          </div>
          {otherStudies.length > 0 && (
            <div className="tb-picker-section">
              <div className="tb-picker-label">Switch to</div>
              {otherStudies.map((s) => (
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
              <i className="ti ti-list" style={{ fontSize: "13px" }} aria-hidden="true"></i>
              Go to study list
            </button>
          </div>
        </div>
      </div>

      <select
        className="tb-site-select"
        value={selectedSiteId ?? ""}
        onChange={(e) => onSelectSite(e.target.value || null)}
        aria-label="Select site"
      >
        <option value="">All Sites</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>

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
