"use client";

import Link from "next/link";
import type { DispensingRow, InvConfig } from "@/lib/inventory-data";

// Dispensing log — derived from Treatment Administration / dispensation / feed-delivery
// FORM instances (one form = one row). Read-only; the FORM column deep-links to the
// originating form on the Subject Record. Columns are study-specific.
export function DispenseTab({ studyId, studyCode, cfg, rows, siteActive }: {
  studyId: string;
  studyCode: string;
  cfg: InvConfig;
  rows: DispensingRow[];
  siteActive: boolean;
}) {
  const formCell = (r: DispensingRow) => {
    if (!r.formInstanceId) return <span style={{ color: "var(--color-text-tertiary)" }}>—</span>;
    if (!r.subjectId) return <span className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.formName ?? "Form"}</span>;
    return <Link href={`/study/${studyId}/data-entry/${r.subjectId}?form=${r.formInstanceId}`} style={{ color: "var(--color-link)", textDecoration: "none" }}>{r.formName ?? "Form"} →</Link>;
  };
  const mono = (v: React.ReactNode) => <span className="inv-mono">{v}</span>;

  const head = studyCode === "CA-0801"
    ? ["Subject", "Visit", "Date", "Kit", "Volume (mL)", "Administered by", "Form"]
    : studyCode === "PH-2401"
      ? ["Pen", "Week", "Date", "Batch", "Delivered (kg)", "Administered by", "Form"]
      : ["Subject", "Visit", "Date", "Drug", "Lot", "Unit ID", "Dose (mL)", "Administered by", "Form"];

  return (
    <>
      <div className="inv-infobar">
        <span>Derived from {cfg.feed ? "feed-delivery" : studyCode === "CA-0801" ? "drug-dispensation" : "Treatment Administration"} forms · view-only</span>
        <span className="inv-count">{rows.length} records</span>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => studyCode === "CA-0801" ? (
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
            {rows.length === 0 && <tr><td colSpan={head.length} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No dispensing records found{siteActive ? " for the selected site" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Total records: <span className="inv-sv">{rows.length}</span></div>
        <div style={{ marginLeft: "auto", color: "var(--color-text-tertiary)" }}>Sourced from completed forms — read-only</div>
      </div>
    </>
  );
}
