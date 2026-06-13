# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-13 | Session 33 COMPLETE — **canonical Site Record** built from `27-site-record.html` (3 entry points, Admin-edit / clinical-read-only); new Add-Site modal fields. NEXT: deferred form polish (SDV panel, sidebar deep-link, query re-open, conditional demographics).

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

**The app is built through the Subject Record with a live, grouped form layer, all on a session-based data store.** The 3-study architecture + full form definitions (**72 forms / 365 fields** across the 3 studies, 20 species ranges) are applied and live in Supabase; on first visit the seed hydrates once per tab into the session store, and from then on **all reads/writes are in-session** (edits reset on tab close). The Subject Record renders real fields with species-specific validation that auto-raises edit-check queries, and the form sidebar groups sub-forms into collapsible visit/info sections with rolled-up status. Session 23 (form-layer fixes + grouped form definitions) is COMPLETE.

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

### Session 22 — COMPLETE ✅ (form layer)
- **Form definitions seeded & applied live.** Per study: 6 templates (Demographics, Screening, Baseline Vitals, Visit 1/2/3) → **108 `form_fields`** total, with a `validation` jsonb on vitals. New **`species_ranges`** table — **20 rows** (5 species × 4 vitals: heart rate, temperature, respiratory rate, weight). Migration `20260609130000_species_ranges.sql`; seed expanded. Applied via `db reset --linked --yes`.
- **Validation engine** (`app/lib/forms/validation.ts`) — pure `evaluateField(field, value, species, ranges)`: a field declares `validation.vital`, the species table resolves the range. `rangeLabel()` gives the "Normal: x–y" hint. (Case Study 3.)
- **Session store** now hydrates `formFields` + `speciesRanges` (`types.ts`, `hydrate.ts`); storage key bumped to `v2`.
- **Subject Record rewritten** (`components/subject-record/SubjectRecord.tsx`) — renders **real fields** from `form_fields`; editing persists via `useStudySession().update()`; **out-of-range vitals auto-raise an edit-check query** (amber flag + inline thread), and going back in-range auto-resolves it (Case Study 1 ↔ 3). SDV verify (CRA) and query respond/resolve also go through `update()` (session only). Demo: AK-2401-001 Baseline Vitals seeded with an out-of-range temp (39.8 vs cattle 38.0–39.3) + its query.
- ⚠️ **"Create new study" NOT built** — deferred (was item 3 of the original plan). Still session-based when built: an `update()` that inserts a new study graph.

