"use client";

// ════════════════════════════════════════════════════════════════════════════
// Standard table sort — the single source of truth for every list table in the
// app. Behaviour: click a column → ascending → descending → clear (back to the
// table's default order). Only one column is sorted at a time. Pair with the
// <SortTh> header component + the generic `.col-sortable` CSS in globals.css.
// ════════════════════════════════════════════════════════════════════════════

import { useState } from "react";

export type SortDir = "asc" | "desc";
export type SortState = { col: string; dir: SortDir } | null;

export function useTableSort(initial: SortState = null) {
  const [sort, setSort] = useState<SortState>(initial);
  // asc → desc → clear; a different column always starts fresh at asc.
  const toggle = (key: string) =>
    setSort((s) => (!s || s.col !== key ? { col: key, dir: "asc" } : s.dir === "asc" ? { col: key, dir: "desc" } : null));
  return { sort, toggle, setSort };
}

// Tabler icon name for a column header given the active sort.
export function sortIcon(sort: SortState, key: string): string {
  return sort?.col === key ? (sort.dir === "asc" ? "ti-arrow-up" : "ti-arrow-down") : "ti-arrows-sort";
}

// Sign multiplier for a comparator: +1 asc, -1 desc.
export function sortDirMul(sort: SortState): number {
  return sort?.dir === "desc" ? -1 : 1;
}
