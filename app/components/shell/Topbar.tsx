"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, type Role } from "@/lib/permissions";
import { useNdaName, useNdaInitials } from "@/lib/use-nda-name";
import { useAvatarColor } from "@/lib/avatar-color";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { getPinnedStudies, togglePinnedStudy } from "@/lib/pinned-study";
import type { ShellStudy } from "./ShellContext";

interface TopbarProps {
  study: ShellStudy;
  activeRole: Role;
  onChangeRole: (role: Role) => void;
  onToggleAI?: () => void; // opens the Arken Insights slide-in
  onToggleNotif?: () => void; // opens the notifications drawer
  notifCount?: number; // unread notification count for the bell badge
}

export function Topbar({
  study,
  activeRole,
  onChangeRole,
  onToggleAI,
  onToggleNotif,
  notifCount = 0,
}: TopbarProps) {
  const router = useRouter();
  const { dataset } = useStudySession();
  const userName = useNdaName();
  const userInitials = useNdaInitials();
  const avatarColor = useAvatarColor();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>(() => getPinnedStudies());

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

      {/* Site context is handled per-module (e.g. the Inventory header selector),
          not by a global topbar dropdown. */}

      {/* Right: utilities + role switcher + avatar */}
      <div className="tb-right">
        <button className="tb-icon" title="Notifications" aria-label={`Notifications${notifCount > 0 ? ` (${notifCount} unread)` : ""}`} type="button" onClick={onToggleNotif}>
          <i className="ti ti-bell" aria-hidden="true"></i>
          {notifCount > 0 && <span className="tb-notif-badge" aria-hidden="true">{notifCount > 9 ? "9+" : notifCount}</span>}
        </button>
        <button className="tb-icon" title="Help" type="button">
          <i className="ti ti-help-circle" aria-hidden="true"></i>
        </button>
        <button className="tb-icon" title="Arken Insights" aria-label="Arken Insights" type="button" onClick={onToggleAI}>
          <i className="ti ti-sparkles" aria-hidden="true"></i>
        </button>

        {/* Role switcher — visible to all roles, switches instantly */}
        <div className="tb-role-wrap">
          <select
            className="tb-role-select"
            value={activeRole}
            onChange={(e) => onChangeRole(e.target.value as Role)}
            aria-label={`Current role: ${activeRole} — switch role`}
            title="Role switching is enabled for portfolio demonstration. In production, each user has a fixed role assigned by the study administrator."
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <span className="tb-role-demo">(Demo)</span>
        </div>

        <div
          className="tb-avatar"
          style={{ background: avatarColor }}
          title={`${userName} — open profile`}
          role="button"
          tabIndex={0}
          aria-label="Open profile"
          onClick={() => router.push(`/study/${study.id}/profile`)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/study/${study.id}/profile`); } }}
        >
          {userInitials}
        </div>
      </div>
    </header>
  );
}
