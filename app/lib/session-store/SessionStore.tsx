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
const DATA_KEY = "arken_session_store_v43"; // v43: Randomization action — session-only randomized_at/randomized_by on subjects (Randomize button on Subject Record); v42: Inventory module — session-only vials + shipments tables (drug supply tracking, lifecycle events, reconciliation); v41: Coding module — session-only codingTasks worklist (VeDDRA coding, write-back source of truth); v40: 'excluded' VeDDRA state seed (ConMed saline flush, BR non-serious AE) + serious flag on seeded AEs; v39: VeDDRA code + coding status on seeded SAEs (AE roster VeDDRA column); v38: ethics/IACUC config + ConMed VeDDRA/washout/type fields + protocol deviations seed; v37: study-level enrolment targets pinned (CA 60 / BR 12 / PH 2) + seeded SAE reporting timelines (saeReports); v36: seeded concomitant medications (ConMed Log report); v35: seeded SDV verified records per site (CRA/DM dashboard SDV bars + SDV worklist show real progress); v34: BR-2502 barn-scoped read-only "Pen BRD Summary" form (auto-derived per-pen rollup) + forms.is_summary flag; v33: BR-2502 per-feedlot enrollment_target + enrolment-cap chip/warning; v32: PH-2401 F3 "Feed Analysis Confirmation" section; v31: PVAS "Owner diary date" on CA-0801; v30: CA status form renamed → "Withdrawal Form"; v29: CADESI-04 canonical 3 subtotals; v28: CADESI breakdown, DART/eligibility calc fields, F4 test-article auto-populate, studyLocks
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
