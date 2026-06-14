"use client";

// ════════════════════════════════════════════════════════════════════════════
// Barn / House Record — the house-level counterpart to the Subject Record.
// Some forms belong to the HOUSE, not the pen (PH-2401's Daily Environmental Log
// is recorded once per house per day, not per pen). Those forms carry scope='barn'
// and their instances are keyed by barn_id (subject_id null). This page renders
// them — a daily-log table + an editable detail panel with live environmental
// edit checks (ammonia / temperature / humidity / CO₂ against species_ranges and
// the form's static bounds). Reachable from Data Entry → "Open house record".
// ════════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { evaluateField } from "@/lib/forms/validation";
import type { Dataset, FormFieldRow } from "@/lib/session-store/types";

const card: React.CSSProperties = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border, #e5e7eb)",
  borderRadius: "var(--radius-md, 8px)",
  padding: "var(--space-4, 16px)",
};

export default function BarnRecordPage() {
  const params = useParams();
  const router = useRouter();
  const studyId = String(params.studyId);
  const barnId = String(params.barnId);
  const { dataset, ready, update } = useStudySession();
  const [selFormId, setSelFormId] = useState<string | null>(null);
  const [selInstId, setSelInstId] = useState<string | null>(null);

  const barn = dataset.barns.find((b) => b.id === barnId);
  const site = dataset.sites.find((s) => s.id === barn?.site_id);
  const study = dataset.studies.find((s) => s.id === studyId);
  const species = study?.species ?? "chicken";

  const barnForms = useMemo(
    () => dataset.forms.filter((f) => f.study_id === studyId && f.scope === "barn").slice().sort((a, b) => a.sequence - b.sequence),
    [dataset.forms, studyId],
  );
  const form = barnForms.find((f) => f.id === selFormId) ?? barnForms[0];
  const fields = useMemo(
    () => dataset.formFields.filter((f) => f.form_id === form?.id).slice().sort((a, b) => a.sequence - b.sequence),
    [dataset.formFields, form?.id],
  );
  const instances = useMemo(
    () => dataset.formInstances.filter((i) => i.form_id === form?.id && i.barn_id === barnId),
    [dataset.formInstances, form?.id, barnId],
  );
  const inst = instances.find((i) => i.id === selInstId) ?? instances[0];

  if (!ready) return <div style={{ padding: "var(--space-6,24px)" }}>Loading house record…</div>;
  if (!barn) return <div style={{ padding: "var(--space-6,24px)" }}>House not found.</div>;

  const valueOf = (instId: string, fieldId: string) =>
    dataset.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === fieldId)?.value ?? "";

  const fieldByCode = (code: string) => fields.find((f) => f.code === code);
  const cellEC = (instId: string, code: string) => {
    const f = fieldByCode(code);
    if (!f) return null;
    return evaluateField(f, valueOf(instId, f.id), species, dataset.speciesRanges);
  };

  function setValue(instId: string, field: FormFieldRow, value: string) {
    update((d: Dataset) => {
      const row = d.fieldValues.find((v) => v.form_instance_id === instId && v.form_field_id === field.id);
      if (row) row.value = value;
      else d.fieldValues.push({ id: crypto.randomUUID(), form_instance_id: instId, form_field_id: field.id, value });
      const fi = d.formInstances.find((i) => i.id === instId);
      if (fi && fi.status === "empty") fi.status = "in_work";
    });
  }
  function addLog() {
    if (!form) return;
    const id = crypto.randomUUID();
    update((d: Dataset) => {
      d.formInstances.push({ id, form_id: form.id, subject_id: null, barn_id: barnId, status: "in_work" });
    });
    setSelInstId(id);
  }

  const logDateCode = fields.find((f) => f.field_type === "date")?.code ?? "log_date";

  return (
    <div style={{ padding: "var(--space-6, 24px)", display: "flex", flexDirection: "column", gap: "var(--space-4,16px)" }}>
      {/* Header */}
      <div>
        <button className="btn-secondary" type="button" onClick={() => router.push(`/study/${studyId}/data-entry`)} style={{ marginBottom: "var(--space-3,12px)" }}>
          <i className="ti ti-arrow-left"></i> Back to Data Entry
        </button>
        <h1 style={{ margin: 0, fontSize: "var(--text-xl,1.25rem)" }}>
          <i className="ti ti-building-warehouse" style={{ marginRight: 8 }}></i>{barn.name}
        </h1>
        <div className="muted" style={{ fontSize: "var(--text-sm,0.875rem)", marginTop: 4 }}>
          House record · {site?.name ?? "—"} · {study?.code} · capacity {barn.code}
        </div>
      </div>

      <div style={{ ...card, background: "var(--color-surface-alt, #f8fafc)" }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6 }}></i>
        <strong>House-level forms.</strong> These are recorded once per house (not per pen) and do <em>not</em> appear in the pen record sidebar.
      </div>

      {!form ? (
        <div style={card}>No house-level forms for this study.</div>
      ) : (
        <>
          {/* Form selector (one+ barn forms) */}
          {barnForms.length > 1 && (
            <div style={{ display: "flex", gap: "var(--space-2,8px)" }}>
              {barnForms.map((f) => (
                <button key={f.id} type="button" className={f.id === form.id ? "btn-primary" : "btn-secondary"} onClick={() => { setSelFormId(f.id); setSelInstId(null); }}>
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {/* Daily log table */}
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3,12px)" }}>
              <h2 style={{ margin: 0, fontSize: "var(--text-lg,1.05rem)" }}>{form.name}</h2>
              <button className="btn-primary" type="button" onClick={addLog}><i className="ti ti-plus"></i> New daily log</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm,0.875rem)" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border,#e5e7eb)" }}>
                  <th style={{ padding: "8px" }}>Log date</th>
                  <th style={{ padding: "8px" }}>AM °C</th>
                  <th style={{ padding: "8px" }}>PM °C</th>
                  <th style={{ padding: "8px" }}>NH₃ ppm</th>
                  <th style={{ padding: "8px" }}>Status</th>
                  <th style={{ padding: "8px" }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {instances.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "12px", color: "var(--color-text-muted,#6b7280)" }}>No daily logs yet.</td></tr>
                ) : instances.map((i) => {
                  const flags = ["temp_morning", "temp_evening", "rh_morning", "rh_evening", "co2_ppm", "ammonia_ppm"]
                    .map((c) => cellEC(i.id, c)).filter(Boolean).length;
                  const isSel = i.id === inst?.id;
                  return (
                    <tr key={i.id} onClick={() => setSelInstId(i.id)} style={{ cursor: "pointer", borderBottom: "1px solid var(--color-border,#f1f5f9)", background: isSel ? "var(--color-surface-alt,#f8fafc)" : undefined }}>
                      <td style={{ padding: "8px", fontFamily: "var(--font-mono, monospace)" }}>{valueOf(i.id, fieldByCode(logDateCode)?.id ?? "") || "—"}</td>
                      <td style={{ padding: "8px" }}>{valueOf(i.id, fieldByCode("temp_morning")?.id ?? "") || "—"}</td>
                      <td style={{ padding: "8px" }}>{valueOf(i.id, fieldByCode("temp_evening")?.id ?? "") || "—"}</td>
                      <td style={{ padding: "8px" }}>{valueOf(i.id, fieldByCode("ammonia_ppm")?.id ?? "") || "—"}</td>
                      <td style={{ padding: "8px" }}><span className="badge">{i.status}</span></td>
                      <td style={{ padding: "8px" }}>{flags > 0 ? <span style={{ color: "var(--color-warning,#b45309)", fontWeight: 600 }}><i className="ti ti-alert-triangle"></i> {flags}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Detail editor for the selected log */}
          {inst && (
            <div style={card}>
              <h3 style={{ marginTop: 0, fontSize: "var(--text-base,1rem)" }}>Log detail</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "var(--space-3,12px)" }}>
                {fields.map((field) => {
                  const v = valueOf(inst.id, field.id);
                  const ec = evaluateField(field, v, species, dataset.speciesRanges);
                  const opts = field.options ?? [];
                  return (
                    <div key={field.id} style={{ gridColumn: field.field_type === "textarea" ? "1 / -1" : undefined }}>
                      <label style={{ display: "block", fontSize: "var(--text-xs,0.75rem)", color: "var(--color-text-muted,#6b7280)", marginBottom: 4 }}>
                        {field.label}{field.is_required && <span style={{ color: "var(--color-danger,#dc2626)" }}> *</span>}{field.unit ? ` (${field.unit})` : ""}
                      </label>
                      {field.field_type === "textarea" ? (
                        <textarea value={v} onChange={(e) => setValue(inst.id, field, e.target.value)} rows={2} style={{ width: "100%", padding: "6px 8px", border: `1px solid ${ec ? "var(--color-warning,#f59e0b)" : "var(--color-border,#e5e7eb)"}`, borderRadius: 6 }} />
                      ) : opts.length > 0 ? (
                        <select value={v} onChange={(e) => setValue(inst.id, field, e.target.value)} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--color-border,#e5e7eb)", borderRadius: 6 }}>
                          <option value="">—</option>
                          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input
                          type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
                          value={v}
                          onChange={(e) => setValue(inst.id, field, e.target.value)}
                          style={{ width: "100%", padding: "6px 8px", border: `1px solid ${ec ? "var(--color-warning,#f59e0b)" : "var(--color-border,#e5e7eb)"}`, borderRadius: 6 }}
                        />
                      )}
                      {ec && (
                        <div style={{ marginTop: 4, fontSize: "var(--text-xs,0.75rem)", color: "var(--color-warning,#b45309)", display: "flex", gap: 4, alignItems: "center" }}>
                          <i className="ti ti-alert-triangle"></i> {ec.message}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
