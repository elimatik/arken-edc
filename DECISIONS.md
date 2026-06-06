# Arken EDC — Decisions Log
All design and technical decisions with rationale. Every entry is a portfolio talking point.

---

## Sessions 1–5 (2026-05-25 — 2026-05-27)

### Product name: Arken
Hard consonants signal precision. No trademark conflict. Works at platform + module level.

### Light-first mode
Light covers the largest user group (clinical monitors in offices). Dark planned for field technicians on tablets.

### Three-level severity scale
Amber (warning) → Orange (discrepancy) → Red (critical). No competitor EDC uses three levels — all collapse to two. Clinical rationale: amber = out-of-range but plausible, orange = edit check failure, red = safety-critical.

### Color palette
Navy CTA (#1A1F2E) differentiates from all competitors. Semantic: blue = SDV/data, green = complete, amber = warning, red = critical, purple = group/pen level, slate = secondary/locked.

### Table system (canonical)
```css
.list-table thead th { position:sticky; top:0; z-index:5; background:var(--color-surface);
  font-size:var(--text-xs); text-transform:uppercase; letter-spacing:var(--tracking-caps);
  border-bottom:1px solid var(--color-border); cursor:pointer; }
th:first-child, td:first-child { padding-left: var(--space-5); }
th:last-child, td:last-child { padding-right: var(--space-5); }
```
Three-state sort: desc → asc → none. Sort icons updated AFTER render() on fresh DOM nodes.

### Collapsible nav
74px collapsed → 160px expanded. Edge toggle at `top:56px; right:-13px`.

---

## Sessions 6–8 (2026-05-28 — 2026-05-30)

### Query flow (components 08, 13, 19)
Three states only: Raised → Responded → Resolved. No "Closed".

### Delta (Δ) change reason system
Dotted red = change required · Solid blue = answered · Filled green = reviewed. Submit gate blocked until all deltas reviewed.

### RFC (Reason for Change)
Two modes: Form-level (RFC panel on re-edit) · Field-level (auto-save on confirm). First-time entry never triggers RFC.

### SDV icon
`ti-circle-check` outline = unverified. `ti-circle-check-filled` blue = verified.

### Flag visibility rules
Queries off → inactive flags hide; active stay. SDV off → unverified icons hide; verified stay.

---

## Sessions 9–10 (2026-05-31 — 2026-06-02)

### Calendar — Protocol SoE
Matrix layout (not Gantt). D0 = pivot with bold border + ★.

### Visits page — flat urgency table
Single flat table: overdue (red-50) → due today (amber) → upcoming (white).

### SDV page architecture
SDV worklist (18) + form-level verification (19) separate files. Form IS the SDV tool.

### Batch entry
Form-level vs grid-level RFC. Optional fields excluded from required count.

### Reports — AI builder
Two-column: chat (380px) + report output. "Add to library" → Custom reports section.

---

## Sessions 11–12 (2026-06-02 — 2026-06-04)

### Coding — four-column hierarchy
LLT, PT, HLT, SOC as separate columns. Species/Breed as own column — veterinary differentiator.

### Coding — auto-code threshold
≥80% = auto-coded, <80% = needs review, 0% = pending.

### Invoices — fee schedule structure
14 event types across 4 sections. Three trigger modes: Form completion · Field value · Study milestone. All triggers from structured options, no free-text.

### Invoices — currency per site column
One `<select>` per site column. `setSiteCurrency(site, currency)` updates `siteObj.symbol` and re-renders all cells. Fix: sync all `SITES[].symbol` from DOM at the very top of `saveEditModal` before any branching.

### Invoices — 20-site scalability
>4 sites: collapse to "Site overrides" summary column + scrollable panel in edit modal (max-height:280px). Currently 3 sites; pattern documented for scale.

### Inventory — site filter in topbar
Site picker at topbar level (not per-tab). Rationale: site is session-level context, not a local filter.

### Inventory — reconciliation
Group-level aggregation. Variance = received − returned − removed (should be 0). Neutral white rows — status through badge and text only.

### Inventory — return modal
Condition routing: good/acceptable → back to inventory; compromised/damaged → removed. Sponsor return date shown conditionally. Manual removal override checkbox (orange).

### JS safety patterns (sessions 1–12)
- Never `JSON.stringify` in `onclick` attributes — quote collision
- Use index lookup arrays not inline JSON in onClick
- Template literals inside double-quoted attributes → named functions
- `const DATA = [...]` before boot calls that reference it
- No duplicate element IDs
- `?.addEventListener` for null safety
- `oninput`/`onchange` directly on elements, not `document.addEventListener`

---

## Sessions 13–14 (2026-06-05 — 2026-06-06)

### Settings — section architecture
8 sections in sidebar: Study settings · Study preferences · Roles · Form permissions · Randomization · Inventory · Audit & Signatures · Billing. Grouped under STUDY / ACCESS / PROTOCOL / SYSTEM labels.

### Settings — toggle placement
All toggle rows: toggle on **left**, label+desc on right. `display:flex; gap:space-3; align-items:flex-start`. Never `justify-content:space-between` for toggle rows — it pushes toggle to the far right. Expandable sub-configs (low stock, partial returns) use `margin-left:52px` to indent under the label text.

### Settings — lazy render pattern
Sections with JS-rendered content call their render functions from `showSection(id)`, NOT at boot, because the section's DOM elements don't exist until the section is first activated. Full map:
```js
if (id==='roles')         renderRoles();
if (id==='preferences')   { renderChangeReasons(); renderQueryTemplates(); renderSubjectCols(); }
if (id==='formperm')      renderFormPerms();
if (id==='randomization') renderGroups();
if (id==='inventory')     { renderInvPerms(); renderLowStockRoles(); renderConditionMapping(); }
if (id==='audit')         renderSigForms();
if (id==='billing')       renderBillingFee();
```

### Settings — JS definition order rule
`let` variable declarations are NOT hoisted. Any boot-level call to a function that references a `let` variable must come AFTER that variable's declaration in the file. `function` declarations ARE hoisted so internal calls within function bodies are fine. Symptom: function runs but renders nothing (no error) because the variable is `undefined`. Fix: move the boot call to after all definitions, or use `window.onload`.

### Settings — data-attribute pattern for onclick
Never embed variable values directly in `onclick` strings inside JS template literals — single-quote collisions cause `SyntaxError: missing ) after argument list` that Node.js catches but is silent in some browsers. Canonical fix:
```js
// WRONG: '<button onclick="doThing(\''+key+'\')">'
// RIGHT: '<button data-key="'+key+'" onclick="doThing(this.dataset.key)">'
```
Applied to: strat factor edit/remove, inventory permission checkboxes, condition mapping buttons.

### Settings — Node.js syntax validation
Before declaring any JS block done, run: `node --check /tmp/script.js`. Catches quote collisions and syntax errors that browser consoles may swallow. Implemented via Python `subprocess.run(['node','--check',tmpfile])` in bash_tool.

### Settings — Roles section
6 default roles: CRC · CRA · PI · DM · PM · Admin. Each role card has 5 stepped sections: Role info · Main tasks · Form permissions · Study access · User management. Read-only toggle hides tasks and form permission sections. Named JS handlers: `onTaskChange`, `onFormPermChange`, `onStudyPermChange`, `setRoleReadOnly`, `resetFromTasks`. Element IDs follow pattern: `fp-lbl-{roleId}-{perm}`, `task-lbl-{roleId}-{task}`, `role-tasks-section-{id}`.

### Settings — Form permissions (two views)
**By form** (default): expand a form row → role × permission matrix. Best for "who can access this form?"
**By role**: expand a role row → form × permission matrix grouped by section. Best for "what can CRC do across all forms?"
Toggle in section header — same underlying `r.formPerms` data, axes swapped. `setFpView('form'|'role')` swaps render function and hint text. Expand all / collapse all works for both views.

### Settings — Randomization method show/hide
| Method | Block size | Strat factors | List actions | Notes |
|---|---|---|---|---|
| Blocked | ✓ | Optional | ✓ | Default |
| Simple | Hidden | Optional | ✓ | Amber warning: <100 subjects |
| Stratified | ✓ | Required | ✓ | Strat desc becomes "Required" |
| Minimization | Hidden | Required | Hidden | Dynamic assignment info panel shown |

Block/ratio compat check: block size must be a multiple of ratio total. Shown as amber inline warning on both the block size row and inside the ratio editor modal.

### Settings — Stratification factors
Source types: **Site** (built-in, no form mapping, no levels, uses study's site list) · **Form field** (form select → field select, plus levels editor). Scope: Per site (balanced within each site) · Across study (balanced globally). Factor cards show: name, source badge, one-line detail (site: "Built-in — uses the study's site list"; form field: "FormName → FieldName (level1 / level2)"). Edit/remove via pencil + trash using `data-key` attributes. Modal supports both Add and Edit mode (`_sfEditKey` state). CSS classes `.strat-scope-btn` / `.strat-scope-btn.active` / `.strat-factor-card` must be in `<style>`.

### Settings — Treatment group ratio editor
Ratio bar in groups card has a pencil icon → opens ratio modal. Modal: one number input per group, live preview bar (proportional color segments, 150ms transition), estimated enrollment at 60 planned subjects, block/ratio compat check. `_ratioTemp` = deep copy of GROUPS on open; saved back on confirm.

### Settings — Inventory rules
Four rules with toggle-left pattern:
1. Require unit ID on dispense — simple toggle
2. Alert on low stock → config panel: Threshold (number input + "units") + Notify roles (pill checkboxes, 2-column CSS grid layout so labels align). Roles rendered by `renderLowStockRoles()`.
3. Auto-deplete on zero return — simple toggle
4. Allow partial unit returns → config panel: condition field (static linked badge from return trigger, not a dropdown; unlink button) + condition→outcome mapping table + minimum returnable volume (ml).

### Settings — Condition → outcome mapping
Condition field shown as a blue mono badge ("Unit condition on return") linked from Return trigger. Clicking unlink removes it and hides the mapping table. Each option from `CONDITION_OPTIONS[fieldKey]` maps to one of four outcomes: Return to stock (full unit) · Return to stock (partial unit) · Remove from stock / destroy · Quarantine — pending review. Active outcome highlighted with colored border + background. Buttons use `data-field`, `data-opt`, `data-outcome` attributes → `setConditionMapping(el)`.

### Settings — Inventory permissions matrix
8 actions × 6 roles. thead and tbody both rendered by `renderInvPerms()`. `onInvPermChange(el)` reads `el.dataset.role` and `el.dataset.perm`. Default role split: CRC=dispense+log_return, CRA=reconcile, PI=dispense+confirm_return, DM=reconcile+destroy, PM=log/confirm shipment+reconcile, Admin=all. `perm-matrix td:first-child` / `th:first-child` use `padding-left:var(--space-5)`.

### Settings — Audit & Signatures
Audit trail card **removed** — 21 CFR Part 11 compliance is non-negotiable, no user config. Only two remaining cards: Electronic signatures (method select + Require meaning statement toggle-left + Co-signature toggle-left) · Signature requirements per form (toggle-left per form rendered by `renderSigForms()`). Quote pattern for `toggleSigRequired`: `\'' + f.id + '\'`.

### Settings — Billing section order
1. Billing information (contact name, company, ATTN, email, phone, address, city, state, postal, country — required fields marked *). 2. Payment terms (holdback %, payment terms, currency). 3. Fee schedule (renderBillingFee + openFeeModal).

### Settings — Fee schedule
Rate column is `<input class="fee-input-sm" type="number">` with `onblur="updateFeeRate(idx, this.value)"` — editable inline without opening modal. Pencil → `openFeeModal(idx)`. Fee modal: event name, section (select + "New section…" reveals custom input), trigger (text + hint), default rate ($ prefix, USD, per-site override note). Footer: Delete event (left, hidden on add mode) + Cancel/Save (right). `_feeEditIdx` tracks add vs edit state.

### Settings — CSS required for strat scope buttons
These classes must exist in `<style>` (easy to miss when patching):
```css
.strat-scope-btn { inline-flex, 28px, bordered, secondary text }
.strat-scope-btn:hover { blue-200 border, blue-600 text, blue-50 bg }
.strat-scope-btn.active { blue-600 border+text, blue-50 bg, font-weight:500 }
.strat-factor-card { 1px border, radius-md, surface bg }
```
