"use client";

// Reusable sortable table header cell. Renders a plain <th> when `sortKey` is
// omitted (non-sortable: no icon, default cursor); otherwise it's clickable,
// shows the sort arrow to the right of the label, and highlights when active.
// Behaviour comes from useTableSort (asc → desc → clear). See globals.css
// `.col-sortable` / `.col-sort-icon` / `.col-sort-active`.

import { sortIcon, type SortState } from "@/lib/useTableSort";

interface SortThProps {
  label?: string;
  children?: React.ReactNode; // overrides `label` when you need custom content
  sortKey?: string; // omit → non-sortable header
  sort?: SortState;
  onSort?: (key: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export function SortTh({ label, children, sortKey, sort, onSort, className, style }: SortThProps) {
  const sortable = !!sortKey;
  const active = sortable && sort?.col === sortKey;
  const cls = [className, sortable ? "col-sortable" : "", active ? "col-sort-active" : ""].filter(Boolean).join(" ");
  return (
    <th
      style={style}
      className={cls || undefined}
      onClick={sortable && onSort ? () => onSort(sortKey!) : undefined}
    >
      {children ?? label}
      {sortable && <i className={`ti ${sortIcon(sort ?? null, sortKey!)} col-sort-icon`} aria-hidden="true"></i>}
    </th>
  );
}
