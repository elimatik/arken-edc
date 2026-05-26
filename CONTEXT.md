# Arken EDC — Project Context
**Paste this at the start of every Claude Code session.**
Last updated: 2026-05-25 | Phase: 1 — Design System (Session 1 complete)

---

## What this project is

Arken is a web-based Electronic Data Capture (EDC) platform for animal clinical trials. It is a portfolio project built by a senior UX/Product Designer targeting staff-level roles in healthtech. The goal is to be the first purpose-built EDC for animal studies — no equivalent product exists on the market.

**Platform scope:** Core EDC engine + modular study types.
**Flagship module (v1):** Arken Canine — canine oncology studies.
**Planned modules:** Arken Aquatic · Arken Agri · Arken Primate

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Not set up yet — Phase 4 |
| Component library | shadcn/ui | Components must use Arken tokens |
| Styling | CSS variables (our token file) | Never hardcode hex values |
| Database | Supabase (Postgres) | Not set up yet — Phase 4 |
| Auth | Supabase Auth | Not set up yet — Phase 4 |
| Deployment | Vercel free tier | Not set up yet — Phase 4 |
| Design | Figma + Tokens Studio | Tokens mirror the CSS file |
| Fonts | Google Fonts — Roboto + Roboto Mono | Always loaded via link tag |

**Current phase: static HTML prototypes only. No framework, no backend, no npm yet.**
All files right now are plain HTML + CSS. Each screen is a self-contained .html file.

---

## Token file

**Always import this at the top of every HTML file:**
```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@400;500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../tokens/arken-tokens.css">
```

**Never hardcode a hex colour. Always use a token.**

### Key token names to know

```css
/* Structural */
--color-nav-bg       /* #1A1F2E  sidebar + top nav */
--color-page-bg      /* #FBFBFB  outermost page background */
--color-surface      /* #FFFFFF  cards, panels, inputs */
--color-border       /* #E8E8E6  all 1px borders */

/* Text */
--color-text-primary      /* #111111 */
--color-text-secondary    /* #6B6B6B */
--color-text-tertiary     /* #9B9B9B */
--color-text-placeholder  /* #C4C4C2 */
--color-text-inverse      /* #FFFFFF  — text on dark nav */

/* Interaction */
--color-cta-bg        /* #1A1F2E  primary buttons */
--color-cta-hover     /* #2C3248 */
--color-hover-bg      /* #F0F0EE  row hover, subtle hover */
--color-focus-ring    /* #3D8FE0  blue focus outline */

/* Status (always use the trio: -text, -bg, -border) */
--status-active-*     /* blue    — enrollment, on track */
--status-success-*    /* green   — form complete, done (administrative) */
--status-pending-*    /* purple  — awaiting action */
--status-info-*       /* slate   — neutral informational */
--status-warning-*    /* amber   — draft, incomplete, acknowledge required */
--status-alert-*      /* orange  — overdue, near-alert */
--status-critical-*   /* red     — SAE, critical, humane endpoint */

/* Field data states (EDC-specific) */
--field-default-*     /* clean input */
--field-query-*       /* amber  — query raised on this field */
--field-disc-*        /* orange — discrepancy / edit check fail */
--field-critical-*    /* red    — SAE-related critical issue */
--field-clean-*       /* green  — SDV complete, validated */
--field-locked-*      /* grey   — record locked, immutable */

/* Role colours */
--role-pi             /* blue   — Principal Investigator */
--role-crc            /* purple — Clinical Research Coordinator */
--role-cra            /* amber  — Clinical Research Associate / Monitor */
--role-dm             /* red    — Data Manager */
--role-pm             /* slate  — Project Manager */
--role-admin          /* navy   — System Admin */
--role-field          /* green  — Field Technician */
```

---

## Design spec

