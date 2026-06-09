"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "./ShellContext";

export interface Crumb {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  /** Path below the site level (e.g. Barn → Pen → Subject, or just the screen). */
  trail: Crumb[];
  /**
   * The site the current record belongs to, if any. Drives the site rule:
   *  • All Sites selected  → the site name is shown in the breadcrumb.
   *  • A specific site selected → the site is implied by the dropdown and omitted
   *    (the trail starts below the site level).
   * Omit entirely for study-level screens (e.g. Dashboard) that aren't under a site.
   */
  site?: { id: string; name: string };
}

export function Breadcrumb({ trail, site }: BreadcrumbProps) {
  const router = useRouter();
  const { selectedSiteId } = useShell();

  const crumbs: Crumb[] = [];
  // Site rule: only surface the site segment when no specific site is pinned.
  if (site && selectedSiteId === null) {
    crumbs.push({ label: site.name });
  }
  crumbs.push(...trail);

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <Fragment key={`${crumb.label}-${i}`}>
            {crumb.href && !isLast ? (
              <button
                className="breadcrumb-item link"
                onClick={() => router.push(crumb.href as string)}
                type="button"
              >
                {crumb.label}
              </button>
            ) : (
              <span className={`breadcrumb-item${isLast ? " current" : ""}`} aria-current={isLast ? "page" : undefined}>
                {crumb.label}
              </span>
            )}
            {!isLast && <i className="ti ti-chevron-right breadcrumb-sep" aria-hidden="true"></i>}
          </Fragment>
        );
      })}
    </nav>
  );
}
