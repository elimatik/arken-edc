"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { hydrateFromSupabase } from "./hydrate";
import { EMPTY_DATASET, type Dataset } from "./types";

// Per-tab session store. sessionStorage gives us "resets on tab close" for free
// (it survives reloads within the tab, clears when the tab closes). On first
// visit it hydrates from Supabase; thereafter all reads/writes are in-session.
const STORAGE_KEY = "arken_session_store_v1";

interface SessionStoreValue {
  dataset: Dataset;
  ready: boolean;
  /** Mutate the dataset in session (and persist). Never writes to Supabase. */
  update: (mutator: (d: Dataset) => void) => void;
  /** Discard session edits and re-hydrate from the Supabase seed. */
  reset: () => Promise<void>;
}

const Ctx = createContext<SessionStoreValue | null>(null);

export function SessionStoreProvider({ children }: { children: React.ReactNode }) {
  const [dataset, setDataset] = useState<Dataset>(EMPTY_DATASET);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        setDataset(JSON.parse(saved) as Dataset);
        setReady(true);
        return;
      }
    } catch {
      /* ignore corrupt session storage */
    }
    hydrateFromSupabase().then((ds) => {
      if (cancelled) return;
      setDataset(ds);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ds));
      } catch {
        /* ignore quota errors */
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((mutator: (d: Dataset) => void) => {
    setDataset((prev) => {
      const next: Dataset = structuredClone(prev);
      mutator(next);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const reset = useCallback(async () => {
    setReady(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const ds = await hydrateFromSupabase();
    setDataset(ds);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ds));
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  return <Ctx.Provider value={{ dataset, ready, update, reset }}>{children}</Ctx.Provider>;
}

export function useSessionStore(): SessionStoreValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useSessionStore must be used within SessionStoreProvider");
  }
  return ctx;
}
