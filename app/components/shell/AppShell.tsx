"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidenav } from "./Sidenav";
import { Topbar } from "./Topbar";
import { ShellProvider, type ShellSite, type ShellStudy } from "./ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { navItemsForRole, NAV_ROUTES, type Role } from "@/lib/permissions";
import "./shell.css";

interface AppShellProps {
  study: ShellStudy;
  sites: ShellSite[];
  children: React.ReactNode;
}

export function AppShell({ study, sites, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeRole, setActiveRole } = useStudySession(); // role lives in session, not Supabase
  const [expanded, setExpanded] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null); // null = All Sites

  // The active nav item is derived from the route (first path segment under the study).
  const base = `/study/${study.id}`;
  const sub = pathname.startsWith(base)
    ? pathname.slice(base.length).replace(/^\//, "").split("/")[0]
    : "";
  const activeKey =
    Object.entries(NAV_ROUTES).find(([, route]) => route === sub)?.[0] ?? "dashboard";

  function navigate(key: string) {
    const route = NAV_ROUTES[key];
    if (route === undefined) return; // no screen for this item yet
    router.push(route ? `${base}/${route}` : base);
  }

  function changeRole(role: Role) {
    setActiveRole(role);
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
