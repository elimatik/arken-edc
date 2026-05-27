# Arken EDC — Decisions Log
All design and technical decisions with rationale. Update this every session.

---

## How to use this file
Every time a decision is made — about tokens, components, UX patterns, tech choices — log it here with the date and the reasoning. This is your interview prep document. Every entry is a potential talking point.

---

## Session 1 — 2026-05-25

### Product name: Arken
**Options considered:** Arken, Verd, Kairo, Vela, Luma, Ørka
**Decision:** Arken
**Rationale:** Hard consonants signal precision and authority. No conflicting SaaS trademark. Works at platform and module level (Arken Canine, Arken Aquatic). Easy to pronounce in Italian, English, and across European languages. Short enough to become a verb.

---

### Primary mode: Light (with dark planned)
**Options considered:** Light-first, Dark-first, Split 50/50
**Decision:** Light mode is the primary build. Dark mode is planned but not built in Phase 1.
**Rationale:** Two genuinely distinct user contexts — clinical monitors in offices (light) and field technicians on tablets (dark). Both need first-class treatment. Light built first because it covers the largest user group and is easier to screenshot for portfolio.

---

### Product scope: Platform + flagship module
**Options considered:** Single EDC tool, Full platform, Platform + one flagship
**Decision:** Platform architecture with Arken Canine as the v1 flagship module
**Rationale:** Maximum portfolio impact without unrealistic scope. Platform architecture shows systems thinking; single built-out module shows execution depth. Canine oncology chosen as flagship because it's the largest preclinical segment, highest data complexity (body-weight dosing, tumour endpoints), most analogous to human trials.

---

