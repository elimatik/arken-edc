# Arken EDC — Design & Architecture Decisions
Last updated: 2026-06-07 | Sessions 1–15 complete

Every significant decision made across all design sessions, with rationale. Useful for Claude Code and future contributors. Every entry is a portfolio talking point.

---

## Sessions 1–5 — Foundation

### Product name: Arken
Hard consonants signal precision. No trademark conflict. Works at platform + module level (Arken Canine, Arken Aquatic, etc).

### Light-first theme
Covers the largest user group (clinical monitors, coordinators in offices). Dark mode planned for field technicians on tablets.

### Three-level severity scale
Amber (warning) → Orange (discrepancy) → Red (critical). Competitors collapse to two. Clinical rationale: amber = out-of-range but plausible, orange = edit check failure, red = safety-critical. Never merged.

### Navy CTA color (#1A1F2E)
Differentiates from all competitors. Doubles as nav background — one dark tone across the whole system.

### Table pattern
Sticky thead, xs uppercase caps headers with tracking, three-state sort (desc → asc → none), always call render() first then re-query DOM for sort icons — never cache nodes before render.

### Collapsible nav
74px collapsed → 160px expanded. Edge toggle at top:56px; right:-13px. Icons-only when collapsed.

---

## Sessions 6–8 — Core EDC patterns

### Query lifecycle
Four states: Raised → Responded → Resolved → Closed. Responded = field returns to default (flag stays amber). Resolved = green flag. Closed = DM action only, read-only thread.

### Edit check vs Query
Edit checks = system-raised (orange flag). Queries = human-raised (amber flag). Same lifecycle, different trigger and colour.

### Delta (Δ) change reason system
- .none = display:none (hidden — field not changed)
- .change-required = dashed red border (field edited, reason not yet given)
- .answered = solid blue (reason submitted)
- .approved = filled green (DM reviewed)
Submit gate blocked until all deltas answered.

### RFC modes
Field-level: auto-save on confirm, no submit button. Form-level: RFC panel on re-edit, confirm → pending save, actual save on Submit. First-time entry never triggers RFC.

### SDV icon
ti-circle-check outline = unverified. ti-circle-check-filled blue = verified. Does NOT tint field background — SDV state lives on the icon only, not the field.

### Flag icon rules
- No query: ti-flag (ghost/outline)
- Open query: ti-flag-filled (orange)
- Resolved: ti-flag (green)
Queries off → inactive flags hide; active (flagged/resolved) stay. SDV off → unverified icons hide; verified stay.

---

## Sessions 9–10 — Supporting screens

### Calendar: Protocol SoE
Matrix layout (not Gantt). Procedure on Y, study day on X. Phase shading. D0 = pivot with bold border and star.

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
≥80% = auto-coded, <80% = needs review, 0% = pending. Keyword-based scoring.

### Invoices: fee schedule currency
Currency header row above first section. One select per site column. setSiteCurrency(site, currency) updates siteObj.symbol and re-renders. All cells use the site's symbol immediately.

### Invoices: override save order bug fix
Root cause: saveEditModal had two code paths; the __new__ branch skipped currency sync. Fix: sync ALL SITES[].symbol from DOM at very TOP of saveEditModal before any branching.

### Invoices: trigger modes
Form completion: grouped select with visit groups + individual forms. Field value: form/field/operator/value builder with live updateTriggerPreview(). Study milestone: separate dropdown. Hidden input type=hidden stores the value.

### Invoices: invoice detail panel
Query-style status bar: badge chip (slate/amber/blue/green) + description + issue date right-aligned in mono. Paid invoices hide primary action button entirely.

### Invoices: 20-site scalability
Per-site override columns don't scale past ~6 sites. Pattern for 20+: single "Site overrides" summary column + scrollable per-site rows in modal (max-height:280px, overflow-y:auto).

### Inventory: shipments tab
First tab visible. Empty state with centred CTA. Modal: date fields + CSV upload zone. Import → review table. Confirm → confirmed row (view/download only). "Receive shipment" sticky primary at bottom.

### Inventory: usable checkbox
Always shows "Yes" text. Green when checked, placeholder-grey when unchecked. Never shows "No".

### Inventory: site filter in topbar
Lives at topbar level (not per-tab). Site is session-level context. CRC at Austin scopes their whole workspace.