### Session 23 — COMPLETE ✅ (form-layer fixes + grouped form definitions)
**Part 1 — 7 fixes (all in `components/subject-record/SubjectRecord.tsx` unless noted):**
1. **Query response flow** — `respondQuery`/`resolveQuery` now mutate status (raised → responded → resolved) via `update()` and persist the **typed** reply with author attribution (controlled compose box). Thread distinguishes human responses from the auto edit-check.
2. **In-Work status icon** — replaced the CSS conic-gradient with the exact **SVG half-moon** from the style guide (`<InWorkIcon/>`, `.si-inwork`), used by the sidebar + group roll-up.
3. **SDV shields** — `isSdvEligible(field)` = `number`/`integer` or any field with a `vital` key; shields show on all of them in SDV mode (was vital-only).
4. **SDV icon swap** — shield toggles `ti-shield` ↔ `ti-shield-check-filled`; verify stamps `verified_by_name` + `verified_at` on the SDV record; note reads **"Verified by [name] · [date]"** in `var(--blue-600)`/`var(--text-xs)`. (Still CRA-gated by design.)
5. **Topbar study picker** (`components/shell/Topbar.tsx`) — pinned current study + switch-to list + **"Go to study list"** link (pattern from `14-list-pages.html`); CSS in `shell.css`.
6. **Equine terminology** — `app/lib/terminology.ts` maps species → housing labels (equine → **Stable / Stall**); `hierarchyLevels(study)` drives the drill-down labels/breadcrumbs/buttons.
7. **Full-path breadcrumb** — Subject Record shows Data Entry → site → barn/stable → pen/stall → subject (resolved from the subject's site/barn/pen).

**Part 2 — grouped form layer:**
- New migration `20260610000000_form_groups.sql` — adds `forms.parent_form_id` (self-ref) + `'file'` to the `field_type` enum.
- **Seed is now generated** — `app/supabase/generate-seed.mjs` → `seed.sql` (**72 forms / 365 fields**). 7 visit/info **groups** (containers, no fields) with 2 sub-forms each + 3 standalone forms (Adverse Event, Unscheduled Visit, ConMed) per study. Per-study field definitions (AK 114 / CA 113 / EQ 138). `species_ranges` aligned to the protocols (cattle HR 40–80, equine temp 37.5–38.5, etc.).
- Sidebar renders groups as **collapsible sections** with a **rolled-up status icon** (worst child) + open-query badge. `parent_form_id` added to `types.ts` + `hydrate.ts`; session key bumped to **v3**. Data-entry progress counts **leaf forms only**.
- Applied via `npx supabase db reset --linked --yes`. Verified: 72 forms / 365 fields live, group tree correct, cattle 39.8 °C and equine HR 90 both auto-raise.
- **Case Study 3 written** in `CASE_STUDY.md` (species validation + grouped form layer).

**Part 3 — UI polish (6 fixes):**
1. **Study list pin** (`app/studies/`) — pin column shows `ti-pin-filled` on the active/pinned study (session-scoped `arken_pinned_study_v1`, defaults to the first study; entering a study pins it; click any pin to change).
2. **Topbar picker** — "Go to study list" link is now text-only (icon removed).
3. **Form sidebar active parent** — the group containing the open child form gets `var(--blue-600)` text + a 2px `var(--blue-600)` left accent (`.form-group-header.active-parent`), **no** `blue-50` fill, so a collapsed active group is still indicated.
4. **Drill-down row actions** — container rows (site/barn/stable/pen/stall) use **`ti-file-description`**; subject/animal rows have **no** action icon (row still clickable).
5. **"+ Add Study"** — primary button on the study list opens a modal (Study name + Client dropdown from existing sponsors, or "+ New client…"). Confirm builds a session study (companion template: study + membership + 1 site + cloned grouped forms/fields) and navigates to it. Logic in `app/studies/page.tsx`; modal CSS in `studies.css`.
6. **Select chevrons** — audited every `<select>`; all carry the SVG chevron (`right 8px`); content selects + the modal select normalized to `padding-right: 32px`. Topbar selects already had compact chevrons.

### Session 24 — interim quick fixes (done, before the forms deep dive)
- **Demo email** → `edc@arken.com` (login prefill + seed/generator).
- **Study list is table-only** — card view + view toggle + the interim table-note removed.
- **Multiple pinned studies** — `app/lib/pinned-study.ts` stores an **array** in `sessionStorage` (`arken_pinned_studies_v1`); `getPinnedStudies` / `setPinnedStudies` / `togglePinnedStudy`. Pinned rows sort to the top (by code) and the topbar dropdown lists all pinned studies (each with its own unpin). **No implicit default; explicit pin/unpin only.** The **only** pinned indicator is the filled pin icon (`ti-pin-filled`) — pinned rows are **not** background-highlighted (`.st-pinned` has no fill).
- **Topbar study-pill chevron** → `ti-chevron-right` (site dropdown SVG was already right-pointing).
- **Dashboard breadcrumb** — single "Dashboard" location breadcrumb via the shared `Breadcrumb` component in `app/study/[studyId]/page.tsx` (the duplicate inside `RoleDashboard.tsx` was removed).
- **"Create new study"** now creates an **empty** study (no sites/subjects/forms), enters as **Admin**, and lands on `/study/[id]/settings` (placeholder).
- **Access-agreement (NDA) gate** — after login, a one-time-per-tab Arken-branded agreement (name required + company + checkbox) gates non-owner visitors. **`OWNER_CODES = ['ARKEN-ADMIN']`** (`app/lib/constants.ts`) bypasses it entirely. On accept, a row is written **directly to Supabase** `nda_agreements` (audit data, not the session store) via `app/supabase/migrations/20260610100000_nda_agreements.sql` (**file only — apply before the insert works**). The access code = the login credential.

### Session 24 — forms deep dive ✅ (done)
All in `components/subject-record/SubjectRecord.tsx` (+ `subject-record.css`), with seed/generator changes.
1. **All field types** render in `renderControl`: `text`, `number` (+ unit hint), `date`/`datetime`, `select` (chevron dropdown), `radio` → **Yes/No two-button toggle** (`.yn-toggle`), `multiselect`/`checkbox` → **checkbox group** (value stored as a JSON array), `calculated` → **read-only computed** (`age_auto_calc` from DOB; `fec_reduction_pct` from screening vs same-visit FEC), `file` → **upload button + filename** (stores name), `coded` → **text + "Look up"** opening a stub **VeDDRA** modal (DM-only), `textarea`.
2. **Required fields** — red asterisk (`.field-req`) on `is_required` labels. Seed: `vital()` + `visit_date` + `informed_consent` + I/E `consent_obtained` are required (via `generate-seed.mjs`).
3. **Field hints** — under vitals show the species range "Normal: x–y unit" (`rangeLabel`); non-vital numbers show their unit; `var(--color-text-tertiary)`/`var(--text-xs)` (`.field-hint`).
4. **Form status progression** — toolbar status **badge** + single role-gated **advance** button: `empty`→`in_work` (auto on first edit) → `in_review` ("Submit for Review", CRC/CRA) → `reviewed` ("Mark Reviewed", CRA/DM/PI) → `finalized` ("Finalize", PI/DM) → `locked` ("Lock", DM, **e-signature password modal**). All via `update()`. **Locked = every field read-only** (`.state-locked`, controls disabled, SDV/Δ hidden). New **In-Review** sidebar icon (amber SVG). Session-only `in_review` status (not in the DB enum — fine, never written back).
5. **Inclusion/Exclusion** — I/E criteria flagged in the seed (`validation.exclusion_criterion`). Any criterion answered **"No"** → red **"Subject does not meet inclusion criteria — PI review required"** banner, persists `subject.ineligible` (session) → **"Ineligible" chip** in the subject header **and** a **warning badge** on the drill-down subject row.

Seed: `generate-seed.mjs` adds `coded()` (→ `validation.coded`) and `crit()` (→ `validation.exclusion_criterion`) builders; `types.ts` gains `FieldValidation.coded/exclusion_criterion` + `SubjectRow.ineligible`; session key bumped to **v4**; applied via `db reset` (this also applied the `nda_agreements` migration). Verified: `tsc`, `next lint`, and **`next build` all clean**.

### Session 24 — form UI fixes ✅ (11 fixes, all in `SubjectRecord.tsx` + `subject-record.css`)
1. **No status chip in the toolbar** — status lives in the sidebar icon; only the advance button remains.
2. **Groups collapsed on load except the active one** — `collapsedGroups` is `null` until first toggle; default = every group collapsed except the active form's parent (Animal Information opens by default).
3. **Sidebar status-icon tooltips** — `StatusGlyph` wraps in `.status-glyph` with a `title` (Empty / In-Work / In-Review / Reviewed / Finalized / Locked / Open query).
4. **Native date picker** — `type=date` + `onClick` calls `showPicker()`; `.field-date` shows the calendar indicator.
5. **Select chevron** — `.field-select` now uses a **down** chevron SVG (right 8px, padding-right 32px, appearance none).
6. **Remarks default OFF** — `modeQueries` starts `false` (was `true`); Queries + SDV are opt-in.
7. **Δ only on a real change** — `baseline[fieldId]` captures the pre-edit (saved) value on first edit; Δ shows only when the baseline is non-empty **and** the value differs (no Δ on first entry of an empty field).
8. **Change-reason panel rebuilt** — 420px; header title + `Δ-[code]` chip + X; context bar old⊘ → new (mono); body = required reason textarea + previous-changes history; footer Cancel + Submit (disabled until filled). **Δ states**: pending (dashed red) → responded (solid blue) → approved (green filled, DM approves in the history list). Persists to a session-only `deltaRecords` array.
9. **Resolved query → green flag persists** — `fieldQueryFor()` returns any query (incl. resolved); resolved shows green `ti-flag-check` (`.flag-btn.resolved`), not the hollow default.
10. **Flags only in Queries mode** — the flag button + amber input + inline query state render only when `modeQueries` is on.
11. **Verified SDV icon persists** — when SDV mode is off, verified fields show a static blue `ti-shield-check-filled` (`.sdv-static`); only the interactive shield buttons hide. Verification is permanent across mode toggles.

Data: `types.ts` adds `DeltaRecordRow` + `Dataset.deltaRecords` (session-only, not from Supabase); `hydrate.ts` seeds it `[]`; session key → **v5**. Verified: `tsc`, `next lint`, **`next build` all clean**.

### Session 24 — form fixes batch 2 ✅ (9 fixes, `SubjectRecord.tsx` + `subject-record.css`)
1. **Pen / Lot ID** — for `livestock_group` studies it renders as a **select** sourced from the study's seeded pens (`penOptions`); other study types keep it as text.
2. **Form body** background → `var(--color-page-bg)` (fields sit on grey, inputs stay white).
3. **`.form-header`** → `display:flex; align-items:center; justify-content:space-between; gap:var(--space-4); flex-wrap:wrap` (dropped the old border/padding now that the page-bg body separates it).
4. **Δ panel old→new** now displays reliably — the pre-edit value is captured into `baseline` for every field type and read into the context bar (old strikethrough mono → new bold mono).
5. **Query flag persistence** — flag visibility = `modeQueries || fieldHasAnyQuery`. A field with any query (open/responded/resolved) always shows its flag; only never-queried fields hide it when Remarks is off.
6. **Inline query message states** — open: full query text (amber); responded: `[CODE] open — view thread` (amber); resolved: `[CODE] resolved — view thread` (green, `.state-resolved`). Amber field background now clears on **responded** (only `open`/raised tints the field).
7. **SDV shield on all field types** — `isSdvEligible` = every type **except** `file`, `coded`, `calculated`, `textarea` (so date/select/yes-no/multiselect now get the shield).
8. **Δ for yes/no + select** — baseline now commits a field's first entry, so a later change to a toggle/select (or any type) surfaces Δ; no Δ on first entry.
9. **SDV verify works for all types** — the handler is type-agnostic (keyed on `field_value_id`); broadening `isSdvEligible` made the shield appear + verifiable for date/select/yes-no/multiselect with a value.

### Session 24 — form fixes batch 3 ✅ (22 items)
**Dashboard / shell / drill-down:** breadcrumb moved into `RoleDashboard` as `.dashboard-bc` (link colour, no weight, `space-3` to greeting — matches Data Entry); topbar site-select chevron made a crisp right-chevron; **site-filtered Data Entry** — a pinned topbar site drills straight to the barn/pen level (`useEffect` on `selectedSiteId` in `data-entry/page.tsx`).
**Form chrome:** `.form-sticky-header` border-bottom; `.form-body` already page-bg; **Manage dropdown** (Copy link / Add unscheduled visit / Print / Export / — / Lock / Sign off / — / **Withdraw** red) — stubs; `.meta-item.group` hidden; **Submit for Review** always shown, disabled until the form has data.
**Status chip / PI override:** one chip at a time — **Ineligible replaces Active**; when ineligible + role **PI**, an **Override** button opens a modal (required reason) that clears `subject.ineligible` (+ `override_reason`) back to Active.
**Change reason:** Δ now appears **on blur** (text) / on change (discrete), comparing a *committed* value, not each keystroke; baseline = **last saved/reasoned** value, so Yes→No→Yes each needs a reason; the **panel was rebuilt to file 30** (`.delta-panel`, 380px: `delta-status-bar` badge + desc, `delta-context` old→new, `delta-thread` history, `delta-compose`).
**Queries:** clicking a **hollow flag opens a Raise Query** panel (CRA/DM create the query, creating the field value if needed); **resolved** shows the green `ti-flag-check` with **no inline text** (text only for raised/responded); the **query panel was rebuilt to file 30** (`panel-header-left` + `status-bar` + field-context with the value; role-aware raise/respond/resolve compose). Panel target is now a **field** (`panelField`), not an fvId.
**SDV:** in SDV mode the toolbar shows **Verify all** (CRA) + **Mark SDV complete** (disabled until every *entered* eligible field is verified); the **VeDDRA lookup is now a 420px slide-in panel** (search + term list; opens for all roles, selection DM-only); the shield now shows on **coded** fields too (`isSdvEligible` only excludes file/calculated/textarea); SDV records are keyed on `field_value_id` (globally unique) so verification **persists across form navigation**.
Verified: `tsc`, `next lint`, **`next build` all clean**. Read `30-subject-record.html` for the panel structures before rebuilding (items 14, 18). Data: `SubjectRow.override_reason` added.

### Session 24 — form fixes batch 4 + edit-check/query split ✅
**Architectural split — edit checks vs queries.** Auto out-of-range alerts are now **edit checks** (`Dataset.editChecks`, `EditCheckRow`), separate from manual **queries**. Field shows an **orange `ti-alert-circle`** (`EC-` prefix); manual/converted queries use **flag** icons (`Q-` prefix, `from_edit_check` on the query). `hydrate.ts` converts seeded "Auto edit-check:" queries → editChecks. Resolution: (A) correct the value → edit check resolves + Δ fires; (B) click the alert → **Edit Check panel** (title "Edit Check", EC- id, the auto message) → explain → **converts to a query** (open) that follows raised→responded→resolved. Validation engine unchanged; `setFieldValue` now raises/resolves an edit check (not a query).
**Δ baseline persistence** — moved to the store (`Dataset.fieldBaselines`, keyed by `field_value_id`), so Δ survives navigation. Δ uses the stored value (settled), suppressed only while the field is focused (`editingFieldId`) — so text settles on blur, discrete (incl. **select**) settles on change. Baseline becomes the new value on reason submit (Yes→No→Yes each needs a reason).
**Other:** dashboard breadcrumb underlined (item 1); topbar site selector auto-width, chevron right after text (item 2); query/EC panel header shows **only the ID chip** (status badge removed — status row keeps it, item 5); inline format `[Q-XXXX] …` / `[EC-XXXX] …`, resolved = green flag with **no text** (items 6, 7); panel buttons role-aware — **CRA** Resolve(primary)+Respond(secondary), **CRC** Respond, **DM** Resolve+Manage (item 8, `.btn-comment`); **SDV mode hides Submit for Review** (item 9); **PI override** now shows a persistent **amber banner** on the I/E form (`PI [name] … on [date]`) replacing the red one (item 10). New token `--orange-600`. Session key → **v6**.
Verified: `tsc`, `next lint`, **`next build` all clean**.

### Session 24 — form fixes batch 5 ✅
1. **Δ stays after submit** — `deltaStateFor` checks the change-reason records first: a submitted reason keeps the Δ button **solid blue (responded)** → green when DM approves; it no longer vanishes when baseline updates to the new value.
2. **Mark SDV complete always enabled** — removed the all-verified gate (SDV scope varies by study/site); Verify all stays secondary.
3. **Queried styling on all controls** — the amber queried state now applies to `select`, the pen select, `yes/no` toggles, and multiselect groups (`.field-select.query` / `.yn-toggle.query` / `.check-group.query`), not just text/number inputs.
4. **Re-raise after resolved** — a resolved query's panel shows the resolved thread + a fresh compose to raise a **new** query (new `Q-` id) for CRA/DM; the panel then tracks the new query.
5. **Topbar site selector** — replaced the native `<select>` (which sized to the widest option, leaving empty space) with a **fit-content button + dropdown** (`.tb-site-btn` / `.tb-site-menu`), so the chevron sits immediately after the site name.
6. **Submit for Review gate** — disabled when there's any **unresolved edit check**, any **pending change reason**, or any **empty required field**; **open manual queries do NOT block** submission. (`submitBlocked` / `submitBlockReason` in `SubjectRecord.tsx`.)
Verified: `tsc`, `next lint`, **`next build` all clean**.

### Session 24 — form fixes batch 6 ✅
1. **NDA name throughout** — `app/lib/use-nda-name.ts` (`useNdaName()` / `getNdaName()`) reads the visitor's name from `sessionStorage` (`arken_nda_v1`). Used for the dashboard greeting (now "Good [morning/afternoon/evening], [first name]"), SDV verified-by, and the author on **new** queries / responses / resolutions / change reasons (seeded/historical records keep their original names; falls back to the demo user).
2. **Change reason — full fix** — `deltaStateFor` is now **pending whenever the value differs from the last submitted baseline** (so A→B→A each needs a reason); only shows responded/approved when the value equals the baseline *and* the latest record set it. Full delta history is kept; the Δ never auto-clears on revert.
3. **SDV on untouched fields** — `toggleSdv` / `verifyAll` create the instance + field value if missing, so any eligible field can be verified.
4. **SDV blocking** — a field can't be verified while it has an **open edit check**, a **pending change reason**, or an **open query**; the shield is disabled with a tooltip (`sdvBlockReason`).
5. **Multiple queries per field** — the panel lists **every** query on the field in chronological order (`QueryRow.created_at`), each as a `.query-block` with its full thread; compose for the next at the bottom. Never replaces previous queries.
6. **Sidebar SDV icons** — a shield slot per form row, only when Remarks SDV is on: outline `ti-shield` (partial), filled `ti-shield-check-filled` (form marked complete via the new `instance.sdv_complete`), none otherwise. "Mark SDV complete" now actually sets the flag.
7. **Edit-check icon removal** — confirmed `editCheckFor` looks up by `field_value_id` + open status, so a resolved/converted check clears its orange icon immediately.
8. **DM query Manage dropdown** — replaced the auto-resolve button with a menu: **Respond** (comment), **Resolve** (only after a response exists), **Close without response** (required reason modal → stored as a system message on the thread), **Reassign** / **Escalate to PI** (stubs → toast). Never auto-resolves.
Data: `QueryRow.created_at`, `FormInstanceRow.sdv_complete`; session key → **v7**. Verified: `tsc`, `next lint`, **`next build` all clean**.

### Session 24 — form fixes batch 7 ✅
1. **NDA name in the shell** — `useNdaName()` / new `useNdaInitials()` + `initialsFromName()` (`app/lib/use-nda-name.ts`). The studies-list top-right name + avatar and the app **topbar avatar** now show the visitor's name and derived initials (first+last initial, else first letter) instead of the hardcoded "Elisa Tron / ET". (The team-roster `UserRow` on the dashboard is seeded data — left as-is.)
2. **Toggle change log / approved → green** — `deltaStateFor` now reflects the most recent reason **matching the current value** (not just the last record overall), so a DM approval flips the field Δ to green even across A→B→A. Each toggle change is still its own delta record, visible chronologically with its own Approve.
3. **Baseline on commit, not keystroke** — `setFieldValue` no longer baselines an empty field's first keystroke; new `commitBaseline(field)` captures the baseline on **commit** (text → onBlur, discrete → onChange) only when the value is non-empty. Result: **no Δ appears while typing the first value**; Δ only after a previously-saved value is changed and the field is left.
4. **Remarks SDV option CRA-only** — new `canSDV(role)` in `permissions.ts` (CRA). The "SDV mode" remarks item is hidden for every other role, and an effect drops `modeSdv` if the active role loses SDV permission.
5/6. **SDV requires a saved value** — reverted batch-6's create-field-value-on-verify. `toggleSdv` and `verifyAll` now skip / refuse fields with no non-empty value (never create a field value); the per-field shield is disabled with an "Enter a value before verifying" tooltip on empty fields.
No data-shape change → session key stays **v7**. Verified: `tsc`, `next lint`, **`next build` all clean**.

### Session 24 — form fixes batch 8 ✅ (change-reason Δ correctness)
1. **No Δ on first entry (real fix)** — the baseline is now captured only from a *previously-saved* value, never mid-typing. `setFieldValue` takes `captureBaseline` (true only for discrete controls, whose pre-edit value is the baseline); text/coded/textarea inputs capture on **focus** via `captureBaselineOnFocus()` (empty at focus → no baseline). So a brand-new entry — even after blur — raises no Δ; a later edit of the now-saved value does. (Replaces batch-7's `commitBaseline`, which baselined the first keystroke.)
2. **Per-reason data change in the panel** — each reason card now shows its own `old_value → new_value` transition (monospace, above the reason) from the `DeltaRecordRow`; the top context shows the most recent change.
3. **Δ green only when ALL records approved** — `deltaStateFor` at baseline returns `approved` only if **every** delta record for the field is DM-approved; if any is still responded it stays blue. (Was: keyed on the latest record only.)
4. **No same-value Δ** — top context shows the latest *real* transition, never `X → X`; `submitDeltaReason` refuses `new === old`; discrete `captureBaseline` skips `prev === value`; the compose box disables with "No pending change to explain" when the value matches the baseline.
CSS: `.delta-entry-change/-old/-arrow/-new`. No data-shape change → session key stays **v7**. Verified: `tsc`, `next lint`, **`next build` all clean**.

### Session 24 — form fixes batch 8b ✅ (multi-transition Δ tracking)
The change-reason model moved from a single baseline-vs-current comparison to **one delta record per transition**. `DeltaRecordRow.status` gains `pending`; `Dataset.fieldBaselines` is **removed**.
- **Every change records its own transition.** `recordTransition(d, fvId, prev, next)` pushes a `pending` record (reason ""), skipping first entries (`prev === ""`) and no-ops (`prev === next`). Discrete controls record on change (`setFieldValue(…, true)`); text inputs snapshot the value on **focus** and record one transition per **blur** (`snapshotTextFocus` / `recordTextEdit`). So **A→B→C without reasons = two records** (A→B, B→C), each owed its own reason. Applies to all field types.
- **`deltaStateFor`** is now derived purely from records: any `pending` → red; all `approved` → green; else blue; none → null.
- **Panel** shows every transition chronologically; each **pending** card has its own reason textarea + Submit (`submitReasonForRecord` → responded), each responded/approved card shows reason + meta + (DM) Approve. Per-record drafts in `recordReasons`. The single bottom compose is gone. Top context shows the latest transition.
- **First entry** still raises no Δ; **same-value** changes are never recorded (item 4 preserved).
- CSS `.delta-entry.pending`. Session key → **v8** (shape changed). Verified: `tsc`, `next lint`, **`next build` all clean**.
- **Consistent card format** (final): the Δ panel **always** uses one dashed-red card per pending transition (own old→new + reason box + Submit), regardless of count — no single-vs-multiple adaptation. Mirrors the paper-CRF correction convention; rationale documented in `CASE_STUDY.md`. Responded/approved always render as cards.

### Session 25 — COMPLETE ✅ (Animals list)
**Built the Animals list from `29-animals-list.html`** as a study-wide React route at `app/study/[studyId]/animals/page.tsx` (+ self-contained `animals.css`), wired to the session store and the app shell.
- **Routing:** added `animals: "animals"` to `NAV_ROUTES` (`lib/permissions.ts`) — the Animals sidenav item (already in NAV_ITEMS for CRC/CRA/DM/PI/Sponsor) now navigates here.
- **Adaptive per study type** (`studyRow.type`):
  - **companion** → demographic columns (Sex/Age/Breed/Weight) + a single **Site** column; no barn/pen filters.
  - **livestock_individual** (equine) → demographic columns + **Location** breadcrumb (Site › **Stable** › **Stall**, terminology-driven via `housingTerms`); Stable/Stall filters.
  - **livestock_group** → **no** per-animal demographics (those are group-level); **Location** breadcrumb (Site › Barn › Pen); Barn/Pen filters.
- **Live data** from `useStudySession()`: subjects → rows (code, status, randomization_arm as Group/Arm, resolved site/barn/pen names); forms progress = completed leaf-form instances / total leaf forms; **open (unresolved) query count**; last-visit pulled from the `visit_date` field value; demographics (sex/age/breed/weight) pulled from field values by field **code** (show "—" when not entered — sparse seed, honest). Ineligible subjects get a red row + Ineligible badge (replaces the prototype's invented "critical"/"overdue" data).
- **Faithful UI:** stat strip, bulk-action bar (appears on selection), search + status/group/site/barn/pen filters, **column chooser** (toggle/reset; Animal ID required), sortable sticky-header table, summary bar, and the 420px **Raise query** slide-in panel (live animal context + live existing queries on the animal).
- **Live permissions:** the row "Raise query" icon + bulk Raise-query button are gated by `canQuery(role, "raise")` → **hidden for CRC**, shown for **CRA/DM**. Row click / clipboard icon → Subject Record (`/data-entry/{subjectUuid}`). Topbar site picker drives the site filter (resets barn/pen). **"Send query" is a faithful stub** (the real raise/respond/resolve workflow lives in the Subject Record); Export / SEND export / Add animal / bulk lock/sign-off are stubs.
- Verified in-browser (Playwright) across all three studies + interactions (sort, filters, column chooser, role gating, query-panel context, row nav); `tsc`, `next lint`, **`next build` all clean**.
- **Follow-up fix:** the Raise-query panel's **Field reference** input became a grouped `<select>` sourced from the study's leaf forms + fields (`<optgroup>` per form, option text `[Form] — [Field]`).

### Session 26 — COMPLETE ✅ (three new clinically-realistic studies)
**Replaced AK-2401 / CA-1103 / EQ-3302 entirely** with three new studies. Seed-only rebuild + one small migration + a terminology/engine tweak.
- **Migration** `20260612000000_chicken_species.sql` — `alter type species add value 'chicken'`. (Chicken `species_ranges` rows live in the **seed**, not the migration: seed.sql `truncate`s + re-seeds species_ranges on every reset, so anything in the migration would be wiped — and keeping the enum value in its own migration avoids the Postgres "new enum value used in the same transaction" restriction.)
- **Terminology** (`lib/terminology.ts`) — `chicken → { barn: "House", pen: "Pen" }`. Drives Animals filters ("All houses"/"All pens"), drill-down labels, breadcrumbs.
- **New studies** (UUIDs `…2401` / `…3001` / `…0801`):
  - **PH-2401** Phytogenic Feed Additive Broiler Trial — `livestock_group`, **chicken**, Site → **House → Pen**. 4 feed-measurement visits (Day 0/14/28/42), 3 sub-forms/visit (Physical Exam / Measurement / Feed Additive). 26 forms / 95 fields. Subjects = pens (PH-2401-P01…P05).
  - **HF-3001** Beef Heifer Trace Mineral Trial — `livestock_individual`, **bovine**, Site → Barn → Pen → Animal. 5 visits (Day -30/0/35/60/90), 3 sub-forms/visit (Physical Exam / Lab Samples / Treatment Admin). 30 forms / 121 fields. Subjects = **15-char RFID tags** as subject_code.
  - **CA-0801** Canine Atopic Dermatitis Diet Trial — `companion`, **canine**, Site → Subject (+ owner). 5 visits (Week 0/2/4/8/12), 3 sub-forms/visit (Physical Exam / Owner Reported / Diet Dispensing). 30 forms / 140 fields.
  - Each study also has a standalone **Randomization** form linking the arm to a treatment lot/batch/kit (Feed Additive Lot / Injection Batch / Diet Kit) — the **inventory bridge** (Case Study 4). Total **86 forms / 356 fields**.
- **species_ranges** — now **23 rows / 6 species**; added `chicken` (temperature 40.6–42.2 °C, heart_rate 250–400 bpm, **ammonia_level 0–25 ppm** — a non-mammalian vital used by the broiler house air-quality field).
- **I/E polarity** — new `FieldValidation.exclusion_if` (`"Yes"|"No"`, default `"No"`). The Subject Record I/E engine now fails a criterion on its declared answer, so "exclusion if Yes" criteria (prior antibiotics, active lameness, ectoparasites) and positive inclusion criteria (consent, tract score ≥2) both evaluate correctly. Generator: `crit(code,label,req,failOn)` + `excl(...)` builder.
- **Animals list** — adapts automatically: chicken (livestock_group) hides per-animal demographics and shows House/Pen filters via terminology. Also **broadened the demographic value lookup** to recognise the new field codes (`sex_neuter_status`, `body_weight`/`screening_weight`/`individual_scale_weight`, `breed_type`/`breed_strain`) so HF/CA Sex/Weight/Breed populate from real values.
- **Generator rewritten** (`generate-seed.mjs`) — was one shared tree; now **per-study trees** (`PH_TREE`/`HF_TREE`/`CA_TREE`) with hierarchy, subjects, and demo data all generated. Demo per study: a completed Screening + filled Randomization, an **open edit check** (out-of-range vital → auto edit-check: PH ammonia 32, HF temp 40.1, CA temp 40.0), and a **responded query**. Session key → **v9**.
- Applied via `npx supabase db reset --linked --yes`. Verified in-browser (Playwright): all 3 Animals lists, demographics, Subject Record tree, the edit-check orange alert + species range hints. `tsc`, `next lint`, **`next build` all clean**.

### Session 26b — login fixes ✅ (quick, post-26)
- **NDA gate fix** — removed the sessionStorage-based skip in `app/login/page.tsx`; the access agreement now appears after valid credentials for **any non-`ARKEN-ADMIN`** code (owner codes still bypass). Normal in-app nav never routes back through `/login`, so it doesn't nag.
- **Login cleanup** — removed the `.login-divider` element and `.btn-sso` button (+ dead CSS).

### Session 27 — COMPLETE ✅ (CA-0801 rebuilt as a rich multi-site companion study)
**Replaced CA-0801 entirely** — now **DermAlliv™ Canine Atopic Dermatitis Study** (Protocol DERM-2026-104): randomized, double-blind, placebo-controlled, **3 sites**, 2:1 Active:Placebo, 12-week schedule. Seed-only rebuild (+ generator multi-site support + 2 small UI/Subject-Record additions).
- **Multi-site generator** — the hierarchy emit now supports `study.sites` (array, each with a `code`); subjects reference `s.site`. PH/HF keep their single `site:` (back-compat wrapper) and emit byte-identical. CA: **3 sites** — 101 Lakeside (Austin), 102 Green Valley (Denver), 103 Coastal (Raleigh).
- **CA form tree** (`CA_TREE`) — **53 forms / 221 fields** (total now **109 forms / 437 fields**): Animal Information (Demographics + Owner Information), Screening (PE / Baseline Dermatology / Owner Consent / **Eligibility Assessment** (10 criteria, mixed polarity) / Medical History / Laboratory Results), Baseline / Randomization (Randomization / Baseline Clinical / Drug Dispensation / Owner Training / Baseline QOL), Follow-Up 1–3 (7 sub-forms each) + End of Study (7 sub-forms), and 5 standalone forms: Adverse Event (+ SAE fields), Protocol Deviation, Subject Status, ConMed, **ePRO — Owner Daily Diary**.
- **Subjects** — **13 dogs** generated from a dog table (`CA_DOGS`): 12 randomized (4/site, 8 Active / 3 Completed / 1 Withdrawn) **+ 1 screen failure** (Milo, fails the baseline-pruritus inclusion criterion). Realistic names/breeds/sexes/DOBs/weights/microchips + one owner each (13 `companion_owners`). Demo: a Demographics + Owner Info instance for every dog; **2 dogs** with completed Screening + filled Randomization (Cooper, Bella + Bella's EOS = Completed); **1 open edit check** (Charlie, Screening temp 40.1); **1 open query** (Daisy, CADESI-04). Generator's `query` helper now emits an **open** query when no `response` is given.
- **Dashboards** — `RoleDashboard` is now study-aware (`studyCode`). For CA-0801, bespoke **CRC / PI / DM** dashboards render four wired aggregate groups — **Enrollment** (Target 60 · Screened 72 · Randomized 60 · Active 48 · Completed 8 · Withdrawn 4), **Compliance** (ePRO 92% · Visit 96% · Medication 94%), **Safety** (AEs 12 · SAEs 0 · Open reviews 1), **Data quality** (Open queries 18 · Missing forms 6 · Pending signatures 3) — plus role-specific cards (CRC queries/visits · PI site enrollment + 2:1 randomization balance · DM completeness + queries-by-type). Other studies/roles keep the generic renderers. *(Generic CRC/PI/DM/etc. dashboards still show placeholder AK-era detail for PH/HF — not yet rebuilt.)*
- **ePRO read-only stub** — the Subject Record renders the **ePRO — Owner Daily Diary** form with an info-note banner + **all fields disabled** (`readOnly = locked || isEproForm`); editability levers (`ro`, `state-locked`, SDV, Δ) all key off `readOnly`.
- **Animals list** — Age column now computes whole-year age from a stored DOB when age is a calculated/unstored field (`ageFromDob`).
- Session key → **v10**. Applied via `db reset`. Verified in-browser (Playwright): 13 dogs across 3 sites, status mix + screen failure, rich tree, edit check, ePRO read-only, all 3 CA dashboards. `tsc`, `next lint`, **`next build` all clean**.

### Session 28 — COMPLETE ✅ (12 structural fixes — visual + data, mostly CA-0801)
1. **`.studies-content` → 960px** (`studies.css`).
2. **Reviewed status icon** — added `ReviewedIcon` (exact purple `#BF65D5` half-moon SVG from `docs/index.html`); `StatusGlyph` now renders it for `reviewed` (was a CSS div).
3. **Enrollment graph — real + restyled.** New `StackedEnrollBar` widget: segments **Active (blue-600) / Completed (green-600) / Withdrawn (amber-600) / Screen failures (text-tertiary)**, the **enrollment target is a dashed line**, not a colour (removed the "target met" green). Counts derived from the store. New token **`--amber-600`**.
4. **Compact open-queries card** — dense one-row-per-query list (`.dq-*`): subject · `Q-xxxx` ref · field label · status · age. Replaces the big QueryRow cards.
5. **Subject Record breadcrumb** — confirmed full path **Data Entry › [Site] › [Subject ID]** (`.sr-bc`, already store-derived; verified working).
6. **Subject switcher** — `ti-arrows-exchange` button beside the subject ID opens a searchable popover of the study's subjects (`.subject-id-row` / `.subject-switcher`, ported from file 30); selecting navigates to that record.
7. **Dashboard from real data** — `RoleDashboard` computes `StudyAggregates` from the session store (`computeAggregates`): enrollment by status, open queries/edit-checks, per-site enrolled, arms, form-status counts, AEs/SAEs. CA-0801 CRC/PI/DM render entirely from it (no hardcoded counts). *(CA real counts are small — 12 randomized / 8 active — because only 13 dogs are seeded; that's the point of "derive from the store, not the protocol target of 60.")*
8. **Select font-size** — `.field-select` → `var(--text-base)` to match `.field-input`.
9. **Completed / withdrawn subjects are read-only** — `subjectClosed = status completed|withdrawn` folds into `readOnly`, so all fields disable, **Submit/Finalize/Lock + SDV-action buttons hide**, and the Δ/SDV affordances drop. Persistent banners: withdrawn → amber *"Subject withdrawn on [date] — [reason]. Data collected prior to withdrawal is preserved for analysis."* (date/reason sourced from the Subject Status form — seeded Molly's withdrawal); completed → *"Subject completed the study … All forms are read-only."* Existing queries stay manageable via the query panel (not gated by read-only). *(Simplification: the whole closed subject is read-only; per-visit "forms after the withdrawal date" gating is not modelled.)*
10. **Form section headers** — forms with vital fields render visual clusters: **Examination → Vital Signs → Assessment** (`.form-section-title`, derived from `validation.vital`, no reordering, no seed change). Forms without vitals stay flat.
11. **+6 queries** (2 per study, different subjects/fields, mix of raised + responded): PH (feed-additive-lot **open**, dead-bird-count **responded**), HF (injection-batch **open**, screening-weight **responded**), CA (Cooper PVAS **open**, Bella body-weight **responded**). Generator's `query` helper emits **open** when no `response` is given. **12 query rows** total in the seed.
12. **Animals list** — Subject ID (`subject_code`, e.g. `CA-0801-101-01`) is already the clickable `cell-link` first column (no name column); confirmed.
Session key → **v11**. Applied via `db reset`. Verified in-browser (Playwright): real enrollment graph + chips, compact query list, breadcrumb, switcher (13 items), Reviewed SVG, section headers, withdrawn banner + hidden Submit, select 14px. `tsc`, `next lint`, **`next build` all clean**.

### Session 29 — COMPLETE ✅ (structural fixes batch 2)
1. **Enrollment graph restyle** — `StackedEnrollBar` drops the legend + dashed target line; segment colours now **Active `--blue-400` (new token) / Completed `--green-200` / Withdrawn `--red-200` / Screen-failures `--color-border`**.
2. **Card padding** — `.dq-row` / `.dq-empty` → 16px L/R; inline notes → `.card-note` (16px). Audited the other card widgets — already 16px (`enroll-wrap`, `agg-list`, `safety-list`, `sdv-row`, `dash-table` cells).
3. **Equal-width dashboard cards** — the CA CRC/PI/DM bottom rows use `grid repeat(2,1fr)` (was `dash-2col` 2fr/1fr), so the **Open queries card matches the cards above** (all 575px).
4. **Clickable breadcrumb segments** (Subject Record) — **Data Entry** → `/data-entry`; **Site** (and any barn/pen) → `/data-entry?site=<id>`; subject ID is the current page (`.bc-cur`, not a link). `data-entry/page.tsx` reads `?site=` (via `useSearchParams`) to pre-drill into that site.
5. **Repeating-table forms** — **ConMed · Adverse Event · Protocol Deviation** now render as a **table of entries** (one form instance each) instead of a single field grid: summary columns (`REPEATING_COLUMNS`), an **"+ Add [form]"** button, **Edit** (pencil → 420px `slide-panel entry-panel` with the full field set) and **Delete** (trash → confirm modal) per row. Entries are real **session form instances** — `addEntry()` pushes a new instance, `setEntryVal()` writes per-instance values, `confirmDeleteEntry()` removes the instance + its values/queries/edit-checks/SDV. The per-form Remarks/SDV/advance toolbar is hidden for these forms. `REPEATING_FORMS` gates it by form name; closed (completed/withdrawn) subjects keep Add/Delete hidden (read-only).
Verified in-browser (Playwright): enrollment colours + no legend/target line, dq 16px, all cards 575px, breadcrumb site link → `?site=`, ConMed add→row→panel(9 fields). `tsc`, `next lint`, **`next build` all clean**. No seed/session-key change.

### Session 30 — COMPLETE ✅ (fixes batch 3 — dashboard, forms, permissions)
**Dashboard:** (1) open-queries stat chips use **`accent-alert`** (orange); (2) `.stat-chip-val.good` → **`--green-400`** (new token); (3) enrollment bar **legend re-added** (compact dot + label + count) with **Active `--blue-600` / Completed `--green-500` / Withdrawn `--red-400` / Screen-failures `--slate-400`** (new tokens), bar colours matched; (4) a **TODO** in `RoleDashboard.tsx` to fully derive all dashboards from store aggregates in a final pass.
**Forms:** (5) AE repeating panel — first field is now **AE term** (free text); **AE number is auto-generated** (`AE-0001…`, read-only, set on add per subject); **Event term (VeDDRA)** has the **coded Look-up** button (the lookup is now instance-aware via `lookupInstId` so it writes to the right entry). (6) `height: 32px` enforced on all form `input`/`select` (form body + entry panel); inline icon affordances stay 24px. (7) **Completed subjects: every scheduled-visit leaf form is `finalized`** — `generate-seed.mjs` computes `caVisitLeafKeys` (Screening / Baseline-Randomization / Follow-Ups / End of Study) and emits finalized instances (39/subject × 3 completed = 117 finalized).
**Permissions — Add buttons (drill-down `data-entry/page.tsx`):** (8) **Add Site** — **Admin** only — modal (Site name* / Site number* / PI / Location); `SiteRow` gained optional `location` + `principal_investigator` (+ hydrate). (9) **Add Barn/Pen/Stable/Stall** — **CRC/DM/Admin** — modal (Name); auto codes `B{n}`/`P{n}`. (10) **Add Animal/Subject** — **CRC/CRA/Admin** — creates an empty session subject (`{code}-{NNN}`, status screening, hierarchy resolved from the drill context) and **navigates to its Subject Record** (like Add Study). All via `update()` (session only).
**Bug fix:** the drill-down nav effect depended on `dataset.sites`; `update()` re-clones the dataset (new array ref) so any add reset the drill-down to root — removed that dep (kept `siteParam`/`selectedSiteId`/`ready`/`studyId`).
Session key → **v12** (SiteRow shape). Applied via `db reset`. Verified in-browser (Playwright): accent-alert chip, green-400, legend colours, AE term/AE-0001/lookup, Bella finalized icons, Admin-only Add Site, CRC Add barn (creates + stays), CRC Add animal → new `CA-0801-014` record. `tsc`, `next lint`, **`next build` all clean**.

### Session 31 — COMPLETE ✅ (Admin Data Entry access + 2 small fixes)
1. **Admin can browse Data Entry** — added `Admin` to the `data-entry` nav item (`permissions.ts`). Admin navigates the drill-down (site → barn/pen levels) and uses **Add Site/Barn/Pen**, but **clicking a subject/animal row does NOT open the Subject Record** — `drillInto()` blocks it for Admin and shows an inline toast: *"Data entry is restricted to clinical roles."* (`.de-toast`, auto-dismiss). Admin sees the subject list but no individual records.
2. **AE coded-field width** — the repeating-entry panel's coded inputs (`Event term (VeDDRA)`) are capped at **max-width 180px** (`.entry-field .coded-field .field-input`) so the **Look up** button fits on the same row without overflow.
3. **Add-Site shortcut note** — comment in `data-entry/page.tsx` (above `createSite`) + a line in `PORTFOLIO_GUIDE.md`: *"Full site management (staff, activation, configuration) belongs in Settings — the Add Site button in the drill-down is a quick shortcut only."*
Verified in-browser: Admin nav shows Data Entry; Admin drills to the subject list, click → toast (no navigation); AE coded input = 180px, Look-up on-row. `tsc`, `next lint`, **`next build` all clean**. No seed/session-key change.

### Session 32 — COMPLETE ✅ (Sites section + coded-field flex)
1. **Sites nav (Admin-only)** — new `sites` nav item (`ti-building-hospital`) + `NAV_ROUTES.sites` (`permissions.ts`). **Removed `Admin` from `data-entry`** (and reverted the Session-31 Admin subject-click toast) — Admin is now out of the clinical data flow entirely; structure management lives in Sites.
2. **`/study/[studyId]/sites/page.tsx`** — sites table: **Site # · Name · PI · Location · Status (Active/Setup/Closed) · Enrollment (enrolled/target, per-site target = study target ÷ #sites) · Open queries** (all store-derived). **Add Site** primary button (Admin) → same modal as the drill-down. Row click → the Site Record.
3. **`/study/[studyId]/sites/[siteId]/page.tsx`** — Site Record: details (number/name/PI/location/contact/status), enrollment metrics (enrolled/target + Active/Completed/Withdrawn/Screening/Open-queries), a **staff & roles placeholder** roster, and an **Edit** button (Admin) → modal editing name/number/PI/location/status via `update()`. Self-contained `sites.css`.
4. **VeDDRA coded-field layout** — `.coded-field .field-input { flex: 1 1 auto }` + `.lookup-btn { flex: 0 0 auto }` (removed the 180px cap): the input takes the available width and the **Look up** button is fixed/auto — applies in the main form and the AE repeating entry panel.
5. **Drill-down note** updated — the `createSite` comment now points to the Sites section (the site-level add path only renders for Admin, who isn't in Data Entry, so it's effectively unused there).
No seed / session-key change. Verified in-browser: Admin nav = Sites (no Data Entry); sites table (3 sites, 5/20, queries); Site Record details/metrics/staff/Edit (Admin only; PI edit persists); coded input flex:1. `tsc`, `next lint`, **`next build` all clean**.

### Session 33 — COMPLETE ✅ (canonical Site Record from `27-site-record.html`)
1. **Site Record rebuilt** (`/study/[studyId]/sites/[siteId]/page.tsx`) faithfully from `27-site-record.html` — **THE one canonical site-record page**: header (breadcrumb + Export/Audit/Edit), a **5-stat strip** (Subjects enrolled + progress · Site status · Open queries · Forms submitted · Current protocol — all store-derived), and **5 cards**: Site information (Identification / Address / Operational), Site contacts (PI from store + illustrative CRC/CRA), Protocol & amendments (collapsible v2.1/v2.0/v1.0 + Add amendment), Regulatory & ethics, Site visits (collapsible + Log visit). Real fields wired to the store (name, ID, location→city/state, PI/phone/email, time zone, status); amendments/visits/regulatory docs are illustrative.
2. **Three entry points** — (a) **Admin**: Sites nav → table → row; (b) **CRC/CRA/DM/PI**: Data Entry drill-down → **"Open site record"** at the site level (`data-entry/page.tsx` wires the site-level button → `/sites/[id]`); (c) **Settings** — noted in a code comment for the future. Breadcrumb adapts (Admin → "Sites", clinical → "Data Entry").
3. **Permissions** — **Admin** gets an **Edit** toggle (enables Site-info / Regulatory inputs + Save footers) and **Add amendment / Log visit / Add contact**; **clinical roles see read-only** (no Edit/Add, inputs disabled). Save persists the real site fields via `update()`.
4. **Add Site modal fields** updated (sites list + the modal): **Site name\* · Site ID/number\* · Time zone (select) · Investigator name\* · Investigator phone · Investigator email** (was name/number/PI/location). `SiteRow` gained optional `time_zone` / `investigator_phone` / `investigator_email` (session-only, not in the DB seed). `TIME_ZONES` lives in `sites/constants.ts` (Next.js forbids arbitrary named exports from a route's `page.tsx`).
5. **VeDDRA coded-field flex** (re-confirmed): `.coded-field .field-input { flex: 1 1 auto }` + `.lookup-btn { flex: 0 0 auto }` — input takes available width, Look-up button fixed/auto (main form + AE entry panel).
No seed / session-key change. Verified in-browser: Site Record (5 cards/stats, Admin Edit→10 editable inputs+Save); Add Site modal new fields; CRC via "Open site record" → read-only (Export/Audit only, inputs disabled). `tsc`, `next lint`, **`next build` all clean**.

Deferred form polish (after Animals list):
- **SDV panel** — a dedicated source-data-verification surface (not just the per-field shield): progress, per-field verify, bulk.
- **Sidebar deep-link** — opening a sub-form via URL should expand/select its group.
- **Query panel** — re-open a resolved query; richer thread.
- **Case Study 4 — conditional demographics** (breed lists, production-purpose tags that appear/validate per animal). Age auto-calc is already done.

Notes:
- Everything is in-session — no Supabase writes; edits reset on tab close.
- **"Create new study" is now built** (Part 3, fix 5) — companion template only; livestock templates + richer setup can come later.
- To change form definitions: edit `generate-seed.mjs`, run `node app/supabase/generate-seed.mjs`, then `npx supabase db reset --linked --yes`.

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

> "This is the handoff doc for Arken EDC. We're in session 23. The form layer is built and live — the Subject Record renders real fields from form_fields with species-specific validation (species_ranges) that auto-raises edit-check queries; everything is in-session via useStudySession().update(). Read the handoff fully, then work the Session 23 fix list: (1) fix the broken query response/resolve flow; (2) correct the in-work status SVG icon to match the style guide (docs/index.html); (3) SDV shields — show on all vital fields + swap icon on click; (4) topbar study dropdown with pinned study + 'go to study list' link (ref 14-list-pages.html); (5) equine terminology Barn→Stable, Pen→Stall; (6) full-path breadcrumb on the Subject Record; (7) review form grouping. Start the dev server and verify each fix in-browser as it lands."
