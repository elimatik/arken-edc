"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useShell } from "@/components/shell/ShellContext";
import { canQuery } from "@/lib/permissions";
import "./subject-record.css";

interface Props {
  studyId: string;
  subjectId: string;
  initialFormId?: string;
}

interface SidebarForm {
  id: string;
  name: string;
  icon: "final" | "reviewed" | "inwork" | "empty" | "queried";
  queryCount: number;
}

interface QueryThread {
  id: string;
  title: string;
  status: string; // open | responded | resolved
  messages: { author: string; role: string; av: string; avCls: string; body: string }[];
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

// instance_status → sidebar status icon
function iconForInstance(s: string | undefined): SidebarForm["icon"] {
  if (s === "finalized" || s === "locked") return "final";
  if (s === "reviewed") return "reviewed";
  if (s === "in_work") return "inwork";
  return "empty";
}

const QS_CLS: Record<string, string> = { open: "qs-open", responded: "qs-responded", resolved: "qs-resolved" };

export function SubjectRecord({ studyId, subjectId, initialFormId }: Props) {
  const router = useRouter();
  const { study, activeRole } = useShell();

  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState<any>(null);
  const [forms, setForms] = useState<SidebarForm[]>([]);
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(initialFormId);
  const [thread, setThread] = useState<QueryThread | null>(null);

  // UI state
  const [remarksOpen, setRemarksOpen] = useState(false);
  const [modeQueries, setModeQueries] = useState(true);
  const [modeSdv, setModeSdv] = useState(false);
  const [verified, setVerified] = useState<Record<string, boolean>>({ heart: true });
  const [edited, setEdited] = useState<Record<string, boolean>>({});
  const [queryOpen, setQueryOpen] = useState(false);
  const [deltaOpen, setDeltaOpen] = useState(false);
  const [deltaField, setDeltaField] = useState<{ name: string; code: string } | null>(null);

  const canSdv = activeRole === "CRA"; // SDV verify is a CRA action
  const canRespond = canQuery(activeRole, "respond");
  const canResolve = canQuery(activeRole, "resolve");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: subj } = await supabase
        .from("subjects")
        .select("id, subject_code, species, status, randomization_arm")
        .eq("id", subjectId)
        .maybeSingle();

      const { data: formRows } = await supabase
        .from("forms")
        .select("id, code, name, sequence")
        .eq("study_id", studyId)
        .order("sequence");

      const { data: instRows } = await supabase
        .from("form_instances")
        .select("id, status, form_id")
        .eq("subject_id", subjectId);

      const instances = instRows ?? [];
      const instanceIds = instances.map((i) => i.id);

      let queryRows: any[] = [];
      if (instanceIds.length) {
        const { data } = await supabase
          .from("queries")
          .select("id, status, title, form_instance_id")
          .in("form_instance_id", instanceIds);
        queryRows = data ?? [];
      }
      const openQueries = queryRows.filter((q) => q.status === "open" || q.status === "responded");

      // Sidebar forms: status icon from the instance, query badge from open queries.
      const sidebar: SidebarForm[] = (formRows ?? []).map((f) => {
        const inst = instances.find((i) => i.form_id === f.id);
        const formQueries = openQueries.filter((q) => q.form_instance_id === inst?.id);
        return {
          id: f.id,
          name: f.name,
          icon: formQueries.length ? "queried" : iconForInstance(inst?.status),
          queryCount: formQueries.length,
        };
      });

      // Build the query thread for the first open query (live messages where available).
      let qThread: QueryThread | null = null;
      const firstOpen = openQueries[0];
      if (firstOpen) {
        const { data: msgs } = await supabase
          .from("query_messages")
          .select("body, created_at, author_id")
          .eq("query_id", firstOpen.id)
          .order("created_at");
        qThread = {
          id: firstOpen.id,
          title: firstOpen.title,
          status: firstOpen.status,
          messages: (msgs ?? []).map((m) => ({
            author: "E. Tron",
            role: "CRC",
            av: "ET",
            avCls: "av-crc",
            body: m.body,
          })),
        };
      }

