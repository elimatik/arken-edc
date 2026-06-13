# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-06-06 | Sessions 1–13 complete

---

## What this project is

Arken is a web-based EDC platform for animal clinical trials. Portfolio project by Elisa (senior UX/Product Designer, Italy, dual US/Italian citizenship), targeting senior product design roles at US healthtech companies. First purpose-built EDC for animal studies — no direct competitor exists.

**Flagship study:** AK-2401 — BRD Cattle Phase II  
**Planned modules:** Arken Canine · Arken Aquatic · Arken Agri · Arken Primate

---

## Tech stack

| Layer | Tool | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Phase 4 — not set up yet |
| Styling | CSS variables (token file) | Never hardcode hex |
| Database | Supabase (Postgres) | Phase 4 — not set up yet |
| Fonts | Roboto + Roboto Mono | Always via Google Fonts CDN link tag |
| Icons | Tabler Icons CDN | `ti ti-*` class names |

**Current phase: static HTML prototypes only.**

---

## File structure

```
arken-edc/
├── CONTEXT.md
├── DECISIONS.md
├── SESSION_HANDOFF.md
├── tokens/
│   ├── arken-tokens.css
│   └── arken-tokens.json
└── components/
    ├── 01-form-field-group.html
    ├── 02-badge.html
    ├── 03-data-table.html
    ├── 04-app-shell.html
    ├── 05-metric-card.html          ← tb-site topbar pattern lives here
    ├── 06-alert-banner.html
    ├── 07-panel-card.html
    ├── 08-form-field-flag.html
    ├── 09-form-sidebar.html
    ├── 10-subject-header.html
    ├── 11-audit-trail-full.html
    ├── 12-form-audit-trail.html
    ├── 13-query-thread.html
    ├── 14-list-pages.html
    ├── 15-queries-list.html
    ├── 16-visits.html
    ├── 17-calendar.html
    ├── 18-sdv.html
    ├── 19-form-sdv.html
    ├── 20-batch-entry.html
    ├── 21-reports.html
    ├── 22-coding.html
    ├── 23-invoices.html
    ├── 24-inventory.html
    └── 25-settings.html             ← IN PROGRESS
```

---

## 10 RULES — Every component

1. Never hardcode hex — use token variables
2. No field shadow — border only
3. Three severity levels — never merge amber/orange/red
4. `text-transform: uppercase` — never `font-variant: small-caps`
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders everywhere · 4px base radius
7. Fields and buttons: 32px height (36px for settings forms)
8. Links: text underlined, icon NOT underlined
9. Every component file is self-contained — declare all tokens in `:root`
10. Topbar = study pill + site dropdown. Breadcrumb = full navigation path.

---

## Component summaries

### 01–21 — Design system + core EDC
Full design system, app shell, nav, all core EDC components. See DECISIONS.md for individual decisions.

### 22 — Coding (DM workflow)
VeDRA v3.1 (veterinary default) + MedDRA v26.1. Four-column hierarchy: LLT · PT · HLT · SOC. Species/Breed column. Auto-code ≥80% confidence → coded, <80% → needs review. Coding panel slide-in with match scores.

### 23 — Invoices
**Fee schedule tab:** Event types across 4 sections. Currency header row — one `<select>` per site column. Three trigger modes: Form completion (grouped `<select>`) · Field value (form/field/op/value builder with live preview) · Study milestone (dropdown). Hidden `<input type="hidden" id="edit-trigger">` stores the value. Site-level overrides with checkbox + rate input + currency dropdown.

**Key fix — save order:** `saveEditModal` syncs ALL `SITES[].symbol` from `ov-curr-{site}` DOM elements at the very TOP of the function (before any branching), so `renderFee()` always reads the correct currency symbol on first save.

**Site invoices tab:** KPI strip, sortable table, status badge chip bar in detail panel (query-style: badge + description + date right-aligned in mono). Paid invoices hide the primary action button entirely. Money columns left-aligned.

### 24 — Inventory
**Shipments tab:** Empty state → "Receive first shipment" centred CTA. Modal: shipment date + receive date + CSV upload zone. Import → review table (vials). Confirm → row confirmed/view-only. "Receive shipment" sticky primary button at bottom of list (always visible, `flex-shrink:0`).

