// ════════════════════════════════════════════════════════════════════════════
// Seeded drug inventory (session-only). No vials/shipments tables exist in
// Supabase — this deterministic demo set is generated at hydrate time, attached
// to the real studies / sites / subjects by stable code order (same precedent as
// the seeded SDV records, ConMeds and coding tasks).
//
//   BR-2502 — injectable antimicrobial, vial-level, withdrawal-period linked
//   CA-0801 — blinded topical/oral kits, volume accountability (returns)
//   PH-2401 — feed additive, batch/kg tracking, delivery to pens (no returns)
// ════════════════════════════════════════════════════════════════════════════
import type { Dataset, Vial, Shipment, VialEvent } from "./types";

type StudyRow = Dataset["studies"][number];
type SiteRow = Dataset["sites"][number];
type SubjectRow = Dataset["subjects"][number];

// Dates are anchored to the demo "today" (2026-06-23) so withdrawal/expiry windows
// stay stable: BR Day-0 dispenses on 2026-06-12 are still inside the 28-day
// withdrawal; the CA "Kit A-005" expiry (2026-07-12) falls inside 30 days.
export function buildInventorySeed(
  studies: StudyRow[],
  sites: SiteRow[],
  subjects: SubjectRow[],
): { vials: Vial[]; shipments: Shipment[] } {
  const vials: Vial[] = [];
  const shipments: Shipment[] = [];

  const studyId = (code: string) => studies.find((s) => s.code === code)?.id ?? "";
  const sitesOf = (code: string) =>
    sites.filter((s) => s.study_id === studyId(code)).slice().sort((a, b) => (a.code < b.code ? -1 : 1));
  const subjectsOf = (code: string) =>
    subjects.filter((s) => s.study_id === studyId(code)).slice().sort((a, b) => (a.subject_code < b.subject_code ? -1 : 1));

  // ─── BR-2502 — injectable antimicrobial (BRDVAX-01) ───────────────────────
  {
    const sid = studyId("BR-2502");
    if (sid) {
      const st = sitesOf("BR-2502");
      const subs = subjectsOf("BR-2502");
      const siteByCode = (code: string) => st.find((s) => s.code === code)?.id ?? st[0]?.id ?? null;
      const TX = siteByCode("TX"), KS = siteByCode("KS"), CO = siteByCode("CO");
      const subsOfArm = (arm: string) => subs.filter((s) => s.randomization_arm === arm).map((s) => s.subject_code);
      // treatmentGroup IS the arm code now (T01/T02/T03) — no bridge map. One lot per
      // arm; Tulathromycin for T01/T02 (different mg/kg), saline placebo for T03.
      const ARM: Record<string, { drug: string; vol: number; wd?: number }> = {
        T01: { drug: "Tulathromycin 100 mg/mL", vol: 7.0, wd: 49 }, // 2.5 mg/kg · 49-day withdrawal (label)
        T02: { drug: "Tulathromycin 100 mg/mL", vol: 14.0, wd: 84 }, // 5.0 mg/kg · 84-day withdrawal (FARAD, extra-label)
        T03: { drug: "Saline 0.9% NaCl", vol: 7.0, wd: undefined }, // volume-matched to T01 · no withdrawal (placebo)
      };
      const recvNote = (lot: string) => ({ type: "received" as const, date: "2026-05-08", note: `Shipment SHP-${lot} received intact` });
      for (const arm of ["T01", "T02", "T03"]) {
        const cfg = ARM[arm];
        const lot = `LOT-BR-${arm}`;
        const codes = subsOfArm(arm);
        const sc = (i: number) => codes[i % Math.max(1, codes.length)] ?? `BR-${arm}-${i + 1}`;
        const mk = (n: number, status: Vial["status"], siteId: string | null, events: VialEvent[]): Vial =>
          ({ studyId: sid, drugName: cfg.drug, concentration: 10, unit: "ml", withdrawalDays: cfg.wd, kitNumber: undefined, expectedDailyDose: undefined,
            id: `VL-BR-${arm}-${String(n).padStart(2, "0")}`, lotId: lot, treatmentGroup: arm, status, siteId, initialVol: 50, expiryDate: "2027-04-30", receivedDate: "2026-05-08", events });
        const r = recvNote(lot);
        vials.push(mk(1, "available", TX, [r])); // ready stock
        vials.push(mk(2, "available", KS, [r]));
        vials.push(mk(3, "athome", TX, [r, { type: "dispense", date: "2026-06-12", subject: sc(0), visit: "Day 0", volDispensed: cfg.vol, route: "SC injection", location: "farm", by: "M. Okafor" }])); // recent → active withdrawal
        vials.push(mk(4, "depleted", KS, [r, { type: "dispense", date: "2026-05-20", subject: sc(1), visit: "Day 0", volDispensed: cfg.vol, route: "SC injection", location: "farm", by: "L. Brandt" }, { type: "return", date: "2026-05-20", volReturned: 0, condition: "Single-use — remainder discarded" }]));
        vials.push(mk(5, "removed", CO, [r, { type: "removed", date: "2026-05-12", note: "Seal compromised on inspection — quarantined (CO feedlot)" }])); // CO low-stock
        // T03's shipment left pending review (demo); T01/T02 confirmed.
        shipments.push({ id: `SHP-${lot}`, studyId: sid, lot, shipDate: "2026-05-06", receiveDate: "2026-05-08", vialCount: 5, usableCount: 4, confirmed: arm !== "T03" });
      }
    }
  }

  // ─── CA-0801 — blinded topical/oral kits (volume accountability) ──────────
  // Kit-per-visit model: each subject's kit holds 5 visit-units (V1 Baseline …
  // V5 End of Study). Earlier visits are dispensed-and-returned (available), the
  // most recent dispensed visit is out with the subject (athome), upcoming visits
  // stay available. The Inventory tab groups these by base kit.
  {
    const sid = studyId("CA-0801");
    if (sid) {
      const st = sitesOf("CA-0801");
      const subs = subjectsOf("CA-0801");
      const site = (i: number) => st[i % Math.max(1, st.length)]?.id ?? null;
      const sc = (i: number) => subs[i % Math.max(1, subs.length)]?.subject_code ?? `CA-${i + 1}`;
      const DOSE = 6; // expectedDailyDose ml/day (0.5 ml/kg × 12 kg)
      const ARK = "ARK-238 1% topical solution", VEH = "Vehicle control (placebo)";
      const recv: VialEvent = { type: "received", date: "2026-04-10", note: "Kit received — blinded" };
      const VISITS = [
        { n: 1, label: "Baseline", date: "2026-04-10" },
        { n: 2, label: "Follow-Up 1", date: "2026-04-24" },
        { n: 3, label: "Follow-Up 2", date: "2026-05-08" },
        { n: 4, label: "Follow-Up 3", date: "2026-06-05" },
        { n: 5, label: "End of Study", date: "2026-07-03" },
      ];
      const mk = (id: string, kit: string, group: "Treatment A" | "Treatment B", drug: string, status: Vial["status"], siteIx: number, expiry: string, events: VialEvent[]): Vial =>
        ({ id, studyId: sid, lotId: "LOT-CA-001", kitNumber: kit, drugName: drug, treatmentGroup: group, initialVol: 60, concentration: 1, unit: "ml", expiryDate: expiry, receivedDate: "2026-04-10", status, siteId: site(siteIx), expectedDailyDose: DOSE, events });

      // Per-kit config (one subject's kit). `done` = visits already dispensed; `acct`
      // puts a volume-accountability discrepancy on a visit (7-day interval, expected
      // use 6×7=42 ml → clean/minor/major); `depleted`/`removed` mark one unit.
      type Special = { acct?: { visit: number; disp: number; ret: number }; depleted?: number; removed?: number };
      const KITS: { id: string; kit: string; group: "Treatment A" | "Treatment B"; drug: string; sub: number; siteIx: number; expiry: string; done: number; special?: Special }[] = [
        { id: "VL-CA-A01", kit: "Kit A-001", group: "Treatment A", drug: ARK, sub: 0, siteIx: 0, expiry: "2027-03-31", done: 1, special: { acct: { visit: 2, disp: 60, ret: 19.0 } } }, // clean
        { id: "VL-CA-A02", kit: "Kit A-002", group: "Treatment A", drug: ARK, sub: 1, siteIx: 0, expiry: "2027-03-31", done: 1, special: { acct: { visit: 2, disp: 60, ret: 14.6 } } }, // minor (amber)
        { id: "VL-CA-A03", kit: "Kit A-003", group: "Treatment A", drug: ARK, sub: 2, siteIx: 1, expiry: "2027-03-31", done: 1, special: { acct: { visit: 2, disp: 60, ret: 10.4 } } }, // major (red)
        { id: "VL-CA-A04", kit: "Kit A-004", group: "Treatment A", drug: ARK, sub: 3, siteIx: 1, expiry: "2027-03-31", done: 4 }, // dispensed through Follow-Up 3
        { id: "VL-CA-A05", kit: "Kit A-005", group: "Treatment A", drug: ARK, sub: 4, siteIx: 2, expiry: "2026-07-12", done: 0 }, // near-expiry → amber nav alert
        { id: "VL-CA-B01", kit: "Kit B-001", group: "Treatment B", drug: VEH, sub: 5, siteIx: 0, expiry: "2027-03-31", done: 0 },
        { id: "VL-CA-B02", kit: "Kit B-002", group: "Treatment B", drug: VEH, sub: 6, siteIx: 1, expiry: "2027-03-31", done: 1, special: { depleted: 2 } }, // unit emptied at Follow-Up 1
        { id: "VL-CA-B03", kit: "Kit B-003", group: "Treatment B", drug: VEH, sub: 7, siteIx: 1, expiry: "2027-03-31", done: 0 },
        { id: "VL-CA-B04", kit: "Kit B-004", group: "Treatment B", drug: VEH, sub: 8, siteIx: 2, expiry: "2027-03-31", done: 0 },
        { id: "VL-CA-B05", kit: "Kit B-005", group: "Treatment B", drug: VEH, sub: 9, siteIx: 2, expiry: "2027-03-31", done: 0, special: { removed: 1 } }, // tamper at Baseline
        // One kit per remaining CA subject so the Dispensing log never falls back to a
        // KIT-NNNN form value. Named after B-005 so the sorted base-kit order still lines
        // up positionally with the subjects (subject-code order ↔ kit-sort order).
        { id: "VL-CA-B06", kit: "Kit B-006", group: "Treatment B", drug: VEH, sub: 10, siteIx: 0, expiry: "2027-03-31", done: 5 }, // completed dog
        { id: "VL-CA-B07", kit: "Kit B-007", group: "Treatment A", drug: ARK, sub: 11, siteIx: 1, expiry: "2027-03-31", done: 3 }, // active dog
        { id: "VL-CA-B08", kit: "Kit B-008", group: "Treatment B", drug: VEH, sub: 12, siteIx: 2, expiry: "2027-03-31", done: 5 }, // completed dog
      ];
      const disp = (subjCode: string, label: string, date: string, vol: number): VialEvent =>
        ({ type: "dispense", date, subject: subjCode, visit: label, volDispensed: vol, route: "Topical", location: "home", by: "A. Reyes" });
      for (const k of KITS) {
        const subjCode = sc(k.sub);
        for (const v of VISITS) {
          const uid = `${k.id}-V${v.n}`, ukit = `${k.kit}-V${v.n}`;
          let status: Vial["status"] = "available";
          let events: VialEvent[] = [recv];
          if (k.special?.removed === v.n) {
            status = "removed";
            events = [recv, { type: "removed", date: "2026-04-15", note: "Tamper seal broken — quarantined" }];
          } else if (k.special?.depleted === v.n) {
            status = "depleted";
            events = [recv, disp(subjCode, v.label, v.date, 60), { type: "return", date: "2026-05-22", volReturned: 0, condition: "Good — kit emptied" }];
          } else if (k.special?.acct?.visit === v.n) {
            status = "available"; // dispensed then returned — discrepancy shown in the unit lifecycle
            events = [recv, { type: "dispense", date: "2026-05-15", subject: subjCode, visit: v.label, volDispensed: k.special.acct.disp, route: "Topical", location: "home", by: "A. Reyes" }, { type: "return", date: "2026-05-22", volReturned: k.special.acct.ret, condition: "Good — seal intact" }];
          } else if (v.n < k.done) {
            status = "available"; // earlier visit — dispensed and returned at the next visit
            events = [recv, disp(subjCode, v.label, v.date, 60), { type: "return", date: v.date, volReturned: 6, condition: "Returned at next visit" }];
          } else if (v.n === k.done) {
            status = "athome"; // most recent dispensed visit — out with the subject
            events = [recv, disp(subjCode, v.label, v.date, 60)];
          }
          vials.push(mk(uid, ukit, k.group, k.drug, status, k.siteIx, k.expiry, events));
        }
      }
      shipments.push(
        { id: "SHP-CA-001", studyId: sid, lot: "LOT-CA-001", shipDate: "2026-04-08", receiveDate: "2026-04-10", vialCount: 65, usableCount: 64, confirmed: true },
        { id: "SHP-CA-002", studyId: sid, lot: "LOT-CA-002", shipDate: "2026-06-08", receiveDate: "2026-06-10", vialCount: 6, usableCount: 6, confirmed: false },
      );
    }
  }

  // ─── PH-2401 — feed additive, batch/kg, delivery to pens (no returns) ─────
  {
    const sid = studyId("PH-2401");
    if (sid) {
      const st = sitesOf("PH-2401");
      const subs = subjectsOf("PH-2401");
      const site = (i: number) => st[i % Math.max(1, st.length)]?.id ?? null;
      const pen = (i: number) => subs[i % Math.max(1, subs.length)]?.subject_code ?? `Pen ${i + 1}`;
      const mkBatch = (id: string, group: string, drug: string, siteIx: number, events: VialEvent[]): Vial =>
        ({ id, studyId: sid, lotId: id, drugName: drug, treatmentGroup: group, initialVol: 500, concentration: 0.2, unit: "kg", expiryDate: "2027-02-28", receivedDate: "2026-05-01", status: "available", siteId: site(siteIx), events });

      vials.push(mkBatch("BATCH-PH-001", "T02 Phytogenic", "Phytogenic feed additive (oregano/thyme)", 0, [
        { type: "received", date: "2026-05-01", note: "Feed batch received — linked to F3 Feed & Ration Setup" },
        { type: "dispense", date: "2026-05-08", subject: pen(0), visit: "Week 1", volDispensed: 85, route: "In-feed", location: "farm", by: "T. Nguyen" },
        { type: "dispense", date: "2026-05-15", subject: pen(0), visit: "Week 2", volDispensed: 92, route: "In-feed", location: "farm", by: "T. Nguyen" },
        { type: "dispense", date: "2026-05-22", subject: pen(0), visit: "Week 3", volDispensed: 98, route: "In-feed", location: "farm", by: "T. Nguyen" },
      ]));
      vials.push(mkBatch("BATCH-PH-002", "T01 Control", "Control ration (no additive)", 0, [
        { type: "received", date: "2026-05-01", note: "Feed batch received — linked to F3 Feed & Ration Setup" },
        { type: "dispense", date: "2026-05-08", subject: pen(1), visit: "Week 1", volDispensed: 88, route: "In-feed", location: "farm", by: "T. Nguyen" },
        { type: "dispense", date: "2026-05-15", subject: pen(1), visit: "Week 2", volDispensed: 94, route: "In-feed", location: "farm", by: "T. Nguyen" },
      ]));
      shipments.push(
        { id: "SHP-PH-001", studyId: sid, lot: "BATCH-PH-001 / 002", shipDate: "2026-04-29", receiveDate: "2026-05-01", vialCount: 2, usableCount: 2, confirmed: true },
      );
    }
  }

  return { vials, shipments };
}
