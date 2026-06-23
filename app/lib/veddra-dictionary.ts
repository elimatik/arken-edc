// ════════════════════════════════════════════════════════════════════════════
// VeDDRA / MedDRA dictionary — static reference data for the Coding module.
// Ported from the 22-coding.html prototype (VEDRA_DB + AUTO_CODE_RULES), extended
// with drug terms for the ConMed coding path. Not hydrated from Supabase.
// ════════════════════════════════════════════════════════════════════════════

export interface VeddraResult {
  soc: string; hlgt: string; hlt: string; pt: string; llt: string; code: string; score: number;
}

// Keyword-bucketed suggestions (AE clinical signs + drug terms).
export const VEDRA_DB: Record<string, VeddraResult[]> = {
  default: [
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Respiratory tract infections", hlt: "Bovine respiratory disease", pt: "Pneumonia bovine", llt: "BRD pneumonia", code: "10049871", score: 0.95 },
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Respiratory tract infections", hlt: "Bovine respiratory disease", pt: "Dyspnoea", llt: "Laboured breathing bovine", code: "10013968", score: 0.88 },
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Upper respiratory signs", hlt: "Nasal signs", pt: "Nasal discharge", llt: "Mucopurulent nasal discharge", code: "10028738", score: 0.82 },
    { soc: "General disorders and admin site conditions", hlgt: "Injection site reactions", hlt: "Local tissue reactions", pt: "Injection site reaction", llt: "ISR swelling", code: "10022095", score: 0.78 },
    { soc: "Gastrointestinal disorders", hlgt: "Appetite disorders", hlt: "Anorexia group", pt: "Decreased appetite", llt: "Not eating bovine", code: "10011968", score: 0.72 },
  ],
  nasal: [
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Upper respiratory signs", hlt: "Nasal signs", pt: "Nasal discharge", llt: "Mucopurulent nasal discharge", code: "10028738", score: 0.96 },
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Upper respiratory signs", hlt: "Nasal signs", pt: "Nasal discharge serous", llt: "Serous nasal discharge", code: "10028739", score: 0.84 },
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Upper respiratory signs", hlt: "Epistaxis", pt: "Epistaxis bovine", llt: "Nosebleed bovine", code: "10015151", score: 0.41 },
  ],
  breathing: [
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Respiratory signs", hlt: "Breathing disorders", pt: "Dyspnoea", llt: "Laboured breathing bovine", code: "10013968", score: 0.97 },
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Respiratory signs", hlt: "Breathing disorders", pt: "Tachypnoea", llt: "Rapid breathing", code: "10043164", score: 0.79 },
    { soc: "Respiratory, thoracic and mediastinal disorders", hlgt: "Respiratory signs", hlt: "Auscultatory signs", pt: "Adventitious breath sounds", llt: "Abnormal lung sounds", code: "10001233", score: 0.68 },
  ],
  appetite: [
    { soc: "Gastrointestinal disorders", hlgt: "Appetite disorders", hlt: "Anorexia group", pt: "Decreased appetite", llt: "Not eating bovine", code: "10011968", score: 0.93 },
    { soc: "Gastrointestinal disorders", hlgt: "Appetite disorders", hlt: "Anorexia group", pt: "Anorexia", llt: "Anorexia bovine", code: "10002570", score: 0.87 },
    { soc: "Gastrointestinal disorders", hlgt: "Appetite disorders", hlt: "Anorexia group", pt: "Inappetence", llt: "Inappetence bovine", code: "10021900", score: 0.61 },
  ],
  eye: [
    { soc: "Eye disorders", hlgt: "Ocular discharge", hlt: "Discharge signs", pt: "Ocular discharge", llt: "Eye discharge bovine", code: "10030302", score: 0.98 },
    { soc: "Eye disorders", hlgt: "Ocular discharge", hlt: "Discharge signs", pt: "Lacrimation increased", llt: "Watery eyes", code: "10023722", score: 0.74 },
  ],
  heart: [
    { soc: "Cardiac disorders", hlgt: "Heart rate", hlt: "Tachycardia group", pt: "Tachycardia", llt: "Heart rate increased", code: "10043071", score: 0.92 },
    { soc: "Cardiac disorders", hlgt: "Heart rate", hlt: "Tachycardia group", pt: "Sinus tachycardia", llt: "Sinus tachycardia bovine", code: "10040639", score: 0.78 },
  ],
  injection: [
    { soc: "General disorders and admin site conditions", hlgt: "Injection site reactions", hlt: "Local tissue reactions", pt: "Injection site reaction", llt: "ISR swelling bovine", code: "10022095", score: 0.95 },
    { soc: "Skin and subcutaneous tissue disorders", hlgt: "Local swellings", hlt: "Subcutaneous swelling", pt: "Swelling", llt: "Local swelling", code: "10042674", score: 0.7 },
  ],
  hypersensitivity: [
    { soc: "Immune system disorders", hlgt: "Allergic conditions", hlt: "Hypersensitivity reactions", pt: "Hypersensitivity", llt: "Hypersensitivity reaction", code: "10020751", score: 0.96 },
    { soc: "Immune system disorders", hlgt: "Allergic conditions", hlt: "Anaphylactic responses", pt: "Anaphylactic reaction", llt: "Acute hypersensitivity", code: "10002198", score: 0.71 },
  ],
  pruritus: [
    { soc: "Skin and subcutaneous tissue disorders", hlgt: "Epidermal conditions", hlt: "Pruritus group", pt: "Pruritus", llt: "Itching", code: "10037087", score: 0.95 },
    { soc: "Skin and subcutaneous tissue disorders", hlgt: "Epidermal conditions", hlt: "Pruritus group", pt: "Pruritus generalised", llt: "Generalised itch", code: "10037089", score: 0.8 },
  ],
  alopecia: [
    { soc: "Skin and subcutaneous tissue disorders", hlgt: "Hair conditions", hlt: "Alopecia group", pt: "Alopecia", llt: "Alopecia localized", code: "10001760", score: 0.94 },
  ],
  mortality: [
    { soc: "General disorders and admin site conditions", hlgt: "Fatal outcomes", hlt: "Death and sudden death", pt: "Increased mortality", llt: "Flock mortality increased", code: "10011906", score: 0.93 },
  ],
  // ── Drug terms (ConMed coding path) ──
  tulathromycin: [{ soc: "Antiinfectives for systemic use", hlgt: "Macrolides", hlt: "Macrolide antibiotics", pt: "Tulathromycin", llt: "Tulathromycin bovine", code: "10044821", score: 0.98 }],
  florfenicol: [{ soc: "Antiinfectives for systemic use", hlgt: "Amphenicols", hlt: "Phenicol antibiotics", pt: "Florfenicol", llt: "Florfenicol bovine", code: "10016665", score: 0.97 }],
  oclacitinib: [{ soc: "Immunomodulating agents", hlgt: "Selective immunosuppressants", hlt: "JAK inhibitors", pt: "Oclacitinib", llt: "Oclacitinib maleate", code: "10071129", score: 0.96 }],
  prednisolone: [{ soc: "Corticosteroids for systemic use", hlgt: "Glucocorticoids", hlt: "Corticosteroids plain", pt: "Prednisolone", llt: "Prednisolone", code: "10036576", score: 0.95 }],
  ciclosporin: [{ soc: "Immunomodulating agents", hlgt: "Calcineurin inhibitors", hlt: "Calcineurin inhibitors", pt: "Ciclosporin", llt: "Ciclosporin", code: "10009122", score: 0.95 }],
  salinomycin: [{ soc: "Antiinfectives for systemic use", hlgt: "Ionophores", hlt: "Coccidiostats", pt: "Salinomycin", llt: "Salinomycin sodium", code: "10039392", score: 0.97 }],
};

