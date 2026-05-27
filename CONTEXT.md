# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-05-27 | Phase: 1 — Design System (Sessions 1–4 complete)

---

## What this project is

Arken is a web-based Electronic Data Capture (EDC) platform for animal clinical trials. Portfolio project by a senior UX/Product Designer targeting staff-level roles in US healthtech. First purpose-built EDC for animal studies — no equivalent product exists.

**Platform scope:** Core EDC engine + modular study types.
**Flagship module (v1):** Arken Canine — canine oncology studies.
**Planned modules:** Arken Aquatic · Arken Agri · Arken Primate

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Not set up yet — Phase 4 |
| Component library | shadcn/ui | Components must use Arken tokens |
| Styling | CSS variables (token file) | Never hardcode hex values |
| Database | Supabase (Postgres) | Not set up yet — Phase 4 |
| Auth | Supabase Auth | Not set up yet — Phase 4 |
| Deployment | Vercel free tier | Not set up yet — Phase 4 |
| Design | Figma + Tokens Studio | Tokens mirror the CSS file |
| Fonts | Google Fonts — Roboto + Roboto Mono | Always loaded via link tag |
| Icons | Tabler Icons (CDN) | `ti ti-*` class names |

**Current phase: static HTML prototypes only. No framework, no backend, no npm.**

---

## File structure

```
arken-edc/
├── CONTEXT.md                   ← this file — paste at session start
├── DECISIONS.md                 ← all design decisions with rationale
├── tokens/
│   ├── arken-tokens.css         ← SOURCE OF TRUTH for all tokens
│   └── arken-tokens.json        ← Tokens Studio / Figma import (v2.1)
├── docs/
│   └── brand-brief.md
└── components/
    ├── 01-form-field-group.html  ← all input types + composite fields ✓
    ├── 02-badge.html             ← outline / filled / role / count badges ✓
    ├── 03-data-table.html        ← sortable table, all states ✓
    ├── 04-app-shell.html         ← nav + topbar, canonical shell ✓
    ├── 05-metric-card.html       ← 6 accent variants ✓
    ├── 06-alert-banner.html      ← 5 severity variants + dismissible + stacked ✓
    ├── 07-panel-card.html        ← all content patterns from BRD screens ✓
    ├── 08-form-field-flag.html   ← flag states + SDV badge overlay ✓
    ├── 09-form-sidebar.html      ← visit navigator + 6 status icons ✓
    └── 10-subject-header.html    ← all status variants + slide-in panel ✓
```

---

## Token imports — required in every HTML file

```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css">
```

Inline the token CSS block (copy from `arken-tokens.css`) — components are self-contained.

---

## Design spec — CURRENT (locked)

| Property | Value |
|---|---|
| Font (UI) | Roboto 400 / 500 / 700 |
| Font (data, IDs, timestamps) | Roboto Mono 400 / 500 |
| Base font size | 14px |
| Page / screen titles | 24px / 500 / normal case |
| Form section titles | 12px / 500 / `text-transform: uppercase` / `letter-spacing: 0.07em` |
| Table column headers | Same as form section titles |
| Breadcrumbs | 12px / 400 — link text underlined, icon NOT underlined |
| Field height | 32px (inputs and selects) |
| Button height | 32px |
| Border radius | 4px base (`--radius-md`). Panels: 6–8px. Pills: 9999px |
| Stroke / border | 1px always. Never 0.5px, never 2px (except focus ring 3px) |
| Field shadow | None — border only |
| Focus ring | `box-shadow: 0 0 0 3px rgba(61,143,224,0.35)` |
| Select arrow | Chevron-right SVG, not browser default |
| Mode | Light primary. Dark planned, not built |

**REMOVED: `font-variant: small-caps`** — replaced with `text-transform: uppercase` everywhere. Inconsistent on Windows Chrome.

---

## Colour rules — CRITICAL

### Accessibility split rule
Every colour ramp has a decoration value (-600) and a text value (-700):
- **-600**: decoration only — borders, top bars, progress bars, filled dots, badge backgrounds. No contrast requirement.
- **-700**: all text uses — badge labels, hint text, status text, sub-labels. Must pass WCAG AA.

| Colour | Decoration | Text | Contrast on tinted bg |
|---|---|---|---|
| Amber | `--amber-600` #B87800 | `--amber-700` #8A5C00 | 5.9:1 ✓ |
| Orange | `--orange-600` #C94C0C | `--orange-700` #A33A08 | 5.96:1 ✓ |
| Red | `--red-600` #B52626 | `--red-600` #B52626 | passes at all sizes ✓ |

### Text colour scale (softened from original)
```css
--color-text-primary:   #2C2D33   /* body, table cells, field values */
--color-text-secondary: #4F535B   /* labels, secondary content */
--color-text-tertiary:  #6D7480   /* hints, placeholders, metadata */
--color-text-placeholder: #C4C4C2
```

