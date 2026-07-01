"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useNdaName, useNdaInitials } from "@/lib/use-nda-name";
import { emailFromName, usersForStudy } from "@/lib/users-data";
import { EVENT_GROUPS, roleNotifDefaults, unreadCount, useReadSet } from "@/lib/notifications-data";
import { AVATAR_COLORS, setAvatarColor, useAvatarColor } from "@/lib/avatar-color";
import "../settings/settings.css";
import "@/components/notifications/notifications.css";
import "./profile.css";

const SECTIONS = ["personal", "password", "2fa", "sessions", "notifications", "display", "language"];

// ── Small shared bits ──
function EventToggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-2) 0" }}>
      <label className="set-toggle" style={{ flexShrink: 0 }}><input type="checkbox" checked={on} onChange={onToggle} /><span className="set-toggle-slider"></span></label>
      <div style={{ fontSize: "var(--text-sm)" }}>{label}</div>
    </div>
  );
}
function PfToggleRow({ on, onToggle, label, desc }: { on: boolean; onToggle: () => void; label: string; desc?: string }) {
  return (
    <div className="pf-toggle-row">
      <label className="set-toggle"><input type="checkbox" checked={on} onChange={onToggle} /><span className="set-toggle-slider"></span></label>
      <div className="pf-toggle-info"><div className="pf-toggle-label">{label}</div>{desc && <div className="pf-toggle-desc">{desc}</div>}</div>
    </div>
  );
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `ARKE-${seg()}-${seg()}`;
}

interface SessionRow { id: string; device: string; icon: string; location: string; ip: string; last: string; current: boolean }

