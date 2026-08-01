"use client";

import { useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();

  // Pre-filled demo credentials, matching the prototype
  const [email, setEmail] = useState("edc@arken.com");
  const [password, setPassword] = useState("demo1234");
  const [showPassword, setShowPassword] = useState(false);
  const [inlineError, setInlineError] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [loading, setLoading] = useState(false);

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
      // The access agreement is handled by the gate now — go straight to the app.
      router.push("/studies");
    }, 1100);
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

          {/* Credentials — wrapped in a form with autofill / LastPass detection off */}
          <form autoComplete="off" data-form-type="other" onSubmit={(e) => e.preventDefault()}>
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
          </form>

          {/* Footer */}
          <div className="login-footer">
            Having trouble signing in? <a>Contact your system administrator</a>
            <br />
            or reach <a>Arken EDC support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
