"use client";

import { useMemo, useState } from "react";
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
  const cls = useTableSort(null); // independent sort for the "By drug class" tab
  const [tab, setTab] = useState<"listing" | "byclass">("listing");
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

  const sortedClass = useMemo(() => {
    const arr = d.byClass.slice();
    if (!cls.sort) return arr;
    const dir = cls.sort.dir === "asc" ? 1 : -1;
    if (cls.sort.col === "class") return arr.sort((a, b) => a.drugClass.localeCompare(b.drugClass) * dir);
    if (cls.sort.col === "count") return arr.sort((a, b) => (a.count - b.count) * dir);
    if (cls.sort.col === "subjects") return arr.sort((a, b) => (a.subjects - b.subjects) * dir);
    return arr;
  }, [d.byClass, cls.sort]);
  const classCsvHeaders = ["Drug class", "Entries", "Subjects affected"];
  const classCsvRows = sortedClass.map((c) => [c.drugClass, c.count, c.subjects]);

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

      <Section title="Concomitant medications" icon="list-details"
        action={tab === "listing"
          ? <ExportCsvButton studyCode={study.code} slug="conmed_log" headers={csvHeaders} rows={csvRows} />
          : <ExportCsvButton studyCode={study.code} slug="conmed_by_class" headers={classCsvHeaders} rows={classCsvRows} />}>
        <div className="rpt-tabs">
          <button className={`rpt-tab${tab === "listing" ? " active" : ""}`} type="button" onClick={() => setTab("listing")}>Medication listing <span className="rpt-tab-count">{d.entries.length}</span></button>
          <button className={`rpt-tab${tab === "byclass" ? " active" : ""}`} type="button" onClick={() => setTab("byclass")}>By drug class <span className="rpt-tab-count">{d.byClass.length}</span></button>
        </div>

        {tab === "byclass" ? (
          <table className="rpt-table rpt-table-narrow">
            <thead><tr>
              <SortTh label="Drug class" sortKey="class" sort={cls.sort} onSort={cls.toggle} />
              <SortTh label="Entries" sortKey="count" sort={cls.sort} onSort={cls.toggle} />
              <SortTh label="Subjects affected" sortKey="subjects" sort={cls.sort} onSort={cls.toggle} />
            </tr></thead>
            <tbody>
              {sortedClass.map((c) => (
                <tr key={c.drugClass} className={c.interaction ? "rpt-row-warn" : ""}>
                  <td>{c.drugClass}{c.interaction && <span className="rpt-interaction-flag"><i className="ti ti-alert-triangle-filled"></i></span>}</td>
                  <td className="mono">{c.count}</td>
                  <td className="mono">{c.subjects}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
        <>
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
                  <td className="rpt-vedra-cell rpt-vedra-wrap"><span className="mono">{e.veddraCode}</span><CodingChip status={e.codingStatus} /></td>
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
        </>
        )}
      </Section>
    </>
  );
}
