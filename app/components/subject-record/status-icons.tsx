// ════════════════════════════════════════════════════════════════════════════
// Shared sidebar status iconography — the exact half-moon SVGs, status ranking,
// and the StatusGlyph / SidebarSdv components used by the Subject Record sidebar.
// Re-used verbatim by the Site / House record Forms-tab sidebar so the two look
// identical (same glyphs, same query badge, same SDV shield).
// ════════════════════════════════════════════════════════════════════════════

export type SidebarIcon = "final" | "reviewed" | "inreview" | "inwork" | "empty" | "queried";

export function iconForInstance(s: string | undefined): SidebarIcon {
  if (s === "finalized" || s === "locked") return "final";
  if (s === "reviewed") return "reviewed";
  if (s === "in_review") return "inreview";
  if (s === "in_work") return "inwork";
  return "empty";
}
// Worst-first ordering (a group / repeating form rolls up to its weakest child).
export const ICON_RANK: Record<SidebarIcon, number> = { queried: 0, empty: 1, inwork: 2, inreview: 3, reviewed: 4, final: 5 };
export const ICON_LABEL: Record<SidebarIcon, string> = {
  empty: "Empty", inwork: "In-work", inreview: "In-Review", reviewed: "Reviewed", final: "Finalized", queried: "Open query",
};
export const STATUS_LABEL: Record<string, string> = {
  empty: "Empty", in_work: "In-work", in_review: "In-Review", reviewed: "Reviewed", finalized: "Finalized", locked: "Locked",
};

// In-Review — amber right-half "half-moon".
function InReviewIcon() {
  return (
    <svg className="si-inwork" width="16" height="16" viewBox="2 2 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M10 16.8574C13.7871 16.8574 16.8574 13.7871 16.8574 10C16.8574 6.2129 13.7871 3.14258 10 3.14258V10.0022V16.8574ZM7.60632 17.6357C8.37406 17.8765 9.18055 18.0022 10 18.0022V18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 10.0004 2 10.0007 2 10.0011C2 10.0015 2 10.0019 2 10.0022C2 10.083 2.00122 10.1637 2.00366 10.2442C2.04632 11.6675 2.46075 12.9973 3.15316 14.14C3.48435 14.6881 3.8828 15.1987 4.34315 15.6591C5.07028 16.3862 5.92297 16.9589 6.85027 17.3561C7.09618 17.4615 7.34844 17.555 7.60632 17.6357Z" fill="#CF811E" />
    </svg>
  );
}
// In-Work — blue left-half "half-moon".
function InWorkIcon() {
  return (
    <svg className="si-inwork" width="16" height="16" viewBox="2 2 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M11.1423 17.9188C15.0196 17.3647 18.0003 14.0303 18.0003 9.99983C18.0003 5.58165 14.4186 2 10.0004 2C6.30023 2 3.18677 4.51215 2.27257 7.92394C2.0948 8.58662 2 9.28327 2 10.0021C2 14.4202 5.58165 18.0019 9.99983 18.0019C10.3887 18.0019 10.7712 17.9741 11.1452 17.9205L11.1423 17.9188ZM16.8574 9.99983C16.8574 6.21282 13.7874 3.14283 10.0004 3.14283C9.88547 3.14283 9.77117 3.14566 9.6576 3.15125C7.76505 4.82631 6.57193 7.27373 6.57193 9.99983C6.57193 12.7259 7.76505 15.1734 9.65759 16.8484C9.77117 16.854 9.88547 16.8568 10.0004 16.8568C13.7874 16.8568 16.8574 13.7868 16.8574 9.99983Z" fill="#4492CB" />
    </svg>
  );
}
// Reviewed — purple partial-fill "half-moon".
function ReviewedIcon() {
  return (
    <svg className="si-reviewed-icon" width="16" height="16" viewBox="2 2 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M10.3522 16.8489C13.9788 16.6689 16.8641 13.6712 16.8641 10C16.8641 6.32673 13.9756 3.32779 10.3462 3.15084C12.2407 4.826 13.4353 7.27477 13.4353 10.0025C13.4353 12.7274 12.2433 15.1738 10.3522 16.8489ZM7.16743 2.51848C4.14722 3.66218 2 6.58161 2 10.0025C2 14.035 4.9835 17.3706 8.86352 17.9224C9.24018 17.9726 9.62024 18 10.0067 18C14.425 18 18.0067 14.4183 18.0067 10C18.0067 5.58172 14.425 2 10.0067 2C9.00682 2 8.0498 2.18343 7.16743 2.51848Z" fill="#BF65D5" />
    </svg>
  );
}

export function StatusGlyph({ icon, title }: { icon: SidebarIcon; title?: string }) {
  let inner: React.ReactNode;
  if (icon === "final") inner = <div className="status-final"><i className="ti ti-check"></i></div>;
  else if (icon === "inwork") inner = <InWorkIcon />;
  else if (icon === "inreview") inner = <InReviewIcon />;
  else if (icon === "reviewed") inner = <ReviewedIcon />;
  else inner = <div className={`status-${icon}`}></div>;
  return <span className="status-glyph" title={title}>{inner}</span>;
}

// Sidebar SDV shield — only shown while SDV mode is active (item 6).
export function SidebarSdv({ active, sdv }: { active: boolean; sdv: "complete" | "partial" | "none" }) {
  if (!active || sdv === "none") return null;
  return (
    <i
      className={`ti ${sdv === "complete" ? "ti-shield-check-filled" : "ti-shield"} sidebar-sdv-icon`}
      title={sdv === "complete" ? "SDV complete" : "Partially verified — SDV not complete"}
      aria-hidden="true"
    ></i>
  );
}
