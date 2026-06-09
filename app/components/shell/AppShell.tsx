"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidenav } from "./Sidenav";
import { Topbar } from "./Topbar";
import { ShellProvider, type ShellSite, type ShellStudy } from "./ShellContext";
import { getOrCreateSession, persistActiveRole } from "@/lib/session";
import { navItemsForRole, NAV_ROUTES, type Role } from "@/lib/permissions";
import "./shell.css";

interface AppShellProps {
  study: ShellStudy;
  sites: ShellSite[];
  initialRole: Role;
  children: React.ReactNode;
}

export function AppShell({ study, sites, initialRole, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null); // null = All Sites
  const [activeRole, setActiveRole] = useState<Role>(initialRole);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  // The active nav item is derived from the route (first path segment under the study).
  const base = `/study/${study.id}`;
  const sub = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\//, "").split("/")[0]
    : "";
  const activeKey =
    Object.entries(NAV_ROUTES).find(([, route]) => route === sub)?.[0] ?? "dashboard";

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

  function navigate(key: string) {
    const route = NAV_ROUTES[key];
    if (route === undefined) return; // no screen for this item yet
    router.push(route ? `${base}/${route}` : base);
  }

  function changeRole(role: Role) {
    setActiveRole(role);
    if (sessionToken) persistActiveRole(sessionToken, role);
    // If the new role can't see the current screen, fall back to the dashboard.
    if (!navItemsForRole(role).some((i) => i.key === activeKey)) {
      router.push(base);
    }
  }

  return (
    <ShellProvider value={{ study, sites, selectedSiteId, activeRole }}>
      <div className="shell">
        <Sidenav
          role={activeRole}
          activeKey={activeKey}
          expanded={expanded}
          onSelect={navigate}
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
