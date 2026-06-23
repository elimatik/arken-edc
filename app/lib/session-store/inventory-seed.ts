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
      const site = (i: number) => st[i % Math.max(1, st.length)]?.id ?? null;
      const sc = (i: number) => subs[i % Math.max(1, subs.length)]?.subject_code ?? `BR-${i + 1}`;
      const WD = 28; // withdrawal period (days)
      const base = {
        studyId: sid, drugName: "BRDVAX-01 (tulathromycin)", concentration: 5, unit: "ml",
        withdrawalDays: WD,
      };
      const mk = (v: Partial<Vial> & { id: string; lotId: string; treatmentGroup: string; status: Vial["status"]; siteId: string | null; initialVol: number; expiryDate: string; receivedDate: string; events: VialEvent[] }): Vial =>
        ({ ...base, kitNumber: undefined, expectedDailyDose: undefined, ...v });

      // LOT-BR-001 (5 vials, received 2026-05-08)
      vials.push(mk({ id: "VL-BR-001", lotId: "LOT-BR-001", treatmentGroup: "Treatment A", status: "depleted", siteId: site(0), initialVol: 10, expiryDate: "2027-04-30", receivedDate: "2026-05-08", events: [
        { type: "received", date: "2026-05-08", note: "Shipment SHP-BR-001 received intact" },
        { type: "dispense", date: "2026-05-01", subject: sc(0), visit: "Day 0", volDispensed: 3.5, route: "SC injection", location: "farm", by: "M. Okafor" },
        { type: "return", date: "2026-05-01", volReturned: 6.5, condition: "Good — multidose vial" },
        { type: "dispense", date: "2026-05-01", subject: sc(1), visit: "Day 0", volDispensed: 3.4, route: "SC injection", location: "farm", by: "M. Okafor" },
        { type: "return", date: "2026-05-01", volReturned: 3.1, condition: "Good — multidose vial" },
        { type: "dispense", date: "2026-05-01", subject: sc(2), visit: "Day 0", volDispensed: 3.1, route: "SC injection", location: "farm", by: "M. Okafor" },
        { type: "return", date: "2026-05-01", volReturned: 0, condition: "Good — vial emptied" },
      ] }));
      vials.push(mk({ id: "VL-BR-002", lotId: "LOT-BR-001", treatmentGroup: "Treatment A", status: "available", siteId: site(1), initialVol: 10, expiryDate: "2027-04-30", receivedDate: "2026-05-08", events: [
        { type: "received", date: "2026-05-08", note: "Shipment SHP-BR-001 received intact" },
        { type: "dispense", date: "2026-06-12", subject: sc(3), visit: "Day 0", volDispensed: 3.6, route: "SC injection", location: "farm", by: "L. Brandt" },
        { type: "return", date: "2026-06-12", volReturned: 6.4, condition: "Good — multidose vial" },
      ] }));
      vials.push(mk({ id: "VL-BR-003", lotId: "LOT-BR-001", treatmentGroup: "Treatment B", status: "available", siteId: site(2), initialVol: 10, expiryDate: "2027-04-30", receivedDate: "2026-05-08", events: [
        { type: "received", date: "2026-05-08", note: "Shipment SHP-BR-001 received intact" },
        { type: "dispense", date: "2026-06-12", subject: sc(4), visit: "Day 0", volDispensed: 3.5, route: "SC injection", location: "farm", by: "P. Castellano" },
        { type: "return", date: "2026-06-12", volReturned: 6.5, condition: "Good — multidose vial" },
        { type: "dispense", date: "2026-06-12", subject: sc(5), visit: "Day 0", volDispensed: 3.4, route: "SC injection", location: "farm", by: "P. Castellano" },
        { type: "return", date: "2026-06-12", volReturned: 3.1, condition: "Good — multidose vial" },
      ] }));
      vials.push(mk({ id: "VL-BR-004", lotId: "LOT-BR-001", treatmentGroup: "Treatment B", status: "athome", siteId: site(3), initialVol: 10, expiryDate: "2027-04-30", receivedDate: "2026-05-08", events: [
        { type: "received", date: "2026-05-08", note: "Shipment SHP-BR-001 received intact" },
        { type: "dispense", date: "2026-06-12", subject: sc(6), visit: "Day 0", volDispensed: 3.6, route: "SC injection", location: "farm", by: "R. Singh" },
      ] }));
      vials.push(mk({ id: "VL-BR-005", lotId: "LOT-BR-001", treatmentGroup: "Control", status: "removed", siteId: site(0), initialVol: 10, expiryDate: "2027-04-30", receivedDate: "2026-05-08", events: [
        { type: "received", date: "2026-05-08", note: "Shipment SHP-BR-001 received intact" },
        { type: "removed", date: "2026-05-12", note: "Seal compromised on inspection — quarantined" },
      ] }));
      // LOT-BR-002 (3 vials, received 2026-06-09 — pending shipment SHP-BR-002)
      vials.push(mk({ id: "VL-BR-006", lotId: "LOT-BR-002", treatmentGroup: "Treatment A", status: "available", siteId: site(1), initialVol: 12, expiryDate: "2027-05-31", receivedDate: "2026-06-09", events: [
        { type: "received", date: "2026-06-09", note: "Second shipment received" },
        { type: "dispense", date: "2026-06-12", subject: sc(7), visit: "Day 0", volDispensed: 3.8, route: "SC injection", location: "farm", by: "L. Brandt" },
        { type: "return", date: "2026-06-12", volReturned: 8.2, condition: "Good — multidose vial" },
      ] }));
      vials.push(mk({ id: "VL-BR-007", lotId: "LOT-BR-002", treatmentGroup: "Treatment A", status: "available", siteId: site(2), initialVol: 12, expiryDate: "2027-05-31", receivedDate: "2026-06-09", events: [
        { type: "received", date: "2026-06-09", note: "Second shipment received" },
      ] }));
      vials.push(mk({ id: "VL-BR-008", lotId: "LOT-BR-002", treatmentGroup: "Control", status: "returned", siteId: site(3), initialVol: 12, expiryDate: "2027-05-31", receivedDate: "2026-06-09", events: [
        { type: "received", date: "2026-06-09", note: "Second shipment received" },
        { type: "removed", date: "2026-06-11", note: "Over-temperature excursion during transit — unusable" },
        { type: "returned", date: "2026-06-16", note: "Returned to BioVet Pharma per protocol" },
      ] }));
      shipments.push(
        { id: "SHP-BR-001", studyId: sid, lot: "LOT-BR-001", shipDate: "2026-05-06", receiveDate: "2026-05-08", vialCount: 5, usableCount: 4, confirmed: true },
        { id: "SHP-BR-002", studyId: sid, lot: "LOT-BR-002", shipDate: "2026-06-07", receiveDate: "2026-06-09", vialCount: 3, usableCount: 2, confirmed: false },
      );
    }
  }

  // ─── CA-0801 — blinded topical/oral kits (volume accountability) ──────────
  {
    const sid = studyId("CA-0801");
    if (sid) {
      const st = sitesOf("CA-0801");
      const subs = subjectsOf("CA-0801");
      const site = (i: number) => st[i % Math.max(1, st.length)]?.id ?? null;
      const sc = (i: number) => subs[i % Math.max(1, subs.length)]?.subject_code ?? `CA-${i + 1}`;
      const DOSE = 6; // expectedDailyDose ml/day (0.5 ml/kg × 12 kg)
      // Arm A = active topical, Arm B = vehicle. Drug names only surface for DM/Admin.
      const mk = (id: string, kit: string, group: "Treatment A" | "Treatment B", drug: string, status: Vial["status"], siteIx: number, expiry: string, events: VialEvent[]): Vial =>
        ({ id, studyId: sid, lotId: "LOT-CA-001", kitNumber: kit, drugName: drug, treatmentGroup: group, initialVol: 60, concentration: 1, unit: "ml", expiryDate: expiry, receivedDate: "2026-04-10", status, siteId: site(siteIx), expectedDailyDose: DOSE, events });

      // Three accountability demos (7-day interval, expected use = 6 × 7 = 42 ml):
      //   clean  ≤5% : used 41.0  → −2.4%
      //   minor 5-15%: used 45.4  → +8.1%
      //   major  >15%: used 49.6  → +18.1%
      const accountability = (sub: string, dispVol: number, retVol: number): VialEvent[] => ([
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
        { type: "dispense", date: "2026-05-15", subject: sub, visit: "Week 2", volDispensed: dispVol, route: "Topical", location: "home", by: "A. Reyes" },
        { type: "return", date: "2026-05-22", volReturned: retVol, condition: "Good — seal intact" },
      ]);
      vials.push(mk("VL-CA-A01", "Kit A-001", "Treatment A", "ARK-238 1% topical solution", "available", 0, "2027-03-31", accountability(sc(0), 60, 19.0))); // clean
      vials.push(mk("VL-CA-A02", "Kit A-002", "Treatment A", "ARK-238 1% topical solution", "available", 0, "2027-03-31", accountability(sc(1), 60, 14.6))); // minor (amber)
      vials.push(mk("VL-CA-A03", "Kit A-003", "Treatment A", "ARK-238 1% topical solution", "available", 1, "2027-03-31", accountability(sc(2), 60, 10.4))); // major (red)
      vials.push(mk("VL-CA-A04", "Kit A-004", "Treatment A", "ARK-238 1% topical solution", "athome", 1, "2027-03-31", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
        { type: "dispense", date: "2026-06-05", subject: sc(3), visit: "Week 4", volDispensed: 60, route: "Topical", location: "home", by: "A. Reyes" },
      ]));
      // Near-expiry kit (within 30 days of 2026-06-23 → triggers the amber nav alert).
      vials.push(mk("VL-CA-A05", "Kit A-005", "Treatment A", "ARK-238 1% topical solution", "available", 2, "2026-07-12", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
      ]));
      vials.push(mk("VL-CA-B01", "Kit B-001", "Treatment B", "Vehicle control (placebo)", "available", 0, "2027-03-31", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
      ]));
      vials.push(mk("VL-CA-B02", "Kit B-002", "Treatment B", "Vehicle control (placebo)", "depleted", 1, "2027-03-31", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
        { type: "dispense", date: "2026-05-15", subject: sc(4), visit: "Week 2", volDispensed: 60, route: "Topical", location: "home", by: "A. Reyes" },
        { type: "return", date: "2026-05-22", volReturned: 0, condition: "Good — kit emptied" },
      ]));
      vials.push(mk("VL-CA-B03", "Kit B-003", "Treatment B", "Vehicle control (placebo)", "available", 1, "2027-03-31", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
      ]));
      vials.push(mk("VL-CA-B04", "Kit B-004", "Treatment B", "Vehicle control (placebo)", "available", 2, "2027-03-31", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
      ]));
      vials.push(mk("VL-CA-B05", "Kit B-005", "Treatment B", "Vehicle control (placebo)", "removed", 2, "2027-03-31", [
        { type: "received", date: "2026-04-10", note: "Kit received — blinded" },
        { type: "removed", date: "2026-04-15", note: "Tamper seal broken — quarantined" },
      ]));
      shipments.push(
        { id: "SHP-CA-001", studyId: sid, lot: "LOT-CA-001", shipDate: "2026-04-08", receiveDate: "2026-04-10", vialCount: 10, usableCount: 9, confirmed: true },
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
