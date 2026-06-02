# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-06-02 | Phase: 1 — Design System (Sessions 1–10 complete)

---

## What this project is

Arken is a web-based Electronic Data Capture (EDC) platform for animal clinical trials. Portfolio project by a senior UX/Product Designer targeting staff-level roles in US healthtech. First purpose-built EDC for animal studies — no equivalent product exists.

**Platform scope:** Core EDC engine + modular study types.
**Flagship study:** AK-2401 — BRD Cattle Phase II (prototype data throughout)
**Planned modules:** Arken Canine · Arken Aquatic · Arken Agri · Arken Primate

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Not set up yet — Phase 4 |
| Styling | CSS variables (token file) | Never hardcode hex values |
| Database | Supabase (Postgres) | Not set up yet — Phase 4 |
| Fonts | Google Fonts — Roboto + Roboto Mono | Always loaded via link tag |
| Icons | Tabler Icons (CDN) | `ti ti-*` class names |

**Current phase: static HTML prototypes only. No framework, no backend, no npm.**

---

## File structure

```
arken-edc/
├── CONTEXT.md                    ← this file — paste at session start
├── DECISIONS.md                  ← all design decisions with rationale
├── tokens/
│   ├── arken-tokens.css          ← SOURCE OF TRUTH for all tokens
│   └── arken-tokens.json
└── components/
    ├── 01-form-field-group.html  ← All input types + composite fields
    ├── 02-badge.html             ← Outline / filled / role / count badges
    ├── 03-data-table.html        ← List-table pattern (identical to 14)
    ├── 04-app-shell.html         ← Nav + topbar, collapsible, role-based
    ├── 05-metric-card.html       ← 6 accent variants
    ├── 06-alert-banner.html      ← 5 severity variants + dismissible
    ├── 07-panel-card.html        ← Dashboard content patterns
    ├── 08-form-field-flag.html   ← Flag states — 5 sections (see below)
    ├── 09-form-sidebar.html      ← Visit navigator + status icons
    ├── 10-subject-header.html    ← One-line layout, all status variants
    ├── 11-audit-trail-full.html  ← Full-page audit trail
    ├── 12-form-audit-trail.html  ← Form-level audit + signature track
    ├── 13-query-thread.html      ← Query lifecycle + Remarks + Delta (Δ)
    ├── 14-list-pages.html        ← Study→Site→Barn→Pen→Animal drill-down
    ├── 15-queries-list.html      ← Study-wide queries list
    ├── 16-visits.html            ← Today's visits — flat urgency table
    ├── 17-calendar.html          ← Protocol Schedule of Events (SoE matrix)
    ├── 18-sdv.html               ← SDV worklist
    ├── 19-form-sdv.html          ← Form in SDV + Queries combined mode
    ├── 20-batch-entry.html       ← Batch entry: form picker + grid
    └── 21-reports.html           ← Report library + output + AI builder
```

---

## Component 08 — Flag sections

Five sections covering all field states:
1. **Query states** — idle · raised · responded · resolved
2. **Edit check states** — idle · raised · responded · resolved
3. **SDV states** — not required · pending · verified · queried during SDV
4. **Critical / SAE** — red tint, always-visible flag, humane endpoint
5. **Locked fields** — lock icon, no actions

---

## Component 13 — Query + Delta system

**Query lifecycle:** Raised → Responded → Resolved (3 states, no Closed)
**Field states:**
- Raised: `field-input query` (amber tint) + filled amber flag + query text
- Responded: `field-input` (default) + filled amber flag + "Q-001 open — view thread"
- Resolved: `field-input` (default) + green flag+check (`flag-query-resolved-icon`) + "Q-001: Corrected — query resolved"

**Delta (Δ) system:**
- Dotted red Δ = change required (field edited, reason not yet provided)
- Outlined blue Δ = answered (CRC submitted reason, awaiting CRA review)
- Filled green Δ = reviewed/resolved (CRA approved)
- Blocks form submit until all deltas are reviewed
- Panel mirrors query thread: field context (old→new) + thread + compose

