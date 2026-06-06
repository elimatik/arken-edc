# Arken EDC — Session Handoff
**Paste this entire file at the start of a new conversation.**
Last updated: 2026-06-06 | Active session: 14

---

## How to use this file
Paste the full content of this file as your first message in a new Claude conversation. It contains everything needed to continue exactly where we left off.

---

## Project overview
**Arken EDC** — veterinary/animal clinical trial EDC platform. Portfolio project by Elisa (senior UX/Product Designer, Italy, dual US/Italian citizenship), targeting senior product design roles at US healthtech companies.

**Repo:** https://github.com/elimatik/arken-edc  
**Local path:** `/Users/elisatron/Documents/ARKEN`  
**Stack:** Static HTML prototypes → Next.js + Supabase + Vercel (Phase 4)  
**Fonts:** Roboto + Roboto Mono (Google Fonts CDN)  
**Icons:** Tabler Icons CDN (`ti ti-*`)  

---

## 10 RULES — apply to every component

1. Never hardcode hex — use CSS token variables only
2. No field shadow — border only (1px)
3. Three severity levels — never merge amber/orange/red
4. `text-transform:uppercase` — never `font-variant:small-caps`
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders · 4px base radius
7. Fields and buttons: 32px height (36px for settings forms)
8. Links: text underlined, icon NOT underlined
9. Every component file is self-contained — declare all tokens in `:root`
10. Topbar = study pill + site dropdown. Breadcrumb = full navigation path.

---

## Completed components

| File | What it is | Status |
|---|---|---|
| 01–21 | Full design system, app shell, all core EDC components | ✓ Done |
| 22-coding.html | VeDRA/MedDRA coding — DM workflow | ✓ Done |
| 23-invoices.html | Fee schedule + site invoices + invoice preview | ✓ Done |
| 24-inventory.html | Shipments, inventory, dispensing log, reconciliation | ✓ Done |
| 25-settings.html | Settings hub — all 8 sections | ✓ Session 14 complete |

---

## 25-settings.html — FULLY COMPLETE STATE (session 14)

### Left sidebar nav sections (in order):
**STUDY:** Study settings, Study preferences  
**ACCESS:** Roles, Form permissions  
**PROTOCOL:** Randomization  
**SYSTEM:** Inventory, Audit & Signatures, Billing

### Nav section labels (as shown in sidebar):
- Study settings / Study preferences
- Roles / Form permissions  
- Randomization
- Inventory / Audit & Signatures / Billing

---

## Section: Randomization

### Randomization settings card
- Method select (`rand-method-select`) with `onRandMethodChange(value)`:
  - **blocked** (default): block size visible, strat optional
  - **simple**: hides block size, shows amber warning (not recommended < 100 subjects)
  - **stratified**: block size visible, strat label becomes "Required"
  - **minimization**: hides block size, hides upload/generate buttons, shows dynamic assignment info panel
- Block size select (`rand-block-select`) with `checkBlockRatioCompat()` — shows amber warning if block size is not a multiple of ratio total
- Blinding select
- Stratification factors — **full-width section** (not right-column):
  - Scope toggle: "Per site" / "Across study" buttons (`.strat-scope-btn`, `.strat-scope-btn.active`)
  - Factor cards rendered by `renderStratFactors()` — each shows name, source badge, detail line (site: "Built-in — uses the study's site list"; form field: "FormName → FieldName (level1 / level2)")
  - Edit pencil uses `data-key` attribute → `openEditStratModal(this.dataset.key)` (no quote collision)
  - Remove uses same data-key pattern
  - "Add factor" button → `openAddStratModal()`

### STRAT_FACTORS data shape:
```js
{ key: 'sf_xxx', name: 'Site', source: 'site'|'form', form: '', field: '', levels: [{label:'< 200 kg'}] }
```
Seeded with: Site (source:site, no levels) + Body weight range (source:form, levels: < 200 kg / ≥ 200 kg)