**Inventory tab:** KPI cards (clickable status filters), treatment group filter. Site dropdown in topbar (dark theme, `tb-site` pattern from file 05).

**Dispensing log tab:** Pulled from form data. Unit status chips: Back in storage (green) / Returned to sponsor (purple) / At home (blue) / Removed (red). Return modal: date, volume remaining, condition, sponsor return date, manual removal override checkbox.

**Vial detail tab:** Full lifecycle timeline. KPI strip + colour-coded dot timeline.

**Reconciliation tab:** Per treatment group aggregation. All rows neutral white — status through badge/text only.

**Usable checkbox in review:** Always shows "Yes" text. Green when checked, placeholder-grey when unchecked.

**Site filter:** In topbar (not per-tab). `tb-site` dropdown. Rationale: site is session-level context.

### 25 — Settings hub (IN PROGRESS)
Left sidebar nav with 8 sections. See "25-settings.html current state" below.

---

## 25-settings.html — Current state (session 13)

### Sections built:

**Study settings**
- Study info: inline edit (pencil → edit form → Cancel/Save, no modal)
- Protocol & timeline: current protocol shown with download button next to version field. Protocol amendments moved to site-level (Sites section removed — will live on individual site settings page)
- Study type & hierarchy: 4 type buttons (Livestock/Companion/Aquatic/Custom), each pre-fills hierarchy levels. Each level is a `<select>` from `ALL_LEVEL_OPTIONS`. Subject level has green badge. Add/remove levels. Custom study type available.
- Drug & IP: inline fields with `onblur` autosave
- Autosave toast: bottom-right fixed toast, 2s timeout

**Study preferences**
- Data save mode: radio card selection (field-level autosave vs form-level submit), 1px border at rest / 2px blue when selected
- Predefined change reasons: editable list with grip handle + trash
- Predefined query templates: editable list, no chips
- Subject list columns: table with Show / Hidden from roles / Delete columns. Role visibility as pill checkboxes per column. "Add column from form field" — 4-column grid (Column label / Form / Field / Add button), all 32px height

**Roles**
Each role card collapses/expands. When expanded shows 5 sections:

*Section 1 — Role info:* Role name input (200px), role code (80px mono), "Add to all sites" toggle, "Read-only permissions" toggle — all `align-items:center`.

*Section 2 — Main tasks* (hidden via `display:none` when read-only ON — divider is INSIDE the div):
4 tasks: data_entry · monitoring · study_management · reporting. Labels use `.checked` class for blue border. `onTaskChange(roleId, task, val)` — named function, rebuilds all perms from tasks, updates DOM labels + borders inline without re-render.

*Section 3 — Form permissions* (hidden when read-only ON — divider INSIDE the div):
6 permissions as bordered cards (blue border when checked, grey when not). `onFormPermChange(roleId, perm, val)` updates `fp-lbl-{roleId}-{perm}` border. Reset button calls `resetFromTasks(id)` which walks DOM by element IDs and updates checkboxes + borders without full re-render.

*Section 4 — Study access:* 4 perms: manage_subjects/lock_data/manage_study/export_data as 2×2 grid cards. `onStudyPermChange` named function, updates `sp-lbl-{roleId}-{perm}`.

*Section 5 — User management:* pill checkboxes for which roles this role can manage.

**Element ID conventions:**
- `fp-lbl-{roleId}-{perm}` — form permission label
- `sp-lbl-{roleId}-{perm}` — study permission label
- `task-lbl-{roleId}-{task}` — task label
- `role-tasks-section-{id}` — tasks section div (hides with read-only)
- `role-formperm-section-{id}` — form perms section div (hides with read-only)

**Form permissions**
- Forms grouped by section (Visit forms / Safety / Enrollment / Inventory / Close-out)
- `fp-row-header`: `padding:space-4 space-5`, form name `text-lg font-weight:500 line-height:1.3`, section text `text-sm text-tertiary margin-top:3px` + "Signature required" in blue-600
- No chips in collapsed header — name + section + chevron only
- Each form expands to 6-role × 6-permission matrix
- Column headers have "select all" checkbox with indeterminate state (`updateColAllCheckbox`)
- Named functions: `onFormPermChange`, `toggleFormPermCol`, `updateColAllCheckbox`
- Expand/Collapse toggle: single button, "Expand all" ↔ "Collapse all", icon swaps (`ti-arrows-maximize` ↔ `ti-arrows-minimize`)
- "Auto-group forms (AI)" button — purple sparkle icon. Modal: 1.2s spinner → suggested groups with editable names + draggable form rows (`draggable="true"`, grip icon, `ondragstart`/`ondragend` opacity)

