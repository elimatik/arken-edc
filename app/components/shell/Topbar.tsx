"use client";

import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@/lib/permissions";
import { DEMO_USER } from "@/lib/constants";
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

  return (
    <header className="topbar">
      {/* Left: study pill + site dropdown side by side */}
      <button
        className="tb-study"
        onClick={() => router.push("/studies")}
        title="Switch study"
        aria-label={`Switch study — currently ${study.name}`}
        type="button"
      >
        {study.name}
        <i className="ti ti-chevron-right" aria-hidden="true"></i>
      </button>

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
