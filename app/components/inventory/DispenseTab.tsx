"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTableSort, sortDirMul, type SortState } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { DispensingRow, InvConfig } from "@/lib/inventory-data";

// Dispensing log — derived from Treatment Administration / dispensation / feed-delivery
// FORM instances (one form = one row). Read-only; the FORM column deep-links to the
// originating form on the Subject (or barn) Record. Sortable + searchable.
export function DispenseTab({ studyId, studyCode, cfg, rows, siteActive }: {
  studyId: string;
  studyCode: string;
  cfg: InvConfig;
  rows: DispensingRow[];
  siteActive: boolean;
}) {
  const [search, setSearch] = useState("");
  const { sort, toggle } = useTableSort({ col: "date", dir: "desc" });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((r) => [r.subjectCode, r.penCode, r.visitLabel, r.week, r.drug, r.kit, r.batch, r.lot, r.unitId, r.administeredBy]
      .some((v) => (v ?? "").toString().toLowerCase().includes(q)));
  }, [rows, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const val = (r: DispensingRow, col: string): string | number => {
      switch (col) {
        case "subject": return r.subjectCode ?? "";
        case "pen": return r.penCode ?? "";
        case "visit": return r.visitLabel ?? "";
        case "week": return r.week ?? "";
        case "date": return r.date ?? "";
        case "drug": return r.drug ?? "";
        case "lot": return r.lot ?? "";
        case "kit": return r.kit ?? "";
        case "dose": return r.dose ?? 0;
        case "volume": return r.volume ?? 0;
        case "delivered": return r.kgDelivered ?? 0;
        default: return "";
      }
    };
    const mul = sortDirMul(sort);
    return filtered.slice().sort((a, b) => {
      const av = val(a, sort.col), bv = val(b, sort.col);
      const r = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return r * mul;
    });
  }, [filtered, sort]);

  const formCell = (r: DispensingRow) => {
    if (!r.formDefId) return <span style={{ color: "var(--color-text-tertiary)" }}>—</span>;
    const href = r.subjectId
      ? `/study/${studyId}/data-entry/${r.subjectId}?form=${r.formDefId}`
      : r.penId
        ? `/study/${studyId}/barns/${r.penId}?form=${r.formDefId}`
        : null;
    if (!href) return <span className="inv-muted">{r.formName ?? "Form"}</span>;
    return <Link href={href} style={{ color: "var(--color-link)", textDecoration: "none" }}>{r.formName ?? "Form"} →</Link>;
  };
  const mono = (v: React.ReactNode) => <span className="inv-mono">{v}</span>;

  // Header config per study: { label, key? } — key present ⇒ sortable.
  const cols: { label: string; key?: string }[] = studyCode === "CA-0801"
    ? [{ label: "Subject", key: "subject" }, { label: "Visit", key: "visit" }, { label: "Date", key: "date" }, { label: "Kit", key: "kit" }, { label: "Volume (mL)", key: "volume" }, { label: "Administered by" }, { label: "Form" }]
    : studyCode === "PH-2401"
      ? [{ label: "Pen", key: "pen" }, { label: "Week", key: "week" }, { label: "Date", key: "date" }, { label: "Batch" }, { label: "Delivered (kg)", key: "delivered" }, { label: "Administered by" }, { label: "Form" }]
      : [{ label: "Subject", key: "subject" }, { label: "Visit", key: "visit" }, { label: "Date", key: "date" }, { label: "Drug", key: "drug" }, { label: "Lot", key: "lot" }, { label: "Unit ID" }, { label: "Dose (mL)", key: "dose" }, { label: "Administered by" }, { label: "Form" }];

  return (
    <>
      <div className="inv-filter-bar">
        <input className="inv-search" type="search" placeholder="Search dispensing records…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="inv-count" style={{ marginLeft: "auto" }}>{sorted.length} records</span>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>{cols.map((c) => c.key
            ? <SortTh key={c.label} label={c.label} sortKey={c.key} sort={sort as SortState} onSort={toggle} />
            : <th key={c.label}>{c.label}</th>)}</tr></thead>
          <tbody>
            {sorted.map((r) => studyCode === "CA-0801" ? (
              <tr key={r.id}>
                <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{r.subjectCode}</td>
                <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.visitLabel}</td>
                <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.date}</td>
                <td>{mono(r.kit)}{r.arm && <span className="inv-badge inv-badge-athome" style={{ marginLeft: 6 }}>{r.arm}</span>}</td>
                <td>{mono(`${r.volume} ml`)}</td>
                <td className="inv-muted">{r.administeredBy ?? "—"}</td>
                <td style={{ fontSize: "var(--text-xs)" }}>{formCell(r)}</td>
              </tr>
            ) : studyCode === "PH-2401" ? (
              <tr key={r.id}>
                <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{r.penCode}</td>
                <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.week ?? "—"}</td>
                <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.date}</td>
                <td>{mono(r.batch ?? "—")}</td>
                <td>{mono(r.kgDelivered != null ? `${r.kgDelivered} kg` : "—")}</td>
                <td className="inv-muted">{r.administeredBy ?? "—"}</td>
                <td style={{ fontSize: "var(--text-xs)" }}>{formCell(r)}</td>
              </tr>
            ) : (
              <tr key={r.id}>
                <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{r.subjectCode}</td>
                <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.visitLabel}</td>
                <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.date}</td>
                <td>{r.drug ?? "—"}</td>
                <td>{mono(r.lot ?? "—")}</td>
                <td>{mono(r.unitId ?? "—")}</td>
                <td className="inv-mono" style={{ color: "var(--red-600)" }}>{r.dose != null ? `−${r.dose} ml` : "—"}</td>
                <td className="inv-muted">{r.administeredBy ?? "—"}</td>
                <td style={{ fontSize: "var(--text-xs)" }}>{formCell(r)}</td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={cols.length} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No dispensing records found{search ? " matching your search" : siteActive ? " for the selected site" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Total records: <span className="inv-sv">{sorted.length}</span></div>
        <div style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>Sourced from completed forms — read-only</div>
      </div>
    </>
  );
}
