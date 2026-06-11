"use client";

import { useNdaName } from "@/lib/use-nda-name";
import type { Role } from "@/lib/permissions";
import {
  Card,
  Chip,
  EnrollBar,
  MiniBar,
  QueryRow,
  VisitRow,
  ActivityRow,
  SdvRow,
  QcatRow,
  LockRow,
  MilestoneRow,
  UserRow,
  CfgRow,
  SafetyItem,
} from "./widgets";
import "./dashboard.css";

const ROLE_LABEL: Record<Role, string> = {
  CRC: "CRC",
  CRA: "CRA / Monitor",
  PI: "Principal Investigator",
  DM: "Data Manager",
  Sponsor: "Sponsor",
  Admin: "Administrator",
};

interface Props {
  role: Role;
  studyName: string;
  today: string;
}

export function RoleDashboard({ role, studyName, today }: Props) {
  const name = useNdaName();
  const firstName = name.split(/\s+/)[0];
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return (
    <div className="dashboard">
      <nav className="dashboard-bc" aria-label="Breadcrumb">
        <span className="dashboard-bc-cur">Dashboard</span>
      </nav>
      <div className="greeting">
        <div className="greeting-name">Good {partOfDay}, {firstName}</div>
        <div className="greeting-sub">
          {today ? <>{today} · </> : null}
          <span>{studyName}</span> · {ROLE_LABEL[role]}
        </div>
      </div>
      {ROLE_RENDERERS[role]()}
    </div>
  );
}

const ROLE_RENDERERS: Record<Role, () => JSX.Element> = {
  CRC: renderCRC,
  CRA: renderCRA,
  PI: renderPI,
  DM: renderDM,
  Sponsor: renderSponsor,
  Admin: renderAdmin,
};

// ══ CRC ═══════════════════════════════════════════════════════════════════
function renderCRC() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="30" label="Subjects enrolled" accent="blue" trend={{ d: "up", t: "+2 this week" }} />
        <Chip val="40" label="Site target" />
        <Chip val="3" label="Queries assigned to me" accent="warn" />
        <Chip val="2" label="Forms overdue" accent="alert" />
        <Chip val="4" label="Visits this week" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="My open queries" icon="ti-message-report" action="View all →">
            <div className="query-list">
              <QueryRow subject="AUSB1P1-01" text="Rectal temp — Visit 2 (28.5°C out of range)" meta="Q-001 · Edit check · May 07" status="Awaiting my response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="AUSB1P2-01" text="Body weight — Visit 1 (missing unit)" meta="Q-002 · J. Hollis (CRA) · May 06" status="Awaiting my response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="AUSB1P3-01" text="AE form — date inconsistency" meta="Q-003 · Edit check · May 04" status="Responded" icon="qi-auto" badge="qb-resp" />
            </div>
          </Card>
          <Card title="Overdue forms" icon="ti-forms" action="Open Data Entry →">
            <div className="list-rows">
              <VisitRow day="06" mon="Jun" primary="AUSB1P3-01 · Bovine #A-006" secondary="Visit 2 — Physical exam" tagCls="vt-overdue" tagTxt="Overdue 3 days" overdue />
              <VisitRow day="07" mon="Jun" primary="AUSB1P3-02 · Bovine #A-007" secondary="Visit 2 — Treatment admin." tagCls="vt-overdue" tagTxt="Overdue 2 days" overdue />
            </div>
          </Card>
          <Card title="Recent activity" icon="ti-activity">
            <div>
              <ActivityRow icon="ti-forms" ts="Today 08:42 UTC"><strong>AUSB1P1-01</strong> — Visit 2 Physical exam saved</ActivityRow>
              <ActivityRow icon="ti-message-report" ts="Yesterday 16:14 UTC">Query Q-003 response submitted for <strong>AUSB1P3-01</strong></ActivityRow>
              <ActivityRow icon="ti-check" ts="Jun 07 · 11:30 UTC"><strong>AUSB1P1-04</strong> — End of study form completed</ActivityRow>
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Site enrollment" icon="ti-users">
            <EnrollBar cur={30} tgt={40} pct={75} legs={[
              { c: "var(--blue-600)", t: "Group A — 16 subjects" },
              { c: "var(--purple-600)", t: "Group B — 14 subjects" },
              { c: "var(--color-border)", t: "10 slots remaining" },
            ]} />
          </Card>
          <Card title="Upcoming visits" icon="ti-calendar-event" action="View all →">
            <div className="list-rows">
              <VisitRow day="09" mon="Jun" primary="AUSB1P1-02 · Bovine #A-002" secondary="Visit 3 — Day 14" tagCls="vt-today" tagTxt="Today" />
              <VisitRow day="10" mon="Jun" primary="AUSB1P2-01 · Bovine #A-005" secondary="Visit 3 — Day 14" tagCls="vt-due" tagTxt="Tomorrow" />
              <VisitRow day="11" mon="Jun" primary="AUSB1P1-03 · Bovine #A-003" secondary="Visit 3 — Day 14" tagCls="vt-due" tagTxt="In 2 days" />
              <VisitRow day="14" mon="Jun" primary="AUSB2P4-01 · Bovine #B-001" secondary="Visit 4 — Day 28" tagCls="vt-due" tagTxt="In 5 days" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ CRA ═══════════════════════════════════════════════════════════════════
