# Arken EDC — Decisions Log
Design and technical decisions with rationale. Every entry is a portfolio talking point.
Last updated: 2026-06-06

---

## Sessions 1–5 — Foundation

### Product name: Arken
Hard consonants signal precision. No trademark conflict. Works at platform + module level (Arken Canine, Arken Aquatic, etc).

### Light-first theme
Covers the largest user group (clinical monitors, coordinators in offices). Dark mode planned for field technicians on tablets.

### Three-level severity scale
Amber (warning) → Orange (discrepancy) → Red (critical). Competitors collapse to two. Clinical rationale: amber = out-of-range but plausible, orange = edit check failure, red = safety-critical.

### Navy CTA color (#1A1F2E)
Differentiates from all competitors. Doubles as nav background — one dark tone across the whole system.

### Table pattern
```css
.list-table thead th {
  position: sticky; top: 0; z-index: 5;
  font-size: var(--text-xs); text-transform: uppercase; letter-spacing: var(--tracking-caps);
  border-bottom: 1px solid var(--color-border); cursor: pointer;
}
th:first-child, td:first-child { padding-left: var(--space-5); }
```
Three-state sort: desc → asc → none. Always call `render()` first, then re-query DOM for sort icons — never cache nodes before render.

### Collapsible nav
74px collapsed → 160px expanded. Edge toggle at `top:56px; right:-13px`. Icons-only when collapsed.

---

## Sessions 6–8 — Core EDC patterns

### Query lifecycle
Three states only: Raised → Responded → Resolved. No "Closed". Responded = field returns to default (flag stays amber). Resolved = green flag + check icon (`flag-query-resolved-icon`).

### Edit check vs Query
Edit checks = system-raised (orange flag). Queries = human-raised (amber flag). Same lifecycle, different trigger and colour.

### Delta (Δ) change reason system
Dotted red = change required · Solid blue = answered · Filled green = reviewed. Submit gate blocked until all deltas reviewed.

### RFC modes
Field-level: auto-save on confirm, no submit button. Form-level: RFC panel on re-edit, confirm → pending save, actual save on Submit. First-time entry never triggers RFC.

### SDV icon
`ti-circle-check` outline = unverified. `ti-circle-check-filled` blue = verified. Never confuse with query-resolved (flag+check pattern).

### Flag visibility rules
Queries off → inactive flags hide; active (flagged/resolved) stay. SDV off → unverified icons hide; verified stay.

---

## Sessions 9–10 — Supporting screens

### Calendar: Protocol SoE
Matrix layout (not Gantt). Procedure on Y, study day on X. Phase shading. D0 = pivot with bold border + ★.

### Visits page
Flat urgency table sorted by: overdue (red-50 tint) → due today (amber) → upcoming (white).

### SDV architecture
SDV worklist (18) + form-level verification (19) are separate files. The form IS the SDV tool — CRA works on the real form with SDV icons overlaid.

### Reports: AI builder
Two-column: chat (380px) + report output. "Add to library" → Custom reports section.

---

## Sessions 11–12 — Coding, Invoices, Inventory

### Coding: four-column hierarchy
LLT, PT, HLT, SOC as separate columns. Never concatenate into a path string. Species/Breed as own column — veterinary key differentiator.

### Coding: auto-code threshold
≥80% = auto-coded, <80% = needs review, 0% = pending. Keyword-based scoring, multi-keyword hits increase proportionally.

### Invoices: fee schedule currency
Currency header row above first section. One `<select>` per site column. `setSiteCurrency(site, currency)` updates `siteObj.symbol` and re-renders. All cells (override and non-override) use the site's symbol immediately.

### Invoices: override save order bug fix
Root cause: `saveEditModal` had two code paths; the `__new__` branch skipped currency sync. Fix: sync ALL `SITES[].symbol` from `ov-curr-{site}` DOM elements at the very TOP of `saveEditModal`, before any branching.

### Invoices: trigger modes
Form completion: grouped `<select>` with visit groups + individual forms. Field value: form/field/operator/value builder with live `updateTriggerPreview()`. Study milestone: separate dropdown. Hidden `<input type="hidden" id="edit-trigger">` stores the value.

### Invoices: invoice detail panel
Query-style status bar: badge chip (slate/amber/blue/green) + description text + issue date right-aligned in mono. Paid invoices hide the primary action button entirely.

### Invoices: 20-site scalability
Per-site override columns don't scale. Pattern for 20+ sites: single "Site overrides" summary column in table + scrollable per-site rows in edit modal (max-height:280px, overflow-y:auto).

### Inventory: shipments tab
First tab visible. Empty state with centred CTA. Modal: date fields + CSV upload zone. After import → review table inline. Confirm → confirmed row (view/download only). "Receive shipment" sticky button at bottom of list.

### Inventory: usable checkbox
Always shows "Yes" text. Green when checked, placeholder-grey when unchecked. Never shows "No".

