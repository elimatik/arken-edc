"use client";

// Shared avatar colour — session/component state (no DATA_KEY). The Profile
// avatar swatch picker writes here; the topbar avatar + profile card read it,
// so changing the colour updates both in the same session.
import { useSyncExternalStore } from "react";

// Swatch palette (matches the role-badge colour family).
export const AVATAR_COLORS = ["#3D5A78", "#1760A8", "#534AB7", "#1A6B47", "#8A5C00", "#C94C0C", "#B52626"];

let color = "#3D5A78"; // default = the topbar avatar's CSS background (slate)
const listeners = new Set<() => void>();
export function setAvatarColor(c: string): void { color = c; listeners.forEach((l) => l()); }
function subscribe(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function useAvatarColor(): string { return useSyncExternalStore(subscribe, () => color, () => color); }
