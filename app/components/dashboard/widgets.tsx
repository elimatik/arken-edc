"use client";

import type { ReactNode } from "react";
import Link from "next/link";

// ─── Stat chip ───────────────────────────────────────────────────────────────
type Accent = "warn" | "alert" | "crit" | "good" | "blue" | "";
export function Chip({
  val,
  label,
  accent = "",
  trend,
}: {
  val: string;
  label: string;
  accent?: Accent;
  trend?: { d: "up" | "dn"; t: string };
}) {
  const valCls = accent && accent !== "blue" ? ` ${accent}` : "";
  return (
    <div className={`stat-chip${accent ? ` accent-${accent}` : ""}`}>
      <div className={`stat-chip-val${valCls}`}>{val}</div>
      <div className="stat-chip-lbl">{label}</div>
      {trend && (
        <div className={`stat-chip-trend trend-${trend.d}`}>
          <i className={`ti ti-trending-${trend.d === "up" ? "up" : "down"}`} style={{ fontSize: "11px" }}></i>
          {trend.t}
        </div>
      )}
    </div>
  );
}

// ─── Card wrapper ────────────────────────────────────────────────────────────
export function Card({
  title,
  icon,
  action,
  actionHref,
  children,
}: {
  title: string;
  icon: string;
  action?: string;
  actionHref?: string; // when set, the action renders as a Next link to an existing page
  children: ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <i className={`ti ${icon}`}></i>
          {title}
        </div>
        {action && (actionHref
          ? <Link className="card-link" href={actionHref}>{action}</Link>
          : <button className="card-link" type="button">{action}</button>)}
      </div>
      {children}
    </div>
  );
}

// ─── Mini bar ────────────────────────────────────────────────────────────────
export function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="mini-bar-wrap">
      <div className="mini-bar-track">
        <div className={`mini-bar-fill${pct < 60 ? " low" : ""}`} style={{ width: `${pct}%` }}></div>
      </div>
      <span className="mono" style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
        {pct}%
      </span>
    </div>
  );
}

