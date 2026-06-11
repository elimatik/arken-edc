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
- **AK-2401** — livestock, group-housed (Site → Barn → Pen → Animals)
- **CA-1103** — companion, individual records (Site → Subject + owner)
- **EQ-3302** — equine, individual records (Site → **Stable → Stall** → Animal — the same engine, species-relabelled)

The design rationale behind the query workflow and the three enrollment modes is written up in **`CASE_STUDY.md`**.

---

## Access codes & the agreement gate

### Access codes
The login credential acts as an **access code**. The seeded codes map to roles — `ARKEN-CRC`, `ARKEN-CRA`, `ARKEN-PI`, `ARKEN-SPON`, `ARKEN-ADMIN` (in `access_codes`). **`ARKEN-ADMIN` is the owner code:** entering it **bypasses the access agreement** and goes straight to the study selector — no modal, nothing recorded. Owner codes are listed in `OWNER_CODES` (`app/lib/constants.ts`).

### The access-agreement (NDA) gate
Because the project is shared publicly for portfolio evaluation, every **non-owner** visitor passes through a one-time agreement before they can browse:

- **When** — after the login credential validates, a full-screen, Arken-branded agreement appears. It is shown **once per tab** (the acceptance is flagged in `sessionStorage`); owner codes (`ARKEN-ADMIN`) skip it entirely.
- **What's collected** — Full name (required), Company / Organization (optional), and an explicit "I agree" checkbox. "Continue to project" is disabled until the name is filled and the box is checked. Cancel returns to login.
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
| `/study/[studyId]/data-entry/[subjectId]` | Subject Record |
| `/study/[studyId]/data-entry/[subjectId]/[formId]` | Subject Record, form pre-selected |

---

## Key config files

- **`app/lib/permissions.ts`** — the canonical **nav matrix + role permissions**: which roles see which nav items, the `blinded` / `readonly` flags, and the query-action permissions. Change access here, not in components.
- **`app/lib/session-store/`** — the **data layer**: `types.ts` (dataset shape), `hydrate.ts` (one-time Supabase load), `SessionStore.tsx` (`StudySessionProvider` + `useStudySession`).
- **`app/lib/forms/validation.ts`** — the **edit-check engine**: `evaluateField(field, value, species, ranges)` resolves a species range and returns a query-or-null. Pure; no UI.
- **`app/lib/terminology.ts`** — the **species → housing-label map** (Barn/Pen vs Stable/Stall) + `hierarchyLevels(study)`.
- **`app/supabase/generate-seed.mjs`** — generates `seed.sql` (72 forms / 365 fields) from the form tree + per-study field definitions. Edit it, re-run `node generate-seed.mjs`, then `db reset`.

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

**Built:** login (+ access agreement), study selector, role-aware app shell, role dashboards, Data Entry drill-down, Subject Record, the session-store data layer, and the **grouped form layer** — real field definitions across all 3 studies (114 / 113 / 138 fields), forms nested into collapsible visit/info **groups** (`parent_form_id`), and **species-specific validation** (`species_ranges`) that auto-raises and auto-resolves inline edit-check queries.

**Form entry, in depth** (the Subject Record renders a real eCRF):
- **Every field type** — text, number (with unit hint), date (native picker), select, **Yes/No toggle**, **multiselect checkboxes**, **calculated** (read-only — age from DOB, FEC reduction %), **file upload**, **coded** (text + a VeDDRA "Look up", DM-only), textarea. Some fields are **study-type-aware** — e.g. Pen / Lot ID becomes a dropdown of the study's pens for group-housed livestock, plain text otherwise.
- **Required fields** flagged with a red asterisk; **vital hints** show the species normal range ("Normal: 38.0–39.3 °C").
- **Form status lifecycle** — Empty → In-Work → In-Review → Reviewed → Finalized → Locked, with **role-gated** advance actions and an **e-signature** confirmation to lock; a locked form is fully read-only.
- **Inclusion/Exclusion logic** — failing any criterion flags the subject **ineligible** (red banner + PI-review chip on the record and a warning badge in the drill-down list).
- **Change reason (Δ)** — changing a saved value (on blur) requires a reason; the Δ panel (rebuilt from the design prototype) shows old → new, records the reason with author + timestamp, and tracks a **pending → answered → DM-approved** state (21 CFR Part 11). Yes→No→Yes each needs a fresh reason.
- **Edit checks vs queries** — an out-of-range value raises a lightweight **edit check** (orange `alert-circle`, `EC-`), not a query. Correct it (logged under a change reason) or explain it to **convert it to a formal query** — so the query log stays clean while every anomaly is still corrected or documented (see Case Study 1).
- **Query lifecycle** — raise (CRA/DM, from a hollow flag) → respond (CRC/PI) → resolve (CRA/DM), in a role-aware thread panel; flags persist (resolved → green check). **SDV** runs in Remarks mode with per-field verify, **Verify all**, and a **Mark SDV complete** gate; verification persists across forms. A coded field opens a **VeDDRA lookup** slide panel.
- **Eligibility & PI override** — a failed inclusion/exclusion criterion flags the subject **Ineligible** (one status chip at a time); a **PI** can **Override** with a documented reason to restore Active.

**Pending:**
- **SDV summary view** — a study-wide source-data-verification dashboard (the per-field shield, Verify-all, and progress exist)
- **Case Study 4 — conditional demographics** (breed lists, production-purpose tags; age auto-calc is done)
- **Animals list** and **Queries** screens
- The **portfolio site** itself

---

## Project journey

1. **Design phase** — brand brief, token system, component library, and 30+ fully-designed screens as static prototypes, culminating in the published living style guide.
2. **Build phase** — translating the prototypes into a real Next.js + Supabase application, screen by screen, then refactoring onto the session-based data store.

See **`CASE_STUDY.md`** for the design case studies, and `SESSION_HANDOFF.md` / `CONTEXT.md` / `DECISIONS.md` for the full working record.

---

*This guide is a living document and grows as the build progresses.*
