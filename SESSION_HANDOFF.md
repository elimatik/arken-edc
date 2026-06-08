# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-07 | Session 16 — Living style guide

---

## How to use this file
Paste the full content of this file as your first message. It contains everything needed to start immediately.

---

## Project overview
**Arken EDC** — veterinary/animal clinical trial EDC platform. Portfolio project by Elisa (senior UX/Product Designer, Italy, dual US/Italian citizenship), targeting senior product design roles at US healthtech companies.

**Repo:** https://github.com/elimatik/arken-edc
**Local path:** /Users/elisatron/Documents/ARKEN
**Stack:** Static HTML prototypes → Next.js + Supabase + Vercel
**Fonts:** Roboto + Roboto Mono (Google Fonts CDN)
**Icons:** Tabler Icons CDN (ti ti-*)

---

## What we're doing in this session

**Building the living style guide on GitHub Pages.**

This is the last item in the design phase before moving to Claude Code. The style guide is a static site (GitHub Pages, no build step) that documents the full Arken design system — every token, every component, every pattern — in a single browseable reference.

**Purpose:**
- Portfolio artifact: shows design system thinking at a senior level
- Developer handoff: Claude Code starts here to understand tokens and component anatomy before coding React components
- Living document: updates as the system evolves

---

## Design phase status — COMPLETE

All 33 prototype files exist locally. The style guide will reference and showcase the patterns they contain.

| File | Screen |
|---|---|
| 00-login.html | Login + study selector |
| 01–25 | Design system + all core EDC components + settings hub |
| 26-data-entry.html | Data Entry drill-down |
| 27-site-record.html | Site record |
| 28-barn-pen-record.html | Barn / Pen record |
| 29-animals-list.html | Animals list |
| 30-subject-record.html | Subject record |
| 31-dashboard.html | Role dashboards (6 roles) |
| 32-dashboard-v2.html | Customizable dashboard + AI chat |

---

## Style guide — what it should cover

### 1. Foundations
- Color system (full token set with swatches + hex + variable name)
- Typography (Roboto + Roboto Mono, type scale, weights, usage rules)
- Spacing scale (--space-1 through --space-8, visual ruler)
- Border radius (--radius-sm through --radius-full, visual examples)
- Iconography (Tabler Icons, usage guidelines, sizing)
- Grid/layout (two-col dashboard, sidebar + content, full-width)

### 2. Color semantics
- Three-severity system: Amber / Orange / Red — never merged
- Status color map: what each color means in clinical context
- Surface hierarchy: nav-bg → page-bg → surface → hover-bg
- Alert/feedback states: info (blue) / success (green) / warning (amber) / error (red) / critical (orange)

### 3. Core components
- Badge (all variants: status, role, severity)
- Button (primary, secondary, icon-only, sizes)
- Form field (label, input, select, textarea, hint, error state)
- Form field states (normal, queried-amber, SDV-verified, locked)
- Toggle (toggle-left pattern, with/without expand)
- Status icon set (empty, in-work, reviewed, finalized, active, queried)
- Flag icon set (no query, open query, resolved)
- Progress bar (enrollment track, SDV fill, mini bar)

### 4. Navigation patterns
- Sidenav (74px, icons + labels, active state, badge)
- Topbar (dark, study pill, site dropdown, role chip, avatar)
- Breadcrumb
- Form sidebar (220px, form items, sub-groups, status icons)

### 5. Data display
- Table (sticky header, sort states, row hover, cell types)
- Card (header, body, footer, link)
- Stat chip (value, label, accent variants, trend)
- Enrollment bar (6px track, legend)
- Query row
- Activity row

### 6. Panels and overlays
- Slide-in panel (480px query thread, 420px raise query, 360px card library)
- Overlay backdrop
- Modal (standard, ratio editor, strat factor)
- Dropdown (site picker, filter select, column chooser)

### 7. Clinical patterns (Arken-specific)
- Query lifecycle (Raised → Responded → Resolved → Closed)
- Delta (Δ) change reason states
- SDV verify pattern
- Remarks dropdown (Queries + SDV mode toggles)
- Protocol amendment stepped sections
- Site visit multi-log
- Hierarchy drill-down
- Role dashboard widget system

### 8. Design tokens (full reference)
- All CSS custom properties in a copy-paste block
- JSON token file reference
- Tailwind config mapping guide (for coding phase)

---

## 10 RULES — apply to every component shown in the guide

1. Never hardcode hex — CSS token variables only
2. No field shadow — border only (1px)
3. Three severity levels — never merge amber/orange/red
4. text-transform:uppercase — never font-variant:small-caps
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders · 4px base radius
7. Fields and buttons: 32px height (36px for settings forms) · font-weight:var(--weight-medium) · font-family:var(--font-sans)
8. Links: text underlined, icon NOT underlined
9. Every component file is self-contained — declare all tokens in :root
10. Topbar = study pill + site dropdown. Breadcrumb = full navigation path.

---

## GitHub Pages setup

The style guide should be a single index.html (or a small set of linked pages) at the repo root or in a /docs folder. GitHub Pages serves /docs from the main branch automatically with no build step needed.

**Structure options:**
- A. Single-page with anchor navigation (simplest, works great for a component library)
- B. Multi-page (index → foundations → components → patterns) with a shared nav

Recommendation: single-page with sticky left sidebar nav and anchor-linked sections. Mirrors the settings hub pattern we already designed.

**No frameworks needed.** Pure HTML + CSS, same token stack as the prototype files. Copy tokens from any prototype file's :root block.

---

## Design system token reference (for the guide's :root block)

```css
:root {
  --color-nav-bg:#1A1F2E; --color-nav-hover:#2C3248; --color-nav-icon:#8aafc8;
  --color-page-bg:#FBFBFB; --color-surface:#FFFFFF;
  --color-border:#E8E8E6; --color-border-subtle:#F0F0EE;
  --color-text-primary:#2C2D33; --color-text-secondary:#4F535B;
  --color-text-tertiary:#6D7480; --color-text-placeholder:#C4C4C2;
  --color-link:#3D4A5C; --color-hover-bg:#F0F0EE;
  --color-cta-bg:#1A1F2E; --color-cta-hover:#2C3248; --color-focus-ring:#3D8FE0;
  --amber-50:#FFF8E7; --amber-200:#F5B830; --amber-700:#8A5C00;
  --orange-50:#FFF0E8; --orange-200:#F48E50; --orange-700:#A33A08;
  --red-50:#FFF0F0; --red-200:#EC8585; --red-600:#B52626;
  --green-50:#EEFAF4; --green-200:#58BC88; --green-600:#1A6B47;
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

## Key JS safety patterns (for any interactive examples in the guide)

- Never hardcode hex in onclick handlers — use data-* attributes
- Never inline CSS variable values in HTML attribute strings — named functions + element IDs
- Always node --check before declaring JS complete

---

## What to say in this conversation

Paste this file and say:

> "This is the handoff doc for Arken EDC. We're in session 16. The design phase is complete. Now we're building the living style guide on GitHub Pages. Read the handoff fully, then let's plan and build the style guide — single HTML page, sticky sidebar nav, covers all the sections listed in the handoff. Start with the page structure and foundations."
