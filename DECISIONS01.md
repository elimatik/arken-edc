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
Root cause: `saveEditModal` had two code paths; the `__new__` branch skipped currency sync. Fix: sync ALL `SITES[].symbol` from `ov-curr-{site}` DOM elements at the very TOP of `saveEditModal`, before any branching. This ensures `renderFee()` always reads the correct symbol on first save.

### Invoices: trigger modes
Form completion: grouped `<select>` with visit groups + individual forms. Field value: form/field/operator/value builder with live `updateTriggerPreview()`. Study milestone: separate dropdown. Hidden `<input type="hidden" id="edit-trigger">` stores the value (no visible free-text field).

### Invoices: invoice detail panel
Query-style status bar: badge chip (slate/amber/blue/green) + description text + issue date right-aligned in mono. Paid invoices hide the primary action button entirely.

### Invoices: 20-site scalability
Per-site override columns don't scale. Pattern for 20+ sites: single "Site overrides" summary column in table + scrollable per-site rows in edit modal (max-height:280px, overflow-y:auto). Currently 3 sites.

### Inventory: shipments tab
First tab visible. Empty state with centred CTA. Modal: date fields + CSV upload zone (click to simulate). After import → review table inline. Confirm → confirmed row (view/download only). "Receive shipment" sticky button at bottom of list inside a flex column.

### Inventory: usable checkbox
Always shows "Yes" text. Green when checked, placeholder-grey when unchecked. Never shows "No".

### Inventory: site filter in topbar
Lives at topbar level (not per-tab). Rationale: site is session-level context. CRC at Austin scopes their whole workspace. CRA/PM sees all sites by default.

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
Research-backed distilled model: 4 tasks (Data entry / Monitoring & SDV / Study management / Reporting & export) → auto-set 6 form perms + 4 study perms. Cuts: edit_final, create/archive subjects/sites, notification granularity, custom report scope — all theoretical for a study of AK-2401's size.

**6 form permissions that actually matter:**
view · edit · sign · review · query · finalize

**4 study access permissions:**
Manage subjects · Lock & finalize data · Study settings · Export & reports

### Roles: stepped sections pattern
All sections visible at once (not tabbed) — same mental model as Medidata Rave. Section order matches clinical workflow: info → tasks → form perms → study access → user management. Task checkboxes auto-set everything below; "Reset" re-applies the preset.

### Roles: read-only toggle hides sections
Read-only permissions toggle → `display:none` on both tasks section and form permissions section. Dividers are INSIDE the section divs so they hide too. `setRoleReadOnly` uses `getElementById` to target sections directly without re-rendering.

### Roles: named functions over inline handlers
All checkbox `onchange` attributes use named functions (`onTaskChange`, `onFormPermChange`, `onStudyPermChange`) that take `(roleId, perm, val)` arguments. These directly update the data model AND find the label by `fp-lbl-{roleId}-{perm}` ID to update border color. **Reason:** template literals inside template literals with inline `this.closest('label').style.borderColor='var(--blue-600)'` silently break because the single quotes in CSS values terminate the HTML attribute early.

### Form permissions: collapsed row design
`fp-row-header` pattern: `padding:space-4 space-5`. Form name `text-lg font-weight:500 line-height:1.3`. Section text `text-sm text-tertiary margin-top:3px`. No chips. No right-side content except chevron. Signature required shows as `· Signature required` in blue-600 on the section text line.

### Form permissions: column select-all
Each permission column header has a small checkbox. Checking/unchecking it toggles all role checkboxes in that column via `toggleFormPermCol`. Checkbox updates to indeterminate state when some-but-not-all roles have that permission (`updateColAllCheckbox`).

### Form permissions: AI auto-grouping
"Auto-group forms" button (purple sparkle) opens a modal. Simulates AI call with 1.2s spinner, then shows suggested groups with editable name inputs and draggable form rows. In production: swap `simulateAIGrouping()` for a real `fetch('/api/group-forms', {body: formNames})` call. Pattern already scaffolded.

### Form permissions: expand/collapse toggle
Single button `toggleExpandAll()` reads state from `_allFormsExpanded` boolean. Button text + icon swap between "Expand all" (`ti-arrows-maximize`) and "Collapse all" (`ti-arrows-minimize`).

---

## Critical JS patterns learned across all sessions

```
❌ this.closest('label').style.borderColor='var(--blue-600)'  ← breaks inside HTML attrs
✓  onFormPermChange('R01','view',this.checked)  ← named function, updates by ID

❌ onclick="openModal(JSON.stringify(obj))"  ← quote collision
✓  onclick="openModal(index)"  ← pass array index, look up ROWS[index]

❌ document.getElementById('x').addEventListener(...)  ← crashes if parsed before element
✓  document.getElementById('x')?.addEventListener(...)  ← safe

❌ document.addEventListener('input', loop)  ← duplicate listeners
✓  oninput="handler()" directly on element  ← single listener

❌ cache DOM nodes → render() → use cached nodes
✓  render() → query fresh DOM nodes  ← stale node bug

❌ const DATA = [...] after boot calls  ← undefined reference
✓  const DATA = [...] before boot  ← always declare first
```
