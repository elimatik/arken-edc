# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-05-29 | Phase: 1 — Design System (Sessions 1–5 complete)

---

## What this project is

Arken is a web-based Electronic Data Capture (EDC) platform for animal clinical trials. Portfolio project by a senior UX/Product Designer targeting staff-level roles in US healthtech. First purpose-built EDC for animal studies — no equivalent product exists.

**Platform scope:** Core EDC engine + modular study types.
**Flagship module (v1):** Arken Canine — canine oncology.
**Planned modules:** Arken Aquatic · Arken Agri · Arken Primate

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Not set up yet — Phase 4 |
| Component library | shadcn/ui | Components must use Arken tokens |
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
│   └── arken-tokens.json         ← Tokens Studio / Figma import (v2.1)
├── docs/
│   └── brand-brief.md
└── components/
    ├── 01-form-field-group.html  ← inputs, selects, composite fields ✓
    ├── 02-badge.html             ← outline / filled / role / count ✓
    ├── 03-data-table.html        ← sortable table, all states ✓
    ├── 04-app-shell.html         ← nav + topbar, canonical shell ✓
    ├── 05-metric-card.html       ← 6 accent variants ✓
    ├── 06-alert-banner.html      ← 5 severity variants + dismissible ✓
    ├── 07-panel-card.html        ← all dashboard content patterns ✓
    ├── 08-form-field-flag.html   ← flag states + SDV badge overlay ✓
    ├── 09-form-sidebar.html      ← visit navigator + 6 status icons ✓
    ├── 10-subject-header.html    ← all status variants + switcher popover ✓
    ├── 11-audit-trail-full.html  ← full-page audit trail, table layout ✓
    ├── 12-form-audit-trail.html  ← form-level panel + form header ✓
    └── 13-query-thread.html      ← query lifecycle + Remarks dropdown ✓
```

**Self-contained rule:** Every component file declares all tokens it uses in its own `:root`. Never relies on arken-tokens.css being linked.

---

## Token imports — required in every HTML file

```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
```

---

## Design spec — locked

| Property | Value |
|---|---|
| Font (UI) | Roboto 400 / 500 / 700 |
| Font (data, IDs, timestamps) | Roboto Mono 400 / 500 |
| Base font size | 14px |
| Subject ID | 24px / 500 / Roboto Mono (`--text-3xl`) |
| Page / screen titles | 24px / 500 |
| Form section titles | 12px / 500 / `text-transform: uppercase` / `letter-spacing: 0.07em` |
| Field height | 32px |
| Button height | 32px |
| Border radius | 4px base (`--radius-md`). Panels: 6–8px. Pills: 9999px |
| Stroke | 1px everywhere. Focus ring: 3px |
| Field shadow | None — border only |
| Select arrow | Chevron-right SVG |
| Small caps | **NEVER** — use `text-transform: uppercase` instead |
| Role colours | **NONE** — all roles use `--slate-600` |

---

## Colour rules — CRITICAL

### Accessibility split rule
| Ramp | Decoration (-600) | Text (-700) | Contrast |
|---|---|---|---|
| Amber | `#B87800` | `#8A5C00` | 5.9:1 ✓ |
| Orange | `#C94C0C` | `#A33A08` | 5.96:1 ✓ |
| Red | `#B52626` | `#B52626` | passes ✓ |

### Text colour scale
```
--color-text-primary:   #2C2D33
--color-text-secondary: #4F535B
--color-text-tertiary:  #6D7480   ← minimum for body text on white (4.71:1)
--color-text-placeholder: #C4C4C2 ← decoration only, never body text
```

### Key structural tokens
```
--color-nav-bg:    #1A1F2E
--color-page-bg:   #FBFBFB
--color-surface:   #FFFFFF
--color-border:    #E8E8E6
--color-border-subtle: #F0F0EE
--color-cta-bg:    #1A1F2E
--color-hover-bg:  #F0F0EE
--color-focus-ring: #3D8FE0
```

---

## Severity scale — three levels, never collapse

| Level | Colour | When |
|---|---|---|
| Warning | Amber | Draft, incomplete, acknowledge required, query open |
| Alert | Orange | Overdue, discrepancy, missing data |
| Critical | Red | SAE, humane endpoint, critical finding |

---

## App shell — canonical (04-app-shell.html)

