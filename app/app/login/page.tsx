"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OWNER_CODES } from "@/lib/constants";
import "./login.css";

// One-time-per-tab portfolio agreement. Stored alongside name/company/timestamp.
const NDA_KEY = "arken_nda_v1";

export default function LoginPage() {
  const router = useRouter();

  // Pre-filled demo credentials, matching the prototype
  const [email, setEmail] = useState("edc@arken.com");
  const [password, setPassword] = useState("demo1234");
  const [showPassword, setShowPassword] = useState(false);
  const [inlineError, setInlineError] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [loading, setLoading] = useState(false);

  // Access-agreement (NDA) modal — shown once per tab after credentials validate.
  const [ndaOpen, setNdaOpen] = useState(false);
  const [ndaName, setNdaName] = useState("");
  const [ndaCompany, setNdaCompany] = useState("");
  const [ndaAgree, setNdaAgree] = useState(false);
  const ndaCanContinue = ndaName.trim().length > 0 && ndaAgree;

  function attemptLogin() {
    // Clear previous errors
    setGeneralError(false);

    // Basic validation
    if (!email.trim() || !password) {
      setInlineError(true);
      return;
    }
    setInlineError(false);

    // Simulate loading state
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      if (!email.trim() || !password) {
        setGeneralError(true);
        return;
      }
      // The credential entered is the access code. Owner codes bypass the
      // agreement entirely (no modal, no record); every other code must accept
      // it. The gate is presented on each login — we intentionally do NOT skip
      // it from a prior sessionStorage record, since normal in-app navigation
      // never returns through /login, so this won't nag while browsing.
      const code = password.trim();
      if (OWNER_CODES.includes(code)) {
        router.push("/studies");
        return;
      }
      setNdaOpen(true);
    }, 1100);
  }

  async function confirmNda() {
    if (!ndaCanContinue) return;
    const agreedAt = new Date().toISOString();
    const accessCode = password.trim();
    const fullName = ndaName.trim();
    const company = ndaCompany.trim() || null;

    // Audit record — written straight to Supabase (NOT the session store).
    // Best-effort: a failure (e.g. table not yet migrated) must not block entry.
    try {
      const { error } = await supabase
        .from("nda_agreements")
        .insert({ full_name: fullName, company, access_code: accessCode, agreed_at: agreedAt });
      if (error) console.warn("nda_agreements insert failed:", error.message);
    } catch (e) {
      console.warn("nda_agreements insert error:", e);
    }

    try {
      sessionStorage.setItem(
        NDA_KEY,
        JSON.stringify({ name: fullName, company, agreedAt, accessCode }),
      );
    } catch {
      /* ignore quota / unavailable storage */
    }
    setNdaOpen(false);
    router.push("/studies");
  }

  function cancelNda() {
    // Return to the login screen (it's still underneath); reset the form.
    setNdaOpen(false);
    setNdaName("");
    setNdaCompany("");
    setNdaAgree(false);
  }

  function onLoginKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") attemptLogin();
  }

  const emailErr = generalError;
  const pwErr = inlineError || generalError;

  return (
    <div className="screen-login">
      {/* Left brand panel */}
      <div className="login-brand">
        <div className="brand-grid"></div>
        <div className="login-brand-top">
          <div className="brand-logo">
            <div className="brand-logo-mark">
              <span>Ar</span>
            </div>
            <div>
              <div className="brand-logo-name">Arken EDC</div>
              <div className="brand-logo-sub">Veterinary clinical trials</div>
            </div>
          </div>
          <div className="brand-headline">
            Clinical data,
            <br />
            built for veterinary research
          </div>
          <div className="brand-desc">
            Purpose-built EDC for USDA, VICH, and NADA veterinary trials.
            GCP-compliant from the ground up.
          </div>
          <div className="brand-features">
            <div className="brand-feat">
              <div className="brand-feat-icon">
                <i className="ti ti-shield-check"></i>
              </div>
              <span className="brand-feat-text">
                21 CFR Part 11 compliant audit trail
              </span>
            </div>
            <div className="brand-feat">
              <div className="brand-feat-icon">
                <i className="ti ti-paw"></i>
              </div>
              <span className="brand-feat-text">
                Multi-species, multi-level hierarchy
              </span>
            </div>
            <div className="brand-feat">
              <div className="brand-feat-icon">
                <i className="ti ti-building-hospital"></i>
              </div>
              <span className="brand-feat-text">
                Multi-site, role-based data access
              </span>
            </div>
            <div className="brand-feat">
              <div className="brand-feat-icon">
                <i className="ti ti-table-export"></i>
              </div>
              <span className="brand-feat-text">CDISC SEND export ready</span>
            </div>
          </div>
        </div>
        <div className="brand-bottom">
          © 2026 Arken EDC · All rights reserved
        </div>
      </div>

      {/* Right form panel */}
      <div className="login-form-panel">
        <div className="login-form-box">
          <div className="login-form-title">Sign in</div>
          <div className="login-form-sub">
            Welcome back. Enter your credentials to continue.
          </div>

          {/* Error callout */}
          <div className={`login-error${generalError ? " visible" : ""}`}>
            <i className="ti ti-alert-circle"></i>
            <span>Incorrect email or password. Please try again.</span>
          </div>

          {/* Email */}
          <div className="field-group">
            <label className="field-label" htmlFor="login-email">
              Email address
            </label>
            <div className="field-input-wrap">
              <input
                className={`field-input${emailErr ? " error" : ""}`}
                id="login-email"
                name="arken-access-id"
                type="email"
                placeholder="you@organization.com"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onLoginKey}
              />
            </div>
          </div>

          {/* Password */}
          <div className="field-group" style={{ marginBottom: "var(--space-2)" }}>
            <div className="field-hint-row">
              <label className="field-label" htmlFor="login-password">
                Password
              </label>
              <button className="field-forgot" tabIndex={-1} type="button">
                Forgot password?
              </button>
            </div>
            <div className="field-input-wrap">
              <input
                className={`field-input has-icon${pwErr ? " error" : ""}`}
                id="login-password"
                name="arken-access-code"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onLoginKey}
              />
              <button
                className="field-icon-btn"
                onClick={() => setShowPassword((s) => !s)}
                tabIndex={-1}
                type="button"
                title={showPassword ? "Hide password" : "Show password"}
              >
                <i className={showPassword ? "ti ti-eye-off" : "ti ti-eye"}></i>
              </button>
            </div>
            <div className={`field-error${inlineError ? " visible" : ""}`}>
              Please enter your password.
            </div>
          </div>

          {/* Sign in */}
          <button
            className="btn-signin"
            onClick={attemptLogin}
            disabled={loading}
            type="button"
          >
            {loading ? (
              <>
                <i
                  className="ti ti-loader-2"
                  style={{ animation: "spin 1s linear infinite" }}
                ></i>{" "}
                Signing in…
              </>
            ) : (
              <>
                <i className="ti ti-login"></i> Sign in
              </>
            )}
          </button>

          {/* Footer */}
          <div className="login-footer">
            Having trouble signing in? <a>Contact your system administrator</a>
            <br />
            or reach <a>Arken EDC support</a>
          </div>
        </div>
      </div>

      {/* One-time access agreement (NDA) — shown after credentials validate */}
      {ndaOpen && (
        <div className="nda-overlay" role="dialog" aria-modal="true" aria-labelledby="nda-title">
          <div className="nda-card">
            <div className="nda-brand">
              <div className="brand-logo-mark"><span>Ar</span></div>
              <div className="nda-brand-name">Arken EDC</div>
            </div>

            <h2 className="nda-title" id="nda-title">Before you continue</h2>

            <p className="nda-body">
              This project contains original work created by Elisa Tron, including UX design,
              product architecture, clinical data system patterns, and interaction design solutions
              developed for Arken EDC. By typing your name below you confirm that you will not
              reproduce, copy, redistribute, or claim as your own any design, concept, pattern, or
              intellectual property contained in this project. This work is shared exclusively for
              portfolio evaluation purposes. Unauthorized use or reproduction of any part of this
              work is prohibited.
            </p>

            <div className="nda-field">
              <label className="nda-label" htmlFor="nda-name">Full name <span className="nda-req">*</span></label>
              <input
                id="nda-name"
                name="arken-visitor-name"
                className="nda-input"
                value={ndaName}
                onChange={(e) => setNdaName(e.target.value)}
                placeholder="Your full name"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
                autoFocus
              />
            </div>

            <div className="nda-field">
              <label className="nda-label" htmlFor="nda-company">Company / Organization</label>
              <input
                id="nda-company"
                name="arken-visitor-org"
                className="nda-input"
                value={ndaCompany}
                onChange={(e) => setNdaCompany(e.target.value)}
                placeholder="Company or organization"
                autoComplete="off"
                data-lpignore="true"
                data-1p-ignore="true"
              />
            </div>

            <label className="nda-check">
              <input type="checkbox" checked={ndaAgree} onChange={(e) => setNdaAgree(e.target.checked)} />
              <span>I have read and agree to the above terms</span>
            </label>

            <button className="nda-btn" onClick={confirmNda} disabled={!ndaCanContinue} type="button">
              Continue to project
            </button>
            <button className="nda-cancel" onClick={cancelNda} type="button">Cancel</button>

            <div className="nda-foot">
              Your name and the date of access are recorded with your session.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