| Property | Value |
|---|---|
| Font (UI) | Roboto 400 / 500 / 700 |
| Font (data values, IDs, timestamps) | Roboto Mono 400 / 500 |
| Base font size | 14px |
| Page / screen titles | 24px Roboto 500, normal case |
| Form section titles | 16px Roboto 500, `font-variant: small-caps`, letter-spacing 0.07em |
| Table column headers | 14px Roboto 500, `font-variant: small-caps`, letter-spacing 0.07em |
| Breadcrumbs | 14px Roboto 400, `font-variant: small-caps`, letter-spacing 0.07em |
| Border radius | 4px base (`--radius-md`). Badges/inner: 2px. Panels: 6–8px. Pills: 9999px |
| Stroke / border width | 1px always |
| Field shadow | None — border only |
| CTA / primary button | Background `--color-cta-bg` (#1A1F2E), white text |
| Focus ring | `box-shadow: 0 0 0 3px rgba(61,143,224,0.35)` |
| Mode | Light mode primary. Dark mode planned but not built yet |

**Small caps utility class:** `class="small-caps"` → applies `font-variant: small-caps` + letter-spacing
**Mono utility class:** `class="mono"` → applies Roboto Mono

---

## Severity scale — critical rule

The warning/alert/critical scale has THREE distinct levels. Never collapse them:

| Level | Colour | When to use |
|---|---|---|
| Warning | Amber | Draft, incomplete, acknowledge required, medium priority |
| Alert | Orange | Overdue, randomisation missing, near-alert |
| Critical | Red | SAE, critical finding, humane endpoint, expired user |

---

## Users / roles

| Role | Abbrev | Colour token | What they do |
|---|---|---|---|
| Principal Investigator | PI | `--role-pi` (blue) | Study oversight, e-signature, data review |
| Clinical Research Coordinator | CRC | `--role-crc` (purple) | Day-to-day data entry, query resolution |
| Clinical Research Associate | CRA | `--role-cra` (amber) | Source data verification, raising queries |
| Data Manager | DM | `--role-dm` (red) | Edit checks, discrepancy management, lock |
| Project Manager | PM | `--role-pm` (slate) | Study progress, milestones, dashboards |
| System Admin | Admin | `--role-admin` (navy) | User management, study configuration |
| Field Technician | Field | `--role-field` (green) | Offline tablet data entry in field environments |

---

## File structure

```
arken-edc/
├── CONTEXT.md              ← this file — paste at session start
├── DECISIONS.md            ← all design decisions with rationale
├── tokens/
│   ├── arken-tokens.css    ← source of truth for all tokens
│   └── tokens.json         ← Tokens Studio / Figma import
├── docs/
│   └── brand-brief.md      ← Session 1 brand documentation
└── screens/                ← HTML prototypes (one file per screen)
    └── (none yet)
```

---

## What has been built so far

### Session 1 — Brand + tokens (complete)
- [x] Product name: Arken
- [x] Color palette defined (BRD Cattle palette — amber/orange/red severity, blue/green/purple/slate semantic)
- [x] Typography: Roboto + Roboto Mono
- [x] Full token file: `arken-tokens.css`
- [x] Tokens Studio JSON: `tokens.json`
- [x] Brand brief: `docs/brand-brief.md`
- [x] shadcn/ui CSS variable bridge included in token file

### Session 2 — Component inventory (not started)
### Session 3 — Component library HTML (not started)
### Session 4 — Living style guide page (not started)

---

## What to build next

Session 2: define the full component inventory (list every component needed across all screens before building any of them).

---

## Rules for every prompt in this project

1. Never hardcode hex values — always use token variables
2. Never add a shadow to form fields — border only
3. Three severity levels (amber / orange / red) — never merge them
4. Small caps on: table column headers, breadcrumbs, form section titles
5. Roboto Mono on: all data values, IDs, timestamps, anything that needs exact character reading
6. 1px borders everywhere — never 0.5px, never 2px (except focus ring)
7. 4px base radius — inputs, buttons, cards all use `--radius-md`
