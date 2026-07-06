"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNdaName } from "@/lib/use-nda-name";
import { searchDict, type VeddraResult } from "@/lib/veddra-dictionary";
import type { CodingRow, CodingPatch } from "@/lib/coding-data";

export function CodingPanel({ row, canCode, sourceHref, onClose, onApply }: { row: CodingRow | null; canCode: boolean; sourceHref: string | null; onClose: () => void; onApply: (patch: CodingPatch) => void }) {
  const ndaName = useNdaName();
  const router = useRouter();
  const [dict, setDict] = useState<"vedra" | "meddra">("vedra");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VeddraResult | null>(null);
  const [recoding, setRecoding] = useState(false); // DM chose to code fresh (hide existing result block)

  useEffect(() => {
    if (!row) return;
    setQuery(row.verbatimTerm); setDict("vedra"); setRecoding(false);
    // Review: pre-select the auto-coded term so it shows highlighted + in the
    // selected-code block (not just the amber summary).
    if (row.status === "review" && row.code) {
      const found = searchDict(row.verbatimTerm).find((r) => r.code === row.code);
      setSelected(found ?? { soc: row.soc ?? "", hlgt: "", hlt: row.hlt ?? "", pt: row.pt ?? "", llt: row.llt ?? "", code: row.code, score: row.autoConf ?? 0 });
    } else {
      setSelected(null);
    }
  }, [row]);

  const open = !!row;
  const status = row?.status ?? "pending";
  const readOnly = !canCode; // CRC / Sponsor — view only, no coding actions
  const isReview = status === "review";
  const isCoded = status === "coded";
  const isVerified = status === "verified";
  const isExcluded = status === "excluded";
  const settled = isCoded || isVerified; // has an assigned code
  const reviewMode = isReview && !recoding && !readOnly;
  const codedDefault = settled && !recoding && !readOnly;
  const hasResultBlock = (isReview || settled) && !recoding;
  const showSearch = !readOnly && (!settled || recoding); // coded/verified hide search until Recode; read-only never searches

  const base = open ? searchDict(query) : [];
  const results = selected && !base.some((r) => r.code === selected.code) ? [selected, ...base] : base;

  function commitCoded(src: { llt?: string; pt?: string; hlt?: string; soc?: string; code?: string }) {
    onApply({ status: "coded", llt: src.llt, pt: src.pt, hlt: src.hlt, soc: src.soc, code: src.code, codedBy: ndaName });
  }

  // Primary CTA: review confirms the (pre-)selected auto term; otherwise a fresh
  // selection confirms as a new code. No selection in the fresh flow → no primary.
  const primary = readOnly
    ? null
    : reviewMode
    ? { label: "Confirm as coded", onClick: () => commitCoded(selected ?? { llt: row!.llt, pt: row!.pt, hlt: row!.hlt, soc: row!.soc, code: row!.code }) }
    : selected
    ? { label: "Confirm code", onClick: () => commitCoded(selected) }
    : null;

  // Flag for review only makes sense once a candidate term is selected.
  const showFlag = !readOnly && !reviewMode && !codedDefault && !!selected;

  // Verify a coded term (DM/Admin second sign-off). Keeps the existing code.
  function verifyCoding() {
    if (!row) return;
    onApply({ status: "verified", llt: row.llt, pt: row.pt, hlt: row.hlt, soc: row.soc, code: row.code, codedBy: row.codedBy, verifiedBy: ndaName });
  }

  return (
    <>
      <div className={`cod-panel-overlay${open ? " open" : ""}`} onClick={onClose}></div>
      <div className={`code-panel${open ? " open" : ""}`}>
        {row && (
          <>
            <div className="cp-header">
              <div>
                <div className="cp-title">{readOnly ? "Coding detail" : isReview ? "Review auto-coding" : isVerified ? "Verified coding" : isCoded || isExcluded ? "Edit coding" : "Code term"}</div>
                <div className="cp-meta"><span className="mono">{row.subjectCode}</span><span>· {row.formLabel}</span></div>
              </div>
              <button className="cp-close" onClick={onClose} type="button"><i className="ti ti-x"></i></button>
            </div>

            <div className="verbatim-block">
              <div className="vb-label">Verbatim term</div>
              <div className="vb-term">{row.verbatimTerm}</div>
              <div className="vb-context">
                <span className="mono">{row.subjectCode}</span>
                <span>· {row.termType === "drug" ? "Concomitant Medication" : "Adverse Event"}</span>
                {sourceHref && (
                  <button type="button" className="vb-source-link" onClick={() => router.push(sourceHref)}>
                    · View source <i className="ti ti-arrow-right"></i>
                  </button>
                )}
              </div>
            </div>

            {hasResultBlock && (
              <div className={`cp-result-block ${isReview ? "amber" : isVerified ? "verified" : "blue"}`}>
                <div className="cp-rb-label">
                  {isReview ? <><i className="ti ti-clock-hour-4"></i> {row.autoConf != null ? "Auto-coded (pending confirmation)" : "Pending confirmation"}</>
                    : isVerified ? <><i className="ti ti-rosette-discount-check"></i> Verified</>
                    : <><i className="ti ti-circle-check"></i> Coded</>}
                  {isReview && row.autoConf != null && <span className="cp-rb-conf">{Math.round(row.autoConf * 100)}%</span>}
                </div>
                <div className="cp-rb-term">{row.pt ?? "—"}</div>
                <div className="cp-rb-code mono">{row.llt ?? "—"} · {row.code ?? "—"}</div>
                <div className="cp-rb-path">{row.soc ?? "—"} › {row.hlt ?? "—"}</div>
                {isReview && row.autoConf != null && <div className="cp-rb-warn">Below 80% confidence threshold — confirm or recode before database lock.</div>}
                {settled && <div className="cp-rb-meta">Coded by {row.codedBy ?? "—"}{row.codedAt ? ` · ${row.codedAt.slice(0, 10)}` : ""}</div>}
                {isVerified && <div className="cp-rb-meta">Verified by {row.verifiedBy ?? "—"}{row.verifiedAt ? ` · ${row.verifiedAt.slice(0, 10)}` : ""}</div>}
              </div>
            )}

            {readOnly && !hasResultBlock && !isExcluded && (
              <div className="cp-readonly-note"><i className="ti ti-circle-dashed"></i> This term has not been coded yet.</div>
            )}

            {codedDefault && (
              <div className="cp-recode-prompt">
                <span>Recode this term</span>
                <button className="cod-btn-secondary" type="button" onClick={() => { setRecoding(true); setSelected(null); }}><i className="ti ti-edit"></i> Recode</button>
              </div>
            )}

            {showSearch && (
              <>
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
                      <div key={`${r.code}-${i}`} className={`code-result-item${isSel ? " selected" : ""}`} onClick={() => setSelected((prev) => (prev?.code === r.code ? null : r))}>
                        <div className="cri-left">
                          <div className="cri-term">{r.pt}</div>
                          <div className="cri-code">{r.code} · LLT: {r.llt}</div>
                          <div className="cri-path">{r.soc}{r.hlgt ? ` › ${r.hlgt}` : ""} › {r.hlt}</div>
                        </div>
                        <div className="cri-right">
                          <span className={`match-score ${scoreCls}`}>{Math.round(r.score * 100)}%</span>
                          <button className="drill-btn" type="button" title="Browse hierarchy" onClick={(e) => e.stopPropagation()}><i className="ti ti-sitemap"></i></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {!showSearch && !readOnly && <div className="code-results"></div>}

            {!readOnly && (
              <div className="selected-code-block">
                {selected && (
                  <>
                    <div className="scb-label">Selected code</div>
                    <div className="scb-term">{selected.pt}</div>
                    <div className="scb-code">{selected.code} · {selected.llt}</div>
                    <div className="scb-path">{selected.soc}{selected.hlgt ? ` › ${selected.hlgt}` : ""} › {selected.hlt} › {selected.pt}</div>
                  </>
                )}
                <div className="scb-actions">
                  {primary && <button className="cod-btn-primary" type="button" onClick={primary.onClick}><i className="ti ti-check"></i> {primary.label}</button>}
                  {codedDefault && isCoded && <button className="cod-btn-primary" type="button" onClick={verifyCoding}><i className="ti ti-rosette-discount-check"></i> Verify coding</button>}
                  {reviewMode && <button className="cod-btn-secondary" type="button" onClick={() => { setRecoding(true); setSelected(null); }}><i className="ti ti-edit"></i> Recode</button>}
                  {codedDefault && isVerified && <button className="cod-btn-secondary" type="button" onClick={() => onApply({ status: "coded", llt: row.llt, pt: row.pt, hlt: row.hlt, soc: row.soc, code: row.code, codedBy: row.codedBy })}><i className="ti ti-arrow-back-up"></i> Unverify</button>}
                  {codedDefault && <button className="cod-btn-secondary" type="button" onClick={() => onApply({ status: "pending" })}><i className="ti ti-arrow-back-up"></i> Uncode</button>}
                  {showFlag && <button className="cod-btn-secondary" type="button" onClick={() => onApply({ status: "review", conflict: true, codedBy: ndaName, llt: selected!.llt, pt: selected!.pt, hlt: selected!.hlt, soc: selected!.soc, code: selected!.code })}><i className="ti ti-flag"></i> Flag for review</button>}
                  {!isExcluded && <button className="cod-btn-secondary" type="button" onClick={() => onApply({ status: "excluded", codedBy: ndaName })}><i className="ti ti-circle-x"></i> Mark excluded</button>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
