# Arken EDC — Portfolio Guide

> A senior-level product design case study: designing and building an electronic data capture (EDC) platform for **veterinary clinical trials**, from design system through to a working Next.js application.

**By Elisa Tron** — Senior UX / Product Designer
For senior product design roles in US healthtech.

---

## Quick links

| | |
|---|---|
| **Live app** | https://arken-edc.vercel.app |
| **Living style guide** | https://elimatik.github.io/arken-edc/ |
| **Source** | https://github.com/elimatik/arken-edc |

---

## What this is

**Arken EDC** is a purpose-built electronic data capture platform for **veterinary / animal clinical trials** — the kind of GCP-compliant trials required for USDA, VICH, and NADA regulatory submissions.

Human-trial EDC systems (Medidata Rave, Veeva, OpenClinica) don't fit veterinary research: animals are enrolled in **hierarchies** (site → barn → pen → subject), span **multiple species** with different data needs, and companion-animal trials introduce **owners** as data sources (ePRO). Arken is designed from the ground up for this domain.

This project is a **portfolio piece** — every screen, token, and interaction was designed to demonstrate senior product-design thinking: systems design, complex data UX, regulated-domain workflows, and the ability to carry a design through to real, working software.

---

## What it demonstrates

- **Design systems at scale** — a complete, documented token system and component library (see the living style guide), applied consistently across 30+ screens.
- **Complex data UX** — dense tables, multi-level hierarchy navigation, batch data entry, and dashboards that stay legible under real clinical data loads.
- **Regulated-domain workflows** — 21 CFR Part 11 audit trails, source data verification (SDV), the query lifecycle (Raised → Responded → Resolved, terminal — see `CASE_STUDY.md`), and change-reason (Δ) capture.
- **Role-based design** — six roles (CRC, CRA, DM, PI, Sponsor, Admin), each with a tailored view of the same underlying data.
- **Design → build continuity** — the static prototypes are being translated faithfully into a production Next.js + Supabase application.

---

## How to explore it

### 1. Open the live app
https://arken-edc.vercel.app — sign in with the prefilled demo credentials. On first sign-in per tab you'll see a one-time **access agreement** (see below); accept it to reach the **study selector** with three studies. Pick one to enter the EDC shell. You can **pin** any studies (the pin column / topbar dropdown) — pinned studies sort to the top of the list; the filled pin icon is the only marker, the row keeps its normal styling.

### 2. Switch roles live
Use the **role switcher in the top bar** — it changes the active role instantly (no re-login) and re-shapes the sidenav and dashboard. The choice persists for the tab and resets on tab close.

### 3. Walk the core flow
**Data Entry → drill down → Subject Record.** Open **Data Entry**, drill the hierarchy, and open an animal to reach its **Subject Record** — the form sidebar, field states, SDV mode, and the inline query thread.

