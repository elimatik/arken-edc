"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { findUser, userActivity, getRoleAvatarColor, initials, type UserStatus } from "@/lib/users-data";
import "../users.css";

const ROLE_BADGE: Record<string, string> = { CRC: "u-badge-blue", CRA: "u-badge-purple", PI: "u-badge-green", DM: "u-badge-amber", Admin: "u-badge-slate", Sponsor: "u-badge-slate" };
const ROLES = ["CRC", "CRA", "PI", "DM", "Admin"];
const SITE_TASKS = ["Data entry", "Query response", "SDV", "AE reporting", "Drug dispensing"];
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

  // Fix 2 — User information in-place edit (committed + drafts).
  const [editInfo, setEditInfo] = useState(false);
  const [fName, setFName] = useState(user?.name ?? "");
  const [fEmail, setFEmail] = useState(user?.email ?? "");
  const [fPhone, setFPhone] = useState(user?.phone ?? "");
  const [fOrg, setFOrg] = useState(user?.organization ?? "");
  const [fRole, setFRole] = useState<string>(user?.role ?? "CRC");
  const [dName, setDName] = useState(fName); const [dEmail, setDEmail] = useState(fEmail); const [dPhone, setDPhone] = useState(fPhone); const [dOrg, setDOrg] = useState(fOrg); const [dRole, setDRole] = useState(fRole);
  const [roleConfirm, setRoleConfirm] = useState(false);

  // Assignment state (Fix 7/8).
  const [assignedStudies, setAssignedStudies] = useState<Record<string, { role: string }>>(() => Object.fromEntries((user?.studies ?? [study.code]).map((c) => [c, { role: user?.role ?? "CRC" }])));
  const [curCodes, setCurCodes] = useState<string[]>(user?.siteCodes ?? []);
  const [curSigned, setCurSigned] = useState<string[]>(user?.signedSites ?? []);

  // Modals.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteType, setDeleteType] = useState("");
  const [asStudyOpen, setAsStudyOpen] = useState(false);
  const [asStudy, setAsStudy] = useState(""); const [asRole, setAsRole] = useState("CRC"); const [asSite, setAsSite] = useState(""); const [asTrained, setAsTrained] = useState(false);
  const [asSiteOpen, setAsSiteOpen] = useState(false);
  const [asSiteCode, setAsSiteCode] = useState(""); const [asSiteSigned, setAsSiteSigned] = useState(true); const [asSiteTasks, setAsSiteTasks] = useState<string[]>([]);

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
  const sponsor = dataset.studies.find((s) => s.id === studyId)?.sponsor ?? "the sponsor";

  // Form entries for delete gating (0 for never-logged-in users → deletable).
  const entryCount = useMemo(() => {
    if (!user || user.lastLogin === "Never") return 0;
    const codes = user.siteCodes;
    const subj = codes.length === 0
      ? dataset.subjects.filter((s) => s.study_id === studyId)
      : dataset.subjects.filter((s) => s.study_id === studyId && dataset.sites.some((si) => si.id === s.site_id && codes.includes(si.code)));
    return Math.max(3, subj.length * 3);
  }, [user, dataset.subjects, dataset.sites, studyId]);

  if (activeRole !== "Admin" && activeRole !== "DM") return null;
  if (!user) return (
    <div className="u-page"><nav className="u-breadcrumb"><a onClick={() => router.push(`/study/${studyId}/users`)}>Users</a></nav><div style={{ color: "var(--color-text-tertiary)" }}>User not found.</div></div>
  );

  const sb = statusBadge(localStatus);
  const allSites = curCodes.length === 0;
  const assignedSites = allSites ? studySites : studySites.filter((s) => curCodes.includes(s.code));
  const unassignedSites = allSites ? [] : studySites.filter((s) => !curCodes.includes(s.code));
  const siteLabel = allSites ? "All sites" : curCodes.map((c) => studySites.find((s) => s.code === c)?.name ?? c).join(", ");
  const availStudies = dataset.studies.filter((st) => !assignedStudies[st.code]);

  function startEditInfo() { setDName(fName); setDEmail(fEmail); setDPhone(fPhone); setDOrg(fOrg); setDRole(fRole); setEditInfo(true); }
  function commitInfo() { setFName(dName); setFEmail(dEmail); setFPhone(dPhone); setFOrg(dOrg); setFRole(dRole); setEditInfo(false); setRoleConfirm(false); setToast("User details saved"); }
  function saveInfo() { if (dRole !== fRole) { setRoleConfirm(true); return; } commitInfo(); }

  function confirmRemove() { setRemoveOpen(false); setToast(`${fName} has been removed from ${study.code}`); router.push(`/study/${studyId}/users`); }
  function confirmDelete() { if (deleteType.trim() !== fName) return; setDeleteOpen(false); setToast(`${fName}'s account has been deleted`); router.push(`/study/${studyId}/users`); }
  function openAssignStudy(code?: string) { setAsStudy(code ?? availStudies[0]?.code ?? ""); setAsRole("CRC"); setAsSite(""); setAsTrained(false); setAsStudyOpen(true); }
  function confirmAssignStudy() {
    if (!asStudy || !asTrained) { setToast("Select a study and confirm training"); return; }
    setAssignedStudies((p) => ({ ...p, [asStudy]: { role: asRole } })); setAsStudyOpen(false);
    setToast(`${fName} assigned to ${asStudy} as ${asRole}`);
  }
  function openAssignSite(code?: string) { setAsSiteCode(code ?? unassignedSites[0]?.code ?? ""); setAsSiteSigned(true); setAsSiteTasks([]); setAsSiteOpen(true); }
  function confirmAssignSite() {
    if (!asSiteCode) { setToast("Select a site"); return; }
    setCurCodes((p) => (p.includes(asSiteCode) ? p : [...p, asSiteCode]));
    if (asSiteSigned) setCurSigned((p) => (p.includes(asSiteCode) ? p : [...p, asSiteCode]));
    setAsSiteOpen(false);
    setToast(`${fName} assigned to ${studySites.find((s) => s.code === asSiteCode)?.name ?? asSiteCode}`);
  }

  return (
    <div className="u-page">
      <nav className="u-breadcrumb">
        <a onClick={() => router.push(`/study/${studyId}/users`)}>Users</a>
        <i className="ti ti-chevron-right"></i>
        <span>{fName}</span>
      </nav>

      {/* Header */}
      <div className="u-detail-header">
        <span className="u-avatar" style={{ width: 52, height: 52, fontSize: "var(--text-lg)", background: getRoleAvatarColor(fRole) }}>{initials(fName)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="u-detail-name">
            {fName}
            <span className={`u-badge ${ROLE_BADGE[fRole] ?? "u-badge-slate"}`}>{fRole}</span>
            <span className={`u-badge ${sb.cls}`}><span className="u-dot" style={{ background: sb.dot, marginRight: 3, width: 7, height: 7 }}></span>{sb.label}</span>
          </div>
          <div className="u-detail-meta">{fEmail} · {siteLabel} · Last login: {user.lastLogin}</div>
        </div>
        <div className="u-detail-actions">
          <button className="u-btn u-btn-sm" type="button" onClick={() => setToast("Password reset link sent")}><i className="ti ti-key"></i> Reset password</button>
          <button className="u-btn u-btn-sm u-btn-danger" type="button" onClick={() => setRemoveOpen(true)}><i className="ti ti-user-minus"></i> Remove from study</button>
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
              <div className="u-card-header"><div className="u-card-title">User information</div>{!editInfo && <button className="u-icon-btn" type="button" onClick={startEditInfo}><i className="ti ti-pencil"></i></button>}</div>
              <div>
                <div className="u-crow"><span className="u-clabel">Full name</span><span className="u-cvalue" style={{ flex: editInfo ? 1 : undefined }}>{editInfo ? <input className="u-finput" value={dName} onChange={(e) => setDName(e.target.value)} /> : fName}</span></div>
                <div className="u-crow"><span className="u-clabel">Email</span><span className="u-cvalue" style={{ flex: editInfo ? 1 : undefined }}>{editInfo ? <input className="u-finput" type="email" value={dEmail} onChange={(e) => setDEmail(e.target.value)} /> : fEmail}</span></div>
                <div className="u-crow"><span className="u-clabel">Phone</span><span className={`u-cvalue${editInfo ? "" : " mono"}`} style={{ flex: editInfo ? 1 : undefined }}>{editInfo ? <input className="u-finput" type="tel" value={dPhone} onChange={(e) => setDPhone(e.target.value)} /> : (fPhone || "—")}</span></div>
                <div className="u-crow"><span className="u-clabel">Organization</span><span className="u-cvalue" style={{ flex: editInfo ? 1 : undefined }}>{editInfo ? <input className="u-finput" value={dOrg} onChange={(e) => setDOrg(e.target.value)} /> : (fOrg || "—")}</span></div>
                <div className="u-crow"><span className="u-clabel">Role ({study.code})</span><span className="u-cvalue">{editInfo ? <select className="u-fselect" style={{ width: 140 }} value={dRole} onChange={(e) => setDRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select> : <span className={`u-badge ${ROLE_BADGE[fRole] ?? "u-badge-slate"}`}>{fRole}</span>}</span></div>
                <div className="u-crow"><span className="u-clabel">Added to study</span><span className="u-cvalue mono">{user.addedDate ?? "—"}</span></div>
                {editInfo && (
                  <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", padding: "var(--space-3) var(--space-5)" }}>
                    <button className="u-btn u-btn-sm" type="button" onClick={() => setEditInfo(false)}>Cancel</button>
                    <button className="u-btn u-btn-sm u-btn-primary" type="button" onClick={saveInfo}><i className="ti ti-check"></i> Save</button>
                  </div>
                )}
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
                          <button className="u-status-item" type="button" onClick={() => { setMenuOpen(false); setToast(`Invite resent to ${fEmail}`); }}>
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
                        <button className="u-status-item" type="button" onClick={() => { setMenuOpen(false); setRemoveOpen(true); }}>
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
                  const on = allSites || curCodes.includes(s.code);
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
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: 2 }}>{fName} is active on {Object.keys(assignedStudies).length} {Object.keys(assignedStudies).length === 1 ? "study" : "studies"} for {sponsor}</div>
            </div>
            <button className="u-btn u-btn-primary u-btn-sm" type="button" disabled={availStudies.length === 0} onClick={() => openAssignStudy()}><i className="ti ti-plus"></i> Assign to study</button>
          </div>

          {dataset.studies.map((st) => {
            const isCurrent = st.code === study.code;
            const a = assignedStudies[st.code];
            if (!a) {
              return (
                <div key={st.id} className="u-unassigned">
                  <div><div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>{st.code} — {st.name}</div><div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-placeholder)", marginTop: 2 }}>Not assigned to this study</div></div>
                  <button className="u-btn u-btn-sm" type="button" onClick={() => openAssignStudy(st.code)}><i className="ti ti-plus"></i> Assign</button>
                </div>
              );
            }
            return (
              <div key={st.id} className="u-study-card">
                <div className="u-study-head">
                  <div><div className="u-study-name">{st.code} — {st.name}</div><div className="u-study-desc">{st.sponsor} · {st.status}</div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span className={`u-badge ${ROLE_BADGE[a.role] ?? "u-badge-slate"}`}>{a.role}</span>
                    <span className="u-badge u-badge-green">Active</span>
                    <button className="u-icon-btn" type="button" title="Remove from study" style={{ color: "var(--red-600)" }} onClick={() => { setAssignedStudies((p) => { const n = { ...p }; delete n[st.code]; return n; }); setToast(`Removed from ${st.code}`); }}><i className="ti ti-user-minus"></i></button>
                  </div>
                </div>
                <div className="u-study-row"><span className="u-study-rowlabel">Assigned since</span><span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{user.addedDate ?? "—"}</span></div>
                <div className="u-study-row"><span className="u-study-rowlabel">Training status</span><span className="u-pill u-pill-green" style={{ fontSize: 10 }}><i className="ti ti-check" style={{ fontSize: 9 }}></i> Trained {user.trainingVersion ?? ""}</span></div>
                {isCurrent && (
                  <div className="u-study-sites">
                    <div className="u-study-sites-title">Site access within this study</div>
                    {assignedSites.map((s) => {
                      const signed = allSites || curSigned.includes(s.code);
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
                            <button className="u-icon-btn" type="button" title="Remove from site" onClick={() => { setCurCodes((p) => p.filter((c) => c !== s.code)); setToast(`Removed from ${s.name}`); }}><i className="ti ti-minus" style={{ fontSize: 12 }}></i></button>
                          </div>
                        </div>
                      );
                    })}
                    {unassignedSites.map((s) => (
                      <div key={s.id} className="u-site-row" style={{ opacity: 0.5 }}>
                        <div><span className="u-site-name" style={{ color: "var(--color-text-tertiary)" }}>{s.name} — not assigned</span></div>
                        <button className="u-btn u-btn-sm" type="button" onClick={() => openAssignSite(s.code)}><i className="ti ti-plus"></i> Add site</button>
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
            <div className="u-log-meta"><span>{filteredActivity.length} actions · {fName} · {study.code}</span><span style={{ fontFamily: "var(--font-mono)" }}>2026-06-01 → 2026-06-30</span></div>
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

      {/* Footer — Delete only */}
      <div className="u-footer">
        <button className="u-btn u-btn-danger" type="button" disabled={entryCount > 0} title={entryCount > 0 ? `Cannot delete — user has ${entryCount} form entries. Use 'Remove from study' instead.` : undefined} onClick={() => { setDeleteType(""); setDeleteOpen(true); }}><i className="ti ti-trash"></i> Delete user</button>
      </div>

      {/* Role-change confirm */}
      {roleConfirm && (
        <div className="u-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRoleConfirm(false); }}>
          <div className="u-modal" style={{ width: 420 }} role="dialog" aria-modal="true">
            <div className="u-modal-header"><div className="u-modal-title">Change user role?</div></div>
            <div className="u-modal-body"><div style={{ fontSize: "var(--text-sm)" }}>Changing this user&apos;s role will update their permissions immediately. Continue?</div></div>
            <div className="u-modal-footer"><button className="u-btn" type="button" onClick={() => setRoleConfirm(false)}>Cancel</button><button className="u-btn u-btn-primary" type="button" onClick={commitInfo}>Confirm</button></div>
          </div>
        </div>
      )}

      {/* Remove from study confirm (Fix 5) */}
      {removeOpen && (
        <div className="u-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRemoveOpen(false); }}>
          <div className="u-modal" style={{ width: 460 }} role="dialog" aria-modal="true">
            <div className="u-modal-header"><div className="u-modal-title">Remove {fName} from {study.code}?</div><button className="u-icon-btn" type="button" onClick={() => setRemoveOpen(false)}><i className="ti ti-x" style={{ fontSize: 18 }}></i></button></div>
            <div className="u-modal-body">
              <div style={{ fontSize: "var(--text-sm)" }}>This will revoke {fName}&apos;s access to {study.code} and all its sites. Their data entries, audit trail, and activity log will be preserved. This action can be reversed by re-inviting the user.</div>
              <div className="u-warn u-warn-amber"><i className="ti ti-alert-triangle" style={{ flexShrink: 0, marginTop: 1 }}></i><span>If this user has unsigned forms or open queries, those will remain and must be reassigned.</span></div>
            </div>
            <div className="u-modal-footer"><button className="u-btn" type="button" onClick={() => setRemoveOpen(false)}>Cancel</button><button className="u-btn u-btn-danger" type="button" onClick={confirmRemove}><i className="ti ti-user-minus"></i> Remove from study</button></div>
          </div>
        </div>
      )}

      {/* Delete user confirm (Fix 6) */}
      {deleteOpen && (
        <div className="u-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeleteOpen(false); }}>
          <div className="u-modal" style={{ width: 460 }} role="dialog" aria-modal="true">
            <div className="u-modal-header"><div className="u-modal-title">Permanently delete {fName}?</div><button className="u-icon-btn" type="button" onClick={() => setDeleteOpen(false)}><i className="ti ti-x" style={{ fontSize: 18 }}></i></button></div>
            <div className="u-modal-body">
              <div style={{ fontSize: "var(--text-sm)" }}>This will permanently delete {fName}&apos;s account. This action cannot be undone.</div>
              <div className="u-warn u-warn-red"><i className="ti ti-alert-octagon" style={{ flexShrink: 0, marginTop: 1 }}></i><span>Only users with no data entries can be deleted. This user has {entryCount} form entries.</span></div>
              <div className="u-field"><label className="u-flabel">Type <strong>{fName}</strong> to confirm</label><input className="u-finput" value={deleteType} onChange={(e) => setDeleteType(e.target.value)} placeholder={fName} /></div>
            </div>
            <div className="u-modal-footer"><button className="u-btn" type="button" onClick={() => setDeleteOpen(false)}>Cancel</button><button className="u-btn u-btn-danger" type="button" disabled={deleteType.trim() !== fName} onClick={confirmDelete}><i className="ti ti-trash"></i> Delete permanently</button></div>
          </div>
        </div>
      )}

      {/* Assign to study (Fix 7) */}
      {asStudyOpen && (
        <div className="u-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAsStudyOpen(false); }}>
          <div className="u-modal" role="dialog" aria-modal="true">
            <div className="u-modal-header"><div className="u-modal-title">Assign to study</div><button className="u-icon-btn" type="button" onClick={() => setAsStudyOpen(false)}><i className="ti ti-x" style={{ fontSize: 18 }}></i></button></div>
            <div className="u-modal-body">
              <div className="u-field"><label className="u-flabel">Study</label><select className="u-fselect" value={asStudy} onChange={(e) => setAsStudy(e.target.value)}>{availStudies.map((st) => <option key={st.id} value={st.code}>{st.code} — {st.name}</option>)}</select></div>
              <div className="u-field"><label className="u-flabel">Role in that study</label><select className="u-fselect" value={asRole} onChange={(e) => setAsRole(e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select><div className="u-fhint">Role can differ from their role in other studies.</div></div>
              <div className="u-field"><label className="u-flabel">Site assignment</label><select className="u-fselect" value={asSite} onChange={(e) => setAsSite(e.target.value)}><option value="">All sites</option>{dataset.sites.filter((s) => dataset.studies.find((st) => st.code === asStudy)?.id === s.study_id).map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}</select></div>
              <label className="u-check"><input type="checkbox" checked={asTrained} onChange={(e) => setAsTrained(e.target.checked)} /> I confirm this user has been trained on the selected study&apos;s protocol</label>
            </div>
            <div className="u-modal-footer"><button className="u-btn" type="button" onClick={() => setAsStudyOpen(false)}>Cancel</button><button className="u-btn u-btn-primary" type="button" onClick={confirmAssignStudy}>Assign</button></div>
          </div>
        </div>
      )}

      {/* Assign to site (Fix 8) */}
      {asSiteOpen && (
        <div className="u-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAsSiteOpen(false); }}>
          <div className="u-modal" role="dialog" aria-modal="true">
            <div className="u-modal-header"><div className="u-modal-title">Assign to site</div><button className="u-icon-btn" type="button" onClick={() => setAsSiteOpen(false)}><i className="ti ti-x" style={{ fontSize: 18 }}></i></button></div>
            <div className="u-modal-body">
              <div className="u-field"><label className="u-flabel">Study</label><input className="u-finput" value={`${study.code} — ${study.name}`} disabled /></div>
              <div className="u-field"><label className="u-flabel">Site</label><select className="u-fselect" value={asSiteCode} onChange={(e) => setAsSiteCode(e.target.value)}>{unassignedSites.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}</select></div>
              <div className="u-field">
                <label className="u-flabel">Delegation log status</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <label className="u-check"><input type="radio" name="asdel" checked={asSiteSigned} onChange={() => setAsSiteSigned(true)} /> Delegation log already signed by PI</label>
                  <label className="u-check"><input type="radio" name="asdel" checked={!asSiteSigned} onChange={() => setAsSiteSigned(false)} /> Pending PI signature</label>
                </div>
              </div>
              {asSiteSigned && (
                <div className="u-field"><label className="u-flabel">Tasks authorized</label>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SITE_TASKS.map((t) => {
                      const on = asSiteTasks.includes(t);
                      return <button key={t} type="button" className={`u-chip${on ? " on" : ""}`} onClick={() => setAsSiteTasks((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}>{t}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="u-modal-footer"><button className="u-btn" type="button" onClick={() => setAsSiteOpen(false)}>Cancel</button><button className="u-btn u-btn-primary" type="button" onClick={confirmAssignSite}>Assign</button></div>
          </div>
        </div>
      )}

      {toast && <div className="u-toast" role="status">{toast}</div>}
    </div>
  );
}
