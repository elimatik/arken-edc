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
https://arken-edc.vercel.app — sign in (any credentials) lands you on the **study selector** with three studies. Pick one to enter the EDC shell.

### 2. Switch roles live
Use the **role switcher in the top bar** — it changes the active role instantly (no re-login) and re-shapes the sidenav and dashboard. The choice persists for the tab and resets on tab close.

### 3. Walk the core flow
**Data Entry → drill down → Subject Record.** Open **Data Entry**, drill the hierarchy, and open an animal to reach its **Subject Record** — the form sidebar, field states, SDV mode, and the inline query thread.

### 4. Read the system
The **living style guide** (https://elimatik.github.io/arken-edc/) documents the full design system — foundations, components, and the Arken-specific clinical patterns — the source of truth the app is built on.

### Try all three hierarchy shapes
- **AK-2401** — livestock, group-housed (Site → Barn → Pen → Animals)
- **CA-1103** — companion, individual records (Site → Subject + owner)
- **EQ-3302** — equine, individual records (Site → Barn → Pen → Animal)

The design rationale behind the query workflow and the three enrollment modes is written up in **`CASE_STUDY.md`**.

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

So the demo is fully explorable and editable by anyone, with zero risk of one visitor's edits affecting another.

---

## Current routes

| Route | Screen |
|---|---|
| `/login` | Login + study-selector entry |
| `/studies` | Study selector (cards / table) |
| `/study/[studyId]` | Role dashboard (varies by active role) |
| `/study/[studyId]/data-entry` | Hierarchy drill-down |
| `/study/[studyId]/data-entry/[subjectId]` | Subject Record |
| `/study/[studyId]/data-entry/[subjectId]/[formId]` | Subject Record, form pre-selected |

---

## Key config files

- **`app/lib/permissions.ts`** — the canonical **nav matrix + role permissions**: which roles see which nav items, the `blinded` / `readonly` flags, and the query-action permissions. Change access here, not in components.
- **`app/lib/session-store/`** — the **data layer**: `types.ts` (dataset shape), `hydrate.ts` (one-time Supabase load), `SessionStore.tsx` (`StudySessionProvider` + `useStudySession`).

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

**Built:** login, study selector, role-aware app shell, role dashboards, Data Entry drill-down, Subject Record, and the session-store data layer.

**Pending:**
- **Form layer** — real field definitions + species-specific validation (so the Subject Record renders actual fields, not illustrative ones)
- **"Create new study"** setup flow (session-based)
- **Animals list** and **Queries** screens
- The **portfolio site** itself

---

## Project journey

1. **Design phase** — brand brief, token system, component library, and 30+ fully-designed screens as static prototypes, culminating in the published living style guide.
2. **Build phase** — translating the prototypes into a real Next.js + Supabase application, screen by screen, then refactoring onto the session-based data store.

See **`CASE_STUDY.md`** for the design case studies, and `SESSION_HANDOFF.md` / `CONTEXT.md` / `DECISIONS.md` for the full working record.

---

*This guide is a living document and grows as the build progresses.*