### 4. Read the system
The **living style guide** (https://elimatik.github.io/arken-edc/) documents the full design system — foundations, components, and the Arken-specific clinical patterns — the source of truth the app is built on.

### Try all three hierarchy shapes
- **PH-2401** — *Phytogenic Feed Additive Broiler Growth Performance Trial* — poultry, group-housed (Site → **House → Pen** — the **pen IS the subject**: the hierarchy ends at Pen and clicking a pen opens its Subject Record, no per-bird demographics; the housing label relabels to *House* for chicken). Randomized complete block, **2 arms** (T01 Control · T02 Phytogenic 0.05%), single controlled-environment house, 42 days, **pen-level forms** with the weekly visits as **6 Week groups** at the top of the sidebar (Week N — Day D → Body Weight & Flock Health for D7–D42, each form its own item with its own status/query/SDV) plus a standalone read-only auto-generated **Production Summary** (per-week table + overall rollup incl. FCR/ADG/EPEF) — *plus* a **house-scoped Daily Environmental Log** that lives on the **Barn Record** (reached via "Open house record"), not the pen sidebar.
- **BR-2502** — *Bovine Respiratory Disease Treatment Trial* — cattle, individual records (Site → Barn → Pen → Animal; animals share a pen but each carries its own record). 3 arms, 4 feedlots, rolling enrollment, **15 animal forms in 6 groups**, and **age-class heart-rate validation** (calf ≤6 mo 100–140 vs adult 48–84 bpm).
- **CA-0801** — *DermAlliv™ Canine Atopic Dermatitis Study* (Protocol DERM-2026-104) — companion, individual records (Site → Subject + owner). The richest study: **3 sites** (Austin / Denver / Raleigh), 13 dogs (incl. a screen failure), a 53-form eCRF (Screening → Randomization → 4 follow-up visits → End of Study + AE / Protocol Deviation / Subject Status / ConMed / a read-only **ePRO** owner-diary stub), and **wired CRC / PI / DM dashboards** (enrollment, compliance, safety, data-quality aggregates).

The design rationale behind the query workflow and the three enrollment modes is written up in **`CASE_STUDY.md`**.

---

## Access codes & the agreement gate

### Access codes
The login credential acts as an **access code**. The seeded codes map to roles — `ARKEN-CRC`, `ARKEN-CRA`, `ARKEN-PI`, `ARKEN-SPON`, `ARKEN-ADMIN` (in `access_codes`). **`ARKEN-ADMIN` is the owner code:** entering it **bypasses the access agreement** and goes straight to the study selector — no modal, nothing recorded. Owner codes are listed in `OWNER_CODES` (`app/lib/constants.ts`).

### The access-agreement (NDA) gate
Because the project is shared publicly for portfolio evaluation, every **non-owner** visitor passes through a one-time agreement before they can browse:

- **When** — after the login credential validates, a full-screen, Arken-branded agreement appears. It is shown **once per tab** (the acceptance is flagged in `sessionStorage`); owner codes (`ARKEN-ADMIN`) skip it entirely.
- **What's collected** — Full name (required), Company / Organization (optional), and an explicit "I agree" checkbox. "Continue to project" is disabled until the name is filled and the box is checked. Cancel returns to login.
- **It becomes you** — that name is the **acting user** for the rest of the session: the study-selector and topbar **avatar + name** (initials derived from it), the dashboard greeting, every query / response / change reason you author, and your SDV verifications are all attributed to it (seeded/historical records keep their original names).
- **What's recorded** — on accept, a row is written **directly to Supabase** (not the session store — this is audit data) into the **`nda_agreements`** table: `full_name`, `company`, `access_code`, `agreed_at` (plus `id` / `created_at`).
- **How to view agreements** — Supabase dashboard → **Table Editor → `nda_agreements`**.

> The `nda_agreements` table is added by migration `20260610100000_nda_agreements.sql`. Apply it (`npx supabase db reset --linked --yes`, or `db push`) before the insert can succeed — until then the accept still proceeds (the insert fails best-effort and the visitor is not blocked).

---

## The design system in one breath

- **Type:** Roboto (UI) + Roboto Mono (all data values, IDs, timestamps)
- **Icons:** Tabler Icons
- **Severity:** a strict three-level system — amber / orange / red, never merged
- **Surfaces:** nav → page → surface → hover, a clear hierarchy
- **Tokens:** every color, size, space, and radius is a CSS custom property — no hardcoded values

The full rationale and the 10 system rules live in the style guide and in `DECISIONS.md`.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, TypeScript) — in `/app` |
| Styling | Tailwind CSS + design-system CSS tokens |
| Backend | Supabase (Postgres) — schema live at project `lijieicldshgjtqjescv` |
| Hosting | Vercel — **https://arken-edc.vercel.app** |
| Prototypes | Static HTML/CSS/JS (the design source of truth) |

---

## Architecture — session-based data store

The running app is a **session-based demo**: Supabase holds the canonical seed, the browser holds the working copy.

- On **first visit**, the app hydrates the full dataset (the 3 studies + their hierarchy, forms, queries…) **once** from Supabase via `app/lib/session-store/hydrate.ts`.
- The dataset lives in **`sessionStorage`** behind a React context — every screen reads it through **`useStudySession()`**, never calling Supabase directly.
- **All visitor edits stay in the session** (`update()` mutates the in-memory dataset and persists to `sessionStorage`); **nothing is written back to Supabase**.
- The session **resets on tab close** (native `sessionStorage` behaviour) — a fresh visitor always gets the clean seed.
- **One deliberate exception:** the access-agreement acceptance is written **directly to Supabase** (`nda_agreements`) — it's audit data that must outlive the tab, so it does not go through the session store.

So the demo is fully explorable and editable by anyone, with zero risk of one visitor's edits affecting another.

---

## Current routes

| Route | Screen |
|---|---|
| `/login` | Login + study-selector entry |
| `/studies` | Study selector (table; pin studies, + Add Study) |
| `/study/[studyId]` | Role dashboard (varies by active role) |
| `/study/[studyId]/settings` | Study settings (placeholder; landed on after "+ Add Study", as Admin) |
| `/study/[studyId]/data-entry` | Hierarchy drill-down |
| `/study/[studyId]/animals` | Animals list (study-wide table; columns + hierarchy adapt per study type) |
| `/study/[studyId]/sites` | Sites list (Admin-only; site table + Add Site) |
| `/study/[studyId]/sites/[siteId]` | Site Record (details, enrollment metrics, staff placeholder, Admin Edit) |
| `/study/[studyId]/data-entry/[subjectId]` | Subject Record |
| `/study/[studyId]/data-entry/[subjectId]/[formId]` | Subject Record, form pre-selected |

