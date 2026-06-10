"use client";

import { useEffect, useState } from "react";
import { RoleDashboard } from "@/components/dashboard/RoleDashboard";
import { useShell } from "@/components/shell/ShellContext";

// Role dashboards — each role sees a different dashboard, driven by the active
// role from the shell. Switching the role in the topbar swaps the dashboard live.
export default function StudyHome() {
  const { activeRole, study } = useShell();
  const [today, setToday] = useState("");

  // Compute the date client-side to avoid SSR/client hydration mismatch.
  useEffect(() => {
    const fmt = new Date().toLocaleDateString("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    setToday(fmt.replace(",", ""));
  }, []);

  return <RoleDashboard role={activeRole} studyName={study.name} today={today} />;
}
