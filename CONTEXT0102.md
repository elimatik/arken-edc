# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-06-06 | Sessions 1–14 complete

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
    └── 25-settings.html             ← COMPLETE (session 14)
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

**Key fix — save order:** `saveEditModal` syncs ALL `SITES[].symbol` from `ov-curr-{site}` DOM elements at the very TOP of the function (before any branching).

**Site invoices tab:** KPI strip, sortable table, status badge chip bar in detail panel (query-style: badge + description + date right-aligned in mono). Paid invoices hide the primary action button entirely. Money columns left-aligned.

### 24 — Inventory
**Shipments tab:** Empty state → "Receive first shipment" centred CTA. Modal: shipment date + receive date + CSV upload zone. Import → review table (vials). Confirm → confirmed row (view/download only). "Receive shipment" sticky primary button at bottom of list.

**Inventory tab:** KPI cards (clickable status filters), treatment group filter. Site dropdown in topbar (dark theme, `tb-site` pattern from file 05).

**Dispensing log tab:** Unit status chips: Back in storage (green) / Returned to sponsor (purple) / At home (blue) / Removed (red). Return modal: date, volume remaining, condition, sponsor return date, manual removal override checkbox.

**Vial detail tab:** Full lifecycle timeline. KPI strip + colour-coded dot timeline.

**Reconciliation tab:** Per treatment group aggregation. All rows neutral white — status via badge/text only.

### 25 — Settings hub (COMPLETE — session 14)
8 sections: Study settings · Study preferences · Roles · Form permissions · Randomization · Inventory · Audit & Signatures · Billing.

**Sidebar nav groups:** STUDY (Study settings, Study preferences) · ACCESS (Roles, Form permissions) · PROTOCOL (Randomization) · SYSTEM (Inventory, Audit & Signatures, Billing)

**Lazy render map** — render functions called from `showSection(id)`, NOT at boot:
```js
if (id==='roles')         renderRoles();
if (id==='preferences')   { renderChangeReasons(); renderQueryTemplates(); renderSubjectCols(); }
if (id==='formperm')      renderFormPerms(); // or renderFormPermsByRole()
if (id==='randomization') renderGroups();
if (id==='inventory')     { renderInvPerms(); renderLowStockRoles(); renderConditionMapping(); }
if (id==='audit')         renderSigForms();
if (id==='billing')       renderBillingFee();
```

See DECISIONS.md sessions 13–14 for full detail on every section.

---

## Topbar site picker pattern (from file 05)

```html
<button class="tb-site" onclick="toggleSiteDropdown()" id="tb-site-btn">
  All sites <i class="ti ti-chevron-down" id="tb-site-chevron" style="font-size:11px;opacity:0.7"></i>
</button>
<div id="site-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);z-index:200">
  <button class="site-dd-item active" onclick="setSiteFilter('')">All sites</button>
  <button class="site-dd-item" onclick="setSiteFilter('Austin')">Austin</button>
</div>
```
`tb-site`: plain white text + chevron, no border/background, dark topbar. Dropdown: white surface, active = blue-600 + blue-50. Close on outside click.

---

## JS safety patterns (critical — violations cause silent bugs)

| Pattern | Rule |
|---|---|
| CSS values in template literals | NEVER `this.closest('label').style.borderColor='var(--blue-600)'` inside an HTML attribute. Use named functions + element IDs |
| JSON in onclick | NEVER `JSON.stringify(obj)` in onclick attributes — quote collision |
| Single quotes in onclick strings | NEVER `'' + var + ''` inside single-quoted JS strings — SyntaxError. Use `data-*` attributes: `data-key="'+key+'" onclick="fn(this.dataset.key)"` |
| Row data in onclick | Use index lookup: `ROWS[i]` not inline JSON |
| addEventListener timing | `getElementById('x')?.addEventListener(...)` — always use `?.` |
| Duplicate document listeners | Add `oninput`/`onchange` directly on elements, not `document.addEventListener` in loops |
| Sort icon timing | Always call `render()` first, then re-query fresh DOM nodes |
| Data declared after boot | `const DATA = [...]` must be declared before any boot call that references it |
| `let` before boot calls | `let` is NOT hoisted. Boot calls referencing a `let` variable must come AFTER that declaration |
| Node.js syntax check | Run `node --check script.js` before declaring any JS block done |

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
--color-surface: #FFFFFF        --color-page-bg: #FBFBFB
--color-hover-bg: #F0F0EE       --color-border: #E8E8E6
--color-border-subtle: #F0F0EE

/* Text */
--color-text-primary: #2C2D33   --color-text-secondary: #4F535B
--color-text-tertiary: #6D7480  --color-text-placeholder: #C4C4C2

/* Nav / CTA */
--color-nav-bg: #1A1F2E         --color-cta-bg: #1A1F2E

/* Type scale */
--text-xs: 11px   --text-sm: 12px   --text-base: 14px
--text-lg: 16px   --text-xl: 20px   --text-3xl: 24px

/* Spacing */
--space-1: 4px    --space-2: 8px    --space-3: 12px
--space-4: 16px   --space-5: 20px   --space-6: 24px

/* Radius */
--radius-sm: 2px  --radius-md: 4px  --radius-lg: 6px  --radius-full: 9999px
```

---

## Remaining to build

- **Navigation architecture redesign** — Animals section rethink: flat animal list at study/site level, site information page (in progress — session 15)
- **Living style guide** — GitHub Pages component reference