- Sidenav: 74px · full-width items · 50px min-height · no border-radius
- Inactive icon: `#8aafc8` · Active: `#FFFFFF`
- Topbar: 56px · all text `#FFFFFF` · study pill has 1px border `#525D73`
- Role chip: plain white text + chevron-right, no colour dot

---

## Subject header — one-line layout (10-subject-header.html)

```
[species emoji]  AUSB1P1-01  ⇄  [Randomized]  Female · 4yr · Hereford · 400kg · Group A    [Manage ▾]
```

- Subject ID: `--text-3xl` (24px) / Roboto Mono
- Species icon: optional emoji, 22px, configured in settings
- Switch button `⇄`: opens 320px popover with subject list + search
- Status badge: no dot — text only
- Manage button: secondary, dropdown with Copy link · Add unscheduled visit · Print summary · Export data
- Critical state: 3px red left border + red-50 background

---

## Form sidebar status states (09-form-sidebar.html)

| State | Icon | Colour |
|---|---|---|
| Empty | 1.5px dashed circle | `#C4C4C2` |
| In-Work | ¼ filled SVG | `#4492CB` |
| In-Review | ½ filled SVG | `#CF811E` |
| Reviewed | ¾ filled SVG | `#BF65D5` |
| Finalized | Light green circle + check | `--green-600` |

SVG icons: `width="16" height="16" viewBox="2 2 16 16"`
Group border: always slate except all-finalized → green.
Issue badge: single badge, most severe colour, total count.

---

## Flag icon states (08-form-field-flag.html)

| State | Icon | Colour |
|---|---|---|
| Default | `ti-flag` outline | `#C4C4C2` |
| Flagged | `ti-flag-filled` | `--orange-700` `#A33A08` |
| SDV verified | `ti-flag-filled` + checkmark overlay (bottom-right, no circle) | `--blue-600` |
| Locked | No button | — |

---

## Query thread (13-query-thread.html)

**Lifecycle:** Raised → Responded → Resolved → Closed (DM only, optional)

**Field state:** Query text inline below field, amber-700, underlined, clickable. `Q-001: [text]`. Max 2 lines then `…`. Resolved: default field + green "Corrected" text, still clickable.

**Value diff:** Black strikethrough (old) `→` green (new). No chip wrappers. Monospace.

**Panel order (top to bottom):** Header → Status bar → Field context → Thread → Compose

**Remarks button:** Secondary button, opens single-choice dropdown (Queries · SDV mode). Selecting active mode deselects it. Label updates to "Remarks: queries" etc.

---

## Form header — action set (12-form-audit-trail.html)

- **Remarks** (secondary, dropdown) → activates Queries or SDV mode
- **Submit for review** (secondary)
- **Run validations** (primary)
- **⋮ overflow** → Audit trail · Annotated CRF toggle · Role permissions toggle · Print form · Export form data · Lock form (danger)

---

## Audit trail surfaces

| Surface | Scope | Access | Layout |
|---|---|---|---|
| Slide-in panel (10, 12) | Subject or form | Header button / form ⋮ | Timeline |
| Full page (11) | Study-wide | Sidebar nav Audit | Table |

**Full page columns:** Timestamp · Type · Subject · Form·Field · Change · User · Reason
**Type chips:** Entry (green) · Edit (slate) · Query (amber) · SDV (blue) · Sign (green) · Lock (purple) · Status (blue) · SAE (red)
**Entry vs Edit:** Entry = first data recorded (no reason required). Edit = change to existing data (reason required by FDA).

---

## 10 rules for every prompt

1. Never hardcode hex — use token variables
2. No field shadow — border only
3. Three severity levels — never merge amber/orange/red
4. `text-transform: uppercase` — never `font-variant: small-caps`
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders everywhere
7. 4px base radius (`--radius-md`)
8. Fields and buttons: 32px height
9. Links: text underlined, icon NOT underlined
10. Every component file is self-contained — declare all tokens in `:root`

---

## Deferred / next sessions

- **Living style guide** — all 13 components on one published page (GitHub Pages)
- **Signature track full page** — follows audit trail pattern
- **CRF mode toggle** — annotated field names + role permissions overlay (form header)
- **Query list page** — all open queries across study, filterable
- **GBDE** — group batch data entry for aquatic/agricultural
- **Dark mode**
