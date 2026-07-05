"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { Role } from "@/lib/permissions";
import { matchResponse, SUGGESTIONS, ROLE_LABEL, aiScope, type AIResponse } from "@/lib/ai-responses";
import { buildAIContext } from "@/lib/ai-context";
import { ReportCsvButton } from "@/components/reports/ReportKit";
import { resolveReport, setPendingConfig, colId, type ReportConfig, type ReportColumn, type ResolvedReport } from "@/lib/report-builder";
import "./ai.css";

// A data_query / report_config message (the AI returns a query plan; the client
// resolves the rows). `resolved` is null while resolving.
interface DataMsg { role: "ai"; kind: "data"; title: string; message: string; config: ReportConfig; resolved: ResolvedReport | null; filename: string }
interface ConfigMsg { role: "ai"; kind: "config"; title: string; message: string; config: ReportConfig }
type Msg = { role: "user"; text: string } | { role: "ai"; resp: AIResponse } | DataMsg | ConfigMsg;

const CONNECT_ERROR = "I'm having trouble connecting right now. Try asking about enrollment, queries, or overdue forms — those work offline.";

// Plain-text rendering of any response, for sending prior turns back to the API.
function respToPlain(r: AIResponse): string {
  switch (r.type) {
    case "callout": return `${r.val} — ${r.lbl}`;
    case "table": return [r.head.join(" | "), ...r.rows.map((row) => row.join(" | "))].join("\n");
    case "denied": return r.text;
    case "suggestions": return "(showed suggested questions)";
    case "text": return r.text;
  }
}
function msgToPlain(m: Msg): string {
  if (m.role === "user") return m.text;
  if ("resp" in m) return respToPlain(m.resp);
  return m.message;
}

// Parse the model's JSON response (tolerant of stray prose / code fences).
interface AiCol { label?: string; source?: string; key?: string; form?: string; field?: string; visit?: string }
interface AiConfigPayload { title?: string; columns?: AiCol[]; filters?: ReportConfig["filters"]; exportFilename?: string }
interface AiParsed { intent: "question" | "data_query" | "report_config"; message?: string; response?: string; data?: AiConfigPayload; config?: AiConfigPayload }
function parseAiJson(text: string): AiParsed | null {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const o = JSON.parse(t.slice(start, end + 1)) as AiParsed;
    return o && typeof o === "object" && o.intent ? o : null;
  } catch { return null; }
}
// Map an AI column payload (built-in key OR form/field, value aspect) → the builder model.
function toConfig(p: AiConfigPayload | undefined): ReportConfig {
  const columns: ReportColumn[] = (Array.isArray(p?.columns) ? p!.columns : []).map((c): ReportColumn => {
    if (c.source === "form_field" && c.form && c.field) return { id: colId(), label: c.label ?? `${c.form} → ${c.field}`, kind: "field", form: c.form, field: c.field, fieldLabel: c.field, aspect: "value", visit: c.visit };
    return { id: colId(), label: c.label ?? c.key ?? "Column", kind: "builtin", builtinKey: c.key ?? "subjectId" };
  });
  return { columns, filters: Array.isArray(p?.filters) ? p!.filters : [], title: p?.title };
}

// Path 2 — POST the unmatched question to the server proxy (which holds the API key).
async function askArkenAI(input: string, context: string, history: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8500); // just past the server's 8s upstream timeout
  try {
    const r = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, context, history }),
      signal: controller.signal,
    });
    if (!r.ok) throw new Error(`status ${r.status}`);
    const data = (await r.json()) as { text?: string };
    return data.text ?? CONNECT_ERROR;
  } finally {
    clearTimeout(timer);
  }
}

