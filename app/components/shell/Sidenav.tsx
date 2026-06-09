"use client";

import { navItemsForRole, navAccess, type Role } from "@/lib/permissions";

interface SidenavProps {
  role: Role;
  activeKey: string;
  expanded: boolean;
  onSelect: (key: string) => void;
  onToggle: () => void;
}

export function Sidenav({ role, activeKey, expanded, onSelect, onToggle }: SidenavProps) {
  const items = navItemsForRole(role);
  const topItems = items.filter((i) => !i.bottom);
  const bottomItems = items.filter((i) => i.bottom);

  const renderItem = (item: (typeof items)[number]) => {
    const access = navAccess(item, role);
    let title = item.title ?? item.label;
    if (access?.readonly) title += " (read-only)";
    if (access?.blinded) title += " (blinded)";

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
      <span className="nav-label">{item.label}</span>
      {item.badge ? (
        <span className="nav-badge" aria-hidden="true">
          {item.badge}
        </span>
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