// Keyword → bucket. Drug keywords resolve first, then AE clinical-sign buckets.
export function searchDict(query: string): VeddraResult[] {
  const q = query.toLowerCase();
  if (/tulath|draxxin/.test(q)) return VEDRA_DB.tulathromycin;
  if (/florfenicol|nuflor/.test(q)) return VEDRA_DB.florfenicol;
  if (/oclacitinib|apoquel/.test(q)) return VEDRA_DB.oclacitinib;
  if (/prednisol|pred /.test(q)) return VEDRA_DB.prednisolone;
  if (/ciclospor|cyclospor/.test(q)) return VEDRA_DB.ciclosporin;
  if (/salinomycin|coccidiostat/.test(q)) return VEDRA_DB.salinomycin;
  if (/hypersensit|allerg|anaphyla/.test(q)) return VEDRA_DB.hypersensitivity;
  if (/prurit|itch|flare/.test(q)) return VEDRA_DB.pruritus;
  if (/alopec|hair loss/.test(q)) return VEDRA_DB.alopecia;
  if (/mortality|death|died/.test(q)) return VEDRA_DB.mortality;
  if (/injection|site|swelling|local/.test(q)) return VEDRA_DB.injection;
  if (q.includes("nasal") || (q.includes("discharge") && !q.includes("eye"))) return VEDRA_DB.nasal;
  if (/breath|lung|labour/.test(q)) return VEDRA_DB.breathing;
  if (/eat|appeti|weight|feed intake/.test(q)) return VEDRA_DB.appetite;
  if (/eye|ocular/.test(q)) return VEDRA_DB.eye;
  if (/heart|cardiac|tach/.test(q)) return VEDRA_DB.heart;
  return VEDRA_DB.default;
}

