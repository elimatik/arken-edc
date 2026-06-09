# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-09 | Session 17 COMPLETE → Session 18 — App shell + live data

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

## Where we are now

**Design phase complete. Production stack live. Login + study selector built and the Supabase backend is applied with seed data. Session 18 builds the authenticated app shell and connects screens to live data.**

### Session 16 — COMPLETE ✅
- **Living style guide built and published.** Single static page at `docs/index.html`, served on GitHub Pages (no build step). Documents the full Arken design system — every token, component, and pattern — in one browseable reference. Sticky sidebar nav, anchor-linked sections.
- **Production stack initialized:**
  - Next.js 14 + TypeScript + Tailwind CSS in the `/app` folder (App Router, no src dir, `@/*` alias)
  - Supabase client configured at `app/lib/supabase.ts` (`@supabase/supabase-js`)
  - Environment variables set in `app/.env.local` (local) **and** in Vercel (production)
  - **Deployed live at https://arken-edc.vercel.app**

### Session 17 — COMPLETE ✅
- **Login screen + study selector built** as React/Next.js components, translated faithfully from `00-login.html`.
  - Shared root layout (`app/app/layout.tsx`): Roboto + Roboto Mono via `next/font`, Tabler Icons CDN, design-system tokens in `globals.css`.
  - `/` → `/login`; `/login` (brand panel + form, password toggle, validation, loading state); `/studies` (study selector with search/filter, cards, enrollment bars, role chips). Page CSS ported verbatim for pixel fidelity.
- **Supabase schema applied + seeded** to project `lijieicldshgjtqjescv`:
  - **20 tables** — studies, site/barn/pen/subject hierarchy, forms/fields/instances/values, queries + threads, SDV, audit trail, access codes, `demo_sessions` (role switching), `companion_owners` stub.
  - **Seed data live** — 2 rich studies (cattle/livestock + canine/companion) + 2 sandboxes, 5 access codes (`ARKEN-CRC/CRA/PI/SPON/ADMIN`).
  - Migration + seed: `app/supabase/`. Supabase CLI is a dev dependency (`npx supabase …`).
  - ⚠️ **RLS deliberately OFF** for now (documented in the migration). Tables are reachable via the anon key — fine for demo data, revisit before anything real.
- Role enum is **CRC · CRA · DM · PI · Sponsor · Admin** (Sponsor replaces the prototype's `PM` chip — update `rc-pm` references when building those screens).

### Session 18 — NEXT (app shell + live data) ▶

Build the authenticated app shell from `04-app-shell.html` and connect it to live Supabase data. Detailed specs:

**1. Topbar**
- **Study pill + site dropdown side by side on the left.**
- Site dropdown defaults to **"All Sites"**.
- **Role switcher on the top right**, visible to **all roles**. Changing it switches the active role **instantly, without re-login**.

**2. Breadcrumb rule**
- When **All Sites** is selected → the **site name appears in the breadcrumb**.
- When a **specific site** is selected → the breadcrumb **starts below the site level** (site is implied by the dropdown, not repeated in the trail).

**3. Sidenav — role-aware**
- Items are **hidden (not reordered)** based on the active role. Order is stable; disallowed items simply don't render.
- **Store permissions in a single config object** (e.g. `app/lib/permissions.ts`), keyed by nav item → allowed roles. **Do not hardcode role checks per component.**

Permission matrix (roles: CRC · CRA · DM · PI · Sponsor · Admin):

| Nav item | CRC | CRA | DM | PI | Sponsor | Admin |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Data Entry | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Animals | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Queries | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Visits | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Reports | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Invoices | — | — | — | — | — | ✓ |
| Inventory | — | ✓ | ✓ | — | — | ✓ |
| Audit Trail | — | ✓ | ✓ | ✓ | — | ✓ |
| Settings | — | — | — | — | — | ✓ |

Plain-English rules behind the matrix: Dashboard + Animals = all roles · Data Entry/Queries/Visits = all **except Sponsor** · Reports = all **except CRC** · Inventory = CRA/DM/Admin · Audit Trail = CRA/DM/PI/Admin · Invoices + Settings = **Admin only**.

**4. Live data — study selector**
- Replace the hardcoded `STUDIES` array in `app/app/studies/page.tsx` with a query against the live Supabase **`studies`** table (project `lijieicldshgjtqjescv`).

**5. Role switcher persistence**
- The role switcher **updates `demo_sessions.active_role` in Supabase** (not just local state), so the active role survives reloads and drives the role-aware sidenav.

`enterStudy` on the study selector should route into this app shell instead of the placeholder alert.

---

## Design phase status — COMPLETE

All 33 prototype files exist locally and are documented in the published style guide. They are the source of truth Claude Code translates into React components.

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

## Style guide — published contents (docs/index.html)

The published style guide covers the following. Use it as the canonical reference when building React components.

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

## GitHub Pages setup — DONE ✅

The style guide is a single `docs/index.html`, served by GitHub Pages from the `/docs` folder on the main branch (no build step). Single-page with sticky left sidebar nav and anchor-linked sections — mirrors the settings hub pattern. Pure HTML + CSS, same token stack as the prototype files.

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

> "This is the handoff doc for Arken EDC. We're in session 18. The design phase is complete, the login screen + study selector are built (app/app/login, app/app/studies), and the Supabase backend is applied with seed data (20 tables, live at project lijieicldshgjtqjescv). Read the handoff fully, then let's continue the build. Tasks: (1) build the authenticated app shell from 04-app-shell.html (sidenav + topbar) and route enterStudy into it; (2) wire the role switcher into the topnav, backed by demo_sessions.active_role; (3) connect the study selector to real Supabase data, replacing the hardcoded STUDIES array. Start by reading 04-app-shell.html and app/app/studies/page.tsx, then plan the component structure."
