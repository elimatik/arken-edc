# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-09 | Session 19 COMPLETE → Session 20 — Data Entry drill-down

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

**Design phase complete. Production stack live. Login, study selector, role-aware app shell, and the role dashboards are built and wired to live Supabase data. Session 20 builds the Data Entry drill-down — the core screen of the app.**

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

### Session 18 — COMPLETE ✅
- **Authenticated app shell built** (translated from `04-app-shell.html`): 74px role-aware sidenav + 56px topbar + scrollable page content, in `app/components/shell/` (`AppShell`, `Sidenav`, `Topbar`, `Breadcrumb`, `ShellContext`, `shell.css`).
  - **Topbar:** study pill + site dropdown (default "All Sites") on the left; role switcher (all roles, instant, no re-login) + utilities + avatar on the right.
  - **Breadcrumb component** implements the site rule (site shown only when no specific site is pinned).
  - **Route** `app/app/study/[studyId]/` — server layout fetches study/sites/role and renders the shell; landing is a dashboard stub. `enterStudy` routes here.
- **Role-aware nav + permissions** — single source of truth in **`app/lib/permissions.ts`** (this is canonical; don't duplicate the matrix elsewhere):
  - Nav items hidden (never reordered) per role. Final item set: Dashboard, Data Entry, Animals, Queries, Visits, SDV (CRA), Coding (DM), Calendar, Reports, Inventory, Audit Trail, Invoices (Admin), Settings (bottom-pinned). **Site/Barn/Pen is a drill-down inside Data Entry, not a standalone nav item.**
  - Per-role flags: `blinded` (Reports + Inventory for Sponsor), `readonly` (Settings DM=true, Admin=false).
  - **Query permissions** (`QUERY_PERMISSIONS` / `canQuery()`): CRC respond · CRA raise+resolve · DM raise+resolve+manage · PI respond · Sponsor/Admin none. Lifecycle `open → responded → resolved`; **Resolved is terminal — no Closed**.
- **Live data + session:** study selector queries the live `studies` table (real roles, subject/site counts) and routes into the shell. Role switcher persists to `demo_sessions.active_role` (`app/lib/session.ts`), survives reloads.
- ⚠️ **Pending migration:** `app/supabase/migrations/20260609100000_remove_closed_query_status.sql` drops `closed` from the `query_status` enum. **Written but NOT applied** — apply with `cd app && npx supabase db push`.

### Session 19 — COMPLETE ✅
- **Role dashboards built** (replaced the landing stub at `app/app/study/[studyId]/page.tsx`). Driven by `useShell().activeRole` — switching the role in the topbar swaps the dashboard live. Widgets + styles in `app/components/dashboard/` (`RoleDashboard.tsx`, `widgets.tsx`, `dashboard.css`).
  - CRC / CRA / PI / DM / Admin translated faithfully from `31-dashboard.html`.
  - **Sponsor** = adapted oversight dashboard. **Blinding = aggregate totals only, no treatment-arm / randomization breakdown** (NOT value masking with `••••`). Semantics documented in `lib/permissions.ts` (`NavAccess.blinded`).
  - Did **not** build `32-dashboard-v2`'s customization / AI-chat (deferred). Dashboard metrics are static prototype data (placeholders) except the greeting uses the live study name.
- **Shell/studies fixes** (commit `b94f260`): removed the Site/Barn/Pen nav item; removed the topbar settings gear; study pill routes back to `/studies`; the `/studies` lobby has no sidenav and a cards/table view toggle (cards default, table interim pending `14-list-pages.html`).

### Session 20 — NEXT (Data Entry drill-down) ▶

**Build the Data Entry drill-down from `26-data-entry.html` — the most important screen in the app and the core of case studies 1, 3, and 4.** Renders inside the app shell (it's the `data-entry` nav destination). Read `26-data-entry.html` **fully** before writing anything; translate faithfully, then wire per role/data.

It includes:
- **Hierarchy drill-down** — Site → Barn → Pen → Animal for **livestock** studies; Site → Subject for **companion** studies (type-aware, matching the schema: livestock uses barn/pen, companion uses owner/subject).
- **Form sidebar** with **SVG status icons** (empty / in-work / reviewed / finalized / queried — the status-icon set from the style guide).
- **Field states** — queried (amber), SDV-verified, delta (Δ change reason).
- **Inline query flags** on fields.
- **Remarks dropdown** with two modes — **Queries mode** and **SDV mode** (the toggle pattern from the style guide).

Notes:
- Respect `QUERY_PERMISSIONS` / `canQuery()` and the SDV permission (CRA) from `lib/permissions.ts` — e.g. only CRA can SDV-verify; query actions per role.
- Wire to live Supabase (`subjects`, `forms`, `form_fields`, `form_instances`, `field_values`, `queries`, `sdv_records`) where practical; note placeholders. The two rich seeded studies (AK-2401 livestock, AK-2312 companion) cover both hierarchy shapes.
- Start by reading `26-data-entry.html`, then plan the drill-down + form + field-state component structure.

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

> "This is the handoff doc for Arken EDC. We're in session 20. The design phase is complete; login, study selector, the role-aware app shell, and the role dashboards are built and wired to live Supabase data (app/app/study/[studyId], app/components/shell, app/components/dashboard, app/lib/permissions.ts). Read the handoff fully, then let's build the Data Entry drill-down from 26-data-entry.html — the most important screen in the app and the core of case studies 1, 3, and 4. It includes the hierarchy drill-down (Site→Barn→Pen→Animal for livestock, Site→Subject for companion), the form sidebar with SVG status icons, field states (queried/SDV/delta), inline query flags, and the remarks dropdown (Queries mode / SDV mode). Respect QUERY_PERMISSIONS/canQuery() and the SDV (CRA) permission in lib/permissions.ts. Read 26-data-entry.html fully before writing anything, then plan the component structure."
