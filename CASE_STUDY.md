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

---

## Case Study 2 — Dual-Mode Enrollment Architecture

### The problem

The veterinary clinical trial industry runs on software built for *human* trials. Medidata Rave, Veeva, OpenClinica — all share one load-bearing assumption: **one subject, one record, one data-entry session.** A human trial enrols Patient 001, and Patient 001 is a person who gets their own case report form, filled one sitting at a time.

For animals, that assumption breaks.

A bovine respiratory disease trial doesn't enrol one cow. It enrols a **pen of forty** — housed together, treated together, measured together. A field tech walking the barn doesn't sit with one animal and complete a form; they walk the pen and record forty rectal temperatures in a row. Forcing that through a human-EDC system means opening forty separate subject records to capture what is, operationally, a single pass through a single pen.

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

**The hierarchy adapts.** Companion studies drill **Site → Subject** (with an owner). Both livestock types drill **Site → Barn → Pen → Animal**. One drill-down component reads the study type and renders the right number of levels — the same browser, three shapes.

**The entry mode adapts.**
- **Companion →** an *individual subject record* — full form sidebar, rich per-animal forms, owner-reported outcomes.
- **`livestock_group` →** a *group entry matrix* — the pen is the screen; measurements are entered across every animal in the pen in one pass, the way the work actually happens in the barn.
- **`livestock_individual` →** *individual animal records* inside the livestock hierarchy — the depth of a subject record, reached through the barn/pen drill-down.

**Same components, recomposed.** The subject record, the drill-down, and the form sidebar are one component library; the study type composes them differently. That is the payoff of designing the data model before the screens: three operational realities, one coherent system, zero bolt-ons.

### Why it matters

The dual-mode architecture closes the bottleneck at its source. Group studies stop fighting the 1:1 assumption — entry matches the barn. Individual studies (companion and equine) get the depth they need. And because the mode is a property of the study, a sponsor running a cattle group trial *and* a canine companion trial in the same portfolio gets the right tool for each with no configuration — the EDC reshapes itself.

It's the difference between software that *tolerates* veterinary research and software *designed for* it.

---

> **Case Studies 3 and 4 are coming** — **species-specific validation** (dynamic edit checks that change by species: a normal rectal-temperature range for cattle is not the range for horses) and **conditional demographics** (breed lists, age calculation, and production-purpose tags that appear and validate based on the animal). These will be written when the **form layer is built in Session 22**.
