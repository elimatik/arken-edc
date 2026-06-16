# Arken EDC — Design Case Studies

> Deep dives into the hardest design problems in Arken EDC, a purpose-built
> electronic data capture platform for veterinary clinical trials.
>
> **By Elisa Tron** — Senior UX / Product Designer

---

## Case Study 1 — Inline Query Architecture

### The problem

In clinical EDC, a **query** is a formal question raised against a single data point — *"this rectal temperature reads 28.5 °C, which is outside the expected range; please verify against the source."* Queries are the backbone of data quality and the most-touched workflow in the entire system: a CRC answers them, a CRA raises and resolves them, a DM manages them across the study. How queries surface and how they resolve decides whether a trial's data is clean or perpetually behind.

Legacy human-EDC systems handle queries one of two ways, and both fail:

1. **A separate "queries" inbox** — a list of open questions, divorced from the data. You see the question but not the field it's about, so resolving each one means navigating back to the form, finding the value, and rebuilding the context in your head.
2. **A modal popped over the field** — close to the data but blocking. You can't see the rest of the form while you answer, can't compare against the neighbouring values that make the query answerable, and when the modal closes it takes your place in the form with it.

Mapping these designs against real use, four distinct failure modes fall out:

- **Query fatigue** — when every query is a heavyweight interruption (a modal, a navigation), users batch them, ignore them, or rubber-stamp them. Data quality collapses under volume.
- **Save-and-forget** — when the query lives somewhere other than the field, a user corrects the value, saves, and never returns to close the query. The data is right; the trial looks permanently dirty.
- **Context switching** — answering a query out of context loses the surrounding data (the other vitals, the visit, the animal) that the answer depends on.
- **Missing source documentation** — under 21 CFR Part 11, a query is only truly resolved when the correction is tied to a **reason** and a **source document**. Designs that treat a query as a simple chat thread lose the link between the response, the corrected value, and its evidence.

### The insight

A query is neither a list item nor a modal. It is a **state of a field** that demands three different *depths* of attention at three different moments:

- a **glance** — *"does this field have an open query?"* — while scanning a form,
- a **conversation** — *"what was asked, what did I answer, what's the correction history?"* — while resolving one,
- an **overview** — *"how many open queries across the study, by site, by age?"* — while managing the trial.

No single surface serves all three without compromising the others. So the design is three layers over one source of truth.

### The solution — a three-layer hybrid

**Layer 1 — the inline flag.** Every field carries a flag in its row, and the flag's state *is* the query's state: a hollow flag (no query), a filled amber flag (open query), a resolved flag. The input itself tints amber when queried, and the question appears as an inline link beneath it (*"Q-001: value outside range — verify"*). The query becomes part of the field rather than a separate object: you see it at a glance without leaving the form, and the corrected value sits right beside the flag. This is what makes "fix and forget" structurally hard — the flag stays lit until the query is **resolved**, not until the value is edited.

**Layer 2 — the slide-in panel.** Clicking the flag slides a 480px query thread in *beside* the form — the form stays visible. The panel holds the full conversation: the original question, each response with its author's role, and the **correction block** that ties *old value → new value → change reason → source document*. This is where context-switching dies: you answer while still looking at the field and its neighbours, and the panel makes the source-documentation link a required, first-class part of resolution rather than an afterthought.

**Layer 3 — the master query dashboard.** Open queries by site, by status, by age — the trial-management view a CRA or DM lives in. It is the same data, rolled up: the open-query count on a dashboard card is the same flag, aggregated. You triage here, then click through back into the inline context of layers 1 and 2.

The three layers are one system because they are one data model. A query has a state; the flag renders it inline, the panel renders its thread, the dashboard renders its rollup. Resolve it in any layer and all three update.

### Why it avoids the four failure modes

- **Query fatigue** → the inline flag is a glance, not an interruption. You only pay the cost of the panel when you choose to resolve.
- **Save-and-forget** → the flag is bound to the field and stays lit until *resolved*, not until *edited*. Right data isn't enough; the query has to be closed.
- **Context switching** → the panel slides in beside the form; you never leave the field you're answering about.
- **Missing source documentation** → the correction block makes old → new → reason → source mandatory and first-class.

