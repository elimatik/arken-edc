# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-07-13 | **DATA_KEY = `arken_session_store_v71`** (authoritative — check `lib/session-store/SessionStore.tsx:13`).

---

## Current DATA_KEY changelog (recent)

- **v71** — hydrate enrollment targets + freshly-started rebase (study start ~7 days ago), completed/withdrawn banners, query gates on submit+finalize, notification shadow fix
- **v69** — approved_by / approved_at on deltaRecords; audit trail per-tab column redesign
- **v67** — audit trail three-tab architecture (Clinical Data / Query Workflow / System & Security)
- **v66** — CA-0801 + PH-2401 SoE dominant-state seed fix
- **v65** — BR-2502 SoE dominant-state seed fix
- **v64** — VeDDRA coding: Verified status + approved deltaRecords seeded
- **v63** — baseline at session start

---

## What was completed this session (full app review)

### ✅ Dashboard
- Screen failure rate, SAE 24h compliance, data completeness, visit compliance, blinding fixes
- Data completeness color dynamic: ≥80% green (--green-500) · ≥50% #D97706 · <50% red
- Per-site breakdown bars remain blue
- Enrollment at-cap (exactly 3/3) now green, no warning
- Studies list counts only ACTIVE subjects vs target
- Study-level targets: BR-2502=12 · CA-0801=8 · PH-2401=4

### ✅ Data Entry
- Reason-for-change panel, visit window dates in sidebar, out-of-range persistence
- ICF consent form (CA-0801), FCR calculated values (PH-2401)
- SDV shields, required field indicators, ConMed log, form read-only rendering
- Finalize/lock/revert/unlock flows, N/A field option, filter persistence, CSV export
- **Query gate on Submit for review**: open or responded queries block in_work→in_review — mirrored to ScopedForms.tsx
- **Query gate on Finalize**: blocks when queries status !== "resolved" — both SubjectRecord.tsx and ScopedForms.tsx
- **Completed subject banner**: amber warning triangle in sidebar + banner when subject completed but forms still in_work
- **Withdrawn subject handling**: not-started forms auto-marked "Not done" (derived, non-destructive); forms with data stay editable; End of Study always stays open; banner shown. Per GCP — collected data must not be altered.
- **Right-edge shadow fix**: .slide-panel and .delta-panel box-shadow moved to .open state only

### ✅ Animals list
- Overdue indicators, query count badges, screen failures, FCR/CADESI/DART columns, PH-2401 flat list, days on study, withdrawal reason tooltip

### ✅ Queries
- Aging column, templates, re-open flow, edit check rule context, assignment, bulk close, convert EC to query, export
- ⏳ "open — view thread" label on responded queries → should read "Responded — view thread" in amber (OUTSTANDING)

### ✅ Visits
- Deep-link open button, compliance rate, PH terminology, PD flag, reschedule flow
- ⏳ Filter-reactive stat cards OUTSTANDING (unstaged pre-existing change)

### ✅ SDV
- Field count progress, verify all remaining, SDV certificate, CA-0801 blinding, aging indicator, discrepancy stat, coverage badges
- ⏳ Filter-reactive stat cards OUTSTANDING (unstaged pre-existing change)

### ✅ Reports
- 9 new reports, drill-down, tabs, AE/SAE clinical depth, subject data listing, PH production reports
- Custom report builder with AI integration, run mode
- Save modal description: inline styles fix; description shows in run-mode header below title

### ✅ Coding (VeDDRA)
- Status lifecycle: Uncoded → Pending → Coded → Verified (color-distinct chips)
- Role gates: DM/Admin code+verify · CRC/Sponsor read-only · CRA/PI redirect
- Verify sign-off with verifiedBy/verifiedAt; Unverify revert
- Species/study scope correct (no cross-study bleed)
- Source deep-link: sourceFormLink() three-tier fallback, always uses form_id not instance_id
- DATA_KEY v64

### ✅ Schedule of Events (replaces Calendar)
- Nav: "Schedule" (ti-table), route /study/[id]/schedule
- Protocol SoE grid with live dominant-state overlay
- BR-2502: D-14→D42, DART row, re-treatment ◆ conditional, withdrawal period, randomization at D0 only
- CA-0801: V1→V7 visit labels, Day 56/84/98 correctly mapped
- PH-2401: Week 0→6, "Pen" noun, data-honest Wk 6 overdue
- "Today" column removed; replaced with "N overdue · N due today" summary in header
- Footnotes below table; legend bar fixed to bottom
- 1px sticky header gap fix: outline + box-shadow instead of border-collapse