function SiteCompareRow({ name, enrolled, target, queries, overdue, last }: { name: string; enrolled: number; target: number; queries: number; overdue: number; last: string }) {
  const pct = Math.round((enrolled / target) * 100);
  return (
    <tr>
      <td>{name}</td>
      <td className="mono">{enrolled}</td>
      <td className="mono muted">{target}</td>
      <td><MiniBar pct={pct} /></td>
      <td className={queries > 3 ? "nw" : "mono muted"}>{queries || "—"}</td>
      <td className={overdue > 0 ? "na" : "mono muted"}>{overdue || "—"}</td>
      <td className="mono muted" style={{ fontSize: "var(--text-xs)" }}>{last}</td>
    </tr>
  );
}

function renderCRA() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="89" label="Subjects enrolled (all sites)" accent="blue" trend={{ d: "up", t: "+5 this week" }} />
        <Chip val="11" label="Total open queries" accent="warn" />
        <Chip val="3" label="Overdue queries (> 7 days)" accent="alert" />
        <Chip val="62%" label="Avg SDV progress" />
        <Chip val="3" label="Monitoring visits scheduled" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Site comparison" icon="ti-building-hospital" action="Export →">
            <table className="dash-table">
              <thead>
                <tr><th>Site</th><th>Enrolled</th><th>Target</th><th>Progress</th><th>Queries</th><th>Overdue</th><th>Last entry</th></tr>
              </thead>
              <tbody>
                <SiteCompareRow name="Austin" enrolled={30} target={40} queries={4} overdue={2} last="May 09" />
                <SiteCompareRow name="Dallas" enrolled={29} target={40} queries={5} overdue={1} last="May 08" />
                <SiteCompareRow name="Houston" enrolled={30} target={40} queries={2} overdue={0} last="May 09" />
              </tbody>
            </table>
          </Card>
          <Card title="Open queries by site" icon="ti-message-report" action="View all →">
            <div className="query-list">
              <QueryRow subject="AUSB1P1-01" text="Rectal temp — Visit 2 out of range" meta="Q-001 · Austin · Edit check · May 07" status="Awaiting CRC response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="DALB1P7-02" text="Body weight missing unit — Visit 1" meta="Q-004 · Dallas · J. Hollis · May 06" status="Awaiting CRC response" icon="qi-open" badge="qb-open" />
              <QueryRow subject="HOUB1P1-02" text="Clinical remarks — inconsistency" meta="Q-005 · Houston · Edit check · May 05" status="Responded" icon="qi-auto" badge="qb-resp" />
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="SDV progress" icon="ti-shield-check">
            <div>
              <SdvRow name="Austin Research Center" pct={74} />
              <SdvRow name="Dallas Vet Clinic" pct={58} />
              <SdvRow name="Houston Animal Hospital" pct={42} />
            </div>
          </Card>
          <Card title="Next monitoring visits" icon="ti-calendar">
            <div className="list-rows">
              <VisitRow day="15" mon="Jun" primary="Austin Research Center" secondary="Routine monitoring · SDV planned" tagCls="vt-due" tagTxt="In 6 days" />
              <VisitRow day="22" mon="Jun" primary="Dallas Vet Clinic" secondary="Routine monitoring" tagCls="vt-due" tagTxt="In 13 days" />
              <VisitRow day="01" mon="Jul" primary="Houston Animal Hospital" secondary="Follow-up visit" tagCls="vt-due" tagTxt="In 22 days" />
            </div>
          </Card>
          <Card title="Recent activity" icon="ti-activity">
            <div>
              <ActivityRow icon="ti-shield-check" ts="Today 09:00 UTC">SDV completed — <strong>AUSB1P1-01</strong> Visit 1 · Heart rate field</ActivityRow>
              <ActivityRow icon="ti-message-report" ts="Yesterday 14:22 UTC">Query Q-004 raised on <strong>DALB1P7-02</strong></ActivityRow>
              <ActivityRow icon="ti-check" ts="Jun 05 · 16:40 UTC">Monitoring visit report submitted — Dallas</ActivityRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ PI ════════════════════════════════════════════════════════════════════