### Inventory: reconciliation
Group-level (not per-vial). Variance = received − returned − removed (should be 0). All rows neutral white — status via badge only, no background colours.

---

## Session 13 — Settings hub

### Settings architecture
Left sidebar nav (200px fixed) + scrollable content area. 8 sections across 4 groups: STUDY (Study settings, Study preferences) · ACCESS (Roles, Form permissions) · PROTOCOL (Randomization) · SYSTEM (Inventory, Audit & Signatures, Billing).

### Sites section removed from settings
Sites have their own dedicated record page (27-site-record.html) accessed through Data Entry drill-down. Protocol amendments per site live there, not in settings.

### Study hierarchy: type pre-fills levels
4 study types: Livestock (Site→Barn→Pen→Animal) · Companion (Site→Animal) · Aquatic (Site→Tank room→Tank) · Custom. Admin can override each level name. Subject level has green badge. Levels are add/remove-able.

### Study preferences: separate section
Data save mode + predefined change reasons + predefined query templates + subject list columns moved to dedicated "Study preferences" section, separate from core study settings.

### Subject list columns: role visibility
Each column (except Subject ID) has a "Hidden from roles" toggle set: pill checkboxes per role. Column can pull values from form fields. Subject ID is locked/required.

### Roles: task-first permission model
4 tasks (Data entry / Monitoring & SDV / Study management / Reporting & export) → auto-set 6 form perms + 4 study perms.

6 form permissions: view · edit · sign · review · query · finalize
4 study access permissions: Manage subjects · Lock & finalize data · Study settings · Export & reports

### Roles: stepped sections pattern
All sections visible at once (not tabbed) — same mental model as Medidata Rave. Section order: info → tasks → form perms → study access → user management. Task checkboxes auto-set everything below; "Reset" re-applies the preset.

### Roles: read-only toggle hides sections
Read-only toggle → display:none on tasks section and form permissions section. Dividers are INSIDE the section divs so they hide too.

### Roles: named functions over inline handlers
All checkbox onchange use named functions (onTaskChange, onFormPermChange, onStudyPermChange) with (roleId, perm, val) args. Update both data model and label border via fp-lbl-{roleId}-{perm} ID. Inline style.borderColor='var(--blue-600)' inside HTML attributes breaks silently — single quotes terminate the attribute early.

### Form permissions: collapsed row design
fp-row-header: padding space-4 space-5. Form name text-lg font-weight:500. Section text text-sm text-tertiary. No chips. Signature required shown as "· Signature required" in blue-600 inline.

### Form permissions: column select-all
Each permission column header has a checkbox. Checks/unchecks all role checkboxes in that column. Updates to indeterminate state when some-but-not-all roles have that permission.

### Form permissions: two views
By form (default): expand a form → role × permission matrix. Best for "who can access this form?"
By role: expand a role → form × permission matrix grouped by section. Best for "what can CRC do?"
Toggle in section header. Same underlying data — axes swapped.

### Form permissions: AI auto-grouping
"Auto-group forms" button (purple sparkle) opens modal. 1.2s spinner → suggested groups with editable names + draggable form rows. In production: swap simulateAIGrouping() for real API call.

---

## Session 14 — Settings completion

### Settings: toggle placement
All toggle rows: toggle on LEFT, label+desc on right. display:flex; gap:var(--space-3); align-items:flex-start. Never justify-content:space-between for toggle-left rows. Expandable sub-configs use margin-left:52px.

### Settings: lazy render — DOM existence rule
Sections with JS-rendered content call their render functions from showSection(id), NOT at boot. The section's DOM elements don't exist until the section is first activated.

### Settings: let definition order rule
let variable declarations are NOT hoisted. Any boot-level call to a function referencing a let variable must come AFTER that variable's declaration. Symptom: function runs but renders nothing — variable is undefined. Fix: move boot call after all definitions.

### Settings: data-attribute pattern (quote collision fix)
Never embed variable values directly in onclick strings inside JS template literals.
WRONG: '<button onclick="doThing(\'' + key + '\')">'
RIGHT:  '<button data-key="' + key + '" onclick="doThing(this.dataset.key)">'
Applied to: strat factor edit/remove, inventory permission checkboxes, condition mapping buttons.

