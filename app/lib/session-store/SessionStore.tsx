"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { hydrateFromSupabase } from "./hydrate";
import { EMPTY_DATASET, type Dataset } from "./types";
import type { Role } from "@/lib/permissions";

// Per-tab study session. sessionStorage gives us "resets on tab close" for free
// (it survives reloads within the tab, clears when the tab closes). On first
// visit it hydrates from Supabase; thereafter ALL reads/writes are in-session —
// nothing is written back to Supabase.
// Bump the version when the dataset shape changes (forces a fresh hydrate).
const DATA_KEY = "arken_session_store_v17"; // v17: recurring forms expanded to individual per-visit forms (PH body_weight/flock_health, BR vital_signs/clinical_response)
const ROLE_KEY = "arken_active_role_v1";

interface StudySessionValue {
  dataset: Dataset;
  ready: boolean;
  /** Active role (the "view as" role). Session-scoped, persisted per tab. */
  activeRole: Role;
  setActiveRole: (role: Role) => void;
  /** Mutate the dataset in session (and persist). Never writes to Supabase. */
  update: (mutator: (d: Dataset) => void) => void;
  /** Discard session edits and re-hydrate from the Supabase seed. */
  reset: () => Promise<void>;
}

const Ctx = createContext<StudySessionValue | null>(null);

export function StudySessionProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<Dataset>(EMPTY_DATASET);
  const [ready, setReady] = useState(false);
  const [activeRole, setActiveRoleState] = useState<Role>("CRC"); // default landing role

  // Hydrate the dataset (from session storage, else from Supabase).
  useEffect(() => {
    let cancelled = false;
    try {
      const saved = sessionStorage.getItem(DATA_KEY);
      if (saved) {
        setDataset(JSON.parse(saved) as Dataset);
        setReady(true);
      }
      const savedRole = sessionStorage.getItem(ROLE_KEY);
      if (savedRole) setActiveRoleState(savedRole as Role);
    } catch {
      /* ignore corrupt session storage */
    }
    if (sessionStorage.getItem(DATA_KEY)) return;

    hydrateFromSupabase().then((ds) => {
      if (cancelled) return;
      setDataset(ds);
      try {
        sessionStorage.setItem(DATA_KEY, JSON.stringify(ds));
      } catch {
        /* ignore quota errors */
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setActiveRole = useCallback((role: Role) => {
    setActiveRoleState(role);
    try {
      sessionStorage.setItem(ROLE_KEY, role);
    } catch {
      /* ignore */
    }
  }, []);

  const update = useCallback((mutator: (d: Dataset) => void) => {
    setDataset((prev) => {
      const next: Dataset = structuredClone(prev);
      mutator(next);
      try {
        sessionStorage.setItem(DATA_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const reset = useCallback(async () => {
    setReady(false);
    try {
      sessionStorage.removeItem(DATA_KEY);
    } catch {
      /* ignore */
    }
    const ds = await hydrateFromSupabase();
    setDataset(ds);
    try {
      sessionStorage.setItem(DATA_KEY, JSON.stringify(ds));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  return (
    <Ctx.Provider value={{ dataset, ready, activeRole, setActiveRole, update, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStudySession(): StudySessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useStudySession must be used within StudySessionProvider");
  }
  return ctx;
}
