"use client";

import type { ReactNode } from "react";
import { downloadCsv, csvFilename } from "@/lib/reports-data";

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

// VeDDRA coding state chip — Coded (green) / Pending (amber) / Excluded (slate).
// Read-only everywhere; the value is set by the DM in the Coding module.
const CODING_META = {
  coded: { label: "Coded", cls: "ms-done" },
  pending: { label: "Pending", cls: "ms-warn" },
  excluded: { label: "Excluded", cls: "ms-future" },
} as const;
export function CodingChip({ status }: { status: "coded" | "pending" | "excluded" }) {
  const m = CODING_META[status] ?? CODING_META.pending;
  return <span className={`rpt-ms-chip ${m.cls}`}>{m.label}</span>;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rpt-empty"><i className="ti ti-info-circle"></i> {children}</div>;
}

export function ExportCsvButton({ studyCode, slug, headers, rows }: { studyCode: string; slug: string; headers: string[]; rows: (string | number | null)[][] }) {
  return (
    <button className="rpt-csv-btn" type="button" onClick={() => downloadCsv(csvFilename(studyCode, slug), headers, rows)} disabled={rows.length === 0}>
      <i className="ti ti-download"></i> Export CSV
    </button>
  );
}

// Shared date formatter (UTC, no locale surprises in print).
export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "—";
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