export function ArkenAI({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { study, sites, selectedSiteId, activeRole } = useShell();
  const { dataset, ready } = useStudySession();
  const [thread, setThread] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Active site for CRC scope — the topbar selection, else the study's first site.
  const activeSite = sites.find((s) => s.id === selectedSiteId) ?? sites[0];
  const siteName = activeSite?.name ?? "your site";
  const ctx = { dataset, studyId: study.id, studyCode: study.code, role: activeRole, siteId: activeSite?.id ?? null, siteName };

  // Switching studies clears the conversation (the scope/data are study-specific).
  useEffect(() => { setThread([]); }, [study.id]);
  // Keep the thread pinned to the newest message.
  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [thread, typing]);
  // Focus the compose box when the panel opens.
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 100); }, [open]);

  function send(text: string) {
    const q = text.trim();
    if (!q || typing) return;
    setInput("");
    // History (prior turns) is captured before this question is appended.
    const history = thread.slice(-8).map((m) =>
      m.role === "user" ? { role: "user" as const, content: m.text } : { role: "assistant" as const, content: msgToPlain(m) },
    );
    setThread((t) => [...t, { role: "user", text: q }]);
    setTyping(true);

    // Path 1 — instant keyword match. Keep the 900ms typing feel.
    const keyword = matchResponse(q, ctx);
    if (keyword) {
      setTimeout(() => { setTyping(false); setThread((t) => [...t, { role: "ai", resp: keyword }]); }, 900);
      return;
    }

    // Path 2 — Anthropic API. The model returns intent-classified JSON; the client
    // resolves data_query rows locally (values never leave the session store).
    const context = buildAIContext({ dataset, studyId: study.id, role: activeRole, siteId: activeSite?.id ?? null, siteName, today: new Date().toISOString().slice(0, 10) });
    askArkenAI(q, context, history)
      .then((answer) => {
        const parsed = parseAiJson(answer);
        if (parsed?.intent === "data_query") {
          const config = toConfig(parsed.data);
          const resolved = resolveReport(dataset, study.id, config, activeRole);
          const filename = parsed.data?.exportFilename?.replace(/[^a-z0-9]+/gi, "_").slice(0, 50) || "custom_data_query";
          setThread((t) => [...t, { role: "ai", kind: "data", title: parsed.data?.title ?? "Data query", message: parsed.message ?? "", config, resolved, filename }]);
        } else if (parsed?.intent === "report_config") {
          const config = toConfig(parsed.config);
          setThread((t) => [...t, { role: "ai", kind: "config", title: config.title ?? parsed.config?.title ?? "Custom report", message: parsed.message ?? "", config }]);
        } else if (parsed?.intent === "question") {
          setThread((t) => [...t, { role: "ai", resp: { type: "text", text: parsed.response ?? parsed.message ?? answer } }]);
        } else {
          setThread((t) => [...t, { role: "ai", resp: { type: "text", text: answer } }]);
        }
      })
      .catch(() => setThread((t) => [...t, { role: "ai", resp: { type: "text", text: CONNECT_ERROR } }]))
      .finally(() => setTyping(false));
  }

  // Open the custom report builder pre-loaded with an AI-suggested config.
  function openInBuilder(config: ReportConfig) {
    setPendingConfig(config);
    onClose();
    router.push(`/study/${study.id}/reports?custom=1&r=${Date.now()}`);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  if (!ready || !open) return null;

  return (
    <>
      <div className="ai-overlay" onClick={onClose} />
      <div className="ai-panel open" role="dialog" aria-label="Arken Insights">
        <div className="ai-panel-header">
          <div className="ai-panel-icon"><i className="ti ti-sparkles"></i></div>
          <span className="ai-panel-title">Arken Insights</span>
          <button className="ai-panel-close" type="button" onClick={onClose} aria-label="Close"><i className="ti ti-x"></i></button>
        </div>

        <div className="ai-scope-bar">
          <i className="ti ti-user-shield ai-scope-icon"></i>
          <span className="ai-scope-text"><span className="ai-scope-role">{ROLE_LABEL[activeRole]}</span> · {aiScope(activeRole, siteName)}</span>
          <span className="ai-scope-tag">Role-scoped</span>
        </div>

        <div className="ai-thread" ref={threadRef}>
          {thread.length === 0 && !typing ? (
            <div className="ai-empty">
              <div className="ai-empty-icon">✨</div>
              <div className="ai-empty-text">Ask me anything about {study.code}.<br />I&rsquo;ll only show data your role can access.</div>
            </div>
          ) : (
            thread.map((m, i) => (
              <div key={i} className={`ai-msg ${m.role}`}>
                <div className="ai-msg-label">{m.role === "user" ? "You" : `Arken AI · ${ROLE_LABEL[activeRole]} scope`}</div>
                <div className={`ai-msg-bubble${"kind" in m ? " ai-msg-bubble-card" : ""}`}>
                  {m.role === "user" ? m.text
                    : "kind" in m && m.kind === "data" ? <DataCard msg={m} studyId={study.id} onOpen={() => openInBuilder(m.config)} />
                    : "kind" in m && m.kind === "config" ? <ConfigCard msg={m} onOpen={() => openInBuilder(m.config)} />
                    : <AIBubble resp={m.resp} role={activeRole} onPick={send} />}
                </div>
              </div>
            ))
          )}
          {typing && (
            <div className="ai-msg ai">
              <div className="ai-msg-label">Arken AI</div>
              <div className="ai-typing"><div className="ai-dot"></div><div className="ai-dot"></div><div className="ai-dot"></div></div>
            </div>
          )}
        </div>

        <div className="ai-compose">
          <textarea ref={inputRef} className="ai-textarea" placeholder={`Ask about ${study.code}…`} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}></textarea>
          <div className="ai-compose-row">
            <span className="ai-compose-hint">Enter to send · Shift+Enter for a new line</span>
            <button className="ai-send-btn" type="button" onClick={() => send(input)}>Send <i className="ti ti-arrow-right"></i></button>
          </div>
        </div>
      </div>
    </>
  );
}

