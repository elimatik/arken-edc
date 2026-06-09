"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import { canQuery } from "@/lib/permissions";
import { DEMO_USER_ID } from "@/lib/constants";
import { evaluateField, rangeLabel } from "@/lib/forms/validation";
import type { Dataset, FormFieldRow } from "@/lib/session-store/types";
import "./subject-record.css";

interface Props {
  studyId: string;
  subjectId: string;
  initialFormId?: string;
}

const SPECIES_ICON: Record<string, string> = {
  cattle: "🐄",
  swine: "🐷",
  canine: "🐕",
  feline: "🐈",
  aquatic: "🐟",
  equine: "🐎",
};
const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  active: { cls: "status-randomized", label: "Active" },
  randomized: { cls: "status-randomized", label: "Randomized" },
  enrolled: { cls: "status-randomized", label: "Enrolled" },
  screening: { cls: "status-screened", label: "Screening" },
  completed: { cls: "status-completed", label: "Completed" },
  withdrawn: { cls: "status-screened", label: "Withdrawn" },
};

type SidebarIcon = "final" | "reviewed" | "inwork" | "empty" | "queried";
function iconForInstance(s: string | undefined): SidebarIcon {
  if (s === "finalized" || s === "locked") return "final";
  if (s === "reviewed") return "reviewed";
  if (s === "in_work") return "inwork";
  return "empty";
}
const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };
const newId = () => crypto.randomUUID();

