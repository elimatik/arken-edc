# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-18 | **Session 56 COMPLETE — App-wide table-sort standard (shared `useTableSort` + `<SortTh>`): asc → desc → clear, one column at a time; ID columns never wrap.** Session key **v23**. **137 forms / 989 fields** across the 3 studies.

**What's built this milestone (Sessions 42–49):**
- **Batch Entry feature — complete.** A `ti-table` "Batch entry" button (gated to studies with `batch_eligible` forms — BR-2502 only) on the Animals list + the animal-level Data-Entry drill-down opens a 2-step flow: a **form picker** with smart "due today" suggestions (from each animal's enrollment date + visit windows D0±0/D3±1/D7±2/D14±3/D28±4; no duplicates; **forms every non-withdrawn animal already completed are dropped**; click a card to open), then a **full-screen grid** — no checkboxes (every visible animal is in), a **shared "Visit date" header field** (section header above a row of compact 220px fields) that auto-fills every animal without a saved date, one column per field, **edit checks fire on blur** (amber cell, non-clickable EC- indicator pointing to the subject record), a **per-cell Δ** (dashed-red button → the 380px change-reason panel), a one-chip Status column (red **Error** if any open EC, else neutral **Saved**, else empty), and a summary bar. **Every cell live-mirrors to that animal's own form instance**, so batch data + deltas + edit checks appear on the individual Subject Record (the grid and the record are two views of one instance). **Withdrawn animals are excluded** from the grid + due counts. Queries / SDV / DM-approval / the Submit→Lock lifecycle stay on the Subject Record only.
- **BR-2502 rebuilt** into **8 groups** — A Enrollment & Randomization (Screening / Demographics / Randomization / Treatment), **B–F = one group per visit day** (Visit Day 0/3/7/14/28, each Vital Signs + Clinical Response, all `batch_eligible`), G Safety & Events (repeating: AE / Injection Site Reaction / Protocol Deviation / Re-treatment / Necropsy / Sample Collection), H Closeout — with **age-class HR validation** (calf ≤6 mo 100–140 vs adult 48–84) and **conditional forms** (Re-treatment shown only when the flag is Yes; Necropsy only when the animal died/euthanized). 12 animals across 4 feedlots; Day-0 Clinical Response is the simpler set (no "Response vs baseline").
- **Full Subject-Record form flow on the Site / House records** (Forms tab) — edit checks, manual queries (Raised→Responded→Resolved), change-reason Δ, SDV verify, Empty→…→Locked status with e-signature, Remarks dropdown — laid out identically to the Subject Record, keyed on `site_id` / `barn_id`.
- **Stale-query-badge root cause fixed** — Supabase silently capped each select at **1000 rows**, truncating `field_values` (~1479) and orphaning the queries/edit checks pointing at the dropped values. `hydrate.ts` now **pages every large table in 1000-row chunks**; the badge calc also only counts queries that resolve to a field value on the instance.
- **Edit-check visual state fixed across all forms** (SubjectRecord / scoped forms / batch grid) — the input turns **amber** (amber-200 border + amber-50 bg) when an edit check is open, fires **on blur** (no mid-keystroke flicker), inline text reads "[EC-…] Value outside expected range (Normal: X–Y unit)".

**Next priorities:** (1) **portfolio site** at **elisatron.com**; (2) **BR-2502 dashboard wiring** (CA-0801 dashboards are already wired to live aggregates; do the same for BR-2502). *(The Queries screen shipped in Session 50.)*

*(Per-session detail for Sessions 42–49 is in the log below; older sessions follow.)*

Prior — Session 41 COMPLETE — **two-tab Site & House records (Overview / Forms) + site-scoped forms**: new `scope='site'` forms (SIV checklist, Staff & Delegation, Monitoring Visits, Protocol Amendments, Continuing Review, Site Close-out) and extended barn forms (Feed Delivery, Equipment Calibration, House Close-out), rendered through a reusable **ScopedFormFlow** (one-time sectioned forms + repeating tables w/ slide-in panels). Overview tabs add Regulatory & Ethics + Biosecurity + Equipment Calibration cards with **IEC-expiry / calibration alerts**, and Data Entry shows an **SIV enrollment-gate banner**. NEXT: deferred form polish (SDV panel, sidebar deep-link, query re-open, conditional demographics).

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

**The app is built through the Subject Record, Animals list, Data Entry drill-down, and an Admin Sites section + Site Record — all on a session-based data store with a live, grouped form layer.** Three clinically-realistic studies + per-study form trees (**137 forms / 989 fields**, grouped into collapsible visit/info groups, in-form sections, individual per-visit forms, a read-only **Production Summary**, plus **site-scoped** and **barn/house-scoped** forms rendered on two-tab Site/House records, species ranges incl. chicken/ammonia + **bovine age-class heart rate**) are applied and live in Supabase; on first visit the seed hydrates once per tab into the session store, and from then on **all reads/writes are in-session** (edits reset on tab close). The Subject Record renders real fields with species-specific validation that auto-raises edit-check queries; repeating-log forms (ConMed / AE / Protocol Deviation) use a table + slide-in entry panel; completed/withdrawn subjects go read-only with a banner. The **Animals list** (`/animals`) is a study-wide table that adapts columns/hierarchy per study type. The **Sites section** (`/sites`, Admin-only) lists sites and opens the **canonical Site Record** (also reachable by clinical roles via the Data Entry "Open site record"). Dashboards: CA-0801's CRC/PI/DM dashboards are wired to live store aggregates.

> **Data model (important):** Supabase is the **read-only seed source**. `app/lib/session-store/` (`useStudySession` / `StudySessionProvider`) hydrates the dataset once per tab into `sessionStorage`; every screen reads from it; `update()` mutates in session and **never writes back to Supabase**. Only `hydrate.ts` reads Supabase. Session-store key is at **v20** (bump on dataset-shape changes).
>
> **Live studies (3):** `PH-2401` (livestock_group, **chicken** — Phytogenic Feed Additive Broiler Growth Performance Trial, 2 arms, 1 house, Site → House → **Pen = subject**, 10 pen-level forms in 5 groups + a **house-scoped Daily Environmental Log** on the Barn Record) · `BR-2502` (livestock_individual, **cattle** — Bovine Respiratory Disease Treatment Trial, 3 arms, 4 feedlots, Site → Barn → Pen → Animal, **31 animal forms in 8 groups (one per visit day)**, **age-class HR validation** + the **Batch Entry** feature for pen/herd data capture) · `CA-0801` (companion, canine — **DermAlliv™**, 3 sites / 13 dogs / 53-form eCRF). All memberships **CRC**. No sandbox/showcase split — all three are the editable demo. Roles: CRC · CRA · DM · PI · Sponsor · Admin (Admin works in **Sites**, not the clinical Data Entry flow).

### Session 56 — COMPLETE ✅ (app-wide table-sort standard + ID no-wrap)
Session key stays **v23** (no data-shape change). Unified sorting behaviour across **every list table** in the app behind one shared implementation.
- **New shared primitives:** `lib/useTableSort.ts` (`useTableSort(initial)` → `{ sort, toggle, setSort }`; `sort` is `{ col, dir }|null`; `toggle(key)` cycles **asc → desc → clear**, one column at a time) + `sortIcon()` / `sortDirMul()` helpers; and `components/common/SortTh.tsx` — a reusable `<SortTh label sortKey sort onSort style className>` header cell (plain `<th>` when `sortKey` is omitted). Generic CSS (`th.col-sortable` / `.col-sort-icon` / `th.col-sort-active`) added to **globals.css**: the arrow sits right of the label, is **hidden until hover** (`ti-arrows-sort`, placeholder) on inactive sortable columns, and turns **blue** when active (`ti-arrow-up` / `ti-arrow-down`).
- **Tables converted / wired:** Animals/Pens (was a 2-state toggle → now 3-state via the hook), Queries + Edit-Checks (refactored off their bespoke `colSort` onto the shared hook), **Studies** list (Study/Name/Sponsor/Species/Status/Subjects sortable; pinned-first preserved as the default when no column sort), **Sites** list (all 7 columns), **Data-Entry drill-down** (ID/name/children/subjects/status/arm/forms/queries; `null` = natural hierarchy order), **Barn/House** pen table (all 6 columns). Removed the now-duplicated per-table sort CSS from `animals.css` / `queries.css`.
- **ID columns never wrap** — `white-space: nowrap` on the identifier cell of every table: Animals `.cell-link`, Queries/Edit-Checks `.qy-subj`, Studies `.st-code` (already had it), Sites `.sites-cell-id` (new), Data-Entry `.de-table tbody td:first-child`, Barn `.brn-pen-id` (new), Batch grid `.subj-id`.
- Two of the simpler list tables (Sites, Barn) were wired by parallel sub-agents against the shared API; Data-Entry + Animals + Queries done directly. **Verified:** full-project `tsc` clean; `/studies`, `/animals`, `/sites`, `/data-entry`, `/queries`, and a barn record all compile + serve **200**.

### Session 55 — COMPLETE ✅ (Queries: sortable headers + subject no-wrap + padding)
Session key stays **v23** (no data-shape change). Three table fixes.
1. **Subject ID never wraps** — `white-space: nowrap` on `.qy-subj` (linked) in both tables (`.qy-mono` for unlinked subjects already had it).
2. **Sortable column headers** — reusing the **Animals list** pattern (`.qy-sortable` / `.qy-sort-icon` / `.sort-active`): the arrow icon sits right of the label, **hidden until hover** (`ti-arrows-sort`, placeholder color) and turns blue when active (`ti-arrow-up` asc / `ti-arrow-down` desc). Click cycles **asc → desc → clear** (a 3-state toggle via new `colSort` state + `toggleSort`); a `colCompare()` handles each key. Sortable on the **Queries tab:** Subject · Site · Status · Days open · Assigned to; on the **Edit-Checks tab:** Subject · Site · Days open. A column sort **overrides** the toolbar Sort dropdown (which shows "Custom (column)" while one is active and clears it on change); clearing the column sort returns to the default **oldest-first**. Switching tabs clears the column sort.
3. **Tighter cell padding** — `.qy-table tbody td` (and `thead th`) horizontal padding at `--space-1` (kept from Session 54).
- **Verified:** `tsc` clean; route compiles + serves 200.

### Session 54 — COMPLETE ✅ (Queries Field column refinement + cell padding)
Session key stays **v23** (no data-shape change). Three small fixes to the Queries/Edit-Checks tables.
1. **Field column display** — the cell now shows the **field label** (medium-weight) with an **inline code chip** beside it (`.qy-field-code` — mono, 10px, bordered, page-bg, tertiary color, matching the existing code chips), over a **form-path subtext** below (`.qy-field-form`, smaller/secondary). New `.qy-field-top` flex row so the label truncates while the chip stays put.
2. **Form path includes the group name** — `QueryItem.formPath` is derived in the context builder from the form's `parent_form_id`: a grouped form shows **"[Group] — [Form]"** (immediate parent only, e.g. "Screening — Physical Examination"), a standalone form shows just "[Form]". `formName` is kept separately for the form filter/search.
3. **Tighter cell padding** — `.qy-table tbody td` (and `thead th`, for column alignment) horizontal padding dropped from `--space-3` to `--space-1`; first/last-child `--space-5` insets unchanged.
- **Verified (REST):** the six distinct CA-0801 Field paths render correctly ("Screening — Physical Examination", "Baseline / Randomization — Baseline Clinical Assessment", "End of Study — Day 84 — Study Completion Status", …). `tsc` clean; route serves 200.

### Session 53 — COMPLETE ✅ (Queries table — final column set)
Session key stays **v23** (no data-shape change). Finalized the two tables' columns.
- **Queries tab — 10 columns:** Query ID (mono) · Subject (linked) · Site · **Field** (field label as primary text with the **form name as smaller secondary subtext** below — new `.qy-field`/`.qy-field-label`/`.qy-field-form`) · Value (the field value, amber mono) · **Query text** (truncated to ~60 chars, single-line ellipsis; full text in the slide-in panel) · **Status chip** (Raised orange / Responded amber / Resolved green — returned as its own column) · Days open (red chip if aged) · Assigned to (status-derived) · Actions (role-gated). **Dropped** the Raised-by, Raised-date, and standalone Form columns.
- **Edit-Checks tab — 8 columns:** Edit check ID · Subject · Site · Field (label + form subtext) · Value · Normal range · **Status chip** ("Edit Check", orange) · Days open. **Dropped** the standalone Form column, the Raised-date column, and the "Resolve on subject record" note column (the EC is still resolved-on-record via the slide-in panel note).
- Re-added the `statusChip` helper (now covers both Raised/Responded/Resolved and the orange "Edit Check" chip) + a `truncate()` for query text + a shared `fieldCell()`. Removed the dead `agoLabel` helper and the now-unused `.qy-id-dot`/`.qy-uname` CSS. `tsc` clean; route serves 200. (Data unchanged: CA-0801 Queries 14 / Edit-Checks 1; badge CRC/PI 8, CRA/DM 13, Sponsor/Admin 0.)

### Session 52 — COMPLETE ✅ (Queries table columns matched to 15-queries-list.html exactly)
Session key stays **v23** (no data-shape change). Re-aligned the two tables' columns to the `15-queries-list.html` prototype's exact order + visual treatment.
- **Queries tab — 12 columns:** Query ID (mono, with a **status-color dot** replacing the Status column — orange=raised / amber=responded / green=resolved) · Subject (linked) · **Site** · Form (truncate+tooltip) · Field (truncate+tooltip) · **Value** (the field value that triggered the query, amber mono) · **Query text** (the query message, 2-line clamp + full-text tooltip) · **Raised by** (name + role pill, **no avatar**) · **Raised** (date) · **Assigned to** (derived from status — open→"CRC to respond", responded→"CRA to resolve", resolved→"—") · Days open (red chip if aged) · Actions (role-gated). **Removed** the "Last action" column and all user **avatar icons**.
- **Edit-Checks tab — 10 columns:** EC ID · Subject · Site · Form · Field · **Value** (out-of-range value) · **Normal range** · **Raised** (date EC fired, relabelled from "Opened") · Days open · **Note** "Resolve on subject record" (no actions).
- New `lib/`-free CSS in `queries.css`: `.qy-id-dot` (+ `st-open`/`st-responded`/`st-resolved`), `.qy-val` (amber mono), `.qy-qtext` (2-line clamp), `.qy-uname` + `.qy-role` pill + `.qy-assign-verb`, `.qy-site`. `QueryItem` gained `enteredValue` (now for queries too) / `queryText` / `raisedByName` / `raisedByRole`; dropped `lastAction`. Seeded queries (no per-message author in the seed) attribute "Raised by" to **Monitor · CRA** by convention.
- **Verified:** `tsc` clean, route compiles + serves 200. (Data unchanged from Session 51: CA-0801 Queries tab 14 / Edit-Checks tab 1; badge CRC/PI 8, CRA/DM 13, Sponsor/Admin 0.)

### Session 51 — COMPLETE ✅ (Queries screen reworked to the prototype — tabs + reactive badge)
Session key stays **v23** (no data-shape change). Reworked the Queries screen (`/study/[studyId]/queries`) to follow **`15-queries-list.html`** faithfully and split the worklist by **content-type tabs** instead of the stat strip.
- **Two tabs** (`.qy-tabs`, styled from the prototype's `.status-tabs`): **Queries** (Q-… manual queries, amber count badge) and **Edit Checks** (EC-… open edit-checks only, orange count badge). Tab switching filters in place — no reload. Each tab has its **own table**. Sponsor gets **no Edit-Checks tab** (blinding) and is auto-bounced to Queries.
- **Queries table:** Query ID · Subject (linked → record) · Site · Form (truncated+tooltip) · Field (truncated+tooltip) · Status chip (Raised/Responded/Resolved) · Opened · Days-open (red >7 raised / >3 responded) · Last action · role-gated Actions.
- **Edit-Checks table:** EC ID · Subject (linked) · Site · Form · Field · **Value entered** (the out-of-range value, amber) · **Normal range** (resolved via `validation.resolveRange`, e.g. "38.3–39.2 °C", with a parse-from-message fallback) · Opened · Days-open · a **"Resolve on subject record"** note — **no action buttons** (EC- isn't actionable here).
- **Reactive sidenav badge** — the Queries nav number now reflects **queries needing the active role's action**, computed live (new `lib/queries-data.ts → actionableQueryCount`, study-scoped + orphan-skip): **CRC/PI = open** count · **CRA/DM = open + responded** · **Sponsor/Admin = 0**. Wired through `AppShell` (reads session `dataset` + `activeRole`) → `Sidenav badges={{ queries }}`; removed the hardcoded `badge: 4` from `NAV_ITEMS`. It **updates reactively on role switch** and on any query mutation (resolve/respond) because the dataset is session state.
- **Slide-in panel:** clicking any row opens the 420px thread panel (reuses `subject-record.css`); the EC panel additionally shows **Value / Normal / Fired** detail rows. "View in subject record →" deep-links (`?form=&field=`). Filter toolbar (search · status[queries only] · form · site · needs-my-action[queries only] · sort oldest/newest/by-subject) shared across tabs.
- **Verified (REST against the live DB, replicating the hydrate auto-EC split):** CA-0801 → **Queries tab 14** (8 open / 5 responded / 1 resolved), **Edit-Checks tab 1**; badge **CRC/PI = 8**, **CRA/DM = 13**, **Sponsor/Admin = 0**. `tsc` clean; route compiles + serves 200.

### Session 50 — COMPLETE ✅ (Queries screen — the study-wide query worklist)
Session key stays **v23** (no dataset-shape change — only new seed query/message rows; `db reset` re-applies them). Built the **Queries screen** at `/study/[studyId]/queries` — the CRA/DM workstation that aggregates **every query + open edit-check across all subjects/forms** in the study (the raise→respond→resolve flow itself already lived in the records; this is the cross-subject roll-up of it).
- **Files:** `app/app/study/[studyId]/queries/page.tsx` (new, 8.4 kB route) + `queries.css` (new, translated from `15-queries-list.html`); the slide-in thread panel **reuses `subject-record.css`**. `lib/permissions.ts` — added `queries: "queries"` to `NAV_ROUTES` (the nav item existed but routed nowhere). `SubjectRecord.tsx` + the data-entry page — new `initialPanelFieldId` prop + `?form=&field=` deep-link so a row's **Subject-ID link** navigates to the record **and auto-opens that field's query/EC panel**.
- **Header:** breadcrumb + a 5-cell **stat strip** (Total open · Raised · Responded · Resolved · Avg days open). **Filter toolbar:** search (query ID / subject / field) · status · form · site · "needs my action" · sort (oldest/newest/subject/form). **Table:** Query ID (`Q-###` / `EC-###` mono, EC orange) · Subject (blue linked → record) · Site · Form · Field · status chip (**Raised** orange / **Responded** amber / **Resolved** green / **Edit check** orange) · opened · days-open (red if >7 raised / >3 responded) · last action · role-gated actions.
- **Row click → inline 420px slide-in thread panel** (full thread + role buttons + "View in subject record" link); the **Subject-ID link navigates** instead. **Role-gating:** CRC = Respond on Raised · CRA = Resolve + Respond · DM = manage dropdown (Respond / Resolve / Close-without-response / Reassign·Escalate stubs) · PI = Respond · **Sponsor / Admin = read-only** (Sponsor also **never sees EC-** rows — blinding). **EC- rows are not actionable here** — they carry a "Resolve on subject record" note.
- **Data source:** the session store (`dataset.queries` + `dataset.editChecks` derived in `hydrate.ts` by the `"Auto edit-check:"` first-message split), study-scoped via instance→form. Orphaned queries (field value not on the instance) are skipped — consistent with the Session-46 badge fix.
- **Seed enriched** so the workstation is demonstrative: **CA-0801 now has 15 query items** (9 open / 5 responded / 1 resolved + the 1 temperature edit-check) across 5 dogs — added via a new `emitQuery()` helper + `f.queries: [...]` array support in `generate-seed.mjs` (single `f.query` still supported; `raise`→open, `+response`→responded, `+resolution`→resolved). **Verified (REST against the live DB):** 19 queries total, CA-0801 = 15 rows / `{open:9, responded:5, resolved:1}` / 14 manual + 1 auto-EC; `next build` clean, route registered.

### Session 49 — COMPLETE ✅ (batch header-bar layout — closes the Batch Entry milestone)
Session key stays **v23** (UI-only). Restructured the batch grid's shared header bar (`BatchEntryGrid.tsx` + `batch-entry.css`) to the prototype pen-defaults pattern: `.batch-header-bar` is now a **column** — an **uppercase section header** (`.bhb-label`, `ti-link` icon + "Visit date — applied to all rows", `--text-xs` / `--weight-medium` / caps tracking / `--color-text-tertiary`) stacked **above** a `.bhb-fields` row; each field has its own **normal-case** label above a **compact 220px** input; subtle `--color-page-bg` background + 1px bottom border, padding `var(--space-3) var(--space-5)`. **Verified (Playwright):** section header uppercase/500/11px/tertiary with the icon, positioned above the fields row; the "Visit date" label is normal-case above its 220px input; the bar is flex-column with page-bg + bottom border. This closes the Batch Entry feature work (see the milestone summary up top).

### Session 48 — COMPLETE ✅ (login form autofill-off + batch status chip simplified)
Session key stays **v23** (UI-only). Two fixes.
1. **LastPass / browser autofill off on the login + NDA forms** (`app/login/page.tsx`): the credential fields are wrapped in a `<form autoComplete="off" data-form-type="other" onSubmit={(e) => e.preventDefault()}>` (LastPass detects the `<form>`, so `data-form-type="other"` disables its form detection), and all four inputs keep `data-lpignore="true"` / `data-1p-ignore="true"` + non-standard `name`s. (Verified: the `<form>` carries `autocomplete=off` + `data-form-type=other`; inputs carry `data-lpignore`.)
2. **Batch grid Status column = one chip** (`BatchEntryGrid.tsx` + `batch-entry.css`): replaced the four-state badge with — **Error** (red `.rb-error`: `--red-600` text / `--red-50` bg / `--red-200` border) when **any cell in the row has an open edit check** (priority), else **Saved** (neutral `.rb-saved`: slate) when the row has data, else **nothing** (empty cell). Removed `.rb-empty` / `.rb-partial` / `.rb-ready` / `.rb-alert` and the separate `.ec-chip` count. (Verified: 0 old-variant nodes; 5 Saved chips + 6 empty status cells on Vital Signs Day 3; an out-of-range temp flips the row to a red "Error" chip with the exact spec colours.)

### Session 47 — COMPLETE ✅ (batch fixes batch 2 — autofill, header label, EC- not clickable)
Session key stays **v23** (UI-only). Three fixes.
1. **Disable browser autofill** on the login + access-agreement (NDA) inputs (`app/login/page.tsx`): the email field is `autocomplete="off"`, the password field `autocomplete="new-password"` (suppresses Chrome's saved-password dropdown), and both NDA inputs `autocomplete="off"` — all with non-standard `name`s (`arken-access-id` / `arken-access-code` / `arken-visitor-name` / `arken-visitor-org`) and `data-lpignore="true"` / `data-1p-ignore="true"` so password managers don't overlay the demo credential field. (Verified: email `off` / password `new-password`.)
2. **`bhb-field-label` above the input** (`batch-entry.css`): the shared "Visit date" batch-header field's label now uses the design-system field-label style — `font-size: var(--text-xs)`, `font-weight: var(--weight-medium)`, `text-transform: uppercase`, `letter-spacing: var(--tracking-caps)`, `color: var(--color-text-tertiary)` — stacked above the input (`.bhb-field` is `flex-direction: column`; `.batch-header-bar` switched to `align-items: flex-start`). (Verified: computed `uppercase` / `500` / `11px`; label.y < input.y.)
3. **EC- not clickable in batch** (`BatchEntryGrid.tsx`): the per-cell edit-check indicator is a non-interactive `.ec-ind` `<span>` (no `onClick`, no panel) — purely a visual flag that the value needs attention on the individual subject record — with the hover tooltip **"Review this value on the individual subject record"**. (Verified: it's a `SPAN`, the tooltip matches, and clicking opens no panel.)

### Session 46 — COMPLETE ✅ (hydration row cap + 4 batch/edit-check fixes)
Session key → **v23** (full re-hydrate). Five fixes.
1. **Batch picker drops completed forms** (`lib/batch-entry.ts`): `formCompleteForAll(form)` = every non-withdrawn study animal has an instance with a done status (`in_review`/`reviewed`/`finalized`/`locked`); `batchFormsOpen()` filters those out of the picker (`BatchPicker` now uses it for the "Other" list; suggestions already exclude them via due=0).
2. **Withdrawn animals excluded from batch** — the batch route's `subjectIds` filters `status !== "withdrawn"`, so both the grid rows and the picker's "due today" counts skip withdrawn animals. (Verified: BR grid shows 11, not CO-003.)
3 + 4. **Stale-query-badge root cause = the Supabase 1000-row select cap.** `field_values` (≈1479 rows across the 3 studies) was silently truncated at 1000, so CA-0801's field values (emitted last) were partly **missing** — orphaning the queries/edit checks/SDV records that referenced them. A badge counted an open query (instance + status match) the form couldn't render (its field value wasn't in the dataset). **Fix:** `hydrate.ts` now pages **every potentially-large table** in 1000-row chunks (`fetchAll`), so all rows hydrate. The badge calc in `SubjectRecord.leafItem` + `ScopedForms.sidebarMeta` is also hardened — counts only open/responded queries on the instance **whose `field_value_id` resolves to a field value on that instance** (so an orphan can never show a phantom badge). (Verified: CA-0801-101-01 "Baseline Clinical Assessment" badge `1` now matches the visible query; `field_values` = 1479.)
5. **Edit-check visual state on ALL forms** (SubjectRecord, ScopedFieldGrid, BatchEntryGrid): the input/select/toggle now turns **amber (amber-200 border + amber-50 bg)** when an edit check is open — new `.editcheck` CSS classes (lighter than the deeper-amber `.query`); the inline text is amber-700 and reads `[EC-…] Value outside expected range (Normal: X–Y unit)`. Edit checks **fire on blur only** for free-text/numeric inputs (a `skipCheck` flag on `setFieldValue`/`writeValue` skips mid-keystroke; an `evalEditCheck(field)` runs on blur), so the amber never flickers while typing. Discrete controls keep evaluating on change. In the **batch grid** the EC- icon stays a **non-interactive `.ec-ind`** (tooltip "Edit check — value out of range. Review on the individual subject record.", no panel). Path A (correct → clears + Δ), Path B (EC- icon → Edit Check panel → convert-to-query), SDV-blocked-by-EC, and Submit-blocked-by-EC were already wired and unchanged. (Verified: SubjectRecord `.field-input.editcheck` + the "(Normal: 38.3–39.2 °C)" text; batch grid amber on blur only, non-clickable, no panel.)

### Session 45 — COMPLETE ✅ (batch grid: data-entry + change-reason only, UI-only)
Session key stays **v22** (no data-shape change). Five batch-entry fixes, faithful to `20-batch-entry.html`.
1. **Form picker — no dupes, click-to-open** (`BatchPicker`): suggested forms (≥1 animal due today) at top, then the batch-eligible forms **not** already suggested; a form never appears twice; clicking a card calls `onPick` directly (the "Open entry grid" button is gone; cards carry a `.fc-go` chevron).
2. **Shared "Visit date" batch-header field** — a generic mechanism (`BATCH_HEADER_CODES = ["visit_date"]`): such fields are pulled out of the grid columns and rendered in a `.batch-header-bar` above the rows; setting the value **auto-fills every in-scope animal whose saved value is empty** (`setHeaderField` → `writeValue` per subject, skipping any animal that already has a saved date — never overwrites). It mirrors to each animal's instance like any cell (verified: the shared date appears on KS-002's individual Vital Signs Day 7 form).
3. **No dashed cell border for a pending Δ** — the cell control keeps its default border (amber only for an edit check); the **dashed-red is on the Δ button only**. Removed the `.batch-input/.batch-select/.batch-yn.delta-pending` rules.
4. **Compact Yes/No toggle** — `.batch-yn` is `display:flex; gap:4px` with fixed **48px** buttons, left-aligned (`flex: 0 0 auto; margin-right:auto`), never stretched to the cell width.
5. **Remarks removed** — no Remarks dropdown, no Queries/SDV mode, **no flag icons** in the grid; the `setFieldValue`/query handlers for raising/converting/responding were deleted from `BatchEntryGrid`. The orange **EC-** alert remains as a **non-interactive `.ec-ind`** indicator (amber cell + EC chip in the status column) — a validation flag, not a remarks feature. Queries are raised on the individual subject record. The per-cell **Δ flow** (dashed-red Δ button → 380px change-reason panel) is unchanged; DM approval stays on the subject record.
- **Verified (Playwright):** picker 10 cards / 10 unique / two sections / click opens grid; no Remarks button, 0 flag icons; EC- indicator (non-button) on TX-001 Day-0 temp + Alert badge; shared Visit-date bar (not a grid column) auto-fills and mirrors to KS-002's Day-7 form; Yes/No toggle 100px (48px buttons); changed select → Δ-pending button with **no** dashed cell border. `tsc` clean; `next build` compiles.

### Session 44 — COMPLETE ✅ (batch grid = Subject-Record per-cell flow, UI-only)
Session key stays **v22** (no data-shape change). `BatchEntryGrid` rewritten to **live-persist** each cell to that animal's own `form_instance` (via the same `setFieldValue` / `recordTransition` / edit-check logic as `ScopedFieldGrid`), so the batch grid and the Subject Record are two views of one instance and the full per-field flow works inline.
- **Per-cell Δ** — changing a saved value shows a dashed-red **`.delta-btn`** on the cell (right of the input); clicking opens the **same 380px Δ slide-in** as the Subject Record (status badge, old→new context, per-pending reason textarea, Submit reason, full history). DM **approval is not offered in batch** — it stays on the individual subject record. The bottom **`.rfc-bar` is now a summary shortcut** ("N fields have pending changes" + a one-reason `<select>` that responds *all* pending deltas at once); the per-cell Δ is the primary path.
- **Edit check ↔ query (matches SubjectRecord)** — **Scenario A**: an open edit check shows the orange **`.ec-btn`** (→ Edit Check panel: explain → convert-to-query); if **Queries mode** is on, a separate **`.flag-btn`** also shows (→ Query panel). **Scenario B**: after convert-to-query the EC icon disappears and the converted EC becomes a thread inside the **unified Query panel** (the flag turns filled-amber). Two icons, two panels, exactly like the regular form.
- **Remarks dropdown** added to the grid header (`.remarks-wrap` — **Off / Queries**; **no SDV** — SDV happens on subject records only).
- **Colour consistency** (`batch-entry.css`) — removed the green `.filled` state; cells are amber (`.warn`) for an open edit check or query (like `state-queried`), **dashed-red** (`.delta-pending`) for a pending Δ, default border otherwise, blue focus ring. Status badges: ○ Empty / ✎ Changed / ✓ Saved / ⚠ Alert (+ amber `EC- n` chip). Icons compacted to grid scale via `.be-cell-row`.
- **Verified (Playwright):** no green cells; TX-001 Day-0 temp cell amber + EC- icon → Edit Check panel → convert-to-query → EC icon gone + flag flagged + query thread present; HR 120→121 → dashed-red + Δ-pending button + rfc-bar "1 field has pending change"; Δ panel old→new `120→121` + reason → responded (blue); Remarks→Queries → flag on every editable cell + Query panel opens. `tsc` clean; `next build` compiles.

### Session 43 — COMPLETE ✅ (Batch Entry rebuilt faithful to prototype + BR-2502 final)
Session key → **v22**. **137 forms / 989 fields**. Applied via `npx supabase db reset --linked --yes`.
- **Batch Entry translated from `20-batch-entry.html`** (`components/batch-entry/`): two full-page views inside the `/study/[id]/batch-entry` route. **`BatchPicker`** (Step 1) = the prototype's `#view-pick` — radio **form-cards** with a "Group entry" badge; a **"Suggested for today"** section (forms with ≥1 animal due today, by visit-window math) above an **"All group-entry forms"** section; "Open entry grid" opens the selected. **`BatchEntryGrid`** (Step 2) = the prototype's `#view-grid` — **no checkboxes** (every visible animal is included), breadcrumb **Animals › Batch Entry** + title + **Exit batch** / **Submit all**, a search + site/barn/pen toolbar, a `.batch-table` with a **sticky Animal-ID column** + one column per field (`.batch-input` mono / `.batch-select` / compact **Yes-No** buttons, 32px) + a **Status** column (`.row-badge` ○ Empty / ✎ In-progress / ✓ Saved / ⚠ Alert + an amber **EC- n** chip), a per-cell `.val-hint` ("Normal: x–y"), and a **`.grid-summary`** ("Showing / To save / With alerts / Empty").
- **Edit checks per cell** — `evaluateField` runs live (age-class aware) → amber cell + EC chip + Alert badge, **never blocking**. The button is gated by `studyHasBatch` (BR only; hidden on PH/CA), uses **`ti-table`**, sits left of "Add animal" on the Animals list and on the animal-level drill-down.
- **Reason-for-change bar (`.rfc-bar`)** — hidden until a **previously-saved** cell is modified, then shows the amber bar: a reason `<select>` (Data correction / Transcription error / Updated source document / Other), an Other text field, and **"Override per row"** (toggles per-row reason `<select>`s in the Status cell). Submit is gated until a reason is chosen for modified data.
- **Mirroring + Δ** — `Submit all` writes each row with data to **that animal's own `form_instance`** (creating it if needed, advancing `empty → in_work`); a changed previously-saved value pushes a **`deltaRecords`** entry (old→new, the rfc reason, status `responded`) so the Subject Record's change-reason flow shows it. Because the grid reads/writes the *same* instance the Subject Record uses, the batch data appears on the individual form automatically. **Verified (Playwright):** grid temp 41.5 → `.warn` + "Normal: 38–39.3 °C" + Alert + EC-1 (editable); Submit toast "6 records saved · 1 with alerts · 6 empty"; opening that animal's Subject Record → Vital Signs Day 3 shows **41.5** + the edit check; the rfc-bar appears when re-editing TX-001's saved Day-0 temp (mirrored 40.6 into the grid).
- **BR-2502 final structure** — Day-0 **Clinical Response** uses a simpler set (date · illness score · attitude · hydration · BCS · appetite · notes — no "Response vs baseline" since there's no baseline). **Group G** forms (Injection Site Reaction, Re-treatment, Sample Collection, ConMed) added to `REPEATING_FORMS`; **conditional visibility** — `SubjectRecord` hides **Re-treatment / Rescue** unless `retreatment_flag === "Yes"` and **Necropsy** unless the animal died/euthanized (verified: CO-001 shows Re-treatment, TX-002 hides both). New seed: calves **TX-001 / KS-001 / NE-001 / CO-001**; TX-001 temp 40.6 D0 EC; **KS-002** responded query on D3 vitals; completed **KS-001 / NE-001 / NE-002**; withdrawn **CO-003** (Day 7, owner request); CO-001 re-treatment flag; arms T01/T02/T03 ×4.

### Session 42 — COMPLETE ✅ (BR-2502 8-group restructure + Batch Entry v1)
Session key → **v21**. **137 forms / 989 fields**. Applied via `npx supabase db reset --linked --yes`.
- **BR-2502 → 8 groups** (`BR_TREE` in `generate-seed.mjs`): **A Enrollment & Randomization** (Screening / BRD Case Definition — now the FIRST form · Animal Demographics · Randomization & Allocation · Treatment Administration, the one-time Day-0 dose), **B–F = one group per visit day** (Visit Day 0/3/7/14/28, each holding **Vital Signs — Day N** + **Clinical Response — Day N**), **G Safety & Events** (Adverse Event · Injection Site Reaction · Protocol Deviation · Re-treatment / Rescue · Necropsy · Sample Collection), **H Closeout** (ConMed · Withdrawal Period Confirmation · End of Study). Vital Signs keeps the age-class HR validation (calf ≤6 mo 100–140 vs adult 48–84) + temperature edit check. **Verified (Playwright):** TX-001 sidebar shows exactly these 8 top-level groups; Vital Signs — Day 0 fires `[EC-…] Value outside expected range` on rectal temp 40.6.
- **`forms.batch_eligible`** — migration `20260616000000_batch_eligible.sql` (boolean, default false); `FormRow.batch_eligible`, hydrate select, generator `batchLeaf()` + forms-INSERT column. The **10** BR visit forms (Vital Signs + Clinical Response × Days 0/3/7/14/28) are flagged true.
- **Seed** — 12 animals across TX/KS/NE/CO (3 each), generated from a compact `BR_ANIMALS` spec by `brDemo`: 8 active / 3 completed / 1 withdrawn, arms T01/T02/T03 ×4, **4 calves ≤6 mo** + 8 adults, enrollment dates anchored to `BR_TODAY` (2026-06-16) so Batch Entry suggestions land on the right visit day. TX-001 temp 40.6 °C edit check; a responded query (NE-003 D3); 2 animals with D0+D3 done (NE-001/NE-003); CO-001 has the re-treatment flag set (Re-treatment form populated); KS-003 withdrawn with a documented reason; completed animals fully finalized.
- **Batch Entry** (`lib/batch-entry.ts` + `components/batch-entry/`): **only studies with batch_eligible forms** show a secondary **"Batch entry"** button (right of Add on the Animals list, and on the animal-level drill-down — `childLevel === subjectIdx`; hidden for PH/CA). **Step 1 `BatchEntryModal`** (420px) — "Suggested for today" cards (each batch form with ≥1 animal due today, by visit-window math; "No visits due today" if none) + an "Or select a different form" radio list of all batch forms. **Step 2 route `/study/[id]/batch-entry`** `BatchEntryGrid` (full-screen): checkbox (all checked) + sticky Animal ID / Location + one column per editable field (text/number/date/native select/Yes-No toggle, 32px cells) + Status (○/✎/✓/⚠) + Alerts. Edit checks fire **per cell** live (`evaluateField`, age-class aware) → amber cell + `EC- n` chip + amber row, **never blocking**. Filter bar (site/barn/pen + All/Due today/Overdue/Not started). **Save all** persists every checked row with ≥1 value (creating instances + field_values + open editChecks in the store), skips empty rows, and shows a toast "X saved · Y with open edit checks · Z skipped". **Verified (Playwright):** button on BR list (absent on PH/CA), modal suggests Day 3 ·5 / Day 7 ·2 / Day 28 ·1, 10 batch forms; grid 12 rows × 10 field columns, temp 41.5 → `.warn` + `EC- 1` (still editable), save toast "6 records saved · 1 with open edit checks · 6 skipped"; drill-down button at the BR pen level over 3 animals.

### Session 41 — COMPLETE ✅ (two-tab Site/House records + site-scoped forms)
Session key → **v20**. **134 forms / 995 fields**.
- **Follow-up fixes (41b, UI-only — no reseed):** (1) removed the Weekly performance summary table from the individual Body Weight / Flock Health visit forms — it now lives **only** in the standalone Production Summary; (2) the Animals/Pens list identifier column relabels via terminology — **"Pen ID"** for `livestock_group`, **"Animal ID"** otherwise; (3) scoped site/barn form fields no longer show **pre-emptive red** — required-error styling (red border + "Required") only appears after the field is touched/blurred or a Submit is attempted (`ScopedField` now tracks `touched`; sectioned forms force-show on submit-attempt).
- **Follow-up fixes (41c, filter/nav — no reseed):** (1) **scope-exact form sidebars** — the pen/Subject Record sidebar (and the Data-Entry pen-progress count) now filter `(scope ?? "subject") === "subject"`, so site- and barn-scoped forms (SIV / Staff / Daily Env Log …) no longer leak into the pen sidebar; the Site/House Forms tabs were already scope-filtered (`'site'` / `'barn'`). (2) **Drill-down row record links** — the `ti-file-description` icon on a Data-Entry row now `router.push`-es to that location's record: a **Site** row → `/sites/[id]`, a **House/Barn** row → `/barns/[id]` (deeper container rows still drill in).
- **Forms + Queries columns on every Data-Entry level (41h, UI-only — no reseed):** the Data-Entry drill-down (`app/study/[studyId]/data-entry/page.tsx`) now shows **Forms** and **Queries** columns at **every** level — site, house/barn, pen-container, and subject/pen rows — for both livestock and companion studies. All counts derive from the session store: a `bySubject` rollup (completed/total form instances + open queries per subject) plus `openQByInstance` (queries with status open/responded) is summed per node via a `rollup(pred)` helper over the node's descendant subjects (site→`site_id`, barn→`barn_id`, pen→`pen_id`, subject→itself). **Forms** = completed (`in_review`/`reviewed`/`finalized`/`locked`) / total instances rendered as a `FormsProgress` bar ("19 / 22"); the subject rows keep their existing expected-forms progress bar. **Queries** = open (raised + responded) count via a new `QueriesCell` — orange (`.de-q.has`) when > 0, dash when 0 (the subject Queries cell was previously a hard-coded `—`; now wired). **Verified (Playwright):** PH-2401 site `19 / 22` + `1`, house `19 / 22` + `1`, pen(subject) `9/21` + `1`; CA-0801 site `54 / 58` + `2`, subject `9/46` + `1` (orange query cells present).
- **Repeating forms get the form header everywhere (41g, UI-only — no reseed):** the **Subject Record** repeating (log) forms — Adverse Event, ConMed, Protocol Deviation, Mortality & Cull — previously *hid* the form toolbar (`isRepeatingForm` → `display:none`); they now show the same `.form-sticky-header` (title + **Remarks dropdown + Submit/Finalize/Lock CTA**) as every other form, so the whole app is consistent (matching the Site/House scoped forms from 41f). The form **status now rolls up across all entries** (weakest-entry wins via a new `STATUS_RANK`): a new `formInstanceList`/`currentStatus` drives `advanceStatus`, `confirmLock`, `verifyAll`, `markSdvComplete`, the SDV progress bar, the submit-gating (`formHasData` / `hasOpenEditCheck` / `hasPendingDelta` / `hasEmptyRequired` now test **every** entry for repeating forms), and `leafItem` (sidebar glyph/badge/shield rolled up too). The CTA / Remarks / SDV-verify-all / lock act on **all entries together**; the per-entry slide-in panel stays **fields-only** (Done button, no Remarks/CTA), and the "+ Add" button stays in the body. Only the auto-generated **Production Summary** keeps no toolbar (read-only). **Verified (Playwright):** PH-2401 Adverse Event → sticky header + Remarks + "Submit for Review", "Add Adverse Event" in body, entry panel Done-only; Mortality & Cull → rolled-up "Finalize" CTA, "Record mortality" in body, entry panel Done-only.
- **Scoped Forms tab = Subject Record layout (41f, UI-only — no reseed):** the Site / House record **Forms tab** now matches the Subject Record exactly. (1) **Sidebar** — rebuilt with the Subject Record's own classes (`.form-sidebar` / `.form-item` / `.form-item-right`), the half-moon SVG status glyphs, the orange query badge (`.issue-badge`), the SDV shield (`SidebarSdv`), and the blue-50 active highlight — all extracted to a shared `components/subject-record/status-icons.tsx` (`StatusGlyph`, `SidebarSdv`, `iconForInstance`, `ICON_RANK`, `ICON_LABEL`, `STATUS_LABEL`). (2) **Sticky header** — each form renders `.form-content` > `.form-sticky-header` (`.form-header`: title left, **Remarks dropdown + status CTA** right, 1px border-bottom) over a scrolling `.form-body`. (3) **Repeating forms** (Daily Env, Feed Delivery, Staff & Delegation, Monitoring Visits, Protocol Amendments) render the table + "+ New" in the body; the slide-in entry panel is now **fields-only** (no Remarks, no Submit — just a Done button). The Remarks modes and the **Submit / Finalize / Lock CTA are form-level** and act on the whole form (all entries together → rolled-up status = weakest instance; Submit/SDV/lock gate across every entry). (4) **One-time forms** (SIV, Close-outs) render the sectioned field grid below the same sticky header. Architecture: the old `ScopedFormRenderer.tsx` split into **`ScopedFieldGrid`** (per-instance field grid + EC/query/Δ panels, modes passed as props) and a form-level **`ScopedFormView`** orchestrator (sticky header + table/grid body + form-level status/SDV/lock) inside `ScopedForms.tsx`; the Forms tab no longer sits in an `.sr-card` — the pages render `<ScopedFormFlow>` as a `.scf-shell` two-pane that fills the height so the sticky header works. **Verified (Playwright)** on both records: `.form-sidebar` items + glyphs, sticky header + title + Remarks + CTA, Daily Env table headers/rows, fields-only entry panel (Done only), 24 `.yn-btn` toggles in the SIV one-time grid.
- **Scoped-form polish (41e, UI-only — no reseed):** (1) **Yes/No toggle** — `ScopedFormRenderer.renderControl` now matches the Subject Record exactly (`.yn-toggle` / `.yn-btn`, plus correct `.field-select` / `.field-date` / `.check-item` markup), so booleans render as the two-button toggle instead of "YesNo" text. (2) **Stat strip** is gated to the **Overview** tab on both Site and House records (hidden on Forms). (3) **Nav highlight** — `AppShell` keeps **Data Entry** active on the Site/House *record* pages (`/sites/[id]`, `/barns/[id]`); the `/sites` list still resolves normally. (4) **Daily Environmental Log + Feed Delivery → repeating table** (replacing the per-entry chip selector): a `ScopedLogTable` shows one row per entry (Daily Env columns: Date · Morning/Evening Temp · Ammonia · CO₂ · Humidity · **Alerts** (open-EC count) · **Status**), a "New daily log" button + row click open a **420px slide-in panel** running the full `ScopedFormRenderer` (`panel` = single-column) so edit checks fire inline (ammonia > 25 / temp out of 18–24 °C → `EC-`). Scales to 40+ rows, no tabs. **Verified (Playwright)** all four.
- **Full form flow on scoped forms (41d):** new **`ScopedFormRenderer`** (`components/scoped-forms/`) gives every site-/barn-scoped form the **identical** Subject-Record flow — it reuses the same session-store records (`editChecks` / `queries` / `deltaRecords` / `sdvRecords` / `queryMessages`, keyed by `site_id` / `barn_id`), the same validation engine, and the same `subject-record.css`. Behaviors: **(1) edit checks** (orange `EC-` icon + inline state + panel → correct-to-clear or explain-to-convert-to-query), **(2) manual queries** (flag in Queries mode → Raise/Respond/Resolve panel, role-gated CRC/CRA/DM), **(3) change-reason Δ** (per-transition cards → reason → DM approve → green), **(4) SDV** (CRA mode → shield → verify ⇄ undo, blocked by open EC/Δ/query, "Verified by …" note), **(5) status** Empty→…→Locked with the e-signature modal, **(6) Remarks** dropdown (Queries / SDV-CRA-only / Off). `ScopedFormFlow` now renders each form through it, with an **entry selector** for recurring logs (Daily Env Log, Feed Delivery, Staff, Monitoring, Amendments). **Verified (Playwright):** SIV boolean change → Δ; Daily Env ammonia 32 → `EC-` icon; CRA SDV mode → shields + verify; Queries-mode flags; the Subject Record is unchanged. `next build` clean.
- **Data model** — migration `20260615000000_site_forms.sql` adds `form_instances.site_id` (alongside `barn_id`); `forms.scope` now takes `'site'` (plain text, no enum change). `FormInstanceRow.site_id`, hydrate select, and `SiteRow`/`BarnRow` optional **Overview-config** fields (city, IEC name/ref/dates, regulatory authority, permit; house type / biosecurity etc.) — session-only.
- **Generator** — `emitScopedForms()` generalises the barn-forms emitter to also emit **site-scoped** forms (id prefix 67/68). `SITE_FORMS` (SIV, Staff & Delegation, Monitoring Visits, Protocol Amendments, Continuing Review, Site Close-out) attach to **every** study; `PH_BARN_FORMS` gains **Feed Delivery Log, Equipment Calibration Log, House/Barn Close-out** and sections on the Daily Env Log. Demo emission now handles `siteDemo`. Seed: CA-0801 site 101 (SIV approved, 2 staff, 1 monitoring visit, 1 amendment, 1 continuing review); PH House A (2 equipment — Ammonia monitor **overdue**, 3 feed deliveries).
- **`ScopedForms.tsx`** (+ `scoped-forms.css`) — reusable scope-keyed form renderer. `ScopedFormFlow` = the Forms tab (form list + content): one-time forms render as **sectioned read/write grids** with required-gated **Submit-for-review**; recurring/log forms render as a **table + 420px slide-in panel** with required-blocks-save, inline edit checks and range hints. `ScopedRepeatingTable` is reused directly in Overview cards (Continuing Review, Equipment Calibration). `calibrationStatus()` derives Current/Due Soon/Overdue.
- **Site Record → two tabs** (`?tab=overview|forms`). Overview: Site Information (Admin edit) + Regulatory & Ethics (IEC fields with a **60-day / expired expiry chip + banner**, Continuing Review table) + an enrollment **stat strip** (Enrolled/Active/Completed/Withdrawn/Screening/Queries). Forms: `ScopedFormFlow` (SIV, Staff, Monitoring, Amendments, Site Close-out).
- **House/Barn Record → two tabs**. Overview: House Information + Biosecurity (inline edit) + Equipment Calibration (table + **overdue/due-soon alert banner**) + Pen Summary (click → pen record) + Environmental Alerts (daily-log edit checks **and** calibration alerts). Forms: Daily Env Log (with the single-point-monitoring note), Feed Delivery, House Close-out.
- **Enrollment gate** — the Data Entry site level shows an amber banner ("Site initiation visit not complete — contact the study coordinator…") when the site's SIV is missing or `Site approved to enroll ≠ Yes`, with an "Open SIV checklist" deep-link. `db reset`; `tsc` clean. **Verified (Playwright):** both records' tabs, SIV 6 sections + "All items satisfactory", staff 2 / feed 3 rows, IEC 60-day alert, equipment-overdue alert, SIV gate on PH RUA (none on the approved CA 101), required-blocks-save on the slide-in panels.

### Session 40 — COMPLETE ✅ (flatten week groups · Production Summary · House-record polish · Pens nav)
Session key → **v19**. **113 forms / 784 fields**.
1. **Flattened the weekly group** — removed the "Weekly Production Monitoring" wrapper; the **6 Week groups** (Week 1 — Day 7 … Week 6 — Day 42) now sit at the **top level** of the sidebar (alongside Pen Setup / Placement Day 0 / Event Records / Study Closeout); **Production Summary** is a standalone top-level form placed **after Week 6, before Event Records**. Generator: `...PH_WEEK_GROUPS, PH_PRODUCTION_SUMMARY` instead of a wrapping `grp()`.
2. **Production Summary restructured** (`SubjectRecord` `isSummaryForm` render) — a top **per-week table** (Week · Day · Date · Avg BW g/bird · Feed Consumed kg · FCR · Mortality · Litter Score, one row per D7–D42) + a bottom **overall footer** (same chip strip as the Mortality summary): Birds Placed · Current Birds Alive · Total Mortality · Cumulative Mortality % · Total Feed Consumed · Overall FCR · Overall ADG · Livability % · **EPEF**. Read-only, no toolbar/SDV/queries/submit; banner "Auto-generated summary — updates as weekly data is entered."
3. **House Record pixel fixes** — `.st-bc-cur` → 12px; `.badge` (all variants) → `width: fit-content; align-self: flex-start` so status chips never stretch; the barn breadcrumb now uses `.sites-bc` (no inline-style layout) and a trailing "House record" crumb, matching the Site Record exactly.
4. **Daily Environmental Log panel — full form flow** — the slide-in entry panel now runs validation like the Subject Record entry panels: **required fields block Save** (disabled button + inline "Required" + red border), **edit checks fire inline** (ammonia > 25 ppm, temp outside 18–24 °C — amber border + message), and **range hints** ("Normal: 18–24 °C") show under numeric fields. On Save the row appears in the log table.
5. **Dynamic Animals → Pens** — `terminology.animalsLabel(study)` returns "Pens" for `livestock_group`, else "Animals". Threaded `study.type` through `ShellStudy` → `StudyShell` → `AppShell` → `Sidenav` (nav label) and applied to the Animals list **title / stat / footer / Add button**. PH-2401 = Pens; BR-2502 & CA-0801 = Animals. `db reset`; `tsc` clean. **Verified (Playwright)** all five.

### Session 39 — COMPLETE ✅ (nested groups + Production Summary + Barn Record rebuild)
Session key → **v18**. **114 forms / 785 fields**.
- **Recursive form emit** (`generate-seed.mjs`) — the tree emit is now recursive with per-study global form/field counters, so groups can nest to any depth (`parent_form_id` carries the shape). Form codes are now `F001`-style (the two old positional `code === "F0201"` lookups were already dead — no `fec_reduction` field — so nothing relied on them).
- **PH-2401 Weekly Production Monitoring restructured** — Group C now contains **6 Week sub-groups** (`Week 1 — Day 7` … `Week 6 — Day 42`), each holding exactly **Body Weight & Feed — Day N** + **Flock Health & Litter — Day N**; sidebar: Group C → expand → 6 week groups → expand a week → 2 forms.
- **Production Summary** — a standalone read-only leaf (last item in Group C). No editable fields, no SDV / queries / submit; it aggregates across completed weekly visits (Total Days, Birds Placed, Current Birds Alive, Cumulative Mortality + %, Total Feed Consumed, Overall FCR, Current Avg BW, Overall ADG, Livability %) and is labelled "Auto-generated — updates as weekly data is entered." Seeded `reviewed` for P01/P02.
- **SubjectRecord recursive sidebar** — `buildNode`/`collectLeaves`/`renderNode` replace the one-level build; group rollup (worst icon / summed queries / all-complete SDV) recurses; the active form's **whole ancestor chain** auto-expands; `goToForm` expands the full chain. `isSummaryForm` hides the toolbar and renders the read-only aggregate grid. The weekly-summary table now shows on any `… — Day N` body-weight/flock-health form.
- **Barn / House Record rebuilt** (`barns/[barnId]/page.tsx` + `barns.css`, imports `sites.css`) to mirror the **Site Record** exactly: breadcrumb (Data Entry › Site › House), header strip (`.sr-title` + `.sr-title-sub` + Export / Audit trail / Edit-Admin), `.sr-stat-strip` (Pens enrolled · Total birds · Active pens · Open queries · Forms submitted), and a `.sr-card` grid — **House information**, **Pen summary** (table → click a pen opens its record), **Daily environmental log** (table + "New daily log" slide-in panel with live edit checks), **Environmental alerts** (open edit checks from the logs). No inline-style layout.
- **`.sr-title-sub`** typography fixed — font-sans, `--text-sm`, `--color-text-secondary`, normal weight (was mono/tertiary). Applied via db reset; `tsc` clean. **Verified (Playwright):** Group C → 6 week sub-groups → 2 forms each + Production Summary; summary read-only/no submit; House record = 5 stat tiles + 4 cards + 2 env alerts + working slide-in panel.

### Session 38 — COMPLETE ✅ (recurring forms → individual per-visit forms)
Reverted the Assessment-day selector pattern; recurring forms now emit one form per visit day. Session key → **v17**. **107 forms / 775 fields**.
- **Generator `recurring(baseKey, baseName, days, fields)`** — expands a template into one leaf form per day (`<baseKey>_d<N>`, name `"<baseName> — Day N"`). The Assessment-day selector is removed from the field set.
  - **PH-2401** Weekly Production Monitoring → **12 items**: Body Weight & Feed — Day 7…42 (6) + Flock Health & Litter — Day 7…42 (6). `PH_VISIT_DAYS = [7,14,21,28,35,42]`.
  - **BR-2502** Clinical Monitoring → Vital Signs — Day 0/3/7/14/28 (5) + Clinical Response — Day 3/7/14/28 (4). `BR_VITAL_DAYS` / `BR_RESPONSE_DAYS`.
  - **CA-0801** Follow-Up 1/2/3 were already individual visit groups — unchanged, confirmed as 3 individual sidebar items.
- Each per-visit form is its **own sidebar item** with independent status icon, query badge and SDV shield (the existing per-form machinery — nothing special-cased).
- **Assessment-day display (read-only)** — `SubjectRecord` parses `"— Day N"` from the form name and shows a read-only **"Assessment day: Day N"** block at the top of the form; never editable, **no Δ** ever fires.
- **Weekly performance summary** rewritten to read the per-day forms by name (`Body Weight & Feed — Day N` / `Flock Health & Litter — Day N`); fixed rows D7–D42; each row carries the **form-instance status glyph** and is **clickable → `goToForm()`** (selects the visit form, expands its group, scrolls its sidebar item into view, flashes it). `id="sb-form-<id>"` added to every sidebar leaf for the scroll target.
- Seed: P01 & P02 get **D7 + D14 completed** (realistic body weights ~180 g/bird D7, ~420 g D14; T02 slightly heavier), an open **litter-moisture (Wet)** query on P01 D14, a soft **FCR edit check** on P02 D14, two mortality records (the Mortality & Cull repeating table is unchanged). BR vital-signs demo remapped to `vital_signs_d0`. `db reset` applied; `tsc` clean. **Verified (Playwright):** PH Group C = 12 items; BR 5+4; CA 3 follow-ups; assessment-day read-only; summary-row click jumps to the right form; SDV/query/submit work per visit.

### Session 37 — COMPLETE ✅ (PH-2401 fixes + UI polish)
Six fixes — no schema change; one seed tweak. Session key → **v16**. **90 forms / 528 fields**.
1. **Study-code no-wrap** — `.st-code { white-space: nowrap }` (studies table) so the study ID never wraps.
2. **Barn Record breadcrumb** — `Data Entry › [Site] › [House]`, each segment clickable (Site → `/data-entry?site=<id>`), mirroring the Site Record.
3. **Daily Environmental Log → slide-in panel** — "New daily log" (and a row click) now opens a 420px right-hand entry panel (AE/ConMed pattern) instead of an inline editor; the saved entry appears as a new table row, no navigation away.
4. **Weekly performance summary** — a compact read-only table atop the Weekly Production Monitoring group (Day · Date · Avg BW g/bird · Feed Consumed kg · FCR · Mortality · Litter Score), one row per D7–D42 visit (empty visits show dashes), cross-referencing the Body Weight and Flock Health instances by `assessment_day`.
5. **Sidebar tooltips** — `title` on every form item (full form name) and group header (full group name) for truncated labels.
6. **Mortality & Cull Record → repeating table** — added to `REPEATING_FORMS` + columns (Date / Deaths / Culls / Cause) with a "**Record mortality**" add button; below the table a **cumulative summary** (deaths, culls, birds placed, mortality %). The per-row `cumulative_mortality` / `cumulative_mortality_pct` calc fields were removed from the generator (now table-level). `db reset` applied; `tsc` clean. **Verified (Playwright)** all six.

### Session 36 — COMPLETE ✅ (PH-2401 broiler trial + barn/house-scoped forms)
**Replaced CX-2501 with PH-2401** and introduced the first **barn/house-level form** architecture. Session key → **v15**. **90 forms / 530 fields**.
- **PH-2401** Phytogenic Feed Additive Broiler Growth Performance Trial — `livestock_group`, **chicken**, Site → **House → Pen** (pen = subject). 2 arms (T01 Control / T02 Phytogenic 0.05%), single controlled-environment house, 20 pens × 30 birds, 42 days. Primary endpoints FCR / ADG / final body weight. **5 groups / 10 pen-level forms**: **A Pen Setup** (Pen Demographics & Setup · Randomization & Arm Assignment · Feed & Ration Setup), **B Placement / Day 0** (Day 0 Baseline Weights & Feed), **C Weekly Production Monitoring** (Body Weight & Feed Intake · Weekly Flock Health & Litter), **D Event Records** (Mortality & Cull Record · Adverse Event), **E Study Closeout** (Final Processing & Summary · Study Reconciliation). Detailed in-form sections throughout.
- **Barn/house-scoped forms (NEW architecture)** — some forms belong to the **House**, not the pen. Migration `20260614000000_barn_forms.sql`: `forms.scope` ('subject' default | 'barn') + `form_instances.barn_id` (nullable; `subject_id` made nullable). The generator emits barn forms (`study.barnForms`, id prefix 65/66, scope 'barn') and barn-keyed instances (`study.barnDemo`). `types.ts` (`FormRow.scope`, `FormInstanceRow.barn_id` + nullable `subject_id`) and `hydrate.ts` select the new columns. Barn-scoped forms are **filtered out of the pen sidebar** (`SubjectRecord` + `data-entry`).
- **Daily Environmental Log** (the house form) — log date, AM/PM temperature (18–24 °C), AM/PM humidity (40–70 %), CO₂ (≤3000 ppm), ammonia (≤25 ppm welfare), ventilation, HVAC-normal, equipment issues, recorded-by. Static `rng()` bounds auto-raise edit checks.
- **Barn Record page** (`app/study/[studyId]/barns/[barnId]/page.tsx`) — house header + a daily-log table (date / AM / PM / NH₃ / status / flags) + an editable detail panel with **live edit-check highlighting** (ammonia 32 ppm, evening temp 25 °C flag). Reached via Data Entry → drill into the House → **"Open house record"** (the title-row button now routes site→Site Record, barn→Barn Record).
- **FCR = N/A** — `SubjectRecord.calcValue` returns "N/A" for `fcr`-coded calculated fields (cross-visit FCR isn't wired, so a baseline never shows a misleading number); also added same-form `avg_body_weight` and `stocking_density` calcs.
- **species_ranges** — chicken gains `ammonia_ppm` 0–25, `avg_body_weight_g` 2800–3200, `fcr` 1.50–1.80, `carcass_yield_pct` 74–76.
- Seed: 6 pens (3 T01 / 3 T02) in House A; P01/P02 setup + weekly visits, P03/P04 setup only, P05/P06 empty; an **open litter-moisture (Wet) query** (P01), a **soft FCR edit check** (P02, FCR > 1.90), **2 mortality records**, and **2 Daily Environmental Log** entries (one with ammonia 32 ppm). Applied via `npx supabase db reset --linked --yes`; `tsc` clean. **Verified (Playwright):** PH-2401 live / CX gone; pen click → Subject Record (5 groups / 10 forms, no Daily Env Log); Open house record → Daily Environmental Log with edit-check flags; FCR shows N/A.

### Session 35 — COMPLETE ✅ (grouped form trees, in-form sections, pen-as-subject)
**Reorganized CX-2501 & BR-2502 into grouped eCRFs and added 13 new forms.** Seed + a small renderer/nav change. Session key → **v14**. **94 forms / 510 fields**.
- **CX-2501 → 6 groups / 14 forms** (`grp()`/`leaf()`): **A Study Setup & Enrollment** (Pen Setup, Placement Eligibility, **+ Housing & Environment Setup**), **B Coccidiosis Challenge** (Challenge, **+ Post-Challenge 48h Observation**), **C Production Monitoring** (Body Weight & Feed Intake, Daily Health, **+ Water & Feed Quality Log**), **D Pathology & Necropsy** (Lesion Scoring, **+ Sample Collection OPG/Histopath**), **E Safety & Compliance** (Adverse Event, **+ Protocol Deviation**), **F Study Closeout** (End of Study, **+ Feed & Bird Reconciliation**).
- **BR-2502 → 6 groups / 15 forms**: **A Enrollment & Randomization** (Demographics, **+ Randomization & Allocation**), **B Treatment** (Treatment Admin, **+ Concomitant Medication Log**), **C Clinical Monitoring** (Vital Signs, **+ Clinical Response Assessment**), **D Safety & Pathology** (Adverse Event, **+ Injection Site Reaction**, **+ Protocol Deviation**, Necropsy, **+ Sample Collection**), **E Rescue** (Re-treatment, **+ Screening moved here**), **F Closeout** (End of Study, **+ Withdrawal Period Confirmation**).
- **Explicit in-form sections (NEW)** — `FieldValidation.section` + a generator `sec(name, fields)` helper. `SubjectRecord.sectionForIdx` now prefers explicit sections (falls back to the vital-based Examination/Vital Signs/Assessment heuristic). Applied to: CX Pen Setup (Pen Identification / Bird Information / Setup Notes), CX Body Weight (Weight Assessment / Feed Tracking / Mortality / Performance Metrics), BR Vital Signs (Identification / Vital Signs / Clinical Assessment), BR Treatment (Drug Information / Administration / Withdrawal), and both AE forms (Event Details / Assessment / Resolution).
- **Pen-as-subject navigation (NEW)** — for `livestock_group`, `hierarchyLevels` now returns **Site → Barn → Pen** (3 levels; the Pen IS the experimental unit). The Data Entry drill-down renders each pen-subject directly under its barn, so **clicking a pen opens its Subject Record** (no extra nested single-row table). The Subject Record sidebar shows all 14 forms in the 6 groups. `lib/terminology.ts`, `app/study/[studyId]/data-entry/page.tsx`.
- Applied via `npx supabase db reset --linked --yes`; `tsc` clean. **Verified (Playwright):** CX pen click → `/data-entry/<subjectUuid>`; CX 6 groups/14 forms; BR 6 groups/15 forms; sections render in all four sectioned forms.

### Session 34 — COMPLETE ✅ (two new livestock studies replace PH-2401 / HF-3001)
**Kept CA-0801; replaced the two livestock studies entirely** with a richer pair from the design doc. Seed-only rebuild + an age-class validation engine addition. Session key → **v13**.
- **CX-2501** Anticoccidial Efficacy in Broiler Chickens — `livestock_group`, **chicken**, Site → **Room → Pen**. Randomized complete block, **4 arms** (T01 unchallenged/untreated · T02 challenged/untreated · T03 challenged/test · T04 challenged/reference), 32 pens × 30 birds across 2 research units, 42 days. **8 pen-level forms** (all `standalone`): Pen Setup & Demographics · Randomization & Placement Eligibility · Coccidiosis Challenge/Inoculation · Body Weight & Feed Intake · Daily Health & Mortality · Lesion Scoring at Necropsy · Adverse Event · End of Study/Pen Disposition. Seed: 8 pens (4/site, one per arm), incl. an **open edit check** (P03: 4 mortalities + bloody droppings, fecal score 3) and a **responded query** (P02 inoculum lot).
- **BR-2502** Bovine Respiratory Disease Treatment Trial — `livestock_individual`, **cattle**, Site → Barn → Pen → Animal. 3 arms (T01 test · T02 reference · T03 saline), 270 animals across 4 feedlots, rolling enrollment, 28 days. **8 animal-level forms**: Demographics/Enrollment · Screening/BRD Case Definition · Vital Signs/Clinical Assessment · Treatment Administration · Re-treatment/Rescue · Adverse Event · Necropsy · End of Study. Seed: **12 animals** (3/site), **Active 8 / Completed 3 / Withdrawn 1**, a **temperature edit check** (TX-001 rectal 40.6 °C vs 38.0–39.3), a **responded query**, and ≥2 completed screening+treatment paths.
- **Age-class heart-rate validation (NEW)** — `FieldValidation.ageClass` + `vitalAge()` generator builder. `resolveRange/rangeLabel/evaluateField` (`lib/forms/validation.ts`) take an optional `ageMonths` and resolve `<vital>_calf` (≤6 mo) / `<vital>_adult`. `SubjectRecord` reads the animal's `age_months` demographic and threads it through. `species_ranges`: `cattle.heart_rate_calf` 100–140, `heart_rate_adult` 48–84, `temperature` 38.0–39.3 °C. **Verified in-browser**: adult TX-001 (14 mo) shows "Normal: 48–84 bpm"; calf KS-002 (5 mo) shows "Normal: 100–140 bpm" — so 120 bpm is normal for the calf, flagged for the adult.
- Used the existing `cattle` species enum value for "bovine" (no migration). Terminology: chicken already maps `barn → House`; pen-setup form labels the mid level "Barn / Room" and barns are named "Room 1" → Animals list shows **House/Room, not Barn**.
- Generator (`generate-seed.mjs`) — replaced `PH_TREE`/`HF_TREE` with `CX_TREE`/`BR_TREE` (flat `alone()` form lists) and their study configs. **69 forms / 401 fields / 33 subjects**. Applied via `npx supabase db reset --linked --yes`; `tsc` clean. Verified (Playwright): studies list shows CX/BR/CA only, both Animals lists render (8 pens / 12 cattle with all statuses).

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