### The lifecycle

The query state machine is deliberately short — **Raised → Responded → Resolved** — with role-scoped actions (CRC responds; CRA raises and resolves; DM raises, resolves, and manages). I cut the "Closed" state legacy systems carry: in practice a second terminal state only confuses users about whether a query is *done*. **Resolved is terminal.** Fewer states, less ambiguity, faster clean data.

### Edit checks vs queries — keeping the query log clean

Not every anomaly deserves a query. When a value lands outside the species range, the system raises an **edit check**, not a query — a distinct, lighter object shown as an **orange `alert-circle`** beside the field (`EC-` prefix), separate from manual queries (which always use **flag** icons, `Q-` prefix). The edit check then forks on the person who knows best — the one entering the data:

- **It's a typo →** they correct the value. The alert clears, the correction is captured under a **change reason** (the Δ flow fires automatically), and *no query is ever created*.
- **It's a real finding →** they open the edit check, explain it, and on submit it **converts to a formal query** — the orange alert becomes an amber raised flag, and it follows the normal Raised → Responded → Resolved lifecycle.

The reason this split matters is the **query log is a quality metric** — monitors and sponsors read its size as a signal of data trouble. If every out-of-range keystroke auto-filed a query, the log would fill with typos and drown the queries that actually need a clinician's judgement. By catching the anomaly at entry but letting a human decide *typo or finding*, every clinical anomaly is still either **corrected (with an audit reason)** or **formally documented (as a query)** — and nothing false ever pollutes the log. The machine flags; the human classifies.

The split even changes what *blocks* a form. Submitting a form for review is gated on the things that mean the data isn't ready — an **unresolved edit check**, a **pending change reason**, an **empty required field** — but *not* on open queries. A query is a conversation already in motion between roles; it shouldn't freeze the form. An unaddressed edit check, by contrast, is an anomaly nobody has looked at yet. So the gate enforces exactly the right thing: every anomaly is acknowledged before review, while work-in-progress dialogue is allowed to continue.

The same principle guards **source-data verification**: a monitor can't tick the SDV shield on a field that still carries an open edit check, a pending change reason, or an open query. Verifying means *"this matches the source and is settled"* — so the field must actually be settled first. The shield greys out with a reason until it is. It's a small interlock, but it's the difference between SDV that means something and a checkbox that doesn't.

---

## Case Study 2 — Dual-Mode Enrollment Architecture

### The problem

The veterinary clinical trial industry runs on software built for *human* trials. Medidata Rave, Veeva, OpenClinica — all share one load-bearing assumption: **one subject, one record, one data-entry session.** A human trial enrols Patient 001, and Patient 001 is a person who gets their own case report form, filled one sitting at a time.

For animals, that assumption breaks.

A broiler feed trial doesn't enrol one chicken. It enrols a **pen of thirty** — housed together, fed together, weighed together. A field tech walking the house doesn't sit with one bird and complete a form; they walk the pen and record one pen weight, one feed weigh-back, one mortality count. Forcing that through a human-EDC system means opening thirty separate subject records to capture what is, operationally, a single pass through a single pen. (And the inverse is just as real: a bovine respiratory trial *does* track each animal individually — its own temperature, its own treatment, its own re-treatment decision — so the model has to support **both** shapes in one portfolio.)

This is the **1:1 subject-ratio bottleneck**: human EDC hard-codes a one-to-one relationship between "subject" and "data-entry act," while veterinary research is full of many-to-one (a pen, a tank, a flock) *and* one-to-one (a companion dog, a high-value horse) — sometimes in the same sponsor's portfolio at the same time.

The industry's workaround is spreadsheets: data captured in Excel in the barn, transcribed into the EDC later. Every transcription is an error vector and a 21 CFR Part 11 hole. The bottleneck isn't a missing feature — it's the data model itself.

### The insight

"Veterinary EDC" isn't one mode of data entry. It's **three**, and which one applies is a property of the **study**, not a per-form toggle a user has to remember:

