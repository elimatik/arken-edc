// ════════════════════════════════════════════════════════════════════════════
// Shared query helpers — the single source of truth for "how many queries need
// THIS role's action" (the sidenav badge) and the study-scoping / orphan-skip
// rules the Queries screen relies on. Kept tiny and dataset-pure so both the
// shell badge and the Queries page agree on the count.
// ════════════════════════════════════════════════════════════════════════════

import type { Dataset } from "./session-store/types";
import type { Role } from "./permissions";

// Which query statuses a role can still act on (→ the sidenav badge count):
//   CRC / PI  → only `open` (raised, awaiting their response)
//   CRA / DM  → `open` + `responded` (they can respond and resolve)
//   Sponsor / Admin → none (read-only)
export function actionableStatuses(role: Role): Set<string> {
  if (role === "Sponsor" || role === "Admin") return new Set();
  if (role === "CRA" || role === "DM") return new Set(["open", "responded"]);
  return new Set(["open"]); // CRC, PI
}

// Count of queries in the study that require the active role's action. Mirrors
// the Queries screen: study-scoped (via instance→form) and skips orphaned
// queries whose field value isn't in the dataset (session-46 hydration fix).
export function actionableQueryCount(dataset: Dataset, studyId: string, role: Role): number {
  const wants = actionableStatuses(role);
  if (wants.size === 0) return 0;
  const instById = new Map(dataset.formInstances.map((i) => [i.id, i]));
  const formById = new Map(dataset.forms.map((f) => [f.id, f]));
  const fvIds = new Set(dataset.fieldValues.map((v) => v.id));
  let n = 0;
  for (const q of dataset.queries) {
    if (!wants.has(q.status)) continue;
    if (!q.field_value_id || !fvIds.has(q.field_value_id)) continue; // orphan — skip
    const inst = instById.get(q.form_instance_id);
    if (!inst) continue;
    const form = formById.get(inst.form_id);
    if (!form || form.study_id !== studyId) continue;
    n += 1;
  }
  return n;
}
