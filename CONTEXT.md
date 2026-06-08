# Arken EDC — Project Context
**Paste this at the start of every Claude session.**
Last updated: 2026-06-07 | Sessions 1–15 complete — DESIGN PHASE DONE

---

## What this project is

Arken is a web-based EDC (Electronic Data Capture) platform for animal clinical trials. Portfolio project by Elisa (senior UX/Product Designer, Italy, dual US/Italian citizenship), targeting senior product design roles at US healthtech companies.

First purpose-built EDC for veterinary/animal studies — no direct competitor exists at this scope.

**Flagship study:** AK-2401 — BRD Cattle Phase II  
**Planned modules:** Arken Canine · Arken Aquatic · Arken Agri · Arken Primate

---

## Who uses it — 6 roles

| Role | Primary tasks | Data scope |
|---|---|---|
| **CRC** (Clinical Research Coordinator) | Data entry, query response, visit scheduling | Their site only |
| **CRA** (Clinical Research Associate / Monitor) | SDV, cross-site monitoring, query review | All sites |
| **PI** (Principal Investigator) | Clinical oversight, safety review, sign-off | All sites |
| **DM** (Data Manager) | Data quality, query resolution, lock/unlock | All sites |
| **PM** (Project Manager) | Study timeline, invoicing, enrollment tracking | All sites |
| **Admin** (System Administrator) | User management, study configuration, audit | Full access |

---

## Domain context

EDC = Electronic Data Capture. The core workflow:

1. Study configured in **builder** (forms, visit schedule, hierarchy, randomization)
2. Sites activated, staff assigned roles
3. Animals enrolled, assigned to treatment group
4. CRCs enter clinical data per form per visit
5. Edit checks fire automatically (out-of-range, missing data)
6. CRAs monitor remotely via SDV (Source Data Verification)
7. Queries raised and resolved between CRC and CRA/DM
8. Data locked form-by-form, then subject-by-subject
9. DM exports CDISC SEND dataset for regulatory submission

**Key regulatory frameworks:**
- **21 CFR Part 11** — electronic records and signatures (US FDA)
- **GCP** — Good Clinical Practice (ICH E6)
- **VICH** — Veterinary International Conference on Harmonisation
- **NADA** — New Animal Drug Application (US FDA)
- **CDISC SEND** — Standard for Exchange of Nonclinical Data

---

## Study hierarchy (dynamic, configurable per study)

Livestock (default): Study → Site → Barn → Pen → Animal
Companion: Study → Site → Animal
Aquatic: Study → Site → Tank room → Tank
Custom: admin-defined levels

"Subject level" is defined in study settings. The system renders hierarchy labels dynamically — never hardcoded.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router) |
| Styling | Tailwind CSS (tokens from design system) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password + SSO) |
| Row-level security | Supabase RLS policies per role |
| File storage | Supabase Storage |
| AI chat | Anthropic API (claude-sonnet), server-side, role-scoped |
| Deploy | Vercel |

**Current phase: static HTML prototypes → moving to Next.js**

---

## Repository

**GitHub:** https://github.com/elimatik/arken-edc
**Local:** /Users/elisatron/Documents/ARKEN
**Fonts:** Roboto + Roboto Mono (Google Fonts CDN)
**Icons:** Tabler Icons CDN (ti ti-*)

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
    ├── 00-login.html                 ← Login + study selector (session 15)
    ├── 01–21                         ← Design system + all core EDC components
    ├── 22-coding.html                ← VeDRA/MedDRA coding
    ├── 23-invoices.html              ← Fee schedule + site invoices
    ├── 24-inventory.html             ← Shipments, inventory, dispensing, reconciliation
    ├── 25-settings.html              ← Settings hub, 8 sections (complete session 14)
    ├── 26-data-entry.html            ← Data Entry drill-down (session 15)
    ├── 27-site-record.html           ← Site record (session 15)
    ├── 28-barn-pen-record.html       ← Barn / Pen record (session 15)
    ├── 29-animals-list.html          ← Animals flat list (session 15)
    ├── 30-subject-record.html        ← Subject record, full integration (session 15)
    ├── 31-dashboard.html             ← Role dashboards, 6 roles (session 15)
    └── 32-dashboard-v2.html          ← Customizable dashboard + AI chat (session 15)