- **Companion** (dogs, cats) — individual, owner-linked. A canine osteoarthritis trial looks like a human trial: one animal, one owner (who reports outcomes — ePRO), one rich subject record. Here the human-EDC model genuinely fits.
- **Livestock, group-housed** (cattle, swine, poultry) — the pen *is* the unit of work. Enrolment and entry happen at the group level: a matrix of animals × measurements, filled in one pass.
- **Livestock, individual** (equine, high-value cattle) — housed in the same site → barn → pen hierarchy as group studies, but each animal carries its own detailed record (a lameness exam on stabled horses needs per-animal depth).

The mistake every existing tool makes is to pick one of these and bolt the others on. The right move is to let the **study type drive the entire data-entry engine.**

### The solution — a study-type-driven engine

Arken's schema carries a single `study_type`: `companion`, `livestock_group`, or `livestock_individual`. That one field reshapes the whole experience.

**The hierarchy adapts.** Companion studies drill **Site → Subject** (with an owner). An individual-animal livestock study drills **Site → Barn → Pen → Animal**. A *group*-housed study (the broiler trial) drills **Site → Barn → Pen** and stops there — because the **pen is the experimental unit**, the pen *is* the subject, so clicking a pen opens its record directly instead of a nested table of one. One drill-down component reads the study type and renders the right number of levels — the same browser, three shapes.

**The entry mode adapts.**
- **Companion →** an *individual subject record* — full form sidebar, rich per-animal forms, owner-reported outcomes.
- **`livestock_group` →** a *group entry matrix* — the pen is the screen; measurements are entered across every animal in the pen in one pass, the way the work actually happens in the barn.
- **`livestock_individual` →** *individual animal records* inside the livestock hierarchy — the depth of a subject record, reached through the barn/pen drill-down.

**The vocabulary adapts.** Housing is named differently across species — a cattle study has *barns* and *pens*; a stabled-equine study has *stables* and *stalls*. Rather than hard-code labels, a small **terminology map keyed on species** drives every label, breadcrumb, and button in the hierarchy. The same `Site → Barn → Pen → Animal` engine renders `Site → Stable → Stall → Animal` for the equine study with no branching in the screens — one more thing the study type, not the user, decides.

**Same components, recomposed.** The subject record, the drill-down, and the form sidebar are one component library; the study type composes them differently. That is the payoff of designing the data model before the screens: three operational realities, one coherent system, zero bolt-ons. The same discipline scopes the *forms*: a `forms.scope` field (subject / barn / site) routes each form to its own record — clinical forms to the pen/Subject Record, the Daily Environmental Log to the House Record, the Site Initiation Visit and delegation log to the Site Record — so every level of the hierarchy has the forms it owns and none that it doesn't, and a drill-down row links straight to its location's record. That same hierarchy is what makes the drill-down's progress legible: each level — site, house, pen, subject — carries a Forms count (completed over total instances) and an open-Queries count, each row's numbers simply the sum of its children's, all of it read straight off the `form_instances` and `queries` arrays. A site that reads "19 / 22 · 1 query" is telling you exactly where to drill before you click. And because the whole form-flow machinery (edit checks, queries, change-reason Δ, SDV, status/e-signature) is keyed on the *instance* and its *field values* — not on the subject — the very same renderer drives a pen's clinical form, a house's Daily Environmental Log, and a site's Initiation Visit identically. The scope changes which key the instance carries; the regulated behavior is the same everywhere. A recurring log (the Daily Environmental Log, recorded once per house per day for forty-plus days) is just that renderer behind a repeating table: one row per day, an edit-check count per row, and the full per-field flow in the slide-in panel — the same table-and-panel the AE and ConMed logs use, with no new machinery. And it *looks* like the Subject Record too, not just behaves like it: the same sidebar (status half-moons, query badges, SDV shields, the blue active row) beside the same sticky form header — title, a Remarks dropdown, and the Submit→Finalize→Lock button — so a reviewer moving between a pen and a house never has to relearn the screen. The only honest difference is where it has to be: on a repeating log the header's Submit acts on the whole form at once and the per-entry panel carries just the fields, because that is what "review the day's environmental readings" actually means. That rule is the same wherever a form repeats — the subject's Adverse Event and ConMed logs included: one sticky header, a status that rolls up to the weakest entry so the log advances as a unit, and an Add button that lives in the table, not the chrome. A reviewer never has to wonder whether *this* table is the kind that has a Submit button; they all are.

