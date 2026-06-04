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
Three-state sort: desc → asc → none. Sort icons updated AFTER render() on fresh DOM nodes (stale node bug fix).

### Collapsible nav
74px collapsed → 160px expanded. Edge toggle at `top:56px; right:-13px`.

---

## Sessions 6–8 (2026-05-28 — 2026-05-30)

### Query flow (components 08, 13, 19)
Three states only: Raised → Responded → Resolved. No "Closed".
Responded = field returns to default (tint clears, flag stays amber). Resolved = green flag+check icon (`flag-query-resolved-icon`).

### Edit check vs Query
Edit checks = system-raised (orange flag). Queries = human-raised (amber flag). Same lifecycle, different trigger and colour.

### Delta (Δ) change reason system
Dotted red = change required · Solid blue = answered · Filled green = reviewed.
Submit gate blocked until all deltas reviewed.

### RFC (Reason for Change)
Two modes: Form-level (RFC panel on re-edit, confirm → pending save, actual save on Submit) · Field-level (auto-save on confirm, no submit button). First-time entry never triggers RFC.

### SDV icon
`ti-circle-check` outline = unverified. `ti-circle-check-filled` blue = verified. NOT the flag+check pattern (that is query-resolved only).

### Flag visibility rules
Queries off → inactive flags hide; active (flagged/resolved) stay. SDV off → unverified icons hide; verified stay.

---

## Sessions 9–10 (2026-05-31 — 2026-06-02)

### Calendar — Protocol SoE
Matrix layout (not Gantt). Procedure on Y, study day on X. Phase shading. D0 = pivot with bold border + ★.

### Visits page — flat urgency table
Single flat table sorted by urgency: overdue (red-50 tint) → due today (amber) → upcoming (white).

### SDV page architecture
SDV worklist (18) + form-level verification (19) are separate files. The form IS the SDV tool — CRA works on the real form with SDV icons overlaid.

### Batch entry
Form-level vs grid-level RFC. Optional fields excluded from required count. Pen-level defaults entered once, applied to all animals.

### Reports — AI builder
Two-column: chat (380px) + report output. Filters above report content. "Add to library" → Custom reports section.

---

## Sessions 11–12 (2026-06-02 — 2026-06-04)

### Coding — four-column hierarchy
LLT, PT, HLT, SOC as separate columns. Never concatenate into a path string. Each level is a first-class dimension for safety analysis. Species/Breed as own column — veterinary key differentiator.

### Coding — auto-code threshold
≥80% = auto-coded, <80% = needs review, 0% = pending. 9 keyword rules, multi-keyword hits increase confidence proportionally.

### Sort icon DOM timing fix
Always call `render()` first, then re-query fresh DOM nodes for icon updates. Stale node references from before render silently fail.

### Invoices — fee schedule structure
14 event types across 4 sections. Three trigger modes: Form completion (grouped dropdown with visit groups + individual forms) · Field value (form/field/operator/value builder with live preview) · Study milestone (dropdown). No free-text input — all triggers selected from structured options.

### Invoices — currency per site column
Currency header row above first section. One `<select>` per site column — changing it calls `setSiteCurrency(site, currency)` which updates `siteObj.symbol` and re-renders. All cells in that column (override and non-override) show the site's currency symbol. On modal open, each site's override row pre-selects the column currency.

### Invoices — override save order bug
Root cause: `saveEditModal` had two code paths; the `__new__` branch skipped currency sync. Fix: sync all `SITES[].symbol` from `ov-curr-{site}` DOM elements at the very top of `saveEditModal`, before any branching. This ensures `renderFee()` always reads the correct symbol regardless of path taken.

### Invoices — 20-site scalability
Per-site override columns don't scale beyond ~4 sites (table too wide). Correct pattern for 20+ sites: collapse to a single "Site overrides" summary column, with a scrollable panel in the edit modal (max-height:280px, overflow-y:auto) listing all sites as rows. Implemented for 3 sites for now; pattern documented for scale-up.

### Invoices — invoice detail panel status bar
Query-style status bar below panel header: badge chip (slate/amber/blue/green) + description text + issue date right-aligned. Paid invoices hide the primary action button entirely (not disabled).

### Inventory — shipments tab (first tab)
Empty state with centred "Receive first shipment" CTA. Modal flow: shipment date + receive date + CSV upload zone → Import CSV → opens review table inline. Confirm → row appears confirmed, expandable/view-only. "Receive shipment" sticky primary button at bottom of table (always visible, scrolls with overflow).

### Inventory — site filter in topbar
Site picker lives at topbar level (not per-tab). Same `tb-site` dropdown pattern as file 05. Rationale: site is a session-level context, not a local table filter. CRC at Austin scopes their whole workspace; CRA/PM sees all sites by default.

### Inventory — reconciliation by treatment group
Group-level aggregation (not per-vial). Columns: #Received · #Usable · #Removed · #Dispensed · #Returned · Variance (received − returned − removed, should be 0) · Auto status badge · Confirmation dropdown · Notes. All rows neutral white — status communicated through badge and text only.

### Inventory — dispensing log unit status
Four statuses without dates in the chip: Back in storage (green) · Returned to sponsor (purple) · At home (blue) · Removed (red). Return date in its own column. Chips are visual-only; dates live in dedicated columns.

### Inventory — return modal
Return date + volume remaining + condition dropdown (good/acceptable → back to inventory; compromised/damaged → removed) + sponsor return date (shown when empty or bad condition) + manual removal override checkbox (orange, force-removes regardless of volume).

### JS safety patterns learned
- Never use `JSON.stringify` in `onclick` HTML attributes (double-quote collision)
- Use index lookup arrays (`DISP_ROWS[i]`) instead of inline JSON
- Template literals inside double-quoted HTML attributes → always use named functions
- `const SHIPMENTS = [...]` must be declared before boot calls that reference it
- Duplicate element IDs break silently
- `document.getElementById('x').addEventListener(...)` without null guard crashes if element not yet parsed → always use `?.addEventListener`
- `document.addEventListener('input', ...)` loops add duplicate listeners → add `oninput`/`onchange` directly on elements instead
