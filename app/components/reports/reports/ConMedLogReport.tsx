"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { useShell } from "@/components/shell/ShellContext";
import { useTableSort } from "@/lib/useTableSort";
import { SortTh } from "@/components/common/SortTh";
import type { ReportProps } from "@/app/study/[studyId]/reports/page";
import { Section, StatGrid, StatTile, EmptyNote, ExportCsvButton, CodingChip, fmtDate } from "@/components/reports/ReportKit";
import { buildConMedLog, conMedByClass, conMedSummary, type ConMedEntry, type ConMedType } from "@/lib/reports-data";

const TYPE_META: Record<ConMedType, { label: string; cls: string }> = {
  metaphylaxis: { label: "Metaphylaxis", cls: "ms-active" },
  therapeutic: { label: "Therapeutic", cls: "ms-warn" },
  preventive: { label: "Preventive", cls: "ms-future" },
};

// ConMed is subject-level medication data — no treatment-arm column, so blinding
// (hideArms) has nothing to neutralise here.
export function ConMedLogReport({ studyId }: ReportProps) {
  const { dataset } = useStudySession();
  const { study } = useShell();
  const { sort, toggle } = useTableSort(null);
  const isCa = study.code === "CA-0801"; // washout compliance
  const isBr = study.code === "BR-2502"; // metaphylaxis type

  const d = useMemo(() => {
    const entries = buildConMedLog(dataset, studyId);
    return { entries, byClass: conMedByClass(entries), summary: conMedSummary(entries) };
  }, [dataset, studyId]);

  const sorted = useMemo(() => {
    const arr = d.entries.slice();
    if (!sort) return arr;
    const dir = sort.dir === "asc" ? 1 : -1;
    const by: Record<string, (x: ConMedEntry) => string> = {
      subject: (x) => x.subjectCode, class: (x) => x.drugClass, start: (x) => x.startDate, med: (x) => x.medication,
    };
    const f = by[sort.col];
    return f ? arr.sort((a, b) => f(a).localeCompare(f(b)) * dir) : arr;
  }, [d.entries, sort]);

  const csvHeaders = ["Subject", "Site", ...(isBr ? ["Type"] : []), "Medication", "Drug class", "Dose", "Route", "Start date", "End date", "Indication", "VeDDRA code", "Coding", ...(isCa ? ["Washout"] : [])];
  const csvRows = d.entries.map((e) => [
    e.subjectCode, `${e.siteCode} · ${e.siteName}`, ...(isBr ? [e.conmedType ?? "—"] : []),
    e.medication, e.drugClass, e.dose, e.route, e.startDate, e.ongoing ? "Ongoing" : e.endDate, e.indication,
    e.veddraCode, e.codingStatus, ...(isCa ? [e.washoutOverlap == null ? "—" : e.washoutOverlap ? "Overlap" : "Clear"] : []),
  ]);

  if (d.entries.length === 0) {
    return (
      <Section title="Concomitant medications" icon="pill">
        <EmptyNote>No concomitant medications recorded for this study.</EmptyNote>
      </Section>
    );
  }

  return (
    <>
      <Section title="ConMed summary" icon="pill">
        <StatGrid>
          <StatTile value={d.summary.total} label="ConMed entries" />
          <StatTile value={d.summary.subjectsWithConMed} label="Subjects with ≥1 ConMed" />
          <StatTile value={d.summary.topClass} label="Most common drug class" />
          <StatTile value={d.summary.interactionCount} label="Interaction-flagged" tone={d.summary.interactionCount > 0 ? "warn" : ""} />
        </StatGrid>
      </Section>

      <Section title="Concomitant medication log" icon="list-details" action={<ExportCsvButton studyCode={study.code} slug="conmed_log" headers={csvHeaders} rows={csvRows} />}>
        <table className="rpt-table">
          <thead><tr>
            <SortTh label="Subject" sortKey="subject" sort={sort} onSort={toggle} />
            <th>Site</th>
            {isBr && <th>Type</th>}
            <SortTh label="Medication" sortKey="med" sort={sort} onSort={toggle} />
            <SortTh label="Drug class" sortKey="class" sort={sort} onSort={toggle} />
            <th>Dose</th><th>Route</th>
            <SortTh label="Start" sortKey="start" sort={sort} onSort={toggle} />
            <th>End</th><th>Indication</th>
            <th>VeDDRA term</th>
            {isCa && <th>Washout</th>}
          </tr></thead>
          <tbody>
            {sorted.map((e) => {
              const meta = e.conmedType ? TYPE_META[e.conmedType] : null;
              const isMeta = e.conmedType === "metaphylaxis";
              return (
                <tr key={e.id} className={e.interaction ? "rpt-row-warn" : ""}>
                  <td className="mono">{e.subjectCode}</td>
                  <td>{e.siteCode} · {e.siteName}</td>
                  {isBr && <td>{meta ? <span className={`rpt-ms-chip ${meta.cls}`}>{meta.label}</span> : "—"}{isMeta && <span className="rpt-interaction-flag" title="Metaphylactic antibiotic — administered to the whole pen on arrival. May confound individual treatment response if the study drug has overlapping antimicrobial activity. Flag for DM and biostatistician review."><i className="ti ti-alert-triangle"></i></span>}</td>}
                  <td>{e.medication}{e.interaction && !isBr && <span className="rpt-interaction-flag" title="Overlaps a known interaction class"><i className="ti ti-alert-triangle-filled"></i></span>}</td>
                  <td>{e.drugClass}</td>
                  <td className="mono">{e.dose}</td>
                  <td>{e.route}</td>
                  <td className="mono">{fmtDate(e.startDate)}</td>
                  <td className="mono">{e.ongoing ? <span className="rpt-ms-chip ms-active">Ongoing</span> : fmtDate(e.endDate)}</td>
                  <td className="rpt-cell-wrap">{e.indication}</td>
                  <td className="rpt-vedra-cell"><span className="mono">{e.veddraCode}</span><CodingChip status={e.codingStatus} /></td>
                  {isCa && <td>{e.washoutOverlap == null ? "—" : e.washoutOverlap
                    ? <span className="rpt-ms-chip ms-warn" title={`Washout period ends ${e.washoutEnd ? fmtDate(e.washoutEnd) : "after enrollment (ongoing)"} — subject enrolled ${fmtDate(e.enrollDate)}. Verify eligibility with PI.`}>⚠ Washout overlap</span>
                    : <span className="rpt-ms-chip ms-done">✓ Washout clear</span>}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="rpt-footnote">
          Drug terms coded using VeDDRA (Veterinary Dictionary for Drug Reactions and Adverse Events). Coding performed by the Data Manager in the Coding module. Pending terms require DM review before database lock.{" "}
          <Link className="rpt-link" href={`/study/${studyId}/coding`}>Go to Coding →</Link>
        </p>
        {isCa && <p className="rpt-footnote">Washout compliance calculated from reported stop date + protocol-defined washout period. Overlapping entries require PI confirmation that eligibility criteria were still met.</p>}
        {isBr && <p className="rpt-footnote">Metaphylaxis = mass medication of the entire pen on feedlot arrival (preventive/control measure). Therapeutic = treatment of an individual sick animal. Metaphylactic antibiotics with overlapping activity to the investigational product should be reviewed for potential confounding.</p>}
      </Section>

      <Section title="ConMed by drug class" icon="chart-bar">
        <table className="rpt-table rpt-table-narrow">
          <thead><tr><th>Drug class</th><th>Entries</th><th>Subjects affected</th></tr></thead>
          <tbody>
            {d.byClass.map((c) => (
              <tr key={c.drugClass} className={c.interaction ? "rpt-row-warn" : ""}>
                <td>{c.drugClass}{c.interaction && <span className="rpt-interaction-flag"><i className="ti ti-alert-triangle-filled"></i></span>}</td>
                <td className="mono">{c.count}</td>
                <td className="mono">{c.subjects}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}
