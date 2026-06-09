"use client";

import { Breadcrumb } from "@/components/shell/Breadcrumb";

// Landing screen inside the app shell. The role dashboards (31/32-dashboard*.html)
// are built in a later session — this is a stub so the shell has content and the
// study selector has somewhere to route.
export default function StudyHome() {
  return (
    <>
      <Breadcrumb trail={[{ label: "Dashboard" }]} />
      <div className="shell-placeholder">
        <i className="ti ti-layout-dashboard" aria-hidden="true"></i>
        <div className="shell-placeholder-title">Dashboard</div>
        <div>
          Role dashboards are built in a later session. Switch the role in the top
          bar to watch the sidenav adapt to each role&rsquo;s permissions.
        </div>
      </div>
    </>
  );
}
