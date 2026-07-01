"use client";

import { useMemo, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName } from "@/lib/use-nda-name";
import { emailFromName, usersForStudy } from "@/lib/users-data";
import { EVENT_GROUPS, roleNotifDefaults } from "@/lib/notifications-data";
import "../settings/settings.css";
import "@/components/notifications/notifications.css";

function ToggleRow({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc: string }) {
  return (
    <div className="settings-row">
      <div><div className="settings-row-label" style={{ minWidth: 0 }}>{label}</div>{desc && <div className="settings-row-desc">{desc}</div>}</div>
      <label className="set-toggle" style={{ flexShrink: 0 }}><input type="checkbox" checked={on} onChange={onToggle} /><span className="set-toggle-slider"></span></label>
    </div>
  );
}
function EventToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0" }}>
      <label className="set-toggle" style={{ flexShrink: 0 }}><input type="checkbox" checked={on} onChange={onToggle} /><span className="set-toggle-slider"></span></label>
      <div style={{ fontSize: "var(--text-sm)" }}>{label}</div>
    </div>
  );
}

export default function ProfileNotificationsPage() {
  const { study, sites, activeRole } = useShell();
  const { dataset } = useStudySession();
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2600); };

  const userName = useNdaName();
  const userEmail = emailFromName(userName, "arken.com");
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);
  const [freq, setFreq] = useState("Immediately (as they happen)");
  const [severity, setSeverity] = useState("All queries");
  const [events, setEvents] = useState<Record<string, boolean>>(() => roleNotifDefaults(activeRole));
  const toggleEvent = (k: string) => { setEvents((e) => ({ ...e, [k]: !e[k] })); notify("Setting saved"); };

  const studies = useMemo(() => dataset.studies.slice(), [dataset.studies]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean>>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const customize = (code: string) => { setOverrides((o) => (o[code] ? o : { ...o, [code]: { ...events } })); setExpanded((s) => new Set(s).add(code)); };
  const collapse = (code: string) => setExpanded((s) => { const n = new Set(s); n.delete(code); return n; });
  const resetOverride = (code: string) => { setOverrides((o) => { const n = { ...o }; delete n[code]; return n; }); collapse(code); notify("Reset to default notification settings"); };
  const toggleOverride = (code: string, k: string) => setOverrides((o) => ({ ...o, [code]: { ...o[code], [k]: !o[code][k] } }));

  // Fix 11 scope note — the current user's assigned sites (users-data). Users
  // with no explicit site assignment (DM/Admin) see all study sites.
  const me = useMemo(() => usersForStudy(study.code).find((u) => u.role === activeRole), [study.code, activeRole]);
  const assignedSites = me && me.siteCodes.length ? sites.filter((s) => me.siteCodes.includes(s.code)) : sites;
  const siteNames = assignedSites.map((s) => s.name).join(", ") || "your assigned sites";
  const groupHeader = (g: (typeof EVENT_GROUPS)[number]) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600, margin: "var(--space-3) 0 var(--space-1)" }}><i className={`ti ti-${g.icon}`} style={{ color: g.color }}></i> {g.title}</div>
  );
  // Scope note (Fix 7) + minimum-severity sub-option (Fix 8) on the query toggles.
  const eventExtras = (key: string) => (
    <>
      {key === "q_own" && <div className="notif-scope-note">My subjects = subjects at your assigned sites ({study.code}: {siteNames})</div>}
      {key === "q_all" && events.q_all && (
        <div className="notif-sub-option">Minimum severity:
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); notify("Minimum severity saved"); }}>
            <option>All queries</option>
            <option>Queries on signed fields only</option>
            <option>Critical queries only</option>
          </select>
        </div>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="section-header">
        <h1 className="set-section-title">Notification preferences</h1>
        <p className="section-desc">Choose how and when Arken notifies you · part of your profile</p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", background: "var(--color-page-bg)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "var(--space-2) var(--space-3)", marginBottom: "var(--space-4)" }}>
        <i className="ti ti-user-cog" style={{ fontSize: 15 }}></i> Full profile &amp; account settings are coming soon — notification preferences are shown here.
      </div>

      {/* Card 1 — Delivery */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">How you receive notifications</div></div></div>
        <div className="settings-card-body">
          <ToggleRow on={inApp} onToggle={() => { setInApp(!inApp); notify("Setting saved"); }} label="In-app notifications" desc="Shown in the notification bell in the topbar" />
          <ToggleRow on={email} onToggle={() => { setEmail(!email); notify("Setting saved"); }} label="Email notifications" desc={`Sent to ${userEmail}`} />
          {email && (
            <div className="settings-row">
              <div><div className="settings-row-label">Email frequency</div></div>
              <div className="settings-row-value"><select className="set-select" style={{ maxWidth: 260 }} value={freq} onChange={(e) => { setFreq(e.target.value); notify("Email frequency saved"); }}><option>Immediately (as they happen)</option><option>Daily digest (9:00 AM)</option><option>Weekly digest (Monday 9:00 AM)</option></select></div>
            </div>
          )}
          <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}>
            <div><div className="settings-row-label">Email address</div></div>
            <div className="settings-row-value" style={{ fontSize: "var(--text-sm)" }}>{userEmail} <a style={{ color: "var(--color-link)", cursor: "pointer", marginLeft: 8 }} onClick={() => notify("Account settings — demo")}>Change in account settings</a></div>
          </div>
        </div>
      </div>

      {/* Card 2 — Notify me when */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Notify me when</div><div className="settings-card-desc">Choose which events trigger a notification · these apply to studies and subjects you have access to</div></div></div>
        <div className="settings-card-body">
          {EVENT_GROUPS.map((g) => (
            <div key={g.title}>
              {groupHeader(g)}
              {g.events.map((ev) => (
                <div key={ev.key}>
                  <EventToggle on={!!events[ev.key]} onToggle={() => toggleEvent(ev.key)} label={ev.label} />
                  {eventExtras(ev.key)}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Card 3 — Per-study overrides */}
      <div className="settings-card">
        <div className="settings-card-header"><div><div className="settings-card-title">Per-study overrides</div><div className="settings-card-desc">Customize notification settings for individual studies</div></div></div>
        <div className="settings-card-body">
          {studies.map((st) => {
            const open = expanded.has(st.code);
            const has = !!overrides[st.code];
            return (
              <div key={st.id} style={{ borderBottom: "1px solid var(--color-border-subtle)", padding: "var(--space-3) 0" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><span style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{st.code} — {st.name}</span><span className="set-badge set-badge-slate">{activeRole}</span></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span className={`set-badge ${has ? "set-badge-blue" : "set-badge-slate"}`}>{has ? "Custom settings" : "Using default settings"}</span>
                    {open ? <button className="set-btn-secondary" style={{ height: 26, fontSize: "var(--text-xs)" }} type="button" onClick={() => collapse(st.code)}>Collapse</button>
                      : <button className="set-btn-secondary" style={{ height: 26, fontSize: "var(--text-xs)" }} type="button" onClick={() => customize(st.code)}>Customize</button>}
                  </div>
                </div>
                {open && overrides[st.code] && (
                  <div style={{ marginTop: "var(--space-2)", paddingLeft: "var(--space-3)", borderLeft: "2px solid var(--color-border)" }}>
                    {EVENT_GROUPS.map((g) => (
                      <div key={g.title}>
                        {groupHeader(g)}
                        {g.events.map((ev) => <EventToggle key={ev.key} on={!!overrides[st.code][ev.key]} onToggle={() => toggleOverride(st.code, ev.key)} label={ev.label} />)}
                      </div>
                    ))}
                    <a style={{ color: "var(--color-link)", cursor: "pointer", fontSize: "var(--text-xs)", display: "inline-block", marginTop: "var(--space-2)" }} onClick={() => resetOverride(st.code)}>Reset to defaults</a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {toast && <div className="notif-toast" role="status">{toast}</div>}
    </div>
  );
}