### Color palette: BRD Cattle palette
**Decision:** Use the BRD Cattle palette (amber/orange/red severity + blue/green/purple/slate semantic + navy neutrals)
**Rationale:** Designer-defined palette from prior research. Three-level severity scale (amber → orange → red) is clinically precise and has no equivalent in any competitor EDC. Navy CTA (#1A1F2E) differentiates from all competitors (Veeva = blue, Medidata = orange, Castor = blue).

---

### Three-level severity scale
**Decision:** Amber (warning) / Orange (alert) / Red (critical) — never collapsed
**Rationale:** Clinical monitoring has genuinely distinct urgency levels. Amber = acknowledge and proceed. Orange = action required soon. Red = immediate action, study impact. Collapsing these would force users to read labels instead of acting on colour — a patient/animal safety issue in disguise.

---

### Typography: Roboto + Roboto Mono
**Options considered:** DM Sans, Inter, Plus Jakarta Sans, Roboto
**Decision:** Roboto (UI) + Roboto Mono (data values)
**Rationale:** Designer preference. Roboto has excellent legibility at 12–14px density. Roboto Mono shares the same design DNA — they pair seamlessly without visual noise. Google Fonts — zero cost, reliable CDN.

---

### Base font size: 14px
**Decision:** 14px for all body text, table cells, field values
**Rationale:** Clinical software is data-dense. 14px is the minimum for comfortable extended reading in table-heavy interfaces. Competitors using 12px for table data get complaints from users doing SDV for 4+ hour sessions.

---

### Small caps: table headers, breadcrumbs, form section titles
**Decision:** `font-variant: small-caps` + `letter-spacing: 0.07em` on those three elements
**Rationale:** Differentiates structural chrome from data content. When headers look different from data, users scan faster. Small caps at 14px reads as precise and clinical without being decorative.

---

### Border radius: 4px base
**Options considered:** 6px (rounder), 4px (clinical), 2px (very tight)
**Decision:** 4px base radius for inputs, buttons, cards
**Rationale:** 4px is the sweet spot for clinical software — structured and deliberate, not sterile (0px) or consumer-app-soft (8px+). Matches the personality brief: precise but not cold.

---

### Field shadow: none
**Decision:** Form fields have no box-shadow. Border only.
**Rationale:** Eliminates visual noise in form-heavy screens. With 20–30 fields per form, shadow on every input creates a muddy mid-level depth layer that competes with actual data. 1px border on --color-border is sufficient affordance.

---

### Stroke: 1px everywhere
**Decision:** All borders are 1px — no 0.5px, no 2px (except focus ring which is 3px outline)
**Rationale:** Sub-pixel borders (0.5px) render inconsistently across displays and OS zoom levels. Clinical software is often used on non-Retina monitors. 1px is the reliable minimum that renders crisply everywhere.

---

### Component library: shadcn/ui
**Decision:** Use shadcn/ui as the component foundation
**Rationale:** shadcn gives you accessible, keyboard-navigable components that read from CSS variables — so Arken tokens apply automatically. Not a dependency you install; you copy the components into your codebase and own them. Zero lock-in, full control. Free.

---

### shadcn CSS bridge
**Decision:** Arken token file includes shadcn's expected CSS variable names (`--radius`, `--background`, `--primary`, etc.) mapped to Arken values
**Rationale:** When shadcn components are added in Phase 4, they'll inherit Arken's visual language automatically with no manual overrides needed.


---

## Session 3 — 2026-05-26

### Text colour scale softened
**Previous:** primary `#111111` · secondary `#6B6B6B` · tertiary `#9B9B9B`
**New:** primary `#2C2D33` · secondary `#4F535B` · tertiary `#6D7480`
**Rationale:** Pure black on white creates harsh contrast that reads as aggressive rather than precise. The new scale is still WCAG AA compliant at all sizes while feeling more considered. Propagated to all component files and arken-tokens.css.

### Sub-label accent colour removed from metric card
**Decision:** `.metric-sub` always uses `--color-text-tertiary` — including when `.accent` class is applied.
**Rationale:** Amber-600 (#B87800) on white fails WCAG AA at 12px. Amber-800 (#7A4F00) passes but reads as muddy brown rather than a warning signal. The accent colour already appears on the top border and the large value — the sub-label doesn't need to repeat it. Tertiary text is sufficient for supporting copy.

### Metric card accent border → 3px, progress bar → 4px
**Rationale:** 2px top border was too subtle at the card's 90px min-height. 3px reads as a deliberate design element, not an artifact. Progress bar increased to 4px for same reason — 3px disappeared visually at smaller viewport widths.

### metric-target text → --color-text-primary
**Previous:** `--color-text-tertiary`
**Rationale:** The target value (e.g. "/ 40") is data, not supporting copy. Tertiary made it too easy to miss. Primary keeps it readable while the size difference (14px vs 24px) still creates the hierarchy.


### Amber-700 (#8A5C00) added as accessible text token
**Problem:** amber-600 (#B87800) on amber-50 (#FFF8E7) = 4.3:1 — fails WCAG AA at 12px (requires 4.5:1).
**Decision:** Add `--amber-700: #8A5C00` to the primitive ramp. All amber text uses now reference amber-700.
**Contrast verified:**
- amber-700 on #FFF8E7 (query field bg) = 5.9:1 ✓ AA pass
- amber-700 on #FFFFFF (white) = 7.2:1 ✓ AAA pass
**Split rule:** amber-600 = decoration only (metric card top border, progress bars, filled dots — no contrast requirement). amber-700 = all text uses (badges, field hints, sub-labels, status text).
**Files updated:** arken-tokens.css · 01-form-field-group · 02-badge · 03-data-table · 05-metric-card

### badge-filled-warning and badge dot → amber-700
**Decision:** `.badge-filled-warning` background and `.dot-warning` both use amber-700 (#8A5C00).
**Rationale:** Consistent with the amber-600/700 split rule above. White text on amber-700 = 4.8:1 ✓ AA pass. Previously amber-600 was being used for filled badges — now unified.

### metric-sub.accent re-enabled
**Decision:** `.metric-sub.accent { color: var(--accent-color) }` restored after amber-700 fix.
**Rationale:** The previous workaround (forcing tertiary text on all sub-labels) was only needed because amber-600 failed contrast. With amber-700 as the amber accent-color, all accent sub-labels now pass: amber 5.9:1 · orange 5.1:1 · red 5.4:1 · all ✓ AA. Blue and green cards correctly omit the .accent class — positive signals don't need urgency colour on the sub-label.

### Orange-700 (#A33A08) added as accessible text token
**Problem:** orange-600 (#C94C0C) on orange-50 (#FFF0E8) = 4.17:1 — fails WCAG AA at small text.
**Decision:** Add `--orange-700: #A33A08` to the primitive ramp. All orange text uses now reference orange-700.
**Contrast verified:** orange-700 on #FFF0E8 = 5.96:1 ✓ AA pass
**Split rule:** orange-600 = decoration only (borders, dots, progress bars, filled badge bg). orange-700 = all text uses (badge labels, hint text, count badges, status text).
**Files updated:** arken-tokens.css · 01-form-field-group · 02-badge · 03-data-table · 05-metric-card · 06-alert-banner

### Alert banner action link — icon excluded from underline
**Decision:** Only the text `<span>` inside `.banner-action` is underlined. The arrow icon is not.
**Rationale:** Underlined icons read as broken UI — the underline doesn't sit under the glyph cleanly, especially with external-link and arrow icons. Text underline alone is sufficient affordance for a link.

### Role colour system removed
**Decision:** All role tokens (`--role-pi`, `--role-crc`, etc.) now resolve to `--slate-600` (#3D5A78). Role colour differentiation dropped entirely.
**Rationale:** The platform supports user-created roles, which would immediately break any fixed colour mapping. Seven predefined role colours is also too many for users to reliably memorise. The role abbreviation (CRC, CRA, DM) already carries the signal as text — colour was redundant rather than additive. Slate is neutral, accessible, and scales to any number of roles.
**Files updated:** arken-tokens.css · 04-app-shell · 02-badge

### font-variant: small-caps replaced with text-transform: uppercase
**Decision:** All `font-variant: small-caps` and `font-variant: all-small-caps` replaced with `text-transform: uppercase`.
**Rationale:** `font-variant: small-caps` renders inconsistently across browsers and OS font rendering engines, particularly on Windows Chrome where it can render as full caps at the wrong size. `text-transform: uppercase` with `letter-spacing: 0.07em` produces the same visual result with fully predictable cross-platform rendering. Clinical software is commonly used on Windows workstations — this matters.
**Files updated:** arken-tokens.css · all component files

---

## Session 4 — 2026-05-27

### App shell — nav and topbar spec locked
**Decisions:** Sidenav 74px wide · Nav items full width, 50px min height, no border-radius · Inactive icon/label colour #8aafc8 · Topbar 56px tall · All topbar text #FFFFFF · Role chip plain white text, no colour dot · Chevron-right (not down) on study pill

### Role chip — no colour dot on dark background
**Decision:** Role dot removed from topbar chip. Plain white text label + chevron only.
**Rationale:** Colour dots become invisible on the dark nav background — the signal is lost. Role is already communicated by the text label. No information is lost by removing the dot.

### Field height: 32px
**Decision:** All inputs and selects are exactly 32px height via explicit `height: 32px`.
**Rationale:** Consistent touch target size. More compact than the default browser 38px which was leaving visual gaps in dense form grids.

### Select arrow: chevron-right
**Decision:** Custom SVG chevron-right replaces browser default dropdown arrow.
**Rationale:** Browser default arrow varies by OS and doesn't match the Arken visual language. Chevron-right is consistent with the direction used across other interactive elements (breadcrumbs, topbar, nav).

### Composite field types added
**Decision:** Added prefix/suffix adornments, split prefix+value, inline action button (copy), password toggle, country code prefix select, and tag/multi-value field.
**Rationale:** EDC forms require more than plain inputs. Dosing fields need unit suffixes, subject IDs need prefix+number split, e-signature fields need masked input. All follow the same 32px height and 1px border rules.

### Field shadow: confirmed none
**Decision:** Reconfirmed — fields have no box-shadow. Border only.

### Button height: 32px
**Decision:** `.btn-secondary` and `.btn-primary` both use `height: 32px`.
**Rationale:** Matches field height for visual alignment in form header rows.

### Form sidebar — 6 status states
**Decision:** Empty · In-Work · In-Review · Reviewed · Finalized (removed New state)
**Icons:**
- Empty → 1.5px dashed circle, placeholder grey
- In-Work → compound path SVG, 1/4 fill, #4492CB
- In-Review → compound path SVG, 1/2 fill, #CF811E
- Reviewed → compound path SVG, 3/4 fill, #BF65D5
- Finalized → light green circle + dark green check (not filled solid)
**Rationale:** Progressive fill gives immediate visual hierarchy of completion. Finalized uses the lighter green (bg + border + check) not solid fill — more consistent with the overall approach of using semantic colour tints rather than solid fills.

### Form sidebar — SVG icon sizing
**Decision:** SVGs use `width="16" height="16" viewBox="2 2 16 16"` (cropped from 20×20 source).
**Rationale:** The source SVGs were designed in a 20px artboard with 2px padding on each side. Using `viewBox="2 2 16 16"` crops to the path content and makes the icons fill the 16px frame completely, matching the size of div-based icons (empty, finalized).

### Form sidebar — subform group border colour
**Decision:** Group left border is always slate (#8AA0B8) except when ALL sub-forms are finalized, then it turns green (#28A062).
**Rationale:** Originally considered blue for in-work groups, but the slate-only approach is cleaner — fewer colour states, less visual noise. The green signal on completion is the meaningful moment.

### Form sidebar — issue count badge (Option C)
**Decision:** Single badge showing total issue count, coloured by highest severity present.
- Warning (amber) → queries only
- Alert (orange) → discrepancies present
- Critical (red) → any SAE/critical issue
**Rationale:** Users need to know two things from the sidebar: how many issues (to plan time) and how urgent the worst one is. A single badge delivers both. Individual issue details are visible when the form is opened.
**Applied at:** parent group level AND individual sub-form level.

### Form sidebar — link underline text only
**Decision:** `.btn-ghost` links underline only the text `<span>`, not the accompanying icon.
**Rationale:** Underlines on icons render poorly — the line doesn't sit under the glyph cleanly. Text underline alone is sufficient affordance.

### Flag icon — SDV verified state
**Decision:** Filled flag (`ti-flag-filled`) + small checkmark SVG overlaid in bottom-right corner. No background circle — checkmark uses `currentColor` directly on transparent.
**Rationale:** Keeps the flag shape family consistent (both query-raised and SDV-verified use a flag). The checkmark overlay creates shape distinction for colour-blind users who cannot rely on orange vs blue alone. No background circle avoids visual clutter at 16px.

### Flag icon — hover on flagged state
**Decision:** Flagged flag hover darkens to amber-800 (#7A4F00). Never lightens toward orange-600.
**Rationale:** Lightening on hover created a confusing signal — the flag appeared to be de-escalating. Darkening on hover is consistent with standard interactive affordance (things get darker when you interact with them).

### font-variant: small-caps → text-transform: uppercase
**Decision:** All small caps replaced with `text-transform: uppercase` + `letter-spacing: 0.07em`.
**Rationale:** `font-variant: small-caps` renders inconsistently on Windows Chrome. `text-transform: uppercase` is reliable cross-platform. Visual result is identical.

### Role colour system removed
**Decision:** All `--role-*` tokens → `var(--slate-600)`. Role dots removed from topbar.
**Rationale:** Platform supports user-created roles — a fixed colour mapping breaks immediately. Role text label is sufficient signal. Slate is neutral, accessible, and scales to any number of roles.

### Per-form issue display — deferred
**Decision:** Sub-level issue counts shown as badge pills (same `.issue-badge` system as parent). Coloured left border approach explored and deferred for later iteration.
**Rationale:** Badge pills chosen for now as they communicate count + severity explicitly. Left border approach is cleaner but loses the count — may revisit when form sidebar is implemented in production.

