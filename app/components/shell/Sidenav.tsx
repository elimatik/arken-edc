"use client";

import { navItemsForRole, navAccess, type Role } from "@/lib/permissions";
import { animalsLabel } from "@/lib/terminology";

interface SidenavProps {
  role: Role;
  studyType?: string | null;
  activeKey: string;
  expanded: boolean;
  onSelect: (key: string) => void;
  onToggle: () => void;
  // Per-nav-key live badge counts (computed by the shell), overriding any static
  // item.badge. A value of 0 (or absent) hides the badge.
  badges?: Partial<Record<string, number>>;
  // Per-nav-key amber alert dots (non-count indicators, e.g. inventory expiry).
  dots?: Partial<Record<string, boolean>>;
}

export function Sidenav({ role, studyType, activeKey, expanded, onSelect, onToggle, badges, dots }: SidenavProps) {
  const items = navItemsForRole(role);
  const topItems = items.filter((i) => !i.bottom);
  const bottomItems = items.filter((i) => i.bottom);

  const renderItem = (item: (typeof items)[number]) => {
    const access = navAccess(item, role);
    // The Animals item relabels to "Pens" for group-housed livestock (pen = subject).
    const label = item.key === "animals" ? animalsLabel({ type: studyType }) : item.label;
    let title = item.title ?? label;
    if (access?.readonly) title += " (read-only)";
    if (access?.blinded) title += " (blinded)";

    const badge = badges?.[item.key] ?? item.badge ?? 0;
    const dot = !!dots?.[item.key];

    return (
    <button
      key={item.key}
      className={`nav-item${activeKey === item.key ? " active" : ""}`}
      title={title}
      aria-current={activeKey === item.key ? "page" : undefined}
      onClick={() => onSelect(item.key)}
      type="button"
    >
      <i className={`ti ti-${item.icon}`} aria-hidden="true"></i>
      <span className="nav-label">{label}</span>
      {badge > 0 ? (
        <span className="nav-badge" aria-hidden="true">
          {badge}
        </span>
      ) : dot ? (
        <span className="nav-dot" aria-hidden="true"></span>
      ) : null}
    </button>
    );
  };

  return (
    <nav className={`sidenav${expanded ? " expanded" : ""}`} aria-label="Main navigation">
      <button
        className="nav-expand-btn"
        onClick={onToggle}
        title={expanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        type="button"
      >
        <i className={`ti ti-${expanded ? "chevron-left" : "chevron-right"}`}></i>
      </button>

      <div className="nav-logo-row">
        <div className="nav-logo" title="Arken EDC">
          <span>Ar</span>
        </div>
      </div>

      {topItems.map(renderItem)}

      <div className="nav-spacer"></div>
      {bottomItems.length > 0 && <div className="nav-separator" aria-hidden="true"></div>}
      {bottomItems.map(renderItem)}
    </nav>
  );
}