function renderPI() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="89" label="Subjects enrolled" accent="blue" trend={{ d: "up", t: "+5 this week" }} />
        <Chip val="74%" label="Enrollment progress" accent="good" />
        <Chip val="0" label="Active SAEs" accent="good" />
        <Chip val="2" label="Subjects on hold" accent="warn" />
        <Chip val="11" label="Open queries (all sites)" accent="warn" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Study enrollment" icon="ti-users">
            <EnrollBar cur={89} tgt={120} pct={74} legs={[
              { c: "var(--blue-600)", t: "Group A — 46 subjects" },
              { c: "var(--purple-600)", t: "Group B — 43 subjects" },
              { c: "var(--color-border)", t: "31 slots remaining" },
            ]} />
            <table className="dash-table" style={{ marginTop: 0 }}>
              <thead><tr><th>Site</th><th>Enrolled</th><th>Target</th><th>Progress</th></tr></thead>
              <tbody>
                <tr><td>Austin</td><td className="mono">30</td><td className="mono muted">40</td><td><MiniBar pct={75} /></td></tr>
                <tr><td>Dallas</td><td className="mono">29</td><td className="mono muted">40</td><td><MiniBar pct={73} /></td></tr>
                <tr><td>Houston</td><td className="mono">30</td><td className="mono muted">40</td><td><MiniBar pct={75} /></td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Queries by site" icon="ti-message-report" action="View all →">
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Open</th><th>Responded</th><th>Resolved</th><th>Overdue</th></tr></thead>
              <tbody>
                <tr><td>Austin</td><td className="nw">4</td><td className="mono muted">2</td><td className="ng">18</td><td className="na">2</td></tr>
                <tr><td>Dallas</td><td className="nw">5</td><td className="mono muted">3</td><td className="ng">14</td><td className="na">1</td></tr>
                <tr><td>Houston</td><td className="nw">2</td><td className="mono muted">1</td><td className="ng">9</td><td className="mono muted">—</td></tr>
              </tbody>
            </table>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Safety overview" icon="ti-shield-exclamation">
            <div className="safety-list">
              <SafetyItem tone="s-good" icon="ti-circle-check" title="Active SAEs" sub="No serious adverse events" count="0" />
              <SafetyItem tone="s-warn" icon="ti-pause-circle" title="Subjects on hold" sub="AUSB1P3-01 · AUSB1P3-02" count="2" />
              <SafetyItem icon="ti-file-description" title="Protocol deviations" sub="This month" count="1" />
            </div>
          </Card>
          <Card title="Randomization balance" icon="ti-scale">
            <div className="arm-list">
              <div>
                <div className="arm-hdr"><span className="arm-label">Group A — Dose</span><span className="arm-count">46 subjects</span></div>
                <div className="arm-track"><div className="arm-fill-a" style={{ width: "52%" }}></div></div>
              </div>
              <div>
                <div className="arm-hdr"><span className="arm-label">Group B — Control</span><span className="arm-count">43 subjects</span></div>
                <div className="arm-track"><div className="arm-fill-b" style={{ width: "48%" }}></div></div>
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-2)" }}>
                Target 1:1 · Current 52:48 — within range
              </div>
            </div>
          </Card>
          <Card title="Key milestones" icon="ti-flag-2">
            <div className="milestone-list">
              <MilestoneRow label="Site initiation — all sites" sub="All 3 sites activated" date="Sep 2025" state="done" />
              <MilestoneRow label="Protocol amendment v2.1" sub="Safety monitoring reduced to 2 weeks" date="Jan 2026" state="done" />
              <MilestoneRow label="Interim safety review" sub="Scheduled — sponsor review" date="Aug 2026" state="active" />
              <MilestoneRow label="Last subject last visit" sub="LSLV target" date="Dec 2026" state="future" />
              <MilestoneRow label="Database lock" sub="All queries resolved" date="Feb 2027" state="future" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ DM ════════════════════════════════════════════════════════════════════