### ✅ Audit Trail
- Three-tab architecture: Clinical Data / Query Workflow / System & Security
- Clinical Data columns: Timestamp · User · Role · Action · Subject · Form · Field · Old value · New value · Reason · Approved by
- Query Workflow columns: Timestamp · User · Role · Action · Subject · Form · Query ID · Text · Link
- System & Security columns: Timestamp · User · Role · Action · Subject · Site · Details
- Per-tab action filter dropdowns (Clinical Data won't show query/system events)
- Query filter: All / Query raised / Query responded / Query resolved
- Query ID chip: plain outlined pill, monospace
- "Manual" chip removed; only "System" chip shown
- Approved by: M. Chen (DM) + timestamp on change_reason rows
- User attribution varied across 4 site CRCs + CRA + DM + PI
- Timestamps include seconds (HH:MM:SS UTC)
- Export: Full audit trail · Current view · By category (zip placeholder)
- "All" tab removed from UI; full export merges all three tabs
- Barn/house label adapts per study: BR="Barn form" · PH="House form" · CA=omitted

### ✅ Settings — complete, no fixes needed
### ✅ Users — complete, no fixes needed

### ✅ Enrollment targets
- All BR-2502 feedlot sites: target 3 each
- Studies list: active-only count vs target
- PH-2401 study target: 4 pens
- At-cap = green, no warning

---

## Still outstanding (carry forward)

1. **"open — view thread" on responded queries** → "Responded — view thread" in amber

2. **Visits + SDV filter-reactive stat cards** (unstaged pre-existing change)

3. **Withdrawn subject audit trail entry** — generate formAudit entries for each auto-marked "Not done" form: event "form_not_done", reason "Subject withdrawn", actor = withdrawing user, timestamp = withdrawal timestamp. Appears in Audit Trail Clinical Data tab under form lifecycle events.

4. **Electronic signature trail** — form_signed events not yet generated from eSignatures.

---

## Architecture notes (unchanged, carry forward)

### ⚠️ Seed source of truth
App hydrates from live Supabase DB (hydrate.ts). seed.sql has drifted ~2k lines — do NOT regenerate. All demo-data changes are session-only in hydrate.ts.
Clear session store: `Object.keys(sessionStorage).filter(k=>k.startsWith('arken_session_store')).forEach(k=>sessionStorage.removeItem(k));location.reload()`

### ⚠️ ?form= deep-link uses form DEFINITION id
?form= selects by form definition ID (inst.form_id), NOT instance ID. Confirmed fix in commit f2146eb. Barn-scoped: /study/${studyId}/barns/${penId}?form=${formDefId}. Site-scoped: /study/${studyId}/sites/${siteId}?form=${formDefId}.

### ⚠️ Settings is a rollup VIEW of CRF data
Settings → Protocol & Amendments Card 3 reads live from site-scoped "Protocol Amendments" CRF form instances (commit 8b2d9cf, DATA_KEY v59).

### ⚠️ Study status lifecycle gates Settings
lib/study-status.ts defines StudyStatus lifecycle + STATUS_LOCKS + isSectionEditable(). All three studies seeded active. Status is component state only. Commit caa87f3.

### ⚠️ CA-0801 blinding — three-guard model
shouldHideArms() / shouldHideArmForSubject() / isSubjectUnblinded() — all in study-config.ts. Wired through every module.

### ⚠️ BR-2502 is a 3-arm trial
T01: Tulathromycin 2.5mg/kg SC, 49d withdrawal
T02: Tulathromycin 5.0mg/kg SC, 84d withdrawal (FARAD)
T03: Saline placebo, no withdrawal

### ⚠️ Three studies
- BR-2502: bovine respiratory, open-label, 4 feedlot sites, 12 active subjects, DART scoring, Site→Barn→Pen→Animal
- CA-0801: canine atopic dermatitis, double-blind, kit-per-visit, CADESI-04 + Pruritus VAS, 8 active subjects
- PH-2401: broiler, pen-level (pen is experimental unit), feed additive, FCR primary endpoint, 4 active pens

---

## Portfolio site status

### Files (keep in same folder as fonts)
- portfolio-hero-v4.html — hero/landing page
- arken-case-study.html — Arken EDC case study
- EditorNote-Italic.otf + EditorNote-Regular.otf — custom fonts
- Elisa_Tron.png — embedded as base64 in hero
- arken-field-animation.html — field interaction animation

### Hero page current state
- Layout: nav · hero (200px padding) · 3-card grid (Arken left 2-rows / About top-right / Prelude bottom-right) · footer
- Fonts: Editor's Note Italic → "Senior Product Designer" · Editor's Note Regular → card titles + "for FDA-regulated clinical trial software" · Inter → everything else · JetBrains Mono → meta lines
- Colors: bg #F8F8F8 · ink #1D1D1D · terracotta #B85C35
- Grid: 1.62fr 1fr · 260px 260px · 3px gap · max-width 1160px
- Arken card: dark #1A1B1F, media placeholder, text fixed to bottom
- About card: terracotta, photo embedded as base64, no gradient
- Prelude card: warm surface, justify-content: end

### Case study page current state
- Sections: Context · System (12-module map) · Audit Trail deep dive · Study Types deep dive · Role Workflows deep dive · Feature Highlights · Design Principles · Outcomes · Reflection · CTA
- Sticky sidebar: 9 section links, scroll spy, click sets active immediately
- Max-width: 1240px

### Outstanding portfolio work
- Add Problem section (before Context) — content written and ready
- Add Research section (after Problem) — competitive analysis of 5 EDCs, three systemic problems (log dump · proximity gap · role blindness), role-needs mapping
- Rebuild case study with full structure: Context · Problem · Research · Key Insights · Building the Interface · Challenges · Reflection
- Add Impact at a glance strip: 12 modules · 6 roles · 25 audit event types · 3 species
- Arken card media: swap placeholder with screenshot or field animation video

### Production fork plan
Once portfolio complete → tag v1.0-portfolio → fork to arken-edc-production. Do not start production work on portfolio repo.

---

## Design system tokens

```css
:root {
  --color-nav-bg:#1A1F2E; --color-nav-hover:#2C3248; --color-nav-icon:#8aafc8;
  --color-page-bg:#FBFBFB; --color-surface:#FFFFFF;
  --color-border:#E8E8E6; --color-border-subtle:#F0F0EE;
  --color-text-primary:#2C2D33; --color-text-secondary:#4F535B;
  --color-text-tertiary:#6D7480; --color-text-placeholder:#C4C4C2;
  --color-link:#3D4A5C; --color-hover-bg:#F0F0EE;
  --color-cta-bg:#1A1F2E; --color-cta-hover:#2C3248; --color-focus-ring:#3D8FE0;
  --amber-50:#FFF8E7; --amber-200:#F5B830; --amber-700:#D97706;
  --red-50:#FFF0F0; --red-200:#EC8585; --red-600:#B52626;
  --green-50:#EEFAF4; --green-200:#58BC88; --green-500:#22C55E; --green-600:#1A6B47;
  --blue-50:#E8F4FF; --blue-200:#7AB8EE; --blue-600:#1760A8;
  --purple-50:#F0EEFF; --purple-200:#A9A3EC; --purple-600:#534AB7;
  --slate-50:#EEF1F6; --slate-200:#8AA0B8; --slate-600:#3D5A78;
  --font-sans:'Roboto',system-ui,sans-serif;
  --font-mono:'Roboto Mono',monospace;
  --text-xs:11px; --text-sm:12px; --text-base:14px; --text-lg:16px;
  --text-xl:18px; --text-3xl:24px;
  --weight-medium:500; --weight-bold:700;
  --radius-sm:2px; --radius-md:4px; --radius-lg:6px; --radius-full:9999px;
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:20px; --space-6:24px; --space-8:32px;
  --tracking-caps:0.07em;
}
```

---

## What to say in a new conversation

Paste this file and say:

> "This is the handoff doc for Arken EDC. DATA_KEY is v71. We're continuing the full app review and portfolio site build. Read the handoff fully, then pick up with: (1) Visits + SDV filter-reactive stat cards, (2) Responded — view thread label fix, (3) case study rebuild with full research-backed structure."
