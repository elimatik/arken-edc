"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { findUser, userActivity, avatarColor, initials, type UserStatus } from "@/lib/users-data";
import "../users.css";

const ROLE_BADGE: Record<string, string> = { CRC: "u-badge-blue", CRA: "u-badge-purple", PI: "u-badge-green", DM: "u-badge-amber", Admin: "u-badge-slate", Sponsor: "u-badge-slate" };
function statusBadge(s: UserStatus): { cls: string; dot: string; label: string } {
  if (s === "inactive") return { cls: "u-badge-slate", dot: "var(--color-text-tertiary)", label: "Inactive" };
  if (s === "pending") return { cls: "u-badge-amber", dot: "var(--amber-700)", label: "Pending" };
  if (s === "locked") return { cls: "u-badge-red", dot: "var(--red-600)", label: "Locked" };
  return { cls: "u-badge-green", dot: "var(--green-600)", label: "Active" };
}
const ACT_DOT: Record<string, string> = { form: "d-form", query: "d-query", login: "d-login", settings: "d-settings", sdv: "d-sdv", inv: "d-inv" };

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const userId = String(params.userId);
  const { study, activeRole } = useShell();
  const { dataset } = useStudySession();

  const user = useMemo(() => findUser(study.code, userId), [study.code, userId]);
  const [tab, setTab] = useState<"overview" | "studies" | "activity">("overview");
  const [localStatus, setLocalStatus] = useState<UserStatus>(user?.status ?? "active");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [actSearch, setActSearch] = useState("");
  const [actModule, setActModule] = useState("all");
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { if (!menuOpen) return; const close = () => setMenuOpen(false); document.addEventListener("click", close); return () => document.removeEventListener("click", close); }, [menuOpen]);

  const studySites = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code)), [dataset.sites, studyId]);
  const staffFormId = useMemo(() => dataset.forms.find((f) => f.study_id === studyId && f.name === "Site Staff & Delegation Log")?.id, [dataset.forms, studyId]);
  const subjectsAt = (siteId: string) => dataset.subjects.filter((s) => s.study_id === studyId && s.site_id === siteId).length;
  const activity = useMemo(() => userActivity(userId), [userId]);
  const filteredActivity = activity.filter((a) => {
    if (actModule !== "all" && a.module !== actModule) return false;
    const q = actSearch.toLowerCase().trim();
    if (q && !a.action.toLowerCase().includes(q) && !a.record.toLowerCase().includes(q)) return false;
    return true;
  });

  if (activeRole !== "Admin" && activeRole !== "DM") return null;
  if (!user) return (
    <div className="u-page"><nav className="u-breadcrumb"><a onClick={() => router.push(`/study/${studyId}/users`)}>Users</a></nav><div style={{ color: "var(--color-text-tertiary)" }}>User not found.</div></div>
  );

  const sb = statusBadge(localStatus);
  const allSites = user.siteCodes.length === 0;
  const assignedSites = allSites ? studySites : studySites.filter((s) => user.siteCodes.includes(s.code));
  const unassignedSites = allSites ? [] : studySites.filter((s) => !user.siteCodes.includes(s.code));
  const siteLabel = allSites ? "All sites" : user.siteCodes.map((c) => studySites.find((s) => s.code === c)?.name ?? c).join(", ");
  const studies = dataset.studies.slice();
  const assignedStudyCodes = new Set(user.studies ?? [study.code]);
  const sponsor = dataset.studies.find((s) => s.id === studyId)?.sponsor ?? "the sponsor";

  return (
    <div className="u-page">
      <nav className="u-breadcrumb">
        <a onClick={() => router.push(`/study/${studyId}/users`)}>Users</a>
        <i className="ti ti-chevron-right"></i>
        <span>{user.name}</span>
      </nav>

      {/* Header */}
      <div className="u-detail-header">
        <span className="u-avatar" style={{ width: 52, height: 52, fontSize: "var(--text-lg)", background: avatarColor(user.name) }}>{initials(user.name)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="u-detail-name">
            {user.name}
            <span className={`u-badge ${ROLE_BADGE[user.role] ?? "u-badge-slate"}`}>{user.role}</span>
            <span className={`u-badge ${sb.cls}`}><span className="u-dot" style={{ background: sb.dot, marginRight: 3, width: 7, height: 7 }}></span>{sb.label}</span>
          </div>
          <div className="u-detail-meta">{user.email} · {siteLabel} · Last login: {user.lastLogin}</div>
        </div>
        <div className="u-detail-actions">
          <button className="u-btn u-btn-sm" type="button" onClick={() => setToast("Edit details — demo")}><i className="ti ti-pencil"></i> Edit details</button>
          <button className="u-btn u-btn-sm" type="button" onClick={() => setToast("Password reset link sent")}><i className="ti ti-key"></i> Reset password</button>
          <button className="u-btn u-btn-sm u-btn-danger" type="button" onClick={() => setToast(`Removed from ${study.code}`)}><i className="ti ti-trash"></i> Remove from study</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="u-tabs">
        {(["overview", "studies", "activity"] as const).map((t) => (
          <button key={t} type="button" className={`u-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>{t === "overview" ? "Overview" : t === "studies" ? "Study & site access" : "Activity log"}</button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="u-cols">
          <div>
            <div className="u-card">
              <div className="u-card-header"><div className="u-card-title">User information</div><button className="u-icon-btn" type="button" onClick={() => setToast("Edit details — demo")}><i className="ti ti-pencil"></i></button></div>
              <div>
                <div className="u-crow"><span className="u-clabel">Full name</span><span className="u-cvalue">{user.name}</span></div>
                <div className="u-crow"><span className="u-clabel">Email</span><span className="u-cvalue">{user.email}</span></div>
                <div className="u-crow"><span className="u-clabel">Phone</span><span className="u-cvalue mono">{user.phone ?? "—"}</span></div>
                <div className="u-crow"><span className="u-clabel">Organization</span><span className="u-cvalue">{user.organization ?? "—"}</span></div>
                <div className="u-crow"><span className="u-clabel">Role ({study.code})</span><span className="u-cvalue"><span className={`u-badge ${ROLE_BADGE[user.role] ?? "u-badge-slate"}`}>{user.role}</span></span></div>
                <div className="u-crow"><span className="u-clabel">Added to study</span><span className="u-cvalue mono">{user.addedDate ?? "—"}</span></div>
              </div>
            </div>

            <div className="u-card">
              <div className="u-card-header"><div className="u-card-title">Account</div></div>
              <div>
                <div className="u-crow">
                  <span className="u-clabel">Account status</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", position: "relative" }}>
                    <span className={`u-badge ${sb.cls}`}><span className="u-dot" style={{ background: sb.dot, marginRight: 3, width: 7, height: 7 }}></span>{sb.label}</span>
                    <button className="u-btn u-btn-sm" type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}>Change status <i className="ti ti-chevron-down" style={{ fontSize: 11 }}></i></button>
                    {menuOpen && (
                      <div className="u-status-menu" onClick={(e) => e.stopPropagation()}>
                        <div className="u-status-menu-head">Change account status</div>
                        {localStatus === "pending" && (
                          <button className="u-status-item" type="button" onClick={() => { setMenuOpen(false); setToast(`Invite resent to ${user.email}`); }}>
                            <i className="ti ti-mail" style={{ fontSize: 16, color: "var(--blue-600)", marginTop: 1, flexShrink: 0 }}></i>
                            <div><div style={{ fontWeight: 500 }}>Resend invite</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Sends a fresh invite link. The original expires after 72 hours.</div></div>
                          </button>
                        )}
                        <button className="u-status-item" type="button" onClick={() => { setLocalStatus("inactive"); setMenuOpen(false); setToast("User set to inactive"); }}>
                          <i className="ti ti-player-pause" style={{ fontSize: 16, color: "var(--color-text-tertiary)", marginTop: 1, flexShrink: 0 }}></i>
                          <div><div style={{ fontWeight: 500 }}>Set inactive</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Temporarily blocks login. Data and history preserved. Reversible.</div></div>
                        </button>
                        <button className="u-status-item" type="button" onClick={() => { setLocalStatus("locked"); setMenuOpen(false); setToast("Account locked"); }}>
                          <i className="ti ti-lock" style={{ fontSize: 16, color: "var(--amber-700)", marginTop: 1, flexShrink: 0 }}></i>
                          <div><div style={{ fontWeight: 500 }}>Lock account</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Immediate block. Use for compliance holds or suspected unauthorized access.</div></div>
                        </button>
                        <button className="u-status-item" type="button" onClick={() => { setMenuOpen(false); setToast(`Removed from ${study.code}`); }}>
                          <i className="ti ti-user-minus" style={{ fontSize: 16, color: "var(--red-600)", marginTop: 1, flexShrink: 0 }}></i>
                          <div><div style={{ fontWeight: 500, color: "var(--red-600)" }}>Remove from study</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>Removes access to this study only. Account and other study access unaffected. Audit trail preserved.</div></div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="u-crow"><span className="u-clabel"></span><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", textAlign: "right", maxWidth: 300 }}>User accounts with data entries cannot be permanently deleted — audit trail integrity is required by 21 CFR Part 11.</div></div>
                <div className="u-crow"><span className="u-clabel">Two-factor auth</span><span className="u-cvalue"><span className={`u-badge ${user.twoFactor ? "u-badge-green" : "u-badge-slate"}`}>{user.twoFactor ? "Enabled" : "Not enabled"}</span></span></div>
                <div className="u-crow"><span className="u-clabel">Last login</span><span className="u-cvalue mono">{user.lastLogin}</span></div>
                <div className="u-crow"><span className="u-clabel">IP address</span><span className="u-cvalue mono">{user.ip ?? "—"}</span></div>
              </div>
            </div>
          </div>

          <div>
            <div className="u-card">
              <div className="u-card-header"><div className="u-card-title">Training &amp; compliance</div><button className="u-btn u-btn-sm" type="button" onClick={() => setToast("Reminder sent")}><i className="ti ti-send"></i> Send reminder</button></div>
              <div>
                <div className="u-crow"><span className="u-clabel">Protocol {user.trainingVersion ?? "—"}</span><span className="u-cvalue">{user.training === "trained" ? <span className="u-pill u-pill-green"><i className="ti ti-check" style={{ fontSize: 10 }}></i> Trained {user.trainingDate ?? ""}</span> : user.training === "needs_update" ? <span className="u-pill u-pill-amber"><i className="ti ti-alert-triangle" style={{ fontSize: 10 }}></i> Needs update</span> : <span className="u-pill u-pill-red">Not trained</span>}</span></div>
                <div className="u-crow"><span className="u-clabel">Trained by</span><span className="u-cvalue">{user.trainedBy ?? "—"}</span></div>
                <div className="u-crow"><span className="u-clabel">GCP certification</span><span className="u-cvalue">{user.gcpExpiry ? <span className="u-badge u-badge-green">Valid — exp. {user.gcpExpiry}</span> : <span className="u-badge u-badge-slate">—</span>}</span></div>
                <div className="u-crow"><span className="u-clabel">Delegation log</span><span className="u-cvalue"><span className={`u-badge ${user.delegationSigned ? "u-badge-green" : "u-badge-amber"}`}>{user.delegationSigned ? "Signed" : "Not signed"}</span></span></div>
                <div className="u-crow"><span className="u-clabel">Delegated tasks</span><span className="u-cvalue" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{(user.delegatedTasks ?? []).join(" · ") || "—"}</span></div>
              </div>
            </div>

            <div className="u-card">
              <div className="u-card-header"><div className="u-card-title">Current study sites</div></div>
              <div>
                {studySites.map((s) => {
                  const on = allSites || user.siteCodes.includes(s.code);
                  return (
                    <div key={s.id} className="u-crow">
                      <span className="u-clabel" style={{ color: "var(--color-text-primary)" }}>{s.name}</span>
                      {on ? <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}><span className="u-badge u-badge-green">Active</span><span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>{subjectsAt(s.id)} entries</span></div>
                        : <span className="u-badge u-badge-slate">Not assigned</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STUDY & SITE ACCESS */}
      {tab === "studies" && (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)", gap: "var(--space-3)" }}>
            <div>
              <div style={{ fontSize: "var(--text-base)", fontWeight: 500 }}>Study assignments</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>{user.name} is active on {assignedStudyCodes.size} {assignedStudyCodes.size === 1 ? "study" : "studies"} for {sponsor}</div>
            </div>
            <button className="u-btn u-btn-primary u-btn-sm" type="button" onClick={() => setToast("Assign to study — demo")}><i className="ti ti-plus"></i> Assign to study</button>
          </div>

          {studies.map((st) => {
            const isCurrent = st.code === study.code;
            const assigned = assignedStudyCodes.has(st.code);
            if (!assigned) {
              return (
                <div key={st.id} className="u-unassigned">
                  <div><div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>{st.code} — {st.name}</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-placeholder)", marginTop: 2 }}>Not assigned to this study</div></div>
                  <button className="u-btn u-btn-sm" type="button" onClick={() => setToast(`Assign to ${st.code} — demo`)}><i className="ti ti-plus"></i> Assign</button>
                </div>
              );
            }
            return (
              <div key={st.id} className="u-study-card">
                <div className="u-study-head">
                  <div><div className="u-study-name">{st.code} — {st.name}</div><div className="u-study-desc">{st.sponsor} · {st.status}</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span className={`u-badge ${ROLE_BADGE[user.role] ?? "u-badge-slate"}`}>{user.role}</span>
                    <span className="u-badge u-badge-green">Active</span>
                    <button className="u-icon-btn" type="button" title="Remove from study" style={{ color: "var(--red-600)" }} onClick={() => setToast(`Removed from ${st.code}`)}><i className="ti ti-user-minus"></i></button>
                  </div>
                </div>
                <div className="u-study-row"><span className="u-study-rowlabel">Assigned since</span><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{user.addedDate ?? "—"}</span></div>
                <div className="u-study-row"><span className="u-study-rowlabel">Training status</span><span className="u-pill u-pill-green" style={{ fontSize: 10 }}><i className="ti ti-check" style={{ fontSize: 9 }}></i> Trained {user.trainingVersion ?? ""}</span></div>
                {isCurrent && (
                  <div className="u-study-sites">
                    <div className="u-study-sites-title">Site access within this study</div>
                    {assignedSites.map((s) => {
                      const signed = allSites || (user.signedSites ?? []).includes(s.code);
                      return (
                        <div key={s.id} className="u-site-row">
                          <div>
                            <span className="u-site-name">{s.name}</span>
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>PI: {s.principal_investigator ?? "—"}</div>
                            {signed
                              ? <div style={{ fontSize: "var(--text-xs)", color: "var(--green-600)", marginTop: 2 }}><i className="ti ti-check" style={{ fontSize: 10 }}></i> Delegation log signed — authorized tasks: {(user.delegatedTasks ?? []).join(" · ") || "Data entry"}</div>
                              : <div style={{ fontSize: "var(--text-xs)", color: "var(--amber-700)", marginTop: 2 }}><i className="ti ti-alert-triangle" style={{ fontSize: 10 }}></i> Delegation log not yet signed by PI — <a style={{ color: "var(--amber-700)", cursor: "pointer" }} onClick={() => staffFormId && router.push(`/study/${studyId}/sites/${s.id}?form=${staffFormId}`)}>Go to Site Staff &amp; Delegation Log →</a></div>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                            <span className="u-badge u-badge-green" style={{ fontSize: 10 }}>Active</span>
                            <button className="u-icon-btn" type="button" title="Remove from site" onClick={() => setToast(`Removed from ${s.name}`)}><i className="ti ti-minus" style={{ fontSize: 12 }}></i></button>
                          </div>
                        </div>
                      );
                    })}
                    {unassignedSites.map((s) => (
                      <div key={s.id} className="u-site-row" style={{ opacity: 0.5 }}>
                        <div><span className="u-site-name" style={{ color: "var(--color-text-tertiary)" }}>{s.name} — not assigned</span></div>
                        <button className="u-btn u-btn-sm" type="button" onClick={() => setToast(`Add ${s.name} — demo`)}><i className="ti ti-plus"></i> Add site</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* ACTIVITY LOG */}
      {tab === "activity" && (
        <>
          <div className="u-toolbar">
            <input className="u-input u-search" type="search" placeholder="Search actions…" value={actSearch} onChange={(e) => setActSearch(e.target.value)} style={{ minWidth: 200, flex: "0 0 auto" }} />
            <select className="u-select" value={actModule} onChange={(e) => setActModule(e.target.value)}>
              <option value="all">All modules</option><option>Data entry</option><option>Queries</option><option>SDV</option><option>Inventory</option><option>Settings</option><option>Auth</option>
            </select>
            <select className="u-select" defaultValue="Last 30 days"><option>Last 30 days</option><option>Last 7 days</option><option>Last 90 days</option></select>
            <input type="date" className="u-select" defaultValue="2026-06-01" style={{ width: 150 }} />
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>to</span>
            <input type="date" className="u-select" defaultValue="2026-06-30" style={{ width: 150 }} />
            <button className="u-btn u-btn-sm" type="button" style={{ marginLeft: "auto" }} onClick={() => setToast("Export log — coming soon")}><i className="ti ti-download"></i> Export log</button>
          </div>
          <div className="u-log-wrap">
            <div className="u-log-meta"><span>{filteredActivity.length} actions · {user.name} · {study.code}</span><span style={{ fontFamily: "var(--font-mono)" }}>2026-06-01 → 2026-06-30</span></div>
            <table className="u-log-table">
              <thead><tr><th>Timestamp (UTC)</th><th>Action</th><th>Module</th><th>Record</th><th>Study</th><th>IP address</th></tr></thead>
              <tbody>
                {filteredActivity.map((a, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{a.ts}</td>
                    <td><span className={`u-act-dot ${ACT_DOT[a.kind]}`}></span>{a.action}</td>
                    <td style={{ color: a.module === "Auth" ? "var(--color-text-tertiary)" : undefined }}>{a.module}</td>
                    <td style={{ fontFamily: a.record === "—" ? undefined : "var(--font-mono)", fontSize: 10, color: a.record === "—" ? "var(--color-text-tertiary)" : undefined }}>{a.record}</td>
                    <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-tertiary)" }}>{a.study}</td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>{a.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Footer */}
      <div className="u-footer">
        <button className="u-btn u-btn-danger" type="button" disabled title="Cannot delete — user has data entries"><i className="ti ti-trash"></i> Delete user</button>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <button className="u-btn u-btn-sm" type="button" onClick={() => setToast("Password reset link sent")}><i className="ti ti-key"></i> Reset password</button>
          <button className="u-btn u-btn-sm" type="button" onClick={() => setToast("Edit details — demo")}><i className="ti ti-pencil"></i> Edit details</button>
        </div>
      </div>

      {toast && <div className="u-toast" role="status">{toast}</div>}
    </div>
  );
}