```

---

## 10 RULES — every component, without exception

1. Never hardcode hex — use CSS token variables only
2. No field shadow — border only (1px)
3. Three severity levels — never merge amber/orange/red
4. text-transform:uppercase — never font-variant:small-caps
5. Roboto Mono on all data values, IDs, timestamps
6. 1px borders everywhere · 4px base radius
7. Fields and buttons: 32px height (36px for settings forms) · font-weight:var(--weight-medium) · font-family:var(--font-sans) on all buttons
8. Links: text underlined, icon NOT underlined
9. Every component file is self-contained — declare all tokens in :root
10. Topbar = study pill + site dropdown. Breadcrumb = full navigation path.

---

## Component summaries (sessions 1–15)

### 01–21 — Design system + core EDC
Full design system, app shell, nav, all core EDC components.

### 22 — Coding (DM workflow)
VeDRA v3.1 + MedDRA v26.1. Four-column hierarchy: LLT · PT · HLT · SOC. Species/Breed column. Auto-code ≥80% = coded, <80% = needs review. Coding panel slide-in with match scores.

### 23 — Invoices
Fee schedule tab (currency per site, three trigger modes) + site invoices tab (sortable table + status chip bar in detail panel). Override save-order bug fix: sync all SITES[].symbol from DOM at top of saveEditModal before any branching.

### 24 — Inventory
Shipments · Inventory (KPI cards, group filter) · Dispensing log · Vial detail · Reconciliation. Site filter in topbar (session-level context, not per-tab).

### 25 — Settings hub (complete — session 14)
8 sections via left sidebar nav: Study settings · Study preferences · Roles · Form permissions · Randomization · Inventory · Audit & Signatures · Billing.

Lazy render map — render functions called from showSection(id), NOT at boot:
```js
if (id==='roles')         renderRoles();
if (id==='preferences')   { renderChangeReasons(); renderQueryTemplates(); renderSubjectCols(); }
if (id==='formperm')      renderFormPerms();
if (id==='randomization') renderGroups();
if (id==='inventory')     { renderInvPerms(); renderLowStockRoles(); renderConditionMapping(); }
if (id==='audit')         renderSigForms();
if (id==='billing')       renderBillingFee();
```

### 26 — Data Entry drill-down (session 15)
Full-page progressive drill-down: Site list → Barn list → Pen list → Animal list. Topbar site scope selector. Study type demo bar. Three-state sort. Clicking a site in topbar skips site list, enters barn list directly.

### 27 — Site record (session 15)
Standard (non-builder) cards: Site info · Contacts · Protocol amendments (4-step expand) · Regulatory · Site visits (multi-visit log). No max-width. Blue header strip on new amendment/visit form.

### 28 — Barn / Pen record (session 15)
Same shell as subject record (form sidebar 220px + form content). Builder-defined forms only. Demo bar switches Barn A (temp log) vs Pen 1 (welfare observation).

### 29 — Animals list (session 15)
Flat cross-hierarchy list. Barn + pen filters cascade from site. Column chooser dropdown (13 cols, Animal ID required). Three-state sort. Row actions: clipboard-list + message-report. Bulk actions: Raise query / Lock / Unlock / Sign-off / Export. Query raise panel (420px slide-in).

### 30 — Subject record (session 15)
Integrated: Component 10 (header) + Component 13 (query thread) + Component 19 (SDV). Sticky form header. Delta button hidden until field edit, then dashed red. SDV verify per field. Query thread 4-state lifecycle. Remarks dropdown toggles Queries + SDV independently.

### 31 — Dashboard (session 15)
Six role dashboards (CRC / CRA / PI / DM / PM / Admin). align-items:start on grid. Enrollment track 6px.

### 32 — Dashboard v2 (session 15)
Customizable (card library drawer, permission-filtered per role, remove, Reset/Save). Global AI chat widget: role-scoped, fixed bottom-right, response types: text / callout / mini table / denied / suggestions. Thread resets on role change.

### 00 — Login + study selector (session 15)
Two-column login (dark brand panel + form, SSO). Study selector: card grid with search + status + species filters, enrollment bars, role chips. Demo credentials: elisa@arken.io / demo1234.

---

## Topbar site picker pattern (canonical)

```html
<button class="tb-site" onclick="toggleSiteDropdown()" id="tb-site-btn">
  All sites <i class="ti ti-chevron-down" id="tb-site-chevron" style="font-size:11px;opacity:0.7"></i>
