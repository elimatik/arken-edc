# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-06-06 | Phase: 1 — Design System (Sessions 1–14 complete)

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
    ├── 01-form-field-group.html
    ├── 02-badge.html
    ├── 03-data-table.html
    ├── 04-app-shell.html
    ├── 05-metric-card.html
    ├── 06-alert-banner.html
    ├── 07-panel-card.html
    ├── 08-form-field-flag.html
    ├── 09-form-sidebar.html
    ├── 10-subject-header.html
    ├── 11-audit-trail-full.html
    ├── 12-form-audit-trail.html
    ├── 13-query-thread.html
    ├── 14-list-pages.html
    ├── 15-queries-list.html
    ├── 16-visits.html
    ├── 17-calendar.html
    ├── 18-sdv.html
    ├── 19-form-sdv.html
    ├── 20-batch-entry.html
    ├── 21-reports.html
    ├── 22-coding.html
    ├── 23-invoices.html
    ├── 24-inventory.html
    └── 25-settings.html          ← COMPLETE as of session 14
```

---

## 10 RULES — Apply to every component

1. Never hardcode hex — use token variables
2. No field shadow — border only
3. Three severity levels — never merge amber/orange/red
4. `text-transform: uppercase` — never `font-variant: small-caps`
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders everywhere · 4px base radius
7. Fields and buttons: 32px height (36px in settings forms)
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
Fee schedule + site invoices + invoice preview. Currency per site column. Three trigger modes: Form completion · Field value (builder) · Study milestone. Site-level overrides. Invoice detail panel with query-style status bar.

### 24 — Inventory
Shipments · Inventory · Dispensing log · Vial detail · Reconciliation. Site filter in topbar. Return modal with condition-based routing. Reconciliation by treatment group with Variance column.

### 25 — Settings (complete — session 14)
Eight sections: Study settings · Study preferences · Roles · Form permissions · Randomization · Inventory · Audit & Signatures · Billing. See DECISIONS.md sessions 13–14 for full detail.

---

## Topbar site picker pattern (from file 05)
```html
<button class="tb-site" onclick="toggleSiteDropdown()" id="tb-site-btn">
  All sites <i class="ti ti-chevron-down"></i>
</button>
<div id="site-dropdown">
  <button class="site-dd-item active" onclick="setSiteFilter('')">All sites</button>
  <button class="site-dd-item" onclick="setSiteFilter('Austin')">Austin</button>
</div>
```
`tb-site`: plain white text + chevron, no border/background. Dropdown: white surface, active = blue-600 + blue-50. Close on outside click.

---

## Remaining to build

- **Living style guide:** GitHub Pages component reference — the final item.