export default function ProfilePage() {
  const { study, sites, activeRole } = useShell();
  const { dataset } = useStudySession();
  const sp = useSearchParams();
  const userName = useNdaName();
  const userInitials = useNdaInitials();
  const userEmail = emailFromName(userName, "arken.com");
  const avatarColor = useAvatarColor();
  const notifUnread = unreadCount(study.code, useReadSet());

  const [section, setSection] = useState<string>(() => { const s = sp.get("section"); return s && SECTIONS.includes(s) ? s : "personal"; });
  useEffect(() => { const s = sp.get("section"); if (s && SECTIONS.includes(s)) setSection(s); }, [sp]);

  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast((t) => (t === m ? null : t)), 2800); };

  const studyCodes = useMemo(() => dataset.studies.map((s) => s.code).join(", "), [dataset.studies]);

  // ── Personal details (in-place edit) ──
  const [details, setDetails] = useState({ first: "", last: "", email: "", phone: "+1 (303) 555-0142", org: "Arken EDC", title: "BSc Clinical Research" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(details);
  useEffect(() => {
    const parts = userName.trim().split(/\s+/);
    setDetails((d) => ({ ...d, first: parts[0] ?? "", last: parts.slice(1).join(" "), email: userEmail }));
  }, [userName, userEmail]);
  const startEdit = () => { setDraft(details); setEditing(true); };
  const saveEdit = () => { setDetails(draft); setEditing(false); notify("Changes saved successfully"); };

  // ── Password ──
  const [newPwd, setNewPwd] = useState("");
  // Start reacting immediately: 1-2 chars → 1 bar (weak); 3+ chars → score by
  // length ≥12 + uppercase + number + special (min 1 bar while typing).
  const pwdRaw = (newPwd.length >= 12 ? 1 : 0) + (/[A-Z]/.test(newPwd) ? 1 : 0) + (/[0-9]/.test(newPwd) ? 1 : 0) + (/[^A-Za-z0-9]/.test(newPwd) ? 1 : 0);
  const pwdScore = newPwd.length === 0 ? 0 : newPwd.length <= 2 ? 1 : Math.max(1, pwdRaw);
  const pwdCls = pwdScore <= 1 ? "weak" : pwdScore <= 2 ? "ok" : "strong";
  const pwdLabel = !newPwd ? "Enter a new password" : pwdScore <= 1 ? "Weak" : pwdScore <= 2 ? "Fair" : pwdScore <= 3 ? "Good" : "Strong";
  const pwdLabelColor = !newPwd ? "var(--color-text-tertiary)" : pwdScore <= 1 ? "var(--red-600)" : pwdScore <= 2 ? "var(--amber-700)" : "var(--green-600)";

  // ── 2FA ──
  const [tfaMethod, setTfaMethod] = useState<"app" | "sms">("app");
  const [codes, setCodes] = useState(() => [
    { code: "ARKE-X4T2-9M1K", used: false }, { code: "ARKE-B7Q3-2N8J", used: false },
    { code: "ARKE-P5W9-6L4H", used: false }, { code: "ARKE-C2R7-8F3D", used: false },
    { code: "ARKE-M1Y4-3K9G", used: false }, { code: "ARKE-N6V8-7A2E", used: true },
  ]);
  const regenerateCodes = () => { setCodes(Array.from({ length: 6 }, () => ({ code: genCode(), used: false }))); notify("New recovery codes generated — old codes are now invalid"); };
  const copyCodes = () => { try { navigator.clipboard?.writeText(codes.map((c) => c.code).join("\n")); } catch { /* clipboard unavailable */ } notify("Recovery codes copied"); };

  // ── Sessions ──
  const [sessions, setSessions] = useState<SessionRow[]>([
    { id: "s1", device: "MacBook Pro · Chrome 125", icon: "device-laptop", location: "Milan, IT", ip: "203.0.113.47", last: "Now", current: true },
    { id: "s2", device: "iPhone · Safari 17", icon: "device-mobile", location: "Milan, IT", ip: "203.0.113.47", last: "2h ago", current: false },
    { id: "s3", device: "MacBook Pro · Firefox 126", icon: "device-laptop", location: "Rome, IT", ip: "198.51.100.22", last: "Yesterday", current: false },
  ]);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const revoke = (id: string) => { setSessions((s) => s.filter((x) => x.id !== id)); notify("Session revoked"); };
  const revokeAll = () => { setSessions((s) => s.filter((x) => x.current)); setConfirmRevoke(false); notify("All other sessions have been revoked"); };
  const LOGIN_HISTORY = [
    { ts: "2026-07-01 14:32:07", device: "MacBook Pro · Chrome", ip: "203.0.113.47", loc: "Milan, IT", result: "success" as const },
    { ts: "2026-06-30 09:15:33", device: "iPhone · Safari", ip: "203.0.113.47", loc: "Milan, IT", result: "success" as const },
    { ts: "2026-06-29 22:04:11", device: "MacBook Pro · Chrome", ip: "203.0.113.47", loc: "Milan, IT", result: "failed" as const, reason: "wrong password" },
    { ts: "2026-06-29 22:04:58", device: "MacBook Pro · Chrome", ip: "203.0.113.47", loc: "Milan, IT", result: "success" as const },
  ];

  // ── Notifications (lifted from the stub) ──
  const [inApp, setInApp] = useState(true);
  const [email, setEmail] = useState(true);
  const [freq, setFreq] = useState("Immediately (as they happen)");
  const [severity, setSeverity] = useState("All queries");
  const [events, setEvents] = useState<Record<string, boolean>>(() => roleNotifDefaults(activeRole));
  const toggleEvent = (k: string) => { setEvents((e) => ({ ...e, [k]: !e[k] })); notify("Setting saved"); };
  const [overrides, setOverrides] = useState<Record<string, Record<string, boolean>>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const customize = (code: string) => { setOverrides((o) => (o[code] ? o : { ...o, [code]: { ...events } })); setExpanded((s) => new Set(s).add(code)); };
  const collapse = (code: string) => setExpanded((s) => { const n = new Set(s); n.delete(code); return n; });
  const resetOverride = (code: string) => { setOverrides((o) => { const n = { ...o }; delete n[code]; return n; }); collapse(code); notify("Reset to default notification settings"); };
  const toggleOverride = (code: string, k: string) => setOverrides((o) => ({ ...o, [code]: { ...o[code], [k]: !o[code][k] } }));
  const me = useMemo(() => usersForStudy(study.code).find((u) => u.role === activeRole), [study.code, activeRole]);
  const assignedSites = me && me.siteCodes.length ? sites.filter((s) => me.siteCodes.includes(s.code)) : sites;
  const siteNames = assignedSites.map((s) => s.name).join(", ") || "your assigned sites";
  const groupHeader = (g: (typeof EVENT_GROUPS)[number]) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600, margin: "var(--space-3) 0 var(--space-1)" }}><i className={`ti ti-${g.icon}`} style={{ color: g.color }}></i> {g.title}</div>
  );
  const eventExtras = (key: string) => (
    <>
      {key === "q_own" && <div className="notif-scope-note">My subjects = subjects at your assigned sites ({study.code}: {siteNames})</div>}
      {key === "q_all" && events.q_all && (
        <div className="notif-sub-option">Minimum severity:
          <select value={severity} onChange={(e) => { setSeverity(e.target.value); notify("Minimum severity saved"); }}>
            <option>All queries</option><option>Queries on signed fields only</option><option>Critical queries only</option>
          </select>
        </div>
      )}
    </>
  );

  // ── Display + Language ──
  const [display, setDisplay] = useState({ compact: false, fieldCodes: true, confirmNav: true });
  const [dateFmt, setDateFmt] = useState("YYYY-MM-DD (ISO)");
  const [timeFmt, setTimeFmt] = useState("24-hour (14:30)");
  const [decimal, setDecimal] = useState("Period · 1,234.56");
  const [language, setLanguage] = useState("English (US)");
  const [timezone, setTimezone] = useState("UTC+1 — Rome, Milan, Paris");

  const NAV: { group: string; items: { key: string; icon: string; label: string; badge?: React.ReactNode }[] }[] = [
    { group: "Account", items: [
      { key: "personal", icon: "user", label: "Personal information" },
      { key: "password", icon: "lock", label: "Password" },
      { key: "2fa", icon: "shield-check", label: "Two-factor auth", badge: <span className="set-badge set-badge-green">On</span> },
      { key: "sessions", icon: "devices", label: "Sessions" },
    ] },
    { group: "Preferences", items: [
      { key: "notifications", icon: "bell", label: "Notifications", badge: notifUnread > 0 ? <span className="set-badge set-badge-blue">{notifUnread} new</span> : undefined },
      { key: "display", icon: "palette", label: "Display" },
      { key: "language", icon: "world", label: "Language & timezone" },
    ] },
  ];

  return (
    <div className="profile-page">
      {/* ── Sidebar nav ── */}
      <nav className="profile-nav">
        <div className="profile-nav-head">
          <div className="profile-nav-head-title">My profile</div>
          <div className="profile-nav-head-sub">{userName} · {activeRole}</div>
        </div>
        {NAV.map((grp) => (
          <div key={grp.group}>
            <div className="profile-nav-title">{grp.group}</div>
            {grp.items.map((it) => (
              <button key={it.key} type="button" className={`profile-nav-item${section === it.key ? " active" : ""}`} onClick={() => setSection(it.key)}>
                <i className={`ti ti-${it.icon}`}></i> {it.label} {it.badge}
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* ── Content ── */}
      <div className="profile-content">

        {/* ═══ PERSONAL ═══ */}
        {section === "personal" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Personal information</h1><p className="section-desc">Your name, contact details, and how you appear in the system.</p></div>

            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">Profile picture</div><div className="settings-card-desc">Your initials and color appear throughout the app</div></div></div>
              <div className="pf-avatar-section">
                <div className="pf-avatar-large" style={{ background: avatarColor }}>{userInitials}<div className="pf-avatar-overlay"><i className="ti ti-pencil" style={{ color: "#fff", fontSize: 18 }}></i></div></div>
                <div className="pf-avatar-info">
                  <div className="pf-avatar-name">{userName}</div>
                  <div className="pf-avatar-meta">{activeRole} · {studyCodes}</div>
                  <div className="pf-color-row">
                    <span className="pf-color-label">Avatar color:</span>
                    {AVATAR_COLORS.map((c) => (
                      <button key={c} type="button" aria-label={`Avatar color ${c}`} className={`pf-swatch${avatarColor === c ? " selected" : ""}`} style={{ background: c }} onClick={() => { setAvatarColor(c); notify("Avatar color updated"); }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header">
                <div className="settings-card-title">Personal details</div>
                {!editing && <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)" }} type="button" onClick={startEdit}><i className="ti ti-pencil" style={{ fontSize: 13 }}></i> Edit</button>}
              </div>
              <div className="settings-card-body">
                {!editing ? (
                  <>
                    <div className="pf-row"><span className="pf-row-label">First name</span><span className="pf-row-value">{details.first}</span></div>
                    <div className="pf-row"><span className="pf-row-label">Last name</span><span className="pf-row-value">{details.last}</span></div>
                    <div className="pf-row"><span className="pf-row-label">Email address</span><span className="pf-row-value">{details.email}</span></div>
                    <div className="pf-row"><span className="pf-row-label">Phone</span><span className="pf-row-value">{details.phone}</span></div>
                    <div className="pf-row"><span className="pf-row-label">Organization</span><span className="pf-row-value">{details.org}</span></div>
                    <div className="pf-row"><span className="pf-row-label">Title / credentials</span><span className="pf-row-value">{details.title}</span></div>
                  </>
                ) : (
                  <>
                    <div className="pf-form-grid-2">
                      <div className="set-field"><label className="set-field-label">First name</label><input className="set-input" value={draft.first} onChange={(e) => setDraft({ ...draft, first: e.target.value })} /></div>
                      <div className="set-field"><label className="set-field-label">Last name</label><input className="set-input" value={draft.last} onChange={(e) => setDraft({ ...draft, last: e.target.value })} /></div>
                    </div>
                    <div className="set-field" style={{ marginBottom: "var(--space-4)" }}><label className="set-field-label">Email address</label><input className="set-input" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /><span className="pf-hint">Changing your email will require re-verification.</span></div>
                    <div className="pf-form-grid-2">
                      <div className="set-field"><label className="set-field-label">Phone</label><input className="set-input" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
                      <div className="set-field"><label className="set-field-label">Organization</label><input className="set-input" value={draft.org} onChange={(e) => setDraft({ ...draft, org: e.target.value })} /></div>
                    </div>
                    <div className="set-field"><label className="set-field-label">Title / credentials</label><input className="set-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
                    <div className="pf-form-actions">
                      <button className="set-btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button>
                      <button className="set-btn-primary" type="button" onClick={saveEdit}>Save changes</button>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">Study roles</div><div className="settings-card-desc">Managed by your study Admin or DM</div></div></div>
              <div className="settings-card-body" style={{ padding: 0 }}>
                {dataset.studies.map((st) => (
                  <div key={st.id} className="pf-row" style={{ padding: "var(--space-3) var(--space-5)" }}>
                    <div><div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{st.code}</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{st.name}</div></div>
                    <span className="set-badge set-badge-blue">{activeRole}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ═══ PASSWORD ═══ */}
        {section === "password" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Password</h1><p className="section-desc">Choose a strong password and don&apos;t reuse it for other accounts.</p></div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Change password</div></div>
              <div className="settings-card-body">
                <div className="set-field" style={{ marginBottom: "var(--space-4)" }}><label className="set-field-label">Current password</label><input className="set-input" type="password" placeholder="Enter current password" /></div>
                <div className="set-field" style={{ marginBottom: "var(--space-4)" }}>
                  <label className="set-field-label">New password</label>
                  <input className="set-input" type="password" placeholder="Enter new password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
                  <div className="pf-pwd">
                    <div className="pf-pwd-bars">{[0, 1, 2, 3].map((i) => <div key={i} className={`pf-pwd-bar${newPwd && i < pwdScore ? " " + pwdCls : ""}`}></div>)}</div>
                    <div className="pf-pwd-label" style={{ color: pwdLabelColor }}>{pwdLabel}</div>
                  </div>
                </div>
                <div className="set-field"><label className="set-field-label">Confirm new password</label><input className="set-input" type="password" placeholder="Confirm new password" /></div>
                <div className="pf-form-actions"><button className="set-btn-primary" type="button" onClick={() => { setNewPwd(""); notify("Password updated successfully"); }}>Update password</button></div>
              </div>
            </div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Password requirements</div></div>
              <div className="settings-card-body">
                <div className="pf-req">
                  <div className="pf-req-item"><i className="ti ti-check" style={{ color: "var(--green-600)" }}></i> At least 12 characters</div>
                  <div className="pf-req-item"><i className="ti ti-check" style={{ color: "var(--green-600)" }}></i> At least one uppercase letter</div>
                  <div className="pf-req-item"><i className="ti ti-check" style={{ color: "var(--green-600)" }}></i> At least one number</div>
                  <div className="pf-req-item"><i className="ti ti-check" style={{ color: "var(--green-600)" }}></i> At least one special character</div>
                  <div className="pf-req-item"><i className="ti ti-x" style={{ color: "var(--color-text-tertiary)" }}></i> Cannot reuse last 12 passwords</div>
                </div>
                <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Required by 21 CFR Part 11 electronic records policy.</div>
              </div>
            </div>
          </>
        )}

        {/* ═══ 2FA ═══ */}
        {section === "2fa" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Two-factor authentication</h1><p className="section-desc">Add an extra layer of security to your account. Required for all users per 21 CFR Part 11.</p></div>
            <div className="pf-info-banner"><i className="ti ti-info-circle"></i><span>Two-factor authentication is <strong>required</strong> for all Arken EDC users. It cannot be disabled.</span></div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Authentication method</div><span className="set-badge set-badge-green"><i className="ti ti-check" style={{ fontSize: 10, marginRight: 3 }}></i> Active</span></div>
              <div className="settings-card-body">
                <button type="button" className={`pf-tfa-method${tfaMethod === "app" ? " selected" : ""}`} onClick={() => { setTfaMethod("app"); notify("Authenticator app is your active 2FA method"); }}>
                  <div className="pf-tfa-icon"><i className="ti ti-device-mobile"></i></div>
                  <div className="pf-tfa-info"><div className="pf-tfa-name">Authenticator app</div><div className="pf-tfa-desc">Use an app like Google Authenticator or Authy to generate codes. Recommended.</div></div>
                  {tfaMethod === "app" && <i className="ti ti-check" style={{ color: "var(--blue-600)", fontSize: 18 }}></i>}
                </button>
                <button type="button" className={`pf-tfa-method${tfaMethod === "sms" ? " selected" : ""}`} onClick={() => { setTfaMethod("sms"); notify("SMS 2FA selected — configure your phone number in account settings"); }}>
                  <div className="pf-tfa-icon"><i className="ti ti-message"></i></div>
                  <div className="pf-tfa-info"><div className="pf-tfa-name">SMS text message</div><div className="pf-tfa-desc">Receive a code via text to your registered phone number.</div></div>
                  {tfaMethod === "sms" && <i className="ti ti-check" style={{ color: "var(--blue-600)", fontSize: 18 }}></i>}
                </button>
              </div>
            </div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Recovery codes</div></div>
              <div className="settings-card-body">
                <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-4)" }}>Recovery codes can be used to access your account if you lose your authentication device. Each code can only be used once.</p>
                <div className="pf-codes">{codes.map((c, i) => <span key={i} className={c.used ? "pf-code-used" : ""}>{c.code}</span>)}</div>
                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                  <button className="set-btn-secondary" type="button" onClick={copyCodes}><i className="ti ti-copy"></i> Copy codes</button>
                  <button className="set-btn-secondary" type="button" onClick={() => notify("Recovery codes downloaded")}><i className="ti ti-download"></i> Download</button>
                  <button className="set-btn-secondary" type="button" onClick={regenerateCodes}><i className="ti ti-refresh"></i> Regenerate</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ═══ SESSIONS ═══ */}
        {section === "sessions" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Sessions</h1><p className="section-desc">Devices and locations where your account is currently signed in.</p></div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Active sessions</div>
                <button className="set-btn-secondary" style={{ height: 28, fontSize: "var(--text-xs)", color: "var(--red-600)", borderColor: "var(--red-200)", background: "var(--red-50)" }} type="button" onClick={() => setConfirmRevoke(true)}><i className="ti ti-logout" style={{ fontSize: 13 }}></i> Revoke all other sessions</button>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="pf-session-table">
                  <thead><tr><th>Device</th><th>Location</th><th>IP address</th><th>Last active</th><th></th></tr></thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id} className={s.current ? "pf-session-current" : ""}>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                            <div className="pf-device-icon"><i className={`ti ti-${s.icon}`}></i></div>
                            <div><div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{s.device}</div>
                              {s.current
                                ? <div style={{ fontSize: "var(--text-xs)", color: "var(--green-600)", fontWeight: 500 }}><i className="ti ti-circle-filled" style={{ fontSize: 8 }}></i> Current session</div>
                                : <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Signed in</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: "var(--color-text-secondary)" }}>{s.location}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{s.ip}</td>
                        <td style={{ color: "var(--color-text-secondary)" }}>{s.last}</td>
                        <td>{s.current ? "—" : <button className="set-btn-icon" type="button" title="Revoke session" onClick={() => revoke(s.id)}><i className="ti ti-logout" style={{ fontSize: 14, color: "var(--red-600)" }}></i></button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Recent login history</div></div>
              <div style={{ overflowX: "auto" }}>
                <table className="pf-session-table">
                  <thead><tr><th>Date &amp; time (UTC)</th><th>Device</th><th>IP address</th><th>Location</th><th>Result</th></tr></thead>
                  <tbody>
                    {LOGIN_HISTORY.map((h, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", whiteSpace: "nowrap" }}>{h.ts}</td>
                        <td>{h.device}</td>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{h.ip}</td>
                        <td style={{ color: "var(--color-text-secondary)" }}>{h.loc}</td>
                        <td>{h.result === "success" ? <span className="set-badge set-badge-green">Success</span> : <span className="set-badge set-badge-red">Failed — {h.reason}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ═══ NOTIFICATIONS ═══ */}
        {section === "notifications" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Notification preferences</h1><p className="section-desc">Control how and when you receive notifications. Study admins may override some settings.</p></div>

            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">How you receive notifications</div></div></div>
              <div className="settings-card-body">
                <PfToggleRow on={inApp} onToggle={() => { setInApp(!inApp); notify("Setting saved"); }} label="In-app notifications" desc="Shown in the notification bell in the topbar" />
                <PfToggleRow on={email} onToggle={() => { setEmail(!email); notify("Setting saved"); }} label="Email notifications" desc={`Sent to ${userEmail}`} />
                {email && (
                  <div className="settings-row"><div><div className="settings-row-label">Email frequency</div></div><div className="settings-row-value"><select className="set-select" style={{ maxWidth: 260 }} value={freq} onChange={(e) => { setFreq(e.target.value); notify("Email frequency saved"); }}><option>Immediately (as they happen)</option><option>Daily digest (9:00 AM)</option><option>Weekly digest (Monday 9:00 AM)</option></select></div></div>
                )}
                <div className="settings-row" style={{ borderBottom: "none", paddingBottom: 0 }}><div><div className="settings-row-label">Email address</div></div><div className="settings-row-value" style={{ fontSize: "var(--text-sm)" }}>{userEmail}</div></div>
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">Notify me when</div><div className="settings-card-desc">Applies to studies and subjects you have access to</div></div></div>
              <div className="settings-card-body">
                {EVENT_GROUPS.map((g) => (
                  <div key={g.title}>{groupHeader(g)}{g.events.map((ev) => <div key={ev.key}><EventToggle on={!!events[ev.key]} onToggle={() => toggleEvent(ev.key)} label={ev.label} />{eventExtras(ev.key)}</div>)}</div>
                ))}
              </div>
            </div>

            <div className="settings-card">
              <div className="settings-card-header"><div><div className="settings-card-title">Per-study overrides</div><div className="settings-card-desc">Customize notification settings for individual studies</div></div></div>
              <div className="settings-card-body">
                {dataset.studies.map((st) => {
                  const open = expanded.has(st.code); const has = !!overrides[st.code];
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
                          {EVENT_GROUPS.map((g) => <div key={g.title}>{groupHeader(g)}{g.events.map((ev) => <EventToggle key={ev.key} on={!!overrides[st.code][ev.key]} onToggle={() => toggleOverride(st.code, ev.key)} label={ev.label} />)}</div>)}
                          <a style={{ color: "var(--color-link)", cursor: "pointer", fontSize: "var(--text-xs)", display: "inline-block", marginTop: "var(--space-2)" }} onClick={() => resetOverride(st.code)}>Reset to defaults</a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ═══ DISPLAY ═══ */}
        {section === "display" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Display</h1><p className="section-desc">Customize how Arken EDC looks for you.</p></div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Appearance</div></div>
              <div className="settings-card-body">
                <PfToggleRow on={display.compact} onToggle={() => { setDisplay((d) => ({ ...d, compact: !d.compact })); notify("Display preference saved"); }} label="Compact mode" desc="Reduce row height and spacing in tables for more data on screen" />
                <PfToggleRow on={display.fieldCodes} onToggle={() => { setDisplay((d) => ({ ...d, fieldCodes: !d.fieldCodes })); notify("Display preference saved"); }} label="Show field codes" desc="Display field codes alongside labels in forms (useful for data managers)" />
                <PfToggleRow on={display.confirmNav} onToggle={() => { setDisplay((d) => ({ ...d, confirmNav: !d.confirmNav })); notify("Display preference saved"); }} label="Confirm before navigating away from unsaved forms" desc="Show a warning if you try to leave a form with unsaved changes" />
              </div>
            </div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Date &amp; number format</div></div>
              <div className="settings-card-body">
                <div className="pf-form-grid-2">
                  <div className="set-field"><label className="set-field-label">Date format</label><select className="set-select" value={dateFmt} onChange={(e) => setDateFmt(e.target.value)}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD (ISO)</option></select></div>
                  <div className="set-field"><label className="set-field-label">Time format</label><select className="set-select" value={timeFmt} onChange={(e) => setTimeFmt(e.target.value)}><option>24-hour (14:30)</option><option>12-hour (2:30 PM)</option></select></div>
                </div>
                <div className="set-field"><label className="set-field-label">Decimal separator</label><select className="set-select" style={{ maxWidth: 240 }} value={decimal} onChange={(e) => setDecimal(e.target.value)}><option>Period · 1,234.56</option><option>Comma · 1.234,56</option></select><span className="pf-hint">Used for numeric field display only — data is stored in standard format regardless.</span></div>
                <div className="pf-form-actions"><button className="set-btn-primary" type="button" onClick={() => notify("Display preferences saved")}>Save preferences</button></div>
              </div>
            </div>
          </>
        )}

        {/* ═══ LANGUAGE ═══ */}
        {section === "language" && (
          <>
            <div className="section-header"><h1 className="set-section-title">Language &amp; timezone</h1><p className="section-desc">These settings affect how dates, times, and text appear for you.</p></div>
            <div className="settings-card">
              <div className="settings-card-header"><div className="settings-card-title">Language &amp; region</div></div>
              <div className="settings-card-body">
                <div className="pf-form-grid-2">
                  <div className="set-field"><label className="set-field-label">Language</label><select className="set-select" value={language} onChange={(e) => setLanguage(e.target.value)}><option>English (US)</option><option>English (UK)</option><option>Italian</option><option>French</option><option>German</option><option>Spanish</option></select></div>
                  <div className="set-field"><label className="set-field-label">Timezone</label><select className="set-select" value={timezone} onChange={(e) => setTimezone(e.target.value)}><option>UTC+0 — London</option><option>UTC+1 — Rome, Milan, Paris</option><option>UTC-5 — New York</option><option>UTC-6 — Chicago, Dallas</option><option>UTC-7 — Denver, Phoenix</option><option>UTC-8 — Los Angeles</option></select></div>
                </div>
                <div className="pf-info-banner" style={{ marginBottom: 0, marginTop: "var(--space-3)" }}><i className="ti ti-info-circle"></i><span>All audit trail timestamps are stored and displayed in <strong>UTC</strong> regardless of your timezone setting. Your timezone only affects visit scheduling and calendar displays.</span></div>
                <div className="pf-form-actions"><button className="set-btn-primary" type="button" onClick={() => notify("Language & timezone saved")}>Save preferences</button></div>
              </div>
            </div>
          </>
        )}

      </div>

      {confirmRevoke && (
        <div className="notif-dialog-overlay" onClick={() => setConfirmRevoke(false)}>
          <div className="notif-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="notif-dialog-title"><i className="ti ti-logout"></i>Revoke all other sessions</div>
            <div className="notif-dialog-body">This will sign you out of every device except this one. You&apos;ll need to sign in again on those devices.</div>
            <div className="notif-dialog-actions">
              <button className="notif-dialog-btn" type="button" onClick={() => setConfirmRevoke(false)}>Cancel</button>
              <button className="notif-dialog-btn primary" type="button" onClick={revokeAll}>Revoke all</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="pf-toast" role="status"><i className="ti ti-check" style={{ fontSize: 16 }}></i> {toast}</div>}
    </div>
  );
}
