"use client";

import { useEffect, useState } from "react";
import { DEMO_USER } from "@/lib/constants";

// The visitor's name from the one-time access agreement (NDA), stored in
// sessionStorage at login. Used as the acting user throughout the session —
// queries, change reasons, SDV, and the dashboard greeting. Seeded/historical
// records keep their original authors. Falls back to the demo user.
const NDA_KEY = "arken_nda_v1";

export function getNdaName(): string {
  if (typeof window === "undefined") return DEMO_USER.fullName;
  try {
    const raw = sessionStorage.getItem(NDA_KEY);
    if (!raw) return DEMO_USER.fullName;
    const o = JSON.parse(raw) as { name?: string };
    const name = o?.name?.trim();
    return name && name.length > 0 ? name : DEMO_USER.fullName;
  } catch {
    return DEMO_USER.fullName;
  }
}

// Hook form — reads on mount (sessionStorage isn't available during SSR).
export function useNdaName(): string {
  const [name, setName] = useState<string>(DEMO_USER.fullName);
  useEffect(() => {
    setName(getNdaName());
  }, []);
  return name;
}
