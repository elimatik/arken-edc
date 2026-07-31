'use client';

// Renders the access gate. All logic is in the inline script exactly as
// the original arken-access-gate.html — no changes to UX or flow.
// VERIFY_ENDPOINT must match /api/verify (the serverless function).

export default function GateClient() {
  return (
    <>
      <style>{`
        :root{
          --paper:#F6F7F9;--card:#ffffff;--ink:#1B2430;--ink-2:#454E5B;--mute:#6B645F;
          --line:#E4E7EC;--accent:#B4501E;--accent-ink:#A8481A;--warm:#FBEDE4;
          --seg:#171B26;--mono:ui-monospace,"SF Mono",Menlo,monospace;
        }
        *{margin:0;padding:0;box-sizing:border-box}
        body{min-height:100svh;display:flex;align-items:center;justify-content:center;
          padding:clamp(24px,5vw,56px);
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif;
          -webkit-font-smoothing:antialiased;color:var(--ink);line-height:1.5;background:#fff;}
        .card{background:transparent;width:100%;max-width:560px;padding:0;position:relative}
        .brand{display:flex;align-items:center;gap:13px;margin-bottom:22px}
        .mark{width:46px;height:46px;border-radius:11px;background:var(--seg);color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;letter-spacing:.02em}
        .brand .nm{font-size:19px;font-weight:800;letter-spacing:-.01em}
        .pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
        .pill{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;
          letter-spacing:.06em;text-transform:uppercase;padding:5px 11px;border-radius:999px;
          border:1px solid var(--line);color:var(--ink-2);background:var(--paper)}
        .pill.accent{color:var(--accent-ink);border-color:color-mix(in srgb,var(--accent) 35%,transparent);
          background:color-mix(in srgb,var(--warm) 55%,transparent)}
        .pill .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:pulse 2.2s ease-in-out infinite}
        @keyframes pulse{0%,100%{opacity:.5;transform:scale(.82)}50%{opacity:1;transform:scale(1.08)}}
        h1{font-size:clamp(1.5rem,3.4vw,2rem);font-weight:800;letter-spacing:-.02em;line-height:1.12;margin-bottom:12px}
        .lead{font-size:14.5px;line-height:1.65;color:var(--ink-2);margin-bottom:4px}
        .deskline{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:13px;color:var(--mute)}
        .deskline svg{flex-shrink:0;color:var(--accent-ink)}
        .body p{font-size:14.5px;line-height:1.65;color:var(--ink-2);margin-bottom:14px}
        .body p strong{color:var(--ink);font-weight:600}
        .desknote{display:flex;gap:11px;align-items:flex-start;margin:20px 0 4px;padding:13px 15px;border-radius:12px;
          background:color-mix(in srgb,var(--warm) 45%,transparent);border:1px solid color-mix(in srgb,var(--accent) 22%,transparent)}
        .desknote svg{flex-shrink:0;margin-top:1px;color:var(--accent-ink)}
        .desknote div{font-size:13px;line-height:1.55;color:var(--ink-2)}
        .desknote b{color:var(--ink);font-weight:600}
        form{margin-top:22px}
        .flabel{display:block;font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;
          color:var(--mute);margin-bottom:9px}
        .flabel .req{color:var(--accent)}
        input[type=text],input[type=password]{width:100%;padding:14px 16px;border:1px solid var(--line);border-radius:11px;
          font-size:15px;color:var(--ink);background:#fff;transition:border-color .2s ease;font-family:inherit}
        input[type=text]::placeholder,input[type=password]::placeholder{color:#A6ABB3}
        input[type=text]:focus,input[type=password]:focus{outline:none;border-color:color-mix(in srgb,var(--accent) 55%,transparent)}
        .daterow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;
          padding:12px 16px;border:1px dashed var(--line);border-radius:11px;background:var(--paper)}
        .daterow .dk{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--mute)}
        .daterow .dv{font-size:14px;font-weight:600;color:var(--ink)}
        .err{color:#B4241B;font-size:13px;margin-top:11px;display:none}
        .err.show{display:block}
        .agree{display:flex;align-items:flex-start;gap:11px;margin-top:18px;cursor:pointer;user-select:none}
        .agree input{margin-top:2px;width:18px;height:18px;accent-color:var(--accent);flex-shrink:0;cursor:pointer}
        .agree span{font-size:14px;color:var(--ink-2);line-height:1.5}
        .continue{width:100%;margin-top:22px;padding:15px 22px;border:none;border-radius:11px;font-size:15px;font-weight:700;
          color:#fff;background:var(--accent);cursor:pointer;transition:transform .18s ease,opacity .2s ease;font-family:inherit}
        .continue:hover:not(:disabled){transform:translateY(-2px)}
        .continue:disabled{background:#A9AEB6;cursor:not-allowed}
        .cancel{display:block;text-align:center;margin-top:16px;font-size:14px;color:var(--ink-2);
          text-decoration:underline;text-underline-offset:3px}
        .micro{text-align:center;margin-top:22px;font-size:12px;color:var(--mute)}
        .hidden{display:none}
        @media(max-width:560px){
          .desknote{background:color-mix(in srgb,var(--accent) 12%,#fff);border-color:color-mix(in srgb,var(--accent) 40%,transparent)}
        }
      `}</style>

      <main className="card">
        <div className="brand">
          <div className="mark">Ar</div>
          <div className="nm">Arken EDC</div>
        </div>

        {/* STEP 1 — password */}
        <section id="pwView">
          <h1>Access</h1>
          <p className="lead">Enter the password to view this prototype.</p>
          <p className="deskline">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
            </svg>
            Best experienced on a desktop or laptop.
          </p>
          <form id="pwForm" noValidate>
            <label className="flabel" htmlFor="accesscode" style={{marginTop:'18px'}}>
              Password <span className="req">*</span>
            </label>
            <input type="password" id="accesscode" placeholder="Password" autoComplete="off" />
            <p className="err" id="pwErr">That password is not correct.</p>
            <button type="submit" className="continue" id="pwBtn" disabled>Continue</button>
            <a className="cancel" href="#" id="cancelLink1">Cancel</a>
          </form>
        </section>

        {/* STEP 2 — confidentiality agreement */}
        <section id="ndaView" className="hidden">
          <h1>Confidentiality Agreement</h1>
          <div className="body">
            <p>This is a portfolio demonstration of Arken EDC. In production, access is managed via institutional
              credentials and role assignment by the study administrator.</p>
            <p>This project contains original work created by <strong>Elisa Tron</strong>, including UX design,
              product architecture, clinical data system patterns, and interaction design solutions developed for
              Arken EDC. By typing your name below you confirm that you will not reproduce, copy, redistribute, or
              claim as your own any design, concept, pattern, or intellectual property contained in this project.
              This work is shared exclusively for portfolio evaluation purposes. Unauthorized use or reproduction
              of any part of this work is prohibited.</p>
          </div>
          <form id="ndaForm" noValidate>
            <label className="flabel" htmlFor="fullname" style={{marginTop:'20px'}}>
              Full name <span className="req">*</span>
            </label>
            <input type="text" id="fullname" name="name" placeholder="Your full name" autoComplete="name" required />
            <div className="daterow">
              <span className="dk">Date of access</span>
              <span className="dv" id="dateDisplay"></span>
            </div>
            <label className="agree">
              <input type="checkbox" id="agree" />
              <span>I have read and agree to the above terms.</span>
            </label>
            <button type="submit" className="continue" id="ndaBtn" disabled>Enter Arken</button>
            <a className="cancel" href="#" id="cancelLink2">Cancel</a>
          </form>
          <p className="micro">Your name and the date of access are recorded with your session.</p>
        </section>
      </main>

      <script dangerouslySetInnerHTML={{ __html: `
        const VERIFY_ENDPOINT = '/api/verify';
        const ENTER_URL       = '/';
        const PORTFOLIO_URL   = 'https://elisatron.com';
        const FORM_ENDPOINT   = 'https://formspree.io/f/xaqrvdvk';

        const pwView  = document.getElementById('pwView');
        const ndaView = document.getElementById('ndaView');
        const pwForm  = document.getElementById('pwForm');
        const pwEl    = document.getElementById('accesscode');
        const pwErr   = document.getElementById('pwErr');
        const pwBtn   = document.getElementById('pwBtn');
        const ndaForm = document.getElementById('ndaForm');
        const nameEl  = document.getElementById('fullname');
        const agreeEl = document.getElementById('agree');
        const ndaBtn  = document.getElementById('ndaBtn');

        const now  = new Date();
        const nice = now.toLocaleDateString(undefined, {year:'numeric',month:'long',day:'numeric'});
        document.getElementById('dateDisplay').textContent = nice;

        function goCancel(e){
          e.preventDefault();
          if (document.referrer){ history.back(); } else { location.href = PORTFOLIO_URL; }
        }
        document.getElementById('cancelLink1').addEventListener('click', goCancel);
        document.getElementById('cancelLink2').addEventListener('click', goCancel);

        pwEl.addEventListener('input', () => {
          pwErr.classList.remove('show');
          pwBtn.disabled = pwEl.value.length < 1;
        });

        pwForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (pwBtn.disabled) return;
          pwErr.classList.remove('show');
          pwBtn.disabled = true;
          pwBtn.textContent = 'Checking…';
          try {
            const r = await fetch(VERIFY_ENDPOINT, {
              method: 'POST',
              headers: {'Content-Type':'application/json'},
              credentials: 'same-origin',
              body: JSON.stringify({ password: pwEl.value })
            });
            if (r.status === 200) {
              pwView.classList.add('hidden');
              ndaView.classList.remove('hidden');
              nameEl.focus();
              return;
            } else if (r.status === 401) {
              pwErr.textContent = 'That password is not correct.';
              pwErr.classList.add('show');
            } else {
              pwErr.textContent = 'Access check is unavailable right now. Please try again shortly.';
              pwErr.classList.add('show');
            }
          } catch(err) {
            pwErr.textContent = 'Could not reach the server. Please check your connection and try again.';
            pwErr.classList.add('show');
          }
          pwBtn.textContent = 'Continue';
          pwBtn.disabled = pwEl.value.length < 1;
        });

        function validateNda(){
          ndaBtn.disabled = !(nameEl.value.trim().length >= 2 && agreeEl.checked);
        }
        nameEl.addEventListener('input', validateNda);
        agreeEl.addEventListener('change', validateNda);

        ndaForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (ndaBtn.disabled) return;
          ndaBtn.disabled = true;
          ndaBtn.textContent = 'One moment…';
          if (FORM_ENDPOINT) {
            try {
              await fetch(FORM_ENDPOINT, {
                method: 'POST',
                headers: {'Content-Type':'application/json','Accept':'application/json'},
                body: JSON.stringify({
                  name: nameEl.value.trim(),
                  date: nice,
                  timestamp: now.toISOString(),
                  agreement: 'Confidentiality Agreement · Arken EDC',
                  userAgent: navigator.userAgent
                })
              });
            } catch(err) {
              console.warn('[Arken gate] could not record sign-in, continuing anyway:', err);
            }
          }
          window.location.href = ENTER_URL;
        });
      `}} />
    </>
  );
}
