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

// Initials for an avatar: first letter of the first name + first letter of the
// last name when present, otherwise just the first letter. Upper-cased.
export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return DEMO_USER.initials;
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase() || DEMO_USER.initials;
}

// Hook form — reads on mount (sessionStorage isn't available during SSR).
export function useNdaName(): string {
  const [name, setName] = useState<string>(DEMO_USER.fullName);
  useEffect(() => {
    setName(getNdaName());
  }, []);
  return name;
}

// Hook form for avatar initials derived from the NDA name.
export function useNdaInitials(): string {
  const name = useNdaName();
  return initialsFromName(name);
}