function renderDM() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
        <Chip val="89" label="Subjects enrolled" />
        <Chip val="78%" label="Data completeness" accent="good" />
        <Chip val="11" label="Open queries" accent="warn" />
        <Chip val="4" label="Ready to lock" accent="blue" />
        <Chip val="14" label="Forms pending review" accent="warn" />
        <Chip val="62%" label="SDV complete" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Data completeness" icon="ti-database">
            <div className="comp-grid">
              <div className="comp-item"><div className="comp-lbl">Austin</div><div className="comp-val">82%</div><div className="comp-track"><div className="comp-fill" style={{ width: "82%" }}></div></div></div>
              <div className="comp-item"><div className="comp-lbl">Dallas</div><div className="comp-val">74%</div><div className="comp-track"><div className="comp-fill partial" style={{ width: "74%" }}></div></div></div>
              <div className="comp-item"><div className="comp-lbl">Houston</div><div className="comp-val">78%</div><div className="comp-track"><div className="comp-fill partial" style={{ width: "78%" }}></div></div></div>
              <div className="comp-item"><div className="comp-lbl">Overall</div><div className="comp-val">78%</div><div className="comp-track"><div className="comp-fill partial" style={{ width: "78%" }}></div></div></div>
            </div>
            <table className="dash-table">
              <thead><tr><th>Site</th><th>Submitted</th><th>Missing</th><th>Pending</th><th>Locked</th></tr></thead>
              <tbody>
                <tr><td>Austin</td><td className="mono">156</td><td className="na">8</td><td className="nw">6</td><td className="ng">142</td></tr>
                <tr><td>Dallas</td><td className="mono">148</td><td className="na">12</td><td className="nw">5</td><td className="ng">131</td></tr>
                <tr><td>Houston</td><td className="mono">152</td><td className="na">9</td><td className="nw">3</td><td className="ng">140</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="Subjects ready to lock" icon="ti-lock" action="Lock all →">
            <div>
              <LockRow id="AUSB1P1-04" site="Austin · Barn A · Pen 1" forms="5/5 · 0 queries" />
              <LockRow id="AUSB2P5-01" site="Austin · Barn B · Pen 5" forms="5/5 · 0 queries" />
              <LockRow id="DALB1P6-01" site="Dallas · Barn C · Pen 6" forms="5/5 · 0 queries" />
              <LockRow id="HOUB1P2-01" site="Houston · Barn D · Pen 2" forms="5/5 · 0 queries" />
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Queries by type" icon="ti-tag" action="View all →">
            <div className="qcat-list">
              <QcatRow label="Edit check" n={5} pct={100} fill="ec" />
              <QcatRow label="Missing data" n={3} pct={60} fill="md" />
              <QcatRow label="Out of range" n={2} pct={40} fill="or" />
              <QcatRow label="Source discrepancy" n={1} pct={20} fill="sd" />
            </div>
          </Card>
          <Card title="SDV progress" icon="ti-shield-check">
            <div>
              <SdvRow name="Austin" pct={74} />
              <SdvRow name="Dallas" pct={58} />
              <SdvRow name="Houston" pct={42} />
            </div>
          </Card>
          <Card title="Recent audit activity" icon="ti-clipboard-list" action="Audit trail →">
            <div>
              <ActivityRow icon="ti-pencil" ts="Today 08:42 · E. Tron (CRC)"><strong>AUSB1P1-01</strong> Rectal temp corrected 28.5→38.4 °C</ActivityRow>
              <ActivityRow icon="ti-lock" ts="Jun 07 · 10:00 · M. Chen"><strong>AUSB1P1-04</strong> Record locked</ActivityRow>
              <ActivityRow icon="ti-file-alert" ts="Jun 05 · 14:22 · Dr. Mercer">Protocol deviation logged — AUSB1P3-01</ActivityRow>
              <ActivityRow icon="ti-message-report" ts="May 07 · 09:14 · System">Query Q-001 raised — Austin</ActivityRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ SPONSOR (adapted — oversight + blinded Reports/Inventory) ══════════════
