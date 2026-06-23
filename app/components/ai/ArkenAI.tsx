"use client";

import { useEffect, useRef, useState } from "react";
import { useShell } from "@/components/shell/ShellContext";
import { useStudySession } from "@/lib/session-store/SessionStore";
import type { Role } from "@/lib/permissions";
import { matchResponse, SUGGESTIONS, ROLE_LABEL, aiScope, type AIResponse } from "@/lib/ai-responses";
import "./ai.css";

type Msg = { role: "user"; text: string } | { role: "ai"; resp: AIResponse };

export function ArkenAI() {
  const { study, sites, selectedSiteId, activeRole } = useShell();
  const { dataset, ready } = useStudySession();
  const [isOpen, setIsOpen] = useState(false);
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

  function open() { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 100); }

  function send(text: string) {
    const q = text.trim();
    if (!q || typing) return;
    setInput("");
    setThread((t) => [...t, { role: "user", text: q }]);
    setTyping(true);
    const resp = matchResponse(q, ctx);
    setTimeout(() => { setTyping(false); setThread((t) => [...t, { role: "ai", resp }]); }, 900);
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  if (!ready) return null;

  return (
    <>
      {!isOpen && (
        <button className="ai-pill" type="button" onClick={open} aria-label="Open Arken Insights">
          <i className="ti ti-sparkles"></i> Arken Insights
        </button>
      )}

      <div className={`ai-panel${isOpen ? " open" : ""}`} role="dialog" aria-label="Arken Insights">
        <div className="ai-panel-header">
          <div className="ai-panel-icon"><i className="ti ti-sparkles"></i></div>
          <span className="ai-panel-title">Arken Insights</span>
          <button className="ai-panel-close" type="button" onClick={() => setIsOpen(false)} aria-label="Close"><i className="ti ti-x"></i></button>
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
                <div className="ai-msg-bubble">{m.role === "user" ? m.text : <AIBubble resp={m.resp} role={activeRole} onPick={send} />}</div>
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
  return <span>{resp.text}</span>;
}
