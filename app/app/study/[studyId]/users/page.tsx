"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { usersForStudy, avatarColor, initials, type AppUser } from "@/lib/users-data";
import type { Role } from "@/lib/permissions";
import "./users.css";

const ROLE_BADGE: Record<string, string> = { CRC: "u-badge-blue", CRA: "u-badge-purple", PI: "u-badge-green", DM: "u-badge-amber", Admin: "u-badge-slate", Sponsor: "u-badge-slate" };

function statusUI(u: AppUser): { color: string; label: string } {
  if (u.status === "pending") return { color: "var(--amber-700)", label: "Pending invite" };
  if (u.status === "inactive") return { color: "var(--color-text-tertiary)", label: "Inactive" };
  if (u.status === "locked") return { color: "var(--red-600)", label: "Locked" };
  return u.online ? { color: "var(--green-600)", label: "Online now" } : { color: "var(--color-text-tertiary)", label: "Offline" };
}
function trainingUI(u: AppUser): { cls: string; label: string } {
  if (u.training === "trained") return { cls: "u-pill-green", label: `Trained ${u.trainingVersion ?? ""}`.trim() };
  if (u.training === "needs_update") return { cls: "u-pill-amber", label: "Needs update" };
  if (u.training === "not_trained") return { cls: "u-pill-red", label: "Not trained" };
  return { cls: "u-pill-slate", label: "—" };
}