### Role colours — REMOVED
All `--role-*` tokens resolve to `--slate-600` (#3D5A78). Platform supports user-created roles — fixed colour mapping breaks immediately. Role text label is the only signal needed.

---

## Key tokens

```css
/* Structural */
--color-nav-bg:    #1A1F2E   /* sidebar + topbar */
--color-page-bg:   #FBFBFB   /* outermost bg */
--color-surface:   #FFFFFF   /* cards, panels, inputs */
--color-border:    #E8E8E6   /* all 1px borders */
--color-border-subtle: #F0F0EE  /* row separators inside panels */

/* Interaction */
--color-cta-bg:    #1A1F2E
--color-cta-hover: #2C3248
--color-hover-bg:  #F0F0EE
--color-focus-ring: #3D8FE0

/* Status trios — always use -text, -bg, -border together */
--status-warning-*   /* amber  — query open, draft, acknowledge required */
--status-alert-*     /* orange — overdue, discrepancy */
--status-critical-*  /* red    — SAE, humane endpoint, critical finding */
--status-active-*    /* blue   — enrolling, on track */
--status-success-*   /* green  — complete, validated */
--status-pending-*   /* purple — awaiting action */
--status-info-*      /* slate  — neutral informational */

/* Field data states */
--field-default-*    /* clean input */
--field-query-*      /* amber  — query raised */
--field-disc-*       /* orange — edit check fail */
--field-critical-*   /* red    — SAE-related */
--field-clean-*      /* green  — SDV complete */
--field-locked-*     /* grey   — record locked */
```

---

## Severity scale — three levels, never collapse

| Level | Colour | When |
|---|---|---|
| Warning | Amber | Draft, incomplete, acknowledge required |
| Alert | Orange | Overdue, missing data, visit window closing |
| Critical | Red | SAE, humane endpoint, critical finding, expired |

---

## Roles

| Role | Abbrev | What they do |
|---|---|---|
| Principal Investigator | PI | Study oversight, e-signature, data review |
| Clinical Research Coordinator | CRC | Day-to-day data entry, query resolution |
| Clinical Research Associate | CRA | Source data verification, raising queries |
| Data Manager | DM | Edit checks, discrepancy management, lock |
| Project Manager | PM | Study progress, milestones, dashboards |
| System Admin | Admin | User management, study configuration |
| Field Technician | Field | Offline tablet data entry |

All roles display in **slate** — no colour differentiation. Platform supports custom user-defined roles.

---

## App shell spec (canonical — 04-app-shell.html)

- **Sidenav:** 74px wide · full-width items · 50px min-height · no border-radius
- **Inactive icon/label:** #8aafc8 · Active: #FFFFFF
- **Topbar:** 56px · all text #FFFFFF · study pill has 1px border #525D73
- **Role chip:** plain white text + chevron-right, no colour dot
- **Nav item active:** `--color-nav-active-bg` (#2C3248) background

---

## Form sidebar status states (09-form-sidebar.html)

| State | Icon | Colour |
|---|---|---|
| Empty | 1.5px dashed circle | #C4C4C2 |
| In-Work | ¼ filled SVG | #4492CB |
| In-Review | ½ filled SVG | #CF811E |
| Reviewed | ¾ filled SVG | #BF65D5 |
| Finalized | Light green circle + check | `--green-600` |

SVG icons: `width="16" height="16" viewBox="2 2 16 16"` (crops 20px artboard to fill 16px frame)

**Issue badge on form group:** single badge, most severe colour, total count. Red = any critical, orange = discrepancy, amber = queries only.

**Group border:** always `--slate-200` except all-finalized → `--green-400`.

---

## Flag icon states (08-form-field-flag.html)

| State | Icon | Colour |
|---|---|---|
| Default | `ti-flag` outline | #C4C4C2 muted |
| Flagged | `ti-flag-filled` | orange-700 #A33A08 |
| SDV verified | `ti-flag-filled` + checkmark overlay (bottom-right, no circle) | blue-600 #1760A8 |
| Locked | No flag button | — |

Flagged hover → darkens to amber-800. Never lightens.

---

## Slide-in panel (10-subject-header.html)

- **Width:** 480px, fixed right
- **Shared shell** for audit trail + signature track (tabbed)
- Overlay behind panel, closes on click or ✕
- Audit trail: timeline with coloured dots (red=SAE, amber=query, slate=field, blue=status, green=lock)
- Signature track: form sign-off chain with status icons

---

## Subject header action set

| Action | Type | When |
|---|---|---|
| Audit trail | Secondary button | Always |
| ⋮ overflow | Ghost icon button | Always |
| SAE form | Red secondary button | Critical state only |

**Overflow contents:** Signature track · [sep] · Copy link · Add unscheduled visit · Print subject summary · Export subject data · [sep] · Lock subject (danger, red, last)

---

## Rules for every prompt

1. Never hardcode hex — always use token variables
2. Never shadow on fields — border only
3. Three severity levels (amber/orange/red) — never merge
4. `text-transform: uppercase` + `letter-spacing: 0.07em` — never `font-variant: small-caps`
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders everywhere
7. 4px base radius — `--radius-md`
8. Fields and buttons: 32px height
9. Links: text underlined, icon NOT underlined
10. Role colours: slate only — no per-role colours