      if (cancelled) return;
      setSubject(subj);
      setForms(sidebar);
      setThread(qThread);
      setSelectedFormId((cur) => cur ?? sidebar[0]?.id);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [studyId, subjectId]);

  function openQueryPanel() {
    setQueryOpen(true);
  }
  function openDeltaPanel(name: string, code: string) {
    setDeltaField({ name, code });
    setDeltaOpen(true);
  }
  function onFieldChange(key: string) {
    setEdited((e) => ({ ...e, [key]: true }));
  }
  function toggleSdvField(key: string) {
    if (!canSdv) return;
    setVerified((v) => ({ ...v, [key]: !v[key] }));
  }

  if (loading) {
    return (
      <div className="sr-screen">
        <div className="sr-loading">
          <i className="ti ti-loader-2"></i>
          <span>Loading subject record…</span>
        </div>
      </div>
    );
  }

  const selectedForm = forms.find((f) => f.id === selectedFormId);
  const speciesIcon = SPECIES_ICON[subject?.species] || "🔬";
  const status = STATUS_MAP[subject?.status] || { cls: "status-screened", label: subject?.status };
  const sdvFields = ["temp", "heart", "resp", "weight", "gc", "nd", "cough", "brd"];
  const verifiedCount = sdvFields.filter((k) => verified[k]).length;
  const sdvPct = Math.round((verifiedCount / sdvFields.length) * 100);

  // ─── A single field row (illustrative content) ─────────────────────────────
  function fieldRow(
    key: string,
    label: string,
    value: string,
    opts: { query?: boolean; hint?: string; select?: string[]; required?: boolean; deltaCode?: string } = {},
  ) {
    return (
      <div className="field">
        <label className="field-label">
          {label} {opts.required && <span style={{ color: "var(--red-600)" }}>*</span>}
        </label>
        <div className="field-row">
          {opts.select ? (
            <select className="field-select" defaultValue={value} onChange={() => onFieldChange(key)}>
              {opts.select.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <input
              className={`field-input${opts.query ? " query" : ""}`}
              defaultValue={value}
              onChange={() => onFieldChange(key)}
            />
          )}
          {/* SDV verify — shield, visible in SDV mode (CRA only can toggle) */}
          <button
            className={`sdv-btn${modeSdv ? " visible" : ""}${verified[key] ? " verified" : ""}`}
            onClick={() => toggleSdvField(key)}
            title={canSdv ? (verified[key] ? "SDV verified — click to undo" : "SDV: click to verify") : "SDV verify — CRA only"}
            type="button"
          >
            <i className={`ti ${verified[key] ? "ti-shield-check-filled" : "ti-shield"}`}></i>
          </button>
          {/* Delta change-reason — appears once the field is edited */}
          <button
            className={`delta-btn${edited[key] ? " visible" : ""}`}
            onClick={() => openDeltaPanel(label, opts.deltaCode || key.toUpperCase())}
            title="Change reason required"
            type="button"
          >
            Δ
          </button>
          {/* Inline query flag */}
          <button
            className={`flag-btn${opts.query ? " flagged" : ""}`}
            onClick={opts.query ? openQueryPanel : undefined}
            title={opts.query ? "Query open — click to view" : "No open query"}
            type="button"
          >
            <i className={`ti ${opts.query ? "ti-flag-filled" : "ti-flag"}`}></i>
          </button>
        </div>
        {opts.query ? (
          <div className="field-state state-query">
            <i className="ti ti-info-circle"></i>
            <span className="query-link" onClick={openQueryPanel}>
              {thread ? `${thread.title}` : "Value outside expected range — verify."}
            </span>
          </div>
        ) : (
          opts.hint && <span className="field-hint">{opts.hint}</span>
        )}
        {/* SDV verified note — shown in SDV mode for a verified field */}
        {modeSdv && verified[key] && (
          <span className="sdv-verified-note">Verified by E. Tron · 2026-05-09</span>
        )}
      </div>
    );
  }

  return (
    <div className="sr-screen">
      {/* ── Form sidebar ── */}
      <nav className="form-sidebar" aria-label="Forms">
        <div className="sidebar-label">Forms</div>
        {forms.length === 0 && <div style={{ padding: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>No forms</div>}
        {forms.map((f) => (
          <button
            key={f.id}
            className={`form-item${f.id === selectedFormId ? " active" : ""}${f.icon === "final" ? " done" : ""}`}
            onClick={() => setSelectedFormId(f.id)}
            type="button"
          >
            <span className="form-item-label">{f.name}</span>
            <div className="form-item-right">
              {f.queryCount > 0 && <span className="issue-badge warning">{f.queryCount}</span>}
              {f.icon === "final" ? (
                <div className="status-final">
                  <i className="ti ti-check"></i>
                </div>
              ) : (
                <div className={`status-${f.icon}`}></div>
              )}
            </div>
          </button>
        ))}
      </nav>

      {/* ── Form content ── */}
      <div className="form-content">
        <div className="form-sticky-header">
          {/* Breadcrumb */}
          <nav className="sr-bc" aria-label="Breadcrumb">
            <button className="bc-btn" onClick={() => router.push(`/study/${studyId}/data-entry`)} type="button">
              <span>Data Entry</span>
            </button>
            <span className="bc-sep">
              <i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i>
            </span>
            <span className="bc-btn">
              <span>{study.code}</span>
            </span>
            <span className="bc-sep">
              <i className="ti ti-chevron-right" style={{ fontSize: "11px" }}></i>
            </span>
            <span>{subject?.subject_code}</span>
          </nav>

          {/* Subject header */}
          <div className="subject-header">
            <div className="species-icon">{speciesIcon}</div>
            <span className="subject-id">{subject?.subject_code}</span>
            <span className={`subject-status ${status.cls}`}>{status.label}</span>
            <div className="subject-meta">
              <span className="meta-item">{(subject?.species || "").charAt(0).toUpperCase() + (subject?.species || "").slice(1)}</span>
              {subject?.randomization_arm && (
                <>
                  <span className="meta-sep">·</span>
                  <span className="meta-item group">{subject.randomization_arm}</span>
                </>
              )}
            </div>
            <div className="subject-actions">
              <button className="btn-secondary" type="button">
                Manage <i className="ti ti-chevron-down" style={{ fontSize: "12px" }}></i>
              </button>
            </div>
          </div>

          {/* SDV progress (visible in SDV mode) */}
          <div className={`sdv-progress-row${modeSdv ? " visible" : ""}`}>
            <i className="ti ti-shield-check-filled" style={{ fontSize: "14px", flexShrink: 0 }}></i>
            <span>SDV mode active</span>
            <div className="sdv-progress-bar">
              <div className="sdv-progress-fill" style={{ width: `${sdvPct}%` }}></div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: "var(--weight-medium)" }}>
              {verifiedCount}/{sdvFields.length} verified
            </span>
          </div>

          {/* Form header + remarks dropdown */}
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
                    <span>Queries</span>
                    {modeQueries && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                  </button>
                  <button className={`remarks-item${modeSdv ? " active-mode" : ""}`} onClick={() => setModeSdv((m) => !m)} type="button">
                    <span>SDV mode</span>
                    {modeSdv && <i className="ti ti-check" style={{ fontSize: "13px", color: "var(--blue-600)" }}></i>}
                  </button>
                </div>
              </div>
              <button className="btn-secondary" type="button">Submit for review</button>
              <button className="btn-primary" type="button">Run validations</button>
            </div>
          </div>
        </div>

        {/* Scrollable form body — illustrative fields (schema has no field defs yet) */}
        <div className="form-body">
          <div>
            <div className="section-title">Vital signs</div>
            <div className="field-grid-4">
              {fieldRow("temp", "Rectal temperature", "28.5", { query: true, required: true, deltaCode: "RECTAL_TEMP" })}
              {fieldRow("heart", "Heart rate", "64", { hint: "Normal: 50–80 bpm", required: true, deltaCode: "HEART_RATE" })}
              {fieldRow("resp", "Respiratory rate", "24", { hint: "Normal: 12–36 bpm", required: true })}
              {fieldRow("weight", "Body weight", "400", { hint: "kg · Baseline: 400 kg", required: true })}
            </div>
          </div>
          <div>
            <div className="section-title">Physical examination</div>
            <div className="field-grid-3">
              {fieldRow("gc", "General condition", "Normal — BAR", { select: ["Normal — BAR", "Mild depression", "Moderate depression", "Severe depression"], required: true })}
              {fieldRow("nd", "Nasal discharge", "None", { select: ["None", "Serous (clear)", "Mucopurulent", "Purulent"] })}
              {fieldRow("cough", "Cough", "Absent", { select: ["Absent", "Present — occasional", "Present — frequent"] })}
              {fieldRow("brd", "BRD score", "1", { hint: "≥ 4 = pull threshold", required: true })}
            </div>
          </div>
          <div className="sr-perm-note">
            <i className="ti ti-info-circle"></i>
            Field content is illustrative — the schema has no field definitions yet. Forms, status, and the query are live.
          </div>
        </div>
      </div>

      {/* ── Query thread slide panel ── */}
      <div className={`panel-overlay${queryOpen ? " open" : ""}`} onClick={() => setQueryOpen(false)}></div>
      <div className={`slide-panel${queryOpen ? " open" : ""}`}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Query thread</div>
            <div className="panel-title-meta">
              <span className="query-id">{thread ? thread.id.slice(0, 8) : "—"}</span>
              <span className={`query-status ${QS_CLS[thread?.status || "open"] || "qs-open"}`}>
                {(thread?.status || "open").charAt(0).toUpperCase() + (thread?.status || "open").slice(1)}
              </span>
            </div>
          </div>
          <button className="panel-close" onClick={() => setQueryOpen(false)} type="button">
            <i className="ti ti-x"></i>
          </button>
        </div>
        <div className="field-context">
          <div className="fc-label">Field</div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <span className="fc-field">Rectal temperature</span>
            <span className="fc-code">RECTAL_TEMP</span>
          </div>
        </div>
        <div className="thread-body">
          {(thread?.messages.length ? thread.messages : [{ author: "Edit check", role: "Auto", av: "AU", avCls: "av-auto", body: thread?.title || "Value outside expected range — verify against source." }]).map((m, i) => (
            <div className="message" key={i}>
              <div className="msg-header">
                <div className={`msg-avatar ${m.avCls}`}>{m.av}</div>
                <span className="msg-author">{m.author}</span>
                <span className="msg-role">· {m.role}</span>
              </div>
              <div className="msg-bubble">{m.body}</div>
            </div>
          ))}
        </div>
        <div className="compose-area">
          {canRespond || canResolve ? (
            <>
              <div className="compose-context">
                <i className="ti ti-user-circle"></i> Acting as {activeRole}
              </div>
              <textarea className="compose-textarea" placeholder="Add a response…"></textarea>
              <div className="compose-btns">
                <span className="compose-sub">Shift+Enter for new line</span>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  {canRespond && <button className="btn-respond" type="button">Respond</button>}
                  {canResolve && <button className="btn-respond" type="button">Resolve</button>}
                </div>
              </div>
            </>
          ) : (
            <div className="sr-perm-note">
              <i className="ti ti-lock"></i>
              Your role ({activeRole}) has no query actions — read only.
            </div>
          )}
        </div>
      </div>

      {/* ── Delta change-reason panel ── */}
      <div className={`panel-overlay${deltaOpen ? " open" : ""}`} onClick={() => setDeltaOpen(false)}></div>
      <div className={`slide-panel delta${deltaOpen ? " open" : ""}`}>
        <div className="panel-header">
          <div>
            <div className="panel-title">Change reason</div>
            <div className="panel-title-meta">
              <span className="query-status qs-open">Change reason required</span>
            </div>
          </div>
          <button className="panel-close" onClick={() => setDeltaOpen(false)} type="button">
            <i className="ti ti-x"></i>
          </button>
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
          <div className="compose-context">
            <i className="ti ti-user-circle"></i> Acting as {activeRole} — explain the reason for this change
          </div>
          <textarea className="compose-textarea" placeholder="Enter reason for change…"></textarea>
          <div className="compose-btns">
            <span className="compose-sub">Shift+Enter for new line</span>
            <button className="btn-respond" type="button">Submit reason</button>
          </div>
        </div>
      </div>
    </div>
  );
}