**Randomization** — method, block size, blinding, stratification factors, treatment groups with ratio bar, list upload/generate/lock.

**Inventory settings** — dispense trigger form mapping, return trigger config, 3 toggle rules.

**Audit & Signatures** — audit scope, RFC requirement, unalterable timestamps (locked on), e-sig method, meaning statement, co-signature, per-form signature toggles.

**Billing** — holdback %, payment terms, default currency, fee schedule table with editable rates.

### Sections pending:
- Sites section was removed — will be its own page at animal/site level
- Living style guide (GitHub Pages) — last item

---

## Topbar site picker pattern (from file 05)

```html
<button class="tb-site" onclick="toggleSiteDropdown()" id="tb-site-btn">
  All sites <i class="ti ti-chevron-down" id="tb-site-chevron" style="font-size:11px;opacity:0.7"></i>
</button>
<div id="site-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);...;z-index:200">
  <button class="site-dd-item active" onclick="setSiteFilter('')">All sites</button>
  <button class="site-dd-item" onclick="setSiteFilter('Austin')">Austin</button>
  ...
</div>
```
`tb-site`: plain white text + chevron, no border/background, dark topbar. Dropdown: white surface, `site-dd-item` rows, active = blue-600 + blue-50. Close on outside click via `document.addEventListener('click', ...)`.

---

## JS safety patterns (critical — violations cause silent bugs)

| Pattern | Rule |
|---|---|
| CSS values in template literals | NEVER `this.closest('label').style.borderColor='var(--blue-600)'` inside an HTML attribute — single quotes terminate the attribute. Use named functions + element IDs |
| JSON in onclick | NEVER `JSON.stringify(obj)` in onclick attributes — quote collision |
| Row data in onclick | Use index lookup: `DISP_ROWS[i]` not inline JSON |
| addEventListener timing | `getElementById('x').addEventListener(...)` at parse time → element may not exist. Always use `?.addEventListener` |
| Duplicate document listeners | `document.addEventListener('input', ...)` in loops → duplicate listeners. Add `oninput`/`onchange` directly on elements |
| Sort icon timing | Always call `render()` first, then re-query fresh DOM nodes for icon updates |
| Data declared after boot | `const SHIPMENTS = [...]` must be declared before any boot call that references it |
| Duplicate element IDs | Break silently — always check before adding |
| Template literal nesting | Named functions only inside nested template literals — no inline style updates |

---

## Design token quick reference

```css
/* Semantic colors */
--blue-600: #1760A8       --blue-50: #E8F4FF      --blue-200: #7AB8EE
--green-600: #1A6B47      --green-50: #EEFAF4     --green-200: #58BC88
--amber-700: #8A5C00      --amber-50: #FFF8E7     --amber-200: #F5B830
--red-600: #B52626        --red-50: #FFF0F0       --red-200: #EC8585
--purple-600: #534AB7     --purple-50: #F0EEFF    --purple-200: #A9A3EC
--orange-600: #C94C0C     --slate-600: #3D5A78    --slate-50: #EEF1F6

/* Surfaces */
--color-surface: #FFFFFF
--color-page-bg: #FBFBFB
--color-hover-bg: #F0F0EE
--color-border: #E8E8E6
--color-border-subtle: #F0F0EE

/* Text */
--color-text-primary: #2C2D33
--color-text-secondary: #4F535B
--color-text-tertiary: #6D7480
--color-text-placeholder: #C4C4C2

/* Nav / CTA */
--color-nav-bg: #1A1F2E
--color-cta-bg: #1A1F2E

/* Type scale */
--text-xs: 11px   --text-sm: 12px   --text-base: 14px
--text-lg: 16px   --text-xl: 20px   --text-3xl: 24px

/* Spacing */
--space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 20px   --space-6: 24px

/* Radius */
--radius-sm: 2px  --radius-md: 4px  --radius-lg: 6px  --radius-full: 9999px
```
