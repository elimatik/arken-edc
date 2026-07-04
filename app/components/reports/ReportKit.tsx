"use client";

import type { ReactNode } from "react";
import { downloadCsv, csvFilename, reportCsvHeaderRows } from "@/lib/reports-data";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useNdaName } from "@/lib/use-nda-name";

// Section card — every report is a stack of these. `noBreak` keeps the heading
// glued to its content across print page breaks.
export function Section({ title, icon, action, children }: { title: string; icon: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rpt-section">
      <div className="rpt-section-head">
        <h2 className="rpt-section-title"><i className={`ti ti-${icon}`}></i> {title}</h2>
        {action && <div className="rpt-section-action">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export type Tone = "" | "good" | "warn" | "crit" | "blue";
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="rpt-stat-grid">{children}</div>;
}
export function StatTile({ value, label, tone = "", sub }: { value: string | number; label: string; tone?: Tone; sub?: string }) {
  return (
    <div className={`rpt-stat${tone ? ` t-${tone}` : ""}`}>
      <div className="rpt-stat-val">{value}</div>
      <div className="rpt-stat-lbl">{label}</div>
      {sub && <div className="rpt-stat-sub">{sub}</div>}
    </div>
  );
}

// Disposition / accounting funnel — numbers with arrows between them.
export function Funnel({ steps }: { steps: { label: string; value: number; tone?: Tone }[] }) {
  return (
    <div className="rpt-funnel">
      {steps.map((s, i) => (
        <div className="rpt-funnel-cell" key={s.label}>
          <div className={`rpt-funnel-step${s.tone ? ` t-${s.tone}` : ""}`}>
            <div className="rpt-funnel-val">{s.value}</div>
            <div className="rpt-funnel-lbl">{s.label}</div>
          </div>
          {i < steps.length - 1 && <i className="ti ti-chevron-right rpt-funnel-arrow"></i>}
        </div>
      ))}
    </div>
  );
}

// Full-width labelled bars (site comparison / completeness / SDV by site).
export function BarList({ items, tone }: { items: { label: string; pct: number; note?: string }[]; tone?: (pct: number) => Tone }) {
  return (
    <div className="rpt-barlist">
      {items.map((it) => {
        const t = tone ? tone(it.pct) : "";
        return (
          <div className="rpt-barrow" key={it.label}>
            <span className="rpt-bar-label">{it.label}</span>
            <div className="rpt-bar-track"><div className={`rpt-bar-fill${t ? ` t-${t}` : ""}`} style={{ width: `${Math.min(100, it.pct)}%` }}></div></div>
            <span className="rpt-bar-val mono">{it.note ?? `${it.pct}%`}</span>
          </div>
        );
      })}
    </div>
  );
}

// A simple proportion bar (visit windows / arm split) from coloured segments.
export function ProportionBar({ segments, total }: { segments: { label: string; count: number; color: string }[]; total: number }) {
  const denom = Math.max(total, 1);
  return (
    <div className="rpt-prop">
      <div className="rpt-prop-track">
        {segments.map((s) => s.count > 0 && (
          <div key={s.label} className="rpt-prop-seg" style={{ width: `${(s.count / denom) * 100}%`, background: s.color }} title={`${s.label}: ${s.count}`}></div>
        ))}
      </div>
      <div className="rpt-prop-legend">
        {segments.map((s) => (
          <span className="rpt-prop-leg" key={s.label}><i style={{ background: s.color }}></i>{s.label} <strong className="mono">{s.count}</strong></span>
        ))}
      </div>
    </div>
  );
}

// VeDDRA coding state — icon only (saves horizontal space vs a text chip).
// Coded green-check / Pending amber-clock / Excluded slate-x. Read-only; the DM
// sets the state in the Coding module.
const CODING_META = {
  coded: { icon: "ti-circle-check", color: "var(--green-600)", title: "Coded" },
  pending: { icon: "ti-clock", color: "var(--amber-600)", title: "Pending coding" },
  excluded: { icon: "ti-circle-x", color: "var(--slate-400)", title: "Excluded from coding" },
} as const;
export function CodingChip({ status }: { status: "coded" | "pending" | "excluded" }) {
  const m = CODING_META[status] ?? CODING_META.pending;
  return <i className={`ti ${m.icon} rpt-coding-icon`} style={{ color: m.color }} title={m.title} aria-label={m.title}></i>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rpt-empty"><i className="ti ti-info-circle"></i> {children}</div>;
}

// Retrofitted (Fix 8/CSV) to prepend the standard study-header block to every CSV
// — resolves studyId from the active study's code, so the ~7 existing reports pick
// up the header with no per-file change.
export function ExportCsvButton({ studyCode, slug, headers, rows }: { studyCode: string; slug: string; headers: string[]; rows: (string | number | null)[][] }) {
  const { dataset } = useStudySession();
  const { study, activeRole } = useShell();
  const userName = useNdaName();
  const onClick = () => {
    const studyId = dataset.studies.find((s) => s.code === study.code)?.id ?? "";
    const meta = reportCsvHeaderRows(dataset, studyId, activeRole, userName, "All sites");
    downloadCsv(csvFilename(studyCode, slug), headers, [...meta, ...rows]);
  };
  return (
    <button className="rpt-csv-btn" type="button" onClick={onClick} disabled={rows.length === 0}>
      <i className="ti ti-download"></i> Export CSV
    </button>
  );
}

// Export button that prepends the standard study header block to the CSV (study /
// protocol / generated-by / date / site filter). Use for all report exports.
export function ReportCsvButton({ studyId, slug, headers, rows, siteLabel }: { studyId: string; slug: string; headers: string[]; rows: (string | number | null)[][]; siteLabel?: string }) {
  const { dataset } = useStudySession();
  const { study, activeRole } = useShell();
  const userName = useNdaName();
  const onClick = () => {
    const meta = reportCsvHeaderRows(dataset, studyId, activeRole, userName, siteLabel ?? "All sites");
    downloadCsv(csvFilename(study.code, slug), headers, [...meta, ...rows]);
  };
  return (
    <button className="rpt-csv-btn" type="button" onClick={onClick} disabled={rows.length === 0}>
      <i className="ti ti-download"></i> Export CSV
    </button>
  );
}

// Shared date formatter (UTC, no locale surprises in print).
export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
