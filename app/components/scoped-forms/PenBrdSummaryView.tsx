"use client";

// Read-only, auto-derived Pen BRD Summary (barn-scoped, BR-2502). No toolbar / SDV
// / queries / submit — purely a rollup of animal-level BRD outcomes, one row per
// pen plus a barn-level footer. Mirrors the Production Summary treatment.
import { buildPenBrdSummary, brdSeverity, type PenBrdRow } from "@/lib/pen-brd-summary";
import type { Dataset } from "@/lib/session-store/types";

const pctFmt = (x: number | null) => (x == null ? "—" : `${Math.round(x)}%`);
const numFmt = (x: number | null, dp = 1) => (x == null ? "—" : x.toFixed(dp));
const armStr = (byArm: Record<string, number>) => {
  const keys = Object.keys(byArm).sort();
  return keys.length ? keys.map((k) => `${k} ${byArm[k]}`).join(" · ") : "—";
};
// Severity → text colour class.
const sevCls = (x: number | null) => {
  const s = brdSeverity(x);
  return s === "bad" ? "brd-bad" : s === "warn" ? "brd-warn" : s === "good" ? "brd-good" : "";
};

function Row({ r, footer }: { r: PenBrdRow; footer?: boolean }) {
  return (
    <tr className={footer ? "brd-footer-row" : undefined}>
      <td className={footer ? "brd-pen" : "mono brd-pen"}>{footer ? "All pens" : r.penCode}</td>
      <td className="mono">{r.n}</td>
      <td className="brd-arms">{armStr(r.byArm)}</td>
      <td className={`mono ${sevCls(r.morbidityPct)}`}>{pctFmt(r.morbidityPct)} <span className="brd-frac">({r.treated}/{r.n})</span></td>
      <td className={`mono ${sevCls(r.relapsePct)}`}>{pctFmt(r.relapsePct)} <span className="brd-frac">({r.retreated}/{r.treated})</span></td>
      <td className={`mono ${sevCls(r.mortalityPct)}`}>{pctFmt(r.mortalityPct)} <span className="brd-frac">({r.brdDeaths}/{r.n})</span></td>
      <td className={`mono ${sevCls(r.fatalityPct)}`}>{pctFmt(r.fatalityPct)}</td>
      <td className="mono">{numFmt(r.meanPeakDart)}</td>
      <td className="mono">{r.daysToFirstPull == null ? "—" : `${numFmt(r.daysToFirstPull)} d`}</td>
      <td className="mono">{r.chronic}</td>
    </tr>
  );
}

export function PenBrdSummaryView({ form, dataset, barnId }: { form: { name: string }; dataset: Dataset; barnId: string }) {
  const summary = buildPenBrdSummary(dataset, barnId);
  return (
    <div className="form-content">
      <div className="form-sticky-header">
        <div className="form-header">
          <h1 className="form-title">{form.name}</h1>
          <span className="badge badge-success" style={{ alignSelf: "center" }}><i className="ti ti-lock"></i> Read-only</span>
        </div>
      </div>
      <div className="form-body">
        <div className="scf-banner note"><i className="ti ti-info-circle"></i> Auto-generated summary — updates as animal-level data is entered.</div>
        {summary.rows.length === 0 ? (
          <div className="scf-empty">No pens in this barn yet.</div>
        ) : (
          <table className="scf-table brd-table">
            <thead>
              <tr>
                <th>Pen</th><th>Animals</th><th>Arms</th>
                <th>Morbidity</th><th>Relapse</th><th>BRD mortality</th><th>Case-fatality</th>
                <th>Mean peak DART</th><th>Days to 1st pull</th><th>Chronic</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((r) => <Row key={r.penId} r={r} />)}
              <Row r={summary.footer} footer />
            </tbody>
          </table>
        )}
        <div className="brd-footnote">
          Enrolled animals only. <strong>Morbidity</strong> = treated ÷ animals · <strong>Relapse</strong> = re-treated ÷ treated ·
          <strong> BRD mortality</strong> = BRD deaths ÷ animals · <strong>Case-fatality</strong> = BRD deaths ÷ treated.
          Screen failures excluded; an animal withdrawn after enrolment still counts. An untreated pen reads 0% (not N/A); an empty pen reads —.
        </div>
      </div>
    </div>
  );
}
