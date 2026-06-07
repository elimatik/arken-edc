feat: complete design phase — all screens prototyped (session 15)

## Summary
Design phase is complete. 8 new HTML prototype files added covering every
major screen in the Arken EDC application. Ready for Claude Code / Next.js build.

## New files

### 00-login.html
Two-screen single file: login (two-column, dark brand panel + form, SSO,
demo credentials pre-filled) → study selector (card grid with search +
status + species filters, enrollment bars, role chips per study).

### 26-data-entry.html
Full-page drill-down: Site → Barn → Pen → Animal. Topbar site scope
selector scopes the entire view. Study type demo bar (Livestock /
Companion / Aquatic). Three-state column sort. Panel-based navigation
with node context in header.

### 27-site-record.html
Standard (non-builder) site record. Wide card layout, no max-width.
Protocol amendments: stepped expand/collapse (4 steps: version, change
summary, regulatory, documents). Multi-visit log: each visit collapsible
with 6 fields. Both use blue header strip on new-item form.

### 28-barn-pen-record.html
Barn and Pen records using exact subject record shell (form sidebar +
form content). Builder-defined forms only. Demo bar switches between Barn
(weekly temperature log) and Pen (welfare observation). Form header
buttons match 30-subject-record pattern.

### 29-animals-list.html
Flat cross-hierarchy animals list. Barn + pen filters cascade from site.
Column chooser dropdown (13 cols, Animal ID required). Three-state sort
(ti-arrows-sort → ti-arrow-up/down). Row actions: clipboard-list +
message-report. Bulk action bar: Raise query / Lock / Unlock / Sign-off /
Export. Query raise panel (420px slide-in) with animal context chip.
Indeterminate checkbox state on partial selection.

### 30-subject-record.html
Integrated subject record: Component 10 (header) + Component 13 (query
thread) + Component 19 (SDV/remarks). Sticky form header. Delta button
hidden by default, shows as dashed red on field edit. SDV verify toggle
per field. Remarks dropdown toggles Queries and SDV mode independently.
Query thread 4-state lifecycle demo (Raised → Responded → Resolved →
Closed). Role-based form header button swap on SDV mode.

### 31-dashboard.html
Six role dashboards (CRC / CRA / PI / DM / PM / Admin) in single file
with role demo bar. Each role renders appropriate widget set. align-items:
start on grid prevents column height imbalance. Enrollment track 6px.

### 32-dashboard-v2.html
Customizable dashboard + global role-scoped AI chat widget.
- Edit mode: blue banner, dashed card outlines, ✕ remove buttons
- Card library drawer (360px slide-in): 22 cards, permission-filtered per
  role, grouped by category, dimmed if already on dashboard
- Add card: auto-placed into shorter column
- Reset to default / Save layout per role
- AI chat: fixed bottom-right pill → 360px panel. Role-aware permission
  enforcement (cross-site, SDV, finance, user mgmt scopes). Response types:
  text / callout / mini table / denied / suggestions. Typing indicator.
  Thread resets on role change. Scope bar shows active role + data access.

## Key decisions recorded
- Study builder deferred to iteration 2 (design after coding data entry)
- Drag-to-reorder deferred to production (requires dnd-kit in React)
- Minor polish deferred to coding phase
- SESSION_HANDOFF.md updated with full coding roadmap and schema guidance

## Files changed
- 00-login.html (new)
- 26-data-entry.html (new)
- 27-site-record.html (new — replaces earlier draft)
- 28-barn-pen-record.html (new)
- 29-animals-list.html (new)
- 30-subject-record.html (new)
- 31-dashboard.html (new)
- 32-dashboard-v2.html (new)
- SESSION_HANDOFF.md (updated — session 15, coding phase roadmap)
