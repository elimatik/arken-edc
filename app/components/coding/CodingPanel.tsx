"use client";

import { useEffect, useState } from "react";
import { useNdaName } from "@/lib/use-nda-name";
import { searchDict, type VeddraResult } from "@/lib/veddra-dictionary";
import type { CodingRow, CodingPatch } from "@/lib/coding-data";

export function CodingPanel({ row, onClose, onApply }: { row: CodingRow | null; onClose: () => void; onApply: (patch: CodingPatch) => void }) {
  const ndaName = useNdaName();
  const [dict, setDict] = useState<"vedra" | "meddra">("vedra");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VeddraResult | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  // On open: seed the search with the verbatim term, reset selection.
  useEffect(() => {
    if (row) { setQuery(row.verbatimTerm); setSelected(null); setShowComment(false); setComment(row.comment ?? ""); setDict("vedra"); }
  }, [row]);

  const open = !!row;
  const results = open ? searchDict(query) : [];

  function confirm() {
    if (!selected) return;
    onApply({ status: "coded", llt: selected.llt, pt: selected.pt, hlt: selected.hlt, soc: selected.soc, code: selected.code, codedBy: ndaName, comment: comment || undefined });
  }

  return (
    <>
      <div className={`panel-overlay${open ? " open" : ""}`} onClick={onClose}></div>
      <div className={`code-panel${open ? " open" : ""}`}>
        {row && (
          <>
            <div className="cp-header">
              <div>
                <div className="cp-title">{row.status === "pending" ? "Code term" : "Edit coding"}</div>
                <div className="cp-meta"><span className="mono">{row.subjectCode}</span><span>· {row.formLabel}</span></div>
              </div>
              <button className="cp-close" onClick={onClose} type="button"><i className="ti ti-x"></i></button>
            </div>

            <div className="verbatim-block">
              <div className="vb-label">Verbatim term</div>
              <div className="vb-term">{row.verbatimTerm}</div>
              <div className="vb-context"><span className="mono">{row.subjectCode}</span><span>· {row.termType === "drug" ? "Concomitant medication" : "Adverse event"}</span></div>
            </div>

            <div className="dict-selector">
              <label>Dictionary</label>
              <button className={`dict-btn${dict === "vedra" ? " active" : ""}`} type="button" onClick={() => setDict("vedra")}>VeDDRA v3.1</button>
              <button className={`dict-btn${dict === "meddra" ? " active" : ""}`} type="button" onClick={() => setDict("meddra")}>MedDRA v26.1</button>
              <span className="dict-note">{dict === "vedra" ? "Veterinary terminology" : "Human/veterinary cross-reference"}</span>
            </div>

            <div className="code-search">
              <div className="code-search-box">
                <i className="ti ti-search"></i>
                <input type="text" value={query} placeholder="Search dictionary…" onChange={(e) => setQuery(e.target.value)} />
              </div>
            </div>

            <div className="hier-crumb">
              {["SOC", "HLGT", "HLT", "PT", "LLT"].map((c, i) => (
                <span key={c}>{i > 0 && <span className="crumb-sep">→ </span>}<span className="crumb-dim">{c}</span></span>
              ))}
            </div>

            <div className="code-results">
              <div className="result-section-title">{dict === "vedra" ? "VeDDRA" : "MedDRA"} — {results.length} matches for &ldquo;{query.slice(0, 30)}&rdquo;</div>
              {results.map((r, i) => {
                const isSel = selected?.code === r.code;
                const scoreCls = r.score >= 0.85 ? "good" : r.score >= 0.65 ? "warn" : "crit";
                return (
                  <div key={`${r.code}-${i}`} className={`code-result-item${isSel ? " selected" : ""}`} onClick={() => setSelected(r)}>
                    <div className="cri-left">
                      <div className="cri-term">{r.pt}</div>
                      <div className="cri-code">{r.code} · LLT: {r.llt}</div>
                      <div className="cri-path">{r.soc} › {r.hlgt} › {r.hlt}</div>
                    </div>
                    <div className="cri-right">
                      <span className={`match-score ${scoreCls}`}>{Math.round(r.score * 100)}%</span>
                      <button className="drill-btn" type="button" title="Browse hierarchy" onClick={(e) => e.stopPropagation()}><i className="ti ti-sitemap"></i></button>
                    </div>
                  </div>
                );
              })}
            </div>

            {showComment && (
              <div className="cp-comment">
                <textarea placeholder="Coding note (optional)…" value={comment} onChange={(e) => setComment(e.target.value)} rows={2}></textarea>
              </div>
            )}

            <div className="selected-code-block">
              {selected ? (
                <>
                  <div className="scb-label">Selected code</div>
                  <div className="scb-term">{selected.pt}</div>
                  <div className="scb-code">{selected.code} · {selected.llt}</div>
                  <div className="scb-path">{selected.soc} › {selected.hlgt} › {selected.hlt} › {selected.pt}</div>
                </>
              ) : (
                <div className="scb-hint">Select a dictionary match above to code this term.</div>
              )}
              <div className="scb-actions">
                <button className="cod-btn-primary" type="button" onClick={confirm} disabled={!selected}><i className="ti ti-check"></i> Confirm code</button>
                <button className="cod-btn-secondary" type="button" onClick={() => onApply({ status: "review", conflict: true, codedBy: ndaName, comment: comment || undefined })}><i className="ti ti-flag"></i> Flag for review</button>
                <button className="cod-btn-secondary" type="button" onClick={() => onApply({ status: "excluded", codedBy: ndaName, comment: comment || undefined })}><i className="ti ti-circle-x"></i> Mark excluded</button>
                <button className="cod-btn-ghost" type="button" onClick={() => setShowComment((s) => !s)}><i className="ti ti-message-plus"></i> {showComment ? "Hide comment" : "Add comment"}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
