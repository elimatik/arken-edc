"use client";

import { useRouter, useParams } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { usersForStudy, avatarColor, initials } from "@/lib/users-data";
import "../users.css";

const ROLE_BADGE: Record<string, string> = { CRC: "u-badge-blue", CRA: "u-badge-purple", PI: "u-badge-green", DM: "u-badge-amber", Admin: "u-badge-slate", Sponsor: "u-badge-slate" };

// Stub — full detail page (Overview / Study & site access / Activity log tabs)
// ships in the next pass. This keeps list-row navigation working.
export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const studyId = String(params.studyId);
  const userId = String(params.userId);
  const { study, activeRole } = useShell();
  const user = usersForStudy(study.code).find((u) => u.id === userId);

  if (activeRole !== "Admin" && activeRole !== "DM") return null;

  return (
    <div className="u-page">
      <button className="u-back" type="button" onClick={() => router.push(`/study/${studyId}/users`)}><i className="ti ti-arrow-left"></i> Users</button>
      {!user ? (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>User not found.</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <span className="u-avatar" style={{ width: 56, height: 56, fontSize: "var(--text-lg)", background: avatarColor(user.name) }}>{initials(user.name)}</span>
            <div>
              <div style={{ fontSize: "var(--text-xl)", fontWeight: 500 }}>{user.name} <span className={`u-badge ${ROLE_BADGE[user.role] ?? "u-badge-slate"}`} style={{ marginLeft: 6 }}>{user.role}</span></div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>{user.email}</div>
            </div>
          </div>
          <div className="u-banner">
            <i className="ti ti-info-circle"></i>
            <span>Full user detail — Overview, Study &amp; site access, and Activity log tabs — ships in the next pass.</span>
          </div>
        </>
      )}
    </div>
  );
}