### Inventory: site filter in topbar
Lives at topbar level (not per-tab). Rationale: site is session-level context. CRC at Austin scopes their whole workspace.

### Inventory: reconciliation
Group-level (not per-vial). Variance = received − returned − removed (should be 0). All rows neutral white — status via badge only.

---

## Session 13 — Settings hub

### Settings architecture
Left sidebar nav (200px fixed) + scrollable content area. 8 sections: Study settings · Study preferences · Roles · Form permissions · Randomization · Inventory · Audit & Signatures · Billing.

### Sites section removed from settings
Sites will have their own dedicated settings page at the site level (accessible via Animals → Site → Site details). Protocol amendments per site live there.

### Study hierarchy: type pre-fills levels
4 study types: Livestock (Site→Barn→Pen→Animal) · Companion (Site→Clinic ward→Cage→Pet) · Aquatic (Site→Tank room→Tank→Fish) · Custom. Admin can override each level name from `ALL_LEVEL_OPTIONS` dropdown. Subject level has green "Subject level" badge. Levels are add/remove-able. Primate type removed as not commonly used in EDC practice.

### Study preferences: separate section
Moved data save mode + predefined change reasons + predefined query templates + subject list columns to a dedicated "Study preferences" section, separate from core study settings.

### Subject list columns: role visibility
Each column (except Subject ID) has a "Hidden from roles" toggle set: pill checkboxes for each role. Column can also pull values from form fields (Column label / Form / Field / Add). Subject ID is locked/required.

### Roles: task-first permission model
4 tasks (Data entry / Monitoring & SDV / Study management / Reporting & export) → auto-set 6 form perms + 4 study perms.

**6 form permissions:** view · edit · sign · review · query · finalize  
**4 study access permissions:** Manage subjects · Lock & finalize data · Study settings · Export & reports

### Roles: stepped sections pattern
All sections visible at once (not tabbed) — same mental model as Medidata Rave. Section order: info → tasks → form perms → study access → user management. Task checkboxes auto-set everything below; "Reset" re-applies the preset.

### Roles: read-only toggle hides sections
Read-only toggle → `display:none` on tasks section and form permissions section. Dividers are INSIDE the section divs so they hide too.

### Roles: named functions over inline handlers
All checkbox `onchange` use named functions (`onTaskChange`, `onFormPermChange`, `onStudyPermChange`) with `(roleId, perm, val)` args. Update both data model and label border via `fp-lbl-{roleId}-{perm}` ID. Reason: inline `style.borderColor='var(--blue-600)'` inside HTML attributes breaks silently (single quotes terminate the attribute).

### Form permissions: collapsed row design
`fp-row-header`: `padding:space-4 space-5`. Form name `text-lg font-weight:500`. Section text `text-sm text-tertiary`. No chips. Signature required shown as `· Signature required` in blue-600 inline.

### Form permissions: column select-all
Each permission column header has a checkbox. Checks/unchecks all role checkboxes in that column via `toggleFormPermCol`. Updates to indeterminate state when some-but-not-all roles have that permission (`updateColAllCheckbox`).

### Form permissions: two views (added session 14)
**By form** (default): expand a form → role × permission matrix. Best for "who can access this form?"  
**By role**: expand a role → form × permission matrix grouped by section. Best for "what can CRC do?"  
Toggle in section header. `setFpView('form'|'role')`. Same underlying `r.formPerms` data — axes swapped. Expand all / collapse all works for both views.

### Form permissions: AI auto-grouping
"Auto-group forms" button (purple sparkle) opens modal. 1.2s spinner → suggested groups with editable names + draggable form rows. In production: swap `simulateAIGrouping()` for real `fetch('/api/group-forms')`.

---

## Session 14 — Settings hub completion

### Settings: toggle placement
All toggle rows: toggle on **left**, label+desc on right. `display:flex; gap:var(--space-3); align-items:flex-start`. Never `justify-content:space-between` for toggle-left rows. Expandable sub-configs use `margin-left:52px` to indent under the label text.

### Settings: lazy render — DOM existence rule
Sections with JS-rendered content call their render functions from `showSection(id)`, NOT at boot. The section's DOM elements don't exist until the section is first activated by the user. Full map in CONTEXT.md.

### Settings: `let` definition order rule
`let` variable declarations are NOT hoisted. Any boot-level call to a function referencing a `let` variable must come AFTER that variable's declaration in the file. Symptom: function runs but renders nothing (no error) — variable is `undefined`. Fix: move boot call to after all definitions.

### Settings: data-attribute pattern (quote collision fix)
Never embed variable values directly in `onclick` strings inside JS template literals — causes `SyntaxError: missing ) after argument list`. Canonical pattern:
```js
// WRONG
'<button onclick="doThing(\'' + key + '\')">'
// RIGHT
'<button data-key="' + key + '" onclick="doThing(this.dataset.key)">'
```
Applied to: strat factor edit/remove, inventory permission checkboxes, condition mapping buttons.

