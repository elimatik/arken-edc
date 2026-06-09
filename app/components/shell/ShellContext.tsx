"use client";

import { createContext, useContext } from "react";
import type { Role } from "@/lib/permissions";

export interface ShellStudy {
  id: string;
  code: string;
  name: string;
}

export interface ShellSite {
  id: string;
  code: string;
  name: string;
}

export interface ShellContextValue {
  study: ShellStudy;
  sites: ShellSite[];
  /** null = "All Sites" selected in the topbar dropdown */
  selectedSiteId: string | null;
  activeRole: Role;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error("useShell must be used within the app shell");
  }
  return ctx;
}