### Why it matters

The dual-mode architecture closes the bottleneck at its source. Group studies stop fighting the 1:1 assumption — entry matches the barn. Individual studies (companion and equine) get the depth they need. And because the mode is a property of the study, a sponsor running a cattle group trial *and* a canine companion trial in the same portfolio gets the right tool for each with no configuration — the EDC reshapes itself.

It's the difference between software that *tolerates* veterinary research and software *designed for* it.

---

## Case Study 3 — Species-Specific Validation & the Grouped Form Layer

### The problem

An edit check is the EDC's first line of data-quality defence: the moment a value is entered, the system asks *"is this plausible?"* and raises a query if it isn't. In human EDC the answer is a constant — a rectal temperature outside 36–38 °C is flagged, full stop. In **veterinary** EDC there is no such constant. A normal equine rectal temperature is 37.5–38.5 °C; for cattle it's 38.0–39.3 °C; a resting heart rate of 90 bpm is alarming in a horse (normal 28–44) and unremarkable in a dog (60–140). **The same field, on the same form, means different things for different animals.**

Bolting per-species rules into the form definition is the obvious move and the wrong one: it forces a separate form per species, and the moment a study adds a species the form library forks. The validation has to be **data, not structure** — resolved at runtime from the subject in front of you.

A second problem sits alongside it. A real veterinary protocol isn't a flat list of forms — it's a **visit schedule**: Animal Information, Screening, five dosing/follow-up visits, plus event-driven forms (adverse events, concomitant medications). Each visit bundles a physical exam with a visit-specific assessment. Rendered flat, a 24-form study is an undifferentiated wall in the sidebar; the structure that makes the protocol legible is lost.

### The insight

**The field declares *what* it measures; the species table declares *the range*.** A temperature field carries `validation: { vital: "temperature" }` — nothing more. A separate `species_ranges` table holds `(species, vital) → min/max`. At entry time the engine reads the subject's species, resolves the range, and compares. One pure function, `evaluateField(field, value, species, ranges)`, does the whole job; the form definition never mentions a number. Add a species → add five rows to a table, touch no forms.

**Forms nest one level: a group is a container, a sub-form holds the fields.** A `parent_form_id` self-reference turns the flat form list into *Animal Information → {Demographics, Medical History}*, *Visit 1 — Dosing → {Physical Examination, Dosing Administration}*, and so on. A group has **no fields of its own**; its status is **rolled up from its children** — worst child wins, so a single queried sub-form surfaces an amber flag on the whole group without the user expanding it.

### The solution

**Validation as a resolved lookup.** `species_ranges` carries rows across multiple species (cattle, canine, equine, feline, swine, **chicken**). A vital field stores only its `vital` key; a non-vital numeric field can still carry a static `{ min, max }` (a body-condition score of 1–9). When a value lands outside the resolved range the Subject Record **auto-raises an inline edit-check query** (the Case Study 1 pattern) — and when the value comes back in range, the query **auto-resolves**. Type `40.6` into a cattle temperature and a query appears; correct it and the query closes itself. The two case studies compose: validation produces the query, the query architecture displays it. The mechanism isn't limited to mammalian vitals: the broiler study declares an `ammonia_level` vital, so a poultry house reading of 32 ppm against the 0–25 ppm range raises the very same edit check — a new "vital" is one more row in the table, not a line of code. The lookup even resolves **by age class**: bovine heart rate splits into `heart_rate_calf` (≤6 mo, 100–140 bpm) and `heart_rate_adult` (48–84 bpm), so the *same* 120 bpm reading is normal for a calf and flagged for an adult — the range is keyed on the animal's `age_months`, not hard-coded into a screen.