export default function UsersListPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const { study, activeRole } = useShell();
  const { dataset } = useStudySession();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [siteFilter, setSiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2400); return () => clearTimeout(t); }, [toast]);

  const sites = useMemo(() => dataset.sites.filter((s) => s.study_id === studyId).slice().sort((a, b) => a.code.localeCompare(b.code)), [dataset.sites, studyId]);
  const siteName = (code: string) => sites.find((s) => s.code === code)?.name ?? code;
  const userSites = (u: AppUser) => (u.siteCodes.length === 0 ? "All sites" : u.siteCodes.map(siteName).join(", "));

  // Invited (pending) users live in component state.
  const [invited, setInvited] = useState<AppUser[]>([]);
  const users = useMemo(() => [...usersForStudy(study.code), ...invited], [study.code, invited]);

  const siteCount = useMemo(() => new Set(users.flatMap((u) => u.siteCodes)).size, [users]);
  const needsUpdate = users.filter((u) => u.training === "needs_update").length;

  const filtered = users.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (statusFilter !== "all" && u.status !== statusFilter) return false;
    if (siteFilter !== "all" && !(u.siteCodes.length === 0 || u.siteCodes.includes(siteFilter))) return false;
    const q = search.toLowerCase().trim();
    if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    return true;
  });

  // Invite modal.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [iFirst, setIFirst] = useState(""); const [iLast, setILast] = useState(""); const [iEmail, setIEmail] = useState(""); const [iRole, setIRole] = useState(""); const [iSite, setISite] = useState(""); const [iMsg, setIMsg] = useState("");
  function openInvite() { setIFirst(""); setILast(""); setIEmail(""); setIRole(""); setISite(""); setIMsg(""); setInviteOpen(true); }
  function sendInvite() {
    if (!iFirst.trim() || !iLast.trim() || !iEmail.trim() || !iRole) { setToast("First name, last name, email and role are required"); return; }
    const u: AppUser = { id: `u-inv-${Date.now()}`, name: `${iFirst.trim()} ${iLast.trim()}`, email: iEmail.trim(), role: iRole as Role, siteCodes: iSite ? [iSite] : [], status: "pending", online: false, training: "not_trained", lastLogin: "Never" };
    setInvited((p) => [...p, u]);
    setInviteOpen(false);
    setToast(`Invite sent to ${iEmail.trim()}`);
  }

  if (activeRole !== "Admin" && activeRole !== "DM") return null;

  return (
    <div className="u-page">
      <div className="u-header">
        <div>
          <h1 className="u-title">Users</h1>
          <div className="u-sub">{study.code} · {users.length} users across {siteCount} sites</div>
        </div>
        <button className="u-btn u-btn-primary" type="button" onClick={openInvite}><i className="ti ti-user-plus"></i> Invite user</button>
      </div>

      <div className="u-banner">
        <i className="ti ti-info-circle"></i>
        <span>Visible to Admin and DM only. PIs see only users at their own site (read-only). CRCs and CRAs do not have access to this section.</span>
      </div>

      <div className="u-toolbar">
        <input className="u-input u-search" type="search" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="u-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="all">All roles</option><option>CRC</option><option>CRA</option><option>PI</option><option>DM</option><option>Admin</option>
        </select>
        <select className="u-select" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
          <option value="all">All sites</option>{sites.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}
        </select>
        <select className="u-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="pending">Pending</option><option value="locked">Locked</option>
        </select>
        <button className="u-btn u-btn-icon" type="button" title="Export" onClick={() => setToast("Export — coming soon")}><i className="ti ti-download"></i></button>
      </div>

      <table className="u-table">
        <thead><tr><th>User</th><th>Role (this study)</th><th>Site(s)</th><th>Status</th><th>Training</th><th>Last login</th><th></th></tr></thead>
        <tbody>
          {filtered.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No users match the current filters.</td></tr>
          ) : filtered.map((u) => {
            const st = statusUI(u); const tr = trainingUI(u);
            return (
              <tr key={u.id} className={`u-row${u.status === "inactive" ? " inactive" : ""}`} onClick={() => router.push(`/study/${studyId}/users/${u.id}`)}>
                <td>
                  <div className="u-userc">
                    <span className="u-avatar" style={{ background: avatarColor(u.name) }}>{initials(u.name)}</span>
                    <div><div className="u-name">{u.name}</div><div className="u-email">{u.email}</div></div>
                  </div>
                </td>
                <td><span className={`u-badge ${ROLE_BADGE[u.role] ?? "u-badge-slate"}`}>{u.role}</span></td>
                <td>{userSites(u)}</td>
                <td><span className="u-dot" style={{ background: st.color }}></span>{st.label}</td>
                <td><span className={`u-pill ${tr.cls}`}>{tr.label}</span></td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>{u.lastLogin}</td>
                <td style={{ textAlign: "right", color: "var(--color-text-placeholder)" }}><i className="ti ti-chevron-right"></i></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="u-meta">
        <span>{users.length} {users.length === 1 ? "user" : "users"}</span>
        {needsUpdate > 0 && <span className="u-meta-alert"><i className="ti ti-alert-triangle" style={{ fontSize: 12 }}></i> {needsUpdate} {needsUpdate === 1 ? "user needs" : "users need"} a training update</span>}
      </div>

      {/* Invite modal */}
      {inviteOpen && (
        <div className="u-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setInviteOpen(false); }}>
          <div className="u-modal" role="dialog" aria-modal="true">
            <div className="u-modal-header"><div className="u-modal-title">Invite user</div><button className="u-icon-btn" type="button" onClick={() => setInviteOpen(false)}><i className="ti ti-x" style={{ fontSize: 18 }}></i></button></div>
            <div className="u-modal-body">
              <div className="u-fgrid2">
                <div className="u-field"><label className="u-flabel">First name <span style={{ color: "var(--red-600)" }}>*</span></label><input className="u-finput" value={iFirst} onChange={(e) => setIFirst(e.target.value)} placeholder="First name" autoFocus /></div>
                <div className="u-field"><label className="u-flabel">Last name <span style={{ color: "var(--red-600)" }}>*</span></label><input className="u-finput" value={iLast} onChange={(e) => setILast(e.target.value)} placeholder="Last name" /></div>
              </div>
              <div className="u-field"><label className="u-flabel">Email address <span style={{ color: "var(--red-600)" }}>*</span></label><input className="u-finput" type="email" value={iEmail} onChange={(e) => setIEmail(e.target.value)} placeholder="user@organization.com" /></div>
              <div className="u-fgrid2">
                <div className="u-field">
                  <label className="u-flabel">Role in this study <span style={{ color: "var(--red-600)" }}>*</span></label>
                  <select className="u-fselect" value={iRole} onChange={(e) => setIRole(e.target.value)}><option value="">Select role…</option><option>CRC</option><option>CRA</option><option>PI</option><option>DM</option><option>Admin</option></select>
                  <div className="u-fhint">Role is specific to this study — the same user can have a different role on another study.</div>
                </div>
                <div className="u-field">
                  <label className="u-flabel">Site assignment</label>
                  <select className="u-fselect" value={iSite} onChange={(e) => setISite(e.target.value)}><option value="">All sites</option>{sites.map((s) => <option key={s.id} value={s.code}>{s.name}</option>)}</select>
                </div>
              </div>
              <div className="u-field"><label className="u-flabel">Message (optional)</label><input className="u-finput" value={iMsg} onChange={(e) => setIMsg(e.target.value)} placeholder="Add a personal message to the invite email…" /><div className="u-fhint">User will receive an email with a link to set up their account. Invite link expires in 72 hours.</div></div>
            </div>
            <div className="u-modal-footer">
              <button className="u-btn" type="button" onClick={() => setInviteOpen(false)}>Cancel</button>
              <button className="u-btn u-btn-primary" type="button" onClick={sendInvite}><i className="ti ti-send"></i> Send invite</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="u-toast" role="status">{toast}</div>}
    </div>
  );
}