function renderSponsor() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(5,1fr)" }}>
        <Chip val="89" label="Subjects enrolled" accent="blue" trend={{ d: "up", t: "+5 this week" }} />
        <Chip val="74%" label="Enrollment progress" accent="good" />
        <Chip val="3" label="Sites active" accent="good" />
        <Chip val="0" label="Active SAEs" accent="good" />
        <Chip val="1" label="Protocol deviations" accent="warn" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Study enrollment" icon="ti-users">
            <EnrollBar cur={89} tgt={120} pct={74} legs={[
              { c: "var(--blue-600)", t: "Enrolled — 89" },
              { c: "var(--green-600)", t: "On track" },
              { c: "var(--color-border)", t: "31 remaining" },
            ]} />
          </Card>
          <Card title="Key milestones" icon="ti-flag-2">
            <div className="milestone-list">
              <MilestoneRow label="Site initiation — all sites" sub="All 3 sites activated" date="Sep 2025" state="done" />
              <MilestoneRow label="50% enrollment milestone" sub="89/120 — currently 74%" date="Mar 2026" state="done" />
              <MilestoneRow label="Interim safety review" sub="Sponsor review scheduled" date="Aug 2026" state="active" />
              <MilestoneRow label="Full enrollment target" sub="All 120 subjects enrolled" date="Dec 2026" state="future" />
              <MilestoneRow label="Database lock" sub="All queries resolved" date="Feb 2027" state="future" />
            </div>
          </Card>
        </div>
        <div className="dash-col">
          {/* Aggregate totals only — no treatment-arm / randomization breakdown. */}
          <Card title="Reports" icon="ti-chart-bar">
            <div className="agg-list">
              <div className="agg-row"><span className="agg-lbl">Subjects enrolled</span><span className="agg-val">89</span></div>
              <div className="agg-row"><span className="agg-lbl">Forms submitted</span><span className="agg-val">456</span></div>
              <div className="agg-row"><span className="agg-lbl">Queries resolved</span><span className="agg-val">41</span></div>
              <div className="agg-row"><span className="agg-lbl">Data completeness</span><span className="agg-val">78%</span></div>
              <span className="blinded-note"><i className="ti ti-eye-off"></i> Aggregate totals — treatment arm breakdown is blinded for your role</span>
            </div>
          </Card>
          <Card title="Inventory" icon="ti-package">
            <div className="agg-list">
              <div className="agg-row"><span className="agg-lbl">Units dispensed</span><span className="agg-val">178</span></div>
              <div className="agg-row"><span className="agg-lbl">Units returned</span><span className="agg-val">24</span></div>
              <div className="agg-row"><span className="agg-lbl">On-hand stock</span><span className="agg-val">96</span></div>
              <span className="blinded-note"><i className="ti ti-eye-off"></i> Aggregate totals — per-arm allocation is blinded for your role</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