**Groups as collapsible sections.** The form sidebar reads the `parent_form_id` tree and renders each group as a collapsible header carrying a **rolled-up status icon** and an open-query badge; sub-forms indent beneath it, and groups can **nest to any depth** (the engine recurses on `parent_form_id`). PH-2401 lays its weekly visits out as six top-level *Week* groups, each holding that week's Body Weight and Flock Health forms, followed by a standalone read-only auto-generated **Production Summary** (a per-week table plus an overall FCR / ADG / EPEF rollup). Within a form a further level of structure — **named field sections** (Pen Identification, Vital Signs, Withdrawal …) — breaks a long form into labelled clusters. The protocol's shape is now visible at a glance — and the same engine drives all three studies, **each with its own tree** (the broiler trial runs pen-level forms across 5 groups, from Pen Setup through Production Monitoring to Closeout, with each weekly visit (D7–D42) as its own form — *plus* a house-scoped Daily Environmental Log on the Barn Record; the bovine trial 15 animal-level forms across 6 groups, from Enrollment & Randomization through Safety & Pathology to Closeout; the canine study runs Screening → Randomization → four follow-ups → End of Study with up to seven sub-forms a visit), totalling **134 forms / 995 species-specific fields**. The canine study (**CA-0801 — DermAlliv™**) is the proof at scale: a 53-form, **multi-site** (three sites), randomized double-blind protocol — including a read-only **ePRO** owner-diary form whose data flows from an owner portal — rendered by the *same* engine, no special cases.

### Why it matters

Species-specific validation is the single clearest answer to *"why can't we just use a human EDC?"* — the thing that platform literally cannot express becomes one table and one pure function here. And because the range is data, the grouped form layer stays **species-agnostic structure over species-specific data**: one form engine, one validation engine, three studies, five species, zero forked forms. It's Case Study 2's thesis — *the data model decides, not the user* — carried all the way down to the individual field.

### From definition to entry

The same field definitions drive a complete data-entry surface, not just a preview. One renderer maps every `field_type` to the right control — number with a unit hint, a **Yes/No toggle** instead of a dropdown, **multiselect checkboxes**, **read-only calculated** values (age from date of birth, FEC % reduction), a **file upload**, and a **coded** field that opens a VeDDRA dictionary lookup (gated to the data manager). A few controls are even **study-type-aware** — Pen / Lot ID is a free-text field for an individual-animal study but a dropdown of the study's pens for a group-housed one, the same Case Study 2 principle reaching down to a single input. Required fields carry an asterisk; vitals carry their species range as a hint. And the *shape* of a form follows its clinical role: most are a single record, but **event logs** — concomitant medications, adverse events, protocol deviations — render as a **repeating table** (one row per entry, add / edit in a slide-in panel / delete), because a subject has *many* of each, not one. Each entry is its own form instance in the session store, so the same field definitions power both a one-off CRF and an unbounded log with no separate code path.

Over the top sits the regulated lifecycle every clinical record needs: **Empty → In-Work → In-Review → Reviewed → Finalized → Locked**, each transition gated to the role that owns it, with an **electronic signature** to lock and a fully read-only form afterwards (21 CFR Part 11). And the **inclusion/exclusion** sub-form is live logic, not just fields — fail any criterion and the subject is flagged **ineligible for PI review**, surfaced on the record and back in the drill-down list. Criteria carry their own polarity: a positively-phrased *inclusion* criterion fails on "No" (consent obtained? reproductive tract score ≥2?), while an *exclusion* criterion fails on "Yes" (prior antibiotics? active lameness?) — each field declares the failing answer (`exclusion_if`), so the engine reads a real protocol's mixed criteria correctly instead of assuming one direction. The point: the field metadata isn't documentation, it's the program — definition, validation, entry, and workflow all read from the same source.

