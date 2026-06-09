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
- **Regulated-domain workflows** — 21 CFR Part 11 audit trails, source data verification (SDV), the full query lifecycle (Raised → Responded → Resolved → Closed), and change-reason (Δ) capture.
- **Role-based design** — six roles (CRC, CRA, DM, PI, Sponsor, Admin), each with a tailored view of the same underlying data.
- **Design → build continuity** — the static prototypes are being translated faithfully into a production Next.js + Supabase application.

---

## How to explore it

### 1. Start with the living style guide
https://elimatik.github.io/arken-edc/ — the foundations (color, type, spacing), every core component, and the Arken-specific clinical patterns. This is the system the whole app is built on.

### 2. Open the live app
https://arken-edc.vercel.app — sign in lands you on the **study selector**, showing the multi-study, per-role model. From there you can explore the EDC shell.

### 3. Try different roles (demo)
The platform is designed around a **role-switching demo** so reviewers can see how the same study looks to a CRC vs. a Sponsor vs. a PI. (Access codes / role switching are wired through the demo layer — see the README for current demo entry points.)

### Screens worth a close look
- **Study selector** — per-study role + data-access model
- **Dashboards** — role-specific dashboards (6 roles) and a customizable dashboard with AI chat
- **Data entry + SDV** — form entry, source data verification, and the query thread
- **Hierarchy drill-down** — site → barn/pen → animals → subject record
- **Settings hub** — randomization, inventory, audit & billing

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
| Framework | Next.js 14 (App Router, TypeScript) |
| Styling | Tailwind CSS + design-system CSS tokens |
| Backend | Supabase (Postgres) |
| Hosting | Vercel |
| Prototypes | Static HTML/CSS/JS (the design source of truth) |

---

## Project journey

1. **Design phase (sessions 1–16)** — brand brief, token system, component library, and 30+ fully-designed screens as static prototypes, culminating in the published living style guide.
2. **Build phase (session 17 →)** — translating the prototypes into a real Next.js + Supabase application, screen by screen, starting with login and the study selector.

See `SESSION_HANDOFF.md`, `CONTEXT.md`, and `DECISIONS.md` for the full working record.

---

*This guide is a living document and will grow as the build phase progresses.*