// ══ ADMIN ═════════════════════════════════════════════════════════════════
function renderAdmin() {
  return (
    <>
      <div className="stat-row" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
        <Chip val="12" label="Active users" accent="blue" />
        <Chip val="3" label="Sites configured" accent="good" />
        <Chip val="6" label="Role types in use" />
        <Chip val="0" label="System errors" accent="good" />
        <Chip val="2" label="Pending user activations" accent="warn" />
        <Chip val="100%" label="Audit trail coverage" accent="good" />
      </div>
      <div className="dash-grid dash-2col">
        <div className="dash-col">
          <Card title="Active users" icon="ti-users" action="Manage users →">
            <div>
              <UserRow initials="ET" name="Elisa Tron" role="CRC" roleCls="rc-crc" site="Austin · Barn A" lastLogin="Today 08:42" />
              <UserRow initials="SK" name="Sarah Kim" role="CRC" roleCls="rc-crc" site="Austin" lastLogin="Yesterday" />
              <UserRow initials="JH" name="James Hollis" role="CRA" roleCls="rc-cra" site="All sites" lastLogin="Jun 07" />
              <UserRow initials="DM" name="Dr. Daniel Mercer" role="PI" roleCls="rc-pi" site="Austin" lastLogin="Jun 05" />
              <UserRow initials="MC" name="Margaret Chen" role="DM" roleCls="rc-dm" site="All sites" lastLogin="Jun 06" />
              <UserRow initials="CV" name="Carla Voss" role="Sponsor" roleCls="rc-sponsor" site="All sites" lastLogin="Today 08:00" />
            </div>
          </Card>
          <Card title="Pending activations" icon="ti-user-check">
            <div className="list-rows">
              <div className="list-row">
                <div className="list-row-body">
                  <div className="list-row-primary">Dr. Anna Reyes</div>
                  <div className="list-row-secondary">Invited as PI · Houston · Jun 06</div>
                </div>
                <button className="btn-xs" type="button"><i className="ti ti-check"></i> Activate</button>
              </div>
              <div className="list-row">
                <div className="list-row-body">
                  <div className="list-row-primary">Tom Walsh</div>
                  <div className="list-row-secondary">Invited as CRC · Dallas · Jun 07</div>
                </div>
                <button className="btn-xs" type="button"><i className="ti ti-check"></i> Activate</button>
              </div>
            </div>
          </Card>
        </div>
        <div className="dash-col">
          <Card title="Study configuration status" icon="ti-settings" action="Settings →">
            <div>
              <CfgRow label="Study settings" sub="Hierarchy, type, subject level" status="ok" />
              <CfgRow label="Form permissions" sub="Role-based access configured" status="ok" />
              <CfgRow label="Randomization" sub="Block randomization v2.1" status="ok" />
              <CfgRow label="Electronic signatures" sub="Co-signature enabled" status="ok" />
              <CfgRow label="Inventory" sub="Dispense/return triggers set" status="ok" />
              <CfgRow label="Billing" sub="Fee schedule — 1 item missing" status="warn" />
              <CfgRow label="Email notifications" sub="Not configured" status="pending" />
            </div>
          </Card>
          <Card title="Audit trail health" icon="ti-clipboard-list" action="View full log →">
            <div className="safety-list">
              <SafetyItem tone="s-good" icon="ti-circle-check" title="21 CFR Part 11 compliance" sub="All entries timestamped · user-attributed" count="✓" />
              <SafetyItem icon="ti-file-text" title="Audit entries this week" sub="Across all users and sites" count="248" />
              <SafetyItem tone="s-good" icon="ti-lock" title="Locked records" sub="No modifications after lock" count="4" />
            </div>
          </Card>
          <Card title="Recent admin activity" icon="ti-activity">
            <div>
              <ActivityRow icon="ti-user-plus" ts="Today 07:55 · System">User Carla Voss activated — Sponsor role</ActivityRow>
              <ActivityRow icon="ti-settings" ts="Jun 07 · 09:00 · Admin">Billing fee schedule updated</ActivityRow>
              <ActivityRow icon="ti-lock" ts="Jan 10 · 14:00 · Admin">Study settings locked for amendment</ActivityRow>
              <ActivityRow icon="ti-shield-check" ts="Jan 08 · 10:00 · Admin">Role permissions audit completed</ActivityRow>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
