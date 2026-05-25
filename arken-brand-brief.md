# Arken EDC — Brand Brief
**Version:** 1.0  
**Date:** 2026-05-25  
**Author:** Elisa [surname]  
**Status:** Approved — Session 1 output

---

## 1. Product definition

**Arken** is a platform for electronic data capture in animal clinical trials. It serves pharmaceutical companies, contract research organisations (CROs), academic institutions, and regulatory bodies conducting preclinical and veterinary studies across species including canine, aquatic, agricultural, and primate subjects.

### The problem it solves
No purpose-built EDC platform exists for animal studies. The current market is fragmented: teams use human EDC tools (Veeva Vault, Medidata Rave, Castor) adapted awkwardly to animal contexts, or paper-based systems, or legacy desktop software. None handle species-specific data models, group batch data entry for litter/school/flock scenarios, or the field-technology requirements of farm and aquatic environments.

### Why now
Regulatory pressure on preclinical data quality is increasing. ICH M10, VICH GL9, and USDA AWA reporting requirements demand audit trails and data integrity standards that paper and ad-hoc tools cannot satisfy. The market is ready for a purpose-built solution.

---

## 2. Platform architecture

Arken is a platform with modular study-type support. The core engine handles:
- Study setup and protocol configuration
- Role-based access and permissions
- Form builder and data entry
- Query management lifecycle
- Audit trail and data lock
- Export and regulatory submission packaging

**Flagship module (v1): Arken Canine**  
Canine oncology studies. Justification: largest preclinical animal study segment, highest data complexity (body weight dosing, tumour measurement, RECIST-equivalent endpoints), most analogous to human trials (most likely to attract CRO interest).

**Planned modules:** Arken Aquatic · Arken Agri · Arken Primate

---

## 3. Users

| Role | Who they are | Primary need |
|---|---|---|
| PI | Principal Investigator — the vet or researcher leading the study | Study oversight, data review, e-signature |
| CRC | Clinical Research Coordinator — runs day-to-day operations | Efficient data entry, query resolution |
| CRA | Clinical Research Associate — monitors data quality on behalf of sponsor | SDV, raising queries, reviewing audit trail |
| DM | Data Manager — ensures data integrity and database lock | Edit checks, discrepancy management, lock |
| PM | Project Manager — tracks study progress and timelines | Dashboard overview, milestone tracking |
| Admin | System administrator | User management, study configuration |
| Field Tech | Farm technician, aquatic facility staff — data entry in the field | Simple, offline-capable entry on tablet |

---

## 4. Visual identity

### Name rationale
**Arken** derives from "arc" — the arc of a clinical study from protocol to database lock, and the arc of an animal subject's participation. Hard consonants (K) signal precision and authority. One syllable + two syllables: easy to say in Italian, English, and across European languages. No conflicting SaaS trademark at time of naming.

### Personality
**Precise. Trustworthy. Unhurried.**

Arken does not try to be friendly or consumer-like. It is software that handles regulated data — it should feel like a well-engineered instrument. But it is not cold or hostile. The analogy: a high-quality medical device. Engineered, deliberate, with just enough warmth to signal that humans made it for humans (and animals).

Adjectives that define the visual language:
- Structured — clear grid, consistent rhythm, nothing arbitrary
- Legible — data-first, typography optimised for scanning dense tables
- Considered — every component exists for a reason; nothing decorative for its own sake
- Calm — no unnecessary animation, no bright UI chrome, data takes visual priority

### What Arken is NOT
- Not playful or consumer-app friendly
- Not sterile or government-bureaucratic
- Not trying to look like Veeva or Medidata (those read as legacy)
- Not minimalist to the point of ambiguity — clinical context requires clear affordances

---

## 5. Color rationale

### Primary palette

**Arken Slate** — the neutral foundation. A blue-tinted dark grey rather than pure black or warm grey. Blue undertone reads as technical and precise; avoids the cold of pure neutral grey. Used for text, borders, surfaces.

