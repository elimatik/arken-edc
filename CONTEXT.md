# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-06-04 | Phase: 1 — Design System (Sessions 1–12 complete)

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
├── CONTEXT.md                    ← this file
├── DECISIONS.md                  ← all design decisions with rationale
├── tokens/
│   ├── arken-tokens.css
│   └── arken-tokens.json
└── components/
    ├── 01-form-field-group.html  ← All input types + composite fields
    ├── 02-badge.html             ← Outline / filled / role / count badges
    ├── 03-data-table.html        ← List-table pattern
    ├── 04-app-shell.html         ← Nav + topbar, collapsible, role-based
    ├── 05-metric-card.html       ← 6 accent variants + tb-site topbar pattern
    ├── 06-alert-banner.html      ← 5 severity variants + dismissible
    ├── 07-panel-card.html        ← Dashboard content patterns
    ├── 08-form-field-flag.html   ← Flag states — 5 sections
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
    ├── 21-reports.html           ← Report library + output + AI builder
    ├── 22-coding.html            ← VeDRA/MedDRA AE coding — DM workflow
    ├── 23-invoices.html          ← Fee schedule + site invoices + preview
    └── 24-inventory.html         ← Shipments, inventory, dispensing, reconciliation
```

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
10. Topbar = study pill + site dropdown. Breadcrumb = full navigation path.

---

## Component summaries

### 08 — Flag sections
Five sections: Query states · Edit check states · SDV states · Critical/SAE · Locked fields

### 13 — Query + Delta system
**Query lifecycle:** Raised → Responded → Resolved (3 states, no Closed)
**Delta (Δ):** Dotted red = change required · Outlined blue = answered · Filled green = reviewed
**Remarks dropdown:** Queries and SDV independently toggleable

### 22 — Coding (DM workflow)
VeDRA v3.1 (veterinary, default) + MedDRA v26.1. Four-column hierarchy: LLT · PT · HLT · SOC. Plus Species/Breed column. Auto-code: ≥80% confidence → coded, <80% → needs review. Coding panel slide-in with match scores.

### 23 — Invoices
**Fee schedule tab:** Event types across 4 sections, sortable. Currency header row — one currency selector per site column, all cells in that column use that currency. Three trigger modes: Form completion (grouped dropdown) · Field value (builder with preview) · Study milestone (dropdown). Site-level overrides per event with checkbox + rate input + currency dropdown. Override saves correctly on first save (SITES symbol synced before renderFee).
**Site invoices tab:** KPI strip, invoice table (sortable), status badge chips in detail panel (query-style: badge + desc + date). Paid invoices hide the primary action button. Money columns left-aligned.
**Invoice preview tab:** Print-ready document with billing contact pulled from SITES data.

### 24 — Inventory
**Shipments tab (first):** Empty state → "Receive first shipment" centred button. Modal: shipment date + receive date + CSV upload zone → Import CSV → review table (vial ID, vol, conc, expiry, treatment group, received, usable). Confirm → row appears as confirmed, expandable, view/download only. "Receive shipment" sticky button at bottom of list.
**Inventory tab:** KPI cards (clickable status filters), treatment group filter, expiry date col (11px), current volume as plain number. Site dropdown in topbar (dark theme, `tb-site` pattern from file 05).
**Dispensing log tab:** Pulled from form data. Unit status chips: Back in storage (green), Returned to sponsor (purple), At home (blue), Removed (red). Return icon (⟳) → return modal (date, volume remaining, condition, sponsor return date, manual removal override checkbox).
**Vial detail tab:** Full lifecycle timeline — received · dispensed · returned · removed · sponsor return. KPI strip + colour-coded dot timeline.
**Reconciliation tab:** Per treatment group: #Received, #Usable, #Removed, #Dispensed, #Returned, Variance (= received − returned − removed), Auto status badge (Balanced/Outstanding), Confirmation dropdown, Notes. All rows neutral white background.

---

## Topbar site picker pattern (from file 05)
```html
<button class="tb-site" onclick="toggleSiteDropdown()" id="tb-site-btn">
  All sites <i class="ti ti-chevron-down"></i>
</button>
<div id="site-dropdown">
  <button class="site-dd-item active" onclick="setSiteFilter('')">All sites</button>
  <button class="site-dd-item" onclick="setSiteFilter('Austin')">Austin</button>
  ...
</div>
```
`tb-site`: plain white text + chevron, no border/background. Dropdown: white surface, `site-dd-item` rows, active = blue-600 + blue-50.

---

## Remaining to build

### 25-settings.html — Settings hub (next)
| Section | Content |
|---|---|
| **Role creation** | Define roles (CRC, CRA, PI, DM, PM, Admin), permissions per role |
| **Form permissions** | Which roles can view / edit / sign / lock each form |
| **Study settings** | Protocol config, drug info, site list, holdback %, study dates |
| **Randomization** | Treatment groups, randomization list upload, blinding config |
| **Inventory settings** | Connect dispensing form fields to inventory |
| **Audit trail** | Signature requirements, reason-for-change config |
| **Billing settings** | Fee schedule (moved from invoices tab), currency per site |

### Living style guide
GitHub Pages component reference — last item.