### Treatment groups card
- `renderGroups()` — ratio bar with pencil icon → `openRatioModal()`
- Each group row: color dot, name, mono code+blinded label, ratio, pencil → `openEditGroupModal(i)`, trash → `removeGroup(i)`
- GROUPS data: `{ id, name, code, ratio, blinded, color }`

### Randomization list card
- Lock button in card **header** (not in body)
- Upload/Generate buttons in body (`rand-list-actions` — hidden for minimization)
- Minimization note (`rand-minimization-note` — shown for minimization)

### Modals:
- `group-modal` — Add/Edit group (title + save btn text swap, `_editIdx` on modal element)
- `ratio-modal` — Ratio editor with live preview bar + estimated enrollment at 60 subjects + block/ratio compat check
- `strat-add-modal` — Add/Edit factor: name, source select, form/field selects (hidden for site), levels section (hidden for site), levels editor with add/remove/grip

### Key JS patterns (randomization):
- `STRAT_FACTORS` defined and `renderStratFactors()` boot call MUST be after all function definitions — verified in session 14
- `renderStratFactors()` is called from the very end of the JS block (after `saveRatios`)
- `onStratSourceChange('site')` hides form-row, field-row, AND levels-section
- `data-key` attribute on buttons instead of inline string quoting (no quote collision)
- CSS classes `.strat-scope-btn` / `.strat-scope-btn.active` / `.strat-factor-card` MUST be in the `<style>` block

---

## Section: Inventory

### Cards:
1. **Dispense trigger** — 2×2 grid: Dispensing form, Unit ID field (with hint), Volume field, Dispensing date field
2. **Return trigger** — 2×2 grid: Return form, Vial ID field, Return date field, Condition field (with hint)
3. **Inventory rules** — 4 toggle-left rules:
   - Require unit ID on dispense (simple toggle)
   - Alert on low stock → expands config panel: 2-column CSS grid with Threshold (number input + "units") and Notify roles (pill checkboxes rendered by `renderLowStockRoles()`)
   - Auto-deplete on zero return (simple toggle)
   - Allow partial unit returns → expands config panel: condition field display (linked badge + unlink button), condition mapping table, minimum returnable volume
4. **Inventory permissions** — `perm-matrix` table, thead + tbody both rendered by `renderInvPerms()`

### Condition mapping:
- Condition field shown as linked badge ("Unit condition on return") — NOT a dropdown
- `unlinkConditionField()` replaces badge with "Not linked" text and hides mapping table
- `renderConditionMapping()` renders rows for each option in `CONDITION_OPTIONS[fieldKey]`
- Each outcome button uses `data-field`, `data-opt`, `data-outcome` attributes → `setConditionMapping(this)` (no quote collision)
- Default mappings: Intact→restock_full, Partially used good→restock_partial, Compromised/Unknown→quarantine, Damaged/Expired→destroy