**Arken Teal** — the brand accent. Chosen because:
1. Not used by any major EDC competitor (Veeva = blue, Medidata = orange/red, Castor = blue)
2. Sits at the intersection of clinical (blue) and life sciences (green) without being either
3. Works equally well on light and dark backgrounds
4. Reads as trustworthy and precise, not playful

**Status color system** (clinical-specific, not brand):
- Query raised: Amber — universal warning signal, matches paper annotation conventions
- Discrepancy / error: Red — unambiguous, accessible
- Clean / SDV complete: Green — matches "clear" conventions in clinical monitoring
- Locked: Muted slate — recedes visually, signals immutability
- Pending / in progress: Blue — informational, neutral urgency

### Dual-mode approach
Light mode is the primary clinical workstation experience — monitors doing SDV, data managers reviewing listings. Dark mode is the primary field and dashboard experience — field techs on tablets in low-light environments, PMs reviewing overnight dashboards. Both modes are first-class; neither is an afterthought.

---

## 6. Typography rationale

### Display / headings: DM Sans
Geometric but humanist. Clinical without being cold. The subtle optical corrections in DM Sans make it unusually legible at small sizes — critical for data-dense interfaces. Not as overused as Inter or Plus Jakarta Sans.

### Body / UI: DM Sans (same family, different weights)
Single-family system reduces visual noise in dense data views. Weight variation (400, 500, 600) carries all necessary hierarchy.

### Data / mono: JetBrains Mono
Used for: subject IDs, timestamps, form field values, audit trail entries, any value that needs exact character-by-character reading. The monospaced grid makes numerical alignment automatic. JetBrains Mono has unusually good legibility at 12–13px — the sizes that appear in data tables.

---

## 7. Design principles (for interview use)

**1. Data is the hero.** UI chrome exists to serve data, not compete with it. When in doubt, reduce the visual weight of navigation and surface more data.

**2. States are semantic.** Every data state (empty, filled, queried, locked, audited) has a distinct visual treatment. Users should never have to read a label to understand the state of a field.

**3. Role clarity at a glance.** Within 3 seconds of opening a screen, a user should know which role context they are in. Role colour, dashboard layout, and visible actions differ by role — this is not configuration, it is the design.

**4. Offline is a feature, not a fallback.** Field technicians work in barns, on boats, in locations with no connectivity. The Field Tech experience is designed offline-first; sync is an event, not a dependency.

**5. Audit trail is the product.** Every action is recorded. The audit trail is not a compliance checkbox — it is the primary evidence of data integrity. Its design gets the same care as the data entry experience.

---

## 8. Competitive positioning

| Competitor | Strength | Weakness | Arken advantage |
|---|---|---|---|
| Veeva Vault EDC | Regulatory credibility, enterprise trust | Human-only, expensive, slow to configure | Purpose-built for animal data models |
| Medidata Rave | Feature depth, sponsor adoption | Legacy UX, steep learning curve | Modern UX, faster study setup |
| Castor EDC | Clean UX, academic pricing | Limited to human studies | Animal-specific from the ground up |
| REDCap | Free, flexible | Not purpose-built for clinical trials | Proper GCP tooling, audit trail, SDV |
| Paper / Excel | Familiar, no training | No audit trail, error-prone, not regulatory-grade | Regulatory compliance built in |

---

## 9. Session 1 decisions log

| Decision | Options considered | Choice | Rationale |
|---|---|---|---|
| Product name | Arken, Verd, Kairo, Vela, Luma, Ørka | **Arken** | Authority, no trademark conflict, works as platform + module names |
| Primary mode | Light-first, Dark-first, Split | **Split 50/50** | Two distinct user contexts demand two first-class modes |
| Product scope | Single tool, Platform, Platform + flagship | **Platform + flagship (Arken Canine)** | Maximum portfolio impact with realistic execution scope |
| Accent colour | Teal, Blue, Indigo | **Teal** | Differentiated from all major EDC competitors |
| Type system | Single family, Dual family | **Single family (DM Sans) + mono (JetBrains Mono)** | Reduces visual noise in dense data interfaces |

---

*Next: Session 2 — Token architecture. Output: tokens.json + CSS variables file.*