export function SubjectRecord({ studyId, subjectId, initialFormId }: Props) {
  const router = useRouter();
  const { study, activeRole } = useShell();
  const { dataset, ready, update } = useStudySession();

  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(initialFormId);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [modeQueries, setModeQueries] = useState(true);
  const [modeSdv, setModeSdv] = useState(false);
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  const [panelFvId, setPanelFvId] = useState<string | null>(null); // query panel target
  const [deltaField, setDeltaField] = useState<{ name: string; code: string } | null>(null);

  const canSdv = activeRole === "CRA";
  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");

  if (!ready) {
    return (
      <div className="sr-screen">
        <div className="sr-loading"><i className="ti ti-loader-2"></i><span>Loading subject record…</span></div>
      </div>
    );
  }

  const subject = dataset.subjects.find((s) => s.id === subjectId);
  if (!subject) {
    return (
      <div className="sr-screen">
        <div className="sr-loading"><span>Subject not found in this session.</span></div>
      </div>
    );
  }
  const species = subject.species ?? "";

  // ─── Sidebar forms (store-derived) ─────────────────────────────────────────
  const studyForms = dataset.forms.filter((f) => f.study_id === studyId).slice().sort((a, b) => a.sequence - b.sequence);
  const sidebar = studyForms.map((f) => {
    const inst = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === f.id);
    const openQ = inst ? dataset.queries.filter((q) => q.form_instance_id === inst.id && (q.status === "open" || q.status === "responded")) : [];
    return { id: f.id, name: f.name, icon: (openQ.length ? "queried" : iconForInstance(inst?.status)) as SidebarIcon, queryCount: openQ.length };
  });

  const activeFormId = selectedFormId ?? sidebar[0]?.id;
  const selectedForm = studyForms.find((f) => f.id === activeFormId);
  const fields = dataset.formFields.filter((f) => f.form_id === activeFormId).slice().sort((a, b) => a.sequence - b.sequence);
  const instance = dataset.formInstances.find((i) => i.subject_id === subjectId && i.form_id === activeFormId);

  const fvFor = (fieldId: string) =>
    instance ? dataset.fieldValues.find((v) => v.form_instance_id === instance.id && v.form_field_id === fieldId) : undefined;
  const openQueryFor = (fvId: string | undefined) =>
    fvId ? dataset.queries.find((q) => q.field_value_id === fvId && (q.status === "open" || q.status === "responded")) : undefined;
  const sdvVerified = (fvId: string | undefined) =>
    fvId ? dataset.sdvRecords.some((r) => r.field_value_id === fvId && r.status === "verified") : false;

  const sdvFieldIds = fields.filter((f) => f.validation?.vital).map((f) => f.id);
  const verifiedCount = sdvFieldIds.filter((id) => sdvVerified(fvFor(id)?.id)).length;
  const sdvPct = sdvFieldIds.length ? Math.round((verifiedCount / sdvFieldIds.length) * 100) : 0;

  // ─── Write actions (all via update() — session only) ───────────────────────
  function setFieldValue(field: FormFieldRow, value: string) {
    update((d: Dataset) => {
      let inst = d.formInstances.find((i) => i.subject_id === subjectId && i.form_id === field.form_id);
      if (!inst) {
        inst = { id: newId(), form_id: field.form_id, subject_id: subjectId, status: "in_work" };
        d.formInstances.push(inst);
      } else if (inst.status === "empty") {
        inst.status = "in_work";
      }
      let fv = d.fieldValues.find((v) => v.form_instance_id === inst!.id && v.form_field_id === field.id);
      if (!fv) {
        fv = { id: newId(), form_instance_id: inst.id, form_field_id: field.id, value };
        d.fieldValues.push(fv);
      } else {
        fv.value = value;
      }
      // Live edit-check: out of range → raise/keep an open query; back in range → resolve it.
      const check = evaluateField(field, value, species, d.speciesRanges);
      const existing = d.queries.find((q) => q.field_value_id === fv!.id && (q.status === "open" || q.status === "responded"));
      if (check) {
        if (!existing) {
          const qid = newId();
          d.queries.push({ id: qid, form_instance_id: inst.id, field_value_id: fv.id, status: "open", title: check.message });
          const unit = field.unit ? ` ${field.unit}` : "";
          d.queryMessages.push({
            id: newId(),
            query_id: qid,
            author_id: DEMO_USER_ID,
            body: `Auto edit-check: ${field.label} ${value}${unit} is outside the expected range (${check.range.min}–${check.range.max}${unit}) for ${species}. Please verify against the source document.`,
            created_at: new Date().toISOString(),
          });
        } else {
          existing.title = check.message;
        }
      } else if (existing) {
        existing.status = "resolved";
      }
    });
    setEdited((e) => ({ ...e, [field.id]: true }));
  }

  function toggleSdv(field: FormFieldRow) {
    if (!canSdv) return;
    const fv = fvFor(field.id);
    if (!fv) return; // nothing entered to verify
    update((d: Dataset) => {
      const rec = d.sdvRecords.find((r) => r.field_value_id === fv.id);
      if (rec) rec.status = rec.status === "verified" ? "pending" : "verified";
      else d.sdvRecords.push({ id: newId(), form_instance_id: fv.form_instance_id, field_value_id: fv.id, status: "verified" });
    });
  }

  function respondQuery(queryId: string) {
    update((d: Dataset) => {
      const q = d.queries.find((x) => x.id === queryId);
      if (!q) return;
      q.status = "responded";
      d.queryMessages.push({ id: newId(), query_id: queryId, author_id: DEMO_USER_ID, body: `Response from ${activeRole}.`, created_at: new Date().toISOString() });
    });
  }
  function resolveQuery(queryId: string) {
    update((d: Dataset) => {
      const q = d.queries.find((x) => x.id === queryId);
      if (q) q.status = "resolved";
    });
    setPanelFvId(null);
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const statusInfo = STATUS_MAP[subject.status] || { cls: "status-screened", label: subject.status };
  const panelQuery = openQueryFor(panelFvId ?? undefined);
  const panelMsgs = panelQuery ? dataset.queryMessages.filter((m) => m.query_id === panelQuery.id).slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : [];

  function renderControl(field: FormFieldRow, value: string, queried: boolean) {
    const onChange = (v: string) => setFieldValue(field, v);
    if (field.field_type === "textarea") {
      return <textarea className="field-input" style={{ height: 60, fontFamily: "var(--font-sans)" }} value={value} onChange={(e) => onChange(e.target.value)} />;
    }
    if (["select", "radio", "multiselect", "checkbox"].includes(field.field_type)) {
      return (
        <select className="field-select" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    const mono = field.field_type === "number" || field.field_type === "integer" || field.field_type === "date" || field.field_type === "datetime";
    return (
      <input
        className={`field-input${queried ? " query" : ""}`}
        style={mono ? undefined : { fontFamily: "var(--font-sans)" }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <div className="sr-screen">
      {/* Form sidebar */}
      <nav className="form-sidebar" aria-label="Forms">
        <div className="sidebar-label">Forms</div>
        {sidebar.map((f) => (
          <button
            key={f.id}
            className={`form-item${f.id === activeFormId ? " active" : ""}${f.icon === "final" ? " done" : ""}`}
            onClick={() => setSelectedFormId(f.id)}
            type="button"
          >
            <span className="form-item-label">{f.name}</span>
            <div className="form-item-right">
              {f.queryCount > 0 && <span className="issue-badge warning">{f.queryCount}</span>}
              {f.icon === "final" ? (
                <div className="status-final"><i className="ti ti-check"></i></div>
              ) : (
                <div className={`status-${f.icon}`}></div>
              )}
            </div>
          </button>
        ))}
      </nav>

      {/* Form content */}
      <div className="form-content">
        <div className="form-sticky-header">
          <nav className="sr-bc" aria-label="Breadcrumb">
            <button className="bc-btn" onClick={() => router.push(`/study/${studyId}/data-entry`)} type="button"><span>Data Entry</span></button>
            <span className="bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
            <span className="bc-btn"><span>{study.code}</span></span>
            <span className="bc-sep"><i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i></span>
            <span>{subject.subject_code}</span>
          </nav>

          <div className="subject-header">
            <div className="species-icon">{SPECIES_ICON[species] || "🔬"}</div>
            <span className="subject-id">{subject.subject_code}</span>
            <span className={`subject-status ${statusInfo.cls}`}>{statusInfo.label}</span>
            <div className="subject-meta">
              <span className="meta-item">{species.charAt(0).toUpperCase() + species.slice(1)}</span>
              {subject.randomization_arm && (
                <>
                  <span className="meta-sep">·</span>
                  <span className="meta-item group">{subject.randomization_arm}</span>
                </>
              )}
            </div>
            <div className="subject-actions">
              <button className="btn-secondary" type="button">Manage <i className="ti ti-chevron-down" style={{ fontSize: "12px" }}></i></button>
            </div>
          </div>

          <div className={`sdv-progress-row${modeSdv ? " visible" : ""}`}>
            <i className="ti ti-shield-check-filled" style={{ fontSize: "14px", flexShrink: 0 }}></i>
            <span>SDV mode active</span>
            <div className="sdv-progress-bar"><div className="sdv-progress-fill" style={{ width: `${sdvPct}%` }}></div></div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-medium)" }}>{verifiedCount}/{sdvFieldIds.length} verified</span>
          </div>

          <div className="form-header">
            <h1 className="form-title">{selectedForm?.name || "Form"}</h1>
            <div className="form-actions">
              <div className="remarks-wrap">
                <button className="btn-secondary" onClick={() => setRemarksOpen((o) => !o)} type="button">
                  Remarks: {[modeQueries && "Queries", modeSdv && "SDV mode"].filter(Boolean).join(", ") || "Off"}
                  <i className="ti ti-chevron-down" style={{ fontSize: "11px", color: "var(--color-text-tertiary)" }}></i>
                </button>
                <div className={`remarks-menu${remarksOpen ? " open" : ""}`}>
                  <div className="remarks-section-label">Activate mode</div>
                  <button className={`remarks-item${modeQueries ? " active-mode" : ""}`} onClick={() => setModeQueries((m) => !m)} type="button">
                    <span>Queries</span>{modeQueries && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                  </button>
                  <button className={`remarks-item${modeSdv ? " active-mode" : ""}`} onClick={() => setModeSdv((m) => !m)} type="button">
                    <span>SDV mode</span>{modeSdv && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                  </button>
                </div>
              </div>
              <button className="btn-secondary" type="button">Submit for review</button>
              <button className="btn-primary" type="button">Run validations</button>
            </div>
          </div>
        </div>

        {/* Form body — real fields from form_fields */}
        <div className="form-body">
          <div className="field-grid-2">
            {fields.map((field) => {
              const fv = fvFor(field.id);
              const value = fv?.value ?? "";
              const query = openQueryFor(fv?.id);
              const queried = !!query;
              const verified = sdvVerified(fv?.id);
              const hint = rangeLabel(field, species, dataset.speciesRanges);
              const isWide = field.field_type === "textarea";
              return (
                <div className={`field${isWide ? " full" : ""}`} key={field.id}>
                  <label className="field-label">
                    {field.label}
                    {field.is_required && <span style={{ color: "var(--red-600)" }}> *</span>}
                    {field.unit ? <span style={{ color: "var(--color-text-tertiary)" }}> ({field.unit})</span> : null}
                  </label>
                  <div className="field-row">
                    {renderControl(field, value, queried)}
                    {field.validation?.vital && (
                      <button
                        className={`sdv-btn${modeSdv ? " visible" : ""}${verified ? " verified" : ""}`}
                        onClick={() => toggleSdv(field)}
                        title={canSdv ? (verified ? "SDV verified — click to undo" : "SDV: click to verify") : "SDV verify — CRA only"}
                        type="button"
                      >
                        <i className={`ti ${verified ? "ti-shield-check-filled" : "ti-shield"}`}></i>
                      </button>
                    )}
                    <button
                      className={`delta-btn${edited[field.id] ? " visible" : ""}`}
                      onClick={() => setDeltaField({ name: field.label, code: field.code.toUpperCase() })}
                      title="Change reason"
                      type="button"
                    >
                      Δ
                    </button>
                    <button
                      className={`flag-btn${queried ? " flagged" : ""}`}
                      onClick={queried && fv ? () => setPanelFvId(fv.id) : undefined}
                      title={queried ? "Query open — click to view" : "No open query"}
                      type="button"
                    >
                      <i className={`ti ${queried ? "ti-flag-filled" : "ti-flag"}`}></i>
                    </button>
                  </div>
                  {queried && fv ? (
                    <div className="field-state state-query">
                      <i className="ti ti-info-circle"></i>
                      <span className="query-link" onClick={() => setPanelFvId(fv.id)}>{query!.title}</span>
                    </div>
                  ) : (
                    hint && <span className="field-hint">{hint}</span>
                  )}
                  {modeSdv && verified && <span className="sdv-verified-note">Verified by E. Tron · 2026-05-09</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Query thread panel */}
      <div className={`panel-overlay${panelFvId ? " open" : ""}`} onClick={() => setPanelFvId(null)}></div>
      <div className={`slide-panel${panelFvId ? " open" : ""}`}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Query thread</div>
            <div className="panel-title-meta">
              <span className="query-id">{panelQuery ? panelQuery.id.slice(0, 8) : "—"}</span>
              <span className={`query-status ${QS_CLS[panelQuery?.status || "open"] || "qs-open"}`}>
                {(panelQuery?.status || "open").charAt(0).toUpperCase() + (panelQuery?.status || "open").slice(1)}
              </span>
            </div>
          </div>
          <button className="panel-close" onClick={() => setPanelFvId(null)} type="button"><i className="ti ti-x"></i></button>
        </div>
        <div className="field-context">
          <div className="fc-label">Query</div>
          <div className="fc-field">{panelQuery?.title}</div>
        </div>
        <div className="thread-body">
          {panelMsgs.map((m) => (
            <div className="message" key={m.id}>
              <div className="msg-header">
                <div className="msg-avatar av-auto">EC</div>
                <span className="msg-author">Edit check</span>
                <span className="msg-role">· Auto</span>
              </div>
              <div className="msg-bubble">{m.body}</div>
            </div>
          ))}
        </div>
        <div className="compose-area">
          {canRespond || canResolve ? (
            <>
              <div className="compose-context"><i className="ti ti-user-circle"></i> Acting as {activeRole}</div>
              <textarea className="compose-textarea" placeholder="Add a response…"></textarea>
              <div className="compose-btns">
                <span className="compose-sub">Shift+Enter for new line</span>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {canRespond && panelQuery && <button className="btn-respond" type="button" onClick={() => respondQuery(panelQuery.id)}>Respond</button>}
                  {canResolve && panelQuery && <button className="btn-respond" type="button" onClick={() => resolveQuery(panelQuery.id)}>Resolve</button>}
                </div>
              </div>
            </>
          ) : (
            <div className="sr-perm-note"><i className="ti ti-lock"></i> Your role ({activeRole}) has no query actions — read only.</div>
          )}
        </div>
      </div>

      {/* Delta change-reason panel */}
      <div className={`panel-overlay${deltaField ? " open" : ""}`} onClick={() => setDeltaField(null)}></div>
      <div className={`slide-panel delta${deltaField ? " open" : ""}`}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Change reason</div>
            <div className="panel-title-meta"><span className="query-status qs-open">Change reason required</span></div>
          </div>
          <button className="panel-close" onClick={() => setDeltaField(null)} type="button"><i className="ti ti-x"></i></button>
        </div>
        <div className="delta-context">
          <div className="fc-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span className="fc-field">{deltaField?.name}</span>
            <span className="fc-code">{deltaField?.code}</span>
          </div>
        </div>
        <div className="delta-thread">A change reason is required for any edit after initial entry (21 CFR Part 11).</div>
        <div className="compose-area">
          <div className="compose-context"><i className="ti ti-user-circle"></i> Acting as {activeRole} — explain the reason for this change</div>
          <textarea className="compose-textarea" placeholder="Enter reason for change…"></textarea>
          <div className="compose-btns">
            <span className="compose-sub">Shift+Enter for new line</span>
            <button className="btn-respond" type="button" onClick={() => setDeltaField(null)}>Submit reason</button>
          </div>
        </div>
      </div>
    </div>
  );
}