</button>
<div id="site-dropdown" style="display:none;position:absolute;top:calc(100% + 6px);left:0;
  background:var(--color-surface);border:1px solid var(--color-border);
  border-radius:var(--radius-lg);z-index:200;overflow:hidden">
  <button class="site-dd-item active" onclick="setSiteFilter('')">All sites</button>
  <button class="site-dd-item" onclick="setSiteFilter('AUS')">Austin Research Center</button>
</div>
```
tb-site: plain white text + chevron, no border/background, dark topbar. Dropdown: white surface, active = blue-600 + blue-50. Close on outside click.

---

## JS safety patterns — critical, never violate

```
NEVER: style.borderColor='var(--blue-600)' inside HTML attrs → use named functions + element IDs
NEVER: JSON.stringify(obj) in onclick → quote collision → use index lookup ROWS[i]
NEVER: '' + var + '' inside single-quoted strings → SyntaxError → use data-* attributes
NEVER: getElementById('x').addEventListener without ?. → crashes if element not parsed yet
NEVER: document.addEventListener in loops → duplicate listeners → use oninput on element
NEVER: cache DOM nodes before render() → stale nodes → always render() first, then query
NEVER: const DATA = [...] after boot calls → undefined reference → declare before boot
NEVER: let VAR then boot call before declaration → let not hoisted → boot after declaration
ALWAYS: node --check script.js before declaring any JS block done
```

---

## Design token quick reference

```css
--color-nav-bg:#1A1F2E  --color-nav-hover:#2C3248
--color-cta-bg:#1A1F2E  --color-cta-hover:#2C3248
--color-surface:#FFFFFF  --color-page-bg:#FBFBFB
--color-hover-bg:#F0F0EE  --color-border:#E8E8E6  --color-border-subtle:#F0F0EE
--color-text-primary:#2C2D33  --color-text-secondary:#4F535B
--color-text-tertiary:#6D7480  --color-text-placeholder:#C4C4C2
--color-link:#3D4A5C  --color-focus-ring:#3D8FE0

--blue-600:#1760A8  --blue-200:#7AB8EE  --blue-50:#E8F4FF
--green-600:#1A6B47  --green-200:#58BC88  --green-50:#EEFAF4
--amber-700:#8A5C00  --amber-200:#F5B830  --amber-50:#FFF8E7
--red-600:#B52626  --red-200:#EC8585  --red-50:#FFF0F0
--purple-600:#534AB7  --purple-200:#A9A3EC  --purple-50:#F0EEFF
--orange-700:#A33A08  --orange-200:#F48E50  --orange-50:#FFF0E8
--slate-600:#3D5A78  --slate-200:#8AA0B8  --slate-50:#EEF1F6

--text-xs:11px  --text-sm:12px  --text-base:14px
--text-lg:16px  --text-xl:18px  --text-3xl:24px

--space-1:4px  --space-2:8px  --space-3:12px
--space-4:16px  --space-5:20px  --space-6:24px  --space-8:32px

--radius-sm:2px  --radius-md:4px  --radius-lg:6px  --radius-full:9999px
--weight-medium:500  --weight-bold:700
--tracking-caps:0.07em
```

---

## What is NOT built yet

- **Study builder** — deferred to iteration 2. Design after coding data entry.
- **Living style guide** — GitHub Pages component reference. NEXT item (session 16).
- **Minor detail polish** — fix during coding phase.
- **Drag-to-reorder** (dashboard) — requires @dnd-kit/sortable in React.