### Key JS patterns (inventory):
- `renderInvPerms()`, `renderLowStockRoles()`, `renderConditionMapping()` called from `showSection` when `id==='inventory'` — NOT at boot (DOM doesn't exist yet)
- `onInvPermChange(el)` reads `el.dataset.role` and `el.dataset.perm` (data attributes, no quote collision)
- INV_ROLES = `['CRC','CRA','PI','DM','PM','Admin']`
- INV_PERMS: 8 actions from view_stock through destroy
- INV_PERM_DEFAULTS: CRC=dispense+log_return, CRA=reconcile, PI=dispense+confirm_return, DM=reconcile+destroy, PM=log/confirm shipment+confirm_return+reconcile, Admin=all

---

## Section: Audit & Signatures

- **Audit trail card REMOVED** — always fully compliant, no user config needed
- **Electronic signatures card**: Signature method select, Require meaning statement (toggle-left), Co-signature (toggle-left)
- **Signature requirements per form card**: toggle-left per form rendered by `renderSigForms()`
  - Uses `\'` escaped quotes: `onchange="toggleSigRequired(\'' + f.id + '\',this.checked)"`
  - Called from `showSection` when `id==='audit'`

---

## Section: Billing

**Order:** Billing information → Payment terms → Fee schedule

1. **Billing information** — 2-column grid: Contact name*, Company*, ATTN, Email*, Phone, Address*, City*, State/Province/Region, Postal/ZIP*, Country* (select with common options)
2. **Payment terms** — Holdback %, Payment terms select, Currency select; Edit button in header
3. **Fee schedule** — `renderBillingFee()`:
   - Rate column is `<input class="fee-input-sm" type="number">` with `onblur="updateFeeRate(idx, this.value)"`
   - Pencil → `openFeeModal(idx)` (idx from `_idx` on each event object)
   - "Add event" button in card header → `openFeeModal(null)`

### Fee modal (`fee-modal`):
- Add/Edit mode: title + save button text swap, `_feeEditIdx` state variable
- Fields: Event name, Section (select + "New section…" option reveals custom input), Trigger (text + hint), Default rate (number, $ prefix, USD suffix, per-site note)
- Footer: Delete event button (left, hidden on add mode) + Cancel/Save (right)
- `updateFeeRate(idx, val)` — inline rate edit without opening modal

---

## Key JS safety patterns (critical — violations cause silent bugs)

- **NEVER serialize complex objects in `onclick` attributes** — use `data-*` attributes instead: `data-key`, `data-role`, `data-perm`, `data-field`, `data-opt`, `data-outcome`
- **NEVER use `'' + var + ''` inside single-quoted strings** — Node.js catches these as `SyntaxError: missing ) after argument list`
- **Always use `node --check` to validate JS** before declaring it done (run via Python subprocess in bash_tool)
- **Lazy-rendered sections**: renderInvPerms/renderLowStockRoles/renderConditionMapping called from `showSection`, not boot
- **Definition order matters for `let`**: boot calls to functions that reference `let` variables must come AFTER those variable declarations
- All previous rules still apply: named functions + element IDs, render() before DOM queries, no empty `style=""` overriding display:none

---

## CSS classes added in session 14 (must be in `<style>`):

```css
.strat-scope-btn { inline-flex, 28px height, bordered, secondary text }
.strat-scope-btn:hover { blue-200 border, blue-600 text, blue-50 bg }
.strat-scope-btn.active { blue-600 border + text + blue-50 bg, font-weight:500 }
.strat-factor-card { 1px border, radius-md, surface bg }
```

---

## showSection lazy render map (complete):
```js
if (id==='roles')        renderRoles();
if (id==='preferences')  { renderChangeReasons(); renderQueryTemplates(); renderSubjectCols(); }
if (id==='formperm')     renderFormPerms();  // or renderFormPermsByRole()
if (id==='randomization') renderGroups();
if (id==='inventory')    { renderInvPerms(); renderLowStockRoles(); renderConditionMapping(); }
if (id==='audit')        renderSigForms();
if (id==='billing')      renderBillingFee();
```

---

## Design system token reference (quick lookup)

```
Colors: --blue-600, --green-600, --amber-700, --red-600, --purple-600, --orange-600, --slate-600
Surfaces: --color-surface (#fff), --color-page-bg (#FBFBFB), --color-hover-bg, --color-border, --color-border-subtle
Text: --color-text-primary, --color-text-secondary, --color-text-tertiary, --color-text-placeholder
Sizes: --text-xs(11px), --text-sm(12px), --text-base(14px), --text-lg(16px), --text-xl(20px)
Space: --space-1(4px) --space-2(8px) --space-3(12px) --space-4(16px) --space-5(20px) --space-6(24px)
Nav bg: #1A1F2E (also --color-cta-bg)
```

---

## Remaining to build

- **Living style guide:** GitHub Pages component reference — last item on the list

---

## What to say in the new conversation

Paste this file and say:

> "This is the handoff doc for our Arken EDC prototype project. Read it fully, then confirm you understand the current state and ask me what I want to work on next."