---

## Key config files

- **`app/lib/permissions.ts`** — the canonical **nav matrix + role permissions**: which roles see which nav items, the `blinded` / `readonly` flags, and the query-action permissions. Change access here, not in components.
- **`app/lib/session-store/`** — the **data layer**: `types.ts` (dataset shape), `hydrate.ts` (one-time Supabase load), `SessionStore.tsx` (`StudySessionProvider` + `useStudySession`).
- **`app/lib/forms/validation.ts`** — the **edit-check engine**: `evaluateField(field, value, species, ranges)` resolves a species range and returns a query-or-null. Pure; no UI.
- **`app/lib/terminology.ts`** — the **species → housing-label map** (Barn/Pen for cattle · Stable/Stall for equine · **House/Pen for chicken**) + `hierarchyLevels(study)`.
- **`app/supabase/generate-seed.mjs`** — generates `seed.sql` (134 forms / 995 fields) from each study's own form tree + field definitions, hierarchy (multi-site), subjects, and demo data. Forms nest into `grp()`/`leaf()` groups; `sec()` tags fields with in-form sections; `recurring()` expands a visit template into one form per visit day; `study.barnForms` declares **house-scoped** forms (rendered on the Barn Record). Edit it, re-run `node generate-seed.mjs`, then `db reset`.

---

## Running it

```bash
# Run locally
cd app && npm run dev

# Reset / reseed the Supabase database (re-applies migrations + seed)
cd app && npx supabase db reset --linked --yes
```

---

## Built vs. pending

**Built:** login (+ access agreement), study selector, role-aware app shell, role dashboards (**CA-0801 has bespoke CRC/PI/DM dashboards wired to live session-store aggregates** — a stacked enrollment graph with a dashed target marker, plus compliance / safety / data-quality and a compact open-queries list, all derived from real subjects/forms/queries), Data Entry drill-down (**role-gated Add Barn / Pen / Subject** — CRC/DM add housing, CRC/CRA add animals — into the session store; **Admin is not in the clinical data flow**; **every level — site, house, pen, subject — carries Forms (completed / total instances) and Queries (open count, orange when > 0) columns** rolled up from the session store), a **Sites section** — an Admin-only site-list table, and the **canonical Site Record** (translated from `27-site-record.html`: stat strip + Site information / Contacts / Protocol & amendments / Regulatory / Site visits) reachable by Admin (Sites nav) *and* by clinical roles via the Data Entry "Open site record" button — Admin edits, clinical roles read-only, **Animals list**, Subject Record (clickable full-path breadcrumb · **subject switcher** · in-form section headers · completed/withdrawn read-only with a preservation banner · **repeating-table forms** for ConMed / Adverse Events / Protocol Deviations / Mortality & Cull — add/edit/delete entries via a slide-in panel, with auto AE numbers + VeDDRA look-up and cumulative summaries; these repeating forms carry the **same sticky form header** (title + Remarks dropdown + Submit/Finalize/Lock CTA) as every other form, with the **status rolled up across all entries** (the whole log advances together) and the per-entry panel kept fields-only; a **weekly performance summary** atop the broiler Production-Monitoring group), the session-store data layer, **two-tab Site & House records** (Overview / Forms, `?tab=`): the Overview holds static configuration (Site Information / Regulatory & Ethics with IEC-expiry alerts; House Information / Biosecurity / Equipment Calibration with overdue alerts; Pen summary; Environmental alerts), while the Forms tab runs **site-scoped** and **barn-scoped** form flows (SIV checklist, Staff & Delegation, Monitoring Visits, Protocol Amendments, Site Close-out; Daily Environmental Log, Feed Delivery, House Close-out) — each rendered with the **full Subject-Record form flow** (edit checks, manual queries with the Raised→Responded→Resolved lifecycle, change-reason Δ, SDV verify, the Empty→…→Locked status progression with e-signature, and the Remarks dropdown), driven by the same session-store records keyed on `site_id` / `barn_id`. Recurring logs (the Daily Environmental Log, Feed Delivery) use the same **repeating-table + slide-in panel** pattern as the AE / ConMed forms — one row per entry, an Alerts column counting open edit checks, and a 420px panel that fires those edit checks inline. The whole Forms tab is laid out **identically to the Subject Record**: the same `.form-sidebar` (half-moon status glyphs, query badges, SDV shields, blue active highlight) beside a form-content pane with a **sticky header** (form title + Remarks dropdown + Submit/Finalize/Lock CTA) over a scrolling body — the Remarks modes and the status CTA are form-level (acting on the whole form, all entries together), while the repeating entry panel is fields-only. Forms are **scope-keyed** (`forms.scope` = subject / barn / site), so the pen sidebar, the House Forms tab and the Site Forms tab never mix; each Data-Entry drill-down row carries a record-link icon that opens that location's Site or House record; a **SIV enrollment-gate banner** warns before enrolling at an un-initiated site, and the **grouped form layer** — three clinically-realistic studies (**PH-2401** broiler growth-performance / **BR-2502** bovine respiratory / **CA-0801** canine multi-site), each with its **own** form tree (**134 forms / 995 fields total**), forms nested into collapsible visit/info **groups** (`parent_form_id`, **nestable to any depth**; PH-2401 presents its weekly visits as 6 top-level Week groups + a standalone read-only auto-generated **Production Summary**) with **explicit in-form sections**, and **species-specific validation** (`species_ranges`) that auto-raises and auto-resolves inline edit-check queries — including **age-class-resolved** ranges (bovine heart rate splits calf vs adult by the animal's `age_months`).