function AIBubble({ resp, role, onPick }: { resp: AIResponse; role: Role; onPick: (q: string) => void }) {
  if (resp.type === "callout") {
    return <div className="ai-callout"><div className="ai-callout-val">{resp.val}</div><div className="ai-callout-lbl">{resp.lbl}</div></div>;
  }
  if (resp.type === "table") {
    return (
      <table className="ai-table">
        <thead><tr>{resp.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{resp.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={j === 0 ? "" : "ai-td-mono"}>{c}</td>)}</tr>)}</tbody>
      </table>
    );
  }
  if (resp.type === "denied") {
    return <div className="ai-denied"><i className="ti ti-lock"></i><span>{resp.text}</span></div>;
  }
  if (resp.type === "suggestions") {
    return (
      <>
        <div className="ai-sugg-intro">Here are some things you can ask me:</div>
        <div className="ai-suggestions">
          {(SUGGESTIONS[role] ?? []).map((s) => <button key={s} className="ai-suggestion-btn" type="button" onClick={() => onPick(s)}>{s}</button>)}
        </div>
      </>
    );
  }
  return <span className="ai-text">{resp.text}</span>;
}

// Mode 2 — data_query: an inline data card with the client-resolved table.
function DataCard({ msg, studyId, onOpen }: { msg: DataMsg; studyId: string; onOpen: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const r = msg.resolved;
  if (!r) return <div className="ai-datacard"><div className="ai-datacard-head"><i className="ti ti-loader-2 ai-spin"></i> Resolving data…</div></div>;
  const rows = showAll ? r.rows : r.rows.slice(0, 10);
  const csvRows = r.rows.map((row) => r.columns.map((c) => row[c] ?? ""));
  return (
    <div className="ai-datacard">
      <div className="ai-datacard-head">
        <span className="ai-datacard-title"><i className="ti ti-table"></i> {msg.title}</span>
        <span className="ai-datacard-sub">{r.total} row{r.total === 1 ? "" : "s"} · resolved from session</span>
      </div>
      {r.columns.length === 0 || r.total === 0 ? (
        <div className="ai-datacard-empty">{r.columns.length === 0 ? "The query returned no columns." : "No rows matched."}</div>
      ) : (
        <div className="ai-datacard-tablewrap">
          <table className="ai-table">
            <thead><tr>{r.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{rows.map((row, i) => <tr key={i}>{r.columns.map((c, j) => <td key={c} className={j === 0 ? "" : "ai-td-mono"}>{row[c] ?? "—"}</td>)}</tr>)}</tbody>
          </table>
          {r.total > 10 && <button className="ai-showall" type="button" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${r.total} rows`} <i className={`ti ti-chevron-${showAll ? "up" : "down"}`}></i></button>}
        </div>
      )}
      <div className="ai-datacard-actions">
        <ReportCsvButton studyId={studyId} slug={msg.filename} headers={r.columns} rows={csvRows} />
        <button className="ai-card-btn" type="button" onClick={onOpen}><i className="ti ti-external-link"></i> Open in report builder</button>
      </div>
    </div>
  );
}

// Mode 3 — report_config: a "ready to build" card.
function ConfigCard({ msg, onOpen }: { msg: ConfigMsg; onOpen: () => void }) {
  const cols = msg.config.columns.map((c) => c.label).join(" · ");
  const filters = msg.config.filters.filter((f) => f.column).map((f) => `${f.column} ${f.operator} ${f.value}`).join(", ");
  return (
    <div className="ai-datacard">
      <div className="ai-datacard-head">
        <span className="ai-datacard-title"><i className="ti ti-clipboard-list"></i> Report ready to build</span>
      </div>
      <div className="ai-configcard-body">
        <div className="ai-configcard-name">&ldquo;{msg.title}&rdquo;</div>
        {cols && <div className="ai-configcard-row"><span className="ai-configcard-lbl">Columns</span> {cols}</div>}
        {filters && <div className="ai-configcard-row"><span className="ai-configcard-lbl">Filters</span> {filters}</div>}
      </div>
      <div className="ai-datacard-actions">
        <button className="ai-card-btn" type="button" onClick={onOpen}><i className="ti ti-external-link"></i> Open in report builder →</button>
      </div>
    </div>
  );
}
