"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidenav } from "./Sidenav";
import { Topbar } from "./Topbar";
import { ShellProvider, type ShellSite, type ShellStudy } from "./ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { isStudyLocked } from "@/lib/study-lock";
import { navItemsForRole, NAV_ROUTES, type Role } from "@/lib/permissions";
import { actionableQueryCount } from "@/lib/queries-data";
import "./shell.css";

interface AppShellProps {
  study: ShellStudy;
  sites: ShellSite[];
  children: React.ReactNode;
}

export function AppShell({ study, sites, children }: AppShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { activeRole, setActiveRole, dataset } = useStudySession(); // role lives in session, not Supabase

  // Live Queries badge — count of queries needing the active role's action.
  // Recomputes on role switch and on any query mutation (dataset is session state).
  const queriesBadge = actionableQueryCount(dataset, study.id, activeRole);
  const [expanded, setExpanded] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null); // null = All Sites

  // The active nav item is derived from the route (first path segment under the study).
  const base = `/study/${study.id}`;
  const segs = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "").split("/").filter(Boolean) : [];
  const sub = segs[0] ?? "";
  let activeKey = Object.entries(NAV_ROUTES).find(([, route]) => route === sub)?.[0] ?? "dashboard";
  // Site/House record pages (/sites/[id], /barns/[id]) are reached from the Data
  // Entry drill-down — keep "Data Entry" highlighted there (the /sites list stays "Sites").
  if ((sub === "sites" && segs.length > 1) || sub === "barns") activeKey = "data-entry";

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
          studyType={study.type}
          activeKey={activeKey}
          expanded={expanded}
          onSelect={navigate}
          onToggle={() => setExpanded((e) => !e)}
          badges={{ queries: queriesBadge }}
        />
        <div className="main">
          <Topbar
            study={study}
            sites={sites}
            selectedSiteId={selectedSiteId}
            onSelectSite={setSelectedSiteId}
            activeRole={activeRole}
            onChangeRole={changeRole}
            hideSiteFilter={sub === "audit-trail" || sub === "queries" || sub === "visits" || sub === "sdv" || sub === "reports"}
          />
          {isStudyLocked(dataset, study.id) && (
            <div className="db-lock-bar" role="status">
              <i className="ti ti-lock" aria-hidden="true"></i>
              Database is locked — all forms are read-only pending statistical analysis.
            </div>
          )}
          <main className="page-content">{children}</main>
        </div>
      </div>
    </ShellProvider>
  );
}