**Form entry, in depth** (the Subject Record renders a real eCRF):
- **Every field type** — text, number (with unit hint), date (native picker), select, **Yes/No toggle**, **multiselect checkboxes**, **calculated** (read-only — age from DOB, FEC reduction %), **file upload**, **coded** (text + a VeDDRA "Look up", DM-only), textarea. Some fields are **study-type-aware** — e.g. Pen / Lot ID becomes a dropdown of the study's pens for group-housed livestock, plain text otherwise. Inclusion/exclusion criteria carry **polarity** (`exclusion_if`) so "consent obtained? = No fails" and "prior antibiotics? = Yes fails" both evaluate correctly.
- **Required fields** flagged with a red asterisk; **vital hints** show the species normal range ("Normal: 38.0–39.3 °C").
- **Form status lifecycle** — Empty → In-Work → In-Review → Reviewed → Finalized → Locked, with **role-gated** advance actions and an **e-signature** confirmation to lock; a locked form is fully read-only. **Submit for Review** is gated on unresolved edit checks, pending change reasons, and empty required fields — but not on open queries.
- **Inclusion/Exclusion logic** — failing any criterion flags the subject **ineligible** (red banner + PI-review chip on the record and a warning badge in the drill-down list).
- **Change reason (Δ)** — changing a *previously-saved* value requires a reason (typing the very first value into an empty field never raises a Δ). **Every** value change is logged as its own delta record capturing its specific *old → new* transition — so changing a field A→B→C without stopping to explain creates **two** pending records (A→B, then B→C), each owed its own reason. The Δ panel (rebuilt from the design prototype) lists every transition chronologically; each pending one has its own reason box, and each record walks a **pending → answered → DM-approved** state (21 CFR Part 11) with author + timestamp. The field's Δ marker turns green only once **every** change has been DM-approved; a same-value "change" never triggers a Δ. The change reason panel always uses card format (one card per transition, dashed red border) — never adapts to a different layout for single vs multiple changes. Decision rationale in `CASE_STUDY.md`.
- **Edit checks vs queries** — an out-of-range value raises a lightweight **edit check** (orange `alert-circle`, `EC-`), not a query. Correct it (logged under a change reason) or explain it to **convert it to a formal query** — so the query log stays clean while every anomaly is still corrected or documented (see Case Study 1).
- **Query lifecycle** — raise (CRA/DM, from a hollow flag) → respond (CRC/PI) → resolve (CRA/DM), in a role-aware thread panel; flags persist (resolved → green check). **SDV** is a **CRA-only** Remarks mode (hidden for other roles) with per-field verify, **Verify all**, and a **Mark SDV complete** gate; you can only verify a field that has a **saved value** and is clean (no open edit check, pending change reason, or open query), and verification persists across forms. A coded field opens a **VeDDRA lookup** slide panel.
- **Eligibility & PI override** — a failed inclusion/exclusion criterion flags the subject **Ineligible** (one status chip at a time); a **PI** can **Override** with a documented reason to restore Active.

**Pending:**
- **SDV summary view** — a study-wide source-data-verification dashboard (the per-field shield, Verify-all, and progress exist)
- **Inventory module** — drug accountability + dispensing that resolves the Randomization form's lot/batch/kit links (Case Study 4's bridge wired end-to-end)
- **Case Study 5 — conditional demographics** (breed lists, production-purpose tags; age auto-calc is done)
- **Queries** screen (the study-wide queue; per-record query workflow is built)
- The **portfolio site** itself

---

## Project journey

1. **Design phase** — brand brief, token system, component library, and 30+ fully-designed screens as static prototypes, culminating in the published living style guide.
2. **Build phase** — translating the prototypes into a real Next.js + Supabase application, screen by screen, then refactoring onto the session-based data store.

See **`CASE_STUDY.md`** for the design case studies, and `SESSION_HANDOFF.md` / `CONTEXT.md` / `DECISIONS.md` for the full working record.

---

*This guide is a living document and grows as the build progresses.*