// ─── Enrollment bar ──────────────────────────────────────────────────────────
export function EnrollBar({
  cur,
  tgt,
  pct,
  legs,
}: {
  cur: number;
  tgt: number;
  pct: number;
  legs: { c: string; t: string }[];
}) {
  return (
    <div className="enroll-wrap">
      <div className="enroll-nums">
        <span className="enroll-big">{cur}</span>
        <span className="enroll-tgt">/ {tgt} target</span>
        <span className="enroll-pct">{pct}%</span>
      </div>
      <div className="enroll-track">
        <div className="enroll-fill" style={{ width: `${pct}%` }}></div>
      </div>
      <div className="enroll-legend">
        {legs.map((l, i) => (
          <div className="enroll-leg" key={i}>
            <div className="enroll-leg-dot" style={{ background: l.c }}></div>
            {l.t}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stacked enrollment bar ──────────────────────────────────────────────────
// Segments stack left-to-right against a denominator = max(target, total).
export function StackedEnrollBar({
  segments,
  total,
  target,
}: {
  segments: { label: string; count: number; color: string }[];
  total: number;
  target: number;
}) {
  const denom = Math.max(target, total, 1);
  return (
    <div className="enroll-wrap">
      <div className="enroll-nums">
        <span className="enroll-big">{total}</span>
        <span className="enroll-tgt">/ {target} target</span>
      </div>
      <div className="enroll-track stacked">
        {segments.map((s, i) => (
          <div
            key={i}
            className="enroll-seg"
            style={{ width: `${(s.count / denom) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.count}`}
          ></div>
        ))}
      </div>
      <div className="enroll-legend">
        {segments.map((s, i) => (
          <div className="enroll-leg" key={i}>
            <div className="enroll-leg-dot" style={{ background: s.color }}></div>
            {s.label} <span className="mono">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Query row ───────────────────────────────────────────────────────────────
export function QueryRow({
  subject,
  text,
  meta,
  status,
  icon,
  badge,
}: {
  subject: string;
  text: string;
  meta: string;
  status: string;
  icon: "qi-open" | "qi-auto" | "qi-mine";
  badge: "qb-open" | "qb-resp";
}) {
  const glyph = icon === "qi-open" ? "!" : icon === "qi-mine" ? "?" : "A";
  return (
    <div className="qrow">
      <div className={`qrow-icon ${icon}`}>{glyph}</div>
      <div className="qrow-body">
        <div className="qrow-subject">{subject}</div>
        <div className="qrow-text">{text}</div>
        <div className="qrow-meta">{meta}</div>
      </div>
      <span className={`qbadge ${badge}`}>{status}</span>
    </div>
  );
}

// ─── Visit / list row ────────────────────────────────────────────────────────
export function VisitRow({
  day,
  mon,
  primary,
  secondary,
  tagCls,
  tagTxt,
  overdue = false,
}: {
  day: string;
  mon: string;
  primary: string;
  secondary: string;
  tagCls: "vt-due" | "vt-today" | "vt-overdue" | "vt-ok";
  tagTxt: string;
  overdue?: boolean;
}) {
  const dateCls = overdue ? " is-overdue" : tagCls === "vt-today" ? " is-today" : "";
  return (
    <div className={`list-row${overdue ? " overdue" : ""}`}>
      <div className={`date-box${dateCls}`}>
        <div className="date-box-day">{day}</div>
        <div className="date-box-mon">{mon}</div>
      </div>
      <div className="list-row-body">
        <div className="list-row-primary">{primary}</div>
        <div className="list-row-secondary">{secondary}</div>
      </div>
      <span className={`vtag ${tagCls}`}>{tagTxt}</span>
    </div>
  );
}

// ─── Activity row ────────────────────────────────────────────────────────────
export function ActivityRow({ icon, ts, children }: { icon: string; ts: string; children: ReactNode }) {
  return (
    <div className="act-row">
      <div className="act-icon">
        <i className={`ti ${icon}`}></i>
      </div>
      <div className="act-body">
        <div className="act-text">{children}</div>
        <div className="act-ts">{ts}</div>
      </div>
    </div>
  );
}

// ─── SDV row ─────────────────────────────────────────────────────────────────
export function SdvRow({ name, pct }: { name: string; pct: number }) {
  const low = pct < 60;
  return (
    <div className="sdv-row">
      <span className="sdv-name">{name}</span>
      <div className="sdv-track">
        <div className={`sdv-fill${low ? " low" : ""}`} style={{ width: `${pct}%` }}></div>
      </div>
      <span className={`sdv-pct${low ? " low" : ""}`}>{pct}%</span>
    </div>
  );
}

// ─── Query category row ──────────────────────────────────────────────────────
const QCAT_COLORS: Record<string, string> = {
  ec: "var(--amber-700)",
  md: "var(--orange-700)",
  or: "var(--red-600)",
  sd: "var(--purple-600)",
  ot: "var(--slate-600)",
};
export function QcatRow({ label, n, pct, fill }: { label: string; n: number; pct: number; fill: string }) {
  return (
    <div className="qcat-row">
      <span className="qcat-label">{label}</span>
      <div className="qcat-track">
        <div className="qcat-fill" style={{ width: `${pct}%`, background: QCAT_COLORS[fill] || "var(--blue-600)" }}></div>
      </div>
      <span className="qcat-count">{n}</span>
    </div>
  );
}

// ─── Lock row ────────────────────────────────────────────────────────────────
export function LockRow({ id, site, forms }: { id: string; site: string; forms: string }) {
  return (
    <div className="lock-row">
      <span className="lock-id">{id}</span>
      <span className="lock-site">{site}</span>
      <span className="lock-forms">{forms}</span>
      <button className="btn-xs" type="button">
        <i className="ti ti-lock"></i> Lock
      </button>
    </div>
  );
}

// ─── Milestone row ───────────────────────────────────────────────────────────
export function MilestoneRow({
  label,
  sub,
  date,
  state,
}: {
  label: string;
  sub: string;
  date: string;
  state: "done" | "active" | "future";
}) {
  return (
    <div className="ms-row">
      <div className={`ms-dot ${state}`}></div>
      <div className="ms-body">
        <div className="ms-label">{label}</div>
        <div className="ms-sub">{sub}</div>
      </div>
      <span className="ms-date">{date}</span>
    </div>
  );
}

// ─── Invoice row ─────────────────────────────────────────────────────────────
export function InvRow({ site, amount, status }: { site: string; amount: string; status: "paid" | "due" | "overdue" }) {
  const cls = { paid: "ib-paid", due: "ib-due", overdue: "ib-overdue" }[status];
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <div className="inv-row">
      <span className="inv-site">{site}</span>
      <span className="inv-amount">{amount}</span>
      <span className={`inv-badge ${cls}`}>{label}</span>
    </div>
  );
}

// ─── User row (Admin) ────────────────────────────────────────────────────────
export function UserRow({
  initials,
  name,
  role,
  roleCls,
  site,
  lastLogin,
}: {
  initials: string;
  name: string;
  role: string;
  roleCls: string;
  site: string;
  lastLogin: string;
}) {
  return (
    <div className="user-row">
      <div className="user-avatar">{initials}</div>
      <div className="user-body">
        <div className="user-name">{name}</div>
        <div className="user-role">
          {site} · Last login: {lastLogin}
        </div>
      </div>
      <span className={`role-chip ${roleCls}`}>{role}</span>
    </div>
  );
}

// ─── Config status row (Admin) ───────────────────────────────────────────────
export function CfgRow({ label, sub, status }: { label: string; sub: string; status: "ok" | "warn" | "pending" }) {
  const cls = { ok: "sp-ok", warn: "sp-warn", pending: "sp-pending" }[status];
  const text = { ok: "Complete", warn: "Review needed", pending: "Pending" }[status];
  const icon = { ok: "ti-circle-check", warn: "ti-alert-triangle", pending: "ti-clock" }[status];
  return (
    <div className="cfg-row">
      <div style={{ flex: 1 }}>
        <div className="cfg-label">{label}</div>
        <div className="cfg-sub">{sub}</div>
      </div>
      <span className={`status-pill ${cls}`}>
        <i className={`ti ${icon}`} style={{ fontSize: "11px" }}></i>
        {text}
      </span>
    </div>
  );
}

// ─── Safety item ─────────────────────────────────────────────────────────────
export function SafetyItem({
  icon,
  title,
  sub,
  count,
  tone = "",
}: {
  icon: string;
  title: string;
  sub: string;
  count: string;
  tone?: "s-crit" | "s-warn" | "s-good" | "";
}) {
  return (
    <div className={`sitem ${tone}`}>
      <div className="sitem-icon">
        <i className={`ti ${icon}`}></i>
      </div>
      <div className="sitem-body">
        <div className="sitem-title">{title}</div>
        <div className="sitem-sub">{sub}</div>
      </div>
      <div className="sitem-count">{count}</div>
    </div>
  );
}