**Remarks dropdown:** checkbox behaviour — Queries and SDV mode independently toggleable.
When queries off: active flags (flagged/resolved) stay; inactive flags hide.
When SDV off: unverified icons hide; verified icons stay.

---

## Component 19 — Form SDV

Same form as 13, SDV mode layered on top via Remarks toggle.
- `ti-circle-check` (outline) = unverified
- `ti-circle-check-filled` (blue) = verified
- SDV progress bar shows only when SDV mode active
- "Submit for review" → "Verify all" when SDV on
- "Run validations" → "Mark SDV complete" when SDV on
- All 5 fields have SDV buttons: temp, heart, resp, weight, clin
- No query flow — SDV-only file

---

## Component 20 — Batch entry

**Two views:** Form picker → Entry grid
**Entry points:** Nav (form picker first) + pen/barn list page (scope pre-set)
**Pen-level defaults:** Capture date, scale ID — shared across all animals in pen, entered once
**Apply-to-all toggle:** Per column, propagates value to all animals
**Optional fields:** `optional:true` flag — excluded from required count/status
**RFC bar:** Amber bar at bottom when editing previously saved cells
**Save modes:** Form-level (submit button) / Field-level (auto-save on blur)
**Status badges:** Empty · partial (X/N required) · Ready · Error

---

## Component 21 — Reports

**Three views:** Library → Report output → AI report builder

**Library:** 5 categories — Study progress · Data quality · SDV · Safety · Audit
Custom reports section appears at top when AI-generated reports are saved.

**AI report builder:** Two-column layout (chat left, report right).
3-turn simulated conversation → generates report with KPIs + tables.
Filters (site/visit/date) appear above the report content once generated.
"Add to library" saves to custom reports section.

---

## 10 RULES — Apply to every component

1. Never hardcode hex — use token variables
2. No field shadow — border only
3. Three severity levels — never merge amber/orange/red
4. `text-transform: uppercase` — never `font-variant: small-caps`
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders everywhere · 4px base radius
7. Fields and buttons: 32px height
8. Links: text underlined, icon NOT underlined
9. Every component file is self-contained — declare all tokens in `:root`
10. Topbar = study pill only. Breadcrumb = full navigation path.

---

## Remaining to build

- **22-coding.html** — MedDRA/VeDRA adverse event coding (DM workflow)
- **23-invoices.html** — Billable events, site-level overrides
- **24-settings.html** — Settings + Roles (most complex, last)
- Living style guide (GitHub Pages)

---

## Component 22 — Coding

**Role:** Data Manager (DM) — adverse event and medical history term coding.

**Dictionary support:** VeDRA v3.1 (veterinary, default) + MedDRA v26.1 (cross-reference)

**Four-column hierarchy** — kept separate for multi-level safety analysis:

| Column | Description | Example |
|---|---|---|
| **LLT** | Low-level term — specific clinical sign | ISR swelling bovine |
| **PT** | Preferred term | Injection site reaction |
| **HLT** | High-level term — grouped signs | Local tissue reactions |
| **SOC** | System organ class — broadest category | Skin and subcutaneous tissue disorders |

Plus **Species / Breed** column — critical for veterinary cross-species analysis.

**Auto-code logic:**
- 9 keyword rules with base confidence scores (79–95%)
- Multi-keyword hits increase confidence proportionally
- ≥80% → `coded` automatically
- <80% → `needs review` (orange warning, flagged for DM)
- Unmatched → stays `pending`
- Processes with visual stagger (180ms per term) so progress is visible

**Coding panel (slide-in):**
- Verbatim term prominently displayed
- Dictionary toggle (VeDRA / MedDRA)
- Search auto-fires on verbatim term at open
- Results ranked by match % (green ≥85% · amber ≥65% · red <65%)
- Each result shows: PT · code · LLT · full SOC › HLGT › HLT path
- Drill-into-hierarchy button (placeholder)
- Confirm code → saves all four hierarchy fields to the row

**All columns sortable** — asc → desc → reset. Icon updates after render (fresh DOM refs).
