# Arken EDC — Decisions Log
All design and technical decisions with rationale. Every entry is a potential portfolio talking point.

---

## Sessions 1–5 (2026-05-25 — 2026-05-27)

### Product name: Arken
Hard consonants signal precision. No trademark conflict. Works at platform + module level. Easy to pronounce across languages.

### Light-first mode
Light covers the largest user group (clinical monitors in offices). Dark planned for field technicians on tablets.

### Three-level severity scale
Amber (warning) → Orange (discrepancy) → Red (critical). No competitor EDC uses three levels — all collapse to two. Clinical rationale: amber = out-of-range but plausible, orange = edit check failure, red = safety-critical.

### Color palette
Navy CTA (#1A1F2E) differentiates from all competitors. Semantic colours: blue = SDV/data, green = complete/clean, amber = warning/pending, red = critical/overdue, purple = pen-level/group, slate = secondary/locked.

### Table system (canonical — from component 14)
```css
.list-table thead th { position:sticky; top:0; z-index:5; background:var(--color-surface);
  font-size:var(--text-xs); text-transform:uppercase; letter-spacing:var(--tracking-caps);
  border-bottom:1px solid var(--color-border); cursor:pointer; }
th:first-child, td:first-child { padding-left: var(--space-5); }
th:last-child, td:last-child { padding-right: var(--space-5); }
```
Three-state sort: desc → asc → none. `ti-arrows-sort` hidden default → placeholder on hover → blue-600 active.

### Collapsible nav
74px collapsed → 160px expanded. Edge toggle at `top:56px; right:-13px`. Badge in expanded state uses `position:relative` not absolute.

---

## Sessions 6–8 (2026-05-28 — 2026-05-30)

### Query flow (components 08, 13, 19)
**Three states only — no "Closed":** Raised → Responded → Resolved.
**Responded = field returns to default:** The field-input tint (amber for query, orange for edit check) clears when the CRC responds. The flag stays. This is a key UX decision — the field is no longer "in error", it's "in conversation".
**Resolved = green flag+check:** `flag-query-resolved-icon` — a filled flag with a small SVG checkmark badge overlaid at bottom-right. Distinct from SDV icon (`ti-circle-check`). Badge size: 8×8px.

### Edit check vs Query distinction
Edit checks = system-raised (orange flag). Queries = human-raised (amber flag). Same lifecycle, different trigger and colour. Resolved state is identical for both.

### Delta (Δ) change reason system
Three icon states matching traffic-light pattern:
- Dotted border red = change required (system-auto, blocks submit)
- Solid border blue = answered (CRC submitted reason)
- Filled green = reviewed (CRA approved)
Panel mirrors query thread structure: field context + thread + compose.
Submit gate: blocked until all deltas are reviewed. Button tooltip shows count.

### Reason for change (RFC)
Two save modes (study-level config):
- **Form-level:** RFC inline panel appears when re-editing saved field. Confirm → "Pending save". Actual save on Submit.
- **Field-level:** No submit button. RFC panel → Confirm → field auto-saves with "Saving…" → "Saved ✓".
First-time entry never triggers RFC — only edits to previously saved values.
**Batch entry RFC:** Single amber bar at bottom of grid for the whole batch. "Override per row" placeholder for app phase.

### SDV icon
`ti-circle-check` (outline) = unverified. `ti-circle-check-filled` (solid blue) = verified.
NOT the flag+check pattern — that is query-resolved only.
SDV and query icons coexist on the same field row.

### Remarks dropdown (components 13, 19)
Checkbox behaviour — each mode independently toggleable. Both active = "Remarks: Queries, SDV mode". Label updates to reflect exactly what's active.

---

## Sessions 9–10 (2026-05-31 — 2026-06-02)

### Calendar — Protocol Schedule of Events
Matrix layout (not Gantt). Procedures on Y axis, study days on X axis.
Phase shading: grey (screening) / blue (treatment) / green (follow-up).
Markers: X (procedure) · D (dosing) · B (blood) · A (assessment) · ⊘ (fasting) · ! (due today) · ⚠ (overdue).
D0 = pivot point with bold border + ★. Today column = red tint + "← today".
**No completion markers** — SoE shows protocol intent only, not subject-level status.

### Visits page — flat urgency table
Single flat table sorted by urgency: overdue first (red-50 tint) → due today (amber tint) → upcoming (white).
Row tints carry the urgency signal — no section headers needed.
Accessibility: tertiary text (#6D7480) replaced with secondary (#4F535B) on red-50 backgrounds (fails 4.5:1 WCAG AA at 4.25:1 on red-50).

### SDV page architecture
SDV worklist (18) + form-level verification (19) are separate files.
The actual form IS the SDV tool — no separate field list. CRA lands on the real form with SDV icons overlaid. This is better UX than a parallel field list because context is preserved.

### Batch entry design decisions
1. **Form-level vs grid-level RFC:** One reason covers the whole batch. Per-row override is placeholder for app phase — too complex for prototype.
2. **Optional fields:** `optional:true` flag excludes from required count. 5/5 required filled = Ready even if Notes is empty. Status badge shows X/N where N = required count only.
3. **Pen-level defaults:** Entered once in a section above the grid, applied to all animals. "Applied to all animals" note appears on fill. No re-render on keystroke — DOM update only.
4. **Apply-to-all toggle:** Per column, propagates value instantly. Blue fill on applied cells.

### Reports — AI builder
Two-column layout: chat (380px left) + report output (right).
3-turn simulated conversation → report renders in right panel.
Title + AI Generated badge + filters appear above the report content (not in the chat panel).
Filters use the same `.report-filters` pattern as standard reports.
"Add to library" saves to a Custom reports section at the top of the library.

### Flag visibility rules
- When queries mode OFF: inactive flags (no active query) hide. Active flags (flagged/resolved) stay visible.
- When SDV mode OFF: unverified SDV icons hide. Verified icons stay visible.
- Resolved/closed queries show inactive flags on all other fields (queries still "active" in the mode toggle).

### Flag icon for resolved queries
`flag-query-resolved-icon` — relative wrapper, `ti-flag-filled` + absolutely positioned SVG checkmark badge (8×8px, `stroke-width:1.8`, `stroke-linecap:round`). Green (#1A6B47). Distinct from blue SDV circle-check.
CSS class: `.flag-btn.query-resolved { color: var(--green-600); }`

---

## Session 11 (2026-06-02)

### Coding — four-column hierarchy (not a flattened path string)
**Decision:** Store LLT, PT, HLT, and SOC as separate fields. Never concatenate into a path string.
**Rationale:** Flattening loses the analytical value entirely. Multi-level safety analysis requires independent grouping — you need to count all "Gastrointestinal disorders" (SOC) separately from all "Decreased appetite" (PT) events. A single path cell makes this impossible without string parsing. Each level is a first-class dimension in the data model.

### Coding — Species/Breed as a column
**Decision:** Species / Breed displayed as its own column in the coding table.
**Rationale:** Veterinary EDC key differentiator. Multi-species studies (bovine + equine + canine in the same platform) require breed-level filtering for safety analysis. No competitor EDC surfaces this in the coding worklist.

### Coding — auto-code confidence threshold
**Decision:** ≥80% = auto-coded (green), <80% = needs review (orange), 0% = pending.
**Rationale:** 80% balances efficiency and safety. Below 80% there's enough ambiguity that a DM should check — wrong coding at this level can affect primary safety endpoints and regulatory submissions. The review tab makes this workflow explicit rather than hiding uncertain codings in the main list.

### Sort icon DOM timing fix
**Problem:** Sort icons were targeting stale DOM nodes captured before `render()` rebuilt the table, causing icons to never update visually.
**Fix:** Always call `render()` first, then re-query fresh DOM nodes for icon updates. This pattern should be used in all components where sort state and re-render are combined.

### Reports — AI builder architecture
**Decision:** Two-column layout (380px chat + flexible report area). Title + filters live above the report content in the right panel, not in the chat thread.
**Rationale:** The chat is for conversation — putting report metadata there creates cognitive overload. The right panel mirrors the standard report output view so the DM has a consistent mental model regardless of whether the report came from the library or the AI builder.