Two details carry the same regulated intent down to the keystroke. Changing a value that was already saved demands a **change reason** — the Δ panel shows old → new, captures the reason with author and timestamp, and walks a *pending → answered → DM-approved* state — while a brand-new entry asks for nothing (there's no prior value to explain). The reason is owed only on a value that was *already saved*, never on the keystrokes of a first entry: typing the first value into an empty field — even after you leave the field — raises no Δ at all, because there is no prior saved value to explain. And it is owed on *every* transition, not just the net move: each change writes its own record carrying its specific *old → new* pair, so editing a value A → B → C without pausing to explain leaves **two** debts on the audit trail, not one — change one (A→B) and change two (B→C), each awaiting its own justification, each shown on its own card in the panel. Change a toggle Yes → No → Yes and the same holds; and the field's marker turns green only once **every** change in that history has been signed off — one unapproved change anywhere and it stays blue.

**Consistent card format for all change reasons** — We chose a single consistent card format for all change reason entries, regardless of whether one or multiple transitions are pending. This mirrors the paper-based CRF convention where every correction follows the same format (old value, new value, reason, signature). Consistency reduces cognitive load for busy clinical staff and eliminates training complexity — the workflow is identical every time.

And a query, once raised, never silently disappears: it stays amber while open and turns a **persistent green** when resolved, because in an auditable system the absence of a flag and a *resolved* flag are not the same fact. The same auditable instinct governs a subject who **leaves** the study: a completed or withdrawn record goes fully read-only — entry actions (Submit / Finalize / Lock, new SDV, new change reasons) disappear — and a withdrawal carries a persistent banner, *"Data collected prior to withdrawal is preserved for analysis."* Nothing is deleted; the record is frozen, not erased. (Existing queries stay manageable so a data manager can still close out open items against the preserved data.)

Workflow honours role and judgement, too. Queries move through the hands that own each step — a monitor raises, a coordinator responds, a monitor resolves — and eligibility isn't a dead end: when a subject fails inclusion/exclusion the record reads **Ineligible**, but a Principal Investigator can **override** it with a documented clinical reason and restore the subject to active. The rule protects the data; the override respects the clinician. Both are recorded. The same role discipline governs *building* the study tree: **adding a site** is an Administrator's call, **adding housing** (barn / pen / stable / stall) belongs to the coordinator and data manager, and **enrolling an animal** is the coordinator's or monitor's — so the org chart, not a free-for-all, shapes who can extend the hierarchy. And the boundary cuts the other way too: the **Administrator works in a separate Sites surface — standing up and editing sites, reading per-site enrollment and query counts — and never enters the clinical data flow at all** (the Data Entry screens aren't even in their nav). Who builds the study and who fills it with patient data are deliberately different hands, each with its own room. But they share *one* room for the **site record**: there is a single canonical Site Record page, reached by the Admin from the Sites table and by a coordinator from the Data Entry drill-down's "Open site record" — the same screen, role-adaptive (the Admin gets an Edit toggle and amendment/visit/contact management; the coordinator sees it read-only). One page, two doors — no duplicated, drifting copies.

---

## Case Study 4 — Randomization & the Inventory Bridge

### The problem

Randomization is the moment a trial becomes a *controlled* trial — the point where a subject is bound to a treatment arm under a documented, auditable method. But in a regulated study that assignment is never just a label. It has to answer two questions at once: *which arm is this animal in?* and *which physical unit of investigational product was used to treat it?* A treatment arm with no link to a lot number is a randomization you can't reconcile against the supply — and drug accountability (what shipped, what was administered, what was returned or destroyed) is exactly what an auditor and a sponsor's blinding plan depend on.

Most demo EDCs model randomization as a single dropdown on a visit form. That collapses the assignment, the method, the blinding state, and the supply link into one field — and loses every one of the threads a real reconciliation needs to pull.

### The insight

Randomization deserves its own form, and that form is where the **assignment meets the supply chain**. It is the natural seam between two modules that are otherwise separate: the **data-capture** world (subjects, visits, values) and the **inventory** world (lots, batches, kits, expiry, accountability). Model the seam explicitly and both sides stay clean: the subject record never has to know about warehouse stock, and the inventory module never has to parse a visit form — they meet at one record, the randomization.

### The solution

The companion study carries a dedicated **Randomization** standalone form (top-level, outside the visit groups, because randomization happens once and governs everything after it); the livestock studies fold the assignment into their setup/treatment forms but capture the **same regulated essentials** — **randomization date/number or block**, **treatment/arm assignment**, **method**, **blinding**, and **performed-by** — and then, critically, the **supply link**: a lot / batch / kit identifier that ties the assignment to a physical inventory unit. Each study names that link in its own protocol's terms, which is the tell that it's a real domain concept and not a generic field:

- **PH-2401** (broiler) — the *Test Article Lot Number* of the phytogenic premix and the *Feed Lot Number* of the ration it is blended into, captured on the pen's Randomization and Feed Setup forms.
- **BR-2502** (cattle) — the treatment *Lot / Expiry* of the test article drawn for each animal's injection, carried alongside the dose and withdrawal-period fields.
- **CA-0801** (canine) — *Diet Kit Number* and a *Blinding Envelope Number*, the masked food kit dispensed to the owner.

Today those identifiers are captured as traceable text on the randomization record. The design intent is the **bridge**: each is the foreign key a future Inventory module will resolve — dispensing a kit decrements stock, a lot's expiry or recall flows back to every subject it touched, and drug-accountability reconciliation (shipped → assigned → administered → returned) runs off the same join. The randomization form is built now so the inventory module has something to connect *to* later; the seam is in place before the second module exists.

### Why it matters

Putting randomization on its own form — with the supply link as a first-class field — is the difference between a system that *records* an assignment and one that can *reconcile* it. It keeps blinding auditable, keeps drug accountability possible, and draws a clean line between data capture and inventory that lets each evolve without entangling the other. It's the same thesis as the other case studies, one layer up: model the real-world structure in the data, and the screens — and the modules that come later — fall out of it.

---

## Case Study 5 — Batch Entry: capturing a pen, not a patient

### The problem

Human-subject EDCs are built around one premise: a record is a person, and you sit with that person and fill their form. Veterinary trials break that premise. A feedlot BRD study enrolls cattle in pens; on Day 3 a single technician walks a pen of forty head and records the same vital-signs form for every animal, one after another, at the chute. Force that workflow through a one-subject-at-a-time eCRF and you've designed for the wrong unit of work — forty navigations, forty form-opens, forty save clicks, for what is operationally a single pass down the alley.

### The insight

The form is the same; only the animal changes. So the right surface isn't a record — it's a **grid**: the form's fields as columns, the pen's animals as rows. And the system already knows *which* form is due — every animal carries an enrollment date, and the protocol defines visit windows (Day 3 ±1, Day 7 ±2, …), so on any given day the EDC can compute exactly which visit form is due for how many animals and offer it before the user goes looking.

### The solution

A `batch_eligible` flag on the form definition marks the recurring visit forms (BR-2502's Vital Signs and Clinical Response, all five visit days). Where any such form exists, a **Batch entry** button appears — on the Animals list and at the animal level of the drill-down — and *only* there (PH-2401 and CA-0801 have no batch-eligible forms, so they never show it). It opens a two-step flow: a **suggestion modal** that reads each animal's enrollment date, applies the visit windows, and surfaces "Vital Signs — Day 3 · 5 animals due" cards; then a **full-screen grid** — one row per animal, one column per field, inline editing at design-system cell height, native selects, compact Yes/No toggles. The same validation engine runs **per cell**: an out-of-range temperature flags the cell amber and drops an `EC- n` chip in the row's Alerts column, age-class-aware (the calf and the steer in the same pen get different heart-rate ranges) — but it never blocks the technician mid-pass, because the field reality is that you record first and reconcile after. **Save all** writes every row that has data, skips the empty ones, and reports back: "6 records saved · 1 with open edit checks · 6 skipped."

### Why it matters

Batch entry is the clearest single answer to "why does veterinary need its own EDC?" It isn't a re-skin of a human system — it's a different unit of work modeled honestly: the pen. Built on the exact same form definitions, validation, and session store as the one-animal record (the grid persists ordinary `form_instances`, `field_values`, and edit-check records — a batch-saved form is indistinguishable downstream from one entered animal-by-animal), it adds a workflow no human-subject EDC has a reason to build, without forking the data model to get it.

---

> **Case Study 6 is coming** — **conditional demographics** (breed lists, age auto-calculation from date of birth, and production-purpose tags that appear and validate based on the animal). The form layer it builds on is now live.

---

### A note on sharing the work

Because this case study is shared publicly for evaluation, the live app gates every non-owner visitor through a one-time **access agreement** before the study selector — name + agreement, recorded to a Supabase `nda_agreements` table — while an owner code (`ARKEN-ADMIN`) bypasses it. It's a small, deliberate decision: protect the originality of the design and patterns documented here without putting friction between a reviewer and the work. (Minor study-list affordances live alongside it — e.g. pinning studies to the top of the table, marked only by a filled pin icon, no row highlight.)