### Settings: Node.js syntax validation
Run `node --check script.js` before declaring any JS block done. Catches quote collisions that browser consoles swallow. Use Python `subprocess.run(['node','--check',tmpfile])` in bash_tool.

### Settings: Randomization method show/hide
| Method | Block size | Strat required | List actions |
|---|---|---|---|
| Blocked | ✓ | Optional | ✓ |
| Simple | Hidden | Optional | ✓ (+ amber warning) |
| Stratified | ✓ | Required | ✓ |
| Minimization | Hidden | Required | Hidden (dynamic assignment) |

Block size must be a multiple of ratio total — shown as amber compat warning on block size row and inside ratio modal.

### Settings: Stratification factors
Two source types: **Site** (built-in, no form mapping, no levels) · **Form field** (form select → field select + levels editor). Scope toggle: Per site / Across study. Factor cards show name, source badge, one-line detail. Edit/remove via `data-key` attributes. CSS classes `.strat-scope-btn` / `.strat-scope-btn.active` / `.strat-factor-card` must be in `<style>` — easy to miss when patching.

### Settings: Ratio editor modal
Pencil icon on ratio bar → modal. One number input per group. Live preview bar (proportional color segments, 150ms transition). Estimated enrollment at 60 planned subjects. Block/ratio compat check inline. `_ratioTemp` = deep copy of GROUPS on open.

### Settings: Inventory rules
4 toggle-left rules:
1. Require unit ID on dispense — simple toggle
2. Alert on low stock → threshold (number) + notify roles (pill checkboxes, 2-column CSS grid). `renderLowStockRoles()` called from `showSection`, not boot.
3. Auto-deplete on zero return — simple toggle
4. Allow partial unit returns → condition field (static linked badge, not a dropdown; unlink button) + condition→outcome mapping table + minimum returnable volume.

### Settings: Condition → outcome mapping
Condition field shown as blue mono badge linked from Return trigger. 4 outcomes: Return to stock (full) · Return to stock (partial) · Remove/destroy · Quarantine. Active outcome has colored border+bg. All buttons use `data-field`, `data-opt`, `data-outcome` → `setConditionMapping(el)`. `renderConditionMapping()` called from `showSection`.

### Settings: Inventory permissions matrix
8 actions × 6 roles. `onInvPermChange(el)` reads `el.dataset.role` and `el.dataset.perm`. Default role split: CRC=dispense+log_return, CRA=reconcile, PI=dispense+confirm_return, DM=reconcile+destroy, PM=log/confirm shipment+reconcile, Admin=all. `perm-matrix td/th:first-child` → `padding-left:var(--space-5)`.

### Settings: Audit & Signatures
Audit trail card **removed** — 21 CFR Part 11 compliance is non-negotiable, no user config needed. Remaining: Electronic signatures card (method select + Require meaning statement toggle-left + Co-signature toggle-left) + Signature requirements per form (toggle-left per form via `renderSigForms()`).

### Settings: Billing section order
1. Billing information (9 fields: contact name, company, ATTN, email, phone, address, city, state, postal/ZIP, country — required fields marked *)  
2. Payment terms (holdback %, payment terms select, currency select)  
3. Fee schedule

### Settings: Fee schedule
Rate column is `<input class="fee-input-sm" type="number">` editable inline, `onblur="updateFeeRate(idx, this.value)"`. Pencil → `openFeeModal(idx)`. Fee modal: event name, section (select + "New section…" → custom input), trigger (text + hint), default rate ($ prefix, USD suffix). Footer: Delete event (left, hidden on add) + Cancel/Save (right). `_feeEditIdx` tracks state.

---

## Critical JS patterns — complete reference

```
❌ this.closest('label').style.borderColor='var(--blue-600)'  ← breaks inside HTML attrs
✓  onFormPermChange('R01','view',this.checked)  ← named function, updates by ID

❌ onclick="openModal(JSON.stringify(obj))"  ← quote collision
✓  onclick="openModal(index)"  ← pass index, look up ROWS[index]

❌ '<button onclick="fn(\''+key+'\')">'  ← SyntaxError in strict parsers
✓  '<button data-key="'+key+'" onclick="fn(this.dataset.key)">'  ← data attributes

❌ document.getElementById('x').addEventListener(...)  ← crashes if before element
✓  document.getElementById('x')?.addEventListener(...)  ← safe

❌ document.addEventListener('input', loop)  ← duplicate listeners
✓  oninput="handler()" directly on element  ← single listener

❌ cache DOM nodes → render() → use cached nodes
✓  render() → query fresh DOM nodes  ← stale node bug

❌ const DATA = [...] after boot calls  ← undefined reference
✓  const DATA = [...] before boot  ← always declare first

❌ let VAR = ... → renderFn() call in boot  ← let is NOT hoisted
✓  let VAR = ... → renderFn() call AFTER definition  ← correct order

❌ skip node --check  ← silent syntax errors
✓  node --check script.js  ← catches all quote collisions before shipping
```
