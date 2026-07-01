"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { usersForStudy, avatarColor, initials, type AppUser } from "@/lib/users-data";
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

  const users = useMemo(() => usersForStudy(study.code), [study.code]);

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

  // Users is Admin/DM only; the shell also redirects other roles away from the route.
  if (activeRole !== "Admin" && activeRole !== "DM") return null;

  return (
    <div className="u-page">
      <div className="u-header">
        <div>
          <h1 className="u-title">Users</h1>
          <div className="u-sub">{study.code} · {users.length} users across {siteCount} sites</div>
        </div>
        <button className="u-btn u-btn-primary" type="button" onClick={() => setToast("Invite user — modal ships in the next pass")}><i className="ti ti-user-plus"></i> Invite user</button>
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

      {toast && <div className="u-toast" role="status">{toast}</div>}
    </div>
  );
}
