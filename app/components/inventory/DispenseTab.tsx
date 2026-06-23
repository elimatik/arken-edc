"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Vial } from "@/lib/session-store/types";
import { buildDispenseRows, type InvConfig } from "@/lib/inventory-data";

// Tab — dispensing log. Read-only derived data (records come from Treatment Admin /
// Feed & Ration forms); view-only — no row actions. The FORM column deep-links to
// the originating form instance on the Subject Record where one is linked.
export function DispenseTab({ cfg, vials, formInfo }: {
  cfg: InvConfig;
  vials: Vial[];
  formInfo: (formInstanceId: string | undefined, subjectCode: string) => { name: string; href: string } | null;
}) {
  const rows = useMemo(() => buildDispenseRows(vials), [vials]);
  const pending = rows.filter((r) => !r.returned).length;
  const dispNoun = cfg.feed ? "deliveries" : "dispenses";

  return (
    <>
      <div className="inv-infobar">
        <span>{cfg.feed ? "Feed deliveries to pens" : "Dispensing records derived from Treatment Admin forms"} · view-only</span>
        <span className="inv-count">{rows.length} records{cfg.tracksReturns ? ` · ${pending} pending return` : ""}</span>
      </div>

      <div className="inv-table-wrap">
        <table className="inv-table">
          <thead><tr>
            <th>{cfg.idLabel}</th><th>{cfg.feed ? "Pen" : "Subject"}</th><th>Visit</th><th>Form</th><th>Date</th>
            <th>{cfg.feed ? "Delivered" : "Dispensed"}</th><th>Remaining after</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const form = formInfo(r.formInstanceId, r.subject);
              return (
                <tr key={r.key}>
                  <td className="inv-mono" style={{ fontWeight: "var(--weight-medium)" }}>{r.vialId}</td>
                  <td className="inv-mono">{r.subject}</td>
                  <td className="inv-muted" style={{ fontSize: "var(--text-xs)" }}>{r.visit}</td>
                  <td style={{ fontSize: "var(--text-xs)" }}>
                    {form
                      ? <Link href={form.href} style={{ color: "var(--color-link)", textDecoration: "none" }}>{form.name}</Link>
                      : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                  </td>
                  <td className="inv-mono" style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{r.date}</td>
                  <td className="inv-mono" style={{ color: "var(--red-600)" }}>−{r.volDispensed} {cfg.unit}</td>
                  <td className="inv-mono">{r.volAfterDisp} {cfg.unit}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-tertiary)" }}>No {dispNoun} recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="inv-summary">
        <div>Total {dispNoun}: <span className="inv-sv">{rows.length}</span></div>
        {cfg.tracksReturns && <>
          <div>Pending return: <span className="inv-sv warn">{pending}</span></div>
          <div>Returned: <span className="inv-sv ok">{rows.length - pending}</span></div>
        </>}
      </div>
    </>
  );
}