### Settings: Node.js syntax validation
Run node --check script.js before declaring any JS block done. Catches quote collisions that browser consoles swallow silently.

### Settings: Randomization method show/hide
| Method       | Block size | Strat    | List actions        |
|---|---|---|---|
| Blocked      | Visible    | Optional | Visible             |
| Simple       | Hidden     | Optional | Visible + amber warn|
| Stratified   | Visible    | Required | Visible             |
| Minimization | Hidden     | Required | Hidden (dynamic)    |

Block size must be multiple of ratio total — amber compat warning on block size row and inside ratio modal.

### Settings: Stratification factors
Two source types: Site (built-in, no form mapping, no levels) · Form field (form → field + levels editor). Scope toggle: Per site / Across study. Edit/remove via data-key attributes. CSS classes .strat-scope-btn / .strat-scope-btn.active / .strat-factor-card must be in style block.

### Settings: Ratio editor modal
Pencil icon on ratio bar → modal. One number input per group. Live preview bar (proportional segments, 150ms transition). Estimated enrollment at 60 planned subjects. Block/ratio compat check inline.

### Settings: Inventory rules
4 toggle-left rules:
1. Require unit ID on dispense — simple toggle
2. Alert on low stock → threshold (number) + notify roles (pill checkboxes, 2-column CSS grid)
3. Auto-deplete on zero return — simple toggle
4. Allow partial unit returns → condition field (static linked badge) + condition→outcome mapping table + minimum returnable volume

### Settings: Condition → outcome mapping
4 outcomes: Return to stock (full) · Return to stock (partial) · Remove/destroy · Quarantine. Active outcome has colored border+bg. All buttons use data-field, data-opt, data-outcome → setConditionMapping(el). renderConditionMapping() called from showSection.

### Settings: Inventory permissions matrix
8 actions × 6 roles. onInvPermChange(el) reads el.dataset.role and el.dataset.perm. Default split: CRC=dispense+log_return, CRA=reconcile, PI=dispense+confirm_return, DM=reconcile+destroy, PM=log/confirm shipment+reconcile, Admin=all.

### Settings: Audit & Signatures
Audit trail card removed — 21 CFR Part 11 compliance is non-negotiable, no user config needed. Remaining: Electronic signatures card + Signature requirements per form (toggle-left per form via renderSigForms()).

### Settings: Billing section order
1. Billing information (contact name, company, ATTN, email, phone, address, city, state, postal, country — required marked *)
2. Payment terms (holdback %, payment terms select, currency select)
3. Fee schedule (inline editable rate column + fee modal for full edit)

---

## Session 15 — Data entry screens and dashboards

### Navigation: Data Entry nav always active on node records
When viewing site, barn, pen, or subject records, Data Entry nav item is active. Animals nav is only active on the flat animals list.

### Navigation: Site dropdown scopes entire view
Selecting a site in topbar filters in place — does not navigate. CRAs switch between sites during monitoring without drilling in/out.

### Data Entry: full-page drill-down, not split panel
Tested both approaches. Split panel with sidebar tree became unwieldy at 4+ levels. Full-page drill-down matches the mental model of "going into" a location.

### Data Entry: clicking site in topbar skips site list
Selecting "Austin Research Center" from topbar while on Data Entry lands directly in Austin's barn list. CRCs work at one site and should land directly in their data.

### Node records: site uses fixed standard cards, barn/pen/subject use builder-defined
Site information, contacts, protocol amendments, regulatory, visits = GCP-required standard data for every trial. Not builder-defined. Barn/pen/subject forms are study-specific and built in the form builder.

### Node records: barn/pen uses same shell as subject record
Consistent mental model for data entry regardless of hierarchy level. Same layout = same interaction pattern.

### Protocol amendments: stepped sections, current badge only
Each amendment expands to 4 steps: Version & dates → Change summary → Regulatory approval → Documents. Only the latest amendment shows "Current" badge — older ones show no badge (position in list is self-evident).

### Site visits: blue header strip on new-item form
New amendment and new visit forms have blue background:var(--blue-600) header strip + white body. Visually distinguishes in-progress new entry from existing rows. Body stays white (no blue tint).

### Subject record: sticky form header
Breadcrumb + subject header + SDV bar + form header wrapped in form-sticky-header with position:sticky;top:0;z-index:10. Forms are long — subject ID and action buttons must always be visible.

