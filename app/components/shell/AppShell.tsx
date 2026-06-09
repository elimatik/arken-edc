"use client";

import { useEffect, useState } from "react";
import { Sidenav } from "./Sidenav";
import { Topbar } from "./Topbar";
import { ShellProvider, type ShellSite, type ShellStudy } from "./ShellContext";
import { getOrCreateSession, persistActiveRole } from "@/lib/session";
import { navItemsForRole, type Role } from "@/lib/permissions";
import "./shell.css";

interface AppShellProps {
  study: ShellStudy;
  sites: ShellSite[];
  initialRole: Role;
  children: React.ReactNode;
}

export function AppShell({ study, sites, initialRole, children }: AppShellProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeKey, setActiveKey] = useState("dashboard");
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null); // null = All Sites
  const [activeRole, setActiveRole] = useState<Role>(initialRole);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // Load (or create) the demo session — restores the persisted active role.
  useEffect(() => {
    let cancelled = false;
    getOrCreateSession(study.id, initialRole).then((session) => {
      if (cancelled) return;
      setSessionToken(session.session_token);
      setActiveRole(session.active_role);
    });
    return () => {
      cancelled = true;
    };
  }, [study.id, initialRole]);

  function changeRole(role: Role) {
    setActiveRole(role);
    // Keep the highlighted nav item valid for the new role.
    if (!navItemsForRole(role).some((i) => i.key === activeKey)) {
      setActiveKey("dashboard");
    }
    if (sessionToken) persistActiveRole(sessionToken, role);
  }

  return (
    <ShellProvider value={{ study, sites, selectedSiteId, activeRole }}>
      <div className="shell">
        <Sidenav
          role={activeRole}
          activeKey={activeKey}
          expanded={expanded}
          onSelect={setActiveKey}
          onToggle={() => setExpanded((e) => !e)}
        />
        <div className="main">
          <Topbar
            study={study}
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            activeRole={activeRole}
            onChangeRole={changeRole}
          />
          <main className="page-content">{children}</main>
        </div>
      </div>
    </ShellProvider>
  );
}