export interface AutoCodeRule {
  keywords: string[]; llt: string; pt: string; hlt: string; soc: string; code: string; conf: number;
}
export const AUTO_CODE_RULES: AutoCodeRule[] = [
  { keywords: ["nasal", "discharge", "snot", "mucus"], llt: "Mucopurulent nasal discharge", pt: "Nasal discharge", hlt: "Nasal signs", soc: "Respiratory, thoracic and mediastinal disorders", code: "10028738", conf: 0.91 },
  { keywords: ["eye", "ocular", "lacrimal", "tear"], llt: "Eye discharge bovine", pt: "Ocular discharge", hlt: "Discharge signs", soc: "Eye disorders", code: "10030302", conf: 0.95 },
  { keywords: ["heart", "tachycard", "rapid pulse", "bpm", "rapid heart"], llt: "Heart rate increased", pt: "Tachycardia", hlt: "Tachycardia group", soc: "Cardiac disorders", code: "10043071", conf: 0.88 },
  { keywords: ["weight", "loss", "thin", "emaciat"], llt: "Body weight decreased bovine", pt: "Weight decreased", hlt: "Weight changes", soc: "Metabolism and nutrition disorders", code: "10047895", conf: 0.86 },
  { keywords: ["breath", "lung", "respiratory", "wheez"], llt: "Adventitious breath sounds", pt: "Adventitious breath sounds", hlt: "Auscultatory signs", soc: "Respiratory, thoracic and mediastinal disorders", code: "10001233", conf: 0.74 },
  { keywords: ["eat", "appeti", "anorexi", "feed", "ingest", "intake"], llt: "Not eating bovine", pt: "Decreased appetite", hlt: "Anorexia group", soc: "Gastrointestinal disorders", code: "10011968", conf: 0.83 },
  { keywords: ["antibiotic", "amox", "tulath", "enro"], llt: "Antibiotic therapy prior", pt: "Prior antibiotic use", hlt: "Antimicrobial history", soc: "Surgical and medical procedures", code: "10003483", conf: 0.79 },
  { keywords: ["fever", "pyrex", "temperatur", "hot"], llt: "Febrile episode bovine", pt: "Pyrexia", hlt: "Fever disorders", soc: "General disorders and admin site conditions", code: "10037660", conf: 0.9 },
  { keywords: ["injection", "site", "swelling", "local"], llt: "ISR swelling bovine", pt: "Injection site reaction", hlt: "Local tissue reactions", soc: "Skin and subcutaneous tissue disorders", code: "10022095", conf: 0.88 },
  { keywords: ["pruritus", "itch", "flare"], llt: "Itching", pt: "Pruritus", hlt: "Pruritus group", soc: "Skin and subcutaneous tissue disorders", code: "10037087", conf: 0.84 },
  { keywords: ["alopecia", "hair loss", "bald"], llt: "Alopecia localized", pt: "Alopecia", hlt: "Alopecia group", soc: "Skin and subcutaneous tissue disorders", code: "10001760", conf: 0.82 },
  { keywords: ["mortality", "death", "died", "morbidity"], llt: "Flock mortality increased", pt: "Increased mortality", hlt: "Death and sudden death", soc: "General disorders and admin site conditions", code: "10011906", conf: 0.85 },
  { keywords: ["hypersensit", "allerg", "anaphyla"], llt: "Hypersensitivity reaction", pt: "Hypersensitivity", hlt: "Hypersensitivity reactions", soc: "Immune system disorders", code: "10020751", conf: 0.87 },
  // ── Drug auto-rules ──
  { keywords: ["tulath", "draxxin"], llt: "Tulathromycin bovine", pt: "Tulathromycin", hlt: "Macrolide antibiotics", soc: "Antiinfectives for systemic use", code: "10044821", conf: 0.98 },
  { keywords: ["florfenicol", "nuflor"], llt: "Florfenicol bovine", pt: "Florfenicol", hlt: "Phenicol antibiotics", soc: "Antiinfectives for systemic use", code: "10016665", conf: 0.97 },
  { keywords: ["oclacitinib", "apoquel"], llt: "Oclacitinib maleate", pt: "Oclacitinib", hlt: "JAK inhibitors", soc: "Immunomodulating agents", code: "10071129", conf: 0.85 },
  { keywords: ["prednisol"], llt: "Prednisolone", pt: "Prednisolone", hlt: "Corticosteroids plain", soc: "Corticosteroids for systemic use", code: "10036576", conf: 0.92 },
  { keywords: ["ciclospor", "cyclospor"], llt: "Ciclosporin", pt: "Ciclosporin", hlt: "Calcineurin inhibitors", soc: "Immunomodulating agents", code: "10009122", conf: 0.9 },
  { keywords: ["salinomycin"], llt: "Salinomycin sodium", pt: "Salinomycin", hlt: "Coccidiostats", soc: "Antiinfectives for systemic use", code: "10039392", conf: 0.96 },
];

export interface AutoMatch { llt: string; pt: string; hlt: string; soc: string; code: string; conf: number }
export function matchTerm(verbatim: string): AutoMatch | null {
  const v = verbatim.toLowerCase();
  let best: AutoMatch | null = null;
  let bestScore = 0;
  for (const rule of AUTO_CODE_RULES) {
    const hits = rule.keywords.filter((kw) => v.includes(kw)).length;
    if (hits > 0) {
      const score = Math.round(rule.conf * (0.7 + 0.3 * (hits / rule.keywords.length)) * 100) / 100;
      if (score > bestScore) { bestScore = score; best = { llt: rule.llt, pt: rule.pt, hlt: rule.hlt, soc: rule.soc, code: rule.code, conf: score }; }
    }
  }
  return best;
}