### Subject record: delta button hidden until field edited
delta-btn.none = display:none. Appears as dashed red (change-required) only when field value changes from original. After reason submitted = solid blue (answered). After DM approval = filled green (approved). Showing Δ on every field is noise.

### Subject record: SDV does NOT tint field background
Field background color is used exclusively for query state (amber). Mixing SDV into field color creates ambiguity. SDV state lives on the verify button icon only.

### Subject record: status badge = text only, no dot
"Randomized", "Screened" etc. are plain text badges with colored border/bg. The color already communicates status — a dot adds no information.

### Animals list: three-state sort matching 14-list-pages exactly
None (transparent ti-arrows-sort) → desc (ti-arrow-down blue) → asc (ti-arrow-up blue) → none. Per-column sort state tracked in sortState{} object.

### Animals list: barn and pen filters cascade from site
Selecting a site repopulates barn select with only that site's barns. Selecting a barn repopulates pens. Built dynamically from data — not hardcoded.

### Animals list: two row actions only (clipboard + message-report)
Clipboard-list (open subject record) and message-report (raise query). No overflow dots. Everything else belongs in bulk actions or inside the record.

### Dashboard: align-items:start on grid
Prevents columns stretching to match each other's height. Each column is independently sized by its content.

### Dashboard: customizable with role defaults
Each role has curated default layout. Users enter edit mode to remove/add cards. Card library is permission-filtered per role. Role defaults cover 80% of users immediately; customization handles the rest.

### Dashboard: global AI widget, not dashboard-only
Useful queries arise in context — a CRC on the animals list might ask about overdue forms. Dashboard-only widget would require navigating back to use it.

### Dashboard: AI responses are role-scoped and server-side
In production, Anthropic API call is made server-side with the role from the session token. The client never has direct API access. A CRC cannot get cross-site data by asking the AI a clever question.

### Dashboard: enrollment track height 6px
10px is too thick. 4px is too thin. 6px is the right balance for readability without dominating.

---

## Architecture decisions

### Self-referencing hierarchy_nodes table
```sql
hierarchy_nodes (
  id, study_id, parent_id (→ self),
  node_type (site|barn|pen|subject|tank_room|tank|...),
  name, code, status, metadata jsonb
)
```
Supports any hierarchy depth and any node type without schema changes. A 3-level companion study and a 5-level aquatic study use the same table.

### form_definitions → form_instances → field_answers
- form_definitions: builder output (field schema, validation rules, visit assignments)
- form_instances: one row per (node × visit × form), tracks status
- field_answers: one row per (field × instance), stores value + timestamps + locked flag
Separates form schema (stable) from data (mutable).

### Audit log is append-only
```sql
audit_log (
  id, study_id, user_id, timestamp_utc,
  action (insert|update|delete),
  table_name, record_id,
  old_value jsonb, new_value jsonb,
  reason_for_change text, ip_address
)
```
21 CFR Part 11 requires complete unalterable audit trail. No UPDATE or DELETE ever touches audit_log.

### Supabase RLS enforces data scoping
Row Level Security on all clinical tables. CRC can only SELECT/INSERT/UPDATE rows where site_id matches their assignment. DM and CRA can SELECT across all sites with different write permissions. Role scoping enforced at database layer, not just application layer.

### Study builder deferred to iteration 2
Builder UI depends on what the data model looks like once implemented. Better to design after coding data entry, when form_definitions shape is real and stable. Designing upfront risks mismatch.

---

## What was explicitly ruled out

| Option | Ruled out because |
|---|---|
| Split-panel sidebar tree for Data Entry | Too complex at 4+ levels, doesn't scale |
| Field background tint for SDV state | Conflicts with query state color coding |
| "Superseded/Original" badges on amendments | Redundant — position in list is self-evident |
| Dot icon in status badges (session 15) | Adds noise, color already communicates state |
| Drag-to-reorder in static HTML | Requires dnd-kit in React — deferred |
| Dashboard-only AI chat | Global widget serves more use cases |
| Client-side AI API calls | Security risk — must be server-side in production |
| Study builder in design phase | UI depends on real data model — deferred |
| max-width on content-col (site record) | Site record should use full width |
| Overflow dots as third row action | Belongs in bulk actions or inside the record |
