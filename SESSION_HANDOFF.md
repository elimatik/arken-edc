# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-09 | Session 21 COMPLETE → Session 22 — Form layer + Create new study

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

**The app is fully built through the Subject Record and now runs on a session-based data store.** The final **3-study architecture** is applied and live in Supabase; on first visit the seed is hydrated once per tab into the session store, and from then on **all reads/writes are in-session** (edits reset on tab close). Session 22 builds the form layer and the "Create new study" flow.

> **Data model (important):** Supabase is the **read-only seed source**. `app/lib/session-store/` (`useStudySession` / `StudySessionProvider`) hydrates the dataset once per tab into `sessionStorage`; every screen reads from it; `update()` mutates in session and **never writes back to Supabase**. Only `hydrate.ts` reads Supabase.
>
> **Live studies (3):** `AK-2401` (livestock_group) · `CA-1103` (companion) · `EQ-3302` (livestock_individual, equine). All memberships **CRC**. No sandbox/showcase split — all three are the editable demo.

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
- **Live data + session:** study selector + shell wired to data. *(Superseded in Session 21 — data now flows through the session store; role switching is session-scoped and `demo_sessions` / `lib/session.ts` are removed.)*

### Session 19 — COMPLETE ✅
- **Role dashboards built** (replaced the landing stub at `app/app/study/[studyId]/page.tsx`). Driven by `useShell().activeRole` — switching the role in the topbar swaps the dashboard live. Widgets + styles in `app/components/dashboard/` (`RoleDashboard.tsx`, `widgets.tsx`, `dashboard.css`).
  - CRC / CRA / PI / DM / Admin translated faithfully from `31-dashboard.html`.
  - **Sponsor** = adapted oversight dashboard. **Blinding = aggregate totals only, no treatment-arm / randomization breakdown** (NOT value masking with `••••`). Semantics documented in `lib/permissions.ts` (`NavAccess.blinded`).
  - Did **not** build `32-dashboard-v2`'s customization / AI-chat (deferred). Dashboard metrics are static prototype data (placeholders) except the greeting uses the live study name.
- **Shell/studies fixes** (commit `b94f260`): removed the Site/Barn/Pen nav item; removed the topbar settings gear; study pill routes back to `/studies`; the `/studies` lobby has no sidenav and a cards/table view toggle (cards default, table interim pending `14-list-pages.html`).

### Session 20 — COMPLETE ✅
- **Data Entry drill-down** (`app/app/study/[studyId]/data-entry/`) — live, type-aware hierarchy: companion = Site → Subject; `livestock_group` / `livestock_individual` = Site → Barn → Pen → Animal. Breadcrumb, per-level filterable tables, summary bar, and an **"Open [level] record" secondary button** at site/barn/pen levels. Clicking a subject opens its Subject Record.
- **Subject Record** (`app/components/subject-record/`, from `30-subject-record.html`) — the subject-level **entry point**; forms live inside it. Form sidebar (live forms + status icons + open-query badges), subject header, **remarks dropdown (Queries / SDV mode)**, per-field **query / SDV / delta / flag** states, plus 480px **query-thread** and 380px **delta** slide panels.
  - SDV verify buttons use **`ti-shield` / `ti-shield-check-filled`**; SDV verify gated to **CRA**; query-panel actions gated via `canQuery()`.
  - **Field content is illustrative** (the schema has no field definitions); **forms, status, and the live query are real**. Stub form route now opens the Subject Record with the form pre-selected.
- **Study architecture** (first drafted here as a 6-study set with sandboxes) was **finalized in Session 21** to 3 studies with no sandbox split — see Session 21.

### Session 21 — COMPLETE ✅
- **Final 3-study architecture — applied & live.** Migrations applied (`db push` + `db reset --linked`); `is_sandbox` dropped, `study_type` = companion | livestock_group | livestock_individual, `equine` species added, `query_status` `closed` removed. Live studies: **AK-2401** (livestock_group) · **CA-1103** (companion) · **EQ-3302** (livestock_individual, equine). All memberships **CRC**; no sandbox/showcase split.
- **Session-based data store** (`app/lib/session-store/`) — **`useStudySession` / `StudySessionProvider`** (mounted at the root layout):
  - hydrates the full dataset from Supabase **once per tab** into `sessionStorage` (`hydrate.ts`); resets on tab close.
  - **all screens read from the store** — study selector, shell (`StudyShell` resolves study/sites), dashboard, drill-down (builds the hierarchy via `useMemo`), Subject Record (subject/forms/statuses/query).
  - **role switching is session-scoped** (in the store, persisted per tab). `demo_sessions` writes and `lib/session.ts` are **removed**. **Only `hydrate.ts` reads Supabase.**
  - `update(mutator)` mutates the dataset in session (never writes to Supabase); `reset()` re-hydrates from the seed.
- **Fixes:** all study cards show the CRC chip; removed `.form-sticky-header` bottom border; removed the subject-status dot; SDV-verified fields show "Verified by … · date" in SDV mode; `.delta-btn` 16px; **all badge/chip heights normalized to 20px** (was 22.5px).
- ⚠️ **Subject-record field edits are still local/illustrative** — the vitals fields and SDV toggles aren't backed by structured store data (the schema has no field definitions yet). Structured reads are session-sourced; structured field editing comes in Session 22.

### Session 22 — NEXT (form layer + Create new study) ▶

1. **Seed form definitions** — Demographics, Screening, Baseline Vitals, Visit 1 / 2 / 3 — with **species-specific validation rules** (per study type / species). These become real `form_fields` so the Subject Record renders actual fields instead of illustrative ones.
2. **Wire real field editing through the session store** — field values, SDV verify, and query actions persist via `useStudySession().update()` (session only, reset on tab close).
3. **Build the "Create new study" setup flow** — session-based: an `update()` that inserts a new study graph (study + sites/hierarchy + forms) into the session. Entry point is the study selector ("Create new study" option). Now well-positioned since the store + form layer exist.

Notes:
- Read any target prototype **fully** before writing; translate faithfully.
- Everything is in-session now — no Supabase writes. New data lives in the session store and resets on tab close.

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

> "This is the handoff doc for Arken EDC. We're in session 22. The app is fully built through the Subject Record and runs on a session-based data store (useStudySession / StudySessionProvider): the 3-study seed is hydrated from Supabase once per tab into sessionStorage, all screens read from the store, all edits are in-session (reset on tab close), and only hydrate.ts reads Supabase. Read the handoff fully, then build the form layer: (1) seed real form definitions — Demographics, Screening, Baseline Vitals, Visit 1/2/3 — with species-specific validation rules, so the Subject Record renders actual fields; (2) wire real field editing / SDV / query actions through useStudySession().update() (session only); (3) build the 'Create new study' setup flow as a session insert (update() that adds a new study graph). Plan the form-definition schema + the session write actions first."
